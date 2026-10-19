#!/usr/bin/env node
// Genera el simulador de WhatsApp desde sow.json usando el kit de la skill `jelou-demo-whatsapp` (plugin jelou-demos-whatsapp).
// sow.json -> guion.json (este script) -> validar.js (validador oficial de Meta para los Flows) -> build.py -> HTML autocontenido
// (+ extensión visual de la skill para los webviews: cámara, firma, código, productos, capturas…).
// Uso: node sow_a_demo.js <sow.json> <salida.html> [--sin-validar]
//
// Principios (ver references/simulador-visual.md):
//  - Fiel al SOW: un recorrido por flujo con las ramas que elige la persona DENTRO del chat (botones con `ir`, reintentos incluidos);
//    las ramas que decide el sistema salen como recorridos alternos.
//  - Lo que la persona VE se dibuja con el CATÁLOGO DE RECURSOS (assets/visuales/recursos.json + el de tu usuario + sow.demo.recursos):
//    pasarelas de pago, firma electrónica, biometría, captura de documento, ecommerce, fotos, PDF, ubicación… y un respaldo genérico.
//    No hay reglas por cliente en este archivo: lo nuevo se enseña como datos (scripts/aprender_recurso.js).
//  - Las llamadas a API y decisiones NO son pasos del chat: van en la nota del presentador del paso visible siguiente.
//  - Lo que falta se simula con datos PROBABLES y la nota lo dice; al regenerar con el SOW final se reemplaza.
//  - Lo que se enriquece a mano vive en `sow.demo` (pasos, pago, datos, marca, usuario, recursos), nunca en el guion derivado.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const assets = require("./lib/demo-assets");
const R = require("./lib/demo-recursos");

const arr = (x) => (Array.isArray(x) ? x : []);
const slug = (s) => String(s || "x").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "x";
const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const toks = (s) => new Set(norm(s).split(" ").filter((w) => w.length > 2));
const similar = (a, b) => { const A = toks(a), B = toks(b); if (!A.size || !B.size) return false; let k = 0; for (const w of A) if (B.has(w)) k++; return k / Math.min(A.size, B.size) >= 0.6; };
const cut = (s, n) => { s = String(s || ""); return s.length <= n ? s : s.slice(0, n - 1).trimEnd() + "…"; };
const PREFIJO = { colombia: "+57", ecuador: "+593", mexico: "+52", peru: "+51", chile: "+56", panama: "+507" };
const PEND_RE = /POR (?:DEFINIR|COMPLETAR)(?:\s*\(([^)]*)\))?/g;

