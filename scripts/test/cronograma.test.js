'use strict';
// node scripts/test/cronograma.test.js
// Parallel schedule: planner (max 3 lanes, LPT, two axes), hours reduction, 15-day cap, lint of lanes, Gantt in the approved Word, estadoCronograma.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const JSZip = require('jszip');

const ROOT = path.join(__dirname, '..', '..');
const S = path.join(ROOT, 'scripts');
const OUT = path.join(__dirname, 'out', 'cronograma');
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
const C = require('../lib/common');
const PL = require('../lib/planificar');
const clone = (x) => JSON.parse(JSON.stringify(x));
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'example-sow.json'), 'utf8'));
let n = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok  ' + name); } catch (e) { failed++; console.error('FAIL ' + name + ': ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); } };
const node = (script, args) => spawnSync('node', [path.join(S, script), ...args], { encoding: 'utf8' });
const lint = (sow, name) => { const f = path.join(OUT, name + '.json'); fs.writeFileSync(f, JSON.stringify(sow)); const r = node('lint_sow.js', [f, '--json']); return JSON.parse(r.stdout).findings; };
const rangos = C.loadRates().rangos;
const item = (tipo, extra = {}) => ({ entregable: tipo, tipo, cantidad: 1, ...extra });

(async () => {
  await t('planner: at most 3 lanes, units by agent AND by type of work, LPT balance', () => {
    const e = { items: [item('workflow_complejo', { agente: 'F1' }), item('workflow_medio', { agente: 'F2' }), item('function'), item('webview_backend'), item('base_conocimiento'), item('flow_whatsapp'), item('pruebas_qa'), item('uat_acompanamiento')] };
    const p = PL.planificar(e, rangos, { F1: 'Flujo_1', F2: 'Flujo_2' });
    assert.strictEqual(p.nCarriles, 3, 'max 3 lanes');
    const names = p.carriles.map((c) => c.nombre).join(' | ');
    assert(/Flujo_1/.test(names) && /Flujo_2/.test(names) && /Integraciones/.test(names) && /Webviews/.test(names), names);
    const total = p.carriles.reduce((a, c) => a + c.max, 0);
    assert(Math.abs(total - p.horasAntesMax) < 1e-9, 'tests and UAT are not in the lanes');
    assert.strictEqual(p.diasConstruccionMax, Math.max(...p.carriles.map((c) => c.dias)), 'critical path = longest lane');
  });
  await t('planner: one unit of work -> one lane, no reduction; override carriles:1 disables parallelism', () => {
    const solo = PL.planificar({ items: [item('workflow_simple'), item('workflow_medio')] }, rangos);
    assert.strictEqual(solo.nCarriles, 1); assert.strictEqual(solo.reduccionPct, 0);
    const forzado = PL.planificar({ items: [item('workflow_complejo', { agente: 'F1' }), item('function')], paralelismo: { carriles: 1 } }, rangos);
    assert.strictEqual(forzado.nCarriles, 1);
  });
  await t('hours: parallelism reduces ONLY construction hours (10 % per extra lane, max 20 %); management, tests and UAT are untouched', () => {
    const items = [item('workflow_complejo', { agente: 'F1' }), item('function'), item('webview_backend'), item('pruebas_qa'), item('uat_acompanamiento')];
    const par = C.computeEffort({ items, gestion_pct: 15 });
    const sec = C.computeEffort({ items, gestion_pct: 15, paralelismo: { carriles: 1 } });
    assert.strictEqual(par.paralelismo.reduccionPct, 20);
    const qa = par.rows.find((r) => r.tipo === 'pruebas_qa'), qa0 = sec.rows.find((r) => r.tipo === 'pruebas_qa');
    assert.strictEqual(qa.max, qa0.max, 'internal tests are not reduced');
    const wf = par.rows.find((r) => r.tipo === 'workflow_complejo'), wf0 = sec.rows.find((r) => r.tipo === 'workflow_complejo');
    assert(Math.abs(wf.max - wf0.max * 0.8) < 0.06, `${wf.max} vs ${wf0.max}`);
    assert(par.totalMax < sec.totalMax && par.diasMax <= sec.diasMax, 'fewer hours and fewer days');
    assert(par.totalMax > 0 && Math.abs(par.totalMaxBase - sec.totalMax) < 1e-9, 'totalMaxBase keeps the sequential total');
  });
  await t('lint: the example fits in 15 business days; above 15 is an ERROR unless meta.excepcion_plazo', () => {
    assert(C.totalBusinessDays(base.cronograma) <= 15);
    assert.strictEqual(lint(base, 'ok').filter((f) => f.level === 'ERROR').length, 0);
    const s = clone(base); s.cronograma.hitos[4].dias_habiles = 6;
    assert(lint(s, 'tope').some((f) => f.level === 'ERROR' && f.code === 'SCHED' && /limit is 15/.test(f.msg)));
    s.meta.excepcion_plazo = 'Acordado con el cliente';
    assert(!lint(s, 'tope2').some((f) => f.level === 'ERROR' && f.code === 'SCHED' && /limit is 15/.test(f.msg)));
  });
  await t('lint: more than 3 lanes, dependency cycles, UAT before the build lanes and a lane longer than its milestone are ERRORS', () => {
    const cons = (s) => s.cronograma.hitos.find((h) => /construcci/i.test(h.nombre));
    let s = clone(base); cons(s).tareas.push({ tarea: 'Extra', dias: 1, carril: 'C4' });
    assert(lint(s, 'c4').some((f) => f.level === 'ERROR' && /maximum is 3/.test(f.msg)), '4 lanes');
    s = clone(base); cons(s).tareas = [{ id: 'a', tarea: 'A', dias: 1, depende_de: ['b'] }, { id: 'b', tarea: 'B', dias: 1, depende_de: ['a'] }];
    assert(lint(s, 'ciclo').some((f) => f.level === 'ERROR' && /ciclo/.test(f.msg)), 'cycle');
    s = clone(base); const hs = s.cronograma.hitos; const k = hs.findIndex((h) => h.tipo === 'uat'); [hs[k], hs[k - 1]] = [hs[k - 1], hs[k]];
    assert(lint(s, 'uat').some((f) => f.level === 'ERROR' && /after the client tests/.test(f.msg)), 'UAT must close the path');
    s = clone(base); cons(s).tareas[0].dias = 9;
    assert(lint(s, 'larga').some((f) => f.level === 'ERROR' && /longest lane/.test(f.msg)), 'lane longer than the milestone');
  });
  await t('sow_a_paquete + cronograma.py: lanes overlap, the next milestone waits for ALL lanes, the Gantt labels each lane', () => {
    const f = path.join(OUT, 'pk.json'); fs.writeFileSync(f, JSON.stringify(base));
    const py = ['python', 'python3', 'py'].find((c) => spawnSync(c, ['--version']).status === 0);
    if (!py) { console.log('    (python not available: skipped)'); return; }
    let r = spawnSync(py, [path.join(S, 'sow_a_paquete.py'), f, path.join(OUT, 'pk'), '--forzar', '--solo-cronograma'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    const cr = JSON.parse(fs.readFileSync(path.join(OUT, 'pk_cronograma.json'), 'utf8'));
    const lanes = cr.tareas.filter((x) => x.carril);
    assert.strictEqual(lanes.length, 3);
    assert(lanes.every((x) => JSON.stringify(x.depende_de) === JSON.stringify(lanes[0].depende_de)), 'all lanes start together');
    const pruebas = cr.tareas.find((x) => /^H2_?/.test(x.id) && !x.hito); assert.strictEqual(pruebas.depende_de.length, 3, 'internal tests wait for the three lanes');
    r = spawnSync(py, [path.join(S, 'cronograma.py'), path.join(OUT, 'pk_cronograma.json'), path.join(OUT, 'g'), '--sin-pdf'], { encoding: 'utf8' });
    assert.strictEqual(r.status, 0, r.stderr);
    const svg = fs.readFileSync(path.join(OUT, 'g_gantt.svg'), 'utf8');
    assert(/Carril C1/.test(svg) && /Carril C3/.test(svg) && fs.existsSync(path.join(OUT, 'g_gantt.png')));
  });
  await t('planificar_cronograma.js --aplicar writes the lanes and the construction days (critical path) into sow.json', () => {
    const s = clone(base); const h = s.cronograma.hitos.find((x) => /construcci/i.test(x.nombre)); delete h.tareas; h.dias_habiles = 8; delete s.esfuerzo.paralelismo;
    const f = path.join(OUT, 'ap.json'); fs.writeFileSync(f, JSON.stringify(s));
    const r = node('planificar_cronograma.js', [f, '--aplicar']); assert.strictEqual(r.status, 0, r.stderr);
    const out = JSON.parse(fs.readFileSync(f, 'utf8')); const h2 = out.cronograma.hitos.find((x) => /construcci/i.test(x.nombre));
    assert(h2.tareas.length >= 2 && h2.tareas.length <= 3 && h2.tareas.every((x) => x.carril));
    assert.strictEqual(h2.dias_habiles, Math.max(...h2.tareas.map((x) => x.dias)));
    assert(out.esfuerzo.paralelismo.reduccion_pct > 0);
  });
  await t('Word: en_revision = one table without times or Gantt; aprobado = dated table with lane rows AND the Gantt image', async () => {
    const textOf = async (file) => { const z = await JSZip.loadAsync(fs.readFileSync(file)); return z.file('word/document.xml').async('string').then((x) => ({ x, media: Object.keys(z.files).filter((k) => /word\/media\/fig/.test(k)).length })); };
    const d1 = path.join(OUT, 'rev'); const f1 = path.join(OUT, 'rev.json'); fs.writeFileSync(f1, JSON.stringify(base));
    node('build_all.js', [f1, d1, '--force']);
    const rev = await textOf(path.join(d1, fs.readdirSync(d1).find((x) => /\.docx$/.test(x))));
    assert(!/Cronograma \(Gantt\)|Fechas tentativas|día\(s\) hábil/.test(rev.x), 'en_revision: no times, no Gantt');
    assert(/carriles en paralelo/.test(rev.x), 'en_revision may say it runs in parallel');
    const ap = clone(base); ap.meta.estado = 'aprobado';
    const d2 = path.join(OUT, 'apr'); const f2 = path.join(OUT, 'apr.json'); fs.writeFileSync(f2, JSON.stringify(ap));
    const r = node('build_all.js', [f2, d2, '--force']);
    const apr = await textOf(path.join(d2, fs.readdirSync(d2).find((x) => /\.docx$/.test(x))));
    assert(/Cronograma \(Gantt\)/.test(apr.x) && /Carril C1/.test(apr.x) && /Fechas tentativas/.test(apr.x), 'aprobado: lane rows and Gantt section');
    assert(apr.media === rev.media + 1, `the Gantt PNG is embedded (${rev.media} -> ${apr.media})`);
    assert(/Cronograma: generado/.test(r.stdout), r.stdout.slice(-400));
  });
  await t('estadoCronograma: never silent: pending with reasons (review, blocking questions, services, no start date) and generated when all is set', () => {
    const rev = C.estadoCronograma(base);
    assert(!rev.generado && rev.motivos.some((m) => /en revisión/.test(m.motivo)) && rev.motivos.every((m) => m.desbloquea));
    assert(/PENDIENTE/.test(C.textoEstadoCronograma(rev)) && /Desbloquea/.test(C.textoEstadoCronograma(rev)));
    const conPreguntas = clone(base); conPreguntas.preguntas_abiertas = [{ id: 'Q1', pregunta: 'x', bloquea: true }];
    assert(C.estadoCronograma(conPreguntas).motivos.some((m) => /pregunta/.test(m.motivo)));
    assert(rev.motivos.some((m) => /servicio/.test(m.motivo)), 'services without documentation are listed');
    const sinInicio = clone(base); sinInicio.meta.estado = 'aprobado'; delete sinInicio.cronograma.inicio;
    assert(C.estadoCronograma(sinInicio).motivos.some((m) => /cronograma\.inicio/.test(m.motivo)));
    const listo = clone(base); listo.meta.estado = 'aprobado';
    assert(C.estadoCronograma(listo).generado === true);
    assert(!C.estadoCronograma(listo, { gantt: false, motivoGantt: 'sin Python' }).generado);
  });
  await t('build_all prints the schedule status and the internal faltantes document carries it (pre-kickoff)', async () => {
    const p = JSON.parse(fs.readFileSync(path.join(__dirname, 'prekickoff-fixture.json'), 'utf8'));
    const f = path.join(OUT, 'pk-prek.json'); fs.writeFileSync(f, JSON.stringify(p)); const d = path.join(OUT, 'prek');
    const r = node('build_all.js', [f, d, '--modo', 'prekickoff', '--force']);
    assert(/Cronograma: PENDIENTE/.test(r.stdout) && /Desbloquea/.test(r.stdout), r.stdout.slice(-500));
    const z = await JSZip.loadAsync(fs.readFileSync(path.join(d, fs.readdirSync(d).find((x) => /faltantes-interno\.docx$/.test(x)))));
    const doc = await z.file('word/document.xml').async('string');
    assert(/Cronograma y Gantt: estado/.test(doc) && /NO se generan/.test(doc));
    assert(fs.readdirSync(d).some((x) => /cronograma-estado\.txt$/.test(x)));
  });
  console.log(`\n${n} cronograma tests passed` + (failed ? `, ${failed} FAILED` : ''));
  process.exit(failed ? 1 : 0);
})();
