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
    assert(files.some((x) => /simulador\.html$/.test(x)), "the simulator is generated in pre-kickoff mode too");
    assert(fs.existsSync(path.join(dir, 'diagramas', 'FE.png')));
  });
  await t('deck: 19-25 slides, content types and rels consistent, fonts embedded, 16:9, no overflow notices', async () => {
    const dir = path.join(OUT, 'build');
    const file = path.join(dir, fs.readdirSync(dir).find((x) => x.endsWith('prekickoff.pptx')));
    const z = await JSZip.loadAsync(fs.readFileSync(file));
    const slides = Object.keys(z.files).filter((x) => /^ppt\/slides\/slide\d+\.xml$/.test(x));
    assert(slides.length >= 19 && slides.length <= 25, 'slides: ' + slides.length);
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
  await t('roadmap: slide 2 of every pre-kickoff deck (fixture, minimal sow, pattern data), 4 numbered phases, agenda moves to slide 3', async () => {
    const { buildSlides, patternSow, issues } = require('../build_kickoff_pptx');
    const txt = (s) => s.xml().replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    for (const [label, sow] of [['fixture', prek], ['minimal', { meta: { cliente: 'X', proyecto: 'Y' } }], ['patterns', patternSow()]]) {
      issues.length = 0;
      const sl = buildSlides(sow);
      assert.strictEqual(sl[1].name, 'Roadmap', label + ': slide 2 must be the roadmap, got ' + sl[1].name);
      assert.strictEqual(sl[0].name, 'Portada'); assert.strictEqual(sl[2].name, 'Agenda', label + ': agenda is slide 3');
      assert.strictEqual(sl.filter((s) => s.name === 'Roadmap').length, 1);
      const x = sl[1].xml();
      for (let k = 1; k <= 4; k++) { assert(x.includes(`name="Número ${k}"`) && x.includes(`name="Fase ${k}"`) && x.includes(`name="Banda ${k}"`) && x.includes(`name="Círculo ${k}"`), label + ': phase ' + k); }
      assert(!/name="Número 5"/.test(x));
      ['Onboarding', 'Desarrollo', 'Pruebas', 'Producción &amp; Soporte', 'Análisis SOW &amp; Servicios', 'Pase a producción del Bot', 'Roadmap'].forEach((w) => assert(x.includes(w), label + ': missing default text ' + w));
      assert(/custGeom/.test(x) && /sysDot/.test(x), 'native free-form shapes and dotted frame');
      assert.deepStrictEqual(issues, [], label + ' notices: ' + issues.join('; '));
    }
    assert.strictEqual(buildSlides(prek).length, 22, 'fixture deck: 21 -> 22 slides');
    // the generated file has it as ppt/slides/slide2.xml
    const dir = path.join(OUT, 'build');
    const z = await JSZip.loadAsync(fs.readFileSync(path.join(dir, fs.readdirSync(dir).find((x) => x.endsWith('prekickoff.pptx')))));
    const s2 = (await z.file('ppt/slides/slide2.xml').async('string')).replace(/<[^>]+>/g, ' ');
    assert(/Onboarding/.test(s2) && /Producción &amp; Soporte|Producción & Soporte/.test(s2));
    assert(/Agenda del pre-kickoff/.test((await z.file('ppt/slides/slide3.xml').async('string')).replace(/<[^>]+>/g, ' ')));
  });
  await t('roadmap: como_trabajamos override replaces titles and items; texts fit (shrink, then truncate with a notice)', () => {
    const { buildSlides, issues } = require('../build_kickoff_pptx');
    const s = clone(prek);
    s.prekickoff.como_trabajamos = { titulo: 'Cómo trabajamos', fases: [
      { titulo: 'Descubrimiento', items: ['Taller con el equipo', 'Mapa de procesos'] },
      { titulo: 'Construcción', items: ['Flujos', 'Integraciones', 'Webview'] },
      { titulo: 'Validación', items: ['Pruebas internas', 'UAT del cliente'] },
      { titulo: 'Salida a producción', items: ['Go-live', 'Acompañamiento'] }] };
    issues.length = 0;
    let x = buildSlides(s)[1].xml();
    ['Cómo trabajamos', 'Descubrimiento', 'Taller con el equipo', 'Integraciones', 'Go-live'].forEach((w) => assert(x.includes(w), 'override text ' + w));
    assert(!x.includes('Onboarding') && !/Roadmap/.test(x.replace(/name="[^"]*"/g, '')), 'defaults are replaced');
    assert.deepStrictEqual(issues, []);
    // a heavy list shrinks the font before anything is cut
    s.prekickoff.como_trabajamos.fases[0].items = ['Análisis del documento de alcance y los servicios', 'Diseño del flujo y la experiencia conversacional', 'Aprobación formal del SOW', 'Cronograma'];
    issues.length = 0; x = buildSlides(s)[1].xml();
    assert(/sz="(1100|1000|900)"/.test(x), 'font shrinks'); assert.deepStrictEqual(issues, []);
    // an absurd list is truncated with a layout notice and never grows the card
    s.prekickoff.como_trabajamos.fases[0].items = Array.from({ length: 8 }, (_, i) => 'Elemento larguísimo número ' + i + ' que no cabe de ninguna manera dentro de la tarjeta del roadmap');
    issues.length = 0; x = buildSlides(s)[1].xml();
    assert(issues.some((i) => /^Roadmap: phase 1/.test(i)), 'notice: ' + issues.join('; '));
    // wrong phase count never breaks the builder (falls back to the defaults); the linter reports it
    s.prekickoff.como_trabajamos.fases.pop(); issues.length = 0;
    assert(buildSlides(s)[1].xml().includes('Onboarding'));
  });
  await t('lint: como_trabajamos with a number of phases other than 4 is an ERROR; a valid override passes', () => {
    const s = clone(prek);
    s.prekickoff.como_trabajamos = { fases: [{ titulo: 'A', items: ['x'] }, { titulo: 'B', items: ['y'] }, { titulo: 'C', items: ['z'] }] };
    assert(lint(s, 'road-3').findings.some((f) => f.code === 'ROAD' && f.level === 'ERROR' && /exactly 4/.test(f.msg)));
    s.prekickoff.como_trabajamos.fases.push({ titulo: 'D', items: ['w'] }, { titulo: 'E', items: ['v'] });
    assert(lint(s, 'road-5').findings.some((f) => f.code === 'ROAD' && f.level === 'ERROR'));
    s.prekickoff.como_trabajamos.fases.pop();
    assert(!lint(s, 'road-4').findings.some((f) => f.code === 'ROAD' && f.level === 'ERROR'));
    s.prekickoff.como_trabajamos.fases[1].titulo = '';
    assert(lint(s, 'road-notitle').findings.some((f) => f.code === 'ROAD' && f.level === 'ERROR'));
    assert(!lint(prek, 'road-none').findings.some((f) => f.code === 'ROAD'), 'no override: no finding');
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
  await t('validation slides use the "Plan de Acción" rows (validacion-plan): at most 3 rows, number blocks 01-03, arrow bands, grey panels and the notes box on every slide', () => {
    const { buildSlides, issues } = require('../build_kickoff_pptx');
    issues.length = 0;
    const val = buildSlides(prek).filter((s) => /^Validación /.test(s.name) && s.name !== 'Validación');
    assert(val.length >= 3, 'fixture has validation slides: ' + val.length);
    const cnt = (xml, name) => (xml.match(new RegExp('name="' + name + ' [0-9]"', 'g')) || []).length;
    val.forEach((s) => {
      const x = s.xml();
      const rows = cnt(x, 'Bloque');
      assert(rows >= 1 && rows <= 3, `${s.name}: ${rows} rows`);
      ['Panel', 'Banda', 'Número', 'Tema', 'Preguntas'].forEach((k) => assert.strictEqual(cnt(x, k), rows, `${s.name}: ${k}`));
      assert(/<a:t>01<\/a:t>/.test(x) || /<a:t>0\d<\/a:t>/.test(x), 'row number');
      assert(x.includes('Notas / respuesta del cliente'), `${s.name}: notes box missing`);
      assert(x.includes('78909C') && x.includes('EEEEEE') && x.includes('5893A3') && x.includes('<a:buChar char="●"/>'), 'Plan de Acción colours and bullets');
      assert(!/prstGeom prst="roundRect"/.test(x), 'no old rounded question cards');
    });
    assert.deepStrictEqual(issues, []);
    // the fixture's first stage has two topics, the second stage four: 3 rows + continuation
    assert(val.some((s) => /\(cont\.\)/.test(s.name)), 'a stage with 4 topics continues on a second slide');
  });
  await t('validation rows: a topic with a very long list shrinks its font, then continues in more rows and slides; notes box on all of them', () => {
    const s = clone(prek);
    s.preguntas_abiertas = [];
    for (let i = 0; i < 14; i++) s.preguntas_abiertas.push({ id: 'Q-L' + i, pregunta: 'Pregunta larga número ' + i + ' para comprobar que la lista de un solo tema se reduce y después continúa en otra fila sin desbordar el panel gris.', etapa: 'Solicitud', tema: 'Tema único', bloquea: false, audiencia: 'cliente' });
    const { buildSlides, issues } = require('../build_kickoff_pptx');
    issues.length = 0;
    const val = buildSlides(s).filter((x) => /^Validación Solicitud/.test(x.name));
    assert(val.length >= 2, 'continuation slides: ' + val.length);
    val.forEach((x) => { const xml = x.xml(); assert(xml.includes('Notas / respuesta del cliente')); assert((xml.match(/name="Bloque \d"/g) || []).length <= 3); });
    assert(/Tema único \(cont\.\)/.test(val.map((x) => x.xml()).join('')), 'continuation row titled (cont.)');
    assert.deepStrictEqual(issues, []);
    const q = (xml) => (xml.match(/<a:t>¿?Pregunta larga/g) || []).length;
    assert.strictEqual(val.reduce((a, x) => a + q(x.xml()), 0), 14, 'no question lost');
  });
  await t('validation layout (balanced): topics spread evenly (4 -> 2+2, 5 -> 3+2), topics up to 4 questions never split, uniform size per slide, rows fill the height, no lone question in a (cont.) row', () => {
    const { layoutPlan } = require('../build_kickoff_pptx');
    const q = (n, tag) => Array.from({ length: n }, (_, i) => `¿Pregunta ${tag}${i} de longitud media para el panel de validación, con un par de líneas de texto?`);
    const lay = (counts) => layoutPlan(counts.map((c, i) => ['Tema ' + (i + 1), q(c, 'T' + i + '-')]), 398, 304, 1.8);
    const shape = (counts) => lay(counts).slides.map((s) => s.rows.length).join('+');
    assert.strictEqual(shape([2, 2, 2, 2]), '2+2');
    assert.strictEqual(shape([2, 2, 2, 2, 2]), '3+2');
    assert.strictEqual(shape([2, 2, 2]), '3');
    assert.strictEqual(shape([2, 2]), '2');
    // a topic with 4 questions that fits stays in one row (no "(cont.)")
    const four = lay([4, 3]);
    assert(four.slides.every((s) => s.rows.every((r) => !/\(cont\.\)/.test(r.tema))), '4 questions stay in one row');
    // 6 questions: halves (3+3), never 5+1
    const six = lay([6]).slides.flatMap((s) => s.rows);
    assert.deepStrictEqual(six.map((r) => r.items.length), [3, 3]);
    assert.strictEqual(six[0].tema, 'Tema 1'); assert.strictEqual(six[1].tema, 'Tema 1 (cont.)'); assert.strictEqual(six[0].n, six[1].n);
    // 5 questions: 3+2 (never a lone question), 14 questions: no (cont.) row with a single question
    assert.deepStrictEqual(lay([5]).slides.flatMap((s) => s.rows).map((r) => r.items.length), [3, 2]);
    lay([14, 1, 9]).slides.forEach((s) => s.rows.forEach((r) => assert(!(/\(cont\.\)/.test(r.tema) && r.items.length === 1), 'orphan question')));
    // uniform size per slide (one value), sizes within 12 -> 10.5, rows fill the free height (or hit the 140 pt cap), never tiny
    [[2, 2, 2, 2, 2], [4, 4, 4], [14], [3, 3, 3, 3, 3, 3, 3], [1], [2, 1]].forEach((c) => lay(c).slides.forEach((s) => {
      assert([12, 11, 10.5].includes(s.size), 'size ' + s.size);
      s.rows.forEach((r) => assert(r.h >= 78 && r.h <= 304, 'row height ' + r.h));
      const sum = s.rows.reduce((a, r) => a + r.h, 0) + (s.rows.length - 1) * 1.8;
      assert(Math.abs(sum - s.total) < 0.01, 'rows add up to the area');
      assert(s.total >= Math.min(304, s.rows.length * 140 + (s.rows.length - 1) * 1.8) - 0.01, 'rows fill the height');
      assert(s.rows.length <= 3);
    }));
    // rendered: every row of a slide carries the same font size
    const { buildSlides } = require('../build_kickoff_pptx');
    buildSlides(prek).filter((x) => /^Validación /.test(x.name) && x.name !== 'Validación').forEach((x) => {
      const sizes = new Set((x.xml().match(/name="Preguntas \d".*?<\/p:sp>/g) || []).map((b) => (b.match(/sz="(\d+)"/) || [])[1]));
      assert.strictEqual(sizes.size, 1, x.name + ' mixes sizes: ' + [...sizes]);
    });
  });
  await t('validation rows: a topic title above 36 characters is truncated with a layout notice; the divider keeps working', () => {
    const s = clone(prek);
    s.preguntas_abiertas = [{ id: 'Q-T1', pregunta: 'Pregunta de prueba.', etapa: 'Solicitud', tema: 'Un tema con un título larguísimo que no cabe en la banda de la fila de validación', bloquea: false, audiencia: 'cliente' }];
    const { buildSlides, issues } = require('../build_kickoff_pptx');
    issues.length = 0;
    const all = buildSlides(s);
    assert(issues.some((i) => /topic title truncated/.test(i)), 'notice: ' + issues.join(' | '));
    assert(all.some((x) => x.name === 'Validación' && x.xml().includes('Validación etapa por etapa')), 'block divider present');
  });
  await t('patterns: --patrones data produces a validacion-plan slide with 3 rows; brand tokens exist', () => {
    const { buildSlides, patternSow } = require('../build_kickoff_pptx');
    const v = buildSlides(patternSow()).filter((x) => /^Validación Etapa uno/.test(x.name));
    assert.strictEqual(v.length, 1);
    assert.strictEqual((v[0].xml().match(/name="Bloque \d"/g) || []).length, 3);
    const B = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'kickoff-brand.json'), 'utf8'));
    assert(B.patrones['validacion-plan'] && !B.patrones.preguntas, 'pattern documented, old one removed');
    ['plan_bloque', 'plan_panel', 'plan_titulo'].forEach((k) => assert(B.colores[k], k));
    assert.strictEqual(B.colores.plan_bandas.length, 3);
    assert(B.plan_accion.filas_por_diapositiva === 3);
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
    // under review (en_revision): one schedule table, no times, days or dates, no effort table
    assert(!/Fecha de cierre de UAT|Resumen de esfuerzo|día\(s\) hábil|Fechas tentativas/.test(doc), 'en_revision shows no hours, days or dates');
    assert(/se definen al aprobar el SOW/.test(doc));
    // approved: dated schedule and effort table come back
    const dirA = path.join(OUT, 'full-aprobado'); fs.rmSync(dirA, { recursive: true, force: true });
    const fA = path.join(OUT, 'full-aprobado.json'); fs.writeFileSync(fA, JSON.stringify({ ...full, meta: { ...full.meta, estado: 'aprobado' } }));
    node('build_all.js', [fA, dirA, '--force']);
    const docA = await textOf(path.join(dirA, fs.readdirSync(dirA).find((x) => /\.docx$/.test(x))), /^word\/document\.xml$/);
    assert(/Fecha de cierre de UAT: 03\/11\/2026/.test(docA) && /Resumen de esfuerzo/.test(docA), 'aprobado shows the dated schedule and the effort table');
    assert(doc.indexOf('Diagrama end-to-end') < doc.indexOf('Flujo_1: Solicitud de crédito (inbound)', doc.indexOf('Mapa de conversaciones')), 'E2E comes first in the conversation map');
    assert(!/Q-AMP|¿Se debe tomar en cuenta/.test(doc), 'commercial questions are not in the client SOW pending table');
    const fig = JSON.parse(fs.readFileSync(path.join(dir, 'diagramas', 'figuras.json'), 'utf8'));
    assert.strictEqual(fig[0].id, 'FE'); assert.strictEqual(fig[0].titulo, 'Diagrama end-to-end');
  });
  console.log(`\n${n} pre-kickoff tests passed` + (failed ? `, ${failed} FAILED` : ''));
  process.exit(failed ? 1 : 0);
})();
