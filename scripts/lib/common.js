// Shared helpers for the SOW scripts: business-day dates, graph helpers, effort model.
const fs = require("fs");
const path = require("path");

const PL = require("./planificar");
const arr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

// ---------- pending markers ----------
const PENDING_RE = /(POR COMPLETAR|POR DEFINIR)/g;
const hasPending = (s) => /POR COMPLETAR|POR DEFINIR/.test(String(s || ""));

// ---------- status ----------
// Versioning follows the template convention: 1.0 is the initial version, corrections are 1.1/1.2, new baselines 2.0/3.0.
// Approval is a status, never a number: meta.estado is "en_revision" (default) or "aprobado".
const ESTADOS = ["en_revision", "aprobado"];
const estadoOf = (sow) => String(((sow && sow.meta) || {}).estado || "en_revision").toLowerCase();
const isDraft = (sow) => estadoOf(sow) !== "aprobado";

// ---------- dates (UTC, business days) ----------
function parseDate(s) { const [y, m, d] = String(s).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function fmtIso(d) { return d.toISOString().slice(0, 10); }
function fmtLong(d) {
  const meses = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  return `${d.getUTCDate()} de ${meses[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
}
function fmtShort(d) { return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`; }
function makeCalendar(festivos) {
  const fest = new Set(arr(festivos));
  const habil = (d) => { const w = d.getUTCDay(); return w !== 0 && w !== 6 && !fest.has(fmtIso(d)); };
  const nextBusiness = (d) => { const x = new Date(d); while (!habil(x)) x.setUTCDate(x.getUTCDate() + 1); return x; };
  const prevBusiness = (d) => { const x = new Date(d); x.setUTCDate(x.getUTCDate() - 1); while (!habil(x)) x.setUTCDate(x.getUTCDate() - 1); return x; };
  const endOfBlock = (from, n) => {
    let d = nextBusiness(from), c = 1;
    while (c < n) { d.setUTCDate(d.getUTCDate() + 1); if (habil(d)) c++; }
    return d;
  };
  return { habil, nextBusiness, prevBusiness, endOfBlock };
}
// Returns [{hito, inicio, fin}] for the milestones, consecutive business days.
function scheduleDates(cronograma) {
  const cr = cronograma || {};
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cr.inicio || "")) return arr(cr.hitos).map((h) => ({ hito: h, inicio: null, fin: null }));
  const cal = makeCalendar(cr.festivos);
  let cursor = parseDate(cr.inicio);
  return arr(cr.hitos).map((h) => {
    const ini = cal.nextBusiness(cursor);
    const fin = cal.endOfBlock(ini, Math.max(1, h.dias_habiles || 1));
    cursor = new Date(fin); cursor.setUTCDate(cursor.getUTCDate() + 1);
    return { hito: h, inicio: ini, fin };
  });
}
// Carriles de un hito (tareas con `carril`) con sus fechas: cada carril arranca al empezar el hito y sus tareas van en cadena.
function laneTasks(h) { return arr(h && h.tareas).filter((t) => t && t.carril); }
function laneDates(cronograma) {
  const cr = cronograma || {}; const rows = scheduleDates(cr); const cal = makeCalendar(cr.festivos); const out = new Map();
  rows.forEach(({ hito, inicio }) => {
    const ts = laneTasks(hito); if (!ts.length) return;
    const cursor = {}; const list = [];
    ts.forEach((t) => {
      const ini = inicio ? (cursor[t.carril] ? cal.nextBusiness(cursor[t.carril]) : inicio) : null;
      const fin = ini ? cal.endOfBlock(ini, Math.max(1, t.dias || 1)) : null;
      if (fin) { const n = new Date(fin); n.setUTCDate(n.getUTCDate() + 1); cursor[t.carril] = n; }
      list.push({ tarea: t, inicio: ini, fin });
    });
    out.set(hito, list);
  });
  return out;
}
const TOPE_DIAS_DEFECTO = 15; // tope calendario por defecto (días hábiles de punta a punta; la ruta crítica de los carriles en paralelo)
const totalBusinessDays = (cronograma) => arr((cronograma || {}).hitos).reduce((a, h) => a + (h.dias_habiles || 0), 0);

