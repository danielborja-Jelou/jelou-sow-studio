'use strict';
// Motor de diagramas de la skill jelou-sow.
// spec = { titulo, pasos:[{id,tipo,diagrama,siguiente:[{a,si}]}] }
// Layout en capas (Sugiyama simplificado) + aristas ortogonales + SVG + PNG (resvg).
const fs = require('fs');
const path = require('path');

const ASSETS = path.join(__dirname, '..', '..', 'assets');
const BRAND = JSON.parse(fs.readFileSync(path.join(ASSETS, 'brand.json'), 'utf8'));
const DG = BRAND.diagramas;
const FONT_REGULAR = path.join(ASSETS, BRAND.fuentes.archivos.regular);
const FONT_SEMIBOLD = path.join(ASSETS, BRAND.fuentes.archivos.semibold);
const TYPE_ORDER = Object.keys(DG.tipos);

// ---------- constantes de diseño (px, espacio de 1600 de ancho) ----------
const C = {
  FONT: 22, LINE: 30, TITLE: 34, LEG: 20, LABEL: 18,
  MARGIN: 40, GAPX: 36, DUMMYW: 10, TARGET_W: 1600, MIN_W: 1200,
  MAX_NODE_W: 980, MIN_NODE_W: 170, PADX: 26, PADX_HEX: 46, PADY: 18, PADY_HEX: 22,
  MIN_H: 64, TOP: 104, TRACK: 18, STROKE: 2.5, ARROW: '#' + DG.flecha, MAX_TEXT: 110,
};
C.ARROW = '#' + DG.flecha.replace(/^#/, '');

// ---------- métricas de Poppins (hmtx real del TTF; si falla, factor fijo) ----------
function parseFont(file) {
  try {
    const b = fs.readFileSync(file);
    const n = b.readUInt16BE(4), t = {};
    for (let i = 0; i < n; i++) {
      const o = 12 + 16 * i;
      t[b.toString('latin1', o, o + 4)] = b.readUInt32BE(o + 8);
    }
    const upm = b.readUInt16BE(t.head + 18);
    const nh = b.readUInt16BE(t.hhea + 34);
    // cmap formato 4 (plataforma 3, codificación 1)
    const cm = t.cmap, nt = b.readUInt16BE(cm + 2);
    let sub = -1;
    for (let i = 0; i < nt; i++) {
      const o = cm + 4 + 8 * i;
      if (b.readUInt16BE(o) === 3 && b.readUInt16BE(o + 2) === 1) sub = cm + b.readUInt32BE(o + 4);
    }
    if (sub < 0 || b.readUInt16BE(sub) !== 4) throw new Error('cmap');
    const segX2 = b.readUInt16BE(sub + 6), seg = segX2 / 2;
    const endO = sub + 14, startO = endO + segX2 + 2, deltaO = startO + segX2, rangeO = deltaO + segX2;
    const gidOf = (c) => {
      for (let i = 0; i < seg; i++) {
        if (b.readUInt16BE(endO + 2 * i) >= c) {
          const st = b.readUInt16BE(startO + 2 * i);
          if (st > c) return 0;
          const ro = b.readUInt16BE(rangeO + 2 * i), d = b.readUInt16BE(deltaO + 2 * i);
          if (ro === 0) return (c + d) & 0xffff;
          const g = b.readUInt16BE(rangeO + 2 * i + ro + 2 * (c - st));
          return g ? (g + d) & 0xffff : 0;
        }
      }
      return 0;
    };
    const cache = new Map();
    return (cp) => {
      if (cache.has(cp)) return cache.get(cp);
      const g = gidOf(cp);
      const adv = b.readUInt16BE(t.hmtx + 4 * Math.min(g, nh - 1)) / upm;
      const v = g ? adv : 0.6;
      cache.set(cp, v);
      return v;
    };
  } catch (e) {
    return () => 0.58;
  }
}
const ADV = { regular: parseFont(FONT_REGULAR), bold: parseFont(FONT_SEMIBOLD) };
function textWidth(s, size, bold) {
  const f = bold ? ADV.bold : ADV.regular;
  let w = 0;
  for (const ch of String(s)) w += f(ch.codePointAt(0));
  return w * size * 1.015; // pequeño margen por kerning/redondeo
}
function wrap(text, maxW, size, bold) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  const push = () => { if (cur) lines.push(cur); cur = ''; };
  for (let w of words) {
    while (textWidth(w, size, bold) > maxW) { // palabra más larga que la caja: corte duro
      let k = 1;
      while (k < w.length && textWidth(w.slice(0, k + 1) + '-', size, bold) <= maxW) k++;
      push();
      lines.push(w.slice(0, k) + '-');
      w = w.slice(k);
    }
    const t = cur ? cur + ' ' + w : w;
    if (!cur || textWidth(t, size, bold) <= maxW) cur = t;
    else { push(); cur = w; }
  }
  push();
  return lines.length ? lines : [''];
}
// ancho interior mínimo que conserva el mismo nº de líneas (texto equilibrado)
function balancedInner(text, cap, size, bold) {
  const n = wrap(text, cap, size, bold).length;
  if (n === 1) return Math.min(cap, textWidth(text, size, bold));
  let lo = Math.max(...String(text).split(/\s+/).map((w) => textWidth(w, size, bold)));
  let hi = cap;
  while (hi - lo > 2) {
    const mid = (lo + hi) / 2;
    if (wrap(text, mid, size, bold).length <= n) hi = mid; else lo = mid;
  }
  return hi;
}

