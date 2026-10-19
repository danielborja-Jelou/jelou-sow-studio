// Simulador del bot (HTML autocontenido) generado desde el grafo `agentes` del SOW.
// Un solo archivo HTML: CSS y JS inline, sin dependencias externas.
//   buildHtml(sow, { diagramas: { R1: "<svg…>" } }) -> string HTML
// Exporta también las funciones puras (engine, buildScreens, analyzePaths) para probarlas.
"use strict";

// ---------------------------------------------------------------------------
// MOTOR (puro). Se ejecuta tal cual en Node (pruebas) y dentro del HTML (simulador).
// Debe ser autocontenido: no puede referenciar nada fuera de esta función.
// ---------------------------------------------------------------------------
function engineFactory() {
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return ESC[c]; }); }
  var PEND = /\[[^\]]*\]|POR DEFINIR|POR COMPLETAR/gi;
  // Escapa y pinta en rojo lo pendiente ([corchetes], POR DEFINIR, POR COMPLETAR).
  function fmt(s) {
    return esc(s).replace(PEND, function (m) { return '<span class="pend">' + m + "</span>"; }).replace(/\r?\n/g, "<br>");
  }
  function norm(s) {
    return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9ñ]+/g, " ").replace(/\s+/g, " ").trim();
  }
  function bigrams(s) { var o = {}, n = 0; for (var i = 0; i < s.length - 1; i++) { var b = s.substr(i, 2); o[b] = (o[b] || 0) + 1; n++; } return { m: o, n: n }; }
  function sim(a, b) {
    var ra = String(a == null ? "" : a).trim().toLowerCase(), rb = String(b == null ? "" : b).trim().toLowerCase();
    a = norm(a); b = norm(b);
    if (!a || !b) return ra && ra === rb ? 1 : 0;
    if (a === b) return 1;
    var pa = " " + a + " ", pb = " " + b + " ";
    if (pa.indexOf(pb) >= 0 || pb.indexOf(pa) >= 0) return 0.85;
    if (a.length < 3 || b.length < 3) return 0;
    var x = bigrams(a), y = bigrams(b), inter = 0;
    for (var k in x.m) if (y.m[k]) inter += Math.min(x.m[k], y.m[k]);
    return x.n + y.n ? (2 * inter) / (x.n + y.n) : 0;
  }
  function matchLabel(text, labels) {
    var best = -1, score = 0;
    for (var i = 0; i < labels.length; i++) { var s = sim(text, labels[i]); if (s > score) { score = s; best = i; } }
    return score >= 0.5 ? best : -1;
  }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function edgesOf(node) {
    return arr(node && node.siguiente).filter(function (e) { return e && e.a; }).map(function (e) { return { a: String(e.a), si: e.si == null ? "" : String(e.si) }; });
  }
  var POSITIVE = /^\s*(s[ií]\b|ok\b|[eé]xito|exitos|v[aá]lid|correct|aprob|encontr|disponible|complet|confirm)/i;
  // Arista "principal" (camino feliz): la primera con etiqueta positiva; si no, la primera.
  function primaryEdge(node) {
    var es = edgesOf(node);
    for (var i = 0; i < es.length; i++) if (POSITIVE.test(es[i].si)) return es[i];
    return es[0] || null;
  }
  // Arista que corresponde a una etiqueta (texto de botón/fila/condición).
  function pickEdge(node, label) {
    var es = edgesOf(node), i;
    for (i = 0; i < es.length; i++) if (es[i].si && norm(es[i].si) === norm(label) && norm(label)) return es[i];
    var labeled = es.filter(function (e) { return e.si; });
    var j = matchLabel(label, labeled.map(function (e) { return e.si; }));
    if (j >= 0) return labeled[j];
    for (i = 0; i < es.length; i++) if (!es[i].si) return es[i];
    if (es.length === 1) return es[0];
    return null;
  }
  function index(agent) {
    var byId = {}, pasos = arr(agent && agent.pasos);
    pasos.forEach(function (p) { if (p && p.id != null) byId[String(p.id)] = p; });
    return { byId: byId, first: pasos.length ? String(pasos[0].id) : null, pasos: pasos };
  }
  // Valor de ejemplo de un campo: el que declara el SOW (ejemplo) o uno genérico según su tipo.
  function sample(campo) {
    var t = campo && campo.tipo;
    if (campo && campo.ejemplo != null && String(campo.ejemplo) !== "") return String(campo.ejemplo);
    if (t === "correo") return "persona@ejemplo.com";
    if (t === "numero") return "12345";
    if (t === "fecha") return "01/01/1990";
    if (t === "telefono") return "3000000000";
    if (t === "archivo") return "documento.pdf";
    if (t === "casilla") return "Sí";
    if (t === "selector") return arr(campo.opciones).map(String)[0] || "Opción de ejemplo";
    return "Texto de ejemplo";
  }
  // Definición del formulario de un paso: `formulario` (preferido) o `webview` (alias antiguo).
  function formDef(node) { return (node && (node.formulario || node.webview)) || {}; }
  function formTool(node) {
    var f = formDef(node), h = String((node && node.herramienta) || f.herramienta || "por_definir").toLowerCase();
    return h === "flows" || h === "webview" ? h : "por_definir";
  }
  function intName(agent, node) {
    var m = (agent && agent.intNombres) || {}, id = node && node.integracion;
    return (id && m[id]) || id || "el sistema";
  }
  function isForm(t) { return t === "webview" || t === "formulario"; }
  function sampleData(wv) {
    return arr(wv && wv.campos).map(function (c) { return { etiqueta: c.etiqueta || "Campo", tipo: c.tipo || "texto", valor: sample(c) }; });
  }
  function sys(kind, text) { return { t: "sys", kind: kind, text: text }; }
  function bot(node, extra) {
    var o = { t: "bot", id: node.id, text: node.mensaje == null ? "" : String(node.mensaje), botones: arr(node.botones).map(String), lista: arr(node.lista).map(String) };
    if (extra) for (var k in extra) o[k] = extra[k];
    return o;
  }
  function labelsOf(node) { return edgesOf(node).filter(function (e) { return e.si; }).map(function (e) { return e.si; }); }
  function endWait(id) { return { kind: "end", id: id, options: [], buttons: [], list: [] }; }
  var MAX_AUTO = 60;

  // Avanza desde `id` resolviendo solos los nodos automáticos hasta uno que espera al usuario.
  function run(agent, id, ctx) {
    var g = index(agent), ev = [], n = 0;
    ctx = ctx || {};
    while (true) {
      if (++n > MAX_AUTO) { ev.push(sys("end", "Se detuvo la simulación para evitar un ciclo infinito.")); return { events: ev, wait: endWait(id) }; }
      var node = g.byId[id];
      if (!node) { ev.push(sys("end", "Fin: el paso «" + id + "» no existe en el flujo.")); return { events: ev, wait: endWait(id) }; }
      var es = edgesOf(node), t = node.tipo, e;
      var go = function (edge) { id = edge.a; };
      if (t === "usuario") {
        if (ctx.autoUser) {
          ctx.autoUser = false;
          ev.push({ t: "user", text: node.mensaje || node.diagrama || "Hola" });
          e = primaryEdge(node);
          if (!e) return { events: ev, wait: endWait(node.id) };
          go(e); continue;
        }
        return { events: ev, wait: { kind: "text", id: node.id, options: labelsOf(node), buttons: [], list: [], example: node.mensaje || "", etapa: node.etapa || "" } };
      }
      if (t === "router") {
        ev.push(sys("wait", "Interpretando tu solicitud…"));
        e = null;
        if (ctx.lastInput && labelsOf(node).length) e = pickEdge(node, ctx.lastInput);
        e = (e && e.si) ? e : primaryEdge(node);
        if (!e) { ev.push(sys("end", "Fin del flujo")); return { events: ev, wait: endWait(node.id) }; }
        go(e); continue;
      }
      if (t === "api" || t === "decision") {
        if (t === "api") ev.push(sys("wait", "Consultando " + intName(agent, node) + "…"));
        if (es.length > 1) return { events: ev, wait: { kind: "outcome", id: node.id, options: es.map(function (x, i) { return x.si || ("Salida " + (i + 1)); }), buttons: [], list: [], title: node.diagrama || node.etapa || "", etapa: node.etapa || "" } };
        if (!es.length) { ev.push(sys("end", "Fin del flujo")); return { events: ev, wait: endWait(node.id) }; }
        go(es[0]); continue;
      }
      if (t === "tercero") {
        ev.push(sys("wait", "Proceso del cliente / tercero en curso: " + (node.etapa || node.diagrama || node.id) + "…"));
        e = primaryEdge(node);
        if (!e) { ev.push(sys("end", "Fin del flujo")); return { events: ev, wait: endWait(node.id) }; }
        go(e); continue;
      }
      if (isForm(t)) {
        var wv = formDef(node);
        ev.push(sys("form", "Se abre el formulario: " + (wv.titulo || node.etapa || "Formulario")));
        // `kind: "webview"` es el nombre interno de la espera de un formulario (WhatsApp Flow o WebView).
        return { events: ev, wait: { kind: "webview", id: node.id, options: [], buttons: [], list: [], webview: wv, herramienta: formTool(node), etapa: node.etapa || "", text: node.mensaje == null ? "" : String(node.mensaje) } };
      }
      if (t === "asesor") {
        if (node.mensaje) ev.push(bot(node));
        ev.push(sys("derive", "Conversación derivada a un asesor humano"));
        e = primaryEdge(node);
        if (!e) return { events: ev, wait: endWait(node.id) };
        go(e); continue;
      }
      if (t === "fin") {
        if (node.mensaje) ev.push(bot(node));
        ev.push(sys("end", "Conversación finalizada"));
        return { events: ev, wait: endWait(node.id) };
      }
      // mensaje (y cualquier tipo desconocido)
      ev.push(bot(node));
      var b = arr(node.botones).map(String), l = arr(node.lista).map(String);
      if (b.length || l.length) return { events: ev, wait: { kind: "choice", id: node.id, options: b.concat(l), buttons: b, list: l, etapa: node.etapa || "" } };
      if (!es.length) { ev.push(sys("end", "Fin del flujo")); return { events: ev, wait: endWait(node.id) }; }
      if (es.length === 1) { go(es[0]); continue; }
      return { events: ev, wait: { kind: "outcome", id: node.id, options: es.map(function (x, i) { return x.si || ("Salida " + (i + 1)); }), buttons: [], list: [], title: node.etapa || "", etapa: node.etapa || "" } };
    }
  }

  function start(agent) {
    var g = index(agent), ctx = { autoUser: true, lastInput: "" };
    if (!g.first) return { events: [sys("end", "El agente no tiene pasos.")], wait: endWait(null), ctx: ctx };
    var r = run(agent, g.first, ctx);
    r.ctx = ctx;
    return r;
  }

  function summarize(data) {
    return data.map(function (d) { return d.etiqueta + ": " + d.valor; }).join("\n");
  }

  // input: {type:"choice"|"outcome", value} | {type:"text", text} | {type:"submit", data?}
  function answer(agent, wait, input, ctx) {
    ctx = ctx || {};
    var g = index(agent), node = g.byId[wait && wait.id], es, edge, idx, label, text, ue;
    if (!wait || wait.kind === "end" || !node) return { events: [], wait: wait };
    if (wait.kind === "choice" || wait.kind === "outcome" || wait.kind === "text") {
      if (input.type === "choice" || input.type === "outcome") { label = String(input.value); idx = wait.options.indexOf(label); }
      else { text = String(input.text == null ? "" : input.text).trim(); label = text; idx = wait.options.length ? matchLabel(text, wait.options) : -1; if (idx >= 0) label = wait.options[idx]; }
      if (wait.kind === "text" && input.type === "text") {
        ctx.lastInput = text;
        ue = { t: "user", text: text };
        es = edgesOf(node);
        edge = labelsOf(node).length && idx >= 0 ? pickEdge(node, label) : null;
        edge = edge || primaryEdge(node);
        if (!edge) return { events: [ue, sys("end", "Fin del flujo")], wait: endWait(node.id) };
        var rt = run(agent, edge.a, ctx);
        return { events: [ue].concat(rt.events), wait: rt.wait };
      }
      if (wait.kind === "text") { // elegir una condición con el panel
        ctx.lastInput = label; edge = pickEdge(node, label) || primaryEdge(node);
        var rt2 = edge ? run(agent, edge.a, ctx) : { events: [sys("end", "Fin del flujo")], wait: endWait(node.id) };
        return { events: [{ t: "user", text: node.mensaje || label }].concat(rt2.events), wait: rt2.wait };
      }
      if (idx < 0 && wait.kind === "choice") {
        var rem = { t: "bot", id: node.id, reminder: true, text: "No entendí tu respuesta. Elige una de estas opciones:", botones: wait.buttons.slice(), lista: wait.list.slice() };
        return { events: [{ t: "user", text: text }, rem], wait: wait };
      }
      if (idx < 0) {
        return { events: [{ t: "user", text: text }, sys("sim", "Elige una de las salidas: " + wait.options.join(" · "))], wait: wait };
      }
      ctx.lastInput = label;
      edge = wait.kind === "outcome" ? edgesOf(node)[idx] : pickEdge(node, label);
      if (!edge) edge = primaryEdge(node);
      var first = wait.kind === "outcome" ? sys("sim", "Resultado simulado: " + label) : { t: "user", text: label };
      if (!edge) return { events: [first, sys("end", "Fin del flujo")], wait: endWait(node.id) };
      var r = run(agent, edge.a, ctx);
      return { events: [first].concat(r.events), wait: r.wait };
    }
    if (wait.kind === "webview") {
      var data = (input && input.data) || sampleData(wait.webview);
      var wvt = (wait.webview && wait.webview.titulo) || node.etapa || "Formulario";
      var ub = { t: "user", text: "📋 " + wvt + " — enviado" + (data.length ? "\n" + summarize(data) : ""), form: true };
      es = edgesOf(node);
      if (es.length > 1) return { events: [ub], wait: { kind: "outcome", id: node.id, options: es.map(function (x, i) { return x.si || ("Salida " + (i + 1)); }), buttons: [], list: [], title: wvt, etapa: node.etapa || "" } };
      if (!es.length) return { events: [ub, sys("end", "Fin del flujo")], wait: endWait(node.id) };
      ctx.lastInput = "";
      var r3 = run(agent, es[0].a, ctx);
      return { events: [ub].concat(r3.events), wait: r3.wait };
    }
    return { events: [], wait: wait };
  }

  // Cuenta mensajes del bot en una lista de ids.
  function countBot(g, ids) {
    var n = 0;
    ids.forEach(function (id) { var p = g.byId[id]; if (!p) return; if (p.tipo === "mensaje" || ((p.tipo === "asesor" || p.tipo === "fin") && p.mensaje) || (!p.tipo)) n++; });
    return n;
  }
  // Cuenta los pasos de un camino por tipo: lo que la persona atraviesa (no solo mensajes del bot).
  function countsOf(g, ids) {
    var c = { mensajes: 0, formularios: 0, sistemas: 0, decisiones: 0, pasos: 0 };
    ids.forEach(function (id) {
      var p = g.byId[id]; if (!p) return;
      c.pasos++;
      if (isForm(p.tipo)) c.formularios++;
      else if (p.tipo === "api") c.sistemas++;
      else if (p.tipo === "decision") c.decisiones++;
      else if (p.tipo === "mensaje" || ((p.tipo === "asesor" || p.tipo === "fin") && p.mensaje) || !p.tipo) c.mensajes++;
    });
    return c;
  }
  function describeCounts(c) {
    var o = [];
    if (c.mensajes) o.push(c.mensajes + (c.mensajes === 1 ? " mensaje del bot" : " mensajes del bot"));
    if (c.formularios) o.push(c.formularios + (c.formularios === 1 ? " formulario" : " formularios"));
    if (c.sistemas) o.push(c.sistemas + (c.sistemas === 1 ? " consulta a un sistema" : " consultas a sistemas"));
    return o.length ? o.join(" · ") : "sin pasos";
  }
  function mainPath(agent) {
    var g = index(agent), path = [], seen = {}, id = g.first;
    while (id && !seen[id] && g.byId[id]) { seen[id] = 1; path.push(id); var e = primaryEdge(g.byId[id]); id = e && e.a; }
    return path;
  }
  // Camino principal + otros caminos (hasta `max`), sin repetir nodos dentro de un camino.
  function analyzePaths(agent, max) {
    max = max || 8;
    var g = index(agent), main = mainPath(agent), out = [], total = 0, LIM = 200;
    var mainKey = main.join(">");
    function dfs(id, path, labels, seen) {
      if (total >= LIM) return;
      var node = g.byId[id], es = edgesOf(node);
      path = path.concat(id); seen = Object.assign({}, seen); seen[id] = 1;
      var nexts = es.filter(function (e) { return g.byId[e.a] && !seen[e.a]; });
      if (!nexts.length || path.length > 40) {
        total++;
        if (path.join(">") !== mainKey) out.push({ ids: path, n: countBot(g, path), c: countsOf(g, path), label: labels.join(" → ") || "variante", fin: node.tipo });
        return;
      }
      nexts.forEach(function (e) { dfs(e.a, path, (es.length > 1 && e.si) ? labels.concat(e.si) : labels, seen); });
    }
    if (g.first) dfs(g.first, [], [], {});
    var seenLabel = {}, uniq = [];
    out.forEach(function (p) { var k = p.label + "|" + p.n; if (!seenLabel[k]) { seenLabel[k] = 1; uniq.push(p); } });
    return { principal: { ids: main, n: countBot(g, main), c: countsOf(g, main) }, otros: uniq.slice(0, max), totalOtros: uniq.length };
  }

  return { esc: esc, fmt: fmt, norm: norm, sim: sim, matchLabel: matchLabel, edgesOf: edgesOf, primaryEdge: primaryEdge, pickEdge: pickEdge, index: index, sampleData: sampleData, run: run, start: start, answer: answer, mainPath: mainPath, analyzePaths: analyzePaths, countBot: countBot, countsOf: countsOf, describeCounts: describeCounts, formDef: formDef, formTool: formTool, intName: intName, isForm: isForm };
}