// ---------- step types ----------
// `webview` is kept as a backward-compatible alias of `formulario` (WhatsApp Flow or WebView, decision pending).
const canonType = (t) => (t === "webview" ? "formulario" : t);
const FORM_TOOLS = ["flows", "webview", "por_definir"];
const FORM_TOOL_LABEL = { flows: "WhatsApp Flow", webview: "WebView", por_definir: "WhatsApp Flow o WebView (por definir)" };
// The form definition lives in `formulario` (preferred) or `webview` (legacy): {titulo, boton, campos, herramienta}.
const formOf = (p) => (p && (p.formulario || p.webview)) || null;
const formTool = (p) => { const f = formOf(p) || {}; const h = String(p.herramienta || f.herramienta || "por_definir").toLowerCase(); return FORM_TOOLS.includes(h) ? h : "por_definir"; };

// ---------- agents and conversation graphs ----------
// Backward compatible: a v1 `flujo` becomes a single agent.
function getAgents(sow) {
  if (arr(sow.agentes).length) return sow.agentes;
  if (sow.flujo && arr(sow.flujo.pasos).length) {
    return [{ id: "A1", nombre: sow.meta && sow.meta.bot ? sow.meta.bot : "Agente", pasos: sow.flujo.pasos.map((p, i) => ({ id: "P" + (p.n || i + 1), tipo: p.tipo || "mensaje", etapa: p.accion, mensaje: p.resultado, integracion: p.integracion, reglas: p.reglas, siguiente: i < sow.flujo.pasos.length - 1 ? [{ a: "P" + (sow.flujo.pasos[i + 1].n || i + 2) }] : [] })) }];
  }
  return [];
}
const nodeById = (agent) => new Map(arr(agent.pasos).map((p) => [p.id, p]));
function mainPath(agent) {
  const byId = nodeById(agent);
  const out = []; const seen = new Set();
  let cur = arr(agent.pasos)[0];
  while (cur && !seen.has(cur.id)) {
    out.push(cur); seen.add(cur.id);
    const nx = arr(cur.siguiente)[0];
    cur = nx ? byId.get(nx.a) : null;
  }
  return out;
}
const botMessagesOnMainPath = (agent) => mainPath(agent).filter((p) => p.tipo === "mensaje").length;

// Counts the steps of the main path by kind: what the user actually goes through (not only bot messages).
function mainPathCounts(agent) {
  const c = { mensajes: 0, formularios: 0, sistemas: 0, decisiones: 0, pasos: 0 };
  for (const p of mainPath(agent)) {
    const t = canonType(p.tipo);
    c.pasos++;
    if (t === "mensaje") c.mensajes++;
    else if (t === "formulario") c.formularios++;
    else if (t === "api") c.sistemas++;
    else if (t === "decision") c.decisiones++;
  }
  return c;
}
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
function describeCounts(c) {
  const parts = [];
  if (c.mensajes) parts.push(plural(c.mensajes, "mensaje del bot", "mensajes del bot"));
  if (c.formularios) parts.push(plural(c.formularios, "formulario", "formularios"));
  if (c.sistemas) parts.push(plural(c.sistemas, "consulta a un sistema", "consultas a sistemas"));
  return parts.length ? parts.join(", ") : "sin pasos";
}

