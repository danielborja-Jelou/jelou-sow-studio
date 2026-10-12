'use strict';
// Conjunto de figuras de un SOW: decide cuántos diagramas se dibujan y qué lleva cada uno.
//
//  - Un flujo pequeño (<= MAX_SINGLE pasos) es UNA figura (F<n>.1), igual que antes.
//  - Un flujo grande se divide por etapas de negocio:
//      F<n>.1        vista general: una caja por etapa (6-9 cajas)
//      F<n>.2 ...    detalle de cada etapa (<= MAX_FIG nodos, contando enlaces y terminales)
//      F<n>.última   handoff común: derivación a asesor y salidas de error compartidas
//    Entre figuras hay nodos "Viene de ..." / "Continúa en ...". Las salidas de error o a asesor/fin
//    NO se dibujan como aristas largas: cada figura tiene un terminal local ("Derivar a asesor (ver
//    diagrama de handoff)" / "Fin").
//  - diagrama_general (si el usuario lo define) es la figura "FG".
//
// Agrupación: pasos[].grupo (o pasos[].fase) > pasos[].etapa; los pasos sin etiqueta heredan la del
// paso anterior del camino principal. Cada paso aparece en exactamente una figura.
//
// Uso: const { buildFigureSet } = require('./figuras'); buildFigureSet(sow) -> { figuras, porAgente, general }
// CLI: node lib/figuras.js sow.json  -> imprime el manifiesto (sin specs) en JSON.
const fs = require('fs');

const MAX_FIG = 12;        // nodos máximos por figura tras dividir
const MAX_SINGLE = 18;     // hasta aquí un flujo se queda en una sola figura
const MAX_OVERVIEW = 9;    // cajas máximas de la vista general
const DETAIL_CORE = 10;    // pasos máximos de una etapa explícita antes de partirla
const ANCHO = 1200;        // ancho de lienzo de las figuras divididas: menos columnas, letra más grande en el Word

const arr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);
const clean = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const trunc = (s, n) => { s = clean(s); if (s.length <= n) return s; const c = s.slice(0, n - 1); const sp = c.lastIndexOf(' '); return (sp > n * 0.6 ? c.slice(0, sp) : c) + '…'; };
const edgesOf = (p) => arr(p && p.siguiente).map((e) => (typeof e === 'string' ? { a: e, si: '' } : { a: String(e && e.a), si: e && e.si ? String(e.si) : '' })).filter((e) => e.a && e.a !== 'undefined');
const POSITIVE = /^\s*(s[ií]\b|ok\b|[eé]xito|exitos|v[aá]lid|correct|aprob|encontr|disponible|complet|confirm|acept|enviad|registrad|recuperad|firmad|contin)/i;
const NEGATIVE = /error|fall|inv[aá]lid|rechaz|insuf|timeout|\bno\b|sin |incorrect|cancel|bloque|intentos|agot/i;
const keyOf = (s) => clean(s).toLowerCase();

function numFig(a, k) { return `F${a}.${k}`; }