function buildGuion(sow, opts = {}) {
  const meta = sow.meta || {};
  const prek = meta.fase === "prekickoff";
  const demo = sow.demo || {};
  const catalogo = R.cargarCatalogo(sow);
  const dirsExtra = [opts.baseDir, opts.baseDir && path.join(opts.baseDir, "imagenes"), demo.imagenes_dir && path.resolve(opts.baseDir || ".", demo.imagenes_dir)].filter(Boolean);
  const integ = Object.fromEntries(arr(sow.integraciones).map((i) => [i.id, i]));
  const reglas = Object.fromEntries(arr(sow.reglas).map((r) => [r.id, r]));
  const agentes = arr(sow.agentes);
  const porId = Object.fromEntries(agentes.map((a) => [a.id, a]));
  const flows = {}; const webviews = {}; const avisos = []; const datosProbables = []; const usados = new Map();
  const marca = { nombre: meta.cliente || "Cliente", color: "#00b3c7", verificado: true, subtitulo: "Cuenta de empresa", ...(demo.marca || {}) };
  marca.iniciales = marca.iniciales || marca.nombre.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const prefijo = PREFIJO[norm(meta.pais)] || "+57";
  const usuario = { nombre: "Ana Torres", telefono: `${prefijo} 300 000 0000`, ...(demo.usuario || {}) };

  // ---------- datos probables ----------
  const allText = JSON.stringify(sow.agentes || []);
  const montoDetectado = (allText.match(/\$\s?\d+(?:[.,]\d{1,2})?/) || [])[0];
  const monto = (demo.pago && demo.pago.monto) || demo.monto || montoDetectado || "$3,50";
  const esParqueo = /parqueo|parqueadero|estacionamiento/i.test(`${meta.proyecto} ${meta.cliente}`);
  const concepto = (demo.pago && demo.pago.concepto) || demo.concepto || (esParqueo ? "Parqueo · 2 h 15 min" : "Servicio · detalle de ejemplo");
  const TABLA = [
    [/entrega|medio|canal|env[ií]o/i, () => "PDF por este chat"],
    [/concepto|tiempo|permanencia|detalle|descripci/i, () => `${concepto} · Total ${monto}`],
    [/monto|valor|total|tarifa|precio|importe/i, () => monto],
    [/vigencia|plazo|minutos|expira|vence/i, () => "15 minutos"],
    [/fecha/i, () => "22/10/2026"], [/hora|horario/i, () => "14:05"],
    [/correo|email|mail/i, () => "ana.torres@ejemplo.com"], [/nombre/i, () => usuario.nombre],
    [/tel[eé]fono|celular|whatsapp/i, () => usuario.telefono],
    [/n[uú]mero|c[oó]digo|\bid\b|referencia|ticket|autorizaci/i, () => "000123"],
    [/url|enlace|link/i, () => "https://ejemplo.com/enlace"], [/reintento|intentos|veces/i, () => "3"],
  ];
  const probable = (hint, ctx) => {
    for (const [k, v] of Object.entries(demo.datos || {})) if (new RegExp(k, "i").test(`${hint} ${ctx}`)) return String(v);
    for (const [re, f] of TABLA) if (re.test(hint)) return f();
    for (const [re, f] of TABLA) if (re.test(ctx)) return f();
    return (demo.reemplazos && (demo.reemplazos["POR DEFINIR"] || demo.reemplazos["POR COMPLETAR"])) || "dato de ejemplo";
  };
  let mockedNow = false;
  const mock = (t) => String(t == null ? "" : t).replace(PEND_RE, (m, hint, off, whole) => { mockedNow = true; const v = probable(hint || "", whole.slice(Math.max(0, off - 40), off)); datosProbables.push(v); return v; });

  // ---------- pasos: sobrescrituras de sow.demo.pasos ----------
  const ov = demo.pasos || {};
  const stepOf = (a, s) => ({ ...s, ...(ov[s.id] || {}), ...(ov[`${a.id}.${s.id}`] || {}) });

  // ---------- recursos visuales ----------
  const varsBase = (X) => ({ marca: marca.nombre, cliente: meta.cliente || marca.nombre, color: marca.color, monto, concepto, documento: "Comprobante", usuario_nombre: usuario.nombre, usuario_telefono: usuario.telefono, numero: "000123", etapa: mock(X.etapa || X.diagrama || ""), mensaje: mock(X.mensaje || ""), caption: "" });
  const rzMemo = new Map();
  const resolverNodo = (X) => {
    if (rzMemo.has(X)) return rzMemo.get(X);
    let r = null;
    const conCampos = X.tipo === "formulario" && arr((X.formulario || {}).campos).length && !X.recurso;
    if (!conCampos) {
      const pago = demo.pago || {};
      // las señales se evalúan sobre el texto ya con datos probables (p. ej. «Comprobante: PDF por este chat»)
      r = R.resolver(catalogo, { ...X, mensaje: mock(X.mensaje || ""), etapa: mock(X.etapa || ""), diagrama: mock(X.diagrama || "") }, integ[X.integracion], { proveedor: pago.proveedor, pais: meta.pais });
      if (r && pago.experiencia && r.recurso.id === "pago") r.proveedor = { ...r.proveedor, experiencia: pago.experiencia };
      if (r && pago.medios && r.recurso.id === "pago") r.proveedor = { ...r.proveedor, medios: pago.medios };
      if (r && r.recurso.id === "ecommerce" && demo.ecommerce && demo.ecommerce.checkout === "externo") r.proveedor = { ...r.proveedor, experiencia: "externo" };
    }
    rzMemo.set(X, r); return r;
  };
  const aplicar = (X) => {
    const rz = resolverNodo(X); if (!rz) return null;
    const ap = R.aplicar(rz, X, varsBase(X), { demo, dirs: dirsExtra });
    if (ap) { ap.avisos.forEach((m) => avisos.push(`${X.id}: ${m}`)); usados.set(`${X.id}`, { id: rz.recurso.id, respaldo: !!rz.respaldo, proveedor: rz.proveedor.nombre }); }
    return ap;
  };

  // ---------- formularios -> Flow de Meta / webview con campos ----------
  function flowDesdeDef(def, id, notaTxt) {
    const names = new Set(); const demoV = {}; const campos = arr(def.campos);
    const name = (c) => { let n = slug(c.etiqueta).slice(0, 30); let k = 2; while (names.has(n)) n = slug(c.etiqueta).slice(0, 26) + "_" + k++; names.add(n); return n; };
    const children = [{ type: "TextHeading", text: cut(mock(def.titulo || "Formulario"), 80) }, ...arr(def.intro).map((t) => ({ type: "TextBody", text: cut(mock(t), 400) }))];
    const inForm = []; const payload = {};
    for (const c of campos) {
      const n = name(c); const label = mock(c.etiqueta); const req = c.obligatorio !== false; const ej = c.ejemplo != null ? mock(c.ejemplo) : "";
      payload[n] = `\${form.${n}}`;
      switch (c.tipo) {
        case "casilla": inForm.push({ type: "TextBody", text: cut(label, 400) }, { type: "OptIn", name: n, label: "Acepto", required: req }); demoV[n] = true; break;
        case "selector": { const ops = arr(c.opciones).map((o) => ({ id: slug(o), title: cut(mock(o), 30) })); inForm.push({ type: "Dropdown", name: n, label: cut(label, 20), required: req, "data-source": ops.length ? ops : [{ id: "opcion", title: "Opción" }] }); demoV[n] = slug(ej) || (ops[0] || {}).id; break; }
        case "fecha": inForm.push({ type: "DatePicker", name: n, label: cut(label, 20), required: req }); demoV[n] = "2026-10-22"; break;
        case "archivo": inForm.push({ type: "PhotoPicker", name: n, label: cut(label, 20), description: cut(label, 80), photo_source: "camera_gallery", min_uploaded_photos: req ? 1 : 0, max_uploaded_photos: 1 }); break;
        default: { const it = { correo: "email", numero: "number", telefono: "phone", clave: "passcode" }[c.tipo] || "text"; inForm.push({ type: "TextInput", name: n, label: cut(label, 20), "input-type": it, required: req }); if (ej) demoV[n] = ej; }
      }
    }
    inForm.push({ type: "Footer", label: cut(mock(def.boton || "Enviar"), 35), "on-click-action": { name: "complete", payload } });
    children.push({ type: "Form", name: "form", children: inForm });
    flows[id] = { titulo: cut(mock(def.titulo || "Formulario"), 40), notas: { FORMULARIO: notaTxt || `Formulario: ${campos.map((c) => mock(c.etiqueta)).join(", ")}. Los valores se escriben solos en la demo.` }, demo: demoV,
      json: { version: "7.3", screens: [{ id: "FORMULARIO", title: cut(mock(def.titulo || "Formulario"), 30), terminal: true, success: true, layout: { type: "SingleColumnLayout", children } }] } };
  }
  const flowForm = (s, id) => flowDesdeDef(s.formulario || {}, id, `Formulario del SOW (${mock(s.etapa || s.diagrama || "paso")}): ${arr((s.formulario || {}).campos).map((c) => mock(c.etiqueta)).join(", ")}. Los valores se escriben solos en la demo.`);
  function webviewForm(s, id) {
    const f = s.formulario || {};
    webviews[id] = { titulo: cut(mock(f.titulo || s.etapa || "Formulario"), 40), dominio: slug(marca.nombre) + ".demo", color: marca.color,
      pantallas: [{ nota: `Formulario en webview (${s.etapa || s.diagrama || "paso"}).`, bloques: [{ tipo: "marca" }, { tipo: "titulo", texto: mock(f.titulo || "Formulario") }, ...arr(f.campos).map((c) => ({ tipo: "campo", etiqueta: mock(c.etiqueta), valor: mock(c.ejemplo || "") }))], boton: mock(f.boton || "Enviar"), cargando: "Enviando…" }],
      exito: { titulo: "Listo", texto: "Tu información fue enviada.", boton: "Volver a WhatsApp" } };
  }

  // ---------- un agente -> un grafo de nodos visibles ----------
  function nodosDe(a) {
    let pasos = arr(a.pasos).map((s) => stepOf(a, s));
    if (a.continua_en && porId[a.continua_en]) {
      const d = porId[a.continua_en]; const pre = (id) => `${d.id}__${id}`;
      const dpasos = arr(d.pasos).map((s) => stepOf(d, s)).map((s) => ({ ...s, id: pre(s.id), siguiente: arr(s.siguiente).map((e) => ({ ...e, a: pre(e.a) })), _de: d.id }));
      const entrada = dpasos.find((s) => s.tipo !== "usuario") || dpasos[0];
      const fines = pasos.filter((s) => s.tipo === "fin" || !arr(s.siguiente).length);
      const fin = fines.find((s) => /contin/i.test(`${s.diagrama || ""}`)) || fines[fines.length - 1];
      if (fin && entrada) { fin.tipo = "router"; fin.siguiente = [{ a: entrada.id }]; }
      pasos = [...pasos, ...dpasos];
    }
    return pasos;
  }

  function construirAgente(a) {
    const pasos = nodosDe(a); const nodes = Object.fromEntries(pasos.map((s) => [s.id, s])); const start = pasos[0]; if (!start) return [];
    const nid = (s) => slug(`${s.id}`);
    // usuarios que solo repiten el toque de un botón del mensaje anterior: no se dibujan
    const oculto = new Set();
    for (const m of pasos) { const bts = arr(m.botones); if (!bts.length) continue; for (const e of arr(m.siguiente)) { const t = nodes[e.a]; if (t && t.tipo === "usuario" && !resolverNodo(t) && bts.some((b) => norm(b) === norm(t.mensaje || t.diagrama) || similar(b, t.mensaje || t.diagrama))) oculto.add(t.id); } }
    const BASE_VISIBLES = ["usuario", "mensaje", "formulario", "webview", "tercero", "asesor", "fin"];
    const visible = (t) => { if (t.ocultar || oculto.has(t.id)) return false; if (BASE_VISIBLES.includes(t.tipo)) return true; if (t.tipo === "api") { const rz = resolverNodo(t); return !!rz && rz.recurso.visible !== false && !rz.respaldo; } return false; };
    const succ = (X) => {
      const res = []; const seen = new Set();
      const walk = (t, label, via) => {
        if (!t) { res.push({ label, to: null, via }); return; }
        if (visible(t)) { res.push({ label, to: t, via }); return; }
        const k = t.id + "|" + label; if (seen.has(k)) return; seen.add(k);
        const es = arr(t.siguiente);
        if (!es.length) { res.push({ label, to: null, via: [...via, t] }); return; }
        es.forEach((e) => walk(nodes[e.a], e.si || label, [...via, t]));
      };
      arr(X.siguiente).forEach((e) => walk(nodes[e.a], e.si || "", []));
      const out = []; for (const r of res) if (!out.some((o) => o.to === r.to && o.label === r.label)) out.push(r);
      return out;
    };
    const titulosBotones = (X) => (arr(X.lista).length ? arr(X.lista) : arr(X.botones)).map(mock);
    const esEleccion = (X, outs) => { const ts = titulosBotones(X).map(norm); return ts.length > 0 && outs.length > 1 && outs.some((o) => ts.includes(norm(o.label))); };
    const destino = (outs, titulo) => (outs.find((o) => norm(o.label) === norm(titulo)) || outs[0] || {}).to || null;
    const viaNotas = (via, label) => via.map((v) => {
      if (v.tipo === "api") { const i = integ[v.integracion] || {}; return `Detrás de escena: Jelou ${mock(v.diagrama || "consulta un sistema")}${i.id ? ` (${i.id}: ${mock(i.nombre || "")}${i.documentacion && i.documentacion !== "si" ? "; documentación pendiente, respuesta simulada" : ""})` : ""}.`; }
      if (v.tipo === "decision") return `Decisión: ${mock(v.diagrama || "")}${label ? " → " + mock(label) : ""}.`;
      if (v.tipo === "router") return "El agente identifica la intención y enruta.";
      return "";
    }).filter(Boolean);

    const llegada = {}; const padre = {}; const emitido = new Set(); const pasosOut = []; const alternos = [];
    const plantillaId = a.entrada === "outbound" ? (pasos.find((s) => s.tipo === "mensaje" && !s._de) || {}).id : null;

    // Abre un recurso (webview, Flow o pasos del kit). `over` pone el texto/botón del mensaje que ya existe en el SOW.
    function abrir(X, key, over, nota) {
      const ap = aplicar(X); if (!ap) return null;
      const n = nota(ap.nota);
      if (ap.abre === "webview" && ap.webview) {
        arr(ap.webview.pantallas).forEach((p, i) => { p.nota = p.nota || (i === 0 ? n : `${ap.nota} Pantalla ${i + 1} de ${ap.webview.pantallas.length}.`); });   // el panel muestra la nota de cada pantalla
        webviews[key + "_wv"] = ap.webview;
        return { pasos: [{ tipo: "cta_url", ...(ap.mensaje.header ? { header: ap.mensaje.header } : {}), cuerpo: cut((over && over.cuerpo) || ap.mensaje.cuerpo || mock(X.etapa || ""), 1024), boton: cut((over && over.boton) || ap.mensaje.boton || "Continuar", 20), webview: key + "_wv", nota: n }], despues: ap.despues, ap };
      }
      if (ap.abre === "flow" && ap.flow) {
        flowDesdeDef(ap.flow, key + "_flow", ap.nota);
        return { pasos: [{ tipo: "flow", cuerpo: cut((over && over.cuerpo) || ap.mensaje.cuerpo || mock(X.etapa || ""), 1024), boton: cut((over && over.boton) || ap.mensaje.boton || "Continuar", 30), flow: key + "_flow", nota: n }], despues: ap.despues, ap };
      }
      if (ap.abre === "pasos") return { pasos: ap.pasos.map((p, i) => ({ ...p, nota: i === 0 ? n : p.nota })), despues: ap.despues, ap };
      return { pasos: [], despues: ap.despues, ap };
    }
    const despuesDeVia = (X) => { const out = []; for (const v of (llegada[X.id] || {}).via || []) { const rz = resolverNodo(v); if (rz && rz.recurso.id === "documento-pdf") { const ap = aplicar(v); if (ap) out.push(...ap.despues); } } return out; };

    function conv(X, o = {}) {
      mockedNow = false;
      const out = []; const key = `${a.id}_${X.id}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
      const via = viaNotas((llegada[X.id] || {}).via || [], (llegada[X.id] || {}).label);
      const base = () => {
        const p = [];
        if (X.etapa) p.push(`Etapa: ${mock(X.etapa)}.`);
        if (X.componente) p.push(`Componente Jelou: ${mock(X.componente)}.`);
        for (const rid of arr(X.reglas)) if (reglas[rid]) p.push(`${rid} · ${mock(reglas[rid].titulo)}.`);
        const i = integ[X.integracion]; if (i) p.push(`Integración ${i.id}: ${mock(i.nombre)}.`);
        p.push(...via);
        return p.join(" ");
      };
      const nota = (extra) => { const t = base() + (extra ? " " + extra : ""); return (t + (mockedNow ? " Valor de ejemplo: se confirma con el cliente." : "")).trim(); };
      const rz = resolverNodo(X);
      switch (X.tipo) {
        case "usuario": {
          const adj = X.adjunto;
          if (adj && adj.tipo === "audio") { out.push({ tipo: "usuario", texto: "", audio: { duracion: adj.duracion || "0:08" }, nota: nota() }); break; }
          const ab = rz && (rz.recurso.id === "foto-usuario" || adj) ? abrir(X, key, null, nota) : null;
          if (ab && ab.pasos.length) out.push(...ab.pasos); else out.push({ tipo: "usuario", texto: mock(X.mensaje || X.diagrama || ""), nota: nota() });
          break; }
        case "mensaje": {
          const body = mock(X.mensaje || X.diagrama || ""); const bts = arr(X.botones).map(mock); const outs = o.outs || [];
          const sig = outs.length === 1 ? outs[0].to : null;
          const am = X.adjunto && !bts.length && !arr(X.lista).length && ["imagen", "ubicacion", "video"].includes(X.adjunto.tipo) ? X.adjunto : null;
          let despues = [];
          if (am && am.tipo === "imagen") out.push({ tipo: "imagen", src: assets.imagenSintetica(am.generar || (am.qr ? "ticket-qr" : "pantalla"), { seed: `${marca.nombre}${X.id}`, sitio: marca.nombre, color: marca.color, titulo: am.titulo }), caption: cut(body, 1024), nota: nota() });
          else if (am && am.tipo === "ubicacion") { out.push({ tipo: "ubicacion", nombre: mock(am.nombre || marca.nombre), direccion: mock(am.direccion || "Dirección de ejemplo"), nota: nota() }); out.push({ tipo: "texto", texto: cut(body, 4096) }); }
          else if (am && am.tipo === "video") out.push({ tipo: "video", placeholder: { emoji: "🎬", texto: mock(am.titulo || "Video") }, duracion: am.duracion || "0:30", caption: cut(body, 1024), nota: nota() });
          else if (rz && !bts.length && !arr(X.lista).length && ["ubicacion", "ecommerce"].includes(rz.recurso.id)) { const ab = abrir(X, key, null, nota); out.push(...ab.pasos, ...ab.despues); }
          else if (plantillaId === X.id) {
            out.push({ tipo: "notificacion", titulo: marca.nombre, texto: cut(body, 90), fecha: "ahora" });
            out.push({ tipo: "plantilla", cuerpo: cut(body, 1024), botones: bts.slice(0, 10).map((t) => ({ tipo: "respuesta", titulo: cut(t, 20) })), nota: nota("Plantilla enviada por la entidad; debe estar aprobada por Meta.") });
          } else if (bts.length === 1 && sig && (sig.tipo === "tercero" || (sig.tipo === "api" && resolverNodo(sig)) || (sig.tipo === "formulario" && resolverNodo(sig)))) {
            const ab = abrir(sig, key, { cuerpo: body, boton: bts[0] }, (n) => nota(n)); out.push(...ab.pasos); despues = ab.despues; o.consumido = sig;
          } else if (bts.length === 1 && sig && sig.tipo === "formulario") {
            if ((sig.herramienta || "") === "webview") { webviewForm(sig, key + "_wv"); out.push({ tipo: "cta_url", cuerpo: cut(body, 1024), boton: cut(bts[0], 20), webview: key + "_wv", nota: nota() }); }
            else { flowForm(sig, key + "_flow"); out.push({ tipo: "flow", cuerpo: cut(body, 1024), boton: cut(bts[0], 30), flow: key + "_flow", nota: nota() }); }
            o.consumido = sig;
          } else if (arr(X.lista).length) out.push({ tipo: "lista", cuerpo: cut(body, 1024), boton: "Ver opciones", secciones: [{ titulo: "Opciones", filas: arr(X.lista).slice(0, 10).map((t, k) => ({ titulo: cut(mock(t), 24), id: "r" + k })) }], nota: nota() });
          else if (bts.length > 3) { avisos.push(`${X.id}: más de 3 botones; se muestran como lista.`); out.push({ tipo: "lista", cuerpo: cut(body, 1024), boton: "Ver opciones", secciones: [{ titulo: "Opciones", filas: bts.slice(0, 10).map((t, k) => ({ titulo: cut(t, 24), id: "r" + k })) }], nota: nota() }); }
          else if (bts.length) out.push({ tipo: "botones", cuerpo: cut(body, 1024), botones: bts.map((t) => ({ titulo: cut(t, 20) })), nota: nota() });
          else out.push({ tipo: "texto", texto: cut(body, 4096), nota: nota() });
          // documentos: el que genera un paso de sistema anterior o el que el propio mensaje anuncia («comprobante … PDF»)
          if (X.adjunto && X.adjunto.tipo === "documento") out.push({ tipo: "documento", nombre: X.adjunto.nombre || "Documento.pdf", paginas: 1, peso: "84 KB", caption: X.adjunto.caption || "Documento (ejemplo)", nota: nota() });
          else { const dv = despuesDeVia(X); const propio = rz && rz.recurso.id === "documento-pdf" ? (aplicar(X) || { despues: [] }).despues : []; out.push(...(dv.length ? dv : propio.length ? propio : despues)); }
          break; }
        case "api": case "tercero": case "webview": {
          const ab = abrir(X, key, null, nota);
          if (ab && ab.pasos.length) { out.push(...ab.pasos); out.push(...ab.despues); }
          else if (X.tipo !== "api") out.push({ tipo: "texto", texto: mock(X.diagrama || X.etapa || "Continúa tu proceso"), nota: nota() });
          break; }
        case "formulario": {
          const ab = rz && !arr((X.formulario || {}).campos).length ? abrir(X, key, null, nota) : null;
          if (ab && ab.pasos.length) out.push(...ab.pasos);
          else if ((X.herramienta || "") === "webview") { webviewForm(X, key + "_wv"); out.push({ tipo: "cta_url", cuerpo: "Completa el formulario para continuar 👇", boton: "Abrir formulario", webview: key + "_wv", nota: nota() }); }
          else { flowForm(X, key + "_flow"); out.push({ tipo: "flow", cuerpo: "Completa el formulario para continuar 👇", boton: "Abrir formulario", flow: key + "_flow", nota: nota() }); }
          break; }
        case "asesor": out.push({ tipo: "sistema", estilo: "asesor", texto: mock(X.diagrama || "Conversación derivada a un asesor"), nota: nota() }); break;
        case "fin": out.push({ tipo: "fin", texto: cut(mock(X.diagrama || "Fin de la conversación"), 80) }); break;
        default: out.push({ tipo: "texto", texto: mock(X.diagrama || X.tipo), nota: nota() });
      }
      return out;
    }

    // ---- recorrido principal: grafo con ramas del usuario y reintentos ----
    const registrarLlegada = (outs, desde) => { for (const o of outs) if (o.to && !llegada[o.to.id]) { llegada[o.to.id] = { via: o.via, label: o.label }; if (!padre[o.to.id]) padre[o.to.id] = { de: desde, label: o.label }; } };
    function visitar(X) {
      if (!X || emitido.has(X.id)) return; emitido.add(X.id);
      let outs = succ(X); registrarLlegada(outs, X);
      const ctx = { outs }; const steps = conv(X, ctx);
      if (ctx.consumido) { emitido.add(ctx.consumido.id); outs = succ(ctx.consumido); registrarLlegada(outs, X); }
      const principal = outs[0] || {};
      const eleccion = esEleccion(X, outs);
      if (!eleccion && outs.length > 1) alternos.push(...outs.slice(1).map((o, k) => ({ X, o, k: k + 1 })));
      const last = steps[steps.length - 1];
      if (steps.length) steps[0].id = nid(X);
      const irDe = (t) => (t ? nid(t) : null);
      if (X.tipo === "fin") { pasosOut.push(...steps); return; }
      const btnStep = steps.find((s) => ["botones", "lista", "plantilla"].includes(s.tipo));
      if (btnStep) {
        const tit = titulosBotones(X);
        if (btnStep.tipo === "botones" || btnStep.tipo === "plantilla") {
          const bl = btnStep.botones; bl.forEach((b, k) => { const t = eleccion ? destino(outs, tit[k] || b.titulo) : principal.to; if (t) b.ir = irDe(t); });
          const pi = Math.max(0, tit.findIndex((t) => principal.label && norm(t) === norm(principal.label))); if (btnStep.tipo === "botones" || bl.length > 1) btnStep.principal = pi;
        } else btnStep.secciones.forEach((sec) => sec.filas.forEach((f, k) => { const t = eleccion ? destino(outs, tit[k] || f.titulo) : principal.to; if (t) f.ir = irDe(t); }));
      } else if (principal.to && last) last.ir = irDe(principal.to);
      // botones de la receta con `accion: "repetir"` vuelven a este mismo recurso (p. ej. «Agregar más»)
      for (const s of steps) if (s.tipo === "botones") for (const b of s.botones) { if (b.accion === "repetir") b.ir = nid(X); }
      const sinSalida = !outs.length || (!eleccion && !principal.to);
      const targets = eleccion ? [...new Set((titulosBotones(X).map((t) => destino(outs, t))).filter(Boolean))] : [principal.to].filter(Boolean);
      pasosOut.push(...steps);
      if (sinSalida) pasosOut.push({ id: "fin_" + nid(X), tipo: "fin", texto: "Fin de la conversación" });
      targets.forEach(visitar);
    }
    visitar(start.tipo === "usuario" || visible(start) ? start : (succ(start)[0] || {}).to);
    if (!pasosOut.length) return [];
    if (pasosOut[pasosOut.length - 1].tipo !== "fin") pasosOut.push({ tipo: "fin", texto: "Fin de la conversación" });

    const tech = (ps) => (a.entrada === "outbound" ? "hsm" : ps.some((x) => x.tipo === "flow") ? "flow" : ps.some((x) => x.tipo === "cta_url") ? "webview" : "chat");
    const grupos = [...new Set(pasos.map((s) => s.grupo || s.etapa).filter(Boolean))].slice(0, 6).map(mock);
    const resumenAg = mock(arr(a.resumen_cliente).map((x) => (typeof x === "string" ? x : x.texto)).filter(Boolean).slice(0, 4).join(" → ") || a.nombre);
    const journeys = [{ id: slug(a.id), nombre: cut(mock(a.nombre), 60), tech: tech(pasosOut), resumen: resumenAg, puntos: grupos, pasos: pasosOut }];

    // ---- recorridos alternos: ramas que decide el sistema (no la persona) ----
    const camino = (hasta) => { const c = []; let x = hasta; const guard = new Set(); while (x && !guard.has(x.id)) { guard.add(x.id); c.unshift(x); const p = padre[x.id]; x = p && p.de; } return c; };
    const vistos = new Set(); let n = 0;
    for (const { X, o } of alternos) {
      if (n >= 8 || !o.to || X._de) continue;   // las ramas del flujo al que se continúa ya salen en su propio recorrido
      const pre = camino(X); const seguir = []; const g = new Set(pre.map((x) => x.id)); let t = o.to;
      while (t && !g.has(t.id)) { g.add(t.id); seguir.push(t); const so = succ(t); t = (so[0] || {}).to; }
      const ruta = [...pre, ...seguir]; const sig = ruta.map((x) => x.id).join(">"); if (vistos.has(sig)) continue; vistos.add(sig);
      const ps = []; let k = 0;
      while (k < ruta.length) {
        const Y = ruta[k]; const outsY = succ(Y); const ctx = { outs: outsY }; const st = conv(Y, ctx);
        const salto = ctx.consumido && ruta[k + 1] === ctx.consumido ? 2 : 1; const nextN = ruta[k + salto];
        const b = st.find((s) => ["botones", "plantilla"].includes(s.tipo)); if (b && b.botones.length > 1 && nextN) { const tit = titulosBotones(Y); const lab = (outsY.find((x) => x.to === nextN) || {}).label; const ix = tit.findIndex((tt) => norm(tt) === norm(lab)); if (ix >= 0) b.principal = ix; }
        ps.push(...st); k += salto;
      }
      const dec = (o.via || []).filter((v) => v.tipo === "decision").pop() || {};
      const nombreAlt = `${cut(String(dec.diagrama || X.diagrama || a.nombre).replace(/[¿?]/g, "").trim(), 34)}: ${cut(mock(o.label || "otro caso"), 24)}`;
      const ultimo = ruta[ruta.length - 1]; const sigo = succ(ultimo)[0];
      ps.push({ tipo: "fin", texto: ultimo.tipo === "fin" ? cut(mock(ultimo.diagrama || "Fin"), 80) : sigo && sigo.to ? `Vuelve al paso «${cut(mock(sigo.to.etapa || sigo.to.diagrama || ""), 40)}»` : "Fin de la conversación" });
      const dd = ps.filter((s, i) => !(s.tipo === "fin" && i < ps.length - 1));
      journeys.push({ id: slug(a.id) + "_alt" + (++n), nombre: cut(`${mock(a.nombre).split(":")[0]} · ${nombreAlt}`, 60), tech: tech(dd), resumen: `Camino alterno decidido por el sistema: ${mock(o.label || "otro caso")}.`, puntos: [], pasos: dd });
    }
    return journeys;
  }

  const journeys = [];
  for (const a of agentes) journeys.push(...construirAgente(a));

  // ---------- cobertura visual ----------
  const VIS_RE = /\bQR\b|foto|imagen|factura|comprobante|recibo|\bPDF\b|mapa|ubicaci[oó]n|video|audio|documento|firma|biometr|selfie|cat[aá]logo|carrito/i;
  const todos = journeys.flatMap((j) => j.pasos);
  const principales = journeys.filter((j) => !/_alt\d+$/.test(j.id)).flatMap((j) => j.pasos);
  const hayVisual = todos.some((p) => ["imagen", "documento", "ubicacion", "video", "audio", "cta_url", "flow", "multiproducto", "catalogo", "carrusel", "producto", "solicitar_ubicacion"].includes(p.tipo) || p.imagen || p.audio);
  const yaAvisado = new Set();
  for (const [nodo0, u] of usados) { const nodo = nodo0.replace(/^.*__/, ""); if (!u.respaldo || yaAvisado.has(nodo)) continue; yaAvisado.add(nodo); avisos.push(`${nodo}: usa la pantalla genérica de respaldo (${u.proveedor}). Si sabes cómo se ve, enséñasela a la skill: node scripts/aprender_recurso.js (references/simulador-visual.md §5).`); }
  for (const a of agentes) for (const s of arr(a.pasos)) {
    if (!["mensaje", "usuario"].includes(s.tipo) || usados.has(s.id)) continue;
    const m = String(s.mensaje || "").match(VIS_RE);
    if (m && !stepOf(a, s).adjunto && !hayVisual) avisos.push(`${a.id}.${s.id} menciona un recurso visual («${m[0]}») y no se dibuja nada: agrega \`adjunto\`/\`recurso\` al paso o define \`demo.pasos.${s.id}\`.`);
  }
  const sistemaSteps = todos.filter((p) => p.tipo === "sistema" && p.estilo !== "asesor").length;
  if (sistemaSteps) avisos.push(`${sistemaSteps} paso(s) de sistema visibles en el chat: revisa que no sean llamadas a API.`);
  const porRecurso = {}; for (const [, u] of usados) porRecurso[u.id] = (porRecurso[u.id] || 0) + 1;
  const stats = {
    alternos: journeys.length - journeys.filter((j) => !/_alt\d+$/.test(j.id)).length,
    imagenes: principales.filter((p) => p.imagen || p.tipo === "imagen").length, documentos: principales.filter((p) => p.tipo === "documento").length,
    flows: Object.keys(flows).length, webviews: Object.keys(webviews).length, recursos: porRecurso, pagos: porRecurso.pago || 0,
  };

  for (const j of journeys) for (const s of j.pasos) if (s.tipo === "botones") for (const b of s.botones) delete b.accion;
  const guion = {
    panel: {
      titulo: `${marca.nombre} · ${meta.proyecto || "Simulación"}`,
      subtitulo: prek ? "Simulación preliminar (pre-kickoff)" : `Simulación del SOW v${meta.version || "1.0"}${meta.estado === "aprobado" ? " · aprobado" : " · en revisión"}`,
      version: `SOW v${meta.version || "1.0"}${prek ? " · pre-kickoff" : ""}`,
      pie: "Prototipo con datos simulados." + (prek || datosProbables.length ? " Lo que aún no está definido usa valores de ejemplo, por confirmar con el cliente." : ""),
      titulo_pagina: `Jelou · Simulación ${marca.nombre}`, resumen: false,
    },
    marca, usuario, journeys, flows, webviews,
  };
  return { guion, avisos, stats, mocked: datosProbables.length > 0 };
}

