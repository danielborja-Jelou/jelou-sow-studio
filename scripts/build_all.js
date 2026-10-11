#!/usr/bin/env node
// Generates every deliverable of a SOW from sow.json: lint report, Word file, diagrams (PNG + SVG) and
// the HTML bot simulator. Usage: node build_all.js sow.json out-dir [--force]
//   --force   build even if the linter reports errors (the Word file is marked "en revisión" unless meta.estado is "aprobado")
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const force = process.argv.includes("--force");
const [inFile, outDir] = args;
if (!inFile || !outDir) { console.error("Usage: node build_all.js sow.json out-dir [--force]"); process.exit(2); }
const sow = JSON.parse(fs.readFileSync(inFile, "utf8"));
const meta = sow.meta || {};
fs.mkdirSync(outDir, { recursive: true });
const slug = (s) => String(s || "cliente").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
const base = `SOW-${slug(meta.cliente)}-v${meta.version || "1.0"}`;

// 1. lint
const lint = spawnSync("node", [path.join(__dirname, "lint_sow.js"), inFile], { encoding: "utf8" });
fs.writeFileSync(path.join(outDir, `${base}-lint.txt`), lint.stdout);
process.stdout.write(lint.stdout);
if (lint.status !== 0 && !force) {
  console.error("\nThe linter reported errors. Fix them (or use --force to build anyway).");
  process.exit(1);
}

// 2. Word (diagrams are rendered inside the builder)
const docx = path.join(outDir, `${base}.docx`);
const b = spawnSync("node", [path.join(__dirname, "build_sow_docx.js"), inFile, docx], { encoding: "utf8" });
process.stdout.write(b.stdout); process.stderr.write(b.stderr);
if (b.status !== 0) process.exit(b.status || 1);

// 3. Diagrams as standalone files (the split figure set: overview + one per stage + common handoff) + HTML simulator
let diagramas = {};
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
  }
  fs.writeFileSync(path.join(dd, "figuras.json"), JSON.stringify(F.manifest(set), null, 2));
  const split = set.figuras.filter((f) => f.dividido).length;
  console.log(`Diagrams: ${set.figuras.length} figure(s) (PNG + SVG)${split ? `, ${split} from split flows` : ""} in ${dd}`);
} catch (e) { console.warn("Diagrams skipped:", e.message); }
try {
  const S = require("./lib/simulator");
  const html = S.buildHtml(sow, { diagramas });
  const out = path.join(outDir, `${base}-simulador.html`);
  fs.writeFileSync(out, html);
  console.log(`Simulator: ${out}`);
} catch (e) { console.warn("Simulator skipped:", e.message); }