// ---------- análisis del grafo de un agente ----------
function analyze(agent) {
  const pasos = arr(agent.pasos);
  const byId = new Map(pasos.map((p) => [String(p.id), p]));
  const idx = new Map(pasos.map((p, i) => [String(p.id), i]));
  const first = pasos.length ? String(pasos[0].id) : null;
  const succ = new Map(), pred = new Map();
  for (const p of pasos) { succ.set(String(p.id), []); pred.set(String(p.id), []); }
  for (const p of pasos) {
    const id = String(p.id), seen = new Set();
    for (const e of edgesOf(p)) {
      if (!byId.has(e.a) || e.a === id || seen.has(e.a)) continue;
      seen.add(e.a); succ.get(id).push(e); pred.get(e.a).push(id);
    }
  }
  // aristas de retroceso por DFS desde el primer paso
  const state = new Map(), back = new Set();
  const dfs = (u) => { state.set(u, 1); for (const e of succ.get(u)) { const s = state.get(e.a); if (s === 1) back.add(u + '>' + e.a); else if (!s) dfs(e.a); } state.set(u, 2); };
  if (first) dfs(first);
  for (const p of pasos) if (!state.get(String(p.id))) dfs(String(p.id));
  // capas por camino más largo (solo aristas hacia adelante)
  const layer = new Map(pasos.map((p) => [String(p.id), 0]));
  const indeg = new Map(pasos.map((p) => [String(p.id), 0]));
  for (const [u, es] of succ) for (const e of es) if (!back.has(u + '>' + e.a)) indeg.set(e.a, indeg.get(e.a) + 1);
  const q = [...indeg.entries()].filter(([, d]) => d === 0).map(([k]) => k);
  while (q.length) {
    const u = q.shift();
    for (const e of succ.get(u)) {
      if (back.has(u + '>' + e.a)) continue;
      layer.set(e.a, Math.max(layer.get(e.a), layer.get(u) + 1));
      indeg.set(e.a, indeg.get(e.a) - 1);
      if (indeg.get(e.a) === 0) q.push(e.a);
    }
  }
  const ord = pasos.map((p) => String(p.id)).sort((a, b) => layer.get(a) - layer.get(b) || idx.get(a) - idx.get(b));
  const rank = new Map(ord.map((id, i) => [id, i]));

  // S = nodos compartidos (asesor y fin siempre; luego las "salidas de escape" comunes)
  const S = new Set(pasos.filter((p) => p.tipo === 'asesor' || p.tipo === 'fin').map((p) => String(p.id)));
  const primary = (id, avoid) => {
    const es = succ.get(id).filter((e) => !avoid.has(e.a));
    if (!es.length) return null;
    return es.find((e) => POSITIVE.test(e.si)) || es.find((e) => !NEGATIVE.test(e.si)) || es[0];
  };
  const spineWalk = (avoid) => {
    const out = [], seen = new Set(); let cur = first;
    while (cur && !seen.has(cur) && !avoid.has(cur)) { out.push(cur); seen.add(cur); const e = primary(cur, avoid); cur = e && e.a; if (cur && seen.has(cur)) break; }
    return out;
  };
  const spine = spineWalk(S), spineSet = new Set(spine);
  const explicitOf = (p) => clean(p.grupo || p.fase || '');
  const explicitMode = pasos.some((p) => explicitOf(p));
  const labelsFor = (Sx) => {
    const lab = new Map(); let prev = null, lastAny = null;
    for (const id of spine) {
      if (Sx.has(id)) continue;
      const p = byId.get(id), ex = explicitOf(p);
      const l = ex || (explicitMode ? '' : clean(p.etapa)) || prev || 'Inicio';
      lab.set(id, l); prev = l;
    }
    for (const id of ord) {
      if (Sx.has(id) || lab.has(id)) { if (lab.has(id)) lastAny = lab.get(id); continue; }
      const p = byId.get(id), ex = explicitOf(p);
      let l = ex;
      if (!l) {
        const ps = pred.get(id).filter((u) => !Sx.has(u) && lab.has(u) && !back.has(u + '>' + id)).sort((a, b) => rank.get(a) - rank.get(b));
        l = ps.length ? lab.get(ps[0]) : lastAny || 'General';
      }
      lab.set(id, l); lastAny = l;
    }
    return lab;
  };
  // salidas de escape comunes: no están en el camino principal, solo llevan a nodos compartidos y las alcanzan varias etapas
  let lab0 = labelsFor(S), changed = true;
  while (changed) {
    changed = false;
    for (const id of ord) {
      if (S.has(id) || spineSet.has(id) || id === first) continue;
      const ss = succ.get(id);
      if (!ss.length || !ss.every((e) => S.has(e.a))) continue;
      const stages = new Set(pred.get(id).filter((u) => !S.has(u)).map((u) => keyOf(lab0.get(u))));
      if (stages.size >= 2) { S.add(id); changed = true; lab0 = labelsFor(S); }
    }
  }
  const label = labelsFor(S);
  const hasHandoff = [...S].some((id) => byId.get(id).tipo !== 'fin');
  if (!hasHandoff) for (const id of [...S]) S.delete(id); // sin asesor ni escapes: los fin siguen siendo pasos normales
  const finalLabel = hasHandoff ? label : labelsFor(S);
  return { pasos, byId, first, succ, pred, ord, rank, back, S, hasHandoff, spine, label: finalLabel, explicitMode };
}

