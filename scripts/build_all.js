#!/usr/bin/env node
// Generates every deliverable from sow.json.
//
//   Full SOW (default):   lint report, Word SOW, diagrams (PNG + SVG), HTML bot simulator.
//   Pre-kickoff:          lint report (tolerant), diagrams, simulator, pre-kickoff deck (.pptx) and the two "faltantes" Word documents
//                         (client + internal). Activated by `--modo prekickoff` or by meta.fase = "prekickoff".
//
// Usage: node build_all.js sow.json out-dir [--modo prekickoff|completo] [--force]
//   --force   build even if the linter reports errors (the Word file is marked "en revisión" unless meta.estado is "aprobado")
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const C = require("./lib/common");

const argv = process.argv.slice(2);
const modoIdx = argv.indexOf("--modo");
const modoArg = modoIdx >= 0 ? argv[modoIdx + 1] : (argv.find((a) => a.startsWith("--modo=")) || "").split("=")[1];
const args = argv.filter((a, i) => !a.startsWith("--") && !(modoIdx >= 0 && i === modoIdx + 1));
const force = argv.includes("--force");
const [inFile, outDir] = args;
if (!inFile || !outDir) { console.error("Usage: node build_all.js sow.json out-dir [--modo prekickoff|completo] [--force]"); process.exit(2); }
const sow = JSON.parse(fs.readFileSync(inFile, "utf8"));
const meta = sow.meta || {};
if (modoArg && !["prekickoff", "completo"].includes(modoArg)) { console.error('--modo must be "prekickoff" or "completo".'); process.exit(2); }
const prek = modoArg ? modoArg === "prekickoff" : C.isPrekickoff(sow);
fs.mkdirSync(outDir, { recursive: true });
const slug = (s) => String(s || "cliente").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
const base = `SOW-${slug(meta.cliente)}-v${meta.version || "1.0"}`;
const node = (script, a) => spawnSync("node", [path.join(__dirname, script), ...a], { encoding: "utf8" });

// 1. lint (tolerant in pre-kickoff mode: sections only the full SOW needs are not required)
const lint = node("lint_sow.js", [inFile, ...(prek ? ["--modo", "prekickoff"] : [])]);
fs.writeFileSync(path.join(outDir, `${base}-lint.txt`), lint.stdout);
process.stdout.write(lint.stdout);
if (lint.status !== 0 && !force) {
  console.error("\nThe linter reported errors. Fix them (or use --force to build anyway).");
  process.exit(1);
}
if (prek) console.log("\nModo pre-kickoff: se generan el deck, los dos documentos de faltantes, el simulador y los diagramas (no el SOW completo).");

// 2. Word SOW (full mode only; diagrams are rendered inside the builder)
if (!prek) {
  const docx = path.join(outDir, `${base}.docx`);
  const b = node("build_sow_docx.js", [inFile, docx]);
  process.stdout.write(b.stdout); process.stderr.write(b.stderr);
  if (b.status !== 0) process.exit(b.status || 1);
}

// 3. Diagrams as standalone files: end-to-end (FE) + overview + one per stage + common handoff
let diagramas = {};
let e2eEntry = null;
try {
  const D = require("./lib/diagram");
  const F = require("./lib/figuras");
  const dd = path.join(outDir, "diagramas");
  fs.mkdirSync(dd, { recursive: true });
  const set = F.buildFigureSet(sow);
  for (const f of set.figuras) {
    const svg = D.renderDiagramSvg(f.spec, {});
    const png = D.renderDiagramPng(f.spec, {});
    fs.writeFileSync(path.join(dd, `${F.safeName(f.id)}.svg`), svg);
    fs.writeFileSync(path.join(dd, `${F.safeName(f.id)}.png`), png.png);
    if (f.agenteId != null) (diagramas[f.agenteId] = diagramas[f.agenteId] || []).push({ id: f.id, titulo: f.titulo, caption: f.caption, svg });
    if (f.tipo === "e2e") e2eEntry = { id: f.id, titulo: f.titulo, caption: f.caption, svg };
  }
  // the end-to-end overview opens every agent's "Diagrama" tab in the simulator
  if (e2eEntry) for (const k of Object.keys(diagramas)) diagramas[k].unshift(e2eEntry);
  fs.writeFileSync(path.join(dd, "figuras.json"), JSON.stringify(F.manifest(set), null, 2));
  const split = set.figuras.filter((f) => f.dividido).length;
  console.log(`Diagrams: ${set.figuras.length} figure(s) (PNG + SVG)${split ? `, ${split} from split flows` : ""} in ${dd}`);
} catch (e) { console.warn("Diagrams skipped:", e.message); }

// 4. WhatsApp simulator: the kit of the `jelou-demo-whatsapp` skill (plugin jelou-demos-whatsapp), built from sow.json.
//    Both modes: in pre-kickoff what is missing is simulated with probable data; the final SOW rebuilds it from the graph.
//    If the plugin is not installed it is installed first (instalar_plugin_demos.js); the old built-in simulator is only a fallback.
{
  const out = path.join(outDir, `${base}-simulador.html`);
  let ok = false;
  try {
    const K = require("./lib/demo-kit");
    if (!K.findKit()) { const r = K.install(); console.log(`Plugin ${K.PLUGIN} ${r.accion}. Abre una sesión nueva de Claude Code para cargar su skill.`); }
    const r = node("sow_a_demo.js", [inFile, out]);
    process.stdout.write(r.stdout); process.stderr.write(r.stderr);
    ok = r.status === 0;
  } catch (e) { console.warn("Simulator (kit) skipped:", e.message); }
  if (!ok) {
    try {
      const S = require("./lib/simulator");
      fs.writeFileSync(out, S.buildHtml(sow, { diagramas }));
      console.warn(`Simulator: the jelou-demo-whatsapp kit could not be used; wrote the basic built-in simulator instead: ${out}`);
    } catch (e) { console.warn("Simulator skipped:", e.message); }
  }
}

if (prek) {
  // 5. pre-kickoff deck + faltantes documents (client and internal)
  const pptx = path.join(outDir, `${base}-prekickoff.pptx`);
  const k = node("build_kickoff_pptx.js", [inFile, pptx, "--diagramas", path.join(outDir, "diagramas")]);
  process.stdout.write(k.stdout); process.stderr.write(k.stderr);
  if (k.status !== 0) process.exit(k.status || 1);
  const f = node("build_faltantes_docx.js", [inFile, outDir, base]);
  process.stdout.write(f.stdout); process.stderr.write(f.stderr);
  if (f.status !== 0) process.exit(f.status || 1);
}
