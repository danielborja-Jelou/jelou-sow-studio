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
const antIdx = argv.indexOf("--anterior");
const anteriorFile = antIdx >= 0 ? argv[antIdx + 1] : null;   // sow.json del pre-kickoff: fase 2 explícita (qué cambió)
const args = argv.filter((a, i) => !a.startsWith("--") && !(modoIdx >= 0 && i === modoIdx + 1) && !(antIdx >= 0 && i === antIdx + 1));
const force = argv.includes("--force");
const [inFile, outDir] = args;
if (!inFile || !outDir) { console.error("Usage: node build_all.js sow.json out-dir [--modo prekickoff|completo] [--anterior sow-prekickoff.json] [--force]"); process.exit(2); }
const sow = JSON.parse(fs.readFileSync(inFile, "utf8"));
const meta = sow.meta || {};
if (modoArg && !["prekickoff", "completo"].includes(modoArg)) { console.error('--modo must be "prekickoff" or "completo".'); process.exit(2); }
const prek = modoArg ? modoArg === "prekickoff" : C.isPrekickoff(sow);
fs.mkdirSync(outDir, { recursive: true });
const slug = (s) => String(s || "cliente").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
const base = `SOW-${slug(meta.cliente)}-v${meta.version || "1.0"}`;
const arr0 = (x) => (Array.isArray(x) ? x : []);
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

// 1b. Gantt (only when the SOW is approved and has cronograma.inicio): the construction is split into parallel lanes (lib/planificar.js),
//     sow_a_paquete.py turns the hitos into tasks and cronograma.py draws the Gantt. The same planned SOW feeds the Word, so table and chart agree.
let wordInput = inFile;
let ganttPng = null, ganttFalla = null;
const aprobado = String(meta.estado || "").toLowerCase() === "aprobado";
if (!prek && aprobado && /^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test((sow.cronograma || {}).inicio || "")) {
  try {
    const PL = require("./lib/planificar");
    const hayCarriles = arr0((sow.cronograma || {}).hitos).some((h) => C.laneTasks(h).length);
    const nombres = Object.fromEntries(arr0(sow.agentes).map((a) => [a.id, a.nombre || a.id]));
    const planned = hayCarriles ? sow : PL.aplicar(sow, C.loadRates().rangos, nombres, { conservarDias: true }).sow;
    const cdir = path.join(outDir, "cronograma"); fs.mkdirSync(cdir, { recursive: true });
    wordInput = path.join(cdir, "_sow-planificado.json");
    fs.writeFileSync(wordInput, JSON.stringify(planned, null, 2));
    const py = ["python", "python3", "py"].find((c) => spawnSync(c, ["--version"], { encoding: "utf8" }).status === 0);
    if (!py) throw new Error("no se encontró Python (python, python3 o py)");
    const baseTareas = path.join(cdir, base);
    const a = spawnSync(py, [path.join(__dirname, "sow_a_paquete.py"), wordInput, baseTareas, "--forzar", "--solo-cronograma"], { encoding: "utf8" });
    if (a.status !== 0) throw new Error((a.stderr || a.stdout || "sow_a_paquete.py falló").trim().split("\n").pop());
    const g = spawnSync(py, [path.join(__dirname, "cronograma.py"), `${baseTareas}_cronograma.json`, path.join(cdir, `${base}-cronograma`)], { encoding: "utf8" });
    if (g.status !== 0) throw new Error((g.stderr || g.stdout || "cronograma.py falló").trim().split("\n").pop());
    process.stdout.write(g.stdout);
    const png = path.join(cdir, `${base}-cronograma_gantt.png`);
    if (fs.existsSync(png)) ganttPng = png; else throw new Error("cronograma.py no produjo el PNG del Gantt");
  } catch (e) { ganttFalla = e.message; wordInput = inFile; console.warn(`Gantt no generado: ${e.message}`); }
}

// 2. Word SOW (full mode only; diagrams are rendered inside the builder)
if (!prek) {
  const docx = path.join(outDir, `${base}.docx`);
  const b = node("build_sow_docx.js", [wordInput, docx, ...(ganttPng ? ["--gantt", ganttPng] : [])]);
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

// 5b. Phase 2: what changed since the pre-kickoff (internal)
if (anteriorFile) {
  if (!fs.existsSync(anteriorFile)) console.warn(`--anterior: no existe ${anteriorFile}; no se genera el resumen de cambios.`);
  else { const c = node("comparar_versiones.js", [anteriorFile, inFile, outDir]); process.stdout.write("\n" + c.stdout); process.stderr.write(c.stderr); }
}

// 6. Schedule status: the agent never leaves the schedule silent; it says whether it was generated and, if not, why and what unblocks it
{
  const ec = C.estadoCronograma(sow, ganttFalla ? { gantt: false, motivoGantt: ganttFalla } : {});
  const txt = C.textoEstadoCronograma(ec);
  console.log("\n" + txt);
  if (wordInput !== inFile) { try { fs.unlinkSync(wordInput); } catch (e) { /* temp copy */ } }
  fs.writeFileSync(path.join(outDir, `${base}-cronograma-estado.txt`), txt + "\n");
}