// ---------- grupos (etapas) ----------
function makeGroups(an) {
  const core = an.ord.filter((id) => !an.S.has(id));
  const runs = new Map();
  for (const id of core) {
    const l = an.label.get(id) || 'General', k = keyOf(l);
    if (!runs.has(k)) runs.set(k, { name: l, ids: [] });
    runs.get(k).ids.push(id);
  }
  let list = [...runs.values()];
  const splitUnit = (u, cap) => {
    if (u.ids.length <= cap) return [u];
    const k = Math.ceil(u.ids.length / cap), size = Math.ceil(u.ids.length / k), out = [];
    for (let i = 0; i < k; i++) out.push({ name: `${u.name} (${i + 1}/${k})`, ids: u.ids.slice(i * size, (i + 1) * size) });
    return out;
  };
  if (an.explicitMode || (list.length <= MAX_OVERVIEW && list.every((g) => g.ids.length <= DETAIL_CORE))) {
    return list.flatMap((g) => splitUnit(g, DETAIL_CORE));
  }
  // etapas finas (p. ej. una por paso): se agrupan las contiguas hasta una capacidad objetivo
  const cap = Math.min(8, Math.max(4, Math.ceil(core.length / 6)));
  const units = list.flatMap((g) => splitUnit(g, cap));
  const groups = [];
  let cur = null;
  for (const u of units) {
    if (cur && cur.ids.length + u.ids.length <= cap) { cur.ids = cur.ids.concat(u.ids); cur.last = u.name; cur.n++; }
    else { cur = { name: u.name, ids: u.ids.slice(), last: u.name, n: 1 }; groups.push(cur); }
  }
  return groups.map((g) => ({ name: g.n > 1 && g.last !== g.name ? trunc(`${g.name} y ${g.last}`, 58) : g.name, ids: g.ids, fusion: g.n > 1 && g.last !== g.name }));
}

// ---------- construcción de las figuras ----------
const stepNode = (p) => ({ id: String(p.id), tipo: p.tipo, diagrama: p.diagrama, etapa: p.etapa, mensaje: p.mensaje, negrita: p.negrita, siguiente: [] });
const shortName = (n) => trunc(n, 70);

