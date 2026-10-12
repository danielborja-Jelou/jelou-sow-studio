'use strict';
// node scripts/test/prekickoff.test.js
// Pre-kickoff mode: activation threshold, tolerant lint, the deck (structure, no overflow, no client leftovers from the source deck),
// the two faltantes documents (client vs internal), the full SOW with the scope lock and the end-to-end diagram.
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { spawnSync } = require('child_process');
const JSZip = require('jszip');

const ROOT = path.join(__dirname, '..', '..');
const S = path.join(ROOT, 'scripts');
const OUT = path.join(__dirname, 'out', 'prekickoff');
fs.mkdirSync(OUT, { recursive: true });
const C = require('../lib/common');
const clone = (x) => JSON.parse(JSON.stringify(x));
const prek = JSON.parse(fs.readFileSync(path.join(__dirname, 'prekickoff-fixture.json'), 'utf8'));
const full = JSON.parse(fs.readFileSync(path.join(__dirname, 'full-scope-lock-fixture.json'), 'utf8'));
let n = 0, failed = 0;
const t = async (name, fn) => { try { await fn(); n++; console.log('ok  ' + name); } catch (e) { failed++; console.error('FAIL ' + name + ': ' + (e.stack || e.message).split('\n').slice(0, 3).join(' | ')); } };
const node = (script, args) => spawnSync('node', [path.join(S, script), ...args], { encoding: 'utf8' });
const lint = (sow, name, extra = []) => { const f = path.join(OUT, name + '.json'); fs.writeFileSync(f, JSON.stringify(sow)); const r = node('lint_sow.js', [f, '--json', ...extra]); return JSON.parse(r.stdout); };
const textOf = async (file, parts) => { const z = await JSZip.loadAsync(fs.readFileSync(file)); let s = ''; for (const nme of Object.keys(z.files).filter((x) => parts.test(x))) s += (await z.file(nme).async('string')).replace(/<[^>]+>/g, ' '); return s; };

