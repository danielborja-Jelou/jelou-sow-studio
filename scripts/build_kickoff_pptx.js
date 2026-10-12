#!/usr/bin/env node
// Builds the PRE-KICKOFF deck (.pptx) from sow.json (meta.fase = "prekickoff" or any sow.json with the sections below) by injecting
// generated slides into assets/kickoff-template.pptx (theme, master, layouts, embedded Poppins, logos, icons decompiled from the
// Jelou kickoff deck). Slide patterns and tokens: assets/kickoff-brand.json, references/prekickoff.md.
//
// Usage: node build_kickoff_pptx.js sow.json out.pptx [--diagramas dir]
//        node build_kickoff_pptx.js --patrones assets/kickoff-template.pptx     (re-creates the placeholder pattern slides)
//
// Long lists never overflow: every card/table is measured with the Poppins metrics and split into continuation slides.
const fs = require('fs');
const path = require('path');
const C = require('./lib/common');
const F = require('./lib/figuras');
const D = require('./lib/diagram');
const K = require('./lib/pptx');
const { Slide, runs, lineCount, trunc, COL, BRAND, LH } = K;
const arr = C.arr;
const M = BRAND.margen;
const TEMPLATE = path.join(__dirname, '..', 'assets', 'kickoff-template.pptx');
const ICON = (n) => `icon-${n}.png`;

// ---------- small helpers ----------
const plain = (s) => String(s == null ? '' : s).replace(/\*/g, '');
const pending = (s) => C.hasPending(s);
const nonEmpty = (s) => s != null && String(s).trim() !== '';
const radius = (w, h, r = 10.8) => (r / Math.min(w, h)) * 100000;
const issues = [];
const warn = (slide, msg) => issues.push(`${slide}: ${msg}`);
const normQ = (s) => C.normTxt(s);

function paragraphs(items, { size = 12, color = COL.texto, after = 4, bullet = true, font = 'texto' } = {}) {
  return items.map((t) => ({ runs: runs(t, { size, color, font }), bullet: bullet ? 11 : 0, after }));
}
const bulletsHeight = (items, width, size, after = 4) => items.reduce((a, t) => a + lineCount(plain(t), width - 11, size, 'texto') * size * LH + after, 0);
// Shrinks the font until the bullets fit; returns {size, fits}
function fitSize(items, width, avail, sizes, after = 4) {
  for (const s of sizes) if (bulletsHeight(items, width, s, after) <= avail) return { size: s, fits: true };
  return { size: sizes[sizes.length - 1], fits: false };
}
// Splits a list into pages that each fit `avail` points at the given size.
function paginate(items, width, avail, size, after = 4) {
  const pages = []; let cur = [], h = 0;
  for (const t of items) {
    const th = lineCount(plain(t), width - 11, size, 'texto') * size * LH + after;
    if (cur.length && h + th > avail) { pages.push(cur); cur = []; h = 0; }
    cur.push(t); h += th;
  }
  if (cur.length) pages.push(cur);
  return pages.length ? pages : [[]];
}

// ---------- slide frames ----------
function header(s, eyebrow, title, subtitle) {
  s.pic('logo-turquesa.png', 834, 32, 72, 72 * BRAND.logo.relacion, 'Jelou');
  s.line(54, 82, 74, 82, { w: 1.5 });
  s.text(83, 76, 600, 16, [{ runs: runs(String(eyebrow).toUpperCase(), { size: 11, font: 'titulos', color: COL.turquesa, spc: 200 }) }], { name: 'Eyebrow' });
  let size = 28, lines = lineCount(plain(title), 737, size, 'titulos');
  if (lines > 2) { size = 24; lines = lineCount(plain(title), 737, size, 'titulos'); }
  if (lines > 2) { title = trunc(plain(title), 90); lines = 2; warn(s.name, 'title truncated'); }
  const th = lines * size * LH;
  s.text(54, 104, 737, th, [{ runs: runs(title, { size, font: 'titulos', color: COL.tinta }) }], { name: 'Título' });
  let y = 104 + th;
  if (subtitle) { s.text(54, y + 6, 852, 16, [{ runs: runs(subtitle, { size: 12, font: 'medio', color: COL.petroleo }) }], { name: 'Subtítulo' }); y += 28; }
  return Math.max(lines === 1 ? M.contenido_y : M.contenido_y_titulo2, subtitle ? y + 18 : 0);
}
function newContent(name, eyebrow, title, subtitle) { const s = new Slide(COL.fondo, name); const y0 = header(s, eyebrow, title, subtitle); return { s, y0 }; }

// card with optional icon; returns body box {x, y, w, h}
function card(s, x, y, w, h, o = {}) {
  s.shape(x, y, w, h, { adj: radius(w, h), fill: o.fill || COL.blanco, line: o.line === undefined ? COL.borde_tarjeta : o.line, lineW: 0.75, name: 'Tarjeta' });
  let tx = x + 20;
  if (o.icon) {
    s.shape(x + 20, y + 18, 30, 30, { adj: 50000, line: COL.turquesa, lineW: 1, name: 'Icono marco' });
    s.pic(ICON(o.icon), x + 27, y + 25, 16, 16, o.icon);
    tx = x + 60;
  }
  if (o.title) s.text(tx, y + 18, w - (tx - x) - 12, 30, [{ runs: runs(o.title, { size: o.titleSize || 14, font: 'titulos', color: o.titleColor || COL.tinta }) }], { anchor: 'ctr', name: 'Título de tarjeta' });
  return { x: x + 20, y: y + 61, w: w - 40, h: h - 61 - 14 };
}

