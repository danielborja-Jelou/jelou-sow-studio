'use strict';
// node scripts/test/lint.test.js
// 1) the example SOW must lint with 0 errors; 2) a copy seeded with known errors must be caught, code by code.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const LINT = path.join(ROOT, 'scripts', 'lint_sow.js');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

function lint(sow, name) {
  const f = path.join(OUT, name + '.json');
  fs.writeFileSync(f, JSON.stringify(sow, null, 2));
  const r = spawnSync('node', [LINT, f, '--json'], { encoding: 'utf8' });
  const j = JSON.parse(r.stdout);
  return { status: r.status, errors: j.findings.filter((x) => x.level === 'ERROR'), warns: j.findings.filter((x) => x.level === 'WARN') };
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'example-sow.json'), 'utf8'));

// 1. clean example
const ok = lint(base, 'lint-ok');
assert.strictEqual(ok.errors.length, 0, 'the example has errors: ' + JSON.stringify(ok.errors.slice(0, 3)));
assert.strictEqual(ok.status, 0);

// 2. seeded errors: [description, mutate(sow), expected code, expected substring]
const cases = [
  ['credential in text', (s) => { s.brief.push('Usuario de integración: usuario=svc@cliente.com y password: Abc12345!'); }, 'CRED'],
  ['version 0.x', (s) => { s.meta.version = '0.1'; s.versiones[s.versiones.length - 1].version = '0.1'; }, 'VERS', '0.x'],
  ['version not X.Y', (s) => { s.meta.version = '1.0.1'; }, 'VERS'],
  ['invalid estado', (s) => { s.meta.estado = 'borrador'; }, 'VERS', 'estado'],
  ['approved with pending values', (s) => { s.meta.estado = 'aprobado'; }, 'PENDING'],
  ['api step without integration', (s) => { const p = s.agentes[0].pasos.find((x) => x.tipo === 'api'); delete p.integracion; }, 'FLOW'],
  ['componente API without integration', (s) => { const p = s.agentes[0].pasos.find((x) => x.tipo === 'mensaje'); p.componente = 'API (WS#9)'; }, 'FLOW', 'integracion'],
  ['unreachable step', (s) => { s.agentes[0].pasos.push({ id: 'PX', tipo: 'fin', diagrama: 'Huérfano', siguiente: [] }); }, 'GRAPH', 'unreachable'],
  ['unknown rule reference', (s) => { s.historias[0].reglas = ['RN-99']; }, 'REF'],
  ['integration without connection mode', (s) => { delete s.integraciones[0].conexion; }, 'INT', 'conexion'],
  ['more than 3 buttons', (s) => { const p = s.agentes[0].pasos.find((x) => (x.botones || []).length); p.botones = ['a', 'b', 'c', 'd']; }, 'WA'],
  ['unknown effort type', (s) => { s.esfuerzo.items.push({ entregable: 'x', tipo: 'inventado', cantidad: 1 }); }, 'EFFORT'],
  ['schedule above 20 business days', (s) => { s.cronograma.hitos[0].dias_habiles = 40; }, 'SCHED', '20'],
  ['escalation without mode', (s) => { delete s.escalamiento[0].modo; }, 'ESC'],
  ['effort above the 72 h cap', (s) => { s.esfuerzo.items.push({ entregable: 'Extra', tipo: 'workflow_complejo', cantidad: 6 }); }, 'EFFORT', 'cap'],
  ['no internal-tests milestone', (s) => { s.cronograma.hitos = s.cronograma.hitos.filter((h) => h.id !== 'H2'); }, 'SCHED', 'internal-tests'],
  ['no client-tests (UAT) milestone', (s) => { s.cronograma.hitos = s.cronograma.hitos.filter((h) => h.id !== 'H3'); }, 'SCHED', 'client-tests'],
  ['approved addition without charge', (s) => { s.ampliaciones_solicitadas[0].estado = 'aprobada_comercial'; }, 'SCOPE', 'cobro_adicional'],
  ['addition to decide without its question', (s) => { s.preguntas_abiertas = s.preguntas_abiertas.filter((q) => !q.ampliacion); }, 'SCOPE', 'ONE open question'],
  ['empty out of scope', (s) => { s.alcance.fuera_de_alcance = []; }, 'OOS'],
];
let failed = 0;
for (const [name, mutate, code, sub] of cases) {
  const s = clone(base);
  try {
    mutate(s);
    const r = lint(s, 'lint-seed');
    const hit = r.errors.find((e) => e.code === code && (!sub || e.msg.includes(sub) || e.where.includes(sub)));
    assert(hit, `expected an ERROR [${code}]${sub ? ' containing "' + sub + '"' : ''}; got: ` + r.errors.map((e) => e.code).join(',') || 'none');
    assert.strictEqual(r.status, 1);
    console.log('ok  ' + name);
  } catch (e) { failed++; console.error('FAIL ' + name + ': ' + e.message); }
}

