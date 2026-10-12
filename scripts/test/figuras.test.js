'use strict';
// node scripts/test/figuras.test.js
// Large flows are split into an overview + one figure per stage + a common handoff; small flows stay a single figure.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { buildFigureSet, MAX_FIG } = require('../lib/figuras');
const { validateGraph, renderDiagramPng } = require('../lib/diagram');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'figuras-fixture.json'), 'utf8'));
const example = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'assets', 'example-sow.json'), 'utf8'));
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok  ' + name); };

function checkSet(sow, label) {
  const set = buildFigureSet(sow);
  const agent = sow.agentes[0], ids = agent.pasos.map((p) => String(p.id));
  const figs = set.porAgente[String(agent.id)];
  figs.forEach((f) => assert(f.nodos <= MAX_FIG, `${label}: ${f.id} tiene ${f.nodos} nodos (> ${MAX_FIG})`));
  const count = new Map(ids.map((i) => [i, 0]));
  figs.forEach((f) => f.pasos.forEach((id) => count.set(id, count.get(id) + 1)));
  ids.forEach((id) => assert.strictEqual(count.get(id), 1, `${label}: el paso ${id} aparece ${count.get(id)} veces`));
  figs.forEach((f) => {
    const errs = validateGraph(f.spec).filter((p) => p.nivel === 'error');
    assert.strictEqual(errs.length, 0, `${label}: ${f.id} no valida: ${JSON.stringify(errs)}`);
  });
  return figs;
}

t('Colfondos-derived 31-step flow: <= 12 nodes per figure, every step in exactly one figure', () => {
  const figs = checkSet(fixture, 'auto');
  assert(figs.length >= 5 && figs.length <= 10, 'figures: ' + figs.length);
  assert.strictEqual(figs[0].tipo, 'general');
  assert.strictEqual(figs[figs.length - 1].tipo, 'handoff');
  assert(figs.every((f, i) => f.id === 'F1.' + (i + 1)), 'ids F1.1, F1.2...');
  assert(figs[0].nodos <= 9, 'overview has at most 9 boxes');
  figs.forEach((f) => fs.writeFileSync(path.join(OUT, 'fig-' + f.id + '.png'), renderDiagramPng(f.spec).png));
});
t('error exits are local terminals, not long edges; link nodes connect the figures', () => {
  const figs = buildFigureSet(fixture).porAgente.F1;
  const det = figs.filter((f) => f.tipo === 'etapa');
  assert(det.some((f) => f.spec.pasos.some((p) => p.id === '@asesor' && /ver diagrama de handoff/.test(p.diagrama))));
  assert(det.slice(1).every((f) => f.spec.pasos.some((p) => p.id.startsWith('@de:'))), 'viene de');
  assert(det.slice(0, -1).every((f) => f.spec.pasos.some((p) => p.id.startsWith('@a:'))), 'continúa en');
  // no step of a detail figure points to a node outside the figure
  det.forEach((f) => { const ids = new Set(f.spec.pasos.map((p) => p.id)); f.spec.pasos.forEach((p) => p.siguiente.forEach((e) => assert(ids.has(e.a), f.id + ' arista fuera: ' + e.a))); });
});
t('explicit grupo names the stages (one figure per group)', () => {
  const s = JSON.parse(JSON.stringify(fixture));
  const mark = { P1: 'Entrada y autorización', P4: 'Datos de la persona', P8: 'Verificación de identidad', P14: 'Empleador', P18: 'Asesoría y portafolio', P20: 'Firma y registro' };
  s.agentes[0].pasos.forEach((p) => { if (mark[p.id]) p.grupo = mark[p.id]; });
  const figs = checkSet(s, 'grupo');
  const names = figs.filter((f) => f.tipo === 'etapa').map((f) => f.nombre);
  Object.values(mark).forEach((m) => assert(names.some((x) => x.startsWith(m)), 'falta la etapa ' + m + ' en ' + names.join('|')));
});
t('a small flow (example R1) stays a single figure; dividir_diagrama:false is respected', () => {
  const set = buildFigureSet(example);
  assert.strictEqual(set.porAgente.R1.length, 1);
  assert.strictEqual(set.porAgente.R1[0].id, 'F1.1');
  assert(set.general && set.general.id === 'FG', 'diagrama_general stays');
  const s = JSON.parse(JSON.stringify(fixture)); s.agentes[0].dividir_diagrama = false;
  assert.strictEqual(buildFigureSet(s).porAgente.F1.length, 1);
});
t('fragment validation: link nodes without exits and several entries are valid', () => {
  const spec = { fragmento: true, pasos: [{ id: '@de', tipo: 'enlace', diagrama: 'Viene de F1.2', siguiente: [{ a: 'A' }] }, { id: 'A', tipo: 'mensaje', diagrama: 'x', siguiente: [{ a: '@a' }] }, { id: '@a', tipo: 'enlace', diagrama: 'Continúa en F1.4', siguiente: [] }] };
  assert.deepStrictEqual(validateGraph(spec).filter((p) => p.nivel === 'error'), []);
});
t('end-to-end diagram: first figure "Diagrama end-to-end", at most 9 boxes, business language, valid graph', () => {
  for (const sow of [example, fixture]) {
    const set = buildFigureSet(sow);
    assert.strictEqual(set.figuras[0].id, 'FE');
    assert.strictEqual(set.figuras[0].titulo, 'Diagrama end-to-end');
    assert(set.figuras[0].nodos <= 9, 'boxes: ' + set.figuras[0].nodos);
    assert.deepStrictEqual(validateGraph(set.figuras[0].spec).filter((p) => p.nivel === 'error'), []);
  }
  const ex = buildFigureSet(example).e2e;
  assert(!ex.automatico && !ex.tecnico, 'the example uses resumen_cliente');
  assert(ex.spec.pasos.some((p) => p.tipo === 'asesor') && ex.spec.pasos.some((p) => p.tipo === 'fin'), 'main exits');
  // fallback: no resumen_cliente -> built from stage names and flagged automatic
  const auto = buildFigureSet(fixture).e2e;
  assert(auto.automatico && auto.nodos <= 9);
  // inbound and outbound entry points when the graph has both
  const two = JSON.parse(JSON.stringify(example));
  two.agentes.push({ id: 'R2', nombre: 'Agente de campañas (outbound)', entrada: 'outbound', continua_en: 'R1', pasos: [{ id: 'Z1', tipo: 'mensaje', etapa: 'Recordatorio', mensaje: 'Hola', diagrama: 'Recordatorio', siguiente: [{ a: 'Z2' }] }, { id: 'Z2', tipo: 'fin', diagrama: 'Fin', siguiente: [] }] });
  const sp = buildFigureSet(two).e2e.spec.pasos;
  assert(sp.filter((p) => p.tipo === 'usuario').length >= 2 && sp.some((p) => p.sub === 'Outbound'));
  fs.writeFileSync(path.join(OUT, 'fig-FE.png'), renderDiagramPng(ex.spec).png);
});
console.log(`\n${n} figure tests OK`);