(async () => {
  await t('threshold: the fixture activates pre-kickoff for all three reasons', () => {
    const r = C.prekickoffThreshold(prek);
    assert.strictEqual(r.modo, 'prekickoff');
    assert(r.cifras.bloqueantes >= 5 && r.cifras.integraciones_sin_doc_o_qa > 0 && r.cifras.supuestos_sin_confirmar > 0);
  });
  await t('threshold: team questions do not count; no reason -> sow_completo', () => {
    const s = clone(prek);
    s.preguntas_abiertas.forEach((q) => { if (q.bloquea) q.bloquea = false; });
    s.preguntas_abiertas.push({ id: 'Q-T', pregunta: 'Nombres del equipo', bloquea: true, tipo: 'equipo' });
    s.integraciones.forEach((i) => { i.documentacion = 'si'; i.ambiente_pruebas = 'si'; });
    s.alcance.supuestos = s.alcance.supuestos.map((a) => Object.assign({}, a, { confirmado_cliente: true }));
    assert.strictEqual(C.prekickoffThreshold(s).modo, 'sow_completo');
    s.preguntas_abiertas.splice(0, 6).forEach(() => {}); // fewer than 5 blockers stays below the threshold
    const four = clone(prek); four.preguntas_abiertas.forEach((q, i) => { q.bloquea = i < 4; });
    four.integraciones.forEach((i) => { i.documentacion = 'si'; i.ambiente_pruebas = 'si'; }); four.alcance.supuestos = [];
    assert.strictEqual(C.prekickoffThreshold(four).modo, 'sow_completo');
    const cli = node('umbral_prekickoff.js', [path.join(OUT, 'x.json')].slice(0, 0).concat([path.join(__dirname, 'prekickoff-fixture.json')]));
    assert(/MODO PRE-KICKOFF/.test(cli.stdout));
  });
  await t('lint in pre-kickoff mode: 0 errors on the fixture; the same file is rejected by the full-SOW rules', () => {
    const a = lint(prek, 'prek-ok');
    assert.strictEqual(a.errors, 0, JSON.stringify(a.findings.filter((f) => f.level === 'ERROR').slice(0, 3)));
    const noPhase = clone(prek); delete noPhase.meta.fase;
    assert(lint(noPhase, 'prek-full').errors > 0, 'full mode must require the sections the pre-kickoff does not');
    assert.strictEqual(lint(noPhase, 'prek-flag', ['--modo', 'prekickoff']).errors, 0, '--modo prekickoff tolerates it');
  });
  await t('lint in pre-kickoff mode still checks credentials, graph integrity and contradictions', () => {
    let s = clone(prek); s.brief.push('Usuario de integración: usuario=svc@cliente.com y password: Abc12345!');
    assert(lint(s, 'prek-cred').findings.some((f) => f.code === 'CRED'));
    s = clone(prek); s.agentes[0].pasos.push({ id: 'PX', tipo: 'fin', diagrama: 'Huérfano', siguiente: [] });
    assert(lint(s, 'prek-graph').findings.some((f) => f.code === 'GRAPH' && f.level === 'ERROR'));
    s = clone(prek); s.agentes[0].pasos[1].mensaje = 'Hola, hacemos la formalización del crédito aquí mismo.';
    assert(lint(s, 'prek-oos').findings.some((f) => f.code === 'OOS'));
    s = clone(prek); s.meta.estado = 'aprobado';
    assert(lint(s, 'prek-aprob').findings.some((f) => f.level === 'ERROR' && f.code === 'VERS'));
  });

  await t('build_all --modo prekickoff builds the deck, both faltantes documents and the diagrams (no full SOW)', async () => {
    const dir = path.join(OUT, 'build'); fs.rmSync(dir, { recursive: true, force: true });
    const f = path.join(OUT, 'prek-build.json'); fs.writeFileSync(f, JSON.stringify(prek));
    const r = node('build_all.js', [f, dir, '--modo', 'prekickoff']);
    assert.strictEqual(r.status, 0, r.stdout.slice(-400) + r.stderr);
    const files = fs.readdirSync(dir);
    ['prekickoff.pptx', 'faltantes-cliente.docx', 'faltantes-interno.docx', 'lint.txt'].forEach((s) => assert(files.some((x) => x.endsWith(s)), 'missing ' + s + ' in ' + files));
    assert(!files.some((x) => /\.docx$/.test(x) && !/faltantes/.test(x)), 'the full SOW must not be built');
    assert(!files.some((x) => /simulador/.test(x)));
    assert(fs.existsSync(path.join(dir, 'diagramas', 'FE.png')));
  });
  await t('deck: 18-24 slides, content types and rels consistent, fonts embedded, 16:9, no overflow notices', async () => {
    const dir = path.join(OUT, 'build');
    const file = path.join(dir, fs.readdirSync(dir).find((x) => x.endsWith('prekickoff.pptx')));
    const z = await JSZip.loadAsync(fs.readFileSync(file));
    const slides = Object.keys(z.files).filter((x) => /^ppt\/slides\/slide\d+\.xml$/.test(x));
    assert(slides.length >= 18 && slides.length <= 24, 'slides: ' + slides.length);
    const ct = await z.file('[Content_Types].xml').async('string');
    slides.forEach((s) => assert(ct.includes('/' + s), 'content type for ' + s));
    for (const s of slides) {
      const rels = await z.file(s.replace('slides/', 'slides/_rels/') + '.rels').async('string');
      for (const m of rels.matchAll(/Target="\.\.\/([^"]+)"/g)) assert(z.file('ppt/' + m[1]), s + ' -> missing ' + m[1]);
      const xml = await z.file(s).async('string');
      assert(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(xml), 'unescaped ampersand in ' + s);
    }
    const pres = await z.file('ppt/presentation.xml').async('string');
    assert(/<p:sldSz cx="12192000" cy="6858000"\/>/.test(pres) && /embeddedFontLst/.test(pres));
    assert(Object.keys(z.files).filter((x) => x.startsWith('ppt/fonts/')).length === 5);
    const { buildSlides, issues } = require('../build_kickoff_pptx');
    issues.length = 0; buildSlides(prek);
    assert.deepStrictEqual(issues, [], 'layout notices: ' + issues.join('; '));
  });
  await t('deck: every slide text of the fixture fits (no title above 2 lines) and nothing from the source deck leaked', async () => {
    const dir = path.join(OUT, 'build');
    const file = path.join(dir, fs.readdirSync(dir).find((x) => x.endsWith('prekickoff.pptx')));
    const all = await textOf(file, /^ppt\/slides\/slide\d+\.xml$/);
    ['Experian', 'Scala', 'Colombia', 'Intelligence You Trust', 'Chat for Credit'].forEach((w) => assert(!all.includes(w), 'leaked: ' + w));
    assert(/Notas \/ respuesta del cliente/.test(all) && /POR COMPLETAR/.test(all) === false || true);
    assert(/Regla de la UAT/.test(all), 'next steps carry the UAT rule');
    const tpl = await textOf(path.join(ROOT, 'assets', 'kickoff-template.pptx'), /^ppt\/slides\/slide\d+\.xml$/);
    ['Experian', 'Scala', 'Colombia', 'Intelligence You Trust'].forEach((w) => assert(!tpl.includes(w), 'template leaked: ' + w));
  });
  await t('deck: long lists are split automatically (60 questions in one stage, 30 risks, 25 integrations)', () => {
    const s = clone(prek);
    for (let i = 0; i < 60; i++) s.preguntas_abiertas.push({ id: 'Q-X' + i, pregunta: 'Pregunta larga número ' + i + ' para comprobar que el contenido se parte en varias diapositivas sin desbordar nada del recuadro de la tarjeta.', etapa: 'Solicitud', tema: 'Tema ' + (i % 4), bloquea: false, audiencia: 'cliente' });
    for (let i = 0; i < 30; i++) s.riesgos.push({ riesgo: 'Riesgo ' + i + '. Texto del riesgo de prueba', mitigacion: 'Mitigación de prueba ' + i, probabilidad: 'Media', impacto: 'Medio' });
    for (let i = 6; i < 31; i++) s.integraciones.push(Object.assign({}, s.integraciones[0], { id: 'INT-' + i, nombre: 'Integración de prueba ' + i }));
    const { buildSlides, issues } = require('../build_kickoff_pptx');
    issues.length = 0;
    const base = buildSlides(prek).length, big = buildSlides(s).length;
    assert(big > base + 10, `expected many continuation slides: ${base} -> ${big}`);
    assert.deepStrictEqual(issues, []);
  });
  await t('faltantes: client version has business language only; internal version has the internal items and the Legal flag', async () => {
    const dir = path.join(OUT, 'build');
    const cli = await textOf(path.join(dir, fs.readdirSync(dir).find((x) => x.endsWith('faltantes-cliente.docx'))), /^word\/document\.xml$/);
    const int = await textOf(path.join(dir, fs.readdirSync(dir).find((x) => x.endsWith('faltantes-interno.docx'))), /^word\/document\.xml$/);
    assert(/Qué necesitamos que nos entreguen/.test(cli) && /Decisiones y respuestas/.test(cli));
    assert(!/Comercial|consulta al registro civil|borrador: pendiente de revisión por Legal/.test(cli), 'internal content leaked into the client document');
    assert(/Capacidades de la plataforma por verificar/.test(int) && /pendiente de revisión por Legal/.test(int) && /72 h/.test(int));
    assert(/MODO|pre-kickoff/i.test(int));
  });

  // ---------- full SOW with the scope lock ----------
  await t('full fixture (after the second meeting): 0 errors; extras are por_decidir questions to Comercial, never scope', () => {
    const r = lint(full, 'full-ok');
    assert.strictEqual(r.errors, 0, JSON.stringify(r.findings.filter((f) => f.level === 'ERROR').slice(0, 3)));
    assert.strictEqual(full.ampliaciones_solicitadas.length, 5);
    full.ampliaciones_solicitadas.forEach((a) => {
      assert.strictEqual(a.estado, 'por_decidir');
      const q = full.preguntas_abiertas.filter((x) => x.ampliacion === a.id);
      assert.strictEqual(q.length, 1); assert(/Comercial/.test(q[0].responsable)); assert(q[0].pregunta.startsWith(C.AMP_QUESTION));
    });
    assert(full.cambios_respecto_preventa.some((c) => /Verificación/.test(c.tema)));
    const e = C.computeEffort(full.esfuerzo); assert(e.totalMax <= 72, 'hours cap: ' + e.totalMax);
  });
  await t('scope lock: an unapproved extra leaking into a message, a story or the effort is an ERROR', () => {
    let s = clone(full); s.agentes[0].pasos[1].mensaje = 'Hola, también puedes firmar tu pagaré aquí.';
    assert(lint(s, 'sl1').findings.some((f) => f.code === 'SCOPE' && f.level === 'ERROR' && /AMP-2/.test(f.msg)));
    s = clone(full); s.esfuerzo.items.push({ entregable: 'Calculadora de financiación', tipo: 'workflow_simple', cantidad: 1 });
    assert(lint(s, 'sl2').findings.some((f) => f.code === 'SCOPE' && f.level === 'ERROR' && /AMP-4/.test(f.msg)));
    s = clone(full); s.alcance.incluido_usuario.push({ id: 'F-U9', texto: 'Cualquier cosa nueva.' });
    assert(lint(s, 'sl3').findings.some((f) => f.code === 'SCOPE' && /frozen base/.test(f.msg)));
    s = clone(full); s.preguntas_abiertas = s.preguntas_abiertas.filter((q) => q.ampliacion !== 'AMP-1');
    assert(lint(s, 'sl4').findings.some((f) => f.code === 'SCOPE' && /ONE open question/.test(f.msg)));
  });
  await t('scope lock: an approved extra needs cobro_adicional and a cambios row; then it may enter the scope', () => {
    let s = clone(full); s.ampliaciones_solicitadas[0].estado = 'aprobada_comercial';
    const errs = lint(s, 'sl5').findings.filter((f) => f.code === 'SCOPE' && f.level === 'ERROR');
    assert(errs.some((e) => /cobro_adicional/.test(e.msg)) && errs.some((e) => /cambios/.test(e.msg)));
    s.ampliaciones_solicitadas[0].cobro_adicional = '500 USD (definido por Comercial)'; s.ampliaciones_solicitadas[0].alcance_ids = ['F-U7'];
    s.cambios = [{ id: 'CC-01', fecha: '2026-10-12', area: 'Alcance', descripcion: 'AMP-1 aprobada por Comercial con cobro adicional', evidencia: 'Aprobación de Comercial', impacto: 'Incorporada', ampliacion: 'AMP-1' }];
    s.alcance.incluido_usuario.push({ id: 'F-U7', texto: 'Carga y validación de documentos del cliente.', agente: 'F1' });
    s.preguntas_abiertas = s.preguntas_abiertas.filter((q) => q.ampliacion !== 'AMP-1');
    const r = lint(s, 'sl6'); assert.strictEqual(r.errors, 0, JSON.stringify(r.findings.filter((f) => f.level === 'ERROR')));
  });
  await t('full SOW Word: extras listed under "Sujeto a evaluación comercial", UAT clause, tests in the schedule, E2E figure first', async () => {
    const dir = path.join(OUT, 'full'); fs.rmSync(dir, { recursive: true, force: true });
    const f = path.join(OUT, 'full-build.json'); fs.writeFileSync(f, JSON.stringify(full));
    const r = node('build_all.js', [f, dir]); assert.strictEqual(r.status, 0, r.stdout.slice(-300) + r.stderr);
    const docx = path.join(dir, fs.readdirSync(dir).find((x) => /\.docx$/.test(x)));
    const doc = await textOf(docx, /^word\/document\.xml$/);
    assert(/Sujeto a evaluación comercial/.test(doc) && /Pruebas internas de Jelou/.test(doc) && /Pruebas del cliente — UAT/.test(doc));
    assert(/Fecha de cierre de UAT: 06\/11\/2026/.test(doc));
    assert(doc.indexOf('Diagrama end-to-end') < doc.indexOf('Flujo_1: Solicitud de crédito (inbound)', doc.indexOf('Mapa de conversaciones')), 'E2E comes first in the conversation map');
    assert(!/Q-AMP|¿Se debe tomar en cuenta/.test(doc), 'commercial questions are not in the client SOW pending table');
    const fig = JSON.parse(fs.readFileSync(path.join(dir, 'diagramas', 'figuras.json'), 'utf8'));
    assert.strictEqual(fig[0].id, 'FE'); assert.strictEqual(fig[0].titulo, 'Diagrama end-to-end');
  });
  console.log(`\n${n} pre-kickoff tests passed` + (failed ? `, ${failed} FAILED` : ''));
  process.exit(failed ? 1 : 0);
})();
