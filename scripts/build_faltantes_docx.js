#!/usr/bin/env node
// Builds the two "faltantes" Word documents of the pre-kickoff mode from sow.json (same Poppins/letterhead template as the SOW):
//   <base>-faltantes-cliente.docx   business language: what the client must deliver or decide, owner and date.
//   <base>-faltantes-interno.docx   for Jelou only: capability checks, presales doubts, assumptions, additionals for Comercial,
//                                   changes versus presales, team data, the UAT clause pending Legal review.
// Usage: node build_faltantes_docx.js sow.json out-dir base-name
const fs = require("fs");
const path = require("path");
const C = require("./lib/common");
const K = require("./lib/wordxml");
const { arr } = C;
const { run, P, text, H1, H2, bullet, table, kvTable, val } = K;

const [, , inFile, outDir, baseName] = process.argv;
if (!inFile || !outDir) { console.error("Usage: node build_faltantes_docx.js sow.json out-dir base-name"); process.exit(2); }
const sow = JSON.parse(fs.readFileSync(inFile, "utf8"));
const meta = sow.meta || {};
const base = baseName || `SOW-${String(meta.cliente || "cliente").replace(/\W+/g, "-")}-v${meta.version || "1.0"}`;
const fechaDoc = (d) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? C.fmtShort(C.parseDate(d)) : val(d || "POR DEFINIR"));
const qs = arr(sow.preguntas_abiertas);
const audience = (q) => q.audiencia || "cliente";
const yesNo = (b) => (b ? "Sí" : "No");
const cover = (title, subtitle, extra) => [
  P(run(title), { style: "Title" }),
  P(run(subtitle), { style: "Subtitle" }),
  kvTable([
    ["Cliente", val(meta.cliente)], ["Proyecto", val(meta.proyecto)], ["Versión", `${val(meta.version)} · fase previa al SOW (pre-kickoff)`],
    ["Fecha", meta.fecha ? C.fmtShort(C.parseDate(meta.fecha)) : "POR COMPLETAR"], ["Preparado por", val(meta.autor || "POR COMPLETAR")], ...(extra || []),
  ]),
];

// ---------- client version ----------
function clientDoc() {
  const body = [];
  const add = (x) => (Array.isArray(x) ? x : [x]).forEach((y) => body.push(y));
  add(cover("Documento de faltantes", `Lo que necesitamos de ${meta.cliente || "su equipo"} para cerrar el alcance`));
  add(H1("Para qué sirve este documento"));
  add(text("Antes de emitir el documento de alcance (SOW) necesitamos cerrar algunos puntos con ustedes. Aquí está, en lenguaje de negocio, qué necesitamos, quién lo entrega y para cuándo. El alcance acordado en la propuesta inicial no cambia con este documento."));

  const deps = arr(sow.dependencias_cliente);
  add(H1("Qué necesitamos que nos entreguen"));
  if (deps.length) add(table(["#", "Qué necesitamos", "Responsable", "Fecha"], deps.map((d, i) => [String(i + 1), d.item, val(d.responsable || "POR COMPLETAR"), fechaDoc(d.fecha_limite)]), [6, 56, 20, 18]));
  else add(text("Por ahora no hay entregables pendientes registrados."));

  const cq = qs.filter((q) => audience(q) === "cliente" && q.tipo !== "equipo");
  add(H1("Decisiones y respuestas que necesitamos"));
  if (cq.length) {
    const groups = new Map();
    cq.forEach((q) => { const k = q.etapa || "General"; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(q); });
    for (const [k, list] of groups) {
      add(H2(k));
      add(table(["Pregunta", "¿Frena el SOW?", "Responsable", "Respuesta del cliente"], list.map((q) => [q.pregunta, yesNo(q.bloquea), val(q.responsable || meta.cliente), ""]), [52, 12, 16, 20]));
    }
  } else add(text("No hay preguntas abiertas para el cliente."));

  const team = arr(sow.equipo).filter((e) => !/jelou/i.test(e.organizacion || ""));
  add(H1("Datos del equipo del cliente"));
  add(text("Necesitamos nombre, cargo y correo de estas personas para coordinar el trabajo:"));
  add(table(["Rol", "Responsabilidad", "Nombre y correo"], (team.length ? team : [{ rol: "Sponsor / decisor" }, { rol: "Responsable técnico" }, { rol: "Responsable de negocio" }]).map((e) => [val(e.cargo || e.rol), val(e.responsabilidad || ""), e.nombre && !C.hasPending(e.nombre) ? `${e.nombre}${e.correo ? " · " + e.correo : ""}` : "POR COMPLETAR"]), [28, 40, 32]));

  if (C.testMilestones(sow).uat.length || !arr((sow.cronograma || {}).hitos).length) {
    add(H1("Fechas de las pruebas del cliente (UAT)"));
    add(text(C.uatClauseWithDate(sow)));
  }
  return body;
}