function assemble(agent, ai, an, groups, titleBase) {
  const a = ai + 1;
  const nG = groups.length;
  const hasH = an.hasHandoff;
  const figId = (k) => numFig(a, k);               // k: 1 = general
  const gFig = groups.map((_, i) => figId(i + 2));
  const hFig = hasH ? figId(nG + 2) : null;
  const where = new Map();                          // paso -> {g: índice de grupo | 'H'}
  groups.forEach((g, i) => g.ids.forEach((id) => where.set(id, i)));
  an.S.forEach((id) => where.set(id, 'H'));
  const figName = (w) => (w === 'H' ? 'Handoff común' : groups[w].name);
  const figRef = (w) => (w === 'H' ? hFig : gFig[w]);
  const reachesAsesor = (id, seen = new Set()) => {
    if (seen.has(id)) return false; seen.add(id);
    const p = an.byId.get(id);
    if (p.tipo === 'asesor') return true;
    return an.succ.get(id).some((e) => an.S.has(e.a) && reachesAsesor(e.a, seen));
  };
  const asesorText = `Derivar a asesor (ver diagrama de handoff${hFig ? ' ' + hFig : ''})`;
  const figs = [];
  const leyendas = agent.leyendas;

  // detalle de cada etapa
  groups.forEach((g, gi) => {
    const nodes = new Map();
    for (const id of g.ids) nodes.set(id, stepNode(an.byId.get(id)));
    const extra = [];
    const addExtra = (n) => { if (!nodes.has(n.id)) { nodes.set(n.id, n); extra.push(n); } return nodes.get(n.id); };
    for (const id of g.ids) {
      const outs = new Map(); // destino -> etiquetas
      const push = (to, si) => { if (!outs.has(to)) outs.set(to, []); if (si && !outs.get(to).includes(si)) outs.get(to).push(si); };
      for (const e of an.succ.get(id)) {
        const w = where.get(e.a);
        if (w === gi) push(e.a, e.si);
        else if (w === 'H') {
          const kind = reachesAsesor(e.a) ? 'asesor' : 'fin';
          if (kind === 'asesor') { addExtra({ id: '@asesor', tipo: 'asesor', diagrama: asesorText, siguiente: [] }); push('@asesor', e.si); }
          else { addExtra({ id: '@fin', tipo: 'fin', diagrama: 'Fin', siguiente: [] }); push('@fin', e.si); }
        } else if (w != null) {
          addExtra({ id: '@a:' + w, tipo: 'enlace', diagrama: `Continúa en ${figRef(w)} · ${shortName(figName(w))}`, siguiente: [] });
          push('@a:' + w, e.si);
        }
      }
      nodes.get(id).siguiente = [...outs.entries()].map(([a2, ls]) => (ls.length ? { a: a2, si: ls.join(' / ') } : { a: a2 }));
    }
    // enlaces de entrada
    const entries = new Map(); // origen -> [ids destino]
    for (const id of g.ids) for (const u of an.pred.get(id)) {
      if (an.back.has(u + '>' + id) && where.get(u) === gi) continue;
      const w = where.get(u);
      if (w === gi || w == null) continue;
      if (!entries.has(w)) entries.set(w, []);
      if (!entries.get(w).includes(id)) entries.get(w).push(id);
    }
    const entryNodes = [];
    for (const [w, targets] of entries) {
      const n = { id: '@de:' + w, tipo: 'enlace', diagrama: `Viene de ${figRef(w)} · ${shortName(figName(w))}`, siguiente: targets.map((t) => ({ a: t })) };
      entryNodes.push(n);
    }
    const ordered = [...entryNodes, ...nodes.values()];
    // la entrada principal del flujo va primero
    const pasosSpec = ordered.filter((n) => n.id.startsWith('@de:')).concat(ordered.filter((n) => !n.id.startsWith('@de:')));
    // el primer nodo del spec debe ser el paso de entrada de la etapa si no hay enlaces
    figs.push({
      id: gFig[gi], tipo: 'etapa', fusion: !!g.fusion, titulo: trunc(`${gFig[gi]} · ${g.name}`, 64), nombre: g.name, pasos: g.ids.slice(),
      spec: { titulo: trunc(`${gFig[gi]} · ${g.name}`, 64), pasos: pasosSpec, leyendas, fragmento: true, ancho: ANCHO },
    });
  });

  // vista general
  {
    const gn = groups.map((g, i) => ({ id: '@g' + i, tipo: 'etapa', diagrama: `${i + 1}. ${g.name} (${gFig[i]})`, siguiente: [] }));
    const seen = new Set();
    let finFrom = -1;
    groups.forEach((g, gi) => {
      for (const id of g.ids) for (const e of an.succ.get(id)) {
        const w = where.get(e.a);
        if (w === 'H') { if (an.byId.get(e.a).tipo === 'fin') finFrom = Math.max(finFrom, gi); continue; }
        if (w === gi || w == null) continue;
        const k = gi + '>' + w;
        if (seen.has(k)) continue; seen.add(k);
        gn[gi].siguiente.push({ a: '@g' + w });
      }
    });
    const all = gn.slice();
    if (finFrom >= 0) { all.push({ id: '@fin', tipo: 'fin', diagrama: 'Fin', siguiente: [] }); gn[finFrom].siguiente.push({ a: '@fin' }); }
    const t = trunc(`${titleBase}: visión general`, 64);
    figs.unshift({ id: figId(1), tipo: 'general', titulo: t, nombre: 'Visión general', pasos: [], spec: { titulo: `${figId(1)} · ${trunc(t, 56)}`, pasos: all, leyendas, fragmento: true, ancho: ANCHO } });
  }

  // handoff común
  if (hasH) {
    const ids = an.ord.filter((id) => an.S.has(id));
    const nodes = new Map(ids.map((id) => [id, stepNode(an.byId.get(id))]));
    const extraN = [];
    const entryTargets = [];
    for (const id of ids) {
      const outs = new Map();
      for (const e of an.succ.get(id)) {
        const w = where.get(e.a);
        if (w === 'H') { outs.set(e.a, e.si ? [e.si] : []); }
        else if (w != null) {
          const nid = '@a:' + w;
          if (!nodes.has(nid)) { const n = { id: nid, tipo: 'enlace', diagrama: `Continúa en ${figRef(w)} · ${shortName(figName(w))}`, siguiente: [] }; nodes.set(nid, n); extraN.push(n); }
          if (!outs.has(nid)) outs.set(nid, []); if (e.si) outs.get(nid).push(e.si);
        }
      }
      nodes.get(id).siguiente = [...outs.entries()].map(([a2, ls]) => (ls.length ? { a: a2, si: ls.join(' / ') } : { a: a2 }));
      // solo entran "desde cualquier etapa" los nodos que no cuelgan de otro del handoff (el asesor y el fin ya reciben las flechas de la cadena)
      if (an.pred.get(id).some((u) => !an.S.has(u)) && !an.pred.get(id).some((u) => an.S.has(u))) entryTargets.push(id);
    }
    const entry = { id: '@desde', tipo: 'enlace', diagrama: 'Desde cualquier etapa del flujo', siguiente: entryTargets.map((t) => ({ a: t })) };
    const t = `${hFig} · Handoff común`;
    figs.push({
      id: hFig, tipo: 'handoff', titulo: t, nombre: 'Handoff común', pasos: ids.slice(),
      spec: { titulo: t, pasos: [entry, ...nodes.values()], leyendas, fragmento: true, ancho: ANCHO },
    });
  }
  return figs;
}