// ---------- normalización ----------
function trunc(s, n) {
  if (s.length <= n) return s;
  const cut = s.slice(0, n - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut) + '…';
}
function nodeText(p) {
  const d = String(p.diagrama || '').replace(/\s+/g, ' ').trim();
  if (d) return d;
  const e = String(p.etapa || '').replace(/\s+/g, ' ').trim();
  if (e) return e;
  const m = String(p.mensaje || '').replace(/\s+/g, ' ').trim();
  return m ? trunc(m, 90) : String(p.id);
}
function edgeList(p) {
  return (Array.isArray(p.siguiente) ? p.siguiente : []).map((e) =>
    typeof e === 'string' ? { a: e } : e || {});
}
function normalize(spec) {
  const nodes = [], byId = new Map();
  for (const p of (spec && spec.pasos) || []) {
    const id = String(p.id);
    if (byId.has(id)) continue;
    const t0 = p.tipo === 'webview' ? 'formulario' : p.tipo; // webview = alias de formulario
    const tipo = DG.tipos[t0] ? t0 : 'mensaje';
    const n = { id, tipo, text: nodeText(p), bold: !!p.negrita, raw: edgeList(p), edges: [] };
    byId.set(id, n);
    nodes.push(n);
  }
  for (const n of nodes) {
    const seen = new Set();
    for (const e of n.raw) {
      const to = String(e.a);
      if (!byId.has(to) || to === n.id || seen.has(to)) continue;
      seen.add(to);
      n.edges.push({ to, label: e.si ? String(e.si) : '' });
    }
  }
  return { nodes, byId };
}

// ---------- validación ----------
function validateGraph(spec) {
  const out = [];
  const add = (nivel, codigo, mensaje) => out.push({ nivel, codigo, mensaje });
  const pasos = (spec && Array.isArray(spec.pasos)) ? spec.pasos : [];
  if (!pasos.length) { add('error', 'SIN_PASOS', 'El diagrama no tiene pasos.'); return out; }
  const ids = new Set(), dup = new Set();
  for (const p of pasos) { const id = String(p.id); if (ids.has(id)) dup.add(id); ids.add(id); }
  for (const id of dup) add('error', 'ID_DUPLICADO', `El id "${id}" está repetido.`);
  const first = String(pasos[0].id);
  const adj = new Map(), indeg = new Map();
  for (const p of pasos) { adj.set(String(p.id), []); indeg.set(String(p.id), indeg.get(String(p.id)) || 0); }
  for (const p of pasos) {
    const id = String(p.id);
    if (!p.tipo || !DG.tipos[p.tipo]) add('error', 'TIPO_INVALIDO', `Paso ${id}: tipo "${p.tipo}" no existe (${TYPE_ORDER.join(', ')}).`);
    for (const e of edgeList(p)) {
      const a = String(e.a);
      if (!ids.has(a)) { add('error', 'DESTINO_INEXISTENTE', `Paso ${id}: siguiente.a "${a}" no existe.`); continue; }
      adj.get(id).push(a);
      indeg.set(a, (indeg.get(a) || 0) + 1);
    }
    const txt = String(p.diagrama || p.etapa || '');
    if (txt.length > C.MAX_TEXT) add('aviso', 'TEXTO_LARGO', `Paso ${id}: el texto del diagrama tiene ${txt.length} caracteres (máx. ${C.MAX_TEXT}).`);
    if (!String(p.diagrama || '').trim()) add('aviso', 'SIN_DIAGRAMA', `Paso ${id}: sin "diagrama"; se usa ${p.etapa ? '"etapa"' : '"mensaje" recortado'}.`);
    const n = edgeList(p).length;
    if (p.tipo === 'decision') {
      if (n < 2) add(spec.fragmento ? 'aviso' : 'error', 'DECISION_POCAS_ARISTAS', `Decisión ${id}: tiene ${n} salida(s); necesita al menos 2.`);
      if (edgeList(p).some((e) => !e.si)) add('error', 'DECISION_SIN_ETIQUETA', `Decisión ${id}: todas sus salidas deben llevar etiqueta ("si").`);
    }
    if (n === 0 && p.tipo !== 'fin' && p.tipo !== 'asesor' && p.tipo !== 'enlace') add('error', 'SIN_SALIDA', `Paso ${id} (${p.tipo}) no tiene salida y no es fin ni asesor.`);
    if (n > 0 && p.tipo === 'fin') add('aviso', 'FIN_CON_SALIDA', `Paso ${id} es fin pero tiene salidas.`);
  }
  const starts = [...indeg.entries()].filter(([, d]) => d === 0).map(([k]) => k);
  // una figura dividida (spec.fragmento) tiene varios nodos "Viene de ..." como entradas: es lo esperado
  if (starts.length > 1 && !spec.fragmento) add('aviso', 'VARIOS_INICIOS', `Hay ${starts.length} nodos iniciales (${starts.join(', ')}); normal solo en un diagrama general con varios actores.`);
  const reach = (from) => { const s = new Set(from), st = [...from]; while (st.length) for (const m of adj.get(st.pop()) || []) if (!s.has(m)) { s.add(m); st.push(m); } return s; };
  const fromFirst = reach([first]);
  const fromStarts = reach(starts.length ? starts : [first]);
  for (const id of ids) {
    if (!fromStarts.has(id)) add('error', 'INALCANZABLE', `Paso ${id} no es alcanzable desde ningún nodo inicial.`);
    else if (!spec.fragmento && !fromFirst.has(id) && !starts.includes(id)) add('aviso', 'INALCANZABLE_DESDE_PRIMERO', `Paso ${id} no es alcanzable desde el primer nodo (${first}).`);
  }
  return out;
}