// ---------- internal version ----------
function internalDoc() {
  const body = [];
  const add = (x) => (Array.isArray(x) ? x : [x]).forEach((y) => body.push(y));
  add(cover("Faltantes internos de Jelou", "Documento INTERNO: no compartir con el cliente", [["Uso", "Interno de Jelou (comercial, preventa, implementación)"]]));
  const th = C.prekickoffThreshold(sow);
  add(H1("Por qué estamos en pre-kickoff"));
  add(text(th.modo === "prekickoff" ? "Se cumple al menos una condición de la regla de activación: no se construye aún el SOW completo." : "No se cumple ninguna condición de la regla de activación (el contexto sería suficiente para el SOW completo)."));
  th.razones.forEach((r) => add(bullet(r)));
  add(text(`Cifras: ${th.cifras.bloqueantes} preguntas bloqueantes (umbral ${th.umbral_bloqueantes}), ${th.cifras.integraciones_sin_doc_o_qa} integración(es) sin documentación o ambiente de pruebas, ${th.cifras.supuestos_sin_confirmar} supuesto(s) sin confirmar.`));

  const mine = (types) => qs.filter((q) => audience(q) === "interna" && types.includes(q.tipo || "capacidad"));
  const capQ = mine(["capacidad", "tecnica"]);
  add(H1("Lo que Jelou debe cerrar"));
  add(H2("Capacidades de la plataforma por verificar"));
  add(capQ.length ? table(["Qué verificar", "Responsable", "Bloquea"], capQ.map((q) => [q.pregunta, val(q.responsable || "POR COMPLETAR"), yesNo(q.bloquea)]), [64, 24, 12]) : text("Ninguna pendiente."));
  const preQ = mine(["preventa"]);
  add(H2("Dudas sobre el alcance de preventa"));
  add(preQ.length ? table(["Duda", "Responsable", "Bloquea"], preQ.map((q) => [q.pregunta, val(q.responsable || "POR COMPLETAR"), yesNo(q.bloquea)]), [64, 24, 12]) : text("Ninguna pendiente."));
  const otherQ = qs.filter((q) => audience(q) === "interna" && !["capacidad", "tecnica", "preventa", undefined].includes(q.tipo));
  if (otherQ.length) { add(H2("Otras preguntas internas")); add(table(["Pregunta", "Responsable"], otherQ.map((q) => [q.pregunta, val(q.responsable || "POR COMPLETAR")]), [76, 24])); }

  add(H2("Supuestos de preventa por confirmar con el cliente"));
  const sup = arr((sow.alcance || {}).supuestos).filter((a) => !(typeof a === "object" && (a.confirmado_cliente === true || a.estado === "confirmado")));
  if (sup.length) sup.forEach((a) => add(bullet(typeof a === "object" ? a.texto : a))); else add(text("Todos confirmados."));

  add(H1("Adicionales detectados (requieren Comercial)"));
  const amps = C.ampliaciones(sow);
  add(text("El alcance se congela en lo vendido en preventa. Cada adicional que aparece en reuniones posteriores NO entra al alcance: se registra, se convierte en UNA pregunta para Comercial y solo se incorpora si Comercial lo aprueba y se cobra aparte."));
  if (amps.length) add(table(["ID", "Adicional", "Origen", "Estado", "Pregunta para Comercial"], amps.map((a) => [a.id, a.descripcion, val(a.origen), ({ por_decidir: "Por decidir", aprobada_comercial: "Aprobada por Comercial", rechazada: "Rechazada" })[a.estado] || a.estado, a.estado === "por_decidir" ? `${C.AMP_QUESTION}` : (a.nota || "—")]), [8, 34, 20, 14, 24]));
  else add(text("No se detectaron adicionales."));

  add(H1("Cambios respecto a preventa (a confirmar; no son decisiones)"));
  const chg = arr(sow.cambios_respecto_preventa);
  if (chg.length) add(table(["ID", "Tema", "Preventa decía", "Reunión posterior dijo", "Pregunta"], chg.map((c) => [c.id, c.tema, val(c.preventa), val(c.diio), val(c.pregunta)]), [8, 18, 28, 28, 18]));
  else add(text("Ninguno detectado."));

  const alerts = arr(sow.alertas_internas);
  if (alerts.length) { add(H1("Alertas internas")); alerts.forEach((a) => add(bullet(a))); }

  add(H1("Integraciones: estado de documentación y ambiente"));
  add(arr(sow.integraciones).length ? table(["Integración", "Responsable del cliente", "Documentación", "Ambiente de pruebas"], arr(sow.integraciones).map((i) => [i.nombre, val(i.responsable_cliente || "POR COMPLETAR"), val(i.documentacion), val(i.ambiente_pruebas)]), [34, 26, 20, 20]) : text("Sin integraciones."));

  add(H1("Equipo de Jelou: datos por completar"));
  add(table(["Rol", "Nombre", "Responsabilidad"], arr(sow.equipo).filter((e) => /jelou/i.test(e.organizacion || "")).map((e) => [val(e.cargo || e.rol), val(e.nombre || "POR COMPLETAR"), val(e.responsabilidad)]), [28, 30, 42]));
  add(text("Los nombres que aparecen en reuniones o tareas son propuestas hasta que el responsable confirme el equipo."));

  add(H1("Cronograma y Gantt: estado"));
  {
    const ec = C.estadoCronograma(sow);
    add(text(ec.generado ? "El cronograma con fechas y el Gantt están generados." : "El cronograma con fechas y el Gantt todavía NO se generan. Esto es lo que falta, y qué lo desbloquea:"));
    ec.motivos.forEach((x) => add(bullet(`${x.motivo} Desbloquea: ${x.desbloquea}`)));
    ec.avisos.forEach((a) => add(bullet(a)));
    add(text(`Tope de calendario: ${C.TOPE_DIAS_DEFECTO} días hábiles de punta a punta (ruta crítica; el trabajo en paralelo, máximo 3 carriles, cuenta como el carril más largo).`));
  }

  add(H1("Cláusula de UAT: borrador pendiente de revisión por Legal"));
  add(text(C.UAT_CLAUSE));
  add(text(C.UAT_CLAUSE_LEGAL));
  add(text(`Tope de esfuerzo por defecto: ${C.topeHoras(sow)} h incluida la gestión (pendiente de confirmación de negocio sobre si la gestión cuenta dentro del tope).`));
  return body;
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const jobs = [["cliente", clientDoc, "Faltantes (cliente)"], ["interno", internalDoc, "Faltantes (interno)"]];
  for (const [k, fn, label] of jobs) {
    K.figures.length = 0;
    const out = path.join(outDir, `${base}-faltantes-${k}.docx`);
    const r = await K.assemble(fn(), out, { footerText: ` · ${label} · ${meta.cliente || ""} · v${meta.version || ""}${k === "interno" ? " · USO INTERNO" : ""}`, title: `${label} - ${meta.cliente || ""} - ${meta.proyecto || ""}` });
    console.log(`Generated ${path.resolve(out)} (${r.buf.length} bytes).`);
  }
})();
