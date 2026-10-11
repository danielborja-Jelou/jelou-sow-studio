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
        return { events: ev, wait: { kind: "webview", id: node.id, options: [], buttons: [], list: [], webview: wv, herramienta: formTool(node), etapa: node.etapa || "" } };
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
// Render HTML
// ---------------------------------------------------------------------------
const esc = E.esc, fmt = E.fmt;
const hhmm = (n) => "12:" + String(n % 60).padStart(2, "0");

function bubbleHtml(b, t) {
  if (b.r === "user") return `<div class="bo"><p class="bt">${fmt(b.text)}</p><div class="bm"><span class="btime">${t}</span><span class="bchk">✓✓</span></div></div>`;
  if (b.r === "sys") return b.kind === "wait" ? `<div class="bi ghost"><p class="bt">🔍 ${fmt(b.text)}</p></div>` : `<div class="note ${b.kind === "derive" ? "adv" : ""}">${b.kind === "derive" ? "👤 " : ""}${fmt(b.text)}</div>`;
  let h = `<div class="bi"><p class="bt">${fmt(b.text)}</p>`;
  if (b.lista && b.lista.length) h += `<div class="cta"><span class="ctab">☰ Ver opciones</span></div>`;
  h += `<div class="bm"><span class="btime">${t}</span></div></div>`;
  if (b.botones && b.botones.length) h += `<div class="qr">${b.botones.map((x, i) => `<span class="${i === 0 ? "qg" : "qw"}">↩ ${fmt(x)}</span>`).join("")}</div>`;
  return h;
}