// ---------- layout ----------
function pav(items, desired, weights) {
  // minimiza Σ w(x-d)² con x_i - x_{i-1} >= sep (regresión isotónica ponderada)
  const n = items.length, c = [0];
  for (let i = 1; i < n; i++) c.push(c[i - 1] + (items[i - 1].w + items[i].w) / 2 + C.GAPX);
  const blocks = [];
  for (let i = 0; i < n; i++) {
    const wi = weights ? weights[i] : items[i].wt;
    blocks.push({ s: i, e: i, sum: (desired[i] - c[i]) * wi, w: wi });
    while (blocks.length > 1) {
      const b = blocks[blocks.length - 1], a = blocks[blocks.length - 2];
      if (a.sum / a.w <= b.sum / b.w + 1e-9) break;
      blocks.pop();
      a.e = b.e; a.sum += b.sum; a.w += b.w;
    }
  }
  for (const b of blocks) for (let i = b.s; i <= b.e; i++) items[i].x = b.sum / b.w + c[i];
}

function layoutDiagram(spec) {
  const { nodes, byId } = normalize(spec);
  const title = String((spec && spec.titulo) || '');
  if (!nodes.length) return { width: C.MIN_W, height: 200, title, nodes: [], edges: [], legend: [], titleY: 56 };

  // 1. aristas de retroceso (DFS desde nodos iniciales)
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const n of nodes) for (const e of n.edges) indeg.set(e.to, indeg.get(e.to) + 1);
  const state = new Map(), back = new Set();
  const dfs = (u) => {
    state.set(u.id, 1);
    for (const e of u.edges) {
      const s = state.get(e.to);
      if (s === 1) back.add(u.id + '>' + e.to);
      else if (!s) dfs(byId.get(e.to));
    }
    state.set(u.id, 2);
  };
  for (const n of nodes) if (indeg.get(n.id) === 0 && !state.get(n.id)) dfs(n);
  for (const n of nodes) if (!state.get(n.id)) dfs(n);
  const isBack = (u, e) => back.has(u.id + '>' + e.to);

  // 2. capas por camino más largo
  const layer = new Map(nodes.map((n) => [n.id, 0]));
  const indF = new Map(nodes.map((n) => [n.id, 0]));
  const preds = new Map(nodes.map((n) => [n.id, 0]));
  for (const n of nodes) for (const e of n.edges) if (!isBack(n, e)) { indF.set(e.to, indF.get(e.to) + 1); preds.set(e.to, preds.get(e.to) + 1); }
  const q = nodes.filter((n) => indF.get(n.id) === 0), topo = [];
  while (q.length) {
    const u = q.shift(); topo.push(u);
    for (const e of u.edges) {
      if (isBack(u, e)) continue;
      layer.set(e.to, Math.max(layer.get(e.to), layer.get(u.id) + 1));
      indF.set(e.to, indF.get(e.to) - 1);
      if (indF.get(e.to) === 0) q.push(byId.get(e.to));
    }
  }
  // fuentes distintas de la primera: acercarlas a su primer sucesor
  for (let i = topo.length - 1; i >= 0; i--) {
    const u = topo[i];
    if (u === nodes[0] || preds.get(u.id) !== 0) continue;
    const fw = u.edges.filter((e) => !isBack(u, e));
    if (fw.length) layer.set(u.id, Math.min(...fw.map((e) => layer.get(e.to))) - 1);
  }
  const L = Math.max(...nodes.map((n) => layer.get(n.id))) + 1;

  // 3. ítems (nodos + ficticios) y cadenas
  const itemOf = new Map();
  const layers = Array.from({ length: L }, () => []);
  for (const n of nodes) itemOf.set(n.id, { id: n.id, real: true, node: n, layer: layer.get(n.id), up: [], down: [], wt: 1 });
  const fwdEdges = [], backEdges = [];
  for (const u of nodes) for (const e of u.edges) {
    const iu = itemOf.get(u.id), iv = itemOf.get(e.to);
    if (isBack(u, e)) { backEdges.push({ iu, iv, label: e.label }); continue; }
    const chain = [iu];
    for (let l = iu.layer + 1; l < iv.layer; l++) chain.push({ id: `~${u.id}>${e.to}#${l}`, real: false, layer: l, up: [], down: [], wt: 4, w: C.DUMMYW });
    chain.push(iv);
    for (let k = 0; k + 1 < chain.length; k++) { chain[k].down.push(chain[k + 1]); chain[k + 1].up.push(chain[k]); }
    fwdEdges.push({ iu, iv, label: e.label, chain, segs: [] });
  }

  // 4. orden inicial (por aristas) + barícentro
  const placed = new Set();
  for (const n of nodes) { const it = itemOf.get(n.id); if (it.layer === 0) { layers[0].push(it); placed.add(it); } }
  for (let l = 0; l < L - 1; l++) for (const it of layers[l]) for (const c of it.down) if (!placed.has(c)) { placed.add(c); layers[c.layer].push(c); }
  for (const n of nodes) { const it = itemOf.get(n.id); if (!placed.has(it)) { placed.add(it); layers[it.layer].push(it); } }
  const pos = (arr, it) => (arr.length > 1 ? arr.indexOf(it) / (arr.length - 1) : 0.5);
  const sortBary = (l, dir) => {
    const arr = layers[l];
    const key = new Map(arr.map((it) => {
      const nb = it[dir];
      if (!nb.length) return [it, pos(arr, it)];
      return [it, nb.reduce((s, m) => s + pos(layers[m.layer], m), 0) / nb.length];
    }));
    const idx = new Map(arr.map((it, i) => [it, i]));
    arr.sort((a, b) => key.get(a) - key.get(b) || idx.get(a) - idx.get(b));
  };
  for (let it = 0; it < 8; it++) {
    for (let l = 1; l < L; l++) sortBary(l, 'up');
    for (let l = L - 2; l >= 0; l--) sortBary(l, 'down');
  }

  // 5. tamaños (texto envuelto por capa)
  const TW = (spec && spec.ancho) || C.TARGET_W, MINW = Math.min(C.MIN_W, TW); // spec.ancho: lienzo más estrecho = letra más grande al ajustar al ancho de la página
  const AVAIL = TW - 2 * C.MARGIN;
  const geo = (n) => (DG.tipos[n.tipo].forma === 'hexagono' ? { px: C.PADX_HEX, py: C.PADY_HEX } : { px: C.PADX, py: C.PADY });
  const layerH = [];
  // ancho de columna común: el más estrecho que permiten las capas con varios carriles
  let colW = C.MAX_NODE_W;
  for (const its of layers) {
    const nr = its.filter((i) => i.real).length, nd = its.length - nr;
    if (its.length >= 2 && nr >= 1) colW = Math.min(colW, Math.floor((AVAIL - (its.length - 1) * C.GAPX - nd * C.DUMMYW) / nr));
  }
  colW = Math.max(C.MIN_NODE_W, colW);
  for (let l = 0; l < L; l++) {
    const its = layers[l], reals = its.filter((i) => i.real);
    let h = 0;
    if (reals.length) {
      const maxPad = Math.max(...reals.map((i) => geo(i.node).px));
      let w;
      if (its.length >= 2) w = colW;
      else {
        const capInner = C.MAX_NODE_W - 2 * maxPad;
        w = Math.max(C.MIN_NODE_W, Math.ceil(balancedInner(reals[0].node.text, capInner, C.FONT, reals[0].node.bold)) + 2 * maxPad);
      }
      for (const i of reals) {
        const g = geo(i.node);
        i.w = w;
        i.lines = wrap(i.node.text, w - 2 * g.px, C.FONT, i.node.bold);
        i.h0 = Math.max(C.MIN_H, i.lines.length * C.LINE + 2 * g.py);
        h = Math.max(h, i.h0);
      }
    }
    layerH.push(h || 40);
    for (const i of its) i.h = layerH[l];
  }

  // 6. coordenada x: promedio de vecinos + separación mínima (PAV)
  for (const arr of layers) {
    const tot = arr.reduce((s, i) => s + i.w, 0) + (arr.length - 1) * C.GAPX;
    let x = -tot / 2;
    for (const i of arr) { i.x = x + i.w / 2; x += i.w + C.GAPX; }
  }
  // enlaces "rectos": un solo padre cuyo único hijo es este nodo (o cadenas de aristas largas) pesan más
  const linkW = (a, b) => {
    if (a.down.length === 1 && b.up.length === 1) return 50;
    // padre no decisor con varias salidas: la primera cae recta (las demás se abren al lado)
    if (a.real && a.node.tipo !== 'decision' && a.node.tipo !== 'router' && a.node.edges.length >= 2 && a.node.edges.slice(1).every((e) => e.label) && a.down[0] === b && b.up.length === 1 && b.real) return 50;
    return 1;
  };
  for (let iter = 0; iter < 600; iter++) {
    const seq = [...Array(L).keys()];
    if (iter % 2) seq.reverse();
    for (const l of seq) {
      const arr = layers[l];
      const wts = [];
      const des = arr.map((i, k) => {
        let sw = 0.1, sx = 0; // ancla débil al centro: evita que el grafo se desplace en diagonal
        for (const m of i.up) { const k = linkW(m, i); sw += k; sx += k * m.x; }
        for (const m of i.down) { const k = linkW(i, m); sw += k; sx += k * m.x; }
        // compactación: atrae suavemente a los vecinos de la misma capa (cierra huecos sin romper el orden)
        const lf = arr[k - 1], rt = arr[k + 1];
        if (lf) { sw += 0.4; sx += 0.4 * (lf.x + (lf.w + i.w) / 2 + C.GAPX); }
        if (rt) { sw += 0.4; sx += 0.4 * (rt.x - (rt.w + i.w) / 2 - C.GAPX); }
        wts.push(sw);
        return sx / sw;
      });
      pav(arr, des, wts);
    }
  }
  // alineación final: encaja cada nodo bajo su único padre (o sobre su único hijo) si cabe
  const fits = (arr, i, x) => {
    const k = arr.indexOf(i);
    const l = arr[k - 1], r = arr[k + 1];
    return (!l || x - i.w / 2 >= l.x + l.w / 2 + C.GAPX - 0.01) && (!r || x + i.w / 2 <= r.x - r.w / 2 - C.GAPX + 0.01);
  };
  for (let rep = 0; rep < 2; rep++) {
    for (let l = 1; l < L; l++) for (const i of layers[l]) {
      if (i.up.length === 1 && Math.abs(i.up[0].x - i.x) < 120 && fits(layers[l], i, i.up[0].x)) i.x = i.up[0].x;
    }
    for (let l = L - 2; l >= 0; l--) for (const i of layers[l]) {
      if (i.down.length === 1 && i.down[0].up.length === 1 && Math.abs(i.down[0].x - i.x) < 120 && fits(layers[l], i, i.down[0].x)) i.x = i.down[0].x;
    }
  }
  let minL = Infinity, maxR = -Infinity;
  for (const arr of layers) for (const i of arr) { minL = Math.min(minL, i.x - i.w / 2); maxR = Math.max(maxR, i.x + i.w / 2); }
  const legendTypes = TYPE_ORDER.filter((t) => nodes.some((n) => n.tipo === t));
  const titleW = textWidth(title, C.TITLE, true);

  // lazos de retroceso: carril lateral pegado a las filas implicadas si no hay cajas en el camino;
  // si no, por los huecos entre capas (con carril al costado de esas filas)
  const rowRange = (l0, l1) => {
    let lo = Infinity, hi = -Infinity;
    for (let l = Math.min(l0, l1); l <= Math.max(l0, l1); l++) for (const o of layers[l]) { lo = Math.min(lo, o.x - o.w / 2); hi = Math.max(hi, o.x + o.w / 2); }
    return [lo, hi];
  };
  const realSide = (it, dir) => layers[it.layer].some((o) => o !== it && o.real && (dir > 0 ? o.x > it.x : o.x < it.x));
  const dummiesSide = (it, dir) => layers[it.layer].filter((o) => !o.real && (dir > 0 ? o.x > it.x : o.x < it.x)).length;
  const offs = { l: 0, r: 0 };
  for (const b of backEdges) {
    const tw = b.label ? textWidth(b.label, C.LABEL, false) : 0;
    b.mode = 'gap';
    if (b.iu.layer !== b.iv.layer) {
      const opts = [];
      for (const dir of [1, -1]) if (!realSide(b.iu, dir) && !realSide(b.iv, dir)) opts.push({ dir, c: dummiesSide(b.iu, dir) + dummiesSide(b.iv, dir) });
      opts.sort((x, y) => x.c - y.c || y.dir - x.dir);
      if (opts.length) { b.mode = 'side'; b.dir = opts[0].dir; }
    }
    const dir = b.mode === 'side' ? b.dir : 1, key = dir > 0 ? 'r' : 'l';
    const [lo, hi] = rowRange(b.iu.layer, b.iv.layer);
    b.lane = dir > 0 ? hi + 26 + offs[key] : lo - 26 - offs[key];
    offs[key] += b.mode === 'side' ? tw + 30 : 22;
    if (dir > 0) maxR = Math.max(maxR, b.lane + 6 + (b.mode === 'side' ? tw + 8 : 0));
    else minL = Math.min(minL, b.lane - 6 - tw - 8);
  }
  const W = Math.ceil(Math.max(MINW, maxR - minL + 2 * C.MARGIN, titleW + 2 * C.MARGIN));
  const shift = C.MARGIN + (W - 2 * C.MARGIN - (maxR - minL)) / 2 - minL;
  for (const arr of layers) for (const i of arr) i.x += shift;
  for (const b of backEdges) b.lane += shift;

  // puertos de entrada: las aristas distintas (con etiqueta) que llegan al mismo nodo entran por puntos distintos;
  // las que convergen sin etiqueta (p. ej. hacia el fin) comparten un único puerto
  for (const arr of layers) for (const v of arr) {
    if (!v.real) continue;
    const inc = fwdEdges.filter((e) => e.iv === v);
    if (inc.length < 2) continue;
    const groups = [];
    let merged = null;
    for (const e of inc) {
      if (e.label) groups.push([e]);
      else { if (!merged) { merged = []; groups.push(merged); } merged.push(e); }
    }
    if (groups.length < 2) continue;
    const gx = (g) => g.reduce((t, e) => t + e.chain[e.chain.length - 2].x, 0) / g.length;
    groups.sort((x, y) => gx(x) - gx(y));
    const step = Math.min(90, Math.max(30, (v.w - 100) / (groups.length - 1)));
    groups.forEach((g, i) => { for (const e of g) e.port = v.x + (i - (groups.length - 1) / 2) * step; });
  }

  // 7. segmentos por hueco entre capas y asignación de pistas
  const nGaps = L + 1;
  const segsByGap = Array.from({ length: nGaps }, () => []);
  const labeled = new Array(nGaps).fill(false);
  for (const e of fwdEdges) {
    for (let k = 0; k + 1 < e.chain.length; k++) {
      const a = e.chain[k], b = e.chain[k + 1];
      const last = k + 2 === e.chain.length;
      const s = { gap: b.layer, src: a.id, dst: b.id, xa: a.x, xb: last && e.port !== undefined ? e.port : b.x, lab: !!e.label };
      e.segs.push(s);
      segsByGap[s.gap].push(s);
    }
    if (e.label) labeled[e.chain[1].layer] = true;
  }
  backEdges.forEach((b, k) => {
    if (b.mode === 'side') return;
    b.s1 = { gap: b.iu.layer + 1, src: b.iu.id, dst: '#lane' + k, xa: b.iu.x, xb: b.lane };
    b.s2 = { gap: b.iv.layer, src: '#lane' + k, dst: '#arr' + k, xa: b.lane, xb: b.iv.x, lab: true };
    segsByGap[b.s1.gap].push(b.s1);
    segsByGap[b.s2.gap].push(b.s2);
    if (b.label) labeled[b.s1.gap] = true;
  });
  const gapH = [], gapPad = [], gapTracks = [];
  for (let g = 0; g < nGaps; g++) {
    const segs = segsByGap[g];
    segs.forEach((s) => { s.straight = Math.abs(s.xa - s.xb) < 0.5; });
    const par = segs.map((_, i) => i);
    const find = (i) => (par[i] === i ? i : (par[i] = find(par[i])));
    const uni = (a, b) => { par[find(a)] = find(b); };
    const bySrc = new Map(), byDst = new Map();
    segs.forEach((s, i) => {
      (bySrc.get(s.src) || bySrc.set(s.src, []).get(s.src)).push(i);
      const dk = s.lab ? '#' + i : s.dst + '@' + Math.round(s.xb);
      (byDst.get(dk) || byDst.set(dk, []).get(dk)).push(i);
    });
    for (const l of bySrc.values()) for (let i = 1; i < l.length; i++) uni(l[0], l[i]);
    for (const l of byDst.values()) if (l.length > 1 && l.every((i) => bySrc.get(segs[i].src).length === 1)) for (let i = 1; i < l.length; i++) uni(l[0], l[i]);
    const groups = new Map();
    segs.forEach((s, i) => { const r = find(i); (groups.get(r) || groups.set(r, []).get(r)).push(s); });
    const gl = [];
    for (const members of groups.values()) {
      if (members.every((s) => s.straight)) continue;
      const lo = Math.min(...members.map((s) => Math.min(s.xa, s.xb))), hi = Math.max(...members.map((s) => Math.max(s.xa, s.xb)));
      gl.push({ lo, hi, members });
    }
    gl.sort((a, b) => a.lo - b.lo || a.hi - b.hi);
    const tracks = [];
    for (const grp of gl) {
      let t = tracks.findIndex((ivs) => ivs.every((v) => v.hi + 16 < grp.lo || grp.hi + 16 < v.lo));
      if (t < 0) { t = tracks.length; tracks.push([]); }
      tracks[t].push(grp);
      for (const s of grp.members) s.track = t;
    }
    const T = tracks.length, pad = labeled[g] ? 40 : 28;
    gapTracks.push(T);
    gapPad.push(pad);
    if (segs.length === 0 && (g === 0 || g === L)) gapH.push(0);
    else if (T > 0) gapH.push(Math.max(58, 2 * pad + (T - 1) * C.TRACK));
    else gapH.push(labeled[g] ? 74 : 58);
  }
  if (!segsByGap[0].length) gapH[0] = 0;
  if (!segsByGap[L].length) gapH[L] = 0;

  // 8. coordenada y
  const layerTop = [], gapTop = [];
  let y = C.TOP;
  for (let l = 0; l <= L; l++) {
    gapTop.push(y);
    y += gapH[l];
    if (l < L) { layerTop.push(y); y += layerH[l]; }
  }
  const trackY = (s) => gapTop[s.gap] + gapPad[s.gap] + s.track * C.TRACK;
  for (let l = 0; l < L; l++) for (const i of layers[l]) { i.top = layerTop[l]; i.bottom = layerTop[l] + layerH[l]; }

  // 9. caminos de aristas
  const clean = (pts) => {
    const o = [];
    for (const p of pts) {
      if (o.length && Math.abs(o[o.length - 1][0] - p[0]) < 0.01 && Math.abs(o[o.length - 1][1] - p[1]) < 0.01) continue;
      o.push(p);
    }
    for (let i = o.length - 2; i > 0; i--) {
      const a = o[i - 1], b = o[i], c = o[i + 1];
      if ((Math.abs(a[0] - b[0]) < 0.01 && Math.abs(b[0] - c[0]) < 0.01) || (Math.abs(a[1] - b[1]) < 0.01 && Math.abs(b[1] - c[1]) < 0.01)) o.splice(i, 1);
    }
    return o;
  };
  const edges = [];
  for (const e of fwdEdges) {
    const pts = [[e.iu.x, e.iu.bottom]];
    e.chain.forEach((b, k) => {
      if (k === 0) return;
      const s = e.segs[k - 1], a = e.chain[k - 1];
      if (s.straight) pts.push([a.x, b.top]);
      else { const ty = trackY(s); pts.push([a.x, ty], [s.xb, ty], [s.xb, b.top]); }
      if (!b.real) pts.push([b.x, b.bottom]);
    });
    // etiqueta sobre el primer tramo vertical corto, justo antes del siguiente elemento
    edges.push({ from: e.iu.id, to: e.iv.id, label: e.label, points: clean(pts), back: false, lx: e.segs[0].xb + 8, ly: e.chain[1].top - 16, anchor: 'start' });
  }
  for (const b of backEdges) {
    if (b.mode === 'side') {
      const dir = b.dir, my = (b.iu.top + b.iu.bottom) / 2, vy = (b.iv.top + b.iv.bottom) / 2;
      const p = clean([[b.iu.x + dir * b.iu.w / 2, my], [b.lane, my], [b.lane, vy], [b.iv.x + dir * b.iv.w / 2, vy]]);
      edges.push({ from: b.iu.id, to: b.iv.id, label: b.label, points: p, back: true, lx: b.lane + dir * 8, ly: my - 12, anchor: dir > 0 ? 'start' : 'end' });
      continue;
    }
    const y1 = trackY(b.s1), y2 = trackY(b.s2);
    const p = clean([[b.iu.x, b.iu.bottom], [b.iu.x, y1], [b.lane, y1], [b.lane, y2], [b.iv.x, y2], [b.iv.x, b.iv.top]]);
    edges.push({ from: b.iu.id, to: b.iv.id, label: b.label, points: p, back: true, lx: b.iu.x + 8, ly: b.iu.bottom + 24, anchor: 'start' });
  }

  // 10. leyenda
  const legend = [];
  const leyendas = (spec && spec.leyendas) || {};
  let lx = C.MARGIN, ly = y + 36;
  const rowH = 36, sw = 38;
  const used = legendTypes.map((t) => ({ tipo: t, texto: leyendas[t] || DG.tipos[t].leyenda }));
  for (const u of used) {
    const wText = textWidth(u.texto, C.LEG, false), wItem = sw + 10 + wText + 34;
    if (lx > C.MARGIN && lx + wItem - 34 > W - C.MARGIN) { lx = C.MARGIN; ly += rowH; }
    legend.push({ ...u, x: lx, y: ly });
    lx += wItem;
  }
  const height = Math.ceil(ly + 26 + C.MARGIN * 0.6);

  const outNodes = [];
  for (const arr of layers) for (const i of arr) if (i.real) {
    outNodes.push({
      id: i.id, tipo: i.node.tipo, bold: i.node.bold, lines: i.lines, layer: i.layer,
      x: i.x - i.w / 2, y: i.top, w: i.w, h: i.h,
    });
  }
  // las etiquetas de arista no pueden quedar fuera del lienzo: se ensancha (y se desplaza) si hace falta
  let W2 = W, extraL = 0, extraR = 0;
  for (const e of edges) {
    if (!e.label) continue;
    const tw = textWidth(e.label, C.LABEL, false), x0 = e.anchor === 'end' ? e.lx - tw : e.lx;
    extraR = Math.max(extraR, x0 + tw + 8 - (W - C.MARGIN * 0.4));
    extraL = Math.max(extraL, C.MARGIN * 0.4 - (x0 - 4));
  }
  extraL = Math.ceil(Math.max(0, extraL)); extraR = Math.ceil(Math.max(0, extraR));
  if (extraL || extraR) {
    W2 = W + extraL + extraR;
    for (const n of outNodes) n.x += extraL;
    for (const e of edges) { e.lx += extraL; for (const p of e.points) p[0] += extraL; }
  }
  return { width: W2, height, title, titleY: 58, nodes: outNodes, edges, legend };
}