const E = engineFactory();

// ---------------------------------------------------------------------------
// Galería de pantallas (estática, en servidor)
// ---------------------------------------------------------------------------
const PENDING_RE = /POR DEFINIR|POR COMPLETAR/i;
const isPending = (s) => PENDING_RE.test(String(s || ""));
const TOOL_LABEL = { flows: "WhatsApp Flow", webview: "WebView", por_definir: "WhatsApp Flow / WebView" };
const ERR_RE = /error|fall|inv[aá]lid|rechaz|insuf|timeout|sin |^no\b|no encontr|no v[aá]lid|incorrect|cancel/i;

function personaOf(agent) {
  const p = agent && agent.persona;
  if (p && typeof p === "object") return { nombre: p.nombre || "", tono: p.tono || "", apelativo: p.apelativo || "" };
  if (typeof p === "string") return { nombre: p, tono: "", apelativo: "" };
  return { nombre: "", tono: "", apelativo: "" };
}

function buildScreens(agent, o) {
  o = o || {};
  const MAX = o.maxScreens || 40, MAXD = o.maxDepth || 60, HIST = 3;
  const g = E.index(agent), screens = [], seen = {}, main = new Set(E.mainPath(agent));
  const byNode = {};
  function nodeLabel(n) { return n.id + " — " + (n.etapa || n.tipo || "paso"); }
  function visit(id, hist, branch, depth, parent, viaLabel) {
    const node = g.byId[id];
    if (!node) return;
    if (seen[id]) { if (parent && viaLabel !== undefined) parent.links.push({ label: viaLabel, to: nodeLabel(node), id }); return; }
    if (depth > MAXD || screens.length >= MAX) return;
    seen[id] = true;
    const t = node.tipo, es = E.edgesOf(node);
    let h = hist.slice(), screen = null;
    const tone = node.tipo === "asesor" ? "adv" : (branch && ERR_RE.test(branch) ? "err" : (main.has(id) ? "ok" : "alt"));
    const base = { id, label: nodeLabel(node), tipo: t, main: main.has(id), branch: main.has(id) ? "" : (branch || "rama"), tone, links: [], etapa: node.etapa || "" };
    const asBot = () => ({ r: "bot", text: node.mensaje || "", botones: (node.botones || []).map(String), lista: (node.lista || []).map(String) });
    if (t === "usuario") {
      h.push({ r: "user", text: node.mensaje || node.diagrama || "" });
    } else if (t === "router" || t === "api") {
      h.push({ r: "sys", kind: "wait", text: t === "api" ? "Consultando " + E.intName(agent, node) + "…" : "Interpretando tu solicitud…" });
    } else if (E.isForm(t)) {
      const fd = E.formDef(node);
      screen = Object.assign({ kind: "form", hist: h.slice(-HIST), webview: fd, herramienta: E.formTool(node) }, base);
      h.push({ r: "user", text: "📋 " + (fd.titulo || "Formulario") + " — enviado" });
    } else if (t === "tercero") {
      screen = Object.assign({ kind: "ext", hist: [], ext: { titulo: node.etapa || "Proceso externo", texto: node.diagrama || node.mensaje || "" } }, base);
      h.push({ r: "sys", kind: "wait", text: "Proceso externo: " + (node.etapa || node.id) + "…" });
    } else if (t === "decision") {
      // sin pantalla propia
    } else {
      // mensaje | asesor | fin
      const showScreen = t !== "fin" || !!node.mensaje;
      const cur = asBot();
      if (t === "asesor" && !cur.text) cur.text = "Te conecto con un asesor para continuar.";
      if (showScreen) {
        const hh = h.slice(-HIST);
        const bubbles = hh.concat([cur]);
        if (t === "asesor") bubbles.push({ r: "sys", kind: "derive", text: "Conversación derivada a un asesor humano" });
        if (t === "fin") bubbles.push({ r: "sys", kind: "end", text: "Conversación finalizada" });
        screen = Object.assign({ kind: cur.lista.length ? "sheet" : "chat", hist: bubbles, lista: cur.lista }, base);
        h.push(cur);
      }
    }
    if (screen) { screens.push(screen); byNode[id] = screen; }
    const owner = screen || parent;
    const multi = es.length > 1;
    es.forEach((e) => {
      let hh = h;
      const opts = (node.botones || []).concat(node.lista || []).map(String);
      if (e.si && opts.length && (t === "mensaje" || !t) && E.matchLabel(e.si, opts) >= 0) hh = h.concat([{ r: "user", text: e.si }]);
      visit(e.a, hh, multi && e.si ? e.si : branch, depth + 1, owner, e.si);
    });
  }
  if (g.first) visit(g.first, [], "", 0, null, undefined);
  return screens;
}