// ---------- slide builders ----------
function cover(sow, pk) {
  const m = sow.meta || {};
  const s = new Slide(COL.tinta, 'Portada');
  s.pic('logo-blanco.png', 54, 144, 144, 144 * BRAND.logo.relacion, 'Jelou');
  const title = pk.portada_titulo || `${m.cliente || 'Cliente'} · ${m.proyecto || 'Proyecto'}`;
  let size = 45, lines = lineCount(title, 852, size, 'titulos');
  if (lines > 2) { size = 34; lines = lineCount(title, 852, size, 'titulos'); }
  const th = lines * size * LH;
  s.text(54, 206, 852, th, [{ runs: runs(title, { size, font: 'titulos', color: COL.blanco, emph: COL.turquesa }) }], { name: 'Título' });
  const sub = pk.subtitulo || 'Pre-kickoff: validamos el alcance y cerramos lo que falta antes del SOW';
  const sh = lineCount(sub, 640, 18, 'medio') * 18 * LH;
  s.text(54, 206 + th + 8, 640, sh, [{ runs: runs(sub, { size: 18, font: 'medio', color: COL.menta }) }], { name: 'Subtítulo' });
  const canal = pk.canal || (arr(sow.agentes).find((a) => a.canal) || {}).canal || 'WhatsApp';
  let x = 54; const py = 206 + th + 8 + sh + 22;
  for (const [lab, val] of [['CLIENTE', m.cliente || 'POR COMPLETAR'], ['CANAL', canal]]) {
    const w = Math.ceil(D.textWidth(`${lab}  ${val}`, 11, true)) + 30;
    s.shape(x, py, w, 30, { adj: 50000, line: COL.celeste, lineW: 1, paras: [{ runs: [...runs(`${lab}  `, { size: 11, font: 'titulos', color: COL.menta }), ...runs(val, { size: 11, font: 'titulos', color: COL.celeste })], align: 'ctr' }], name: 'Pastilla' });
    x += w + 13;
  }
  s.text(54, 486, 400, 22, [{ runs: runs(`Fecha: ${pk.fecha_sesion || '______'}`, { size: 12, font: 'texto', color: COL.turquesa }) }], { name: 'Fecha' });
  s.text(618, 486, 288, 19, [{ runs: runs(pk.lema || 'jelou.ai', { size: 12, color: COL.menta }), align: 'r' }], { name: 'Marca' });
  return [s];
}

function agenda(pk, hasOutbound) {
  const items = pk.agenda || [
    { titulo: 'Equipo', texto: 'Roles, contactos y canales de comunicación.', icono: 'users' },
    { titulo: 'Contexto y alcance', texto: 'Objetivos, qué cubre Jelou y qué queda de otros.', icono: 'target' },
    { titulo: 'Flujo E2E', texto: `Actores y diagrama de punta a punta${hasOutbound ? ', inbound y outbound' : ''}.`, icono: 'workflow' },
    { titulo: 'Validación', texto: 'Preguntas clave de cada etapa del flujo.', icono: 'comments' },
    { titulo: 'Integraciones', texto: 'APIs, responsables, credenciales y ambiente de pruebas.', icono: 'plug' },
    { titulo: 'Próximos pasos', texto: 'Supuestos, pendientes, cronograma y firma del SOW.', icono: 'calendar' },
  ];
  const { s } = newContent('Agenda', 'Hoja de ruta', pk.agenda_titulo || 'Agenda del pre-kickoff');
  items.slice(0, 6).forEach((it, i) => {
    const x = 54 + (i % 3) * 291, y = 169 + Math.floor(i / 3) * 176;
    const b = card(s, x, y, 270, 155, { icon: it.icono || 'checklist', title: `${String(i + 1).padStart(2, '0')} · ${it.titulo}` });
    s.text(b.x, b.y, b.w, b.h, paragraphs([it.texto], { size: 12, bullet: false }), { name: 'Texto' });
  });
  return [s];
}

function divider(name, eyebrow, title, subtitle) {
  const s = new Slide(COL.tinta, name);
  s.pic('logo-turquesa.png', 834, 32, 72, 72 * BRAND.logo.relacion, 'Jelou');
  s.line(54, 230, 74, 230, { w: 1.5 });
  s.text(83, 223, 600, 18, [{ runs: runs(String(eyebrow).toUpperCase(), { size: 11, font: 'titulos', color: COL.turquesa, spc: 200 }) }], { name: 'Eyebrow' });
  const lines = lineCount(title, 792, 40, 'titulos');
  s.text(54, 252, 792, lines * 40 * LH, [{ runs: runs(title, { size: 40, font: 'titulos', color: COL.blanco, emph: COL.turquesa }) }], { name: 'Título' });
  if (subtitle) s.text(54, 252 + lines * 40 * LH + 8, 720, 29, [{ runs: runs(subtitle, { size: 14, font: 'medio', color: COL.menta }) }], { name: 'Subtítulo' });
  return s;
}

function teamSlide(sow, pk) {
  const eq = arr(sow.equipo);
  const isJ = (e) => /jelou/i.test(e.organizacion || '');
  const rowsOf = (list, defaults) => {
    const rows = list.map((e) => ({ rol: e.cargo || e.rol || 'Rol', nombre: nonEmpty(e.nombre) && !pending(e.nombre) ? `${e.nombre}${e.correo && !pending(e.correo) ? ' · ' + e.correo : ''}` : '' }));
    defaults.forEach((d) => { if (!rows.some((r) => normQ(r.rol).includes(normQ(d.split(' ')[0])))) rows.push({ rol: d, nombre: '' }); });
    return rows.slice(0, 8);
  };
  const jel = rowsOf(eq.filter(isJ), ['Account Manager', 'Project Manager', 'Líder técnico / integrador', 'Soporte']);
  const cli = rowsOf(eq.filter((e) => !isJ(e)), pk.roles_cliente || ['Sponsor / decisor', 'Owner técnico (APIs)', 'Negocio / producto']);
  const { s, y0 } = newContent('Equipo', 'Bloque 1', 'Equipo de trabajo', 'Completar en vivo con nombres y correos de ambas partes.');
  const tbl = (x, head, rows) => {
    const n = rows.length + 1, rh = Math.min(32.4, 190 / n);
    s.table(x, y0 + 14, [215.6, 196.0], [
      { h: rh, fill: COL.tinta, cells: [{ runs: runs(head, { size: 10, font: 'titulos', color: COL.blanco }) }, { runs: runs('Nombre · correo', { size: 10, font: 'titulos', color: COL.blanco }) }] },
      ...rows.map((r, i) => ({ h: rh, fill: i % 2 ? COL.menta : COL.blanco, cells: [{ runs: runs(r.rol, { size: 11, color: COL.texto }) }, { runs: runs(r.nombre, { size: 11, color: COL.texto }) }] })),
    ]);
    return y0 + 14 + rh * n;
  };
  const e1 = tbl(54, 'Jelou', jel), e2 = tbl(494, sow.meta.cliente || 'Cliente', cli);
  const by = Math.max(e1, e2) + 22;
  s.shape(54, by, 852, 505 - by - 10 > 60 ? 76 : 60, { adj: radius(852, 76), fill: COL.menta, name: 'Caja de roles' });
  s.text(76, by + 12, 809, 56, paragraphs(['AM: mejoras, precio e integraciones adicionales.', 'PM: implementación hasta el acta de cierre.', 'Soporte: postproducción, incidentes y continuidad.'], { size: 11, after: 0, bullet: false }).map((p, i, a) => p), { name: 'Roles' });
  return [s];
}