// ---------- client dependencies and the milestone that needs them ----------
const normTxt = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const dateOk = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ""));
// Milestone that needs a dependency: explicit `hito` (id or name) or inferred from the wording (default: the build milestone).
function milestoneFor(dep, hitos) {
  const hs = arr(hitos);
  if (!hs.length) return null;
  if (dep && dep.hito) {
    const k = normTxt(dep.hito);
    const f = hs.find((h) => normTxt(h.id) === k || normTxt(h.nombre) === k || normTxt(h.nombre).includes(k));
    if (f) return f;
  }
  const t = normTxt(`${(dep && dep.item) || ""}`);
  const byName = (re) => hs.find((h) => re.test(normTxt(h.nombre)));
  if (/(^|[^a-z])(uat|aprobacion|validacion final|acta)([^a-z]|$)/.test(t)) return byName(/uat|aceptaci/) || hs[hs.length - 1];
  if (/produccion|go.?live|pase a produccion/.test(t)) return byName(/producci|salida|activaci/) || hs[hs.length - 1];
  if (/firma|textos|contenido|definicion|alcance/.test(t)) return hs[0];
  return byName(/construcci/) || hs[0];
}
// For every dependency: the milestone that needs it and (when it has no date) a PROPOSED date: the last business day
// before that milestone starts (never earlier than cronograma.inicio). It is a suggestion for the lint report only.
function dependencyPlan(sow) {
  const cr = (sow && sow.cronograma) || {};
  const sched = scheduleDates(cr);
  const cal = makeCalendar(cr.festivos);
  const out = arr(sow && sow.dependencias_cliente).map((d, i) => {
    const h = milestoneFor(d, cr.hitos);
    const row = sched.find((x) => x.hito === h);
    const sinFecha = !dateOk(d.fecha_limite);
    let propuesta = null;
    if (sinFecha && row && row.inicio) {
      const ini = parseDate(cr.inicio);
      const prev = cal.prevBusiness(row.inicio);
      propuesta = fmtIso(prev < ini ? cal.nextBusiness(ini) : prev);
    }
    return { index: i, item: d.item, hito: h ? { id: h.id, nombre: h.nombre, dias: h.dias_habiles || 0 } : null, sinFecha, propuesta };
  });
  const total = totalBusinessDays(cr);
  const dep = new Map();
  out.filter((x) => x.sinFecha && x.hito).forEach((x) => dep.set(x.hito.id || x.hito.nombre, x.hito));
  const diasDependientes = [...dep.values()].reduce((a, h) => a + h.dias, 0);
  return { deps: out, total, sinHolgura: total >= TOPE_DIAS_DEFECTO, diasDependientes, hitosDependientes: [...dep.values()], sinFecha: out.filter((x) => x.sinFecha).length };
}