// ---------------------------------------------------------------------------
// Render HTML — aspecto de WhatsApp (móvil), claro y oscuro, archivo único sin dependencias externas.
// ---------------------------------------------------------------------------
const esc = E.esc, fmt = E.fmt;

// Iconos (Material, viewBox 24). Van también en #sow-data para que los use el navegador.
const ICONS = {
  back: "M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z",
  video: "M17 10.5V7a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-3.5l4 4v-11l-4 4z",
  call: "M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1.02l-2.2 2.2z",
  more: "M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm0 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z",
  emoji: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16zm3.5-9a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm-7 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM12 17.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z",
  attach: "M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6h-1.5z",
  camera: "M12 9a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zm8-3h-3.17L15 4H9L7.17 6H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2zm-8 12.5a5.5 5.5 0 1 1 0-11 5.5 5.5 0 0 1 0 11z",
  mic: "M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z",
  send: "M2 21l21-9L2 3v7l15 2-15 2z",
  reply: "M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z",
  list: "M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z",
  ticks: "M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z",
  lock: "M18 8h-1V6a5 5 0 0 0-10 0v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2zM9 6a3 3 0 0 1 6 0v2H9V6z",
  close: "M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z",
  chevron: "M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z",
  form: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z",
  search: "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5z",
  ext: "M19 19H5V5h7V3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7h-2v7zM14 3v2h3.59l-9.83 9.83 1.41 1.41L19 6.41V10h2V3h-7z",
  info: "M11 7h2v2h-2zm0 4h2v6h-2zm1-9a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm0 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16z",
  stop: "M6 6h12v12H6z",
  play: "M8 5v14l11-7z",
  sun: "M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zM2 13h2v-2H2v2zm18 0h2v-2h-2v2zM11 2v2h2V2h-2zm0 18v2h2v-2h-2zM5.99 4.58 4.58 5.99l1.41 1.41 1.41-1.41-1.41-1.41zm12.37 12.37-1.41 1.41 1.41 1.41 1.41-1.41-1.41-1.41zm1.41-10.96-1.41-1.41-1.41 1.41 1.41 1.41 1.41-1.41zM7.4 18.36 5.99 19.77l1.41 1.41 1.41-1.41-1.41-1.41z",
  bolt: "M7 2v11h3v9l7-12h-4l4-8z",
  reset: "M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z",
};
const ic = (n, c) => `<svg class="ic${c ? " " + c : ""}" viewBox="0 0 24 24" aria-hidden="true"><path d="${ICONS[n]}"/></svg>`;

// Formato de WhatsApp (*negrita*, _cursiva_, ~tachado~) sobre texto ya escapado.
const WA_B = /(^|[\s(>])\*([^*\n<]+)\*(?=$|[\s).,!?:;<])/g;
const WA_I = /(^|[\s(>])_([^_\n<]+)_(?=$|[\s).,!?:;<])/g;
const WA_S = /(^|[\s(>])~([^~\n<]+)~(?=$|[\s).,!?:;<])/g;
function wa(s) { return fmt(s).replace(WA_B, "$1<b>$2</b>").replace(WA_I, "$1<i>$2</i>").replace(WA_S, "$1<s>$2</s>"); }
const clock = (n) => { const m = 9 * 60 + 41 + n; return String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };

const STATUS_BAR = `<div class="sbar"><span>9:41</span><span class="sbi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 22h20V2z"/></svg><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 1 9a15 15 0 0 1 22 0z"/></svg><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 4h-1V2H9v2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/></svg></span></div>`;
const NOTICES = `<div class="dchip"><span>HOY</span></div><div class="nchip enc">${ic("lock")}<span>Los mensajes y las llamadas están cifrados de extremo a extremo. Solo las personas en este chat pueden leerlos.</span></div><div class="nchip biz"><span>Esta empresa usa un servicio seguro de Meta para administrar este chat. Toca para obtener más información.</span></div>`;

function headerHtml(ctx, status) {
  const name = ctx.pendiente ? '<span class="pendh">POR DEFINIR</span>' : esc(ctx.nombre);
  return `<div class="wh">${ic("back", "hb")}<div class="av${ctx.pendiente ? " avp" : ""}">${esc(ctx.initial)}</div><div class="who"><div class="wn">${name}</div><div class="ws" data-role="status">${status || "cuenta de empresa"}</div></div>${ic("video")}${ic("call")}${ic("more")}</div>`;
}
function barHtml(disabled) {
  return `<div class="bar"><div class="pill">${ic("emoji")}<span class="ph-in">Mensaje</span>${ic("attach")}${ic("camera")}</div><div class="fab">${ic("mic")}</div></div>`;
}

function bubbleHtml(b, t, first) {
  const tail = first ? " first" : "";
  if (b.r === "user") return `<div class="msg out${tail}"><div class="bub"><span class="tx">${wa(b.text)}</span><span class="mt">${t}${ic("ticks", "tk")}</span></div></div>`;
  if (b.r === "sys") {
    if (b.kind === "derive") return `<div class="schip adv">${ic("person")}<span>Un asesor se unió a la conversación</span></div>`;
    if (b.kind === "end") return `<div class="schip">${b.text ? esc(b.text) : "Fin de la conversación simulada"}</div>`;
    // anotación de la galería (no es un mensaje de WhatsApp): lo que hace el sistema entre dos mensajes
    return `<div class="schip note">${ic("search")}<span>${fmt(b.text)}</span></div>`;
  }
  let h = `<div class="msg in${tail}"><div class="bub"><span class="tx">${wa(b.text)}</span><span class="mt">${t}</span></div>`;
  const acts = [];
  (b.botones || []).forEach((x) => acts.push(`<div class="abtn">${ic("reply")}<span>${wa(x)}</span></div>`));
  if (b.lista && b.lista.length) acts.push(`<div class="abtn">${ic("list")}<span>Ver opciones</span></div>`);
  if (acts.length) h += `<div class="acts">${acts.join("")}</div>`;
  return h + "</div>";
}

// Campo de formulario, dibujado con lo que define el SOW (etiqueta, tipo, opciones, ejemplo, obligatorio).
function fieldHtml(c) {
  const req = c.obligatorio ? ' <span class="req">*</span>' : "";
  const ej = c.ejemplo != null && String(c.ejemplo) !== "" ? String(c.ejemplo) : "";
  const ops = Array.isArray(c.opciones) ? c.opciones.map(String) : [];
  const box = (inner, extra) => `<div class="fld"><span class="fll">${fmt(c.etiqueta || "Campo")}${req}</span><div class="fin${extra ? " " + extra : ""}">${inner}</div></div>`;
  const val = (v, ph) => (v ? fmt(v) : `<span class="ph-txt">${ph}</span>`);
  switch (c.tipo) {
    case "casilla": return `<div class="fck"><div class="fckb">✓</div><span class="fckt">${fmt(c.etiqueta || "Acepto")}${req}</span></div>`;
    case "selector": {
      const shown = ej || ops[0];
      const hint = ops.length ? `<div class="fopt">Opciones: ${ops.slice(0, 4).map(fmt).join(" · ")}${ops.length > 4 ? " · …" : ""}</div>` : `<div class="fopt">[opciones por definir]</div>`;
      return `<div>${box(`<span class="fv">${shown ? fmt(shown) : '<span class="ph-txt">Elige una opción</span>'}</span>${ic("chevron", "fchev")}`, "sel")}${hint}</div>`;
    }
    case "archivo": return box(`${ic("attach")}<span>${ej ? fmt(ej) : "Adjuntar archivo"}</span>`, "up");
    case "correo": return box(val(ej, "nombre@ejemplo.com"));
    case "numero": return box(val(ej, "Solo números"));
    case "fecha": return box(val(ej, "dd/mm/aaaa"));
    case "telefono": return box(val(ej, "Número de celular"));
    default: return box(val(ej, "Escribe aquí"));
  }
}

function linkLines(links) {
  const by = {};
  links.forEach((l) => { (by[l.to] = by[l.to] || []).push(l.label); });
  return Object.keys(by).map((to) => {
    const ls = by[to].filter(Boolean);
    return `<span class="lnk">↪ ${ls.length ? ls.map((x) => "«" + fmt(x) + "»").join(", ") + " " : ""}sigue en ${fmt(to)}</span>`;
  }).join("");
}

// Hoja de formulario (WhatsApp Flow = hoja inferior; WebView = navegador integrado). Estática, para la galería.
function flowStatic(s, ctx) {
  const wv = s.webview || {}, campos = Array.isArray(wv.campos) ? wv.campos : [], shown = campos.slice(0, 7);
  const isWv = s.herramienta === "webview";
  const head = isWv
    ? `<div class="fhd wvh">${ic("close")}<div class="fti"><b>${fmt(wv.titulo || s.etapa || "Formulario")}</b><small>${ic("lock")}Página segura · dentro de WhatsApp</small></div>${ic("more")}</div>`
    : `<div class="fhd">${ic("close")}<div class="fti"><b>${fmt(wv.titulo || s.etapa || "Formulario")}</b></div>${ic("more")}</div>`;
  const foot = `<div class="ffo"><div class="fbtn${isWv ? " wvb" : ""}">${fmt(wv.boton || (isWv ? "Enviar" : "Continuar"))}</div><div class="fman">${ic("lock")}Gestionado por la empresa</div></div>`;
  return `${head}<div class="fbd">${shown.map(fieldHtml).join("")}${campos.length > 7 ? `<div class="more">+ ${campos.length - 7} campos más</div>` : ""}${campos.length ? "" : '<div class="more">Formulario sin campos definidos</div>'}</div>${foot}`;
}