function splitAgent(agent, ai) {
  const nombre = clean(agent.nombre || agent.id);
  const an = analyze(agent);
  let groups = makeGroups(an);
  const titleBase = trunc(nombre, 40);
  let figs = assemble(agent, ai, an, groups, titleBase);
  // refinar: partir en dos la etapa cuyo detalle supere MAX_FIG nodos
  for (let it = 0; it < 40; it++) {
    const bad = figs.findIndex((f) => f.tipo === 'etapa' && f.spec.pasos.length > MAX_FIG);
    if (bad < 0) break;
    const gi = bad - 1, g = groups[gi];
    if (g.ids.length < 2) break;
    const h = Math.ceil(g.ids.length / 2);
    groups = groups.slice(0, gi).concat([{ name: g.name + ' (1/2)', ids: g.ids.slice(0, h) }, { name: g.name + ' (2/2)', ids: g.ids.slice(h) }], groups.slice(gi + 1));
    figs = assemble(agent, ai, an, groups, titleBase);
  }
  return { figs, an, groups };
}

// ---------- Diagrama end-to-end (visión para el cliente) ----------
// Una figura por proyecto ("FE", "Diagrama end-to-end"): hitos de negocio, sin tecnicismos (OTP, API, webhook...),
// como máximo ~8 cajas, con las entradas (inbound/outbound) y las salidas principales.
//   - agentes[].resumen_cliente: lista explícita de hitos [{id?, texto, tipo?: usuario|hito|asesor|fin, salidas?: [{a, si}]}]
//     (una cadena sola equivale a {texto}). Sin `salidas`, cada hito sigue al anterior. Un `salidas.a` puede apuntar al id de
//     un hito de OTRO agente (p. ej. el recordatorio saliente que desemboca en el flujo de solicitud).
//   - sin resumen_cliente: se arma solo con grupo/etapa (nombres de etapa), una entrada por agente y las salidas a asesor/fin.
//   - agentes[].entrada: "inbound" | "outbound" (por defecto se deduce del nombre) · agentes[].continua_en: id del agente al que desemboca.
const E2E_MAX = 9;
const E2E_TECH = /\b(otp|api|webhook|http|https|json|endpoint|token|deeplink|hsm|jwt|oauth|payload|swagger|sql)\b|ws#\d+/i;
const OUTBOUND_RE = /outbound|saliente|prospecci|campa[nñ]a|recordatorio/i;