function run(cmd, args, cwd) { return spawnSync(cmd, args, { cwd, encoding: "utf8" }); }

// Inyecta la extensión visual (bloques de webview) en el HTML del kit
function inyectarExtension(html) {
  const f = path.join(__dirname, "..", "assets", "visuales", "kit-extension.js");
  if (!fs.existsSync(f)) return { html, ok: false, motivo: "falta assets/visuales/kit-extension.js" };
  if (!/function wvBlock\(/.test(html)) return { html, ok: false, motivo: "el motor del kit cambió (no existe wvBlock)" };
  const ext = fs.readFileSync(f, "utf8");
  return { html: html.replace(/<\/body>\s*<\/html>\s*$/i, () => `<script>\n${ext}\n</script>\n</body></html>`), ok: true };
}

function main() {
  const argv = process.argv.slice(2); const files = argv.filter((a) => !a.startsWith("--"));
  const [inFile, outFile] = files;
  if (!inFile || !outFile) { console.error("Uso: node sow_a_demo.js <sow.json> <salida.html> [--sin-validar]"); process.exit(2); }
  const K = require("./lib/demo-kit");
  const kit = K.findKit();
  if (!kit) { console.error("El plugin jelou-demos-whatsapp no está instalado. Ejecuta: node instalar_plugin_demos.js"); process.exit(3); }
  const sow = JSON.parse(fs.readFileSync(inFile, "utf8"));
  const { guion, avisos, stats } = buildGuion(sow, { baseDir: path.dirname(path.resolve(inFile)) });
  const work = fs.mkdtempSync(path.join(os.tmpdir(), "sow-demo-"));
  const proj = path.join(work, "proyectos", "simulacion"); fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, "guion.json"), JSON.stringify(guion, null, 2), "utf8");
  if (!argv.includes("--sin-validar")) {
    const v = run("node", [path.join(kit, "validar.js"), "proyectos/simulacion"], work);
    const txt = (v.stdout || "") + (v.stderr || "");
    if (v.status !== 0) { console.error(txt); console.error(`Guion con errores: ${path.join(proj, "guion.json")}`); process.exit(1); }
    const warns = txt.split("\n").filter((l) => /⚠/.test(l));
    if (warns.length) console.log(`Validador del kit: ${warns.length} advertencia(s) (límites de Meta). Primera: ${warns[0].trim()}`);
  }
  let b = run("python", [path.join(kit, "build.py"), "proyectos/simulacion"], work);
  if (b.status !== 0) b = run("python3", [path.join(kit, "build.py"), "proyectos/simulacion"], work);
  if (b.status !== 0) { console.error((b.stdout || "") + (b.stderr || "")); process.exit(1); }
  let html = fs.readFileSync(path.join(work, "dist", "simulacion.html"), "utf8");
  const ext = inyectarExtension(html);
  if (ext.ok) html = ext.html; else avisos.push(`Extensión visual no inyectada (${ext.motivo}): los webviews usarán solo los bloques del kit.`);
  fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
  fs.writeFileSync(outFile, html, "utf8");
  fs.copyFileSync(path.join(proj, "guion.json"), outFile.replace(/\.html$/i, ".guion.json"));
  const rec = Object.entries(stats.recursos).map(([k, v]) => `${k}×${v}`).join(", ") || "ninguno";
  console.log(`Cobertura visual: ${guion.journeys.length} recorrido(s) (${stats.alternos} alternos) · ${stats.imagenes} imagen(es) · ${stats.documentos} documento(s) · ${stats.flows} Flow(s) · ${stats.webviews} webview(s) · recursos: ${rec}`);
  avisos.forEach((a) => console.log("Aviso: " + a));
  console.log(`Simulador (kit jelou-demo-whatsapp): ${outFile}`);
}

module.exports = { buildGuion, inyectarExtension };
if (require.main === module) main();