// ---------- effort model ----------
const DEFAULT_RATES = {
  workflow_simple: [0.5, 1.5], workflow_medio: [2, 4], workflow_complejo: [5, 10], function: [1.5, 3],
  webview_simple: [1.5, 3], webview_backend: [3, 6], flow_whatsapp: [1, 3], formulario: [1, 4], plantilla_hsm: [0.25, 0.5], kyc: [1.5, 3], pagos: [1.5, 3],
};
const TOPE_HORAS_DEFECTO = 72; // tope por defecto del esfuerzo total (incluye gestión); configurable con meta.tope_horas
function loadRates() {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(__dirname, "effort-rates.json"), "utf8"));
    const r = {};
    const labels = {};
    for (const [k, v] of Object.entries(j.rangos || {})) { r[k] = [v.min, v.max]; labels[k] = v.etiqueta || k.replace(/_/g, " "); }
    return { rangos: r, etiquetas: labels, gestion: j.gestion_pct || { min: 10, max: 20, defecto: 15 }, tope: j.tope_horas_defecto || TOPE_HORAS_DEFECTO };
  } catch (e) {
    return { rangos: DEFAULT_RATES, etiquetas: {}, gestion: { min: 10, max: 20, defecto: 15 }, tope: TOPE_HORAS_DEFECTO };
  }
}
function computeEffort(esfuerzo) {
  const { rangos, etiquetas, gestion } = loadRates();
  const e = esfuerzo || {};
  const plan = PL.planificar(e, rangos);
  const f = plan.factor;
  let min = 0, max = 0, minBase = 0, maxBase = 0; const rows = []; const unknown = [];
  arr(e.items).forEach((it, i) => {
    const r = rangos[it.tipo];
    if (!r) { unknown.push(it.tipo); return; }
    const q = it.cantidad || 1;
    const k = plan.construccion.has(i) ? f : 1; // el paralelismo solo reduce las horas de construcción
    rows.push({ entregable: it.entregable, tipo: it.tipo, etiqueta: (etiquetas && etiquetas[it.tipo]) || String(it.tipo).replace(/_/g, " "), cantidad: q, min: round1(r[0] * q * k), max: round1(r[1] * q * k), minBase: r[0] * q, maxBase: r[1] * q, nota: it.nota });
    min += r[0] * q * k; max += r[1] * q * k; minBase += r[0] * q; maxBase += r[1] * q;
  });
  const g = (e.gestion_pct == null ? (gestion.defecto == null ? 15 : gestion.defecto) : e.gestion_pct) / 100;
  const personas = e.personas || 1, horasDia = e.horas_dia || 6;
  const totalMin = min * (1 + g), totalMax = max * (1 + g);
  // días de construcción = ruta crítica (el carril más largo); sin carriles, horas de construcción / (personas x horas por día)
  const sinCarriles = !plan.carriles.length;
  const diasMin = sinCarriles ? Math.ceil(totalMin / (personas * horasDia)) : plan.diasConstruccionMin;
  const diasMax = sinCarriles ? Math.ceil(totalMax / (personas * horasDia)) : plan.diasConstruccionMax;
  return { rows, unknown, subMin: min, subMax: max, subMinBase: minBase, subMaxBase: maxBase, gestionPct: g * 100, totalMin, totalMax, totalMinBase: minBase * (1 + g), totalMaxBase: maxBase * (1 + g), personas, horasDia, diasMin, diasMax, paralelismo: plan };
}
const round1 = (x) => Math.round(x * 10) / 10;
// Tope de horas del proyecto (incluye gestión): meta.tope_horas o 72. Pendiente de confirmación de negocio: si la gestión cuenta dentro del tope.
const topeHoras = (sow) => { const t = Number(((sow && sow.meta) || {}).tope_horas); return Number.isFinite(t) && t > 0 ? t : loadRates().tope; };

// ---------- phase: pre-kickoff vs full SOW ----------
// meta.fase = "prekickoff" (default: SOW completo). build_all.js --modo prekickoff forces it.
const isPrekickoff = (sow) => String((((sow && sow.meta) || {}).fase) || "").toLowerCase() === "prekickoff";

// ---------- tests in the schedule (internal tests + client UAT) ----------
// A milestone is an internal-tests or UAT milestone by explicit hito.tipo ("pruebas_internas" | "uat") or by its name.
function milestoneKind(h) {
  const t = normTxt(h && h.tipo);
  if (t === "uat" || t === "pruebas_cliente") return "uat";
  if (t === "pruebas_internas" || t === "qa") return "pruebas_internas";
  const n = normTxt(h && h.nombre);
  if (/\buat\b|aceptaci|pruebas (con el |del |de )?cliente|validacion (del )?cliente|pruebas de aceptacion/.test(n)) return "uat";
  if (/prueba|\bqa\b|testing/.test(n) && !/cliente/.test(n)) return "pruebas_internas";
  return null;
}
const testMilestones = (sow) => {
  const hs = arr(((sow && sow.cronograma) || {}).hitos);
  return { internas: hs.filter((h) => milestoneKind(h) === "pruebas_internas"), uat: hs.filter((h) => milestoneKind(h) === "uat") };
};
// Date range of the UAT milestone computed from cronograma.inicio (null when there is no UAT milestone).
function uatWindow(sow) {
  const sched = scheduleDates((sow && sow.cronograma) || {});
  const row = sched.find((x) => milestoneKind(x.hito) === "uat");
  return row ? { hito: row.hito, inicio: row.inicio, fin: row.fin } : null;
}
// Draft clause (pending Legal review; flagged as such in the internal documents and in SKILL.md).
const UAT_CLAUSE = "Las pruebas del cliente (UAT) deben ejecutarse dentro de las fechas estipuladas en el cronograma. Si vencida la fecha de cierre de UAT el cliente no ha reportado observaciones por escrito, se entiende que el entregable fue probado y aceptado a conformidad y el proyecto se considera cerrado; las solicitudes posteriores se gestionan como control de cambios.";
const UAT_CLAUSE_LEGAL = "Redacción borrador: pendiente de revisión por Legal.";
// Clause with the real UAT closing date, for schedule and next-steps texts.
function uatClauseWithDate(sow) {
  const w = uatWindow(sow);
  return w && w.fin ? `${UAT_CLAUSE} Fecha de cierre de UAT: ${fmtShort(w.fin)}.` : UAT_CLAUSE;
}

