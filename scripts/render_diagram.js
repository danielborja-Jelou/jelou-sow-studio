#!/usr/bin/env node
// Uso: node scripts/render_diagram.js <sow.json> <carpeta_salida>
// Genera el conjunto de figuras (F1.1, F1.2… por agente, FG para diagrama_general) como .png/.svg y figuras.json;
// imprime dimensiones y problemas del grafo.
'use strict';
const fs = require('fs');
const path = require('path');
const { renderDiagramSvg, renderDiagramPng, validateGraph } = require('./lib/diagram');

const [file, outDir] = process.argv.slice(2);
if (!file || !outDir) {
  console.error('Uso: node scripts/render_diagram.js <sow.json> <carpeta_salida>');
  process.exit(2);
}
let sow;
try { sow = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('No se pudo leer el JSON: ' + e.message); process.exit(2); }
fs.mkdirSync(outDir, { recursive: true });

const { buildFigureSet, manifest, safeName } = require('./lib/figuras');
const set = buildFigureSet(sow);
if (!set.figuras.length) { console.error('El SOW no tiene agentes ni diagrama_general.'); process.exit(2); }

let errors = 0;
for (const f of set.figuras) {
  const safe = safeName(f.id);
  const { png, width, height } = renderDiagramPng(f.spec);
  fs.writeFileSync(path.join(outDir, safe + '.png'), png);
  fs.writeFileSync(path.join(outDir, safe + '.svg'), renderDiagramSvg(f.spec));
  console.log(`${f.id}: ${width}x${height} px (${f.nodos} nodos, ${f.tipo}) -> ${safe}.png, ${safe}.svg  ${f.titulo}`);
  for (const p of validateGraph(f.spec)) {
    if (p.nivel === 'error') errors++;
    console.log(`  [${p.nivel}] ${p.codigo}: ${p.mensaje}`);
  }
  if (f.nodos > 12 && (f.dividido || f.nodos > 18)) console.log(`  [aviso] FIGURA_GRANDE: ${f.nodos} nodos (máx. 12 tras dividir)`);
}
fs.writeFileSync(path.join(outDir, 'figuras.json'), JSON.stringify(manifest(set), null, 2));
process.exit(errors ? 1 : 0);