function phoneHtml(s, idx, ctx) {
  const t = clock(idx);
  let inner;
  if (s.kind === "form") {
    inner = `${STATUS_BAR}<div class="flowfull">${flowStatic(s, ctx)}</div>`;
  } else if (s.kind === "ext") {
    inner = `${STATUS_BAR}<div class="flowfull"><div class="fhd wvh">${ic("close")}<div class="fti"><b>${fmt(s.ext.titulo)}</b><small>${ic("ext")}Se abre fuera de WhatsApp</small></div>${ic("more")}</div><div class="fbd"><p class="ext-t">Proceso del cliente / tercero</p><p class="ext-s">${fmt(s.ext.texto || "Pantalla gestionada por un sistema externo.")}</p><p class="ext-e">Jelou recibe solo el resultado (éxito o error).</p></div></div>`;
  } else {
    let prev = "";
    const bubbles = s.hist.map((b) => { const f = b.r !== prev; prev = b.r; return bubbleHtml(b, t, f); }).join("");
    const sheet = s.kind === "sheet" ? `<div class="scrim"></div><div class="lsheet"><div class="grab"></div><div class="lhd">${ic("close")}<b>Opciones</b></div>${s.lista.slice(0, 10).map((x, i) => `<div class="lrow">${wa(x)}<span class="rad${i === 0 ? " on" : ""}"></span></div>`).join("")}<div class="lbtn">Enviar</div></div>` : "";
    inner = `${STATUS_BAR}${headerHtml(ctx)}<div class="chat">${NOTICES}${bubbles}</div>${barHtml()}${sheet}`;
  }
  const lbl = `<div class="lbl"><strong>${fmt(s.label)}</strong>${s.main ? '<span class="tag main">Camino principal</span>' : `<span class="tag ${s.tone}">${s.tone === "adv" ? "Asesor" : s.tone === "err" ? "Error" : "Rama"}: ${fmt(s.branch || "alternativa")}</span>`}${s.kind === "form" ? `<span class="tool">Formulario (${esc(TOOL_LABEL[s.herramienta] || TOOL_LABEL.por_definir)}) · ${esc(ctx.cliente || "Jelou")}</span>` : ""}${linkLines(s.links)}</div>`;
  return `<figure class="ph-wrap" aria-label="${esc(s.label)}"><div class="phone mini"><div class="screen">${inner}</div></div><figcaption>${lbl}</figcaption></figure>`;
}

function sanitizeSvg(svg) {
  return String(svg).replace(/<script[\s\S]*?<\/script\s*>/gi, "").replace(/<\/?script[^>]*>/gi, "")
    .replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "")
    .replace(/[\s/]on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "").replace(/javascript:/gi, "");
}