// Campo de la pantalla de formulario, dibujado con lo que define el SOW (etiqueta, tipo, opciones, ejemplo, obligatorio).
function fieldHtml(c) {
  const req = c.obligatorio ? ' <span class="req">*</span>' : "";
  const lab = `<div class="fl">${fmt(c.etiqueta || "Campo")}${req}</div>`;
  const ej = c.ejemplo != null && String(c.ejemplo) !== "" ? String(c.ejemplo) : "";
  const ops = Array.isArray(c.opciones) ? c.opciones.map(String) : [];
  const val = (v, ph) => (v ? `<div class="fi">${fmt(v)}</div>` : `<div class="fi ph-txt">${ph}</div>`);
  switch (c.tipo) {
    case "casilla": return `<div class="fck"><div class="fckb">✓</div><span class="fckt">${fmt(c.etiqueta || "Acepto")}${req}</span></div>`;
    case "selector": {
      const shown = ej || ops[0];
      const cur = shown ? `<span class="fv">${fmt(shown)}</span>` : `<span class="ph-txt">Elige una opción</span>`;
      const hint = ops.length ? `<div class="fopt">Opciones: ${ops.slice(0, 4).map(fmt).join(" · ")}${ops.length > 4 ? " · …" : ""}</div>` : `<div class="fopt">[opciones por definir]</div>`;
      return `<div>${lab}<div class="fs">${cur}<span class="fsa">›</span></div>${hint}</div>`;
    }
    case "archivo": return `<div>${lab}<div class="fup">📎 ${ej ? fmt(ej) : "Adjuntar archivo"}</div></div>`;
    case "correo": return `<div>${lab}${val(ej, "nombre@ejemplo.com")}</div>`;
    case "numero": return `<div>${lab}${val(ej, "Solo números")}</div>`;
    case "fecha": return `<div>${lab}${val(ej, "dd/mm/aaaa")}</div>`;
    case "telefono": return `<div>${lab}${val(ej, "Número de celular")}</div>`;
    default: return `<div>${lab}${val(ej, "Escribe aquí")}</div>`;
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

function phoneHtml(s, idx, ctx) {
  const t = hhmm(idx);
  const sb = `<div class="sb"><span class="st">${t}</span><div class="si">▲▲▲</div></div>`;
  const wh = `<div class="wh"><div class="wv${ctx.pendiente ? " wvp" : ""}">${esc(ctx.initial)}</div><div><div class="wn">${ctx.pendiente ? '<span class="pendh">POR DEFINIR</span>' : esc(ctx.nombre)}</div><div class="ws">${ctx.pendiente ? "Nombre de la persona del bot pendiente de definir" : "Asistente Virtual"}</div></div><div class="wi">⋮</div></div>`;
  const ib = `<div class="ib"><div class="ip">Escribe un mensaje</div><div class="mc">🎤</div></div>`;
  let inner;
  if (s.kind === "form") {
    const wv = s.webview || {}, campos = Array.isArray(wv.campos) ? wv.campos : [];
    const shown = campos.slice(0, 7);
    inner = `${sb}<div class="fh"><div class="fx">✕</div><div class="ft">${fmt(wv.titulo || s.etapa || "Formulario")}</div><div class="fd">⋮</div></div>
<div class="fb">${shown.map(fieldHtml).join("")}${campos.length > 7 ? `<div class="more">+ ${campos.length - 7} campos más</div>` : ""}${campos.length ? "" : '<div class="more">Formulario sin campos definidos</div>'}</div>
<div class="ff"><button class="ffb" type="button" tabindex="-1">${fmt(wv.boton || "Enviar")}</button><div class="ffm">Formulario (${esc(TOOL_LABEL[s.herramienta] || TOOL_LABEL.por_definir)}) · <span class="ffml">${esc(ctx.cliente || "Jelou")}</span></div></div>`;
  } else if (s.kind === "ext") {
    inner = `${sb}<div class="eh"><div class="ex">✕</div><div class="et">${fmt(s.ext.titulo)}</div></div>
<div class="ecl-body"><div class="ecl-title">Proceso del cliente / tercero</div><div class="ecl-sub">${fmt(s.ext.texto || "Pantalla gestionada por un sistema externo.")}</div><div class="es"><span>🔗</span>Se abre fuera de WhatsApp (WebView externo)</div><div class="ecl-end">→ Jelou recibe solo el resultado (éxito/error)</div></div>`;
  } else {
    const bubbles = s.hist.map((b) => bubbleHtml(b, t)).join("");
    const sheet = s.kind === "sheet" ? `<div class="bsw"><div class="bsh"></div><div class="bshdr"><span class="bsbk">←</span><span class="bst">Opciones</span><span class="dots">⋮</span></div>${s.lista.slice(0, 10).map((x, i) => `<div class="bsi${i === 0 ? " sel" : ""}">${fmt(x)}${i === 0 ? '<span class="bsck">✓</span>' : ""}</div>`).join("")}</div>` : "";
    inner = `${sb}${wh}<div class="cb${s.kind === "sheet" ? " short" : ""}"><div class="dp"><span>Hoy</span></div>${bubbles}</div>${sheet || ib}`;
  }
  const lbl = `<div class="lbl"><strong>${fmt(s.label)}</strong>${s.main ? '<span class="tag main">Camino principal</span>' : `<span class="tag ${s.tone}">${s.tone === "adv" ? "Asesor" : s.tone === "err" ? "Error" : "Rama"}: ${fmt(s.branch || "alternativa")}</span>`}${linkLines(s.links)}</div>`;
  return `<figure class="ph-wrap" aria-label="${esc(s.label)}"><div class="ph"><div class="nc"></div><div class="sc"${s.kind === "sheet" ? ' style="background:#E5DDD5"' : ""}>${inner}</div><div class="hb"></div></div><figcaption>${lbl}</figcaption></figure>`;
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
  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  var esc = Eng.esc, fmt = Eng.fmt;

  // --- pestañas de agente y de vista
  function showAgent(id) {
    $$(".agent").forEach(function (s) { s.hidden = s.id !== "ag-" + String(id).replace(/[^A-Za-z0-9_-]/g, "_"); });
    $$(".agent-tab").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-agent") === id ? "true" : "false"); });
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
    box.innerHTML =
      '<div class="simwrap"><div class="ph sim"><div class="nc"></div><div class="sc simsc">' +
      '<div class="sb"><span class="st">12:00</span><div class="si">▲▲▲</div></div>' +
      '<div class="wh"><div class="wv' + (pend ? " wvp" : "") + '">' + (pend ? "?" : esc(nombre.charAt(0).toUpperCase())) + '</div><div><div class="wn">' + (pend ? '<span class="pendh">POR DEFINIR</span>' : esc(nombre)) + '</div><div class="ws" data-role="status">' + (pend ? "Nombre de la persona del bot pendiente de definir" : "Asistente Virtual") + '</div></div><div class="wi">⋮</div></div>' +
      '<div class="cb chat" data-role="chat" tabindex="0" aria-live="polite" aria-label="Conversación simulada"></div>' +
      '<div class="hints" data-role="hints"></div>' +
      '<div class="outcome" data-role="outcome" hidden></div>' +
      '<form class="ib" data-role="form"><input class="ipt" data-role="input" type="text" placeholder="Escribe un mensaje" aria-label="Escribe un mensaje" autocomplete="off"><button class="mc" type="submit" aria-label="Enviar mensaje">➤</button></form>' +
      '<div class="ov" data-role="sheet" hidden></div><div class="ov" data-role="wv" hidden></div>' +
      '</div><div class="hb"></div></div>' +
      '<aside class="simside"><button type="button" class="btn" data-role="reset">↻ Reiniciar</button>' +
      '<p class="hint"><strong>Cómo usarlo.</strong> Pulsa botones o filas de lista, completa el formulario o escribe texto libre. Los pasos automáticos (router, API, tercero) se resuelven solos; en decisiones y APIs con varias salidas eliges el resultado a simular.</p>' +
      '<p class="hint" data-role="step"></p></aside></div>';
    var chat = $("[data-role=chat]", box), hints = $("[data-role=hints]", box), outc = $("[data-role=outcome]", box),
      form = $("[data-role=form]", box), input = $("[data-role=input]", box), sheet = $("[data-role=sheet]", box),
      wvBox = $("[data-role=wv]", box), stepEl = $("[data-role=step]", box);
    var S = { shown: [], wait: null, pending: null, queue: [], busy: false, ctx: null, timer: null, min: 0 };

    function time(n) { return "12:" + String(n % 60).padStart(2, "0"); }
    function lastChoiceIndex() { for (var i = S.shown.length - 1; i >= 0; i--) { var e = S.shown[i]; if (e.t === "bot" && ((e.botones && e.botones.length) || (e.lista && e.lista.length))) return i; } return -1; }
    function render() {
      var active = !S.busy && S.wait && S.wait.kind === "choice", lc = active ? lastChoiceIndex() : -1;
      var h = '<div class="dp"><span>Hoy</span></div>';
      S.shown.forEach(function (e, i) {
        if (e.t === "user") h += '<div class="bo"><p class="bt">' + fmt(e.text) + '</p><div class="bm"><span class="btime">' + e.time + '</span><span class="bchk">✓✓</span></div></div>';
        else if (e.t === "bot") {
          h += '<div class="bi"><p class="bt">' + fmt(e.text) + "</p>";
          if (e.lista && e.lista.length) h += '<div class="cta">' + (i === lc ? '<button type="button" class="ctab" data-act="sheet">☰ Ver opciones</button>' : '<span class="ctab">☰ Ver opciones</span>') + "</div>";
          h += '<div class="bm"><span class="btime">' + e.time + "</span></div></div>";
          if (e.botones && e.botones.length) h += '<div class="qr">' + e.botones.map(function (b, k) { var c = k === 0 ? "qg" : "qw"; return i === lc ? '<button type="button" class="' + c + '" data-b="' + k + '">↩ ' + fmt(b) + "</button>" : '<span class="' + c + '">↩ ' + fmt(b) + "</span>"; }).join("") + "</div>";
        } else if (e.kind === "wait") h += '<div class="bi ghost"><p class="bt">🔍 ' + fmt(e.text) + "</p></div>";
        else h += '<div class="note ' + (e.kind === "derive" ? "adv" : e.kind === "sim" ? "simn" : "") + '">' + (e.kind === "derive" ? "👤 " : "") + fmt(e.text) + "</div>";
      });
      if (S.busy) h += '<div class="bi typing" aria-hidden="true"><span></span><span></span><span></span></div>';
      chat.innerHTML = h;
      chat.scrollTop = chat.scrollHeight;
    }
    function controls() {
      var w = S.wait, k = w ? w.kind : "";
      hints.innerHTML = ""; outc.hidden = true; outc.innerHTML = "";
      var canType = !S.busy && (k === "choice" || k === "text" || k === "outcome");
      input.disabled = !canType; $("button", form).disabled = !canType;
      input.placeholder = k === "end" ? "Conversación finalizada" : "Escribe un mensaje";
      if (S.busy || !w) { stepEl.textContent = ""; return; }
      stepEl.innerHTML = "<strong>Paso actual:</strong> " + esc(w.id || "—") + (w.etapa ? " — " + esc(w.etapa) : "");
      if (k === "text") {
        var h = "";
        if (w.example) h += '<button type="button" class="chip" data-act="example">✎ Escribir: «' + esc(w.example.length > 40 ? w.example.slice(0, 40) + "…" : w.example) + "»</button>";
        w.options.forEach(function (o, i) { h += '<button type="button" class="chip" data-o="' + i + '">' + esc(o) + "</button>"; });
        hints.innerHTML = h || '<span class="hint">Escribe cualquier texto para continuar.</span>';
      } else if (k === "webview") {
        hints.innerHTML = '<button type="button" class="chip" data-act="openform">📋 Abrir formulario</button>';
      } else if (k === "outcome") {
        outc.hidden = false;
        outc.innerHTML = '<div class="olabel">Simular resultado' + (w.title ? ": " + esc(w.title) : "") + '</div><div class="obtns">' + w.options.map(function (o, i) { return '<button type="button" class="obtn" data-o="' + i + '">' + esc(o) + "</button>"; }).join("") + "</div>";
      } else if (k === "end") {
        hints.innerHTML = '<button type="button" class="chip" data-act="reset">↻ Reiniciar conversación</button>';
      }
    }
    function closeOv() { sheet.hidden = true; wvBox.hidden = true; }
    function openSheet() {
      var w = S.wait; if (!w || !w.list.length) return;
      sheet.innerHTML = '<div class="bsbg" data-act="closesheet"></div><div class="bsw"><div class="bsh"></div><div class="bshdr"><button type="button" class="bsbk" data-act="closesheet" aria-label="Cerrar">←</button><span class="bst">Opciones</span></div>' +
        w.list.map(function (x, i) { return '<button type="button" class="bsi" data-l="' + i + '">' + esc(x) + "</button>"; }).join("") + "</div>";
      sheet.hidden = false;
      var f = $(".bsi", sheet); if (f) f.focus();
    }
    function openForm() {
      var w = S.wait; if (!w || w.kind !== "webview") return;
      var wv = w.webview || {}, campos = wv.campos || [], sd = Eng.sampleData(wv), h = '<div class="fh"><button type="button" class="fx" data-act="closeform" aria-label="Cerrar formulario">✕</button><div class="ft">' + esc(wv.titulo || w.etapa || "Formulario") + '</div></div><form class="fb wvform" data-role="wvform" novalidate>';
      campos.forEach(function (c, i) {
        var id = "f" + i + "-" + Math.random().toString(36).slice(2, 6), lab = fmt(c.etiqueta || "Campo") + (c.obligatorio ? ' <span class="req">*</span>' : "");
        var ej = c.ejemplo != null && String(c.ejemplo) !== "" ? String(c.ejemplo) : "";
        if (c.tipo === "casilla") h += '<label class="fck"><input type="checkbox" data-f="' + i + '"><span class="fckt">' + lab + "</span></label>";
        else if (c.tipo === "selector") {
          var ops = (c.opciones && c.opciones.length ? c.opciones.map(String) : []);
          if (ej && ops.indexOf(ej) < 0) ops.unshift(ej);
          if (!ops.length) ops = [sd[i] ? sd[i].valor : "Opción de ejemplo"];
          h += '<div><label class="fl" for="' + id + '">' + lab + '</label><select class="fi" id="' + id + '" data-f="' + i + '"><option value="">Elige una opción</option>' + ops.map(function (o) { return "<option>" + esc(o) + "</option>"; }).join("") + "</select>" + (c.opciones && c.opciones.length ? "" : '<div class="fopt">' + fmt("[opciones por definir]") + "</div>") + "</div>";
        }
        else if (c.tipo === "archivo") h += '<div><div class="fl">' + lab + '</div><button type="button" class="fup" data-f="' + i + '" data-file="">📎 Adjuntar archivo</button></div>';
        else {
          var ph = ej ? "Ej.: " + ej : c.tipo === "correo" ? "nombre@ejemplo.com" : c.tipo === "numero" ? "Solo números" : c.tipo === "fecha" ? "dd/mm/aaaa" : c.tipo === "telefono" ? "Número de celular" : "Escribe aquí";
          h += '<div><label class="fl" for="' + id + '">' + lab + '</label><input class="fi" id="' + id + '" data-f="' + i + '" type="' + (c.tipo === "correo" ? "email" : "text") + '"' + (c.tipo === "numero" || c.tipo === "telefono" ? ' inputmode="numeric"' : "") + ' placeholder="' + esc(ph) + '"></div>';
        }
      });
      if (!campos.length) h += '<p class="more">Formulario sin campos definidos.</p>';
      var tool = { flows: "WhatsApp Flow", webview: "WebView" }[w.herramienta] || "WhatsApp Flow / WebView";
      h += '<p class="ferr" data-role="ferr" hidden>Completa los campos obligatorios (*) o usa «Rellenar con datos de ejemplo».</p><button type="button" class="linkb" data-act="fill">Rellenar con datos de ejemplo</button></form><div class="ff"><button type="button" class="ffb" data-act="submitform">' + esc(wv.boton || "Enviar") + '</button><div class="ffm">Formulario (' + tool + ') simulado · escribe o elige tus valores</div></div>';
      wvBox.innerHTML = h; wvBox.hidden = false;
      var f = $("input,select,button.fup", wvBox); if (f) f.focus();
    }
    // Campos obligatorios vacíos (los marca en rojo); devuelve cuántos faltan.
    function missingRequired() {
      var campos = (S.wait.webview && S.wait.webview.campos) || [], n = 0;
      campos.forEach(function (c, i) {
        var el = $('[data-f="' + i + '"]', wvBox); if (!el) return;
        var empty = el.type === "checkbox" ? !el.checked : el.hasAttribute("data-file") ? !el.getAttribute("data-file") : !String(el.value || "").trim();
        var bad = !!c.obligatorio && empty;
        el.classList.toggle("bad", bad); if (bad) n++;
      });
      var er = $("[data-role=ferr]", wvBox); if (er) er.hidden = !n;
      return n;
    }
    function fillSamples(onlyEmpty) {
      var w = S.wait, campos = (w.webview && w.webview.campos) || [], sd = Eng.sampleData(w.webview);
      $$("[data-f]", wvBox).forEach(function (el) {
        var i = +el.getAttribute("data-f"), v = sd[i] ? sd[i].valor : "";
        if (el.type === "checkbox") { if (!onlyEmpty || !el.checked) el.checked = true; }
        else if (el.tagName === "SELECT") { if (!onlyEmpty || !el.value) el.value = v; }
        else if (el.hasAttribute("data-file")) { if (!onlyEmpty || !el.getAttribute("data-file")) { el.setAttribute("data-file", v); el.textContent = "📎 " + v + " ✓"; } }
        else if (!onlyEmpty || !el.value) el.value = v;
      });
    }
    function collect() {
      var campos = (S.wait.webview && S.wait.webview.campos) || [], out = [];
      campos.forEach(function (c, i) {
        var el = $('[data-f="' + i + '"]', wvBox), v = "";
        if (el) v = el.type === "checkbox" ? (el.checked ? "Sí" : "No") : el.hasAttribute("data-file") ? el.getAttribute("data-file") : el.value;
        out.push({ etiqueta: c.etiqueta || "Campo", tipo: c.tipo || "texto", valor: v });
      });
      return out;
    }
    function delayFor(e) { if (reduce) return 0; return e.t === "user" ? 250 : e.t === "bot" ? 600 : e.kind === "wait" ? 850 : e.kind === "form" ? 300 : 350; }
    function play(events, wait) {
      closeOv(); S.wait = null; S.pending = wait; S.queue = events.slice(); S.busy = true; controls(); step();
    }
    function step() {
      if (!S.queue.length) {
        S.busy = false; S.wait = S.pending; render(); controls();
        if (S.wait && S.wait.kind === "webview") openForm();
        return;
      }
      var e = S.queue.shift(); e.time = time(S.min++); S.shown.push(e); render();
      S.timer = setTimeout(step, delayFor(e));
    }
    function send(inp) {
      if (S.busy || !S.wait) return;
      var r = Eng.answer(DATAAGENT, S.wait, inp, S.ctx);
      play(r.events, r.wait);
    }
    var DATAAGENT = agent;
    function reset() {
      clearTimeout(S.timer); S.shown = []; S.min = 0; S.queue = [];
      var r = Eng.start(agent); S.ctx = r.ctx; play(r.events, r.wait);
    }
    box.addEventListener("click", function (ev) {
      var el = ev.target.closest("[data-b],[data-l],[data-o],[data-act]");
      if (!el || !box.contains(el)) return;
      var w = S.wait;
      if (el.hasAttribute("data-b") && w) { send({ type: "choice", value: w.buttons[+el.getAttribute("data-b")] }); return; }
      if (el.hasAttribute("data-l") && w) { var v = w.list[+el.getAttribute("data-l")]; closeOv(); send({ type: "choice", value: v }); return; }
      if (el.hasAttribute("data-o") && w) { send({ type: w.kind === "outcome" ? "outcome" : "choice", value: w.options[+el.getAttribute("data-o")] }); return; }
      var act = el.getAttribute("data-act");
      if (act === "reset") reset();
      else if (act === "sheet") openSheet();
      else if (act === "closesheet") closeOv();
      else if (act === "openform") openForm();
      else if (act === "closeform") closeOv();
      else if (act === "example" && w) send({ type: "text", text: w.example });
      else if (act === "fill") fillSamples(false);
      else if (act === "submitform") { if (missingRequired()) return; var d = collect(); closeOv(); send({ type: "submit", data: d }); }
    });
    // botón de archivo del formulario simulado
    box.addEventListener("click", function (ev) {
      var b = ev.target.closest("button.fup[data-f]");
      if (b && b.hasAttribute("data-file")) { var on = !b.getAttribute("data-file"); b.setAttribute("data-file", on ? "documento.pdf" : ""); b.textContent = on ? "📎 documento.pdf ✓" : "📎 Adjuntar archivo"; }
    });
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var t = input.value.trim(); if (!t || input.disabled) return;
      input.value = ""; send({ type: "text", text: t });
    });
    box.addEventListener("keydown", function (ev) { if (ev.key === "Escape") closeOv(); });
    $("[data-role=reset]", box).addEventListener("click", reset);
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
:root{--bg:#16213e;--card:rgba(255,255,255,.05);--line:rgba(255,255,255,.12);--txt:#e8edf5;--mut:#9aa7bd;--acc:#00b3c7;--wa:#128C7E;--wag:#25D366;--chat:#E5DDD5}
html{-webkit-text-size-adjust:100%;overflow-x:hidden}
body{overflow-x:hidden;max-width:100vw}
.chip0,.agent-tab,.stat,.tabs [role=tab]{max-width:100%;overflow-wrap:anywhere;text-align:center}
.ph-wrap,.simwrap>*,.ahead{min-width:0;max-width:100%}
body{background:var(--bg);color:var(--txt);font-family:Poppins,system-ui,-apple-system,"Segoe UI",sans-serif;padding:28px 20px 40px;line-height:1.45}
button{font:inherit;cursor:pointer;color:inherit;background:none;border:0}
:focus-visible{outline:3px solid #7ee7f3;outline-offset:2px;border-radius:6px}
.pend{color:#ff4d4d;font-weight:700}
.top{max-width:1240px;margin:0 auto 22px;text-align:center}
.top h1{font-size:clamp(20px,4vw,28px);font-weight:700;color:#fff;margin-bottom:6px}
.chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:8px 0}
.chip0{background:var(--card);border:1px solid var(--line);border-radius:999px;padding:3px 12px;font-size:12px;color:var(--txt)}
.aviso{font-size:12px;color:var(--mut);margin-top:6px}
.agents{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin:0 auto 18px;max-width:1240px}
.agent-tab{padding:8px 16px;border-radius:999px;border:1px solid var(--line);background:var(--card);font-size:13px;font-weight:600}
.agent-tab[aria-selected=true]{background:var(--acc);border-color:var(--acc);color:#04212a}
.agent{max-width:1240px;margin:0 auto}
.agent[hidden],.pane[hidden],[hidden]{display:none!important}
.ahead{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:14px 18px;margin-bottom:14px}
.ahead h2{font-size:17px;color:#fff}
.ameta{font-size:12.5px;color:var(--mut);margin-top:2px}
.stats{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px;align-items:center}
.stat{background:rgba(0,179,199,.16);border:1px solid rgba(0,179,199,.5);color:#bff3f9;border-radius:999px;padding:3px 12px;font-size:12px;font-weight:600}
details.otros{font-size:12.5px;color:var(--mut);margin-top:8px}
details.otros summary{cursor:pointer;color:var(--txt)}
details.otros ul{margin:6px 0 0 18px}
.tabs{display:flex;gap:6px;justify-content:center;margin:6px 0 20px;flex-wrap:wrap}
.tabs [role=tab]{padding:8px 20px;border-radius:10px;font-size:13px;font-weight:600;border:1px solid var(--line);background:var(--card)}
.tabs [role=tab][aria-selected=true]{background:#fff;color:#16213e;border-color:#fff}
.g{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(280px,100%),280px));gap:28px 22px;justify-content:center}
.ph-wrap{display:flex;flex-direction:column;align-items:center;gap:10px;margin:0}
figcaption.lbl,.lbl{color:var(--mut);font-size:11.5px;text-align:center;display:flex;flex-direction:column;gap:4px;align-items:center;max-width:280px}
.lbl strong{color:#fff;font-size:12.5px;font-weight:600}
.tag{display:inline-block;border-radius:999px;padding:1px 9px;font-size:10.5px;font-weight:600;border:1px solid}
.tag.main{color:#7ee7a8;border-color:#2e7d4f;background:rgba(37,211,102,.1)}
.tag.alt{color:#bff3f9;border-color:#0e7c8a;background:rgba(0,179,199,.12)}
.tag.err{color:#ff9a9a;border-color:#a33;background:rgba(255,77,77,.1)}
.tag.adv{color:#ffd28a;border-color:#a77415;background:rgba(255,170,0,.1)}
.lnk{font-size:10.5px;color:#ffd28a}
.ph{width:min(280px,100%);background:#0d0d0d;border-radius:44px;padding:12px 10px;box-shadow:0 0 0 1px #2a2a2a,0 20px 60px rgba(0,0,0,.6),inset 0 0 0 1px rgba(255,255,255,.04);color:#111}
.nc{width:44px;height:8px;background:#1a1a1a;border-radius:4px;margin:0 auto 6px}
.sc{border-radius:30px;overflow:hidden;background:#fff;position:relative}
.sb{background:#1a1a1a;padding:5px 14px;display:flex;justify-content:space-between;align-items:center}
.st{color:#fff;font-size:10px;font-weight:600}.si{color:#fff;font-size:10px}
.hb{width:52px;height:4px;background:#2a2a2a;border-radius:2px;margin:8px auto 0}
.wh{background:#128C7E;padding:9px 12px;display:flex;align-items:center;gap:8px}
.wv{width:34px;height:34px;background:#25D366;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;flex-shrink:0;box-shadow:0 0 0 2px rgba(255,255,255,.2)}
.wn{color:#fff;font-size:12.5px;font-weight:600;line-height:1.2}.ws{color:rgba(255,255,255,.75);font-size:10px}
.wi{margin-left:auto;color:#fff;font-size:14px}
.cb{background:#E5DDD5;padding:10px 8px;min-height:340px;display:flex;flex-direction:column;gap:5px}
.cb.short{min-height:120px}
.dp{text-align:center;margin-bottom:3px}.dp span{background:rgba(255,255,255,.78);border-radius:6px;padding:2px 9px;font-size:10px;color:#555}
.bi{background:#fff;border-radius:8px;border-top-left-radius:2px;padding:8px 10px;max-width:88%;align-self:flex-start;box-shadow:0 1px 1px rgba(0,0,0,.08)}
.bo{background:#DCF8C6;border-radius:8px;border-top-right-radius:2px;padding:8px 10px;max-width:88%;align-self:flex-end;box-shadow:0 1px 1px rgba(0,0,0,.08)}
.bi.ghost{background:rgba(255,255,255,.7);color:#555;font-style:italic}
.bt{font-size:12px;color:#111;line-height:1.45;word-break:break-word}
.bm{display:flex;justify-content:flex-end;align-items:center;gap:3px;margin-top:2px}
.btime{font-size:9px;color:#8696a0}.bchk{font-size:10px;color:#53bdeb}
.cta{border-top:1px solid #E8E8E8;margin-top:5px;text-align:center;padding-top:5px}
.ctab{font-size:11px;color:#128C7E;font-weight:600;background:none;border:0;display:block;width:100%;padding:4px}
.qr{display:flex;flex-direction:column;gap:4px;margin-top:2px;max-width:88%;align-self:flex-start;width:88%}
.qg,.qw{text-align:center;border-radius:20px;padding:6px 10px;font-size:11px;font-weight:600;display:block;width:100%}
.qg{background:#e8f5e9;color:#2e7d32;border:1px solid #a5d6a7}
.qw{background:#fff;color:#555;border:1px solid #ddd;font-weight:500}
.note{align-self:center;background:rgba(255,255,255,.8);border-radius:8px;padding:4px 10px;font-size:10.5px;color:#555;text-align:center;max-width:92%}
.note.adv{background:#fff3d6;color:#7a5200;border:1px solid #f0cf85;font-weight:600}
.note.simn{background:#e0f4f7;color:#0e5b66}
.ib{background:#f0f0f0;padding:7px 10px;display:flex;align-items:center;gap:7px}
.ip{flex:1;background:#fff;border-radius:22px;padding:7px 13px;font-size:11px;color:#bbb}
.mc{width:32px;height:32px;background:#128C7E;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;font-size:14px;color:#fff}
.mc:disabled{background:#9bb;cursor:not-allowed}
.fh{background:#fff;padding:11px 13px;display:flex;align-items:center;gap:9px;border-bottom:1.5px solid #F0F0F0}
.fx{width:26px;height:26px;background:#F0F0F0;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;color:#555;flex-shrink:0}
.ft{font-size:13px;font-weight:700;color:#111;flex:1}.fd{color:#999;font-size:16px}
.fb{padding:13px 12px;display:flex;flex-direction:column;gap:10px;background:#fff;min-height:300px}
.fl{font-size:10.5px;color:#666;margin-bottom:4px;font-weight:500;display:block}
.req{color:#d32f2f;font-weight:700}
.fi{border:1.5px solid #DCDCDC;border-radius:8px;padding:10px 12px;font-size:12px;width:100%;color:#111;background:#fff;font-family:inherit}
.ph-txt{color:#aaa}
.fv{color:#111}.fopt{font-size:10px;color:#128C7E;margin-top:3px}.ferr{font-size:11px;color:#d32f2f}
.fi.bad{border-color:#d32f2f}
.wvp{background:#c62828;box-shadow:0 0 0 2px rgba(255,255,255,.35)}
.pendh{background:#fff;color:#c62828;font-weight:700;border-radius:999px;padding:1px 9px;font-size:11px}
.dfig{margin:0 0 18px}.dfig figcaption{font-size:12.5px;font-weight:600;color:#1a1d24;text-align:left;margin-bottom:6px}
.fs{border:1.5px solid #DCDCDC;border-radius:8px;padding:10px 12px;font-size:12px;display:flex;justify-content:space-between;align-items:center;background:#fff}
.fsa{color:#128C7E;font-size:14px}
.fup{border:1.5px dashed #9bd;border-radius:8px;padding:11px 12px;font-size:12px;color:#1565c0;background:#EAF5FB;width:100%;text-align:center}
.fck{display:flex;align-items:flex-start;gap:9px;padding:6px 0}
.fckb{width:18px;height:18px;border:2px solid #25D366;border-radius:4px;flex-shrink:0;margin-top:1px;background:#25D366;display:flex;align-items:center;justify-content:center;color:#fff;font-size:11px}
.fckt{font-size:11.5px;color:#444;line-height:1.5}
.more{font-size:10.5px;color:#999;text-align:center}
.ff{padding:10px 12px;background:#fff;border-top:1.5px solid #F0F0F0}
.ffb{background:#25D366;color:#fff;border:0;border-radius:24px;padding:12px;width:100%;font-size:13px;font-weight:700}
.ffm{text-align:center;font-size:9.5px;color:#aaa;margin-top:7px}.ffml{color:#128C7E}
.bsw{background:#fff;border-radius:18px 18px 0 0;overflow:hidden}
.bsh{width:38px;height:4px;background:#DCDCDC;border-radius:2px;margin:10px auto 0}
.bshdr{display:flex;align-items:center;gap:9px;padding:11px 14px;border-bottom:1px solid #F0F0F0}
.bsbk{color:#128C7E;font-size:20px;line-height:1}.dots{color:#aaa;font-size:15px}
.bst{font-size:13px;font-weight:700;color:#111;flex:1}
.bsi{display:flex;align-items:center;padding:13px 14px;border-bottom:1px solid #F5F5F5;font-size:12.5px;color:#333;width:100%;text-align:left}
.bsi.sel{color:#128C7E;font-weight:700}.bsck{margin-left:auto;color:#25D366;font-size:16px;font-weight:700}
.eh{background:#3949AB;padding:11px 13px;display:flex;align-items:center;gap:9px}
.ex{width:26px;height:26px;background:rgba(255,255,255,.18);border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;color:#fff;flex-shrink:0}
.et{font-size:13px;font-weight:700;color:#fff;flex:1}
.ecl-body{background:#fff;padding:13px 12px;min-height:300px;display:flex;flex-direction:column;gap:8px}
.ecl-title{font-size:11.5px;font-weight:700;color:#3949AB}.ecl-sub{font-size:11px;color:#555;line-height:1.5}
.es{display:flex;align-items:center;gap:9px;font-size:11px;padding:8px 10px;background:#EEF2FF;border-radius:7px;color:#333}
.ecl-end{text-align:center;font-size:10px;color:#aaa;margin-top:4px}
/* simulador */
.simwrap{display:flex;gap:28px;justify-content:center;align-items:flex-start;flex-wrap:wrap}
.ph.sim{width:min(380px,100%)}
.simsc{display:flex;flex-direction:column;height:700px;max-height:calc(100vh - 70px);min-height:520px}
.sim .cb.chat{flex:1;min-height:0;overflow-y:auto;gap:6px;padding:12px 10px}
.sim .bt{font-size:13.5px}.sim .qg,.sim .qw{font-size:12.5px;padding:8px 12px;cursor:pointer}
.sim .ctab{font-size:12.5px;cursor:pointer}.sim .note{font-size:11.5px}
.sim button.qg:hover{background:#d3edd5}.sim button.qw:hover{background:#f3f3f3}
.sim .ipt{flex:1;min-width:0;border:0;background:#fff;border-radius:22px;padding:9px 14px;font-size:13px;color:#111;font-family:inherit}
.sim .ipt:disabled{background:#e6e6e6}
.hints{background:#f0f0f0;padding:6px 8px 0;display:flex;flex-wrap:wrap;gap:6px}
.hints:empty{display:none}.hints .hint{font-size:11px;color:#666}
.chip{background:#fff;border:1px solid #cfd8dc;border-radius:16px;padding:5px 11px;font-size:11.5px;color:#0e5b66;font-weight:600}
.chip:hover{background:#e0f4f7}
.outcome{background:#fff8e1;border-top:1px solid #f0cf85;padding:8px 10px}
.olabel{font-size:11px;font-weight:700;color:#7a5200;margin-bottom:5px}
.obtns{display:flex;flex-wrap:wrap;gap:6px}
.obtn{background:#fff;border:1.5px solid #e0a82e;color:#7a5200;border-radius:16px;padding:5px 12px;font-size:12px;font-weight:700}
.obtn:hover{background:#ffeab0}
.ov{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;background:#fff;top:0}
.ov[data-role=sheet]{background:rgba(0,0,0,.35);justify-content:flex-end}
.ov .bsbg{flex:1}.ov .bsw{max-height:75%;overflow-y:auto}
.ov[data-role=sheet] .bsbk{width:28px}
.ov[data-role=wv] .fh{padding-top:14px}.ov[data-role=wv] .fb{flex:1;overflow-y:auto}
.ov .fx{cursor:pointer}.ov .fl{margin-bottom:3px}
.wvform .fi:focus{border-color:#25D366;outline:none;box-shadow:0 0 0 3px rgba(37,211,102,.25)}
.linkb{color:#128C7E;font-size:11.5px;text-decoration:underline;text-align:left}
.typing{display:flex;gap:4px;padding:11px 14px}
.typing span{width:6px;height:6px;border-radius:50%;background:#9aa;animation:bl 1s infinite}
.typing span:nth-child(2){animation-delay:.15s}.typing span:nth-child(3){animation-delay:.3s}
@keyframes bl{0%,80%,100%{opacity:.3}40%{opacity:1}}
@media (prefers-reduced-motion:reduce){.typing span{animation:none}}
.simside{max-width:300px;display:flex;flex-direction:column;gap:12px}
.simside .hint{font-size:12.5px;color:var(--mut)}.simside strong{color:#fff}
.btn{background:var(--acc);color:#04212a;font-weight:700;border-radius:10px;padding:10px 16px;font-size:13px;align-self:flex-start}
.diag{background:#fff;border-radius:14px;padding:16px;overflow:auto;text-align:center}
.diag svg{max-width:100%;height:auto}
.foot{text-align:center;color:#6b7690;font-size:12px;margin-top:34px}
@media (max-width:640px){
 body{padding:18px 12px 32px}
 .tabs [role=tab],.agent-tab{padding:8px 12px;font-size:12.5px}
 .simwrap{flex-direction:column;align-items:center;gap:16px}
 .ph.sim{border-radius:36px}
 .simside{width:100%}
 .simsc{height:calc(100vh - 80px);min-height:480px}
 .simside{max-width:100%}
}
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
<div class="ahead"><h2>${esc(id)} · ${fmt(agent.nombre || "Agente")}</h2><div class="ameta">${meta}</div>
<div class="stats"><span class="stat">camino principal: ${E.describeCounts(an.principal.c)}</span><span class="stat">${E.index(agent).pasos.length} pasos en total</span><span class="stat">${screens.length} pantallas${forms ? ` (${forms} de formulario)` : ""}</span></div>${otros}</div>
<div class="tabs" role="tablist" aria-label="Vistas de ${esc(agent.nombre || id)}">${tab("pan", "Pantallas", true)}${tab("sim", "Simular", false)}${svg ? tab("diag", "Diagrama", false) : ""}</div>
<div class="pane" id="${key}-pan" role="tabpanel" aria-labelledby="${key}-t-pan">${gallery}</div>
<div class="pane" id="${key}-sim" role="tabpanel" aria-labelledby="${key}-t-sim" hidden><div class="simbox" data-agent="${esc(id)}"></div></div>
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
  const data = { agentes: agentes.map((a) => ({ id: a.id, nombre: a.nombre, persona: a.persona, intNombres, pasos: Array.isArray(a.pasos) ? a.pasos : [] })) };
  const sections = agentes.map((a, i) => agentSection(a, i, sow, diag)).join("\n");
  const switcher = agentes.length > 1 ? `<nav class="agents" role="tablist" aria-label="Agentes">${agentes.map((a, i) => `<button type="button" role="tab" class="agent-tab" data-agent="${esc(a.id)}" aria-selected="${i === 0}">${esc(a.id)} · ${fmt(a.nombre || "Agente")}</button>`).join("")}</nav>` : agentes.length ? `<button type="button" class="agent-tab" data-agent="${esc(agentes[0].id)}" hidden></button>` : "";
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<style>${CSS}</style></head><body>
<header class="top"><h1>${fmt(meta.proyecto || "Simulador del bot")}</h1>
<div class="chips">${metaChips(meta)}</div>
<p class="aviso">Simulación basada en el SOW ${esc(v)} — los textos son propuestos${v ? "" : ""}. Lo que aparece en <span class="pend">rojo</span> está por definir.</p></header>
${switcher}
${sections || '<p class="aviso" style="text-align:center">Este SOW no define agentes (sow.agentes).</p>'}
<p class="foot">${esc(meta.proyecto || "")} · ${esc(meta.cliente || "")} · ${esc(v)} · Jelou AI</p>
<script type="application/json" id="sow-data">${safeJson(data)}</script>
<script>window.SimEngine=(${engineFactory.toString()})();</script>
<script>(${pageScript.toString()})();</script>
</body></html>`;
}

module.exports = { buildHtml, buildScreens, analyzePaths: E.analyzePaths, engineFactory, engine: E, escapeHtml: E.esc, formatText: E.fmt };