function e2eAgentNodes(ag, ai, auto) {
  const id = String(ag.id == null ? 'A' + (ai + 1) : ag.id);
  const pre = `e${ai + 1}_`;
  const explicit = arr(ag.resumen_cliente).map((it) => (typeof it === 'string' ? { texto: it } : it || {})).filter((o) => clean(o.texto));
  const outbound = String(ag.entrada || '').toLowerCase() === 'outbound' || (!ag.entrada && OUTBOUND_RE.test(`${ag.nombre || ''} ${ag.fase || ''}`));
  if (explicit.length) {
    const nodes = explicit.map((o, k) => ({ id: o.id ? String(o.id) : pre + (k + 1), texto: clean(o.texto), tipo: ['usuario', 'hito', 'asesor', 'fin'].includes(o.tipo) ? o.tipo : (k === 0 ? 'usuario' : 'hito'), salidas: o.salidas ? arr(o.salidas).map((e) => ({ a: String(e.a), si: e.si ? clean(e.si) : '' })) : null }));
    nodes.forEach((n, k) => { if (!n.salidas) n.salidas = (n.tipo === 'fin' || n.tipo === 'asesor' || k === nodes.length - 1) ? [] : [{ a: nodes[k + 1].id, si: '' }]; });
    return { agentId: id, nodes, outbound, auto: false };
  }
  // automático: nombres de etapa (grupo > etapa)
  let names = [];
  try {
    const an = analyze(ag);
    names = makeGroups(an).map((g) => clean(g.name).replace(/\s*\(\d+\/\d+\)\s*$/, ''));
  } catch (e) { names = []; }
  names = names.filter((n, i) => n && names.indexOf(n) === i);
  if (!names.length) names = arr(ag.pasos).map((p) => clean(p.etapa)).filter(Boolean).filter((n, i, a) => a.indexOf(n) === i);
  const cap = 5;
  while (names.length > cap) { // une pares vecinos de nombres más cortos hasta quedar en el tope
    let best = 0, bl = Infinity;
    for (let i = 0; i < names.length - 1; i++) { const l = names[i].length + names[i + 1].length; if (l < bl) { bl = l; best = i; } }
    names.splice(best, 2, trunc(`${names[best]} y ${names[best + 1]}`, 60));
  }
  const nodes = [{ id: pre + 'in', texto: outbound ? 'La empresa escribe primero al usuario por WhatsApp' : 'El usuario inicia la conversación por WhatsApp', tipo: 'usuario' }];
  names.forEach((n, k) => nodes.push({ id: pre + (k + 1), texto: n, tipo: 'hito' }));
  if (arr(ag.pasos).some((p) => p.tipo === 'asesor')) nodes.push({ id: pre + 'as', texto: 'Derivación a un asesor', tipo: 'asesor', salidas: [] });
  const main = nodes.filter((n) => n.id !== pre + 'as');
  main.forEach((n, k) => { n.salidas = k < main.length - 1 ? [{ a: main[k + 1].id, si: '' }] : []; });
  const as = nodes.find((n) => n.id === pre + 'as');
  if (as && main.length > 2) main[Math.min(2, main.length - 1) - 1].salidas.push({ a: as.id, si: 'si necesita ayuda' });
  else if (as) main[main.length - 1].salidas.push({ a: as.id, si: 'si necesita ayuda' });
  return { agentId: id, nodes, outbound, auto: true };
}

