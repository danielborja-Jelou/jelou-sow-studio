#!/usr/bin/env node
// Builds the SOW Word document from sow.json by injecting generated WordprocessingML
// into assets/template/sow-template.docx (Poppins fonts, letterhead background, styles and
// numbering decompiled from a reference Jelou SOW). Diagrams come from lib/diagram.js.
// Usage: node build_sow_docx.js sow.json output.docx
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const C = require("./lib/common");
const { arr } = C;

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) { console.error("Usage: node build_sow_docx.js sow.json output.docx"); process.exit(2); }
const sow = JSON.parse(fs.readFileSync(inFile, "utf8"));
const brand = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "assets", "brand.json"), "utf8"));
const TPL = path.join(__dirname, "..", "assets", "template", "sow-template.docx");
const meta = sow.meta || {};
const B = brand.word;

// ---------- XML helpers ----------
const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
function rPr(o = {}) {
  let x = "";
  if (o.sb) x += '<w:rFonts w:ascii="Poppins SemiBold" w:hAnsi="Poppins SemiBold" w:cs="Poppins SemiBold" w:eastAsia="Poppins SemiBold"/>';
  if (o.italic) x += "<w:i/><w:iCs/>";
  if (o.color) x += `<w:color w:val="${o.color}"/>`;
  if (o.size) x += `<w:sz w:val="${o.size}"/><w:szCs w:val="${o.size}"/>`;
  return x ? `<w:rPr>${x}</w:rPr>` : "";
}
// Text run(s); every "POR COMPLETAR" / "POR DEFINIR" is painted red.
function run(text, o = {}) {
  const parts = String(text == null ? "" : text).split(/(POR COMPLETAR|POR DEFINIR)/);
  return parts.filter((p) => p !== "").map((p) => {
    const red = p === "POR COMPLETAR" || p === "POR DEFINIR";
    return `<w:r>${rPr(red ? { ...o, color: B.color_pendiente } : o)}<w:t xml:space="preserve">${esc(p)}</w:t></w:r>`;
  }).join("");
}
function P(content, o = {}) {
  let pPr = "";
  if (o.style) pPr += `<w:pStyle w:val="${o.style}"/>`;
  if (o.keepNext) pPr += "<w:keepNext/>";
  if (o.pageBreakBefore) pPr += "<w:pageBreakBefore/>";
  if (o.numId) pPr += `<w:numPr><w:ilvl w:val="0"/><w:numId w:val="${o.numId}"/></w:numPr>`;
  if (o.after != null || o.before != null) pPr += `<w:spacing${o.before != null ? ` w:before="${o.before}"` : ""}${o.after != null ? ` w:after="${o.after}"` : ""}/>`;
  if (o.ind) pPr += o.ind;
  if (o.jc) pPr += `<w:jc w:val="${o.jc}"/>`;
  return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ""}${content}</w:p>`;
}
const text = (t, o) => P(run(t, o), o);
const H1 = (t) => P(run(t), { style: "Heading1", numId: 2, ind: '<w:ind w:left="0" w:firstLine="0"/>' });
const H2 = (t) => P(run(t), { style: "Heading2" });
const bullet = (t, o = {}) => P(typeof t === "string" ? run(t, o) : t.join(""), { numId: 1, after: 60 });
const labeled = (label, value) => P(run(label + ": ", { sb: true }) + run(value));
const caption = (t) => P(run(t, { italic: true, color: B.color_secundario, size: 18 }), { jc: "center", after: 160 });

function cellXml(content, w, o = {}) {
  const lines = arr(content).flatMap((c) => String(c == null ? "" : c).split("\n"));
  const paras = (lines.length ? lines : [""]).map((l) => `<w:p><w:pPr><w:spacing w:after="0" w:line="264" w:lineRule="auto"/></w:pPr>${run(l, { sb: o.sb, color: o.color, size: B.tamanos_medios_puntos.tabla })}</w:p>`).join("");
  const mar = brand.word.tabla.margen_celda_dxa;
  return `<w:tc><w:tcPr><w:tcW w:w="${w}" w:type="dxa"/>${o.fill ? `<w:shd w:fill="${o.fill}" w:val="clear"/>` : ""}<w:tcMar><w:top w:w="${mar.vertical}" w:type="dxa"/><w:left w:w="${mar.horizontal}" w:type="dxa"/><w:bottom w:w="${mar.vertical}" w:type="dxa"/><w:right w:w="${mar.horizontal}" w:type="dxa"/></w:tcMar></w:tcPr>${paras}</w:tc>`;
}
function table(headers, rows, widths, o = {}) {
  const total = B.tabla.ancho_dxa;
  const sum = widths.reduce((a, b) => a + b, 0);
  const w = widths.map((x) => Math.round((x / sum) * total));
  w[w.length - 1] += total - w.reduce((a, b) => a + b, 0);
  const bd = B.tabla.borde;
  const border = (n) => `<w:${n} w:color="${bd}" w:space="0" w:sz="4" w:val="single"/>`;
  let x = `<w:tbl><w:tblPr><w:tblW w:w="${total}" w:type="dxa"/><w:jc w:val="left"/><w:tblInd w:w="-110" w:type="dxa"/><w:tblBorders>${["top", "left", "bottom", "right", "insideH", "insideV"].map(border).join("")}</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblLook w:val="0400"/></w:tblPr><w:tblGrid>${w.map((g) => `<w:gridCol w:w="${g}"/>`).join("")}</w:tblGrid>`;
  if (headers) x += `<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr>${headers.map((h, i) => cellXml(h, w[i], { fill: B.tabla.fondo_cabecera, sb: true })).join("")}</w:tr>`;
  for (const r of rows) {
    x += `<w:tr><w:trPr><w:cantSplit/></w:trPr>${r.map((c, i) => cellXml(c, w[i], o.firstColFill && i === 0 ? { fill: B.tabla.fondo_cabecera, sb: true } : {})).join("")}</w:tr>`;
  }
  return x + "</w:tbl>" + P("", { after: 80 });
}
const kvTable = (rows, widths = [22, 78]) => table(null, rows, widths, { firstColFill: true });
const val = (v) => (v === undefined || v === null || v === "" ? "—" : v);

// ---------- figures ----------
const figures = []; // {rId, buf, cx, cy, name}
function figureXml(fig, n) {
  const id = 100 + n;
  return `<w:p><w:pPr><w:spacing w:after="60"/><w:jc w:val="center"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${fig.cx}" cy="${fig.cy}"/><wp:docPr id="${id}" name="${esc(fig.name)}" descr="${esc(fig.alt || fig.name)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="${esc(fig.name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${fig.rId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${fig.cx}" cy="${fig.cy}"/></a:xfrm><a:prstGeom prst="rect"/></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`;
}
let diagramLib = null, figLib = null;
try { diagramLib = require("./lib/diagram"); figLib = require("./lib/figuras"); } catch (e) { console.warn("Note: lib/diagram.js not available; diagrams are skipped."); }
function addFigure(spec, name, alt) {
  if (!diagramLib || !spec || !arr(spec.pasos).length) return "";
  const out = diagramLib.renderDiagramPng(spec, {});
  const maxW = 5832000, maxH = 7500000; // 16.2 cm wide; keep inside the page
  let cx = maxW, cy = Math.round((out.height / out.width) * maxW);
  if (cy > maxH) { cy = maxH; cx = Math.round((out.width / out.height) * maxH); }
  const fig = { rId: `rIdFig${figures.length + 1}`, buf: out.png, cx, cy, name, alt };
  figures.push(fig);
  return figureXml(fig, figures.length);
}

// ---------- content ----------
const body = [];
const add = (x) => body.push(x);
const agents = C.getAgents(sow);
const draft = C.isDraft(sow); // driven by meta.estado (en_revision | aprobado), never by the version number
// Agent label for headings: original casing of the name and the phase, joined with " — " (never nested parentheses).
const agLabel = (ag) => `${ag.nombre}${ag.fase ? " — " + ag.fase : ""}`;
const figSet = figLib ? figLib.buildFigureSet(sow) : { figuras: [], porAgente: {}, general: null };

// Cover
add(P(run("Statement of Work (SoW)"), { style: "Title" }));
add(P(run(val(meta.proyecto)), { style: "Subtitle" }));
add(kvTable([
  ["Cliente", val(meta.cliente)],
  ["Proveedor", val(meta.proveedor || "Jelou")],
  ["Versión", `${val(meta.version)}${draft ? " · en revisión (pendiente de aprobación del cliente)" : " · aprobada"}`],
  ["Fecha", meta.fecha ? C.fmtShort(C.parseDate(meta.fecha)) : "POR COMPLETAR"],
  ["Preparado por", val(meta.autor || "POR COMPLETAR")],
  ...(meta.prioridad ? [["Prioridad", meta.prioridad]] : []),
  ...(meta.codigo ? [["Código de proyecto", meta.codigo]] : []),
]));

add(H1("Nombre del proyecto"));
add(text(val(meta.proyecto)));

add(H1("Brief del proyecto"));
arr(sow.brief).forEach((p) => add(text(p)));
if (arr(sow.principios_diseno).length) {
  add(text(`${arr(sow.principios_diseno).length} principios guían el diseño:`, { keepNext: true }));
  arr(sow.principios_diseno).forEach((p) => add(bullet([run(p.titulo + ": ", { sb: true }), run(p.texto)])));
}

add(H1("Objetivos del proyecto"));
const ob = sow.objetivos || {};
add(H2("Objetivo general")); add(text(val(ob.general)));
add(H2("Objetivos específicos generales")); arr(ob.especificos).forEach((o) => add(bullet(o)));
arr(ob.por_agente).forEach((pa) => {
  const ag = agents.find((a) => a.id === pa.agente);
  add(H2(`Objetivos de ${ag ? agLabel(ag) : pa.agente}`));
  arr(pa.objetivos).forEach((o) => add(bullet(o)));
});

add(H1("Equipo de trabajo"));
add(table(["Nombre y apellido", "Organización", "Cargo", "Responsabilidad"], arr(sow.equipo).map((e) => [val(e.nombre || "POR COMPLETAR"), val(e.organizacion || "POR COMPLETAR"), val(e.cargo || e.rol || "POR COMPLETAR"), val(e.responsabilidad || "POR COMPLETAR")]), [24, 18, 22, 36]));
add(P(run("¿Cuándo me comunico con ellos?", { sb: true }), { keepNext: true, after: 60 }));
add(bullet("AM: mejoras y análisis de la información, dudas sobre la propuesta, precio y costos de Meta, integraciones adicionales."));
add(bullet("PM: implementación del proyecto hasta la entrega del acta de cierre (producción del servicio)."));
add(bullet("Soporte: acompañamiento postproductivo, incidentes, dudas operativas y continuidad del servicio."));
if (sow.seguimiento) add(text(sow.seguimiento));

const al = sow.alcance || {};
add(H1("Alcance del proyecto"));
if (arr(al.fases).length) {
  add(table(["Fase", "Requerimiento", "Público", "Canal"], arr(al.fases).map((f) => [val(f.fase), val(f.requerimiento), val(f.publico), val(f.canal)]), [16, 38, 28, 18]));
}
if (arr(al.incluido_admin).length) {
  add(H2("Funcionalidades para el equipo del cliente (administración, en apps.jelou.ai)"));
  arr(al.incluido_admin).forEach((f) => add(bullet(`${f.id ? f.id + " · " : ""}${f.texto}`)));
}
const groups = new Map();
arr(al.incluido_usuario).forEach((f) => { const k = f.agente || "_"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(f); });
for (const [k, list] of groups) {
  const ag = agents.find((a) => a.id === k);
  add(H2(k === "_" ? "Funcionalidades para el usuario final" : `Funcionalidades para el usuario: ${ag ? agLabel(ag) : k}`));
  list.forEach((f) => add(bullet(`${f.id ? f.id + " · " : ""}${f.texto}`)));
}
add(H2("Fuera de alcance"));
add(text("Lo siguiente no forma parte de este proyecto. Cualquier solicitud sobre estos puntos se gestiona como control de cambios."));
arr(al.fuera_de_alcance).forEach((f) => add(bullet(`${f.id ? f.id + " · " : ""}${f.texto}`)));

// Parameters
if (Object.keys(sow.parametros || {}).length) {
  const labels = { horario_bot: "Horario del bot", horario_agentes: "Horario de agentes humanos", festivos: "Festivos", fuera_de_horario: "Atención fuera de horario", zona_horaria: "Zona horaria", idioma_tono: "Idioma y tono", moneda: "Moneda", impuestos: "Impuestos", reintentos: "Reintentos permitidos", retencion_datos: "Retención de datos personales", identificacion_telefono: "Identificación por teléfono", datos_de_prueba: "Datos de prueba" };
  add(H1("Parámetros operativos"));
  add(table(["Parámetro", "Valor"], Object.entries(sow.parametros).map(([k, v]) => [labels[k] || k.replace(/_/g, " "), val(v)]), [30, 70]));
}

// Conversation map
add(H1("Mapa de conversaciones y diagrama E2E"));
add(text("Los diagramas muestran el flujo extremo a extremo propuesto y se generan de la misma fuente que las tablas y las pantallas del simulador, por lo que coinciden. Los textos citados son propuestos y editables; el cliente enviará los textos finales por correo."));
const figBlock = (f, alt) => { add(addFigure(f.spec, `figura-${f.id}`, alt || f.titulo)); add(caption(f.caption)); };
if (figSet.general) {
  const g = sow.diagrama_general;
  add(H2(g.titulo || "Orquestación entre los agentes"));
  if (g.descripcion) add(text(g.descripcion));
  figBlock(figSet.general);
}
for (const ag of agents) {
  add(H2(`${ag.id} · ${agLabel(ag)}`));
  if (ag.persona && (ag.persona.nombre || ag.persona.tono)) add(text(`Persona del agente: ${ag.persona.nombre ? "«" + ag.persona.nombre + "»" : ""}${ag.persona.tono ? ", tono " + ag.persona.tono : ""}${ag.persona.apelativo ? ", se dirige al usuario como «" + ag.persona.apelativo + "»" : ""}.`));
  const figs = figSet.porAgente[String(ag.id)] || [];
  if (figs.length > 1) {
    const det = figs.filter((f) => f.tipo === "etapa"), ho = figs.find((f) => f.tipo === "handoff");
    add(text(`El flujo tiene ${arr(ag.pasos).length} pasos y se presenta por partes para que sea legible: una visión general (${figs[0].id}), el detalle de cada etapa (${det.map((f) => f.id).join(", ")})${ho ? ` y el handoff común (${ho.id}), donde se resumen la derivación a un asesor y las salidas de error compartidas por varias etapas` : ""}. Los recuadros punteados indican en qué figura continúa o de cuál viene el flujo.`));
  }
  figs.forEach((f) => {
    figBlock(f, ag.nombre);
    if (f.tipo === "handoff") {
      const rec = arr(ag.pasos).filter((p) => p.tipo === "asesor" && arr(p.recibe).length).flatMap((p) => arr(p.recibe));
      if (rec.length) { add(text("Lo que recibe el asesor al tomar la conversación:", { keepNext: true })); [...new Set(rec)].forEach((r) => add(bullet(r))); }
    }
  });
  const staged = arr(ag.pasos).filter((p) => p.etapa);
  if (staged.length) {
    add(table(["#", "Etapa", "Descripción y texto propuesto"], staged.map((p, i) => {
      const parts = [];
      if (p.descripcion) parts.push(p.descripcion);
      if (p.componente) parts.push(`Componente: ${p.componente}.`);
      if (p.mensaje) parts.push(`«${p.mensaje}»`);
      if (arr(p.botones).length) parts.push("Botones: " + arr(p.botones).join(" · ") + ".");
      if (arr(p.lista).length) parts.push("Lista: " + arr(p.lista).join(" · ") + ".");
      const fm = C.formOf(p);
      if (fm) parts.push(`Formulario (${C.FORM_TOOL_LABEL[C.formTool(p)]}) «${fm.titulo || ""}»: ${arr(fm.campos).map((c) => c.etiqueta).join(", ")}.`);
      return [String(i + 1), p.etapa, parts.join(" ") || val(p.diagrama)];
    }), [6, 22, 72]));
  }
  const cnt = C.mainPathCounts(ag);
  if (cnt.pasos) add(text(`Camino principal: ${C.describeCounts(cnt)}.`, { italic: true, color: B.color_secundario, size: 18 }));
}

// Stories
if (arr(sow.historias).length) {
  add(H1("Historias de usuario"));
  add(text("Formato Como / Quiero / Para con criterios de aceptación verificables. Estas historias son la base del plan de pruebas (Test Plan)."));
  const hg = new Map();
  arr(sow.historias).forEach((h) => { const k = h.agente || "_"; if (!hg.has(k)) hg.set(k, []); hg.get(k).push(h); });
  for (const [k, list] of hg) {
    const ag = agents.find((a) => a.id === k);
    if (k !== "_") add(H2(ag ? agLabel(ag) : k));
    for (const h of list) {
      add(P(run(`${h.id}  ${h.titulo || ""}`, { sb: true }), { keepNext: true, before: 160, after: 60 }));
      add(labeled("Como", `${h.perfil}`)); add(labeled("Quiero", h.quiero)); add(labeled("Para", h.para));
      add(P(run("Criterios de aceptación", { sb: true }), { keepNext: true, after: 40 }));
      arr(h.criterios).forEach((c) => add(bullet(`Dado ${c.dado}, cuando ${c.cuando}, entonces ${c.entonces}.`)));
    }
  }
}

// Business rules
if (arr(sow.reglas).length) {
  add(H1("Reglas de negocio y lógicas particulares"));
  arr(sow.reglas).forEach((r) => {
    const vals = Object.entries(r.parametros || {}).map(([k, v]) => `${k.replace(/_/g, " ")}: ${v}`).join("; ");
    add(bullet([run(`${r.id} · ${r.titulo}: `, { sb: true }), run(`${r.descripcion}${r.si_no_cumple ? " Si no se cumple: " + r.si_no_cumple + "." : ""}${vals ? " (" + vals + ")" : ""}`)]));
  });
}

// Technical solution
if (arr((sow.solucion || {}).componentes).length) {
  add(H1("Solución técnica propuesta"));
  if (sow.solucion.descripcion) add(text(sow.solucion.descripcion));
  add(text("«Determinista» significa que la regla se ejecuta siempre igual; «conversacional» significa que la IA interpreta el lenguaje del usuario y puede variar la redacción."));
  add(table(["ID", "Capacidad", "Componente", "Detalle", "Ejecución", "Cubre"], sow.solucion.componentes.map((c) => [val(c.id), val(c.capacidad), val(c.componente), val(c.detalle), ({ determinista: "Determinista", conversacional: "Conversacional", mixto: "Mixto" })[c.ejecucion] || val(c.ejecucion), [...arr(c.cubre), ...arr(c.reglas)].join(", ") || "—"]), [6, 17, 18, 29, 14, 16]));
}

// Escalation and data
if (arr(sow.escalamiento).length) {
  add(H1("Escalamiento a agente humano"));
  add(table(["ID", "Cuándo", "Modo", "Destino y horario", "Fuera de horario"], sow.escalamiento.map((e) => [val(e.id), val(e.disparador), e.modo === "ofrecido" ? "Se ofrece al usuario" : "Automático", `${val(e.destino)}${e.horario ? " · " + e.horario : ""}`, val(e.fuera_de_horario)]), [8, 30, 14, 28, 20]));
}
if (arr(sow.datos).length) {
  add(H1("Datos que gestiona la solución"));
  add(table(["Entidad", "Uso", "Campos", "Retención"], sow.datos.map((d) => [val(d.entidad), val(d.uso), arr(d.campos).join(", "), val(d.retencion)]), [18, 30, 34, 18]));
}

// Integrations
add(H1("Integraciones"));
if (arr(sow.integraciones).length === 0) add(text("Este proyecto no requiere integraciones con sistemas externos."));
const connLabel = { directa: "Conexión directa al sistema", api_cliente: "API del cliente", middleware_jelou: "Capa intermedia construida y hospedada por Jelou", middleware_cliente: "Capa intermedia construida y hospedada por el cliente" };
arr(sow.integraciones).forEach((it, i) => {
  add(H2(`${i + 1}. ${it.nombre}${it.sistema ? " (" + it.sistema + ")" : ""}`));
  const rows = [["Propósito", val(it.proposito)]];
  if (it.endpoints) rows.push(["Endpoints", it.endpoints]);
  if (it.uso) rows.push(["Uso", it.uso]);
  rows.push(["Operaciones", arr(it.operaciones).map((o) => `${o.tipo === "escritura" ? "Escritura" : "Lectura"}: ${o.descripcion}`)]);
  rows.push(["Conexión", `${connLabel[it.conexion] || val(it.conexion)}${it.quien_hospeda ? " · " + it.quien_hospeda : ""}`]);
  rows.push(["Autenticación", val(it.autenticacion)]);
  if (it.estado_actual) rows.push(["Estado actual", it.estado_actual]);
  rows.push(["Documentación", val(it.documentacion)], ["Ambiente de pruebas", val(it.ambiente_pruebas)]);
  if (it.condicion) rows.push(["Condición", it.condicion]);
  rows.push(["Responsable", val(it.responsable_cliente)], ["Disponibilidad", val(it.disponibilidad)]);
  if (it.restricciones_red) rows.push(["Restricciones de red", it.restricciones_red]);
  rows.push(["Credenciales", "Se entregan por canal seguro y Jelou las almacena como secrets de la plataforma. No se incluyen en este documento."]);
  add(kvTable(rows, [24, 76]));
});

// Data map and validations
if (arr(sow.mapeo_datos).length) {
  add(H1("Propuesta de mapeo de datos a utilizar"));
  for (const m of sow.mapeo_datos) {
    const ag = agents.find((a) => a.id === m.agente);
    if (m.agente) add(H2(ag ? `${ag.id} · ${ag.nombre}` : m.agente));
    add(table(["Campo", "Aplica a", "Descripción", "Obligatorio"], arr(m.campos).map((c) => [val(c.campo), val(c.aplica), val(c.descripcion), val(c.obligatorio)]), [24, 22, 38, 16]));
  }
}
if (arr(sow.validaciones).length) {
  add(H1("Validaciones necesarias"));
  add(text("Las validaciones de formato se hacen en el formulario (WhatsApp Flow o WebView) antes de enviar (el error se corrige en el campo, sin volver al chat); las de negocio, contra la API del cliente."));
  add(table(["Campo o regla", "Validación", "Mensaje propuesto", "Aplica"], sow.validaciones.map((v) => [val(v.campo), val(v.validacion), val(v.mensaje), val(v.aplica)]), [18, 36, 32, 14]));
}

// Tests
if (arr(sow.pruebas).length) {
  add(H1("Criterios de aceptación y pruebas"));
  add(table(["ID", "Tipo", "Descripción", "Cubre"], sow.pruebas.map((p) => [val(p.id), val(p.tipo), val(p.descripcion), arr(p.cubre).join(", ") || "—"]), [8, 20, 56, 16]));
  add(text("Los criterios de aceptación de las historias de usuario son la base de la fase de pruebas: se construye una matriz de validación (Test Plan) con sus casos de prueba (Test Cases). Cada fase se da por aceptada cuando el cliente aprueba la UAT; las observaciones se reportan dentro del periodo de UAT y las correcciones que estén dentro del alcance se resuelven antes del pase a producción."));
}

// Effort
const eff = C.computeEffort(sow.esfuerzo);
if (eff.rows.length) {
  add(H1("Resumen de esfuerzo estimado (con apoyo de IA)"));
  add(text("Estimación de horas de trabajo con IA como apoyo en el borrador y revisión humana; son rangos orientativos y se calibran con horas reales."));
  add(table(["Entregable", "Tipo", "Cant.", "Horas (mín – máx)"], [
    ...eff.rows.map((r) => [r.entregable, r.etiqueta, String(r.cantidad), `${r.min} – ${r.max}`]),
    ["Gestión de proyecto", "", "", `${(eff.subMin * eff.gestionPct / 100).toFixed(1)} – ${(eff.subMax * eff.gestionPct / 100).toFixed(1)} (${eff.gestionPct}%)`],
    ["Total estimado", "", "", `${eff.totalMin.toFixed(1)} – ${eff.totalMax.toFixed(1)}`],
  ], [44, 24, 10, 22]));
  const quien = eff.personas === 1 ? "1 persona" : `${eff.personas} personas`;
  add(text(`Con ${quien} y ${eff.horasDia} horas productivas por día, la construcción equivale a ${eff.diasMin}–${eff.diasMax} días hábiles; el calendario lo determinan además las dependencias del cliente.`));
  const dp = C.dependencyPlan(sow);
  if (dp.sinFecha) {
    const hs = dp.hitosDependientes.map((h) => h.nombre).filter(Boolean);
    add(text(`${dp.sinHolgura ? `El cronograma suma ${dp.total} días hábiles y no tiene holgura: ` : ""}${dp.sinFecha === 1 ? "1 entregable del cliente todavía no tiene fecha límite" : `${dp.sinFecha} entregables del cliente todavía no tienen fecha límite`}${dp.diasDependientes ? `; ${dp.diasDependientes} de los ${dp.total} días hábiles (${hs.join(", ")}) dependen de ellos` : ""}. Un retraso en esos insumos mueve las fechas en la misma medida.`));
  }
}

// Schedule
add(H1("Entregables y cronograma"));
const sched = C.scheduleDates(sow.cronograma);
const totalDays = C.totalBusinessDays(sow.cronograma);
add(text(`Fechas tentativas en días hábiles${arr((sow.cronograma || {}).festivos).length ? " (feriados declarados considerados)" : ""}, sujetas a la firma del SOW y a la entrega de los insumos del cliente. El proyecto completo se ejecuta en ${totalDays} días hábiles${meta.excepcion_plazo ? "; excepción al plazo estándar de 20 días hábiles: " + meta.excepcion_plazo : ""}.`));
add(table(["Fase", "Entregable (hito) Jelou", "Descripción breve", "Días hábiles", "Fechas tentativas"], sched.map(({ hito: h, inicio, fin }) => [val(h.fase), val(h.nombre), val(h.entregable ? `${h.descripcion || ""}${h.descripcion ? ". " : ""}Entregable: ${h.entregable}` : h.descripcion), String(h.dias_habiles), inicio ? (h.dias_habiles > 1 ? `${C.fmtShort(inicio)} a ${C.fmtShort(fin)}` : C.fmtShort(inicio)) : "POR DEFINIR"]), [8, 24, 38, 10, 20]));
add(text("La distribución de las horas hombre se realiza dentro de los días hábiles. Un retraso en los insumos del cliente mueve las fechas en la misma medida."));

if (arr(sow.dependencias_cliente).length) {
  add(H2("Dependencias del cliente"));
  add(table(["Entregable del cliente", "Responsable", "Fecha límite"], sow.dependencias_cliente.map((d) => [val(d.item), val(d.responsable), d.fecha_limite && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha_limite) ? C.fmtShort(C.parseDate(d.fecha_limite)) : val(d.fecha_limite)]), [52, 28, 20]));
}

// Responsibilities
const resp = sow.responsabilidades;
if (resp && (arr(resp.jelou).length || arr(resp.cliente).length)) {
  add(H1("Responsabilidades"));
  const n = Math.max(arr(resp.jelou).length, arr(resp.cliente).length);
  add(table(["Jelou", meta.cliente || "Cliente"], Array.from({ length: n }, (_, i) => [arr(resp.jelou)[i] || "", arr(resp.cliente)[i] || ""]), [50, 50]));
}

// Assumptions and pending
add(H1("Supuestos y pendientes por confirmar"));
if (arr(al.supuestos).length) { add(H2("Supuestos")); arr(al.supuestos).forEach((s) => add(bullet(s))); }
if (arr(sow.preguntas_abiertas).length) {
  add(H2("Pendientes que el cliente y Jelou deben cerrar antes de firmar"));
  add(table(["Pendiente", "Responsable", "Bloquea"], sow.preguntas_abiertas.map((q) => [val(q.pregunta), val(q.responsable), q.bloquea ? "Sí" : "No"]), [64, 24, 12]));
}

// Security and risks
add(H1("Revisión de seguridad"));
if (arr(sow.revision_seguridad).length) add(table(["Aspecto de seguridad", "Revisado", "Mitigación"], sow.revision_seguridad.map((s) => [val(s.aspecto), val(s.revisado), val(s.mitigacion)]), [28, 12, 60]));
if (arr(sow.riesgos).length) {
  if (arr(sow.revision_seguridad).length) add(H2("Riesgos del proyecto"));
  add(table(["Riesgo", "Probabilidad", "Impacto", "Mitigación"], sow.riesgos.map((r) => [val(r.riesgo), val(r.probabilidad), val(r.impacto), val(r.mitigacion)]), [28, 12, 12, 48]));
}

// Optional: comparison against the bot already built (read-only)
if (arr(sow.desviaciones).length) {
  add(H1("Comparación con el bot existente"));
  add(text("Diferencias entre lo especificado en este documento y el bot que ya opera. Sirve para decidir qué se ajusta en el bot y qué se corrige en el SOW."));
  add(table(["ID", "Área", "Según el SOW", "En el bot actual", "Decisión"], sow.desviaciones.map((d) => [val(d.id), val(d.area), val(d.sow), val(d.bot), val(d.decision)]), [8, 14, 30, 30, 18]));
}

// Version control
add(H1("Control de versiones"));
add(text("Este documento requiere control de línea base. La versión inicial es la 1.0; las correcciones durante la revisión incrementan el segundo dígito (1.1, 1.2); una nueva línea base es la 2.0 o la 3.0. La aprobación del cliente se registra como estado del documento, no como número de versión."));
add(text(`Versión actual: ${val(meta.version)} · estado: ${draft ? "en revisión" : "aprobado"}.`));
if (arr(sow.cambios).length) {
  add(H2("Registro de cambios"));
  add(table(["ID", "Fecha", "Área", "Descripción", "Evidencia", "Impacto"], sow.cambios.map((c) => [val(c.id), c.fecha && /^\d{4}-\d{2}-\d{2}$/.test(c.fecha) ? C.fmtShort(C.parseDate(c.fecha)) : val(c.fecha), val(c.area), val(c.descripcion), val(c.evidencia), val(c.impacto)]), [8, 11, 12, 41, 14, 14]));
}
add(H2("Versiones del documento"));
add(table(["Fecha", "Versión", "Descripción", "Autor"], arr(sow.versiones).map((v) => [v.fecha && /^\d{4}-\d{2}-\d{2}$/.test(v.fecha) ? C.fmtShort(C.parseDate(v.fecha)) : val(v.fecha), val(v.version), val(v.descripcion), val(v.autor)]), [16, 10, 54, 20]));

// Signatures
add(H1("Firmas"));
add(text("Con su firma, las partes aprueban el alcance, las fases y los criterios de aceptación de este documento."));
const f = sow.firmas || {};
const sig = (p) => [`Nombre: ${val((p && p.nombre) || "POR COMPLETAR")}`, `Cargo: ${val((p && p.cargo) || "POR COMPLETAR")}`, "Firma: __________________", "Fecha: ____ / ____ / ______"];
add(table(["Por Jelou", `Por ${meta.cliente || "el cliente"}`], [[sig(f.jelou), sig(f.cliente)]], [50, 50]));

// ---------- assemble ----------
(async () => {
  const zip = await JSZip.loadAsync(fs.readFileSync(TPL));
  let doc = await zip.file("word/document.xml").async("string");
  doc = doc.replace("{{BODY}}", () => body.join(""));
  zip.file("word/document.xml", doc);

  let foot = await zip.file("word/footer1.xml").async("string");
  const footerText = ` · SOW ${meta.cliente || ""} · ${meta.proyecto ? String(meta.proyecto).slice(0, 70) : ""} · v${meta.version || ""}${draft ? " (en revisión)" : ""}`;
  foot = foot.replace("{{FOOTER_TEXT}}", () => esc(footerText));
  zip.file("word/footer1.xml", foot);

  if (figures.length) {
    let rels = await zip.file("word/_rels/document.xml.rels").async("string");
    const add = figures.map((fg, i) => `<Relationship Id="${fg.rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/fig${i + 1}.png"/>`).join("");
    rels = rels.replace("</Relationships>", add + "</Relationships>");
    zip.file("word/_rels/document.xml.rels", rels);
    figures.forEach((fg, i) => zip.file(`word/media/fig${i + 1}.png`, fg.buf, { createFolders: false }));
  }
  const core = zip.file("docProps/core.xml");
  if (core) {
    let c = await core.async("string");
    c = c.replace(/<dc:title>[^<]*<\/dc:title>/, `<dc:title>${esc("SOW " + (meta.cliente || "") + " - " + (meta.proyecto || ""))}</dc:title>`);
    zip.file("docProps/core.xml", c);
  }
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  fs.writeFileSync(outFile, buf);
  console.log(`Generated ${path.resolve(outFile)} (${buf.length} bytes, ${figures.length} diagram(s)${draft ? ", estado: en revisión" : ", estado: aprobado"}).`);
})();