function compare(sow, pk) {
  const cx = pk.contexto || {};
  const hoy = arr(cx.hoy).length ? cx.hoy : ['POR COMPLETAR: situación actual del cliente (qué hace hoy y dónde duele).'];
  const con = arr(cx.con_jelou).length ? cx.con_jelou : arr((sow.objetivos || {}).especificos).slice(0, 4);
  const { s, y0 } = newContent('Contexto', cx.eyebrow || 'Bloque 2 · Contexto', cx.titulo || (sow.meta || {}).proyecto || 'Contexto del proyecto');
  const y = Math.max(y0, 203), h = 209;
  [[54, 'HOY', hoy, COL.blanco, COL.naranja, 'alert'], [494, 'CON JELOU', con, COL.menta, COL.turquesa, 'check-circle']].forEach(([x, lab, items, fill, color, icon]) => {
    const b = card(s, x, y, 412, h, { fill, icon, title: lab, titleSize: 12, titleColor: color });
    const f = fitSize(items, b.w, b.h, [13, 12, 11, 10]);
    if (!f.fits) warn('Contexto', `${lab}: text too long for the card`);
    s.text(b.x, b.y, b.w, b.h, paragraphs(items, { size: f.size }), { name: lab });
  });
  if (nonEmpty(cx.dato)) s.text(54, y + h + 21, 852, 29, [{ runs: runs(cx.dato, { size: 12, color: COL.petroleo }) }], { name: 'Dato' });
  return [s];
}

function stagesOf(sow, pk) {
  if (arr((pk.etapas || {}).items).length) return pk.etapas.items;
  const ag = arr(sow.agentes)[0];
  if (!ag) return [];
  const names = []; arr(ag.pasos).forEach((p) => { const g = p.grupo || p.fase || p.etapa; if (g && !names.includes(g)) names.push(g); });
  return names.slice(0, 6).map((n) => ({ nombre: n, texto: '', jelou: true }));
}
function stagesSlide(sow, pk) {
  const et = pk.etapas || {};
  const items = stagesOf(sow, pk).slice(0, 6);
  if (!items.length) return [];
  const { s, y0 } = newContent('Alcance por etapas', et.eyebrow || 'Bloque 2 · Alcance', et.titulo || 'Alcance por etapas del proceso');
  const n = items.length, gap = 30, w = Math.min(146, (852 - gap * (n - 1)) / n), y = Math.max(y0, 203), h = 166;
  const size = n > 5 ? 10 : 11;
  items.forEach((it, i) => {
    const x = 54 + i * (w + gap), dark = it.jelou !== false;
    s.shape(x, y, w, h, { adj: radius(w, h, 14), fill: dark ? COL.tinta : COL.blanco, line: dark ? null : COL.borde_tarjeta, lineW: 0.75, name: 'Etapa' });
    s.text(x + 16, y + 15, w - 30, 22, [{ runs: runs(String(i + 1).padStart(2, '0'), { size: 14, color: COL.turquesa }) }], { name: 'Número' });
    const nl = lineCount(plain(it.nombre), w - 30, 14, 'titulos');
    s.text(x + 16, y + 40, w - 30, nl * 14 * LH, [{ runs: runs(it.nombre, { size: nl > 1 ? 12 : 14, font: 'titulos', color: dark ? COL.blanco : COL.tinta }) }], { name: 'Nombre' });
    const ty = y + 40 + nl * 14 * LH + 6;
    const avail = y + h - 12 - ty;
    if (lineCount(plain(it.texto), w - 30, size, 'texto') * size * LH > avail) warn('Etapas', `stage ${i + 1} text may overflow`);
    s.text(x + 16, ty, w - 30, avail, [{ runs: runs(it.texto || '', { size, color: dark ? COL.menta : COL.texto }) }], { name: 'Texto' });
    if (i < n - 1) s.line(x + w + 4, y + 83, x + w + gap - 4, y + 83, { arrow: true, w: 1.5 });
  });
  const jn = items.filter((i) => i.jelou !== false).length;
  const lab1 = et.nota_jelou || (jn === 1 ? 'Etapa 1: Jelou orquesta en WhatsApp' : `Etapas 1–${jn}: Jelou orquesta en WhatsApp`);
  const w1 = Math.ceil(D.textWidth(lab1, 11, true)) + 30;
  s.shape(54, y + h + 28, w1, 29, { adj: 50000, fill: COL.tinta, paras: [{ runs: runs(lab1, { size: 11, font: 'titulos', color: COL.blanco }), align: 'ctr' }], name: 'Leyenda Jelou' });
  if (jn < n) {
    const lab2 = et.nota_otros || (jn + 1 === n ? `Etapa ${n}: otras plataformas y el cliente` : `Etapas ${jn + 1}–${n}: otras plataformas y el cliente`);
    s.shape(54 + w1 + 14, y + h + 28, Math.ceil(D.textWidth(lab2, 11, true)) + 30, 29, { adj: 50000, line: COL.petroleo, lineW: 1, paras: [{ runs: runs(lab2, { size: 11, font: 'titulos', color: COL.petroleo }), align: 'ctr' }], name: 'Leyenda otros' });
  }
  return [s];
}

// grid of icon cards (components, actors): up to 6 per slide
function gridSlides(name, eyebrow, title, items, defaultIcon) {
  const out = [];
  for (let p = 0; p * 6 < items.length; p++) {
    const { s } = newContent(name, eyebrow, title + (p ? ' (cont.)' : ''));
    items.slice(p * 6, p * 6 + 6).forEach((it, i) => {
      const x = 54 + (i % 3) * 291, y = 169 + Math.floor(i / 3) * 176;
      const b = card(s, x, y, 270, 155, { fill: it.destacado ? COL.menta : COL.blanco, icon: it.icono || defaultIcon, title: trunc(it.nombre, 30) });
      const f = fitSize([it.texto || ''], b.w + 11, b.h, [12, 11, 10], 0);
      if (!f.fits) warn(name, `${it.nombre}: text too long for the card`);
      s.text(b.x, b.y, b.w, b.h, paragraphs([it.texto || ''], { size: f.size, bullet: false }), { name: 'Texto' });
    });
    out.push(s);
  }
  return out;
}