function buildE2E(sow) {
  const agents = (arr(sow && sow.agentes).length ? sow.agentes : legacyAgents(sow)).filter((a) => arr(a.pasos).length);
  if (!agents.length) return null;
  let parts = agents.map((ag, ai) => e2eAgentNodes(ag, ai));
  // continuidad automática entre agentes (agentes[].continua_en): el último hito principal del agente saliente apunta al primer hito del destino
  parts.forEach((p, i) => {
    const ag = agents[i];
    if (!ag.continua_en) return;
    const dest = parts.find((q) => q.agentId === String(ag.continua_en));
    if (!dest || dest === p) return;
    const target = dest.nodes.find((n) => n.tipo !== 'usuario') || dest.nodes[0];
    const last = [...p.nodes].reverse().find((n) => n.tipo !== 'asesor' && n.tipo !== 'fin');
    if (last && target && !last.salidas.some((e) => e.a === target.id)) last.salidas.push({ a: target.id, si: '' });
  });
  // tope de cajas: se recortan los agentes automáticos (nunca los resúmenes escritos por el autor)
  const count = () => parts.reduce((a, p) => a + p.nodes.length, 0);
  for (let guard = 0; count() > E2E_MAX && guard < 20; guard++) {
    const cand = parts.filter((p) => p.auto).sort((a, b) => b.nodes.length - a.nodes.length)[0];
    if (!cand || cand.nodes.length <= 3) break;
    const mid = cand.nodes.filter((n) => n.tipo === 'hito');
    if (mid.length < 2) break;
    const i = cand.nodes.indexOf(mid[mid.length - 2]), j = cand.nodes.indexOf(mid[mid.length - 1]);
    const a = cand.nodes[i], b = cand.nodes[j];
    a.texto = trunc(`${a.texto} y ${b.texto}`, 60); a.salidas = b.salidas.filter((e) => e.a !== a.id);
    cand.nodes.splice(j, 1);
    cand.nodes.forEach((n) => n.salidas.forEach((e) => { if (e.a === b.id) e.a = a.id; }));
  }
  parts.forEach((p) => p.nodes.forEach((n) => { n.outbound = p.outbound; }));
  const all = parts.flatMap((p) => p.nodes);
  const ids = new Set(all.map((n) => n.id));
  all.forEach((n) => { n.salidas = n.salidas.filter((e) => ids.has(e.a)); });
  // los nodos sin salida son terminales: se dibujan como "fin" (salvo asesor)
  const pasos = all.map((n) => ({ id: n.id, tipo: n.salidas.length || n.tipo === 'asesor' ? n.tipo : (n.tipo === 'usuario' ? 'usuario' : 'fin'), diagrama: n.texto, sub: n.tipo === 'usuario' ? (n.outbound ? 'Outbound' : 'Inbound') : undefined, siguiente: n.salidas.map((e) => (e.si ? { a: e.a, si: e.si } : { a: e.a })) }));
  // el nodo inicial debe ser un punto de entrada: las entradas (usuario) van primero
  pasos.sort((a, b) => (a.tipo === 'usuario' ? 0 : 1) - (b.tipo === 'usuario' ? 0 : 1));
  const titulo = 'Diagrama end-to-end';
  return {
    id: 'FE', tipo: 'e2e', agenteId: null, titulo, caption: `Figura FE. ${titulo}.`, nodos: pasos.length, pasos: pasos.map((p) => p.id), dividido: false,
    automatico: parts.some((p) => p.auto), tecnico: parts.some((p) => p.auto && p.nodes.some((n) => E2E_TECH.test(n.texto))),
    spec: { titulo, pasos, fragmento: true, ancho: ANCHO },
  };
}