// ---------- SVG ----------
const BOLD_FAMILY = "'Poppins SemiBold', Poppins, sans-serif";
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const num = (v) => Math.round(v * 100) / 100;
const col = (h) => '#' + String(h).replace(/^#/, '');

function shapeSvg(n, st) {
  const fill = col(st.relleno), stroke = col(st.borde), sw = C.STROKE;
  const dash = st.trazo === 'punteado' ? ' stroke-dasharray="11 8"' : '';
  const x = num(n.x + sw / 2), y = num(n.y + sw / 2), w = num(n.w - sw), h = num(n.h - sw);
  const attr = `fill="${fill}" stroke="${stroke}" stroke-width="${sw}"${dash} stroke-linejoin="round"`;
  if (st.forma === 'hexagono') {
    const ins = 30, X = n.x + sw / 2, Y = n.y + sw / 2, R = n.x + n.w - sw / 2, B = n.y + n.h - sw / 2, M = n.y + n.h / 2;
    const pts = [[X + ins, Y], [R - ins, Y], [R, M], [R - ins, B], [X + ins, B], [X, M]].map((p) => p.map(num).join(',')).join(' ');
    return `<polygon points="${pts}" ${attr}/>`;
  }
  if (st.forma === 'pildora') return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${num(h / 2)}" ${attr}/>`;
  if (st.forma === 'rectangulo') return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${attr}/>`;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${DG.radio}" ${attr}/>`;
}

function build(spec) {
  const lay = layoutDiagram(spec);
  const o = [];
  o.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${lay.width}" height="${lay.height}" viewBox="0 0 ${lay.width} ${lay.height}" font-family="Poppins, sans-serif">`);
  o.push(`<rect width="${lay.width}" height="${lay.height}" fill="#ffffff"/>`);
  if (lay.title) o.push(`<text x="${C.MARGIN}" y="${lay.titleY}" font-size="${C.TITLE}" font-family="${BOLD_FAMILY}" fill="#1a1d24">${esc(lay.title)}</text>`);
  const arrow = C.ARROW;
  for (const e of lay.edges) {
    const p = e.points, end = p[p.length - 1], prev = p[p.length - 2];
    const dx = Math.sign(end[0] - prev[0]), dy = Math.sign(end[1] - prev[1]);
    const d = p.map((q, i) => (i === p.length - 1 ? `L${num(q[0] - dx * 11)} ${num(q[1] - dy * 11)}` : `${i ? 'L' : 'M'}${num(q[0])} ${num(q[1])}`)).join(' ');
    o.push(`<path d="${d}" fill="none" stroke="${arrow}" stroke-width="2.2" stroke-linejoin="miter"/>`);
    const bx = end[0] - dx * 12, by = end[1] - dy * 12, px = dy * 6.5, py = dx * 6.5;
    o.push(`<polygon points="${num(end[0])},${num(end[1])} ${num(bx + px)},${num(by + py)} ${num(bx - px)},${num(by - py)}" fill="${arrow}"/>`);
  }
  for (const n of lay.nodes) {
    const st = DG.tipos[n.tipo];
    o.push(`<g data-id="${esc(n.id)}">${shapeSvg(n, st)}`);
    const k = n.lines.length, cy = n.y + n.h / 2, weight = n.bold ? ` font-family="${BOLD_FAMILY}"` : '';
    n.lines.forEach((ln, i) => {
      const base = cy - ((k - 1) * C.LINE) / 2 + i * C.LINE + C.FONT * 0.35;
      o.push(`<text x="${num(n.x + n.w / 2)}" y="${num(base)}" font-size="${C.FONT}" text-anchor="middle"${weight} fill="${col(st.texto)}">${esc(ln)}</text>`);
    });
    o.push('</g>');
  }
  for (const e of lay.edges) {
    if (!e.label) continue;
    const tw = textWidth(e.label, C.LABEL, false), x0 = e.anchor === 'end' ? e.lx - tw : e.lx;
    o.push(`<rect x="${num(x0 - 4)}" y="${num(e.ly - C.LABEL + 1)}" width="${num(tw + 8)}" height="${C.LABEL + 7}" rx="3" fill="#ffffff"/>`);
    o.push(`<text x="${num(e.lx)}" y="${num(e.ly)}" font-size="${C.LABEL}" text-anchor="${e.anchor || 'start'}" fill="${col(DG.etiqueta_arista)}">${esc(e.label)}</text>`);
  }
  for (const it of lay.legend) {
    const st = DG.tipos[it.tipo];
    o.push(`<rect x="${it.x + 1}" y="${it.y - 14}" width="34" height="26" rx="6" fill="${col(st.relleno)}" stroke="${col(st.borde)}" stroke-width="2"${st.trazo ? ' stroke-dasharray="6 4"' : ''}/>`);
    o.push(`<text x="${it.x + 46}" y="${it.y + 6}" font-size="${C.LEG}" fill="#555b66">${esc(it.texto)}</text>`);
  }
  o.push('</svg>');
  return { svg: o.join('\n'), layout: lay };
}

function renderDiagramSvg(spec, opts) { return build(spec, opts).svg; }

function renderDiagramPng(spec, opts) {
  const { Resvg } = require('@resvg/resvg-js');
  const { svg } = build(spec, opts);
  const width = (opts && opts.width) || C.TARGET_W;
  const r = new Resvg(svg, {
    background: '#ffffff',
    fitTo: { mode: 'width', value: width },
    font: { fontFiles: [FONT_REGULAR, FONT_SEMIBOLD], loadSystemFonts: false, defaultFontFamily: 'Poppins' },
  });
  const img = r.render();
  return { png: img.asPng(), width: img.width, height: img.height };
}

module.exports = { layoutDiagram, renderDiagramSvg, renderDiagramPng, validateGraph, textWidth };