// ---------- scope lock ----------
// alcance.base = scope frozen from the presales SOW/offer. Anything requested later goes to ampliaciones_solicitadas[]:
// estado "por_decidir" (not in scope; one open question to Comercial) | "aprobada_comercial" (needs a cambios row and cobro_adicional) | "rechazada".
const AMP_ESTADOS = ["por_decidir", "aprobada_comercial", "rechazada"];
const ampliaciones = (sow) => arr(sow && sow.ampliaciones_solicitadas);
const AMP_QUESTION = "¿Se debe tomar en cuenta este adicional? (requiere aprobación de Comercial y cobro adicional)";

// ---------- pre-kickoff activation threshold ----------
// Input: a presales SOW + first Diio turned into sow.json. Besides the team, ANY of: >=5 blocking open questions,
// integrations without documentation or QA environment, presales assumptions ([Supuesto]) not confirmed by the client.
const BLOQUEANTES_UMBRAL = 5;
function prekickoffThreshold(sow) {
  const isTeam = (q) => /equipo/.test(normTxt(q.tema || q.tipo || ""));
  const bloqueantes = arr(sow && sow.preguntas_abiertas).filter((q) => q.bloquea && !isTeam(q));
  const intSin = arr(sow && sow.integraciones).filter((it) => normTxt(it.documentacion) !== "si" || normTxt(it.ambiente_pruebas) !== "si");
  const supuestos = arr(((sow && sow.alcance) || {}).supuestos).filter((x) => !(x && typeof x === "object" && (x.confirmado_cliente === true || normTxt(x.estado) === "confirmado")));
  const razones = [];
  if (bloqueantes.length >= BLOQUEANTES_UMBRAL) razones.push(`${bloqueantes.length} preguntas abiertas que bloquean (umbral: ${BLOQUEANTES_UMBRAL})`);
  if (intSin.length) razones.push(`${intSin.length} integración(es) sin documentación o sin ambiente de pruebas: ${intSin.map((i) => i.id).join(", ")}`);
  if (supuestos.length) razones.push(`${supuestos.length} supuesto(s) de preventa sin confirmar por el cliente`);
  return { modo: razones.length ? "prekickoff" : "sow_completo", razones, cifras: { bloqueantes: bloqueantes.length, integraciones_sin_doc_o_qa: intSin.length, supuestos_sin_confirmar: supuestos.length }, umbral_bloqueantes: BLOQUEANTES_UMBRAL };
}