// ---------- API ----------
function buildFigureSet(sow) {
  const figuras = [], porAgente = {};
  let general = null;
  const e2e = buildE2E(sow);
  if (e2e) figuras.push(e2e);
  const g = sow && sow.diagrama_general;
  if (g && arr(g.pasos).length) {
    general = { id: 'FG', tipo: 'diagrama_general', agenteId: null, titulo: g.titulo || 'Orquestación E2E', caption: `Figura FG. ${g.titulo || 'Orquestación E2E'}.`, nodos: arr(g.pasos).length, pasos: arr(g.pasos).map((p) => String(p.id)), dividido: false, spec: { titulo: g.titulo || 'Orquestación E2E', pasos: g.pasos, leyendas: g.leyendas } };
    figuras.push(general);
  }
  const agents = arr(sow && sow.agentes).length ? sow.agentes : legacyAgents(sow);
  agents.forEach((ag, ai) => {
    const id = String(ag.id == null ? 'A' + (ai + 1) : ag.id);
    const nombre = clean(ag.nombre || id), fase = clean(ag.fase);
    const total = arr(ag.pasos).length;
    let list;
    if (!total) list = [];
    else if (total <= MAX_SINGLE || ag.dividir_diagrama === false) {
      const t = ag.titulo_diagrama || `${nombre}: flujo E2E`;
      list = [{ id: numFig(ai + 1, 1), tipo: 'unica', titulo: t, nombre, pasos: arr(ag.pasos).map((p) => String(p.id)), spec: { titulo: t, pasos: ag.pasos, leyendas: ag.leyendas }, dividido: false }];
    } else {
      const { figs } = splitAgent(ag, ai);
      list = figs.map((f) => Object.assign(f, { dividido: true }));
    }
    list.forEach((f) => {
      f.agenteId = id;
      f.nodos = f.spec.pasos.length;
      f.caption = f.tipo === 'unica' ? `Figura ${f.id}. ${nombre}${fase ? ' — ' + fase : ''}.` : `Figura ${f.id}. ${nombre}: ${f.tipo === 'general' ? 'visión general por etapas' : f.tipo === 'handoff' ? 'handoff común (derivación a asesor y salidas de error)' : 'detalle de «' + f.nombre + '»'}.`;
    });
    porAgente[id] = list;
    figuras.push(...list);
  });
  return { figuras, porAgente, general, e2e };
}

function legacyAgents(sow) {
  if (sow && sow.flujo && arr(sow.flujo.pasos).length) return [{ id: 'A1', nombre: (sow.meta && sow.meta.bot) || 'Agente', pasos: sow.flujo.pasos.map((p, i, all) => ({ id: 'P' + (p.n || i + 1), tipo: p.tipo || 'mensaje', etapa: p.accion, mensaje: p.resultado, siguiente: i < all.length - 1 ? [{ a: 'P' + (all[i + 1].n || i + 2) }] : [] })) }];
  return [];
}

const safeName = (id) => String(id).replace(/[^\w.-]+/g, '_');
function manifest(set) {
  return set.figuras.map((f) => ({ id: f.id, archivo: safeName(f.id), agente: f.agenteId, tipo: f.tipo, titulo: f.titulo, caption: f.caption, nodos: f.nodos, pasos: f.pasos, dividido: f.dividido }));
}

module.exports = { buildFigureSet, buildE2E, manifest, safeName, MAX_FIG, MAX_SINGLE, MAX_OVERVIEW, E2E_MAX };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) { console.error('Uso: node lib/figuras.js sow.json'); process.exit(2); }
  const sow = JSON.parse(fs.readFileSync(file, 'utf8'));
  process.stdout.write(JSON.stringify(manifest(buildFigureSet(sow)), null, 2) + '\n');
}