function safeJson(o) {
  return JSON.stringify(o).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

// ---------------------------------------------------------------------------
// JS del navegador (simulador interactivo y pestañas). Usa SimEngine y #sow-data.
// ---------------------------------------------------------------------------
function pageScript() {
  var Eng = window.SimEngine;
  var DATA = JSON.parse(document.getElementById("sow-data").textContent);
  var IC = DATA.icons;
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  var esc = Eng.esc, fmt = Eng.fmt;
  function ic(n, c) { return '<svg class="ic' + (c ? " " + c : "") + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + IC[n] + '"/></svg>'; }
  function wa(s) {
    return fmt(s).replace(/(^|[\s(>])\*([^*\n<]+)\*(?=$|[\s).,!?:;<])/g, "$1<b>$2</b>").replace(/(^|[\s(>])_([^_\n<]+)_(?=$|[\s).,!?:;<])/g, "$1<i>$2</i>").replace(/(^|[\s(>])~([^~\n<]+)~(?=$|[\s).,!?:;<])/g, "$1<s>$2</s>");
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function clock(n) { var m = 9 * 60 + 41 + n; return pad(Math.floor(m / 60) % 24) + ":" + pad(m % 60); }

  // --- tema (auto / claro / oscuro)
  function applyTheme(t) {
    if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
    $$("[data-act=theme]").forEach(function (b) { b.textContent = t === "auto" ? "Tema: auto" : t === "dark" ? "Tema: oscuro" : "Tema: claro"; });
  }
  var themeState = "auto";
  applyTheme("auto");

  // --- pestañas de agente y de vista
  function showAgent(id) {
    $$(".agent").forEach(function (s) { s.hidden = s.id !== "ag-" + String(id).replace(/[^A-Za-z0-9_-]/g, "_"); });
    $$(".agent-tab").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-agent") === id ? "true" : "false"); });
    var sec = $("#ag-" + String(id).replace(/[^A-Za-z0-9_-]/g, "_")), sel = sec && $("[role=tab][aria-selected=true]", sec);
    if (sel) showTab(sel);
  }
  function showTab(btn) {
    var tabs = btn.closest(".tabs"), sec = btn.closest(".agent");
    $$("[role=tab]", tabs).forEach(function (b) { b.setAttribute("aria-selected", b === btn ? "true" : "false"); });
    $$(".pane", sec).forEach(function (p) { p.hidden = p.id !== btn.getAttribute("aria-controls"); });
    if (btn.getAttribute("data-view") === "sim") {
      var box = $(".simbox", sec);
      if (!box.getAttribute("data-ready")) { box.setAttribute("data-ready", "1"); initSim(box, DATA.agentes.filter(function (a) { return String(a.id) === box.getAttribute("data-agent"); })[0]); }
    }
  }
  document.addEventListener("click", function (ev) {
    var th = ev.target.closest && ev.target.closest("[data-act=theme]");
    if (th) { themeState = themeState === "auto" ? "light" : themeState === "light" ? "dark" : "auto"; applyTheme(themeState); return; }
    var a = ev.target.closest && ev.target.closest(".agent-tab");
    if (a) { showAgent(a.getAttribute("data-agent")); return; }
    var t = ev.target.closest && ev.target.closest(".tabs [role=tab]");
    if (t) showTab(t);
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "ArrowRight" && ev.key !== "ArrowLeft") return;
    var t = ev.target.closest && ev.target.closest("[role=tab]");
    if (!t) return;
    var list = $$("[role=tab]", t.parentNode), i = list.indexOf(t) + (ev.key === "ArrowRight" ? 1 : -1);
    var nx = list[(i + list.length) % list.length];
    nx.focus(); nx.click();
  });

  // --- simulador
  function initSim(box, agent) {
    var per = agent.persona && typeof agent.persona === "object" ? agent.persona : { nombre: typeof agent.persona === "string" ? agent.persona : "" };
    var pend = !!per.nombre && /POR DEFINIR|POR COMPLETAR/i.test(per.nombre);
    var nombre = pend ? "POR DEFINIR" : per.nombre || agent.nombre || "Bot";
    var BASE_STATUS = "cuenta de empresa";
    var NOTICES = '<div class="dchip"><span>HOY</span></div><div class="nchip enc">' + ic("lock") + "<span>Los mensajes y las llamadas están cifrados de extremo a extremo. Solo las personas en este chat pueden leerlos.</span></div>" +
      '<div class="nchip biz"><span>Esta empresa usa un servicio seguro de Meta para administrar este chat. Toca para obtener más información.</span></div>';
    box.innerHTML =
      '<div class="stage"><div class="phone"><div class="screen">' +
      '<div class="sbar"><span>9:41</span><span class="sbi"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 22h20V2z"/></svg><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21 1 9a15 15 0 0 1 22 0z"/></svg><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 4h-1V2H9v2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z"/></svg></span></div>' +
      '<div class="wh">' + ic("back", "hb") + '<div class="av' + (pend ? " avp" : "") + '">' + (pend ? "?" : esc(nombre.charAt(0).toUpperCase())) + '</div><div class="who"><div class="wn">' + (pend ? '<span class="pendh">POR DEFINIR</span>' : esc(nombre)) + '</div><div class="ws" data-role="status">' + BASE_STATUS + "</div></div>" + ic("video") + ic("call") + ic("more") + "</div>" +
      '<div class="chat" data-role="chat" tabindex="0" aria-live="polite" aria-label="Conversación simulada"></div>' +
      '<form class="bar" data-role="form"><div class="pill">' + ic("emoji") + '<input class="ipt" data-role="input" type="text" placeholder="Mensaje" aria-label="Escribe un mensaje" autocomplete="off">' + ic("attach") + ic("camera") + '</div><button class="fab" type="submit" aria-label="Enviar mensaje" data-role="fab">' + ic("mic") + "</button></form>" +
      '<div class="ov" data-role="sheet" hidden></div><div class="ov" data-role="flow" hidden></div>' +
      '</div></div>' +
      '<aside class="back"><h3>Detrás de escena</h3>' +
      '<div class="now" data-role="now"></div>' +
      '<div class="tools"><button type="button" class="btn" data-role="reset">' + ic("reset") + ' Reiniciar</button><button type="button" class="btn ghost" data-role="fast" aria-pressed="false">' + ic("bolt") + ' Ritmo rápido</button><button type="button" class="btn ghost" data-act="theme">Tema: auto</button></div>' +
      '<h4>Lo que pasa mientras conversas</h4><ol class="log" data-role="log"></ol></aside></div>';
    var chat = $("[data-role=chat]", box), nowEl = $("[data-role=now]", box), logEl = $("[data-role=log]", box),
      form = $("[data-role=form]", box), input = $("[data-role=input]", box), fab = $("[data-role=fab]", box),
      sheet = $("[data-role=sheet]", box), flowBox = $("[data-role=flow]", box), statusEl = $("[data-role=status]", box), fastBtn = $("[data-role=fast]", box);
    var S = { shown: [], wait: null, pending: null, queue: [], busy: false, ctx: null, timer: null, min: 0, log: [], sel: -1, fast: false };

    function setStatus(t) { statusEl.textContent = t; }
    function lastChoiceIndex() { for (var i = S.shown.length - 1; i >= 0; i--) { var e = S.shown[i]; if (e.t === "bot" && ((e.botones && e.botones.length) || (e.lista && e.lista.length))) return i; } return -1; }
    function formMsg(e, i) {
      var lines = String(e.text).split("\n"), head = lines.shift();
      return '<span class="tx fsent"><span class="fsh">' + ic("form") + "<b>" + fmt(head.replace(/^📋\s*/, "")) + "</b></span>" + (lines.length ? '<span class="fsl">' + lines.map(function (l) { return fmt(l); }).join("<br>") + "</span>" : "") + "</span>";
    }
    function render() {
      var active = !S.busy && S.wait && S.wait.kind === "choice", lc = active ? lastChoiceIndex() : -1;
      var h = NOTICES, prev = "";
      S.shown.forEach(function (e, i) {
        if (e.t === "sys") {
          if (e.kind === "derive") h += '<div class="schip adv">' + ic("person") + "<span>Un asesor se unió a la conversación</span></div>";
          else if (e.kind === "end") h += '<div class="schip">Fin de la conversación simulada</div>';
          prev = ""; return;
        }
        var first = prev !== e.t; prev = e.t;
        if (e.t === "user") {
          h += '<div class="msg out' + (first ? " first" : "") + '"><div class="bub">' + (e.form ? formMsg(e, i) : '<span class="tx">' + wa(e.text) + "</span>") + '<span class="mt">' + e.time + ic("ticks", "tk") + "</span></div></div>";
        } else {
          var acts = "";
          if (e.botones && e.botones.length) acts += e.botones.map(function (b, k) { return i === lc ? '<button type="button" class="abtn" data-b="' + k + '">' + ic("reply") + "<span>" + wa(b) + "</span></button>" : '<div class="abtn off">' + ic("reply") + "<span>" + wa(b) + "</span></div>"; }).join("");
          if (e.lista && e.lista.length) acts += i === lc ? '<button type="button" class="abtn" data-act="sheet">' + ic("list") + "<span>Ver opciones</span></button>" : '<div class="abtn off">' + ic("list") + "<span>Ver opciones</span></div>";
          h += '<div class="msg in' + (first ? " first" : "") + '"><div class="bub"><span class="tx">' + wa(e.text) + '</span><span class="mt">' + e.time + "</span></div>" + (acts ? '<div class="acts">' + acts + "</div>" : "") + "</div>";
        }
      });
      var w = S.wait;
      if (!S.busy && w && w.kind === "webview") {
        var wv = w.webview || {};
        h += '<div class="msg in first"><div class="bub"><span class="tx">' + (w.text ? wa(w.text) : "<b>" + fmt(wv.titulo || w.etapa || "Formulario") + "</b>") + '</span><span class="mt">' + clock(S.min) + '</span></div><div class="acts"><button type="button" class="abtn" data-act="openform">' + ic("form") + "<span>" + esc(wv.accion || "Abrir formulario") + "</span></button></div></div>";
      }
      chat.innerHTML = h;
      chat.scrollTop = chat.scrollHeight;
    }
    function toolName(t) { return { flows: "WhatsApp Flow", webview: "WebView" }[t] || "WhatsApp Flow / WebView"; }
    function controls() {
      var w = S.wait, k = w ? w.kind : "";
      var canType = !S.busy && (k === "choice" || k === "text" || k === "outcome");
      input.disabled = !canType; fab.disabled = !canType && !input.value;
      input.placeholder = k === "end" ? "Conversación finalizada" : "Mensaje";
      var h = "";
      if (S.busy || !w) h = '<p class="nowt">El bot está respondiendo…</p>';
      else {
        h = '<p class="nowt"><strong>Paso ' + esc(w.id || "—") + "</strong>" + (w.etapa ? " · " + esc(w.etapa) : "") + "</p>";
        if (k === "text") {
          h += '<p class="nowh">Escribe en el chat o elige una de estas respuestas:</p><div class="chips">';
          if (w.example) h += '<button type="button" class="chip" data-act="example">✎ «' + esc(w.example.length > 44 ? w.example.slice(0, 44) + "…" : w.example) + "»</button>";
          w.options.forEach(function (o, i) { h += '<button type="button" class="chip" data-o="' + i + '">' + esc(o) + "</button>"; });
          h += "</div>";
        } else if (k === "choice") h += '<p class="nowh">Toca un botón del chat o escribe tu respuesta con tus palabras.</p>';
        else if (k === "webview") {
          h += '<p class="nowh">El bot envía un formulario (' + toolName(w.herramienta) + "). Ábrelo desde el chat.</p>" + '<div class="chips"><button type="button" class="chip" data-act="openform">Abrir formulario</button>' + (flowBox.hidden ? "" : '<button type="button" class="chip" data-act="fill">Rellenar con datos de ejemplo</button>') + "</div>";
        } else if (k === "outcome") {
          h += '<p class="nowh">El sistema respondería' + (w.title ? " en «" + esc(w.title) + "»" : "") + ". Elige el resultado a simular:</p><div class=\"chips\">" + w.options.map(function (o, i) { return '<button type="button" class="chip warn" data-o="' + i + '">' + esc(o) + "</button>"; }).join("") + "</div>";
        } else if (k === "end") h += '<p class="nowh">La conversación terminó.</p><div class="chips"><button type="button" class="chip" data-act="reset">Reiniciar conversación</button></div>';
      }
      nowEl.innerHTML = h;
    }
    function addLog(e) {
      var icon = e.kind === "wait" ? "search" : e.kind === "form" ? "form" : e.kind === "derive" ? "person" : e.kind === "end" ? "stop" : "info";
      var li = document.createElement("li"); li.className = "lg-" + e.kind;
      li.innerHTML = ic(icon) + "<span>" + fmt(e.text) + "</span>";
      logEl.appendChild(li); logEl.scrollTop = logEl.scrollHeight;
    }
    function closeOv() { sheet.hidden = true; flowBox.hidden = true; controls(); }
    function openSheet() {
      var w = S.wait; if (!w || !w.list.length) return;
      S.sel = -1;
      sheet.innerHTML = '<div class="scrim" data-act="closesheet"></div><div class="lsheet" role="dialog" aria-label="Opciones"><div class="grab"></div><div class="lhd"><button type="button" class="xb" data-act="closesheet" aria-label="Cerrar">' + ic("close") + "</button><b>Opciones</b></div>" +
        '<div class="lrows">' + w.list.map(function (x, i) { return '<button type="button" class="lrow" data-l="' + i + '"><span>' + wa(x) + '</span><span class="rad"></span></button>'; }).join("") + '</div><button type="button" class="lbtn" data-act="sendlist" disabled>Enviar</button></div>';
      sheet.hidden = false;
      var f = $(".lrow", sheet); if (f) f.focus({ preventScroll: true });
    }
    function openForm() {
      var w = S.wait; if (!w || w.kind !== "webview") return;
      var wv = w.webview || {}, campos = wv.campos || [], sd = Eng.sampleData(wv), isWv = w.herramienta === "webview", title = esc(wv.titulo || w.etapa || "Formulario");
      var h = '<div class="scrim" data-act="closeform"></div><div class="flow' + (isWv ? " wvf" : "") + '" role="dialog" aria-label="' + title + '"><div class="grab"></div>' +
        '<div class="fhd' + (isWv ? " wvh" : "") + '"><button type="button" class="xb" data-act="closeform" aria-label="Cerrar formulario">' + ic("close") + '</button><div class="fti"><b>' + title + "</b>" + (isWv ? "<small>" + ic("lock") + "Página segura · dentro de WhatsApp</small>" : "") + "</div>" + ic("more") + '</div><form class="fbd wvform" data-role="wvform" novalidate>';
      campos.forEach(function (c, i) {
        var id = "f" + i + "-" + Math.random().toString(36).slice(2, 6), lab = fmt(c.etiqueta || "Campo") + (c.obligatorio ? ' <span class="req">*</span>' : "");
        var ej = c.ejemplo != null && String(c.ejemplo) !== "" ? String(c.ejemplo) : "";
        if (c.tipo === "casilla") h += '<label class="fck"><input type="checkbox" data-f="' + i + '"><span class="fckt">' + lab + "</span></label>";
        else if (c.tipo === "selector") {
          var ops = (c.opciones && c.opciones.length ? c.opciones.map(String) : []);
          if (ej && ops.indexOf(ej) < 0) ops.unshift(ej);
          if (!ops.length) ops = [sd[i] ? sd[i].valor : "Opción de ejemplo"];
          h += '<div><div class="fld"><label class="fll" for="' + id + '">' + lab + '</label><select class="fin" id="' + id + '" data-f="' + i + '"><option value="">Elige una opción</option>' + ops.map(function (o) { return "<option>" + esc(o) + "</option>"; }).join("") + "</select></div>" + (c.opciones && c.opciones.length ? "" : '<div class="fopt">' + fmt("[opciones por definir]") + "</div>") + "</div>";
        }
        else if (c.tipo === "archivo") h += '<div class="fld"><span class="fll">' + lab + '</span><button type="button" class="fin up" data-f="' + i + '" data-file="">' + ic("attach") + "<span>Adjuntar archivo</span></button></div>";
        else {
          var ph = ej ? "Ej.: " + ej : c.tipo === "correo" ? "nombre@ejemplo.com" : c.tipo === "numero" ? "Solo números" : c.tipo === "fecha" ? "dd/mm/aaaa" : c.tipo === "telefono" ? "Número de celular" : "Escribe aquí";
          h += '<div class="fld"><label class="fll" for="' + id + '">' + lab + '</label><input class="fin" id="' + id + '" data-f="' + i + '" type="' + (c.tipo === "correo" ? "email" : "text") + '"' + (c.tipo === "numero" || c.tipo === "telefono" ? ' inputmode="numeric"' : "") + ' placeholder="' + esc(ph) + '"></div>';
        }
      });
      if (!campos.length) h += '<p class="more">Formulario sin campos definidos.</p>';
      h += '<p class="ferr" data-role="ferr" hidden>Completa los campos obligatorios (*).</p></form><div class="ffo"><button type="button" class="fbtn' + (isWv ? " wvb" : "") + '" data-act="submitform">' + esc(wv.boton || (isWv ? "Enviar" : "Continuar")) + '</button><div class="fman">' + ic("lock") + (isWv ? "Sitio seguro" : "Gestionado por la empresa") + "</div></div></div>";
      flowBox.innerHTML = h; flowBox.hidden = false; controls();
      var f = $("input,select,button.fin", flowBox); if (f) f.focus({ preventScroll: true });
    }
    // Campos obligatorios vacíos (los marca en rojo); devuelve cuántos faltan.
    function missingRequired() {
      var campos = (S.wait.webview && S.wait.webview.campos) || [], n = 0;
      campos.forEach(function (c, i) {
        var el = $('[data-f="' + i + '"]', flowBox); if (!el) return;
        var empty = el.type === "checkbox" ? !el.checked : el.hasAttribute("data-file") ? !el.getAttribute("data-file") : !String(el.value || "").trim();
        var bad = !!c.obligatorio && empty;
        el.classList.toggle("bad", bad); if (bad) n++;
      });
      var er = $("[data-role=ferr]", flowBox); if (er) er.hidden = !n;
      return n;
    }
    function fillSamples(onlyEmpty) {
      var w = S.wait, sd = Eng.sampleData(w.webview);
      $$("[data-f]", flowBox).forEach(function (el) {
        var i = +el.getAttribute("data-f"), v = sd[i] ? sd[i].valor : "";
        if (el.type === "checkbox") { if (!onlyEmpty || !el.checked) el.checked = true; }
        else if (el.tagName === "SELECT") { if (!onlyEmpty || !el.value) el.value = v; }
        else if (el.hasAttribute("data-file")) { if (!onlyEmpty || !el.getAttribute("data-file")) { el.setAttribute("data-file", v); el.querySelector("span").textContent = v + " ✓"; } }
        else if (!onlyEmpty || !el.value) el.value = v;
      });
    }
    function collect() {
      var campos = (S.wait.webview && S.wait.webview.campos) || [], out = [];
      campos.forEach(function (c, i) {
        var el = $('[data-f="' + i + '"]', flowBox), v = "";
        if (el) v = el.type === "checkbox" ? (el.checked ? "Sí" : "No") : el.hasAttribute("data-file") ? el.getAttribute("data-file") : el.value;
        out.push({ etiqueta: c.etiqueta || "Campo", tipo: c.tipo || "texto", valor: v });
      });
      return out;
    }
    function lead(e) {
      if (reduce) return 0;
      var ms = e.t === "user" ? 220 : e.t === "bot" ? 900 : e.kind === "wait" ? 700 : e.kind === "form" ? 250 : 300;
      return S.fast ? Math.round(ms * 0.12) : ms;
    }
    function play(events, wait) {
      closeOv(); S.wait = null; S.pending = wait; S.queue = events.slice(); S.busy = true; controls(); step();
    }
    function step() {
      if (!S.queue.length) {
        S.busy = false; S.wait = S.pending; setStatus(BASE_STATUS); render(); controls();
        if (S.wait && S.wait.kind === "webview" && !S.fast) { /* el formulario se abre desde el botón del chat, como en WhatsApp */ }
        return;
      }
      var e = S.queue.shift(), ms = lead(e);
      if (e.t === "bot" && ms) setStatus("escribiendo…");
      S.timer = setTimeout(function () {
        e.time = clock(S.min++); S.shown.push(e);
        if (e.t === "sys") addLog(e);
        render(); setStatus(BASE_STATUS);
        S.timer = setTimeout(step, reduce ? 0 : S.fast ? 20 : 140);
      }, ms);
    }
    function send(inp) {
      if (S.busy || !S.wait) return;
      var r = Eng.answer(agent, S.wait, inp, S.ctx);
      play(r.events, r.wait);
    }
    function reset() {
      clearTimeout(S.timer); S.shown = []; S.min = 0; S.queue = []; S.log = []; logEl.innerHTML = "";
      var r = Eng.start(agent); S.ctx = r.ctx; play(r.events, r.wait);
    }
    box.addEventListener("click", function (ev) {
      var el = ev.target.closest("[data-b],[data-l],[data-o],[data-act],[data-role=reset],[data-role=fast]");
      if (!el || !box.contains(el)) return;
      var w = S.wait;
      if (el.getAttribute("data-role") === "reset") { reset(); return; }
      if (el.getAttribute("data-role") === "fast") { S.fast = !S.fast; fastBtn.setAttribute("aria-pressed", S.fast ? "true" : "false"); return; }
      if (el.hasAttribute("data-b") && w) { send({ type: "choice", value: w.buttons[+el.getAttribute("data-b")] }); return; }
      if (el.hasAttribute("data-l") && w) {
        S.sel = +el.getAttribute("data-l");
        $$(".lrow", sheet).forEach(function (r, i) { r.classList.toggle("sel", i === S.sel); });
        var sb = $(".lbtn", sheet); if (sb) sb.disabled = false;
        return;
      }
      if (el.hasAttribute("data-o") && w) { send({ type: w.kind === "outcome" ? "outcome" : "choice", value: w.options[+el.getAttribute("data-o")] }); return; }
      var act = el.getAttribute("data-act");
      if (act === "reset") reset();
      else if (act === "sheet") openSheet();
      else if (act === "closesheet" || act === "closeform") closeOv();
      else if (act === "sendlist" && w && S.sel >= 0) { var v = w.list[S.sel]; closeOv(); send({ type: "choice", value: v }); }
      else if (act === "openform") openForm();
      else if (act === "example" && w) send({ type: "text", text: w.example });
      else if (act === "fill") fillSamples(false);
      else if (act === "submitform") { if (missingRequired()) return; var d = collect(); closeOv(); send({ type: "submit", data: d }); }
    });
    // botón de archivo del formulario simulado
    box.addEventListener("click", function (ev) {
      var b = ev.target.closest("button.fin.up[data-f]");
      if (b) { var on = !b.getAttribute("data-file"); b.setAttribute("data-file", on ? "documento.pdf" : ""); b.querySelector("span").textContent = on ? "documento.pdf ✓" : "Adjuntar archivo"; }
    });
    input.addEventListener("input", function () { fab.innerHTML = input.value ? ic("send") : ic("mic"); });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var t = input.value.trim(); if (!t || input.disabled) return;
      input.value = ""; fab.innerHTML = ic("mic"); send({ type: "text", text: t });
    });
    box.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeOv(); });
    reset();
  }
  var first = $(".agent-tab"), startId = first ? first.getAttribute("data-agent") : (DATA.agentes[0] && String(DATA.agentes[0].id));
  var hm = (location.hash || "").replace(/^#/, "").split("/");
  if (hm[0] && $("#ag-" + hm[0].replace(/[^A-Za-z0-9_-]/g, "_"))) startId = hm[0];
  showAgent(startId);
  if (hm[1]) { var tb = $("#ag-" + startId.replace(/[^A-Za-z0-9_-]/g, "_") + " [data-view=" + hm[1].replace(/[^a-z]/g, "") + "]"); if (tb) showTab(tb); }
}