// ---------- end-to-end flow (native shapes when it has up to 6 layers) ----------
function layoutFlow(spec, area) {
  const nodes = spec.pasos, byId = new Map(nodes.map((n) => [n.id, n]));
  const preds = new Map(nodes.map((n) => [n.id, []]));
  nodes.forEach((n) => arr(n.siguiente).forEach((e) => { if (byId.has(e.a) && e.a !== n.id) preds.get(e.a).push(n.id); }));
  const layer = new Map(); const order = [];
  const visit = (id, stack = new Set()) => {
    if (layer.has(id)) return layer.get(id);
    if (stack.has(id)) return 0; stack.add(id);
    const ps = preds.get(id);
    const l = ps.length ? Math.max(...ps.map((p) => visit(p, stack))) + 1 : 0;
    stack.delete(id); layer.set(id, l); return l;
  };
  nodes.forEach((n) => visit(n.id));
  const L = Math.max(...layer.values()) + 1;
  if (L > 6) return null;
  const row = new Map(); const used = new Map(); // layer -> Set rows
  const take = (l, r) => { const u = used.get(l) || new Set(); used.set(l, u); let k = 0, c = r; while (u.has(c)) { k++; c = r + (k % 2 ? Math.ceil(k / 2) : -Math.ceil(k / 2)); } u.add(c); return c; };
  const sorted = nodes.slice().sort((a, b) => layer.get(a.id) - layer.get(b.id));
  let srcRow = 0;
  for (const n of sorted) {
    if (!row.has(n.id)) row.set(n.id, take(layer.get(n.id), preds.get(n.id).length ? 0 : srcRow++));
    arr(n.siguiente).forEach((e, k) => {
      if (!byId.has(e.a) || row.has(e.a)) return;
      row.set(e.a, take(layer.get(e.a), row.get(n.id) + (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2))));
    });
  }
  // merge nodes with several predecessors sit between them
  sorted.forEach((n) => { const ps = preds.get(n.id); if (ps.length > 1) { const rs = ps.map((p) => row.get(p)); const r = rs.reduce((a, b) => a + b, 0) / rs.length; row.set(n.id, r); } });
  const rmin = Math.min(...row.values()), rmax = Math.max(...row.values());
  const colW = area.w / L, boxW = Math.min(150, colW - 24), boxH = 72;
  const step = rmax > rmin ? Math.min(92, (area.h - boxH - 18) / (rmax - rmin)) : 0;
  const top = area.y + (area.h - (boxH + step * (rmax - rmin))) / 2 - 8;
  const pos = new Map();
  nodes.forEach((n) => pos.set(n.id, { x: area.x + layer.get(n.id) * colW + (colW - boxW) / 2, y: top + (row.get(n.id) - rmin) * step, w: boxW, h: boxH }));
  return { pos, boxH };
}
function flowSlide(sow, pk, diagDir) {
  const e2e = F.buildE2E(sow);
  if (!e2e) return [];
  const cfg = pk.e2e || {};
  const { s, y0 } = newContent('Flujo E2E', cfg.eyebrow || 'Bloque 3 · Flujo de punta a punta', cfg.titulo || 'Flujo de punta a punta');
  const area = { x: 54, y: Math.max(y0, 169) + 6, w: 852, h: 270 };
  const lay = layoutFlow(e2e.spec, area);
  const byId = new Map(e2e.spec.pasos.map((n) => [n.id, n]));
  if (lay) {
    for (const n of e2e.spec.pasos) arr(n.siguiente).forEach((e) => {
      const a = lay.pos.get(n.id), b = lay.pos.get(e.a); if (!a || !b) return;
      s.line(a.x + a.w, a.y + a.h / 2, b.x, b.y + b.h / 2, { arrow: true, color: COL.petroleo, w: 1.25 });
      if (e.si) s.text(b.x - 6, b.y - 15, b.w + 12, 14, [{ runs: runs(trunc(e.si, 34), { size: 9, font: 'medio', color: COL.petroleo }), align: 'ctr' }], { name: 'Etiqueta' });
    });
    for (const n of e2e.spec.pasos) {
      const p = lay.pos.get(n.id), dark = n.tipo === 'fin', ase = n.tipo === 'asesor';
      let size = 12; while (size > 9 && lineCount(n.diagrama, p.w - 14, size, 'titulos') * size * LH > p.h - 6) size--;
      s.shape(p.x, p.y, p.w, p.h, { adj: radius(p.w, p.h, 12), fill: dark ? COL.tinta : ase ? COL.blanco : COL.menta, line: dark ? null : ase ? COL.petroleo : COL.turquesa, lineW: 1.25, paras: [{ runs: runs(n.diagrama, { size, font: 'titulos', color: dark ? COL.blanco : COL.tinta }), align: 'ctr' }], inset: 7, name: 'Hito' });
      if (n.tipo === 'usuario' && n.sub) s.text(p.x - 8, p.y + p.h + 3, p.w + 16, 14, [{ runs: runs(n.sub, { size: 10, font: 'medio', color: COL.petroleo }), align: 'ctr' }], { name: 'Entrada' });
    }
  } else {
    // more than 6 layers: the engine's own picture (the same figure as the Word)
    const png = path.join(diagDir || '', 'FE.png');
    const buf = fs.existsSync(png) ? fs.readFileSync(png) : D.renderDiagramPng(e2e.spec).png;
    const dims = { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    const sc = Math.min(area.w / dims.w, area.h / dims.h);
    s.pic({ name: 'e2e.png', buf }, area.x + (area.w - dims.w * sc) / 2, area.y, dims.w * sc, dims.h * sc, 'Diagrama end-to-end');
    warn('Flujo E2E', 'more than 6 layers: the end-to-end diagram is embedded as a picture (small text); shorten agentes[].resumen_cliente');
  }
  if (nonEmpty(cfg.nota)) s.text(54, 479, 852, 29, [{ runs: runs(cfg.nota, { size: 12, font: 'titulos', color: COL.tinta }) }], { name: 'Nota' });
  return [s];
}

// ---------- tables ----------
function tableSlides(name, eyebrow, title, subtitle, cols, head, rows, opts = {}) {
  const inner = cols.map((c) => c - 16);
  const probe0 = newContent(name, eyebrow, title, subtitle).y0;
  const avail0 = (opts.noteH ? 470 - opts.noteH : 480) - probe0 - 8 - 28;
  const total = (z) => rows.reduce((a, r) => a + Math.max(28, Math.max(...r.map((c, i) => lineCount(plain(c), inner[i], z, 'texto'))) * z * LH + 7.2), 0);
  const size = [11, 10, 9.5].find((z) => total(z) <= avail0) || 10;
  const rh = (r) => Math.max(28, Math.max(...r.map((c, i) => lineCount(plain(c), inner[i], size, 'texto'))) * size * LH + 7.2);
  const out = [];
  let page = []; let used = 0;
  const flush = () => {
    const { s, y0 } = newContent(name, eyebrow, title + (out.length ? ' (cont.)' : ''), out.length ? '' : subtitle);
    const avail = (opts.noteH ? 470 - opts.noteH : 480) - y0;
    s.table(54, y0 + 4, cols, [
      { h: 28, fill: COL.tinta, cells: head.map((h) => ({ runs: runs(h, { size: 10, font: 'titulos', color: COL.blanco }) })) },
      ...page.map((r, i) => ({ h: rh(r), fill: i % 2 ? COL.menta : COL.blanco, cells: r.map((c, k) => ({ runs: runs(c, { size, color: k === 0 && opts.boldFirst ? COL.tinta : COL.texto, font: k === 0 && opts.boldFirst ? 'titulos' : 'texto' }) })) })),
    ]);
    s._tableBottom = y0 + 4 + 28 + page.reduce((a, r) => a + rh(r), 0);
    out.push(s); page = []; used = 0;
  };
  const probe = newContent(name, eyebrow, title, subtitle).y0;
  const avail = (opts.noteH ? 470 - opts.noteH : 480) - probe - 8 - 28;
  rows.forEach((r) => { const h = rh(r); if (page.length && used + h > avail) flush(); page.push(r); used += h; });
  if (page.length || !out.length) flush();
  if (opts.note) { const last = out[out.length - 1]; const ny = Math.min(Math.max(last._tableBottom + 14, 440), 470); last.text(54, ny, 852, 40, [{ runs: runs(opts.note, { size: 11, color: COL.petroleo }) }], { name: 'Nota' }); }
  return out;
}

// ---------- validation by stage ----------
function questionStages(sow, pk) {
  const order = stagesOf(sow, pk).map((e) => e.nombre);
  const qs = arr(sow.preguntas_abiertas).filter((q) => (!q.audiencia || q.audiencia === 'cliente') && q.tipo !== 'equipo');
  const stages = new Map();
  order.forEach((n) => stages.set(normQ(n), { nombre: n, temas: new Map() }));
  qs.forEach((q) => {
    const k = normQ(q.etapa || 'General');
    if (!stages.has(k)) stages.set(k, { nombre: q.etapa || 'General', temas: new Map() });
    const st = stages.get(k), t = q.tema || 'Preguntas';
    if (!st.temas.has(t)) st.temas.set(t, []);
    st.temas.get(t).push(q.pregunta);
  });
  return [...stages.values()].filter((st) => st.temas.size);
}
function validationSlides(sow, pk) {
  const out = [];
  const stages = questionStages(sow, pk);
  const icons = ['shield', 'id-card', 'gauge', 'link', 'face', 'building', 'chat', 'database', 'send', 'file'];
  stages.forEach((st, si) => {
    const cfgStage = arr((pk.etapas || {}).items).find((e) => normQ(e.nombre) === normQ(st.nombre)) || {};
    const temas = [...st.temas.entries()];
    const cols = temas.length > 2 ? 3 : 2;
    const cw = cols === 3 ? 270 : 415, bodyW = cw - 40, bodyH = cols === 3 ? 133 : 126, nh = cols === 3 ? 112 : 119;
    // cards: shrink the text (12 -> 11 -> 10.5) before splitting; a theme that still does not fit becomes continuation cards
    const sizeFor = (items) => [12, 11, 10.5].find((z) => paginate(items, bodyW, bodyH, z).length === 1) || 10.5;
    let cards = [];
    temas.forEach(([tema, items], ti) => { const z = sizeFor(items); paginate(items, bodyW, bodyH, z).forEach((pg, k) => cards.push({ tema: tema + (k ? ' (cont.)' : ''), items: pg, size: z, icon: icons[(si + ti) % icons.length] })); });
    for (let p = 0; p * cols < cards.length; p++) {
      const part = cards.slice(p * cols, p * cols + cols);
      const { s, y0 } = newContent(`Validación ${st.nombre}`, `Validación · etapa ${si + 1}${p ? ' (cont.)' : ''}`, cfgStage.titulo_validacion || st.nombre);
      const y = Math.max(y0, 169), ch = cols === 3 ? 205 : 198;
      part.forEach((c, i) => {
        const x = 54 + i * (cw + 21);
        const b = card(s, x, y, cw, ch, { icon: c.icon, title: trunc(c.tema, cols === 3 ? 26 : 44) });
        s.text(b.x, b.y, b.w, ch - 61 - 6, paragraphs(c.items, { size: c.size }), { name: 'Preguntas' });
      });
      const ny = y + ch + 18;
      s.shape(54, ny, 852, nh, { adj: radius(852, nh), fill: COL.menta, name: 'Notas' });
      s.text(72, ny + 11, 816, nh - 20, [{ runs: runs('Notas / respuesta del cliente:', { size: 11, font: 'medio', color: COL.petroleo }) }], { name: 'Notas' });
      out.push(s);
    }
  });
  return out;
}

// ---------- pending items, risks, next steps ----------
function pendingSlides(sow, pk) {
  const pd = pk.pendientes || {};
  const docItems = arr(pd.documento).length ? pd.documento : [
    ...(arr(sow.equipo).some((e) => pending(e.nombre)) ? ['Equipo de trabajo sin nombres.'] : []),
    ...(arr((sow.alcance || {}).incluido_usuario).length ? [] : ['Funcionalidades de back office y de usuario sin detallar.']),
    ...(arr(sow.pruebas).length ? [] : ['Criterios de aceptación por escribir (base del plan de pruebas).']),
    'Días hábiles por entregable y firma del cronograma.',
  ];
  const cliItems = arr(pd.cliente).length ? pd.cliente : arr(sow.dependencias_cliente).map((d) => d.item);
  const amps = C.ampliaciones(sow).filter((a) => a.estado === 'por_decidir');
  const chg = arr(sow.cambios_respecto_preventa);
  const comItems = [...amps.map((a) => `${a.descripcion}: sujeto a evaluación comercial (aprobación de Comercial y cobro adicional).`), ...chg.map((c) => `A confirmar: ${c.tema}.`)];
  const cardsDef = [{ t: 'Del documento', icon: 'file', items: docItems }, { t: 'Del cliente', icon: 'plug', items: cliItems }];
  if (comItems.length) cardsDef.push({ t: 'Por evaluar', icon: 'alert', items: comItems });
  const n = cardsDef.length, cw = n === 3 ? 270 : 415, bodyW = cw - 40, bodyH = 331 - 61 - 14;
  const pages = cardsDef.map((c) => paginate(c.items, bodyW, bodyH, 12));
  const out = [];
  for (let p = 0; p < Math.max(...pages.map((x) => x.length)); p++) {
    const { s, y0 } = newContent('Pendientes', 'Pendientes', 'Lo que falta para cerrar el SOW' + (p ? ' (cont.)' : ''));
    cardsDef.forEach((c, i) => {
      const items = pages[i][p] || (p === 0 ? [] : null);
      if (!items) return;
      const x = 54 + i * (cw + 21), y = Math.max(y0, 169);
      const b = card(s, x, y, cw, 331, { icon: c.icon, title: c.t });
      s.text(b.x, b.y, b.w, b.h, paragraphs(items, { size: 12 }), { name: c.t });
    });
    out.push(s);
  }
  return out;
}

function riskSlides(sow) {
  const rs = arr(sow.riesgos);
  if (!rs.length) return [];
  const out = [];
  for (let p = 0; p * 6 < rs.length; p++) {
    const { s, y0 } = newContent('Riesgos', 'Riesgos a revisar', 'Lo que puede mover el cronograma' + (p ? ' (cont.)' : ''));
    rs.slice(p * 6, p * 6 + 6).forEach((r, i) => {
      const x = 54 + (i % 2) * 437, y = Math.max(y0, 169) + Math.floor(i / 2) * 118;
      s.shape(x, y, 415, 96, { adj: radius(415, 96), fill: COL.fondo_alerta, name: 'Riesgo' });
      s.pic(ICON('alert'), x + 18, y + 16, 22, 22, 'alerta');
      const m = /^(.+?[.:])\s+(.*)$/.exec(String(r.riesgo || ''));
      const lead = m ? m[1] : String(r.riesgo || ''), rest = [m ? m[2] : '', r.mitigacion ? `Mitigación: ${r.mitigacion}` : ''].filter(Boolean).join(' ');
      let size = 12; const w = 347;
      while (size > 10 && lineCount(`${lead} ${rest}`, w, size, 'texto') * size * LH > 74) size--;
      const txt = lineCount(`${lead} ${rest}`, w, size, 'texto') * size * LH > 74 ? trunc(rest, 120) : rest;
      s.text(x + 50, y + 12, w, 74, [{ runs: [...runs(lead + ' ', { size, font: 'titulos', color: COL.tinta }), ...runs(txt, { size, color: COL.texto })] }], { name: 'Texto de riesgo' });
    });
    out.push(s);
  }
  return out;
}

function nextSteps(sow, pk) {
  const hs = arr((sow.cronograma || {}).hitos);
  const sched = C.scheduleDates(sow.cronograma || {});
  const defaults = [
    { nombre: 'Planificación y alcance', descripcion: 'Cerrar supuestos y emitir el SOW para firma.', who: 'Jelou + cliente' },
    { nombre: 'Construcción', descripcion: 'Flujos, integraciones y componentes del alcance.', who: 'Jelou' },
    { nombre: 'Pruebas internas', descripcion: 'Test plan a partir de los criterios de aceptación.', who: 'Jelou' },
    { nombre: 'Pruebas del cliente (UAT)', descripcion: 'El cliente prueba dentro de las fechas del cronograma.', who: 'Cliente' },
    { nombre: 'Producción y estabilización', descripcion: 'Primeros usuarios y acta de cierre.', who: 'Jelou + cliente' },
  ];
  const rows = hs.length ? hs.map((h, i) => {
    const k = C.milestoneKind(h), r = sched[i];
    const when = r && r.inicio ? (h.dias_habiles > 1 ? `${C.fmtShort(r.inicio)} a ${C.fmtShort(r.fin)}` : C.fmtShort(r.inicio)) : `${h.dias_habiles} día(s) hábil(es)`;
    return { nombre: h.nombre, descripcion: `${h.descripcion || h.entregable || ''} · ${when}`, who: h.responsable || (k === 'uat' ? 'Cliente' : k === 'pruebas_internas' ? 'Jelou' : 'Jelou') };
  }) : defaults;
  const sub = hs.length && sow.cronograma.inicio ? 'Fechas en días hábiles calculadas del cronograma propuesto.' : 'El cronograma arranca con la firma del SOW; los días hábiles se confirman en el SOW.';
  const { s, y0 } = newContent('Próximos pasos', 'Bloque 6', 'Entregables y próximos pasos', sub);
  const hasUat = hs.length ? C.testMilestones(sow).uat.length > 0 : true;
  const clause = hasUat ? C.UAT_CLAUSE : '';
  const clauseH = clause ? lineCount(clause, 816, 11, 'texto') * 11 * LH + 20 : 0;
  const top = y0 + 8, avail = 500 - top - (clause ? clauseH + 14 : 0);
  const rh = Math.min(45, avail / rows.length);
  rows.slice(0, 9).forEach((r, i) => {
    const y = top + i * rh;
    if (i) s.line(54, y, 906, y, { color: COL.linea_gris, w: 0.75 });
    s.text(54, y, 36, rh, [{ runs: runs(String(i + 1).padStart(2, '0'), { size: 14, color: COL.turquesa }) }], { anchor: 'ctr', name: 'Número' });
    s.text(97, y, 215, rh, [{ runs: runs(r.nombre, { size: 13, font: 'titulos', color: COL.tinta }) }], { anchor: 'ctr', name: 'Hito' });
    const size = lineCount(plain(r.descripcion), 400, 12, 'texto') * 12 * LH > rh ? 10 : 12;
    s.text(325, y, 405, rh, [{ runs: runs(r.descripcion, { size, color: COL.texto }) }], { anchor: 'ctr', name: 'Descripción' });
    const pw = Math.ceil(D.textWidth(r.who, 10, true)) + 24;
    s.shape(906 - pw, y + (rh - 23) / 2, pw, 23, { adj: 50000, line: COL.turquesa, lineW: 1, paras: [{ runs: runs(r.who, { size: 10, font: 'titulos', color: COL.petroleo }), align: 'ctr' }], name: 'Responsable' });
  });
  if (clause) {
    const y = 500 - clauseH;
    s.shape(54, y, 852, clauseH, { adj: radius(852, clauseH), fill: COL.fondo_alerta, name: 'Regla de UAT' });
    s.text(72, y + 10, 816, clauseH - 14, [{ runs: [...runs('Regla de la UAT: ', { size: 11, font: 'titulos', color: COL.tinta }), ...runs(clause, { size: 11, color: COL.texto })] }], { name: 'Cláusula UAT' });
  }
  return [s];
}

function closing(pk) {
  const s = new Slide(COL.tinta, 'Cierre');
  s.pic('logo-blanco.png', 438, 150, 84, 84 * BRAND.logo.relacion, 'Jelou');
  s.text(72, 192, 816, 58, [{ runs: runs(pk.cierre_titulo || 'Gracias', { size: 44, color: COL.blanco, emph: COL.verde }), align: 'ctr' }], { name: 'Título' });
  const txt = pk.cierre_texto || 'Siguiente paso: consolidar las respuestas de esta sesión y cerrar los pendientes antes de emitir el SOW.';
  const th = lineCount(txt, 540, 14, 'texto') * 14 * LH;
  s.text(210, 257, 540, th, [{ runs: runs(txt, { size: 14, color: COL.menta }), align: 'ctr' }], { name: 'Texto' });
  s.shape(420, 257 + th + 28, 120, 36, { adj: 50000, fill: COL.turquesa, paras: [{ runs: runs(pk.cierre_boton || 'Próximos pasos', { size: 12, font: 'titulos', color: COL.blanco }), align: 'ctr' }], name: 'Pastilla' });
  s.text(72, 257 + th + 90, 816, 22, [{ runs: runs('jelou.ai', { size: 12, font: 'medio', color: COL.menta }), align: 'ctr' }], { name: 'Marca' });
  return [s];
}

// ---------- the deck ----------
function integrationRows(sow) {
  const who = (v) => (/jelou/i.test(v || '') ? 'Jelou' : v || 'POR DEFINIR');
  return arr(sow.integraciones).map((it) => {
    const conn = it.conexion;
    const expone = it.expone || (conn === 'middleware_jelou' ? 'Jelou' : it.responsable_cliente ? who(it.sistema || 'Cliente') : 'POR DEFINIR');
    const consume = it.consume || (/jelou/i.test(String(expone)) ? 'Cliente' : 'Jelou');
    const estado = `Doc: ${it.documentacion || 'pendiente'} · QA: ${it.ambiente_pruebas || 'pendiente'} · Resp.: ${it.responsable_cliente || 'POR COMPLETAR'}`;
    return [it.nombre, trunc(it.proposito || '', 110), expone, consume, estado];
  });
}
function assumptionRows(sow) {
  const qOf = (a) => (typeof a === 'object' ? a.pregunta : null);
  return arr((sow.alcance || {}).supuestos).filter((a) => !(typeof a === 'object' && (a.confirmado_cliente === true || a.estado === 'confirmado'))).map((a) => [trunc(typeof a === 'object' ? a.texto : a, 140), qOf(a) || '¿Se confirma este supuesto de preventa?', '']);
}
function llamadasRows(sow, pk) {
  const l = pk.llamadas || {};
  if (arr(l.filas).length) return arr(l.filas).map((f, i) => [String(i + 1), f.de_a, f.que_viaja, f.mecanismo]);
  return arr(sow.integraciones).map((it, i) => [String(i + 1), `${it.expone || 'Sistema'} → ${it.consume || 'Jelou'}`, trunc(it.proposito || '', 100), it.nombre]);
}

function buildSlides(sow, opts = {}) {
  const pk = sow.prekickoff || {};
  const hasOut = arr(sow.agentes).some((a) => /outbound|saliente|prospecci/i.test(`${a.nombre} ${a.entrada || ''}`)) || !!pk.outbound;
  const slides = [];
  const add = (x) => (Array.isArray(x) ? x : [x]).filter(Boolean).forEach((s) => slides.push(s));
  add(cover(sow, pk));
  add(agenda(pk, hasOut));
  add(teamSlide(sow, pk));
  add(compare(sow, pk));
  add(stagesSlide(sow, pk));
  const comp = arr((pk.componentes || {}).items).length ? pk.componentes.items : arr((sow.solucion || {}).componentes).map((c) => ({ nombre: c.componente, texto: trunc(`${c.capacidad || ''}${c.detalle ? ': ' + c.detalle : ''}`, 150) }));
  if (comp.length) add(gridSlides('Componentes', 'Bloque 2 · Alcance del SOW', (pk.componentes || {}).titulo || 'Los componentes que construye Jelou', comp, 'workflow'));
  if (arr((pk.actores || {}).items).length) add(gridSlides('Actores', 'Bloque 3 · ¿Qué interactúa?', pk.actores.titulo || 'Los actores del flujo', pk.actores.items, 'user'));
  add(flowSlide(sow, pk, opts.diagDir));
  const llam = llamadasRows(sow, pk);
  if (llam.length) add(tableSlides('Detalle técnico', 'Bloque 3 · Detalle técnico', (pk.llamadas || {}).titulo || 'Quién llama a quién', '', [34, 170, 400, 248], ['#', 'De → A', 'Qué viaja', 'Mecanismo'], llam));
  if (pk.outbound && arr(pk.outbound.items).length) {
    const ob = pk.outbound;
    const { s, y0 } = newContent('Outbound', 'Bloque 3 · Outbound', ob.titulo || 'La prospección entra al mismo flujo');
    const items = ob.items.slice(0, 5), rh = 44.7;
    items.forEach((it, i) => {
      const y = Math.max(y0, 169) + i * rh;
      if (i) s.line(54, y, 906, y, { color: COL.linea_gris, w: 0.75 });
      s.text(54, y, 36, rh, [{ runs: runs(String(i + 1).padStart(2, '0'), { size: 14, color: COL.turquesa }) }], { anchor: 'ctr' });
      s.text(97, y, 230, rh, [{ runs: runs(it.titulo, { size: 14, font: 'titulos', color: COL.tinta }) }], { anchor: 'ctr' });
      s.text(335, y, 360, rh, [{ runs: runs(it.texto || '', { size: 12, color: COL.texto }) }], { anchor: 'ctr' });
      if (it.quien) { const pw = Math.ceil(D.textWidth(it.quien, 10, true)) + 24; s.shape(906 - pw, y + (rh - 23) / 2, pw, 23, { adj: 50000, line: COL.turquesa, lineW: 1, paras: [{ runs: runs(it.quien, { size: 10, font: 'titulos', color: COL.petroleo }), align: 'ctr' }] }); }
    });
    if (nonEmpty(ob.validar)) { s.shape(54, 443, 852, 58, { adj: radius(852, 58), fill: COL.fondo_alerta }); s.pic(ICON('alert'), 72, 461, 22, 22, 'alerta'); s.text(104, 451, 784, 43, [{ runs: [...runs('A validar: ', { size: 12, font: 'titulos', color: COL.tinta }), ...runs(ob.validar, { size: 12, color: COL.texto })] }], { anchor: 'ctr' }); }
    add(s);
  }
  const val = validationSlides(sow, pk);
  if (val.length) { add(divider('Validación', 'Bloque 4', pk.validacion_titulo || 'Validación etapa por etapa', `Preguntas para cerrar con ${(sow.meta || {}).cliente || 'el cliente'} en la sesión`)); add(val); }
  const intRows = integrationRows(sow);
  if (intRows.length) add(tableSlides('Integraciones', 'Bloque 5', 'Integraciones: quién expone y quién consume', '', [150, 215, 120, 110, 257], ['Integración', 'Qué hace', 'Expone', 'Consume', 'Contacto · doc · QA'], intRows, { note: pk.integraciones_nota, noteH: pk.integraciones_nota ? 60 : 0, boldFirst: true }));
  const asr = assumptionRows(sow);
  if (asr.length) add(tableSlides('Supuestos', 'Prioridad de la sesión', 'Supuestos del SOW a *confirmar o cerrar*', '', [260, 430, 162], ['Supuesto', 'Pregunta para cerrarlo', 'Decisión'], asr, { boldFirst: false }));
  add(pendingSlides(sow, pk));
  add(riskSlides(sow));
  add(nextSteps(sow, pk));
  add(closing(pk));
  return slides;
}

// icon catalogue shown on the last pattern slide of the template (keeps every icon referenced and documents the names)
function iconGallery() {
  const { s } = newContent('Iconos', 'Plantilla', 'Iconos disponibles (campo icono)');
  BRAND.iconos.forEach((n, i) => {
    const x = 54 + (i % 6) * 142, y = 169 + Math.floor(i / 6) * 84;
    s.pic(ICON(n), x + 50, y, 32, 32, n);
    s.text(x, y + 38, 132, 16, [{ runs: runs(n, { size: 10, font: 'medio', color: COL.petroleo }), align: 'ctr' }]);
  });
  return s;
}

// ---------- placeholder dataset for the template's pattern slides ----------
function patternSow() {
  return {
    meta: { cliente: 'Cliente ejemplo', proyecto: 'Título del proyecto', version: '1.0', fase: 'prekickoff' },
    equipo: [], objetivos: { especificos: ['Objetivo específico de ejemplo.', 'Otro objetivo de ejemplo.'] },
    prekickoff: {
      contexto: { hoy: ['Situación actual de ejemplo.'], con_jelou: ['Qué cambia con Jelou, en una frase.'], dato: 'Dato de contexto: volumen, tipos de producto.' },
      etapas: { items: [{ nombre: 'Etapa uno', texto: 'Texto de ejemplo.' }, { nombre: 'Etapa dos', texto: 'Texto de ejemplo.' }, { nombre: 'Etapa tres', texto: 'Texto de ejemplo.', jelou: false }] },
      componentes: { items: [{ nombre: 'Componente', texto: 'Qué construye Jelou.', icono: 'workflow' }] },
      actores: { items: [{ nombre: 'Actor', texto: 'Qué hace en el flujo.', icono: 'user', destacado: true }] },
      e2e: { nota: 'Nota del flujo de punta a punta.' },
      llamadas: { filas: [{ de_a: 'Actor A → Actor B', que_viaja: 'Qué viaja', mecanismo: 'Mecanismo' }] },
      outbound: { items: [{ titulo: 'Paso uno', texto: 'Texto de ejemplo.', quien: 'Jelou' }], validar: 'Punto a validar con el cliente.' },
      pendientes: { documento: ['Pendiente del documento.'], cliente: ['Pendiente del cliente.'] },
    },
    agentes: [{ id: 'F1', nombre: 'Flujo_1: Ejemplo', pasos: [{ id: 'P1', tipo: 'usuario', diagrama: 'Inicio', siguiente: [{ a: 'P2' }] }, { id: 'P2', tipo: 'fin', diagrama: 'Fin', siguiente: [] }], resumen_cliente: [{ id: 'E1', texto: 'El usuario inicia', tipo: 'usuario' }, { id: 'E2', texto: 'Proceso del negocio' }, { id: 'E3', texto: 'Resultado', tipo: 'fin' }] }],
    integraciones: [{ id: 'INT-1', nombre: 'Integración', proposito: 'Qué hace.', expone: 'Cliente', consume: 'Jelou', documentacion: 'pendiente', ambiente_pruebas: 'pendiente' }],
    alcance: { supuestos: [{ texto: 'Supuesto de ejemplo.', pregunta: 'Pregunta para cerrarlo.' }] },
    preguntas_abiertas: [{ id: 'Q-1', pregunta: 'Pregunta de validación de ejemplo.', etapa: 'Etapa uno', tema: 'Tema', bloquea: true }, { id: 'Q-2', pregunta: 'Otra pregunta de ejemplo.', etapa: 'Etapa uno', tema: 'Otro tema' }],
    riesgos: [{ riesgo: 'Riesgo de ejemplo. Qué puede pasar.', mitigacion: 'Cómo se mitiga.' }],
  };
}

if (require.main === module) {
  (async () => {
    const argv = process.argv.slice(2);
    const di = argv.indexOf('--diagramas');
    const diagDir = di >= 0 ? argv[di + 1] : null;
    if (argv[0] === '--patrones') {
      const tpl = argv[1] || TEMPLATE;
      const all = [...buildSlides(patternSow()), iconGallery()];
      const slides = all.map((s) => ({ xml: s.xml(), images: s.images }));
      const size = await K.packageDeck(tpl, slides, tpl, { title: 'Plantilla de kickoff Jelou (diapositivas patrón)', prune: false });
      console.log(`Pattern slides written into ${tpl}: ${slides.length} slides (${size} bytes)`);
      return;
    }
    const args = argv.filter((a, i) => !a.startsWith('--') && !(di >= 0 && i === di + 1));
    const [inFile, outFile] = args;
    if (!inFile || !outFile) { console.error('Usage: node build_kickoff_pptx.js sow.json out.pptx [--diagramas dir]'); process.exit(2); }
    const sow = JSON.parse(fs.readFileSync(inFile, 'utf8'));
    const slides = buildSlides(sow, { diagDir });
    const size = await K.packageDeck(TEMPLATE, slides.map((s) => ({ xml: s.xml(), images: s.images })), outFile, { title: `Pre-kickoff · ${(sow.meta || {}).cliente || ''} · ${(sow.meta || {}).proyecto || ''}` });
    console.log(`Pre-kickoff deck: ${path.resolve(outFile)} (${slides.length} slides, ${size} bytes)`);
    issues.forEach((i) => console.warn('  layout notice: ' + i));
  })().catch((e) => { console.error(e); process.exit(1); });
}
module.exports = { buildSlides, patternSow, issues };