// 3. warnings that must exist (not errors)
{
  const s = clone(base);
  s.solucion.componentes[0].componente = 'Webview';
  s.solucion.componentes[0].detalle = 'formulario';
  const r = lint(s, 'lint-warn');
  if (!r.warns.some((w) => w.code === 'SOLUTION' && /webview/i.test(w.msg))) { failed++; console.error('FAIL bare webview must warn'); } else console.log('ok  bare webview warns');
}
// 4. blocking items (warnings with blocking:true while en_revision, ERRORS when aprobado), team, forms, proposed dates
{
  const chk = (name, cond) => { if (!cond) { failed++; console.error('FAIL ' + name); } else console.log('ok  ' + name); };
  const blk = (s, code) => lint(s, 'lint-blk').warns.filter((w) => w.blocking && w.code === code);
  let s = clone(base);
  s.datos = [{ entidad: 'Cliente', uso: 'Datos del cliente', campos: ['documento', 'correo'], retencion: 'POR DEFINIR' }];
  chk('personal data without retention is blocking', blk(s, 'DATA').length >= 1);
  s = clone(base); s.parametros.retencion_datos = 'POR DEFINIR'; s.datos = [{ entidad: 'Cliente', uso: 'Contacto', campos: ['correo'], retencion: '12 meses' }];
  chk('pending retention parameter is blocking', blk(s, 'DATA').some((w) => w.where === 'parametros.retencion_datos'));
  s = clone(base); s.escalamiento = [{ id: 'E1', disparador: 'a', modo: 'automatico', destino: 'PMA', horario: 'x', fuera_de_horario: 'y' }, { id: 'E2', disparador: 'b', modo: 'ofrecido', destino: 'PMA', horario: 'x', fuera_de_horario: 'y' }];
  chk('automatic + offered to the same destination is blocking', blk(s, 'ESC').length === 1);
  s = clone(base); s.integraciones[0].documentacion = 'pendiente'; s.dependencias_cliente.forEach((d) => { delete d.integracion; d.fecha_limite = 'POR DEFINIR'; });
  chk('integration without owner/docs/test and no dated dependency is blocking', blk(s, 'INT').length === 1);
  chk('dependencies without deadline are blocking', blk(s, 'DEP').length === s.dependencias_cliente.length);
  const r = spawnSync('node', [LINT, path.join(OUT, 'lint-blk.json')], { encoding: 'utf8' });
  chk('human report has a Bloqueantes block, grouped counts and proposed dates', /=== BLOQUEANTES \(/.test(r.stdout) && /dependencias_cliente: \d+/.test(r.stdout) && /PROPUESTA DE FECHAS/.test(r.stdout) && /proponer \d{4}-\d{2}-\d{2}/.test(r.stdout));
  s.meta.estado = 'aprobado';
  chk('blocking items become errors when aprobado', lint(s, 'lint-blk2').errors.some((e) => e.blocking));
  s = clone(base); s.equipo[0].nombre = 'Persona Ejemplo'; delete s.meta.equipo_confirmado;
  chk('team names without meta.equipo_confirmado warn', lint(s, 'lint-team').warns.some((w) => w.code === 'TEAM' && /equipo_confirmado/.test(w.msg)));
  s.meta.equipo_confirmado = true;
  chk('confirmed team does not warn', !lint(s, 'lint-team').warns.some((w) => /equipo_confirmado/.test(w.msg)));
  s = clone(base); const f = s.agentes[0].pasos.find((x) => x.tipo === 'formulario'); f.herramienta = 'otra';
  chk('invalid form herramienta is an error', lint(s, 'lint-form').errors.some((e) => /herramienta/.test(e.msg)));
  s = clone(base); const f2 = s.agentes[0].pasos.find((x) => x.tipo === 'formulario'); f2.tipo = 'webview'; f2.webview = f2.formulario; delete f2.formulario;
  chk('webview alias still lints (with a notice)', lint(s, 'lint-alias').errors.length === 0 && lint(s, 'lint-alias').warns.some((w) => w.code === 'FORM'));
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'figuras-fixture.json'), 'utf8'));
  fx.agentes[0].pasos.forEach((p) => { delete p.grupo; });
  chk('auto-merged stages produce a FIG notice', lint(Object.assign(clone(base), { agentes: fx.agentes, integraciones: base.integraciones }), 'lint-fig').warns.some((w) => w.code === 'FIG'));
}
// 5. hours cap exception, UAT rule warning, legal flag, E2E
{
  const chk = (name, cond) => { if (!cond) { failed++; console.error('FAIL ' + name); } else console.log('ok  ' + name); };
  let s = clone(base); s.esfuerzo.items.push({ entregable: 'Extra', tipo: 'workflow_complejo', cantidad: 6 }); s.meta.excepcion_horas = 'Aprobado por la dirección';
  chk('hours cap exception downgrades the error to a warning', lint(s, 'lint-cap').errors.length === 0 && lint(s, 'lint-cap').warns.some((w) => w.code === 'EFFORT' && /excepcion_horas/.test(w.msg)));
  s = clone(base); s.meta.tope_horas = 20;
  chk('meta.tope_horas is configurable', lint(s, 'lint-cap2').errors.some((e) => e.code === 'EFFORT' && /20 h/.test(e.msg)));
  s = clone(base); s.dependencias_cliente = s.dependencias_cliente.filter((d) => d.tipo !== 'uat');
  chk('missing UAT time rule warns', lint(s, 'lint-uat').warns.some((w) => w.code === 'UAT'));
  chk('the UAT clause is flagged as pending Legal review until confirmed', lint(base, 'lint-legal').warns.some((w) => w.code === 'LEGAL'));
  s = clone(base); s.meta.clausula_uat_revisada_legal = true;
  chk('Legal flag clears with meta.clausula_uat_revisada_legal', !lint(s, 'lint-legal2').warns.some((w) => w.code === 'LEGAL'));
  s = clone(base); s.dependencias_cliente.find((d) => d.tipo === 'uat').fecha_limite = '2026-12-01';
  chk('UAT dependency date must match the end of the UAT milestone', lint(s, 'lint-uat2').warns.some((w) => w.code === 'UAT' && /differs/.test(w.msg)));
  s = clone(base); s.agentes[0].resumen_cliente[1].texto = 'Valida el OTP con la API del ERP';
  chk('technical words in the end-to-end summary warn', lint(s, 'lint-e2e').warns.some((w) => w.code === 'E2E'));
  s = clone(base); s.agentes[0].pasos[1].mensaje = 'Hola, ¿quieres ver el ranking de vendedores?';
  chk('an addition by decide cannot leak into a bot message', lint(s, 'lint-amp').errors.some((e) => e.code === 'SCOPE'));
}
if (failed) { console.error(failed + ' test(s) failed'); process.exit(1); }
console.log('lint tests passed');
