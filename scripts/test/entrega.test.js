'use strict';
// node scripts/test/entrega.test.js
// Fase 2 explícita (comparar_versiones.js) y entrega a Drive (entrega_drive.js, con Drive simulado: nunca sube nada real).
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const { comparar, aMarkdown } = require('../comparar_versiones');
const E = require('../entrega_drive');

let ok = 0, fail = 0;
const queue = [];
const t = (name, fn) => queue.push([name, fn]);
(async () => {
  const run = async () => { for (const [name, fn] of queue) { try { await fn(); ok++; console.log('ok  ' + name); } catch (e) { fail++; console.log('FAIL ' + name + ': ' + e.message); } } };

  const base = () => ({ meta: { cliente: 'Cliente: X/Y', proyecto: 'P', version: '1.0', fase: 'prekickoff' },
    preguntas_abiertas: [{ id: 'Q1', pregunta: '¿Campos del formulario?', bloquea: true }, { id: 'Q2', pregunta: '¿Servicio de pago?', bloquea: false }],
    alcance: { base: ['A'] },
    agentes: [{ id: 'F1', nombre: 'Flujo 1', pasos: [{ id: 'P1', tipo: 'mensaje', mensaje: 'Hola POR DEFINIR' }, { id: 'P2', tipo: 'formulario', formulario: { herramienta: 'flows' } }] }],
    reglas: [], integraciones: [{ id: 'INT-1', nombre: 'ERP' }], dependencias_cliente: [] });

  t('comparar: resumen de preguntas, pasos, herramienta y modo', () => {
    const a = base(); const b = base(); b.meta.fase = undefined; b.meta.version = '1.0';
    b.preguntas_abiertas[0].respuesta = 'Nombre y cédula'; b.preguntas_abiertas.push({ id: 'Q3', pregunta: '¿Horario?', bloquea: true });
    b.agentes[0].pasos[0].mensaje = 'Hola'; b.agentes[0].pasos[1].formulario.herramienta = 'webview'; b.agentes[0].pasos.push({ id: 'P3', tipo: 'fin' });
    b.demo = { modo: 'conversacional' }; b.reglas.push({ id: 'RN-1', titulo: 'Monto mínimo' });
    b.ampliaciones_solicitadas = [{ id: 'AMP-1', descripcion: 'Reporte extra', estado: 'por_decidir' }];
    const R = comparar(a, b); const md = aMarkdown(R, 'a.json', 'b.json');
    assert.strictEqual(R.resumen.preguntas.resueltas, 1); assert.strictEqual(R.resumen.preguntas.nuevas, 1); assert.strictEqual(R.resumen.preguntas.bloqueantes, 1);
    assert.deepStrictEqual(R.resumen.porDefinir, { antes: 1, ahora: 0 });
    assert.ok(/P2/.test(md) && /flows → webview/.test(md), 'cambio de herramienta');
    assert.ok(/auto → conversacional/.test(md) && /Reporte extra/.test(md) && /Monto mínimo/.test(md));
  });
  t('comparar: dos versiones iguales no inventan diferencias', () => {
    const R = comparar(base(), base()); assert.strictEqual(R.secciones.filter((s) => s.titulo !== 'Preguntas abiertas' && s.titulo !== 'Datos por completar').length, 0);
  });

  t('drive: la etapa sale de meta (prekickoff → inicio, aprobado → cierre, otro → proceso) y se puede forzar', () => {
    assert.strictEqual(E.etapaDe({ meta: { fase: 'prekickoff' } }).etapa, 'inicio');
    assert.strictEqual(E.etapaDe({ meta: { estado: 'aprobado' } }).etapa, 'cierre');
    assert.strictEqual(E.etapaDe({ meta: { estado: 'en_revision' } }).etapa, 'proceso');
    assert.strictEqual(E.etapaDe({ meta: { fase: 'prekickoff' } }, 'cierre').etapa, 'cierre');
    assert.throws(() => E.etapaDe({ meta: {} }, 'otra'));
  });
  t('drive: plan con nombre de company limpio, sin guiones ni lint; carpeta local; subida simulada con estructura inicio/proceso/cierre', async () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'entrega-'));
    fs.mkdirSync(path.join(out, 'diagramas')); fs.writeFileSync(path.join(out, 'diagramas', 'FE.png'), 'png');
    for (const n of ['SOW-X-v1.0.docx', 'SOW-X-v1.0-simulador.html', 'SOW-X-v1.0-simulador.guion.json', 'SOW-X-v1.0-lint.txt', 'suelta.png']) fs.writeFileSync(path.join(out, n), 'x');
    const sow = { meta: { cliente: 'Cliente: X/Y', estado: 'aprobado' } };
    const p = E.plan(sow, out); assert.strictEqual(p.empresa, 'Cliente X Y'); assert.strictEqual(p.etapa, 'cierre');
    const nombres = p.archivos.map((f) => f.rel.join('/')).sort();
    assert.deepStrictEqual(nombres, ['SOW-X-v1.0-simulador.html', 'SOW-X-v1.0.docx', 'diagramas/FE.png']);
    E.prepararLocal(p); assert.ok(fs.existsSync(path.join(p.local, 'diagramas', 'FE.png')));
    // Drive simulado: guarda carpetas y archivos
    const carpetas = new Map(); const archivos = []; let n = 0;
    const http = async (url, init = {}) => {
      const u = String(url); const j = (o) => ({ ok: true, status: 200, headers: { get: (k) => (k === 'location' ? 'https://upload.local/' + (++n) : null) }, json: async () => o, text: async () => '' });
      if (init.method === 'PUT') { archivos.push(u); return j({ id: 'f' + n }); }
      if (u.includes('/upload/')) { return j({}); }
      if (init.method === 'POST') { const b = JSON.parse(init.body); const id = 'd' + (++n); carpetas.set(id, b); return j({ id }); }
      return j({ files: [] });
    };
    const r = await E.subir(p, { http, tk: 'token-falso', raiz: 'root' });
    const nombresCarpeta = [...carpetas.values()].map((c) => c.name);
    assert.ok(['Cliente X Y', 'inicio', 'proceso', 'cierre', 'diagramas'].every((x) => nombresCarpeta.includes(x)), nombresCarpeta.join(','));
    assert.strictEqual(r.archivos.length, 3); assert.strictEqual(archivos.length, 3);
    assert.ok(/drive\.google\.com\/drive\/folders\//.test(r.carpeta));
    fs.rmSync(out, { recursive: true, force: true });
  });

  await run();
  console.log(`\n${ok} entrega tests passed${fail ? `, ${fail} FAILED` : ''}`);
  process.exit(fail ? 1 : 0);
})();