// ---------------------------------------------------------------------------
const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--page:#f0f2f5;--card:#fff;--ink:#111b21;--mut:#667781;--line:#e9edef;--acc:#00a884;--acc-ink:#fff;--soft:#e7f8f3;
--head:#008069;--head-ink:#fff;--wall:#efeae2;--doodle:rgba(11,20,26,.06);--b-in:#fff;--b-out:#d9fdd3;--b-ink:#111b21;--b-time:#667781;--tick:#53bdeb;
--chip-bg:rgba(255,255,255,.92);--chip-ink:#54656f;--enc-bg:#ffeecd;--enc-ink:#54656f;--abtn:#027eb5;--bar:transparent;--pill:#fff;--sheet:#fff;--sheet-ink:#111b21;--field:#d1d7db;
--bezel:#0b0b0c;--warn:#a35a00;--warn-soft:#fdeccf;--red:#d9322b;--shadow:0 1px .5px rgba(11,20,26,.13)}
:root[data-theme=dark]{--page:#0b141a;--card:#111b21;--ink:#e9edef;--mut:#8696a0;--line:#222d34;--acc:#00a884;--soft:#0f2a27;
--head:#202c33;--head-ink:#e9edef;--wall:#0b141a;--doodle:rgba(255,255,255,.045);--b-in:#202c33;--b-out:#005c4b;--b-ink:#e9edef;--b-time:#8696a0;--tick:#53bdeb;
--chip-bg:#182229;--chip-ink:#8696a0;--enc-bg:#182229;--enc-ink:#ffd279;--abtn:#53bdeb;--pill:#202c33;--sheet:#111b21;--sheet-ink:#e9edef;--field:#374248;--warn:#f0b45c;--warn-soft:#3a2a10;--red:#ff7b72}
@media (prefers-color-scheme:dark){:root:not([data-theme=light]){--page:#0b141a;--card:#111b21;--ink:#e9edef;--mut:#8696a0;--line:#222d34;--soft:#0f2a27;
--head:#202c33;--head-ink:#e9edef;--wall:#0b141a;--doodle:rgba(255,255,255,.045);--b-in:#202c33;--b-out:#005c4b;--b-ink:#e9edef;--b-time:#8696a0;
--chip-bg:#182229;--chip-ink:#8696a0;--enc-bg:#182229;--enc-ink:#ffd279;--abtn:#53bdeb;--pill:#202c33;--sheet:#111b21;--sheet-ink:#e9edef;--field:#374248;--warn:#f0b45c;--warn-soft:#3a2a10;--red:#ff7b72}}
html{-webkit-text-size-adjust:100%;overflow-x:hidden}
body{overflow-x:hidden;max-width:100vw;background:var(--page);color:var(--ink);font-family:"Segoe UI","Helvetica Neue",Helvetica,Arial,system-ui,sans-serif;padding:24px 16px 40px;line-height:1.45;font-size:15px}
button{font:inherit;cursor:pointer;color:inherit;background:none;border:0}
:focus-visible{outline:3px solid #53bdeb;outline-offset:2px;border-radius:6px}
.ic{width:24px;height:24px;fill:currentColor;flex-shrink:0}
.pend{color:var(--red);font-weight:700}
.top{max-width:1240px;margin:0 auto 18px;text-align:center}
.top h1{font-size:clamp(20px,4vw,28px);font-weight:700;margin-bottom:6px}
.chips0{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:8px 0}
.chip0{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:3px 12px;font-size:12px}
.aviso{font-size:12.5px;color:var(--mut);margin-top:6px}
.agents{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:0 auto 16px;max-width:1240px}
.agent-tab{padding:8px 16px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-size:13px;font-weight:600;max-width:100%;overflow-wrap:anywhere}
.agent-tab[aria-selected=true]{background:var(--acc);border-color:var(--acc);color:var(--acc-ink)}
.agent{max-width:1240px;margin:0 auto}
[hidden]{display:none!important}
.ahead{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 18px;margin-bottom:14px;min-width:0}
.ahead h2{font-size:17px}
.ameta{font-size:12.5px;color:var(--mut);margin-top:2px}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center}
.stat{background:var(--soft);border:1px solid var(--acc);border-radius:999px;padding:3px 12px;font-size:12px;font-weight:600;max-width:100%;overflow-wrap:anywhere}
details.otros{font-size:12.5px;color:var(--mut);margin-top:8px}
details.otros summary{cursor:pointer;color:var(--ink)}
details.otros ul{margin:6px 0 0 18px}
.tabs{display:flex;gap:6px;justify-content:center;margin:6px 0 18px;flex-wrap:wrap}
.tabs [role=tab]{padding:8px 20px;border-radius:10px;font-size:13px;font-weight:600;border:1px solid var(--line);background:var(--card)}
.tabs [role=tab][aria-selected=true]{background:var(--ink);color:var(--card);border-color:var(--ink)}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(300px,100%),300px));gap:30px 22px;justify-content:center}
.ph-wrap{display:flex;flex-direction:column;align-items:center;gap:10px;margin:0;min-width:0;max-width:100%}
figcaption.lbl,.lbl{color:var(--mut);font-size:11.5px;text-align:center;display:flex;flex-direction:column;gap:4px;align-items:center;max-width:300px}
.lbl strong{color:var(--ink);font-size:12.5px;font-weight:600}
.tag{display:inline-block;border-radius:999px;padding:1px 9px;font-size:10.5px;font-weight:600;border:1px solid}
.tag.main{color:#1d7a46;border-color:#1d7a46;background:rgba(37,211,102,.12)}
.tag.alt{color:var(--abtn);border-color:var(--abtn);background:rgba(2,126,181,.1)}
.tag.err{color:var(--red);border-color:var(--red);background:rgba(217,50,43,.08)}
.tag.adv{color:var(--warn);border-color:var(--warn);background:var(--warn-soft)}
.lnk{font-size:10.5px;color:var(--warn)}.tool{font-size:10.5px}
/* teléfono */
.phone{width:390px;max-width:100%;height:min(800px,calc(100vh - 40px));min-height:560px;background:var(--bezel);border-radius:46px;padding:10px;box-shadow:0 0 0 1px #2a2a2a,0 24px 60px rgba(0,0,0,.35)}
.phone.mini{width:300px;height:620px;min-height:0;border-radius:40px;padding:8px}
.screen{position:relative;height:100%;border-radius:36px;overflow:hidden;display:flex;flex-direction:column;background:var(--wall);color:var(--b-ink)}
.mini .screen{border-radius:32px}.mini .wh>.ic:nth-last-child(3){display:none}.mini .ws{white-space:nowrap}
.sbar{background:var(--head);color:var(--head-ink);display:flex;justify-content:space-between;align-items:center;padding:8px 22px 2px;font-size:12px;font-weight:600;flex-shrink:0}
.sbi{display:flex;gap:5px}.sbi svg{width:13px;height:13px;fill:currentColor}
.wh{background:var(--head);color:var(--head-ink);display:flex;align-items:center;gap:10px;padding:6px 12px 8px 8px;flex-shrink:0}
.wh .ic{width:22px;height:22px}.wh .hb{width:24px;height:24px}
.av{width:38px;height:38px;border-radius:50%;background:#dfe5e7;color:#54656f;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;flex-shrink:0}
.av.avp{background:#fff;color:#c62828}
.who{flex:1;min-width:0;line-height:1.2}
.wn{font-size:16.5px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wn .pendh{display:inline-block;max-width:100%;overflow:hidden;text-overflow:ellipsis;vertical-align:bottom}.ws{font-size:12.5px;opacity:.8}
.pendh{background:#fff;color:#c62828;font-weight:700;border-radius:999px;padding:1px 9px;font-size:12px}
.chat{flex:1;min-height:0;overflow-y:auto;padding:8px 10px 10px;display:flex;flex-direction:column;gap:2px;background-color:var(--wall);
background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 120 120'%3E%3Cg fill='none' stroke='%23808b92' stroke-opacity='.16' stroke-width='1.2'%3E%3Ccircle cx='20' cy='22' r='6'/%3E%3Cpath d='M64 14l8 8-8 8-8-8z'/%3E%3Cpath d='M96 60q6-8 12 0t12 0'/%3E%3Cpath d='M18 76h14M25 69v14'/%3E%3Ccircle cx='70' cy='86' r='4'/%3E%3Cpath d='M100 104l7-7M100 97l7 7'/%3E%3C/g%3E%3C/svg%3E")}
.dchip{align-self:center;margin:6px 0 4px}.dchip span{display:inline-block;background:var(--chip-bg);color:var(--chip-ink);font-size:12px;border-radius:7px;padding:4px 10px;box-shadow:var(--shadow);letter-spacing:.02em}
.nchip{align-self:center;max-width:92%;text-align:center;font-size:12px;border-radius:8px;padding:6px 10px;margin:4px 0;line-height:1.35;box-shadow:var(--shadow)}
.nchip.enc{background:var(--enc-bg);color:var(--enc-ink)}.nchip.enc .ic{width:11px;height:11px;margin-right:4px;vertical-align:-1px}
.nchip.enc span{display:inline}
.nchip.biz{background:var(--chip-bg);color:var(--chip-ink)}
.msg{max-width:82%;display:flex;flex-direction:column;margin-top:2px}
.msg.first{margin-top:8px}
.msg.in{align-self:flex-start}.msg.out{align-self:flex-end}
.bub{position:relative;border-radius:8px;padding:6px 8px 7px 9px;color:var(--b-ink);box-shadow:var(--shadow);font-size:14.2px;line-height:1.35;overflow-wrap:anywhere}
.in .bub{background:var(--b-in)}.out .bub{background:var(--b-out)}
.in.first .bub{border-top-left-radius:0}.out.first .bub{border-top-right-radius:0}
.in.first .bub::before,.out.first .bub::before{content:"";position:absolute;top:0;width:9px;height:13px;background:inherit}
.in.first .bub::before{left:-8px;clip-path:polygon(100% 0,0 0,100% 100%)}
.out.first .bub::before{right:-8px;clip-path:polygon(0 0,100% 0,0 100%)}
.tx{white-space:pre-wrap}
.mt{float:right;margin:7px 0 -3px 12px;font-size:11px;color:var(--b-time);display:inline-flex;align-items:center;gap:3px;line-height:1}
.out .mt{color:var(--b-time)}
.tk{width:16px;height:16px;color:var(--tick)}
.acts{display:flex;flex-direction:column;gap:2px;margin-top:2px}
.abtn{display:flex;align-items:center;justify-content:center;gap:7px;width:100%;background:var(--b-in);color:var(--abtn);border-radius:8px;padding:10px 12px;font-size:14.2px;font-weight:500;box-shadow:var(--shadow);text-align:center}
.abtn .ic{width:18px;height:18px}
button.abtn:hover{filter:brightness(.97)}
.abtn.off{cursor:default}
.schip{align-self:center;margin:8px 0 2px;background:var(--chip-bg);color:var(--chip-ink);font-size:12px;border-radius:8px;padding:5px 12px;box-shadow:var(--shadow);display:flex;gap:6px;align-items:center;text-align:center}
.schip .ic{width:14px;height:14px}.schip.adv{background:var(--warn-soft);color:var(--warn)}.schip.note{background:transparent;border:1px dashed var(--field);box-shadow:none;color:var(--mut);font-style:italic}
.fsent{display:block}.fsh{display:flex;align-items:center;gap:6px}.fsh .ic{width:18px;height:18px;color:var(--abtn)}
.fsl{display:block;font-size:12.5px;color:var(--b-time);margin-top:4px;border-top:1px solid rgba(128,139,146,.3);padding-top:4px}
.bar{display:flex;align-items:center;gap:6px;padding:6px 8px 10px;background:var(--wall);flex-shrink:0}
.pill{flex:1;min-width:0;display:flex;align-items:center;gap:10px;background:var(--pill);border-radius:24px;padding:9px 14px;color:var(--mut);box-shadow:var(--shadow)}
.pill .ic{width:22px;height:22px}
.ph-in{flex:1;color:var(--mut);font-size:15px}
.ipt{flex:1;min-width:0;border:0;background:none;color:var(--ink);font:inherit;font-size:15px;outline:none}
.ipt::placeholder{color:var(--mut)}
.fab{width:46px;height:46px;border-radius:50%;background:var(--acc);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:var(--shadow)}
.fab .ic{width:22px;height:22px}.fab:disabled{opacity:.65;cursor:default}
/* hojas */
.ov{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;justify-content:flex-end}
.scrim{position:absolute;inset:0;background:rgba(11,20,26,.55)}
.lsheet,.flow{position:relative;background:var(--sheet);color:var(--sheet-ink);border-radius:18px 18px 0 0;overflow:hidden;display:flex;flex-direction:column}
.lsheet{max-height:78%}.flow{height:92%}
.mini .lsheet{position:absolute;left:0;right:0;bottom:0}.mini .scrim{position:absolute}
.grab{width:36px;height:4px;border-radius:2px;background:var(--field);margin:8px auto 0;flex-shrink:0}
.lhd,.fhd{display:flex;align-items:center;gap:12px;padding:12px 14px;flex-shrink:0}
.lhd b,.fti b{font-size:16px;font-weight:600}
.lhd .ic,.fhd .ic,.xb .ic{width:22px;height:22px;color:var(--mut)}
.xb{display:flex}.fti{flex:1;min-width:0;display:flex;flex-direction:column}
.fti small{display:flex;align-items:center;gap:4px;font-size:11.5px;color:var(--mut)}.fti small .ic{width:11px;height:11px}
.fhd.wvh{border-bottom:1px solid var(--line);background:var(--sheet)}
.lrows{overflow-y:auto}
.lrow{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;text-align:left;padding:14px 16px;font-size:15px;border-top:1px solid var(--line)}
.rad{width:20px;height:20px;border-radius:50%;border:2px solid var(--field);flex-shrink:0;position:relative}
.lrow.sel .rad,.rad.on{border-color:var(--acc)}.lrow.sel .rad::after,.rad.on::after{content:"";position:absolute;inset:3px;border-radius:50%;background:var(--acc)}
.lbtn{margin:12px 16px 16px;background:var(--acc);color:#fff;border-radius:24px;padding:12px;font-weight:600;font-size:15px;text-align:center}
.lbtn:disabled{opacity:.45;cursor:default}
.fbd{flex:1;overflow-y:auto;padding:8px 16px 12px;display:flex;flex-direction:column;gap:16px;min-height:0}
.fld{position:relative;padding-top:6px}
.fll{position:absolute;left:10px;top:-2px;background:var(--sheet);padding:0 5px;font-size:12px;color:var(--mut);z-index:1}
.fin{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;border:1px solid var(--field);border-radius:8px;padding:13px 14px;font:inherit;font-size:15px;color:var(--sheet-ink);background:var(--sheet);text-align:left}
input.fin:focus,select.fin:focus{border-color:var(--acc);outline:2px solid var(--acc);outline-offset:-1px}
.fin.bad{border-color:var(--red)}
.fin.up{justify-content:flex-start;color:var(--abtn);border-style:dashed}.fin.up .ic{width:18px;height:18px}
.fchev{width:20px;height:20px;color:var(--mut)}
.ph-txt{color:var(--mut)}
.fopt{font-size:11.5px;color:var(--acc);margin:3px 0 0 4px}
.req{color:var(--red);font-weight:700}
.fck{display:flex;align-items:flex-start;gap:10px;padding:4px 0}
.fck input{width:20px;height:20px;accent-color:var(--acc);margin-top:1px}
.fckb{width:20px;height:20px;border-radius:4px;background:var(--acc);color:#fff;display:flex;align-items:center;justify-content:center;font-size:12px;flex-shrink:0}
.fckt{font-size:14px;line-height:1.4}
.more{font-size:12px;color:var(--mut);text-align:center}
.ferr{font-size:12.5px;color:var(--red)}
.ffo{padding:10px 16px 14px;border-top:1px solid var(--line);flex-shrink:0}
.fbtn{display:block;width:100%;background:var(--acc);color:#fff;border-radius:24px;padding:13px;font-size:15px;font-weight:600;text-align:center}
.fbtn.wvb{background:#1a73e8;border-radius:8px}
.fman{display:flex;align-items:center;justify-content:center;gap:4px;font-size:11.5px;color:var(--mut);margin-top:8px}.fman .ic{width:11px;height:11px}
.flowfull{flex:1;display:flex;flex-direction:column;background:var(--sheet);color:var(--sheet-ink);min-height:0}
.ext-t{font-weight:700;color:#3949ab}.ext-s{font-size:14px}.ext-e{font-size:12px;color:var(--mut)}
/* detrás de escena */
.stage{display:flex;gap:28px;justify-content:center;align-items:flex-start;flex-wrap:wrap}
.back{width:340px;max-width:100%;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 16px;display:flex;flex-direction:column;gap:10px;min-width:0}
.back h3{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--mut)}
.back h4{font-size:12px;color:var(--mut);font-weight:600;margin-top:4px}
.now{background:var(--soft);border:1px solid var(--acc);border-radius:10px;padding:10px 12px;font-size:13.5px}
.nowt{margin-bottom:4px}.nowh{font-size:12.5px;color:var(--mut);margin-bottom:6px}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{background:var(--card);border:1px solid var(--field);border-radius:16px;padding:5px 11px;font-size:12.5px;color:var(--abtn);font-weight:600;text-align:left;max-width:100%;overflow-wrap:anywhere}
.chip:hover{background:var(--soft)}.chip.warn{border-color:var(--warn);color:var(--warn);background:var(--warn-soft)}
.tools{display:flex;flex-wrap:wrap;gap:8px}
.btn{display:inline-flex;align-items:center;gap:6px;background:var(--acc);color:#fff;font-weight:600;border-radius:10px;padding:8px 14px;font-size:13px}
.btn .ic{width:16px;height:16px}.btn.ghost{background:var(--card);color:var(--ink);border:1px solid var(--field)}
.btn[aria-pressed=true]{background:var(--soft);border-color:var(--acc)}
.log{list-style:none;display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;font-size:12.5px;color:var(--mut)}
.log li{display:flex;gap:8px;align-items:flex-start;padding:6px 8px;border-radius:8px;background:var(--page)}
.log .ic{width:16px;height:16px;margin-top:1px}.log .lg-derive{color:var(--warn)}.log .lg-wait .ic{color:var(--abtn)}
.persona-note{font-size:12px;color:var(--mut);margin-top:6px}
.dfig{margin:0 0 18px}.dfig figcaption{font-size:12.5px;font-weight:600;color:#1a1d24;text-align:left;margin-bottom:6px}
.diag{background:#fff;border-radius:14px;padding:16px;overflow:auto;text-align:center}
.diag svg{max-width:100%;height:auto}
.foot{text-align:center;color:var(--mut);font-size:12px;margin-top:34px}
@media (max-width:520px){
 body{padding:14px 0 28px}
 .top,.agents,.agent>.ahead,.tabs{padding-inline:14px}
 .stage{gap:16px}
 .phone:not(.mini){width:100%;height:calc(100vh - 150px);min-height:480px;border-radius:0;padding:0;box-shadow:none}
 .phone:not(.mini) .screen{border-radius:0}
 .back{width:calc(100% - 28px);margin-inline:14px}
}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`;

function metaChips(meta) {
  const items = [["Cliente", meta.cliente], ["Bot", meta.bot], ["Versión", meta.version], ["Estado", meta.estado === "aprobado" ? "aprobada" : meta.estado ? "en revisión" : ""], ["Fecha", meta.fecha]].filter((x) => x[1]);
  return items.map((x) => `<span class="chip0"><strong>${esc(x[0])}:</strong> ${fmt(x[1])}</span>`).join("");
}

function agentSection(agent, i, sow, diagramas) {
  const id = String(agent.id == null ? "A" + (i + 1) : agent.id);
  const p = personaOf(agent), pendiente = !!p.nombre && isPending(p.nombre);
  const nombre = pendiente ? "POR DEFINIR" : p.nombre || agent.nombre || "Bot";
  const screens = buildScreens(agent), an = E.analyzePaths(agent);
  const ctx = { nombre, pendiente, initial: pendiente ? "?" : nombre.charAt(0).toUpperCase() || "J", cliente: (sow.meta || {}).cliente };
  const figs = Array.isArray(diagramas && diagramas[id]) ? diagramas[id] : diagramas && diagramas[id] ? [{ id: "", titulo: "", svg: diagramas[id] }] : [];
  const svg = figs.length ? figs : null;
  const meta = [agent.fase, agent.canal, p.nombre ? "Persona: " + p.nombre + (p.tono ? " (" + p.tono + ")" : "") : ""].filter(Boolean).map((x) => fmt(x)).join(" · ");
  const otros = an.otros.length ? `<details class="otros"><summary>Otros caminos (${an.totalOtros})</summary><ul>${an.otros.map((o) => `<li>${fmt(o.label)}: ${E.describeCounts(o.c)}</li>`).join("")}</ul></details>` : "";
  const forms = screens.filter((s) => s.kind === "form").length;
  const gallery = screens.length ? `<div class="g">${screens.map((s, k) => phoneHtml(s, k, ctx)).join("")}</div>` : '<p class="aviso">Este agente no tiene pasos para dibujar.</p>';
  const key = "ag-" + id.replace(/[^A-Za-z0-9_-]/g, "_");
  const tab = (v, label, sel) => `<button type="button" role="tab" id="${key}-t-${v}" data-view="${v}" aria-controls="${key}-${v}" aria-selected="${sel ? "true" : "false"}">${label}</button>`;
  return `<section class="agent" id="${key}" hidden aria-label="${esc(agent.nombre || id)}">
<div class="ahead"><h2>${esc(id)} · ${fmt(agent.nombre || "Agente")}</h2><div class="ameta">${meta}</div>${pendiente ? '<p class="persona-note">Nombre de la persona del bot pendiente de definir.</p>' : ""}
<div class="stats"><span class="stat">camino principal: ${E.describeCounts(an.principal.c)}</span><span class="stat">${E.index(agent).pasos.length} pasos en total</span><span class="stat">${screens.length} pantallas${forms ? ` (${forms} de formulario)` : ""}</span></div>${otros}</div>
<div class="tabs" role="tablist" aria-label="Vistas de ${esc(agent.nombre || id)}">${tab("sim", "Simular", true)}${tab("pan", "Pantallas", false)}${svg ? tab("diag", "Diagrama", false) : ""}</div>
<div class="pane" id="${key}-sim" role="tabpanel" aria-labelledby="${key}-t-sim"><div class="simbox" data-agent="${esc(id)}"></div></div>
<div class="pane" id="${key}-pan" role="tabpanel" aria-labelledby="${key}-t-pan" hidden>${gallery}</div>
${svg ? `<div class="pane" id="${key}-diag" role="tabpanel" aria-labelledby="${key}-t-diag" hidden><div class="diag">${svg.map((f) => `<figure class="dfig">${f.titulo ? `<figcaption>${esc(f.caption || f.titulo)}</figcaption>` : ""}${sanitizeSvg(f.svg)}</figure>`).join("")}</div></div>` : ""}
</section>`;
}

function buildHtml(sow, opts) {
  sow = sow || {};
  opts = opts || {};
  const meta = sow.meta || {};
  const agentes = (Array.isArray(sow.agentes) ? sow.agentes : []).map((a, i) => Object.assign({}, a, { id: a.id == null ? "A" + (i + 1) : String(a.id) }));
  const diag = opts.diagramas || {};
  const title = (meta.proyecto || "Simulador del bot") + " — simulador";
  const v = meta.version ? "v" + String(meta.version).replace(/^v/i, "") : "";
  const intNombres = {};
  (Array.isArray(sow.integraciones) ? sow.integraciones : []).forEach((it) => { if (it && it.id) intNombres[it.id] = it.nombre || it.id; });
  agentes.forEach((a) => { a.intNombres = intNombres; });
  const data = { icons: ICONS, agentes: agentes.map((a) => ({ id: a.id, nombre: a.nombre, persona: a.persona, intNombres, pasos: Array.isArray(a.pasos) ? a.pasos : [] })) };
  const sections = agentes.map((a, i) => agentSection(a, i, sow, diag)).join("\n");
  const switcher = agentes.length > 1 ? `<nav class="agents" role="tablist" aria-label="Agentes">${agentes.map((a, i) => `<button type="button" role="tab" class="agent-tab" data-agent="${esc(a.id)}" aria-selected="${i === 0}">${esc(a.id)} · ${fmt(a.nombre || "Agente")}</button>`).join("")}</nav>` : agentes.length ? `<button type="button" class="agent-tab" data-agent="${esc(agentes[0].id)}" hidden></button>` : "";
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<style>${CSS}</style></head><body>
<header class="top"><h1>${fmt(meta.proyecto || "Simulador del bot")}</h1>
<div class="chips0">${metaChips(meta)}</div>
<p class="aviso">Simulación basada en el SOW ${esc(v)} — los textos son propuestos. Lo que aparece en <span class="pend">rojo</span> está por definir. Los datos son de ejemplo.</p></header>
${switcher}
${sections || '<p class="aviso" style="text-align:center">Este SOW no define agentes (sow.agentes).</p>'}
<p class="foot">${esc(meta.proyecto || "")} · ${esc(meta.cliente || "")} · ${esc(v)} · Jelou AI</p>
<script type="application/json" id="sow-data">${safeJson(data)}</script>
<script>window.SimEngine=(${engineFactory.toString()})();</script>
<script>(${pageScript.toString()})();</script>
</body></html>`;
}

module.exports = { buildHtml, buildScreens, analyzePaths: E.analyzePaths, engineFactory, engine: E, escapeHtml: E.esc, formatText: E.fmt };
