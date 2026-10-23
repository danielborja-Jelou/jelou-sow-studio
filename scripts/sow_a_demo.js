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
const CAN = require("./lib/demo-canales");

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
  const probables = R.cargarCamposProbables(sow); const sinCampos = [];
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
    [/documento|c[eé]dula|identificaci[oó]n|\bdni\b|\bruc\b|pasaporte/i, () => "0912345678"],
    [/n[uú]mero|c[oó]digo|\bid\b|referencia|ticket|autorizaci/i, () => "000123"],
    [/url|enlace|link/i, () => "https://ejemplo.com/enlace"], [/reintento|intentos|veces/i, () => "3"],
  ];
  // Valores típicos por tema (planta, logística, salud, seguros, retail…). Se prueban sobre la etiqueta y, si no hay coincidencia, sobre el texto del paso.
  const DOMINIO = [
    [/orden de trabajo|\bot\b|orden de produccion|\bop\b/, () => "OT-10234"], [/pedido|orden de compra|\boc\b/, () => "PED-48213"],
    [/placa|matricula|patente/, () => "ABC-1234"], [/guia|rastreo|tracking|envio/, () => "GU-7740123"], [/factura|comprobante|recibo/, () => "001-001-000045812"],
    [/poliza|siniestro|reclamo/, () => "POL-2026-0457"], [/contrato|cuenta|credito|prestamo/, () => "CT-2026-1187"], [/cita|turno|reserva/, () => "RES-3021"],
    [/material|insumo|materia prima/, () => "Resina PP-20"], [/cantidad|unidades|piezas|peso|kilos|litros/, () => "25"], [/proveedor|fabricante/, () => "Proveedor Aliado S.A."],
    [/modelo|referencia de producto|sku/, () => "MOD-200"], [/atributo|caracteristica|especificacion|tipo de/, () => "Estándar"], [/motivo|razon|causa|asunto/, () => "Consulta general"],
    [/observacion|comentario|nota|descripcion|detalle|novedad/, () => "Sin novedades"], [/ciudad/, () => CAPITAL[norm(meta.pais)] || "Quito"], [/direccion|domicilio|ubicacion/, () => "Av. Principal 123"],
    [/sucursal|sede|planta|bodega|almacen|oficina|agencia/, () => "Sucursal Centro"], [/area|departamento|turno de trabajo|linea/, () => "Línea 2"], [/producto|articulo|servicio|plan/, () => "Plan Plus"],
    [/edad|anos/, () => "34"], [/placa del equipo|equipo|maquina|activo/, () => "EQ-0457"], [/calificacion|satisfaccion|puntaje/, () => "5"], [/cargo|puesto|rol/, () => "Supervisor"],
  ];
  const sinInferir = [];
  // Último recurso: nunca «dato de ejemplo»; un código creíble con la palabra clave de lo que se pide («Atributo 01»). Se avisa para completarlo desde el presow/Diio.
  const deEtiqueta = (hint, ctx) => {
    const base = norm(hint || ctx || "").replace(/\b(de|del|la|el|los|las|y|o|que|con|para|por|un|una|ingresa|escribe|indica|numero|dato|datos|valor|informacion|faltante)\b/g, " ").trim().split(/\s+/).filter((w) => w.length > 2)[0] || "registro";
    const palabra = base.charAt(0).toUpperCase() + base.slice(1); sinInferir.push(String(hint || ctx || "").trim().slice(0, 60)); return `${palabra} 01`;
  };
  const probable = (hint, ctx) => {
    for (const [k, v] of Object.entries(demo.datos || {})) if (new RegExp(k, "i").test(`${hint} ${ctx}`)) return String(v);
    for (const [re, f] of TABLA) if (re.test(hint)) return f();
    for (const [re, f] of DOMINIO) if (re.test(norm(hint))) return f();
    for (const [re, f] of TABLA) if (re.test(ctx)) return f();
    for (const [re, f] of DOMINIO) if (re.test(norm(ctx))) return f();
    const r = demo.reemplazos && (demo.reemplazos["POR DEFINIR"] || demo.reemplazos["POR COMPLETAR"]); if (r) return r;
    return deEtiqueta(hint, ctx);
  };
  // Variables de plantilla del SOW («{{nombre}}», «{{monto}}»…): el simulador muestra valores simulados, nunca la variable. Se respetan
  // las variables que el motor del kit resuelve solo ({{form.x}}, {{etq.x}}, {{usuario.x}}, {{eleccion}}, {{marca.x}}).
  const CAPITAL = { ecuador: "Quito", colombia: "Bogotá", mexico: "Ciudad de México", peru: "Lima", chile: "Santiago", panama: "Ciudad de Panamá" };
  const VARIABLES = [
    [/apellido/, () => "Torres"], [/correo|email|mail/, () => "ana.torres@ejemplo.com"], [/tel[eé]fono|celular|phone|whatsapp|movil/, () => usuario.telefono],
    [/nombre|name|cliente|titular|persona|usuario|beneficiario|paciente|alumno/, (k) => (/primer|first|corto/.test(k) ? usuario.nombre.split(" ")[0] : usuario.nombre)],
    [/monto|total|valor|importe|saldo|precio|cuota|tarifa|costo|pago/, () => monto], [/porcentaje|tasa|interes/, () => "1,5 %"], [/plazo|meses/, () => "12 meses"],
    [/fecha|vence|vencimiento|dia/, () => "22/10/2026"], [/hora|horario/, () => "14:05"], [/ciudad/, () => CAPITAL[norm(meta.pais)] || "Quito"],
    [/direccion|domicilio/, () => "Av. Principal 123"], [/url|link|enlace|liga/, () => "https://ejemplo.com/enlace"], [/documento|cedula|ruc|dni|identificacion|nit/, () => "0912345678"],
    [/entidad|banco|aseguradora|financiera/, () => "Banco Aliado"], [/empresa|comercio|tienda|marca|negocio/, () => marca.nombre], [/sede|sucursal|oficina|agencia/, () => "Sucursal Centro"],
    [/producto|articulo|servicio|plan|item|tour/, () => "Plan Plus"], [/estado|resultado/, () => "Aprobado"], [/numero|codigo|ticket|referencia|orden|pedido|folio|\bid\b|caso/, () => "000123"],
  ];
  const VAR_RE = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const KIT_VARS = /^(form|etq|usuario|eleccion|marca|sel)(\.|$)/i;
  const valorVariable = (key) => {
    const n = norm(key.replace(/[._-]+/g, " ")); const ov = demo.variables || {};
    for (const [k, v] of Object.entries(ov)) if (norm(k) === n) return String(v);
    for (const [re, f] of VARIABLES) if (re.test(n)) return f(n);
    for (const [re, f] of DOMINIO) if (re.test(n)) return f(n);
    return deEtiqueta(key, "");
  };
  const simularVariables = (t) => String(t).replace(VAR_RE, (m, k) => (KIT_VARS.test(k.trim()) ? m : valorVariable(k.trim())));
  const limpiarVariables = (v) => {
    if (typeof v === "string") return simularVariables(v);
    if (Array.isArray(v)) return v.map(limpiarVariables);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, limpiarVariables(x)]));
    return v;
  };
  let mockedNow = false;
  const mock = (t, extra = "") => simularVariables(String(t == null ? "" : t)).replace(PEND_RE, (m, hint, off, whole) => { mockedNow = true; const v = probable(hint || "", `${whole.slice(Math.max(0, off - 40), off)} ${extra}`); datosProbables.push(v); return v; });

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
  // Valor que la persona escribiría en un campo: el ejemplo del SOW si existe; si no, se infiere de la etiqueta, el tipo y el título del formulario.
  const POR_TIPO = { correo: "ana.torres@ejemplo.com", telefono: null, numero: "1", clave: "1234" };
  function valorCampo(c, def) {
    const et = mock(c.etiqueta || "");
    if (c.tipo === "selector") return "";   // lo resuelve quien lo llama (primera opción)
    if (c.tipo === "telefono") return usuario.telefono; if (c.tipo === "correo") return POR_TIPO.correo;
    for (const [k, v] of Object.entries(demo.datos || {})) if (new RegExp(k, "i").test(`${et} ${def.titulo || ""}`)) return String(v);
    for (const [re, f] of TABLA) if (re.test(et)) return f();
    for (const [re, f] of DOMINIO) if (re.test(norm(et))) return f();
    if (c.tipo === "numero") return "25"; if (c.tipo === "clave") return POR_TIPO.clave;
    return deEtiqueta(et, def.titulo || "");
  }
  function flowDesdeDef(def, id, notaTxt) {
    const names = new Set(); const demoV = {}; const campos = arr(def.campos);
    const name = (c) => { let n = slug(c.etiqueta).slice(0, 30); let k = 2; while (names.has(n)) n = slug(c.etiqueta).slice(0, 26) + "_" + k++; names.add(n); return n; };
    const children = [{ type: "TextHeading", text: cut(mock(def.titulo || "Formulario"), 80) }, ...arr(def.intro).map((t) => ({ type: "TextBody", text: cut(mock(t), 400) }))];
    const inForm = []; const payload = {};
    for (const c of campos) {
      const n = name(c); const label = mock(c.etiqueta); const req = c.obligatorio !== false; const ej = c.ejemplo != null && !/^s*POR (DEFINIR|COMPLETAR)s*$/i.test(c.ejemplo) ? mock(c.ejemplo, `${c.etiqueta} ${def.titulo || ""}`) : valorCampo(c, def);
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
    formDefs[id] = def;
    flows[id] = { titulo: cut(mock(def.titulo || "Formulario"), 40), notas: { FORMULARIO: notaTxt || `Formulario: ${campos.map((c) => mock(c.etiqueta)).join(", ")}. Los valores se escriben solos en la demo.` }, demo: demoV,
      json: { version: "7.3", screens: [{ id: "FORMULARIO", title: cut(mock(def.titulo || "Formulario"), 30), terminal: true, success: true, layout: { type: "SingleColumnLayout", children } }] } };
  }
  // Formularios que el SOW todavía no detalla (0 o 1 campo): se agregan campos probables según el título, la etapa y el texto del paso
  function conCamposProbables(s) {
    const f = s.formulario || {}; const texto = `${f.titulo || ""} ${s.etapa || ""} ${s.diagrama || ""} ${s.mensaje || ""}`;
    const r = R.completarCampos(probables, mock(texto), f.campos, 5, mock(f.titulo || ""));
    if (!r) return { def: f, probables: [] };
    sinCampos.push(`${s.id}: el formulario «${mock(f.titulo || s.etapa || s.diagrama || "")}» no tiene campos en el SOW; se muestran campos probables (${r.agregados.map((c) => mock(c.etiqueta)).join(", ")}). Confírmalos con el cliente o defínelos en el SOW (formulario.campos).`);
    return { def: { ...f, titulo: f.titulo || s.etapa || s.diagrama, campos: r.campos }, probables: r.agregados };
  }
  const flowForm = (s, id) => {
    const { def, probables: ag } = conCamposProbables(s);
    flowDesdeDef(def, id, `Formulario del SOW (${mock(s.etapa || s.diagrama || "paso")}): ${arr(def.campos).map((c) => mock(c.etiqueta)).join(", ")}.${ag.length ? ` Campos probables (el SOW aún no los define): ${ag.map((c) => mock(c.etiqueta)).join(", ")}.` : ""} Los valores se escriben solos en la demo.`);
  };
  function webviewForm(s, id) {
    const f = conCamposProbables(s).def;
    webviews[id] = { titulo: cut(mock(f.titulo || s.etapa || "Formulario"), 40), dominio: slug(marca.nombre) + ".demo", color: marca.color,
      pantallas: [{ nota: `Formulario en webview (${s.etapa || s.diagrama || "paso"}).`, bloques: [{ tipo: "marca" }, { tipo: "titulo", texto: mock(f.titulo || "Formulario") }, ...arr(f.campos).map((c) => ({ tipo: "campo", etiqueta: mock(c.etiqueta), valor: mock(c.ejemplo || "") }))], boton: mock(f.boton || "Enviar"), cargando: "Enviando…" }],
      exito: { titulo: "Listo", texto: "Tu información fue enviada.", boton: "Volver a WhatsApp" } };
  }

  // ---------- modos del simulador: conversacional | mixto | webview/Flows ----------
  // Qué modo(s) se generan lo decide, en este orden: agentes[].modo_experiencia, las observaciones del cliente de la reunión
  // (sow.demo.observaciones_cliente / meta.observaciones_cliente), sow.demo.modo, frases del propio SOW (brief, objetivos, modo_experiencia),
  // la herramienta de los formularios (herramienta: flows | webview, todos decididos). Si nada lo define, se generan los TRES con un selector.
  const MODOS = ["conversacional", "mixto", "webview"];
  const modoNombre = (m, canal) => ({ conversacional: "Conversacional", mixto: "Mixto", webview: !canal || canal === "whatsapp" ? "Flows y webview" : "Webview" })[m];
  const aTextos = (v) => (Array.isArray(v) ? v.flatMap(aTextos) : v && typeof v === "object" ? aTextos(v.texto || v.observacion || "") : v ? [String(v)] : []);
  const modoValido = (v) => {
    const n = norm(Array.isArray(v) ? v[0] : v).replace(/ /g, "_");
    if (/^(webview|flows?|webview_flows?|flows_webview|webview_y_flows|flows_y_webview)$/.test(n)) return "webview";
    return ["conversacional", "mixto"].includes(n) ? n : null;
  };
  const modoDeTexto = (t) => {
    const n = norm(t);
    if (/\b(mixto|hibrido|combinado)\b/.test(n)) return { modo: "mixto", frase: "mixto" };
    let m = /\b(quiero|queremos|prefiere|prefieren|usar|con|en) (whatsapp )?flows?\b/.exec(n); if (m) return { modo: "webview", frase: m[0] };
    m = /\b(100 ?(por ciento)?( ?)? ?conversacional|totalmente conversacional|solo conversacional|completamente conversacional|todo (por|en|dentro del) chat|sin (usar )?(webview|web view|flows?|formularios?)|no (quiere|queremos|quiero) (webview|web view|flows?)|mas conversacional)\b/.exec(n); if (m) return { modo: "conversacional", frase: m[0] };
    m = /\b(con|en|usar) (webview|web view)\b/.exec(n); if (m) return { modo: "webview", frase: m[0] };
    return null;
  };
  function decidirModos(a) {
    const un = (modo, origen, motivo) => ({ modos: [modo], origen, motivo });
    const ex = modoValido(a.modo_experiencia); if (ex) return un(ex, "sow", `agentes[].modo_experiencia = ${ex}`);
    const obs = aTextos([demo.observaciones_cliente, meta.observaciones_cliente]);
    for (const t of obs) { const r = modoDeTexto(t); if (r) return un(r.modo, "reunión", `observación del cliente «${cut(r.frase, 40)}»`); }
    const dm = modoValido(demo.modo || meta.modo_experiencia); if (dm) return un(dm, "sow", `demo.modo = ${dm}`);
    const libre = aTextos([a.modo_experiencia, meta.modo_experiencia, sow.brief, (sow.objetivos || {}).general, (sow.objetivos || {}).especificos, a.resumen_cliente, a.objetivo]);
    for (const t of libre) { const r = modoDeTexto(t); if (r) return un(r.modo, "sow", `el SOW dice «${cut(r.frase, 40)}»`); }
    const forms = arr(a.pasos).filter((s) => s.tipo === "formulario");
    if (forms.length && forms.every((s) => ["flows", "webview"].includes(s.herramienta))) return un("webview", "sow", "todos los formularios tienen herramienta definida (Flows / webview)");
    return { modos: MODOS, origen: "por defecto", motivo: "ni el SOW ni la reunión definen el modo" };
  }
  // ¿Este formulario se resuelve en el chat en este modo? Conversacional: siempre. Mixto: solo los cortos (hasta 3 campos y sin archivos); el resto es imprescindible en Flow/webview.
  const formEnChat = (X, modo) => {
    if (modo === "webview") return false;
    const cs = arr(conCamposProbables(X).def.campos); if (!cs.length) return false;
    return modo === "conversacional" || (cs.length <= 3 && !cs.some((c) => c.tipo === "archivo"));
  };
  // Valor que la persona escribe (o toca) para un campo: el ejemplo del SOW, el inferido del contexto o la primera opción
  const valorChat = (c, def) => {
    if (c.tipo === "casilla") return "Sí"; if (c.tipo === "fecha") return "22/10/2026";
    const dado = c.ejemplo != null && !/^\s*POR (DEFINIR|COMPLETAR)\s*$/i.test(c.ejemplo) ? mock(c.ejemplo, `${c.etiqueta} ${def.titulo || ""}`) : "";
    if (c.tipo === "selector") return dado || mock(arr(c.opciones)[0] || "Opción 1");
    return dado || valorCampo(c, def);
  };
  const VALIDACION = { correo: "Validación: formato de correo; si no es válido el bot repite la pregunta.", telefono: "Validación: solo dígitos y prefijo del país; si no cumple el bot repite la pregunta.", numero: "Validación: solo números; si no cumple el bot repite la pregunta.", fecha: "Validación: fecha con formato dd/mm/aaaa.", archivo: "Validación: imagen legible; si no se lee el bot pide otra." };
  // Formulario conversacional: una pregunta por mensaje con su respuesta, resumen y confirmación final (con «Corregir» que vuelve a la primera pregunta).
  function formularioEnChat(X, key, nota) {
    const def = conCamposProbables(X).def; const cs = arr(def.campos); const out = []; const resumen = []; const q = (i) => `${key}_q${i}`;
    const intro = mock(X.mensaje || "").trim();
    out.push({ id: `${key}_c0`, _chat: true, tipo: "texto", texto: cut(intro || "Necesito unos datos para continuar. Te los voy pidiendo uno a uno.", 4096), nota: nota("Modo conversacional: el formulario se resuelve pregunta a pregunta en el chat, sin WhatsApp Flow ni webview.") });
    cs.forEach((c, i) => {
      const label = mock(c.etiqueta || `Dato ${i + 1}`); const val = valorChat(c, def); const lc = label.charAt(0).toLowerCase() + label.slice(1);
      const regla = VALIDACION[c.tipo] || (c.obligatorio !== false ? "Campo obligatorio: si la persona no responde, el bot vuelve a preguntar." : "Campo opcional.");
      resumen.push(`• ${label}: ${c.tipo === "archivo" ? "foto enviada" : val}`);
      if (c.tipo === "selector") {
        const ops = (arr(c.opciones).length ? arr(c.opciones) : ["Opción 1", "Opción 2"]).map(mock); const pi = Math.max(0, ops.findIndex((o) => norm(o) === norm(val)));
        if (ops.length <= 3) out.push({ id: q(i), _chat: true, tipo: "botones", cuerpo: cut(`Elige ${lc}:`, 1024), botones: ops.map((t) => ({ titulo: cut(t, 20) })), principal: pi, nota: regla });
        else out.push({ id: q(i), _chat: true, tipo: "lista", cuerpo: cut(`Elige ${lc}:`, 1024), boton: "Ver opciones", secciones: [{ titulo: cut(label, 24), filas: ops.slice(0, 10).map((t, k) => ({ titulo: cut(t, 24), id: "o" + k })) }], nota: regla });
      } else if (c.tipo === "casilla") out.push({ id: q(i), _chat: true, tipo: "botones", cuerpo: cut(`¿Aceptas? ${label}`, 1024), botones: [{ titulo: "Sí, acepto" }, { titulo: "No" }], principal: 0, nota: regla });
      else if (c.tipo === "archivo") {
        out.push({ id: q(i), _chat: true, tipo: "texto", texto: cut(`Envíame una foto de: ${lc}.`, 4096), nota: regla });
        const gen = /c[eé]dula|dni|documento|identidad|pasaporte/i.test(label) ? "documento-identidad" : /selfie|rostro/i.test(label) ? "selfie" : /factura|comprobante|recibo/i.test(label) ? "factura" : "pantalla";
        out.push({ _chat: true, tipo: "usuario", texto: "", imagen: { generar: gen, alt: label } });
      } else {
        out.push({ id: q(i), _chat: true, tipo: "texto", texto: cut(`Indícame ${lc}.`, 4096), nota: regla });
        out.push({ _chat: true, tipo: "usuario", texto: cut(val, 1024) });
      }
    });
    out.push({ id: `${key}_cf`, _chat: true, tipo: "botones", cuerpo: cut(`Confirmo tus datos:\n${resumen.join("\n")}`, 1024), botones: [{ titulo: "Confirmar", ir: `${key}_ok` }, { titulo: "Corregir", ir: q(0) }], principal: 0, nota: "Resumen y confirmación final antes de continuar; «Corregir» vuelve a la primera pregunta." });
    out.push({ id: `${key}_ok`, _chat: true, tipo: "texto", texto: "Gracias, registré tus datos ✅", nota: "Fin del formulario conversacional." });
    return out;
  }

  // ---------- un agente -> un grafo de nodos visibles ----------
  // ---------- canal distinto de WhatsApp: el contenido se adapta a lo que ese canal admite ----------
  const formDefs = {};
  function adaptarCanal(steps, canal) {
    const C = CAN.CANALES[canal] || CAN.CANALES.widget; const lim = C.limite; const out = [];
    const con = (s, extra) => ({ ...s, nota: [s.nota, extra].filter(Boolean).join(" ") });
    const cuerpoDe = (s) => s.cuerpo || s.texto || s.titulo || s.encabezado || "";
    for (const s of steps) {
      switch (s.tipo) {
        case "notificacion": break;   // no existe fuera de WhatsApp
        case "plantilla": {
          const bts = arr(s.botones).filter((b) => !b.tipo || b.tipo === "respuesta").slice(0, 3).map((b) => ({ titulo: cut(b.titulo, 20) }));
          const extra = `En ${C.nombre} no hay plantillas HSM: ${C.ventana24h ? "el bot solo puede escribir primero dentro de la ventana de 24 h (o con etiquetas de Meta)" : "el mensaje sale como un mensaje normal del bot"}.`;
          out.push(con(bts.length ? { tipo: "botones", cuerpo: cut(cuerpoDe(s), lim), botones: bts, nota: s.nota } : { tipo: "texto", texto: cut(cuerpoDe(s), lim), nota: s.nota }, extra)); break; }
        case "flow": {
          const def = formDefs[s.flow];
          if (!def) { out.push(s); break; }
          const wv = s.flow.replace(/_flow$/, "") + "_wv"; webviewForm({ formulario: def, etapa: def.titulo }, wv);
          out.push(con({ tipo: "cta_url", cuerpo: cut(cuerpoDe(s), lim), boton: cut(s.boton || "Abrir formulario", 20), webview: wv, nota: s.nota }, `En ${C.nombre} no existen WhatsApp Flows: el formulario se abre como página web (webview).`)); break; }
        case "lista": {
          const filas = arr(s.secciones).flatMap((x) => arr(x.filas));
          out.push(con({ tipo: "botones", cuerpo: cut(`${cuerpoDe(s)}\n\n${filas.map((f, i) => `${i + 1}. ${f.titulo}`).join("\n")}`, lim), botones: filas.slice(0, 3).map((f) => ({ titulo: cut(f.titulo, 20) })), nota: s.nota }, `${C.nombre} no tiene listas desplegables: se muestran como lista numerada y botones (los 3 primeros).`)); break; }
        case "solicitar_ubicacion": case "solicitar_contacto":
          out.push(con({ tipo: "texto", texto: cut(cuerpoDe(s), lim), nota: s.nota }, `El botón nativo de WhatsApp no existe en ${C.nombre}: la persona escribe el dato.`)); break;
        case "ubicacion":
          out.push(con({ tipo: "texto", texto: cut(`📍 ${s.nombre || ""}${s.direccion ? "\n" + s.direccion : ""}`, lim), nota: s.nota }, `${C.nombre} no envía ubicaciones nativas.`)); break;
        case "contacto": case "sticker": case "reaccion": case "permiso_llamada": case "autenticacion": case "catalogo": case "multiproducto": case "producto": case "carrusel":
          out.push(con({ tipo: "texto", texto: cut(cuerpoDe(s) || s.nombre || s.emoji || "", lim), nota: s.nota }, `Este formato es exclusivo de WhatsApp: en ${C.nombre} se envía como texto.`)); break;
        case "botones": out.push({ ...s, cuerpo: cut(s.cuerpo, lim), botones: arr(s.botones).slice(0, 3).map((b) => ({ ...b, titulo: cut(b.titulo, 20) })) }); break;
        case "texto": out.push({ ...s, texto: cut(s.texto, lim) }); break;
        case "cta_url": out.push(canal !== "whatsapp" && canal !== "widget" && s.webview ? con({ ...s, cuerpo: cut(s.cuerpo, lim) }, `En ${C.nombre} el enlace se abre en el navegador del teléfono (el WebView embebido es de WhatsApp).`) : { ...s, cuerpo: cut(s.cuerpo, lim) }); break;
        default: out.push(s);
      }
    }
    return out;
  }

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

  function construirAgente(a, canal = "whatsapp", etiquetar = false, modo = "webview", multiModo = false) {
    const skin = (CAN.CANALES[canal] || CAN.CANALES.widget).skin; const sfx = (canal === "whatsapp" ? "" : "_" + canal) + (multiModo ? "_" + modo : "");
    const etqModo = multiModo ? ` · ${modoNombre(modo, canal)}` : ""; const parBase = slug(a.id) + (canal === "whatsapp" ? "" : "_" + canal);
    const etq = etiquetar || canal !== "whatsapp" ? ` · ${(CAN.CANALES[canal] || CAN.CANALES.widget).nombre}` : "";
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
      const out = []; const key = `${canal === "whatsapp" ? "" : canal + "_"}${a.id}_${X.id}`.toLowerCase().replace(/[^a-z0-9_]/g, "_");
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
          if (ab && ab.pasos.length) out.push(...ab.pasos); else out.push({ tipo: "usuario", texto: mock(X.mensaje || X.diagrama || "", `${X.etapa || ""} ${X.diagrama || ""}`), nota: nota() });
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
          } else if (bts.length === 1 && sig && sig.tipo === "formulario" && !formEnChat(sig, modo)) {
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
          else if (formEnChat(X, modo)) out.push(...formularioEnChat(X, key, nota));
          else if ((X.herramienta || "") === "webview") { webviewForm(X, key + "_wv"); out.push({ tipo: "cta_url", cuerpo: cut(mock(X.mensaje) || "Completa el formulario para continuar 👇", 1024), boton: cut(X.boton_abrir || "Abrir formulario", 20), webview: key + "_wv", nota: nota() }); }
          else { flowForm(X, key + "_flow"); out.push({ tipo: "flow", cuerpo: cut(mock(X.mensaje) || "Completa el formulario para continuar 👇", 1024), boton: cut(X.boton_abrir || "Abrir formulario", 20), flow: key + "_flow", nota: nota() }); }
          break; }
        case "asesor": out.push({ tipo: "sistema", estilo: "asesor", texto: mock(X.diagrama || "Conversación derivada a un asesor"), nota: nota() }); break;
        case "fin": out.push({ tipo: "fin", texto: cut(mock(X.diagrama || "Fin de la conversación"), 80) }); break;
        default: out.push({ tipo: "texto", texto: mock(X.diagrama || X.tipo), nota: nota() });
      }
      return canal === "whatsapp" ? out : adaptarCanal(out, canal);
    }

    // ---- recorrido principal: grafo con ramas del usuario y reintentos ----
    const registrarLlegada = (outs, desde) => { for (const o of outs) if (o.to && !llegada[o.to.id]) { llegada[o.to.id] = { via: o.via, label: o.label }; if (!padre[o.to.id]) padre[o.to.id] = { de: desde, label: o.label }; } };
    // Salidas de un paso en el orden en que se recorre el camino PRINCIPAL del simulador: primero las que avanzan y las de éxito; al final las que
    // vuelven a un paso que ya está en el camino (reintentos, ciclos) y las de error. Si no, una decisión «no válido → volver» listada primero
    // dejaría el recorrido en un bucle que nunca llega al final. Los reintentos salen como recorridos alternos.
    const NEG = /\b(no\b|inv[aá]lid|incorrect|error|fall|rechaz|negad|reintent|sin resultado|no encontr|expir|vencid|fuera de|cancel)/i;
    const pila = new Set();
    const ordenar = (outs, enCamino = pila) => outs.map((o, i) => ({ o, i, k: (o.to && enCamino.has(o.to.id) ? 2 : 0) + (NEG.test(o.label || "") ? 1 : 0) })).sort((a, b) => a.k - b.k || a.i - b.i).map((x) => x.o);
    function visitar(X) {
      if (!X || emitido.has(X.id)) return; emitido.add(X.id); pila.add(X.id);
      try { visitarPaso(X); } finally { pila.delete(X.id); }
    }
    function visitarPaso(X) {
      let outs = ordenar(succ(X)); registrarLlegada(outs, X);
      const ctx = { outs }; const steps = conv(X, ctx);
      if (ctx.consumido) { emitido.add(ctx.consumido.id); outs = ordenar(succ(ctx.consumido)); registrarLlegada(outs, X); }
      const principal = outs[0] || {};
      const eleccion = esEleccion(X, outs);
      if (!eleccion && outs.length > 1) alternos.push(...outs.slice(1).map((o, k) => ({ X, o, k: k + 1 })));
      const last = steps[steps.length - 1];
      if (steps.length) steps[0].id = nid(X);
      const irDe = (t) => (t ? nid(t) : null);
      if (X.tipo === "fin") { pasosOut.push(...steps); return; }
      const btnStep = steps.find((s) => !s._chat && ["botones", "lista", "plantilla"].includes(s.tipo));
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

    const tech = (ps) => (a.entrada === "outbound" && canal === "whatsapp" ? "hsm" : ps.some((x) => x.tipo === "flow") ? "flow" : ps.some((x) => x.tipo === "cta_url") ? "webview" : "chat");
    const grupos = [...new Set(pasos.map((s) => s.grupo || s.etapa).filter(Boolean))].slice(0, 6).map(mock);
    const resumenAg = mock(arr(a.resumen_cliente).map((x) => (typeof x === "string" ? x : x.texto)).filter(Boolean).slice(0, 4).join(" → ") || a.nombre);
    const journeys = [{ id: slug(a.id) + sfx, nombre: cut(mock(a.nombre) + etq, 60 - etqModo.length) + etqModo, ...(multiModo ? { modo, par: parBase } : {}), canal: skin, tech: tech(pasosOut), resumen: resumenAg, puntos: grupos, pasos: pasosOut }];

    // ---- recorridos alternos: ramas que decide el sistema (no la persona) ----
    const camino = (hasta) => { const c = []; let x = hasta; const guard = new Set(); while (x && !guard.has(x.id)) { guard.add(x.id); c.unshift(x); const p = padre[x.id]; x = p && p.de; } return c; };
    const vistos = new Set(); let n = 0;
    for (const { X, o } of alternos) {
      if (n >= 8 || !o.to || X._de) continue;   // las ramas del flujo al que se continúa ya salen en su propio recorrido
      const pre = camino(X); const seguir = []; const g = new Set(pre.map((x) => x.id)); let t = o.to;
      while (t && !g.has(t.id)) { g.add(t.id); seguir.push(t); const so = ordenar(succ(t), g); t = (so[0] || {}).to; }
      const ruta = [...pre, ...seguir]; const sig = ruta.map((x) => x.id).join(">"); if (vistos.has(sig)) continue; vistos.add(sig);
      const ps = []; let k = 0;
      while (k < ruta.length) {
        const Y = ruta[k]; const outsY = succ(Y); const ctx = { outs: outsY }; const st = conv(Y, ctx);
        const salto = ctx.consumido && ruta[k + 1] === ctx.consumido ? 2 : 1; const nextN = ruta[k + salto];
        const b = st.find((s) => !s._chat && ["botones", "plantilla"].includes(s.tipo)); if (b && b.botones.length > 1 && nextN) { const tit = titulosBotones(Y); const lab = (outsY.find((x) => x.to === nextN) || {}).label; const ix = tit.findIndex((tt) => norm(tt) === norm(lab)); if (ix >= 0) b.principal = ix; }
        ps.push(...st); k += salto;
      }
      const dec = (o.via || []).filter((v) => v.tipo === "decision").pop() || {};
      const nombreAlt = `${cut(String(dec.diagrama || X.diagrama || a.nombre).replace(/[¿?]/g, "").trim(), 34)}: ${cut(mock(o.label || "otro caso"), 24)}`;
      const ultimo = ruta[ruta.length - 1]; const sigo = succ(ultimo)[0];
      ps.push({ tipo: "fin", texto: ultimo.tipo === "fin" ? cut(mock(ultimo.diagrama || "Fin"), 80) : sigo && sigo.to ? `Vuelve al paso «${cut(mock(sigo.to.etapa || sigo.to.diagrama || ""), 40)}»` : "Fin de la conversación" });
      const dd = ps.filter((s, i) => !(s.tipo === "fin" && i < ps.length - 1));
      journeys.push({ id: slug(a.id) + sfx + "_alt" + (++n), nombre: cut(`${mock(a.nombre).split(":")[0]} · ${nombreAlt}${etq}`, 60 - etqModo.length) + etqModo, ...(multiModo ? { modo, par: `${parBase}_alt${n}` } : {}), canal: skin, tech: tech(dd), resumen: `Camino alterno decidido por el sistema: ${mock(o.label || "otro caso")}.`, puntos: [], pasos: dd });
    }
    return journeys;
  }

  const journeys = [];
  const canalesUsados = new Set(); const modosGenerados = new Set();
  for (const a of agentes) {
    const canales = CAN.canalesDeAgente(sow, a);
    const dm = decidirModos(a); const multi = dm.modos.length > 1;
    for (const c of canales) {
      canalesUsados.add(c);
      if (multi) {
        // un recorrido por modo; si el agente no tiene nada que cambie entre modos (sin formularios), los tres serían iguales: se deja uno solo, sin selector
        const porModo = dm.modos.map((m) => ({ m, js: construirAgente(a, c, canales.length > 1, m, true) }));
        const firma = (js) => JSON.stringify(js.map((j) => j.pasos));
        if (porModo.every((x) => firma(x.js) === firma(porModo[0].js))) { journeys.push(...construirAgente(a, c, canales.length > 1, "webview", false)); if (c === canales[0]) avisos.push(`${a.id}: no tiene formularios que cambien entre modos; se genera un solo recorrido (sin selector de modo).`); }
        else { for (const x of porModo) journeys.push(...x.js); modosGenerados.add(dm); if (c === canales[0]) avisos.push(`${a.id}: se generaron los modos ${dm.modos.map((m) => modoNombre(m, c)).join(", ")} con un selector en el panel del presentador (origen: ${dm.origen}; ${dm.motivo}). Cuando el cliente decida, define agentes[].modo_experiencia o sow.demo.modo (o anótalo en sow.demo.observaciones_cliente) para dejar uno solo.`); }
      } else { journeys.push(...construirAgente(a, c, canales.length > 1, dm.modos[0], false)); if (c === canales[0] && arr(a.pasos).some((s) => s.tipo === "formulario")) avisos.push(`${a.id}: modo del simulador «${modoNombre(dm.modos[0], c)}» (origen: ${dm.origen}; ${dm.motivo}); sin selector.`); }
      if ((CAN.CANALES[c] || {}).sinSkin) avisos.push(`${a.id}: el canal «${CAN.CANALES[c].nombre}» no tiene simulador visual propio; se muestra como chat genérico. ${CAN.CANALES[c].nota}`);
    }
    if (canales.length > 1) avisos.push(`${a.id}: el SOW menciona varios canales (${canales.map((c) => CAN.CANALES[c].nombre).join(", ")}); se genera un recorrido por canal. Indica el canal exacto en agentes[].canal si no es así.`);
  }
  const otrosCanales = [...canalesUsados].filter((c) => c !== "whatsapp");
  for (const c of otrosCanales) if (CAN.CANALES[c] && CAN.CANALES[c].nota && !CAN.CANALES[c].sinSkin) avisos.push(`Canal ${CAN.CANALES[c].nombre}: ${CAN.CANALES[c].nota}`);

  // ---------- cobertura visual ----------
  const VIS_RE = /\bQR\b|foto|imagen|factura|comprobante|recibo|\bPDF\b|mapa|ubicaci[oó]n|video|audio|documento|firma|biometr|selfie|cat[aá]logo|carrito/i;
  const modoRef = journeys.some((j) => j.modo === "webview") ? "webview" : (journeys.find((j) => j.modo) || {}).modo;
  const vista = journeys.filter((j) => !j.modo || j.modo === modoRef);   // las estadísticas cuentan un solo modo, no los tres
  const todos = vista.flatMap((j) => j.pasos);
  const principales = vista.filter((j) => !/_alt\d+$/.test(j.id)).flatMap((j) => j.pasos);
  const hayVisual = todos.some((p) => ["imagen", "documento", "ubicacion", "video", "audio", "cta_url", "flow", "multiproducto", "catalogo", "carrusel", "producto", "solicitar_ubicacion"].includes(p.tipo) || p.imagen || p.audio);
  const yaAvisado = new Set();
  for (const [nodo0, u] of usados) { const nodo = nodo0.replace(/^.*__/, ""); if (!u.respaldo || yaAvisado.has(nodo)) continue; yaAvisado.add(nodo); avisos.push(`${nodo}: usa la pantalla genérica de respaldo (${u.proveedor}). Si sabes cómo se ve, enséñasela a la skill: node scripts/aprender_recurso.js (references/simulador-visual.md §5).`); }
  for (const a of agentes) for (const s of arr(a.pasos)) {
    if (!["mensaje", "usuario"].includes(s.tipo) || usados.has(s.id)) continue;
    const m = String(s.mensaje || "").match(VIS_RE);
    if (m && !stepOf(a, s).adjunto && !hayVisual) avisos.push(`${a.id}.${s.id} menciona un recurso visual («${m[0]}») y no se dibuja nada: agrega \`adjunto\`/\`recurso\` al paso o define \`demo.pasos.${s.id}\`.`);
  }
  avisos.push(...sinCampos);
  if (sinInferir.length) avisos.push(`No se pudo inferir un valor realista para: ${[...new Set(sinInferir)].join("; ")}. Se usó un código genérico; defínelo en el SOW (campo «ejemplo» / paso «mensaje») con lo que digan el presow y Diio, o en sow.demo.datos.`);
  const sistemaSteps = todos.filter((p) => p.tipo === "sistema" && p.estilo !== "asesor").length;
  if (sistemaSteps) avisos.push(`${sistemaSteps} paso(s) de sistema visibles en el chat: revisa que no sean llamadas a API.`);
  const porRecurso = {}; for (const [, u] of usados) porRecurso[u.id] = (porRecurso[u.id] || 0) + 1;
  const stats = {
    alternos: vista.length - vista.filter((j) => !/_alt\d+$/.test(j.id)).length,
    imagenes: principales.filter((p) => p.imagen || p.tipo === "imagen").length, documentos: principales.filter((p) => p.tipo === "documento").length,
    flows: Object.keys(flows).length, webviews: Object.keys(webviews).length, recursos: porRecurso, pagos: porRecurso.pago || 0,
  };

  for (const j of journeys) for (const s of j.pasos) { delete s._chat; if (s.tipo === "botones") for (const b of s.botones) delete b.accion; }
  const soloOtroCanal = journeys.length > 0 && journeys.every((j) => j.canal && j.canal !== "whatsapp");
  const nombresCanal = [...canalesUsados].map((c) => CAN.CANALES[c].nombre).join(" · ");
  const modosPresentes = MODOS.filter((m) => journeys.some((j) => j.modo === m));
  const unCanalWA = [...canalesUsados].every((c) => c === "whatsapp");
  const modos = modosPresentes.length > 1 ? { lista: modosPresentes.map((m) => ({ id: m, nombre: modoNombre(m, unCanalWA ? "whatsapp" : "widget") })), inicial: modosPresentes.includes("mixto") ? "mixto" : modosPresentes[0] } : null;
  const guion = {
    panel: {
      titulo: `${marca.nombre} · ${meta.proyecto || "Simulación"}`,
      subtitulo: (prek ? "Simulación preliminar (pre-kickoff)" : `Simulación del SOW v${meta.version || "1.0"}${meta.estado === "aprobado" ? " · aprobado" : " · en revisión"}`) + (soloOtroCanal ? ` · ${nombresCanal}` : ""),
      version: `SOW v${meta.version || "1.0"}${prek ? " · pre-kickoff" : ""}`,
      pie: (soloOtroCanal ? `Apariencia aproximada de ${nombresCanal}; no es una copia oficial del canal. ` : "") + "Prototipo con datos simulados." + (modos ? ` Modos: ${modos.lista.map((m) => m.nombre).join(", ")} (se cambia en el panel del presentador).` : "") + (prek || datosProbables.length ? " Lo que aún no está definido usa valores de ejemplo, por confirmar con el cliente." : ""),
      titulo_pagina: `Jelou · Simulación ${marca.nombre}`, resumen: false,
    },
    marca, usuario, journeys, flows, webviews, ...(modos ? { modos } : {}),
  };
  // Flows y webviews que ningún paso usa (p. ej. el Flow que en otro canal se convirtió en webview): fuera, para no dejar basura en el guion
  const usadosIds = { flow: new Set(), webview: new Set() };
  for (const j of journeys) for (const s of j.pasos) { if (s.flow) usadosIds.flow.add(s.flow); if (s.webview) usadosIds.webview.add(s.webview); for (const b of s.botones || []) { if (b.flow) usadosIds.flow.add(b.flow); if (b.webview) usadosIds.webview.add(b.webview); } }
  for (const k of Object.keys(flows)) if (!usadosIds.flow.has(k)) delete flows[k];
  for (const k of Object.keys(webviews)) if (!usadosIds.webview.has(k)) delete webviews[k];
  const limpio = limpiarVariables(guion);   // red de seguridad: ningún texto del simulador conserva «{{variable}}»
  return { guion: limpio, avisos: [...new Set(avisos)], stats, mocked: datosProbables.length > 0 };
}

function run(cmd, args, cwd) { return spawnSync(cmd, args, { cwd, encoding: "utf8" }); }

// Inyecta la extensión visual (bloques de webview) y los skins de canal en el HTML del kit
function inyectarExtension(html) {
  const dir = path.join(__dirname, "..", "assets", "visuales");
  const f = path.join(dir, "kit-extension.js"); const fSkins = path.join(dir, "kit-skins.js");
  if (!fs.existsSync(f)) return { html, ok: false, motivo: "falta assets/visuales/kit-extension.js" };
  if (!/function wvBlock\(/.test(html)) return { html, ok: false, motivo: "el motor del kit cambió (no existe wvBlock)" };
  let scripts = fs.readFileSync(f, "utf8");
  if (fs.existsSync(fSkins) && /function startJourney\(/.test(html)) scripts += "\n" + fs.readFileSync(fSkins, "utf8");
  return { html: html.replace(/<\/body>\s*<\/html>\s*$/i, () => `<script>\n${scripts}\n</script>\n</body></html>`), ok: true };
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