// ---------- ¿el cronograma / Gantt se generó o está pendiente, y por qué? ----------
// Nunca debe quedar en silencio: build_all.js lo imprime, entra en los faltantes internos y en la nota final.
// Devuelve { generado, motivos:[{motivo, desbloquea}], avisos:[...], resumen }.
function estadoCronograma(sow, opts = {}) {
  const s = sow || {}; const m = s.meta || {}; const cr = s.cronograma || {};
  const motivos = []; const avisos = [];
  const add = (motivo, desbloquea) => motivos.push({ motivo, desbloquea });
  const hitos = arr(cr.hitos); const items = arr((s.esfuerzo || {}).items);
  const aprobado = String(m.estado || "").toLowerCase() === "aprobado";
  const bloqueantes = arr(s.preguntas_abiertas).filter((q) => q.bloquea);
  const integ = arr(s.integraciones).filter((it) => normTxt(it.documentacion) !== "si" || normTxt(it.ambiente_pruebas) !== "si");
  const sinFecha = arr(s.dependencias_cliente).filter((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d.fecha_limite || ""));
  if (!aprobado) {
    add(isPrekickoff(s) ? "El SOW está en pre-kickoff: todavía no hay SOW cerrado." : "El SOW está en revisión (meta.estado = en_revision): las horas, las fechas y el Gantt solo se generan al aprobarlo.", "Aprobación del cliente (meta.estado = aprobado).");
    if (bloqueantes.length) add(`${bloqueantes.length} pregunta(s) abierta(s) que bloquean la aprobación.`, "Respuestas del cliente a las preguntas bloqueantes (lista de faltantes).");
    if (integ.length) add(`${integ.length} servicio(s) sin documentación o sin ambiente de pruebas: ${integ.map((i) => i.id || i.nombre).slice(0, 6).join(", ")}.`, "Documentación técnica y ambiente de pruebas del cliente (o avanzar con datos simulados según la cláusula del SOW).");
  }
  if (!hitos.length) add("No hay hitos en cronograma.hitos.", "Definir los hitos (planificación, construcción, pruebas internas, UAT, producción, cierre).");
  if (!items.length) add("No hay estimación de esfuerzo (esfuerzo.items).", "Completar esfuerzo.items para calcular horas y carriles.");
  if (aprobado && !/^\d{4}-\d{2}-\d{2}$/.test(cr.inicio || "")) add("Falta cronograma.inicio (fecha de firma o de arranque).", "Confirmar la fecha de firma o de inicio; con ella se calculan todas las fechas.");
  if (aprobado && sinFecha.length) avisos.push(`${sinFecha.length} dependencia(s) del cliente sin fecha límite: un retraso en esos insumos mueve el cronograma.`);
  if (opts.gantt === false) add(`El Gantt no se pudo generar${opts.motivoGantt ? ": " + opts.motivoGantt : ""}.`, "Instalar Python con openpyxl y reintentar (python scripts/cronograma.py).");
  const generado = motivos.length === 0;
  const resumen = generado ? "Cronograma: generado (tabla con fechas, carriles en paralelo y Gantt)." : "Cronograma: PENDIENTE";
  return { generado, motivos, avisos, resumen };
}
const textoEstadoCronograma = (e) => [e.resumen, ...e.motivos.map((x) => `  • ${x.motivo} → Desbloquea: ${x.desbloquea}`), ...e.avisos.map((a) => `  · Aviso: ${a}`)].join("\n");

module.exports = { laneTasks, laneDates, loadRates, TOPE_DIAS_DEFECTO, estadoCronograma, textoEstadoCronograma, isPrekickoff, milestoneKind, testMilestones, uatWindow, UAT_CLAUSE, UAT_CLAUSE_LEGAL, uatClauseWithDate, AMP_ESTADOS, ampliaciones, AMP_QUESTION, prekickoffThreshold, TOPE_HORAS_DEFECTO, topeHoras, normTxt, canonType, FORM_TOOLS, FORM_TOOL_LABEL, formOf, formTool, mainPathCounts, describeCounts, dependencyPlan, dateOk, ESTADOS, estadoOf, isDraft, arr, PENDING_RE, hasPending, parseDate, fmtIso, fmtLong, fmtShort, makeCalendar, scheduleDates, totalBusinessDays, getAgents, nodeById, mainPath, botMessagesOnMainPath, loadRates, computeEffort };
