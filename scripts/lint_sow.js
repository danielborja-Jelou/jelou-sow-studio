#!/usr/bin/env node
// Deterministic linter for sow.json. Usage: node lint_sow.js sow.json [--json] [--modo prekickoff]
// Exit code 1 when there are errors; warnings do not change the exit code.
// Pre-kickoff mode (meta.fase = "prekickoff" or --modo prekickoff): the document is a partial sow.json used to build the
// pre-kickoff deck and the "faltantes" documents. Sections only the full SOW needs are not required and pending values are
// expected, but credentials, graph integrity, contradictions, scope lock and the diagram rules are still checked.
// The SOW content is Spanish, so the keyword patterns below match Spanish text.
const fs = require("fs");
const C = require("./lib/common");

const file = process.argv.slice(2).find((a) => !a.startsWith("--") && a !== "prekickoff");
if (!file) {
  console.error("Usage: node lint_sow.js sow.json [--json]");
  process.exit(2);
}
let sow;
try {
  sow = JSON.parse(fs.readFileSync(file, "utf8"));
} catch (e) {
  console.error("Could not read the JSON: " + e.message);
  process.exit(2);
}

const modoArg = (() => { const i = process.argv.indexOf("--modo"); return i >= 0 ? process.argv[i + 1] : process.argv.find((a) => a.startsWith("--modo="))?.split("=")[1]; })();
const prek = C.isPrekickoff(sow) || modoArg === "prekickoff";
const findings = [];
const err = (code, where, msg) => findings.push({ level: "ERROR", code, where, msg });
const warn = (code, where, msg) => findings.push({ level: "WARN", code, where, msg });
// BLOCKING findings: an ERROR when meta.estado is "aprobado", a highlighted warning (blocking: true) while it is en_revision.
const block = (code, where, msg) => findings.push({ level: C.isDraft(sow) ? "WARN" : "ERROR", blocking: true, code, where, msg });

const arr = (x) => (Array.isArray(x) ? x : []);
const errP = (...a) => (prek ? warn : err)(...a); // client deliverables still missing are expected (warnings) in pre-kickoff
const PLACEHOLDER = /POR DEFINIR|POR COMPLETAR|\bTBD\b|\bTODO\b|\[\s*(?:completar|nombre|fecha|xxx)[^\]]*\]|\.\.\.\.|\bxxx\b/;
const VAGUE = /\b(correctamente|adecuadamente|apropiad[oa]s?|razonables?|r[aá]pid[oa]s?|f[aá]cil(?:mente)?|amigable|seguro|eficientemente|bien|etc\.?)\b/i;
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

// ---------- helpers ----------
function walk(node, path, cb) {
  if (typeof node === "string") cb(node, path);
  else if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}[${i}]`, cb));
  else if (node && typeof node === "object")
    for (const [k, v] of Object.entries(node)) walk(v, path ? `${path}.${k}` : k, cb);
}
// Approval is a status, not a version number: the template starts at 1.0 and meta.estado is "en_revision" | "aprobado".
const isDraft = () => C.isDraft(sow);

// ---------- 1. credentials and secrets ----------
const CRED_PATTERNS = [
  [/(contrase(?:ñ|n)a|password|passwd|clave|pwd)\s*[:=]\s*\S{3,}/i, "password"],
  [/(api[\s_-]?key|apikey|secret|secreto|token|client[\s_-]?secret)\s*[:=]\s*\S{6,}/i, "key or secret"],
  [/\bbearer\s+[A-Za-z0-9._\-]{16,}/i, "bearer token"],
  [/\b(usuario|user|username)\s*[:=]\s*\S+@\S+/i, "integration user"],
  [/\b[A-Za-z0-9+/_\-]{32,}={0,2}\b/, "long key-like string"],
  [/\b(?:db|sk|pk|key)_[A-Za-z0-9]{12,}/i, "prefixed key"],
];
walk(sow, "", (s, path) => {
  for (const [re, label] of CRED_PATTERNS) {
    if (re.test(s)) {
      err("CRED", path, `Possible ${label} in plain text. Credentials never go in the SOW: they are delivered through a secure channel and stored as platform secrets.`);
      break;
    }
  }
});

// ---------- 2. required sections ----------
const need = (cond, code, where, msg) => { if (!cond) err(code, where, msg); };
const m = sow.meta || {};
need(m.proyecto && m.cliente && m.version && m.fecha, "META", "meta", "Missing project, client, version or date.");
need(arr([].concat(sow.brief || [])).length > 0 && String([].concat(sow.brief).join("")).trim().length > 40, "BRIEF", "brief", "The brief is empty or too short.");
need(sow.objetivos && sow.objetivos.general && arr(sow.objetivos.especificos).length > 0, "OBJ", "objetivos", "Missing the general objective or the specific objectives.");
const al = sow.alcance || {};
const needFull = (cond, code, where, msg) => { if (!prek) need(cond, code, where, msg); };
needFull(arr(al.incluido_usuario).length > 0, "SCOPE", "alcance.incluido_usuario", "There are no end-user features.");
needFull(arr(al.fuera_de_alcance).length > 0, "OOS", "alcance.fuera_de_alcance", "Out of scope is mandatory: list what will NOT be done.");
const agents = C.getAgents(sow);
need(agents.length > 0 && agents.every((a) => arr(a.pasos).length > 0), "FLOW", "agentes", "There are no agents with flow steps (agentes[].pasos).");
needFull(arr(sow.reglas).length > 0, "RULES", "reglas", "There are no business rules.");
needFull(arr(sow.historias).length > 0, "STORY", "historias", "There are no user stories.");
need(arr(sow.integraciones).length > 0 || sow.sin_integraciones === true, "INT", "integraciones", "Declare integrations or set sin_integraciones: true.");
needFull(arr(sow.escalamiento).length > 0, "ESC", "escalamiento", "There are no escalation-to-human rules.");
needFull(arr((sow.cronograma || {}).hitos).length > 0, "SCHED", "cronograma.hitos", "There are no schedule milestones.");
needFull(arr(sow.riesgos).length > 0, "RISK", "riesgos", "There is no risk matrix.");
needFull(arr(sow.versiones).length > 0, "VERS", "versiones", "Version control is missing.");
if (prek && String(m.estado || "").toLowerCase() === "aprobado") err("VERS", "meta.estado", "A pre-kickoff document cannot be 'aprobado': approval belongs to the full SOW.");
if (prek && !arr(sow.preguntas_abiertas).length) warn("PREK", "preguntas_abiertas", "A pre-kickoff needs the open questions (they feed the validation slides and the faltantes documents).");

// ---------- 3. operating parameters ----------
const par = sow.parametros || {};
for (const k of ["horario_bot", "horario_agentes", "fuera_de_horario", "idioma_tono", "reintentos", "retencion_datos", "identificacion_telefono", "datos_de_prueba"]) {
  if (!par[k] && !prek) warn("PARAM", `parametros.${k}`, `Missing operating parameter "${k}" (a decision that usually gets discovered while building).`);
}
// Only rule text (not keys) and whole words: "valor" or "salario" alone do not mean the bot handles money.
const monetary = arr(sow.reglas).map((r) => `${r.titulo || ""} ${r.descripcion || ""} ${r.si_no_cumple || ""}`).join(" ")
  .match(/\b(montos?|precios?|pagos?|cobros?|iva|cupos?|tarifas?|descuentos?)\b/i);
if (monetary && !prek) for (const k of ["moneda", "impuestos"]) if (!par[k]) warn("PARAM", `parametros.${k}`, `The SOW handles amounts but "${k}" is missing.`);

// ---------- 4. IDs and references ----------
const ids = (list, key = "id") => new Set(arr(list).map((x) => x[key]));
const ruleIds = ids(sow.reglas);
const intIds = ids(sow.integraciones);
const storyIds = ids(sow.historias);
for (const [name, list] of [["reglas", sow.reglas], ["integraciones", sow.integraciones], ["historias", sow.historias], ["escalamiento", sow.escalamiento], ["pruebas", sow.pruebas], ["fuera_de_alcance", al.fuera_de_alcance]]) {
  const seen = new Set();
  arr(list).forEach((x, i) => {
    if (!x.id) err("ID", `${name}[${i}]`, "Missing id.");
    else if (seen.has(x.id)) err("ID", `${name}[${i}]`, `Duplicate ID ${x.id}.`);
    seen.add(x.id);
  });
}

const usedRules = new Set();
const usedInts = new Set();
// `formulario` = form inside WhatsApp (WhatsApp Flow or WebView, decision pending: field herramienta); `webview` is a backward-compatible alias.
const NODE_TYPES = ["usuario", "mensaje", "router", "formulario", "webview", "api", "decision", "asesor", "tercero", "fin"];
const FIELD_TYPES = ["texto", "correo", "selector", "archivo", "casilla", "numero", "fecha", "telefono"];
const v2 = arr(sow.agentes).length > 0;
const agentIds = new Set(agents.map((a) => a.id));
const nodeText = (p) => [p.etapa, p.diagrama, p.mensaje, p.descripcion, p.accion, p.resultado].filter(Boolean).join(" ");
agents.forEach((ag, ai) => {
  const aw = `agentes[${ai}]`;
  const ids_ = new Set();
  arr(ag.pasos).forEach((p, i) => {
    const w = `${aw}.pasos[${i}]`;
    if (!p.id) err("FLOW", w, "Step without id.");
    else if (ids_.has(p.id)) err("FLOW", w, `Duplicate step id ${p.id}.`);
    ids_.add(p.id);
    if (v2 && !NODE_TYPES.includes(p.tipo)) err("FLOW", w, `${p.id}: tipo must be one of ${NODE_TYPES.join(", ")}.`);
    if (p.integracion) {
      usedInts.add(p.integracion);
      if (!intIds.has(p.integracion)) err("REF", w, `Integration does not exist: ${p.integracion}.`);
    }
    if (v2 && p.tipo === "api" && !p.integracion) err("FLOW", w, `${p.id}: an api step must reference an integration (integracion).`);
    arr(p.reglas).forEach((r) => { usedRules.add(r); if (!ruleIds.has(r)) err("REF", w, `Rule does not exist: ${r}.`); });
    // componente = the "→" tag of a Pre-Sales design bullet (Determinístico | Flows | IA conversacional | PMA | API (WS#n)).
    if (/\bapi\b|ws#\d+/i.test(p.componente || "") && !p.integracion)
      err("FLOW", w, `${p.id}: tagged "${p.componente}" but has no "integracion". Link it to its INT-… entry.`);
  });
});
// Agents that come from a design document are named exactly "Flujo_N: <Nombre>", in order.
{
  const flows = agents.map((a, i) => ({ a, i, m: /^Flujo_(\d+)\s*:/.exec(String(a.nombre || "")) })).filter((x) => x.m);
  if (flows.length && flows.length < agents.length)
    warn("FLOW", "agentes", `${agents.length - flows.length} agent(s) are not named "Flujo_N: <Nombre>" while others are. Keep the design's flow names exactly (or none).`);
  flows.forEach((x, k) => { if (Number(x.m[1]) !== k + 1) warn("FLOW", `agentes[${x.i}]`, `Flows must follow the design order: expected Flujo_${k + 1}, found Flujo_${x.m[1]}.`); });
  // A WS#n of the design must be INT-n.
  arr(sow.integraciones).forEach((it, i) => {
    const m = /WS#(\d+)/.exec(String(it.nombre || ""));
    if (m && it.id !== `INT-${m[1]}`) warn("INT", `integraciones[${i}]`, `"${it.nombre}" is WS#${m[1]} in the design: use id INT-${m[1]}.`);
  });
}
const coveredRules = new Set();
arr(sow.historias).forEach((h, i) => {
  const w = `historias[${i}]`;
  if (!h.quiero || !h.para || !h.perfil) err("STORY", w, "The story needs perfil, quiero and para.");
  if (arr(h.criterios).length === 0) err("STORY", w, "The story has no acceptance criteria.");
  arr(h.criterios).forEach((c, j) => {
    if (!c.dado || !c.cuando || !c.entonces) err("STORY", `${w}.criterios[${j}]`, "The criterion needs dado, cuando and entonces.");
    else if (VAGUE.test(c.entonces) || c.entonces.trim().split(/\s+/).length < 4)
      warn("STORY", `${w}.criterios[${j}]`, `The "entonces" is vague or too short ("${c.entonces.slice(0, 60)}"). Say what is shown, created or sent, with a figure, state or concrete message.`);
  });
  if (v2 && h.agente && !agentIds.has(h.agente)) err("REF", w, `Agent does not exist: ${h.agente}.`);
  arr(h.reglas).forEach((r) => { coveredRules.add(r); if (!ruleIds.has(r)) err("REF", w, `Rule does not exist: ${r}.`); });
});
arr(sow.reglas).forEach((r, i) => {
  if (!coveredRules.has(r.id) && !prek) warn("COVERAGE", `reglas[${i}]`, `Rule ${r.id} is not covered by any story (it has no acceptance criterion).`);
  if (!usedRules.has(r.id) && !coveredRules.has(r.id) && !prek) warn("COVERAGE", `reglas[${i}]`, `Rule ${r.id} is used neither in the flow nor in stories.`);
  if (!r.descripcion) err("RULES", `reglas[${i}]`, `Rule ${r.id} has no description.`);
  const p = r.parametros || {};
  if (!r.si_no_cumple) warn("RULES", `reglas[${i}]`, `Rule ${r.id} does not say what happens if it is NOT met (reject, adjust automatically, retry, escalate or end). Each bot resolves it differently if it is not written.`);
  if (VAGUE.test(r.descripcion || "") && !/\d/.test(r.descripcion || "") && !Object.keys(p).length)
    warn("RULES", `reglas[${i}]`, `Rule ${r.id} uses vague language with no figures or conditions: it cannot be tested.`);
  const kMin = Object.keys(p).find((k) => /^(min|minimo|desde|total_desde)/.test(k) && typeof p[k] === "number");
  const kMax = Object.keys(p).find((k) => /^(max|maximo|hasta|total_hasta)/.test(k) && typeof p[k] === "number");
  if (kMin && kMax) {
    if (p[kMin] >= p[kMax]) err("RULES", `reglas[${i}]`, `Rule ${r.id} has ${kMin} >= ${kMax}.`);
    warn("RULES", `reglas[${i}]`, `Rule ${r.id} defines a range (${p[kMin]}–${p[kMax]}): write what happens below, inside and above it, and whether the endpoints are included (exactly ${p[kMin]}? exactly ${p[kMax]}?).`);
  }
});

arr(sow.pruebas).forEach((p, i) => {
  arr(p.cubre).forEach((h) => { if (!storyIds.has(h)) err("REF", `pruebas[${i}]`, `Story does not exist: ${h}.`); });
});
const tested = new Set(arr(sow.pruebas).flatMap((p) => arr(p.cubre)));
arr(sow.historias).forEach((h) => { if (arr(sow.pruebas).length && !tested.has(h.id)) warn("COVERAGE", "pruebas", `Story ${h.id} has no test.`); });
if (arr(sow.pruebas).length === 0 && !prek) warn("TESTS", "pruebas", "No tests are defined.");

// ---------- 4b. technical solution ----------
const sol = arr((sow.solucion || {}).componentes);
if (sol.length === 0 && !prek) warn("SOLUTION", "solucion", "The technical solution is missing: which Jelou component delivers each feature (see references/how-jelou-bots-work.md).");
const featureIds = new Set([...arr(al.incluido_usuario), ...arr(al.incluido_admin)].map((f) => f.id));
const coveredFeatures = new Set();
const deterministicRules = new Set();
const conversationalRules = new Set();
sol.forEach((c, i) => {
  const w = `solucion.componentes[${i}]`;
  if (!c.componente || !c.capacidad) err("SOLUTION", w, "The component needs capacidad and componente.");
  // Tool choice must be explicit (see references/catalogo-jelou.md): a bare "webview" or "lambda" hides who builds and hosts it.
  const compTxt = norm(`${c.componente || ""} ${c.detalle || ""}`);
  if (/webview|web view/.test(compTxt) && !/shop|webview studio|jelou sites|\bsites\b|kyc|biometr|pago|payment|proveedor|whatsapp flow/.test(compTxt))
    warn("SOLUTION", w, `${c.id || i}: says "webview" without saying which one (Jelou Shop, Webview Studio, Jelou Sites, KYC webview or a payment provider's checkout). Each one changes who builds it, effort and security.`);
  if (/lambda/.test(compTxt) && !/jelou functions|aws|existente|cliente|minitools/.test(compTxt))
    warn("SOLUTION", w, `${c.id || i}: mentions a Lambda without saying whether it is an existing AWS Lambda (owner, shared or not) or a new Jelou Function. New logic goes to Jelou Functions.`);
  if (!["determinista", "conversacional", "mixto"].includes(norm(c.ejecucion))) err("SOLUTION", w, `${c.id || i}: ejecucion must be determinista, conversacional or mixto.`);
  arr(c.cubre).forEach((f) => { coveredFeatures.add(f); if (!featureIds.has(f)) err("REF", w, `Feature does not exist: ${f}.`); });
  arr(c.reglas).forEach((r) => {
    if (!ruleIds.has(r)) err("REF", w, `Rule does not exist: ${r}.`);
    (norm(c.ejecucion) === "conversacional" ? conversationalRules : deterministicRules).add(r);
  });
});
if (sol.length) {
  featureIds.forEach((f) => { if (!coveredFeatures.has(f)) warn("SOLUTION", "solucion", `Feature ${f} has no component assigned.`); });
  arr(sow.reglas).forEach((r) => {
    const critical = Object.keys(r.parametros || {}).length > 0 || /otp|identidad|cupo|monto|pago|aprob|bloque|derivaci|deriva/i.test(`${r.titulo} ${r.descripcion}`);
    if (critical && conversationalRules.has(r.id) && !deterministicRules.has(r.id))
      warn("SOLUTION", "solucion", `Rule ${r.id} (${r.titulo}) is critical but is only assigned to a conversational component. It must be deterministic: it is not guaranteed in an AI prompt.`);
    if (critical && !conversationalRules.has(r.id) && !deterministicRules.has(r.id))
      warn("SOLUTION", "solucion", `Rule ${r.id} (${r.titulo}) is not assigned to any component.`);
  });
}

// ---------- 5. integrations ----------
// Dependencies that cover an integration: explicit `integracion` (id or list) or the text mentions INT-n / WS#n (ranges "WS#4 a WS#7" included).
function depsFor(it) {
  const m = /(\d+)\s*$/.exec(String(it.id || ""));
  const num = m ? Number(m[1]) : null;
  const ws = /WS#(\d+)/.exec(String(it.nombre || ""));
  const nums = new Set([num, ws ? Number(ws[1]) : null].filter((x) => x != null));
  return arr(sow.dependencias_cliente).filter((d) => {
    if (arr([].concat(d.integracion || [])).includes(it.id)) return true;
    const t = String(d.item || "");
    if (t.includes(it.id)) return true;
    for (const r of t.matchAll(/(?:WS#|INT-)(\d+)\s*(?:a|al|-|–|—|hasta)\s*(?:WS#|INT-)?(\d+)/gi)) { for (let k = Number(r[1]); k <= Number(r[2]); k++) if (nums.has(k)) return true; }
    for (const r of t.matchAll(/(?:WS#|INT-)(\d+)/gi)) if (nums.has(Number(r[1]))) return true;
    return false;
  });
}
arr(sow.integraciones).forEach((it, i) => {
  const w = `integraciones[${i}]`;
  if (!usedInts.has(it.id)) warn("INT", w, `Integration ${it.id} is not used in any flow step.`);
  if (arr(it.operaciones).length === 0) errP("INT", w, `${it.id}: define what is read and what is written.`);
  if (!it.autenticacion) errP("INT", w, `${it.id}: missing how it authenticates (the mechanism only, no credentials).`);
  const gaps = [];
  if (!it.responsable_cliente || PLACEHOLDER.test(it.responsable_cliente)) gaps.push("technical owner");
  if (norm(it.documentacion) !== "si") gaps.push("documentation");
  if (norm(it.ambiente_pruebas) !== "si") gaps.push("test environment");
  const intBlocked = gaps.length > 0 && !depsFor(it).some((d) => C.dateOk(d.fecha_limite));
  // when the integration is already reported as blocking, its separate "missing owner/documentation/test" warnings would only repeat it
  if ((!it.responsable_cliente || PLACEHOLDER.test(it.responsable_cliente)) && !intBlocked) (isDraft() ? warn : err)("INT", w, `${it.id}: missing the client's technical owner.`);
  for (const k of ["documentacion", "ambiente_pruebas"]) {
    const v = norm(it[k]);
    if (!["si", "no", "pendiente"].includes(v)) err("INT", `${w}.${k}`, `${it.id}: ${k} must be si, no or pendiente.`);
    else if (v !== "si" && !intBlocked) warn("INT", `${w}.${k}`, `${it.id}: ${k} = ${v}. Make sure there is a dated client dependency to resolve it.`);
  }
  if (!it.disponibilidad) warn("INT", w, `${it.id}: missing the required availability.`);
  if (!["directa", "api_cliente", "middleware_jelou", "middleware_cliente"].includes(norm(it.conexion)))
    errP("INT", `${w}.conexion`, `${it.id}: define the connection mode: directa | api_cliente | middleware_jelou | middleware_cliente. (Who builds and hosts the intermediate layer must be written down.)`);
  else if (norm(it.conexion).startsWith("middleware") && !it.quien_hospeda)
    err("INT", `${w}.quien_hospeda`, `${it.id}: with middleware, state who builds, hosts and maintains it.`);
  if (intBlocked)
    block("INT", w, `${it.id}: no ${gaps.join(", no ")} and no client dependency with a date to obtain ${gaps.length > 1 ? "them" : "it"}: it cannot be built or tested. Add a dependency (with fecha_limite) that covers ${it.id} (field "integracion": "${it.id}" or its INT-n/WS#n in the text).`);
  const undecidedMode = JSON.stringify(it).match(/o bien|una de las siguientes|se definir[aá]|a definir/i);
  if (undecidedMode) errP("INT", w, `${it.id}: a connection mode is left undecided. Choose one or turn the decision into an open question with an owner.`);
});

// ---------- 6. contradictions with out of scope ----------
const includedText = [];
walk(
  { "alcance.incluido_usuario": al.incluido_usuario, "alcance.incluido_admin": al.incluido_admin, agentes: sow.agentes, flujo: sow.flujo, diagrama_general: sow.diagrama_general, historias: sow.historias, pruebas: sow.pruebas, reglas: sow.reglas, escalamiento: sow.escalamiento, "esfuerzo.items": arr((sow.esfuerzo || {}).items).map((i) => [i.entregable, i.nota]), "solucion.componentes": arr((sow.solucion || {}).componentes).map((c) => [c.capacidad, c.componente, c.detalle]) },
  "",
  (s, path) => includedText.push({ s, path })
);
arr(al.fuera_de_alcance).forEach((o) => {
  const terms = arr(o.terminos).map(norm).filter(Boolean);
  if (terms.length === 0) warn("OOS", `alcance.fuera_de_alcance[${o.id}]`, `${o.id} has no "terminos" to detect contradictions.`);
  for (const t of terms) {
    for (const { s, path } of includedText) {
      if (norm(s).includes(t)) {
        // mentions that explicitly state the exclusion do not count
        if (/no incluye|fuera de alcance|no aplica|no se (?:realiza|permite|ofrece|hace)|sin /i.test(s)) continue;
        warn("OOS", path, `Possible contradiction with ${o.id} ("${o.texto}"): "${t}" appears in: "${s.slice(0, 90)}…". If it is only informational, clarify it; otherwise remove it from the scope.`);
      }
    }
  }
});

// ---------- 6b. technical names with different capitalization ----------
const tokens = new Map();
const TOKEN_RE = new RegExp("[A-Za-z]+(?:_[A-Za-z0-9]+)+", "g");
walk(sow, "", (s) => { for (const t of s.match(TOKEN_RE) || []) { const k = t.toLowerCase(); if (!tokens.has(k)) tokens.set(k, new Set()); tokens.get(k).add(t); } });
tokens.forEach((vars) => { if (vars.size > 1) warn("NAMES", "document", `The field is spelled several ways: ${[...vars].join(" / ")}. Use a single spelling (the client system's).`); });

// ---------- 6c. escalation offered vs automatic ----------
const offerStep = agents.flatMap((a) => arr(a.pasos)).find((p) => /ofrec\w*\s+(?:derivar|transferir|pasar|hablar)|se\s+ofrece/i.test(nodeText(p)));
const hasAuto = arr(sow.escalamiento).some((e) => norm(e.modo) === "automatico");
const hasOffered = arr(sow.escalamiento).some((e) => norm(e.modo) === "ofrecido");
if (offerStep && hasAuto && !hasOffered)
  warn("ESC", `step ${offerStep.id || offerStep.n}`, "The flow offers escalation, but every escalation in the table is automatic. Unify: is it offered or automatic?");
{
  const byDest = new Map();
  arr(sow.escalamiento).forEach((e) => {
    const d = norm(e.destino).trim();
    if (!d) return;
    if (!byDest.has(d)) byDest.set(d, { destino: e.destino, auto: [], ofr: [] });
    (norm(e.modo) === "automatico" ? byDest.get(d).auto : norm(e.modo) === "ofrecido" ? byDest.get(d).ofr : []).push(e.id);
  });
  byDest.forEach((v) => {
    if (v.auto.length && v.ofr.length)
      block("ESC", "escalamiento", `Escalations to "${v.destino}" are both automatic (${v.auto.join(", ")}) and offered (${v.ofr.join(", ")}). A user flow must either hand over or offer the handoff for each trigger: pick one mode per trigger and make the flow, the table and the stories say the same.`);
  });
}

// ---------- 7. escalation ----------
arr(sow.escalamiento).forEach((e, i) => {
  const w = `escalamiento[${i}]`;
  if (!e.disparador || !e.destino) err("ESC", w, "Missing disparador or destino.");
  if (!["automatico", "ofrecido"].includes(norm(e.modo))) err("ESC", w, `${e.id}: modo must be "automatico" or "ofrecido" (do not leave it ambiguous whether it escalates or offers).`);
  if (!e.horario) warn("ESC", w, `${e.id}: missing the destination's service hours.`);
  if (!e.fuera_de_horario) warn("ESC", w, `${e.id}: missing what happens out of hours.`);
});

// ---------- 8. personal data ----------
const PERSONAL = /documento|c[eé]dula|identific|nombre|correo|email|tel[eé]fono|celular|direcci[oó]n|nacimiento|autorizaci[oó]n|consentim|cliente|afiliaci|ejecutivo|firma|ciudad|residencia|salario|edad|g[eé]nero/i;
let personalEntities = 0;
arr(sow.datos).forEach((d, i) => {
  const personal = PERSONAL.test(`${d.entidad || ""} ${d.uso || ""} ${arr(d.campos).join(" ")}`);
  if (personal) personalEntities++;
  if (!d.retencion || PLACEHOLDER.test(d.retencion)) {
    if (personal) block("DATA", `datos[${i}]`, `Entity "${d.entidad}" stores personal data and declares no retention period (needed for data-protection compliance and for the Datum design).`);
    else warn("DATA", `datos[${i}]`, `Entity "${d.entidad}" declares no retention.`);
  }
});
if (personalEntities && (!par.retencion_datos || PLACEHOLDER.test(String(par.retencion_datos))))
  block("DATA", "parametros.retencion_datos", "The personal-data retention parameter is missing or pending while the solution stores personal data.");
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE = /(?:\+?\d[\d\s().-]{8,}\d)/;
walk(sow, "", (s, path) => {
  if (path.startsWith("equipo")) return;
  if (EMAIL.test(s)) warn("PII", path, "There is an email outside the team table.");
  if (/pasos\[\d+\]\.mensaje/.test(path)) return; // sample data typed by the user in the simulation
  if (PHONE.test(s) && !/^\d{4}-\d{2}-\d{2}$/.test(s) && !/(?:\d+\s*[–-]\s*\d+)/.test(s) && s.replace(/\D/g, "").length >= 10 && !path.includes("fecha") && !path.startsWith("cronograma"))
    warn("PII", path, "This looks like a phone number outside the team table.");
});

// ---------- 9. schedule and version ----------
const cr = sow.cronograma || {};
if (cr.inicio && !/^\d{4}-\d{2}-\d{2}$/.test(cr.inicio)) err("SCHED", "cronograma.inicio", "The start date must be YYYY-MM-DD.");
else if (!cr.inicio && !prek) warn("SCHED", "cronograma.inicio", "No start date: the schedule shows business days only (dates stay POR DEFINIR). Add it when known to get dated deliverables, the Gantt and the proposal route.");
arr(cr.hitos).forEach((h, i) => {
  if (!(Number.isInteger(h.dias_habiles) && h.dias_habiles > 0)) err("SCHED", `cronograma.hitos[${i}]`, `${h.id || i}: dias_habiles must be a positive integer.`);
  if (!h.entregable) warn("SCHED", `cronograma.hitos[${i}]`, `${h.id || i}: missing deliverable.`);
});
arr(sow.dependencias_cliente).forEach((d, i) => {
  if (!d.fecha_limite || PLACEHOLDER.test(d.fecha_limite)) block("DEP", `dependencias_cliente[${i}]`, `The dependency "${d.item}" has no deadline (fecha_limite): the schedule depends on it.`);
  else if (!C.dateOk(d.fecha_limite)) warn("DEP", `dependencias_cliente[${i}]`, `The deadline of "${d.item}" should be YYYY-MM-DD.`);
});
if (arr(sow.dependencias_cliente).length === 0) warn("DEP", "dependencias_cliente", "There are no client dependencies (access, documentation, approvals).");

const v = String(m.version || "");
if (!/^\d+\.\d+$/.test(v)) err("VERS", "meta.version", "The version must be X.Y: 1.0 is the initial version, corrections during review increase the second digit (1.1, 1.2), a new baseline is 2.0, 3.0.");
else if (/^0\./.test(v)) err("VERS", "meta.version", "The template starts at 1.0 (there are no 0.x versions). Use 1.0 for the first version and meta.estado (en_revision | aprobado) for its status.");
const mayores = new Set(arr(sow.versiones).map((x) => String(x.version || "").split(".")[0]).filter(Boolean));
if (mayores.size > 3) warn("VERS", "versiones", `The template allows up to 3 version controls (1.0, 2.0, 3.0); there are ${mayores.size} baselines.`);
if (m.estado && !C.ESTADOS.includes(String(m.estado).toLowerCase())) err("VERS", "meta.estado", 'meta.estado must be "en_revision" or "aprobado".');
if (!m.estado) warn("VERS", "meta.estado", 'meta.estado is missing: assumed "en_revision". Set "aprobado" only when the client approves and no blocking question or pending value remains.');
if (m.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(m.fecha)) warn("VERS", "meta.fecha", "meta.fecha should be YYYY-MM-DD.");
const last = arr(sow.versiones).slice(-1)[0];
if (last && last.version !== v) warn("VERS", "versiones", `The last version in version control (${last.version}) does not match meta.version (${v}).`);
if (arr(sow.versiones).some((x) => x.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(x.fecha))) warn("VERS", "versiones", "Dates in version control should be YYYY-MM-DD.");
// Status (draft vs approved) comes from meta.estado; an "aprobado" SOW cannot carry pending values or blocking questions (section 10).

// ---------- 10. pending items ----------
walk(sow, "", (s, path) => {
  if (path.startsWith("preguntas_abiertas")) return;
  if (PLACEHOLDER.test(s)) {
    (isDraft() ? warn : err)("PENDING", path, "Pending value (POR DEFINIR/placeholder)." + (isDraft() ? "" : " An approved version cannot contain them."));
  }
});
const blocking = arr(sow.preguntas_abiertas).filter((q) => q.bloquea);
if (!isDraft() && blocking.length) err("PENDING", "preguntas_abiertas", `${blocking.length} blocking question(s) are still open: this cannot be an approved version.`);


// ---------- 11. conversation graphs (agentes) ----------
const legacyForms = [], selectorsNoOptions = [], formToolPending = [];
function checkGraph(g, where) {
  const nodes = arr(g.pasos);
  if (!nodes.length) return;
  const isGeneral = where.startsWith("diagrama_general");
  const byId = new Map(nodes.map((n) => [n.id, n]));
  nodes.forEach((n, i) => {
    const w = `${where}.pasos[${i}]`;
    const outs = arr(n.siguiente);
    outs.forEach((e) => {
      if (!byId.has(e.a)) err("GRAPH", w, `${n.id}: edge to a step that does not exist: ${e.a}.`);
    });
    if (n.tipo !== "fin" && outs.length === 0 && !isGeneral) err("GRAPH", w, `${n.id}: a ${n.tipo || "step"} step without exits; end the branch with a "fin" step.`);
    if (n.tipo === "decision") {
      if (outs.length < 2) err("GRAPH", w, `${n.id}: a decision needs at least 2 exits.`);
      if (outs.some((e) => !e.si)) err("GRAPH", w, `${n.id}: every exit of a decision needs a label ("si").`);
    }
    if (n.tipo === "router" && outs.length > 1 && outs.some((e) => !e.si)) warn("GRAPH", w, `${n.id}: label the exits of the router so the diagram shows the intent of each branch.`);
    const dtext = n.diagrama || n.etapa || n.mensaje || "";
    if (!dtext) err("GRAPH", w, `${n.id}: no text for the diagram (diagrama).`);
    if ((n.diagrama || "").length > 110) warn("GRAPH", w, `${n.id}: the diagram text is ${n.diagrama.length} characters; keep it at 110 or fewer so the diagram stays readable.`);
    if (n.tipo === "mensaje" && !n.mensaje && !isGeneral) err("GRAPH", w, `${n.id}: a bot message needs its proposed text (mensaje).`);
    if (arr(n.botones).length > 3) err("WA", w, `${n.id}: WhatsApp allows at most 3 buttons per message.`);
    arr(n.botones).forEach((b) => { if (String(b).length > 20) err("WA", w, `${n.id}: button "${b}" is longer than 20 characters.`); });
    if (arr(n.lista).length > 10) err("WA", w, `${n.id}: a WhatsApp list allows at most 10 rows.`);
    arr(n.lista).forEach((b) => { if (String(b).length > 24) err("WA", w, `${n.id}: list row "${b}" is longer than 24 characters.`); });
    if ((n.tipo === "formulario" || n.tipo === "webview") && !isGeneral) {
      const fm = C.formOf(n);
      if (n.tipo === "webview") legacyForms.push(w);
      if (!fm || arr(fm.campos).length === 0) err("GRAPH", w, `${n.id}: a formulario step needs formulario.campos (or webview.campos).`);
      else arr(fm.campos).forEach((c) => {
        if (!c.etiqueta || !FIELD_TYPES.includes(c.tipo)) err("GRAPH", w, `${n.id}: form field needs etiqueta and tipo (${FIELD_TYPES.join("|")}).`);
        if (c.tipo === "selector" && arr(c.opciones).length === 0) selectorsNoOptions.push(`${n.id}: ${c.etiqueta}`);
      });
      const h = String(n.herramienta || (fm || {}).herramienta || "por_definir").toLowerCase();
      if (!C.FORM_TOOLS.includes(h)) err("GRAPH", w, `${n.id}: herramienta must be one of ${C.FORM_TOOLS.join(" | ")}.`);
      else if (h === "por_definir") formToolPending.push(n.id);
    }
    if (n.integracion) {
      usedInts.add(n.integracion);
      if (!intIds.has(n.integracion)) err("REF", w, `Integration does not exist: ${n.integracion}.`);
    }
  });
  // reachability from the first step
  const seen = new Set(); const stack = [nodes[0].id];
  while (stack.length) { const id = stack.pop(); if (seen.has(id)) continue; seen.add(id); arr((byId.get(id) || {}).siguiente).forEach((e) => stack.push(e.a)); }
  nodes.forEach((n, i) => { if (!seen.has(n.id)) err("GRAPH", `${where}.pasos[${i}]`, `${n.id} is unreachable from the first step.`); });
  if (!nodes.some((n) => n.tipo === "fin") && !isGeneral) warn("GRAPH", where, "The flow has no 'fin' step.");
}
if (v2) {
  agents.forEach((ag, ai) => checkGraph(ag, `agentes[${ai}]`));
  if (sow.diagrama_general) checkGraph(sow.diagrama_general, "diagrama_general");
  const aid = new Set();
  agents.forEach((a, i) => { if (!a.id) err("ID", `agentes[${i}]`, "Agent without id."); else if (aid.has(a.id)) err("ID", `agentes[${i}]`, `Duplicate agent id ${a.id}.`); aid.add(a.id); });
}

// ---------- 12. persona and tone consistency ----------
{
  const names = agents.map((a) => (a.persona || {}).nombre).filter(Boolean);
  const FORMAL = /\b(usted|ustedes|escriba|ingrese|le enviamos|lo conecto|su cédula)\b/i;
  const FAMILIAR = /\b(tú|tienes|puedes|escríbelo|escribe tu|ingresa tu|te enviamos|te conecto|tu cédula)\b/i;
  agents.forEach((ag, ai) => {
    const per = ag.persona || {};
    const label = `${per.tono || ""} ${per.apelativo || ""}`;
    const wantsFormal = /usted/i.test(label);
    const wantsFamiliar = !wantsFormal && /tuteo|tú|cercan|cálid|amigable/i.test(label);
    arr(ag.pasos).forEach((p, i) => {
      if (p.tipo !== "mensaje" || !p.mensaje) return;
      const w = `agentes[${ai}].pasos[${i}].mensaje`;
      const m = p.mensaje.match(/\b[Ss]oy ([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)/);
      if (m && names.length && !names.includes(m[1])) warn("PERSONA", w, `The message introduces the agent as "${m[1]}" but the persona is "${per.nombre || "undefined"}". Use one name per agent.`);
      if (wantsFormal && FAMILIAR.test(p.mensaje)) warn("PERSONA", w, "The persona uses \"usted\" but this message uses informal address. Keep one form of address.");
      if (wantsFamiliar && FORMAL.test(p.mensaje)) warn("PERSONA", w, "The persona is informal (\"tú\") but this message uses \"usted\". Keep one form of address.");
    });
  });
}

// ---------- 13. team ----------
{
  const roles = arr(sow.equipo).map((e) => norm(`${e.rol || ""} ${e.cargo || ""}`));
  const needed = [["am", "AM (Account Manager)"], ["pm", "PM (Project Manager)"], ["implementador", "implementer / bot builder"], ["cliente funcional", "client functional reference"]];
  if (arr(sow.integraciones).length) needed.push(["cliente tecnico", "client technical contact (integrations)"]);
  for (const [k, label] of needed) {
    if (!roles.some((r) => r.includes(k))) warn("TEAM", "equipo", `Missing the role ${label}. Add the row with POR COMPLETAR if the data is not available yet.`);
  }
  const named = arr(sow.equipo).filter((e) => e.nombre && !PLACEHOLDER.test(e.nombre));
  if (named.length && m.equipo_confirmado !== true)
    warn("TEAM", "equipo", `${named.length} team member(s) have names but meta.equipo_confirmado is not true: names taken from sources (Diio, ClickUp, documents) are proposals. Ask "¿Tienes la información del equipo de trabajo?" and set meta.equipo_confirmado: true only after the user confirms them.`);
  arr(sow.equipo).forEach((e, i) => { if (!e.responsabilidad) warn("TEAM", `equipo[${i}]`, "Missing the responsibility of this role."); });
}

// ---------- 14. effort and 20-business-day limit ----------
{
  const eff = C.computeEffort(sow.esfuerzo);
  if (!arr((sow.esfuerzo || {}).items).length) warn("EFFORT", "esfuerzo", "There is no effort estimate (esfuerzo.items).");
  eff.unknown.forEach((t) => err("EFFORT", "esfuerzo.items", `Unknown effort type "${t}". See references/effort-model.md.`));
  // hours cap (default 72 h INCLUDING management; meta.tope_horas to change it, meta.excepcion_horas to justify an overrun)
  const tope = C.topeHoras(sow);
  if (eff.rows.length && eff.totalMax > tope + 1e-9)
    (m.excepcion_horas ? warn : err)("EFFORT", "esfuerzo", `The maximum total effort is ${eff.totalMax.toFixed(1)} h (management included) and the cap is ${tope} h (meta.tope_horas, default 72).${m.excepcion_horas ? " An exception is declared in meta.excepcion_horas." : " Reduce scope, split into phases or justify it in meta.excepcion_horas."}`);
  if (eff.rows.length && !prek) {
    const tipos = new Set(eff.rows.map((r) => r.tipo));
    if (!tipos.has("pruebas_qa")) warn("EFFORT", "esfuerzo.items", 'There is no "pruebas_qa" item: internal tests must appear as effort.');
    if (!tipos.has("uat_acompanamiento")) warn("EFFORT", "esfuerzo.items", 'There is no "uat_acompanamiento" item: the support during the client UAT must appear as effort.');
  }
  const total = C.totalBusinessDays(sow.cronograma);
  if (total > 20) (m.excepcion_plazo ? warn : err)("SCHED", "cronograma", `The schedule adds up to ${total} business days; the limit is 20.${m.excepcion_plazo ? " An exception is declared in meta.excepcion_plazo." : " Split the project into phases or justify it in meta.excepcion_plazo."}`);
  const build = arr((sow.cronograma || {}).hitos).filter((h) => /construcci/i.test(h.nombre || "")).reduce((a, h) => a + (h.dias_habiles || 0), 0);
  if (eff.rows.length && build && build < eff.diasMin) warn("EFFORT", "cronograma", `The build milestones have ${build} business days but the effort estimate needs at least ${eff.diasMin} (${eff.totalMin.toFixed(0)}–${eff.totalMax.toFixed(0)} h with ${eff.personas} person(s) at ${eff.horasDia} h/day). The schedule is optimistic.`);
}

// ---------- 15. figures (the diagram set: overview + one per stage + common handoff) ----------
let figSet = { figuras: [], porAgente: {} };
try {
  const F = require("./lib/figuras");
  figSet = F.buildFigureSet(sow);
  for (const f of figSet.figuras) {
    if (f.nodos > F.MAX_FIG && (f.dividido || f.nodos > F.MAX_SINGLE))
      warn("FIG", `figura ${f.id}`, `Figure ${f.id} has ${f.nodos} nodes (maximum ${F.MAX_FIG} after splitting): it will be hard to read. Add "grupo" to the steps to cut the stages smaller, or simplify the flow.`);
  }
  agents.forEach((ag, ai) => {
    const figs = figSet.porAgente[String(ag.id)] || [];
    if (figs.some((f) => f.fusion))
      warn("FIG", `agentes[${ai}]`, `${ag.id}: the flow has ${arr(ag.pasos).length} steps and very fine-grained "etapa" labels, so the diagram engine merged neighbouring stages automatically. Set "grupo" on the first step of each business stage (6-9 stages) to name them yourself.`);
    if (arr(ag.pasos).length > F.MAX_SINGLE && ag.dividir_diagrama === false)
      warn("FIG", `agentes[${ai}]`, `${ag.id}: dividir_diagrama is false but the flow has ${arr(ag.pasos).length} steps (> ${F.MAX_SINGLE}); the single figure will be unreadable.`);
  });
} catch (e) { /* figuras.js unavailable: nothing to check */ }

// ---------- 16. aggregated notes ----------
if (legacyForms.length) warn("FORM", "agentes", `${legacyForms.length} step(s) use the legacy type "webview". It still works (alias), but use "formulario" with "herramienta": flows | webview | por_definir.`);
if (formToolPending.length) warn("FORM", "agentes", `${formToolPending.length} form step(s) have herramienta = por_definir (WhatsApp Flow vs WebView not decided yet): ${formToolPending.slice(0, 8).join(", ")}${formToolPending.length > 8 ? ", …" : ""}. Keep one open question for the decision.`);
if (selectorsNoOptions.length) warn("FORM", "agentes", `${selectorsNoOptions.length} selector field(s) have no "opciones" (the simulator shows them as pending): ${selectorsNoOptions.slice(0, 6).join("; ")}${selectorsNoOptions.length > 6 ? "; …" : ""}.`);


// ---------- 17. tests in the schedule + UAT clause ----------
if (!prek || arr(cr.hitos).length) {
  const tm = C.testMilestones(sow);
  if (arr(cr.hitos).length && !tm.internas.length) err("SCHED", "cronograma.hitos", 'The schedule has no internal-tests milestone (name it e.g. "Pruebas internas" or set hito.tipo = "pruebas_internas"): internal tests must be an explicit milestone with business days and dates.');
  if (arr(cr.hitos).length && !tm.uat.length) err("SCHED", "cronograma.hitos", 'The schedule has no client-tests milestone (name it e.g. "UAT del cliente" or set hito.tipo = "uat"): the client tests (UAT) must be an explicit milestone with business days and dates.');
  if (tm.uat.length) {
    const uatDep = arr(sow.dependencias_cliente).find((d) => d.tipo === "uat" || /\buat\b|pruebas del cliente/i.test(`${d.item || ""} ${d.hito || ""}`));
    const uatRule = arr(sow.reglas).some((r) => /\buat\b/i.test(`${r.titulo || ""} ${r.descripcion || ""}`) && /fecha|venc|cierre|aceptad/i.test(`${r.descripcion || ""} ${r.si_no_cumple || ""}`));
    if (!uatDep && !uatRule) warn("UAT", "dependencias_cliente", 'The UAT time rule is missing: add a dependency (tipo "uat", with fecha_limite = end of the UAT milestone) or a rule that says the client tests must be run on the stipulated dates, otherwise the project is deemed accepted and closed.');
    if (uatDep) {
      if (!C.dateOk(uatDep.fecha_limite)) warn("UAT", "dependencias_cliente", "The UAT dependency needs fecha_limite (the closing date of the UAT milestone).");
      const w = C.uatWindow(sow);
      if (w && w.fin && C.dateOk(uatDep.fecha_limite) && uatDep.fecha_limite !== C.fmtIso(w.fin)) warn("UAT", "dependencias_cliente", `The UAT dependency date (${uatDep.fecha_limite}) differs from the end of the UAT milestone (${C.fmtIso(w.fin)}); the closing date of the UAT must be the same in both places.`);
    }
    if (m.clausula_uat_revisada_legal !== true) warn("LEGAL", "meta.clausula_uat_revisada_legal", "The UAT clause (client tests on the stipulated dates, otherwise deemed accepted and closed) is a DRAFT pending review by Legal. Set meta.clausula_uat_revisada_legal: true once Legal approves the wording.");
  }
}

// ---------- 18. scope lock (alcance.base + ampliaciones_solicitadas) ----------
{
  const amps = C.ampliaciones(sow);
  const qById = new Map(arr(sow.preguntas_abiertas).map((q) => [q.id, q]));
  const base = al.base;
  if (base && base.congelado === true) {
    const baseIds = new Set(arr(base.ids));
    const okIds = new Set(amps.filter((a) => a.estado === "aprobada_comercial").flatMap((a) => arr(a.alcance_ids)));
    for (const k of ["incluido_usuario", "incluido_admin"]) arr(al[k]).forEach((f, i) => {
      if (f.id && !baseIds.has(f.id) && !okIds.has(f.id)) err("SCOPE", `alcance.${k}[${i}]`, `${f.id} is not part of the frozen base scope (alcance.base.ids) and no approved ampliación lists it in alcance_ids. The scope does not change after the presales SOW unless Comercial approves and charges the addition.`);
    });
    baseIds.forEach((id) => { if (!featureIds.has(id)) warn("SCOPE", "alcance.base.ids", `Base id ${id} does not exist in alcance.incluido_*.`); });
  } else if (amps.length && !base) warn("SCOPE", "alcance.base", 'There are requested additions but the presales scope is not frozen: add alcance.base = { fuente, fecha, congelado: true, ids: [...] }.');
  const seenA = new Set();
  amps.forEach((a, i) => {
    const w = `ampliaciones_solicitadas[${i}]`;
    if (!a.id) err("SCOPE", w, "Missing id."); else if (seenA.has(a.id)) err("ID", w, `Duplicate ID ${a.id}.`); seenA.add(a.id);
    if (!a.descripcion) err("SCOPE", w, `${a.id}: missing descripcion.`);
    if (!a.origen) warn("SCOPE", w, `${a.id}: missing origen (Diio, date, email).`);
    if (!C.AMP_ESTADOS.includes(a.estado)) { err("SCOPE", w, `${a.id}: estado must be one of ${C.AMP_ESTADOS.join(" | ")}.`); return; }
    const terms = arr(a.terminos).map(norm).filter(Boolean);
    if (a.estado !== "aprobada_comercial") {
      if (!terms.length) warn("SCOPE", w, `${a.id}: no "terminos" to detect it leaking into flows, stories or effort.`);
      for (const t of terms) for (const { s: txt, path } of includedText) {
        if (!norm(txt).includes(t)) continue;
        if (/no incluye|fuera de alcance|no aplica|no se (?:realiza|permite|ofrece|hace)|sin |sujeto a evaluaci/i.test(txt)) continue;
        err("SCOPE", path, `${a.id} (${a.estado}) is not in scope but "${t}" appears in: "${txt.slice(0, 90)}…". An addition that is not approved by Comercial cannot be in flows, stories, solution or effort.`);
      }
    }
    if (a.estado === "por_decidir") {
      const q = arr(sow.preguntas_abiertas).find((x) => x.ampliacion === a.id);
      if (!q) err("SCOPE", w, `${a.id}: every addition to decide needs ONE open question (preguntas_abiertas[].ampliacion = "${a.id}", responsable "Comercial", text "${C.AMP_QUESTION}").`);
      else if (!/comercial/i.test(q.responsable || "")) err("SCOPE", w, `${a.id}: its open question must have responsable "Comercial".`);
    }
    if (a.estado === "aprobada_comercial") {
      if (!a.cobro_adicional || PLACEHOLDER.test(String(a.cobro_adicional))) err("SCOPE", w, `${a.id}: an approved addition needs cobro_adicional (the additional charge set by Comercial).`);
      if (!arr(sow.cambios).some((c) => c.ampliacion === a.id || String(c.descripcion || "").includes(a.id))) err("SCOPE", w, `${a.id}: an approved addition needs a "cambios" row (CC-xx, field ampliacion = "${a.id}") that states the commercial approval.`);
    }
  });
  // presales assumptions that later statements contradict: confirmed through a question, never decided silently
  arr(sow.cambios_respecto_preventa).forEach((c, i) => {
    const w = `cambios_respecto_preventa[${i}]`;
    if (!c.id || !c.tema) warn("SCOPE", w, "Needs id and tema.");
    if (!c.pregunta || !qById.has(c.pregunta)) warn("SCOPE", w, `${c.id || i}: a change versus presales is a question to confirm, not a decision: link it to an open question (pregunta: "Q-…").`);
  });
}

// ---------- 19. open questions ----------
{
  const seenQ = new Set();
  arr(sow.preguntas_abiertas).forEach((q, i) => {
    const w = `preguntas_abiertas[${i}]`;
    if (!q.id) warn("QUESTION", w, "Question without id."); else if (seenQ.has(q.id)) err("ID", w, `Duplicate question ID ${q.id}.`); seenQ.add(q.id);
    if (!q.pregunta) err("QUESTION", w, `${q.id || i}: empty question.`);
    if (q.audiencia && !["cliente", "interna", "comercial"].includes(q.audiencia)) err("QUESTION", w, `${q.id}: audiencia must be cliente | interna | comercial.`);
    if (q.ampliacion && !C.ampliaciones(sow).some((a) => a.id === q.ampliacion)) err("REF", w, `${q.id}: ampliacion "${q.ampliacion}" does not exist.`);
  });
}

// ---------- 20. client-readable end-to-end diagram (agentes[].resumen_cliente) ----------
{
  const TECH = /\b(otp|api|webhook|http|https|json|endpoint|token|deeplink|hsm|jwt|oauth|payload|swagger|sql|ws#\d+)\b/i;
  const idsE = new Set();
  const allIds = new Set(agents.flatMap((a) => arr(a.resumen_cliente).map((x) => x && typeof x === "object" && x.id).filter(Boolean)));
  agents.forEach((ag, ai) => arr(ag.resumen_cliente).forEach((it, k) => {
    const w = `agentes[${ai}].resumen_cliente[${k}]`;
    const o = typeof it === "string" ? { texto: it } : it || {};
    if (!o.texto) err("E2E", w, "A milestone needs texto.");
    if (o.id) { if (idsE.has(o.id)) err("E2E", w, `Duplicate milestone id ${o.id}.`); idsE.add(o.id); }
    arr(o.salidas).forEach((e) => { if (!e.a || !allIds.has(e.a)) err("E2E", w, `Exit to a milestone that does not exist: ${e.a}.`); });
    if (o.texto && TECH.test(o.texto)) warn("E2E", w, `The end-to-end diagram is for the client: "${String(o.texto).slice(0, 60)}" has technical terms (OTP, API, webhook…). Write the business milestone.`);
    if (String(o.texto || "").length > 90) warn("E2E", w, "Keep milestones short (at most 90 characters).");
  }));
  if (figSet.e2e) {
    if (figSet.e2e.nodos > 9) warn("E2E", "figura FE", `The end-to-end diagram has ${figSet.e2e.nodos} boxes (at most ~8). Shorten agentes[].resumen_cliente.`);
    if (figSet.e2e.automatico && agents.some((a) => arr(a.pasos).length > 6)) warn("E2E", "agentes", "The end-to-end diagram was built automatically from stage names. Add agentes[].resumen_cliente (5-7 business milestones in the client's words) for a readable overview.");
    if (figSet.e2e.tecnico) warn("E2E", "figura FE", "The automatic end-to-end diagram contains technical terms; write agentes[].resumen_cliente.");
  }
}

// ---------- proposed dates for dependencies without a deadline (suggestion only, never written into the document) ----------
const dp = C.dependencyPlan(sow);
const propuestas = dp.deps.filter((d) => d.sinFecha).map((d) => ({ where: `dependencias_cliente[${d.index}]`, item: d.item, hito: d.hito ? d.hito.nombre : null, propuesta: d.propuesta }));
const noStart = dp.sinFecha && !C.dateOk((sow.cronograma || {}).inicio);

// ---------- output ----------
// A pending value already reported as a blocking item is not listed again as a separate "pending" warning.
{
  const bw = findings.filter((f) => f.blocking).map((f) => f.where);
  for (let i = findings.length - 1; i >= 0; i--) {
    const f = findings[i];
    if (f.code === "PENDING" && bw.some((b) => f.where === b || f.where.startsWith(b + ".") || f.where.startsWith(b + "["))) findings.splice(i, 1);
  }
}
const errors = findings.filter((f) => f.level === "ERROR");
const warns = findings.filter((f) => f.level === "WARN");
const blockers = findings.filter((f) => f.blocking);
const section = (f) => String(f.where || "").split(/[.\[ ]/)[0] || "documento";
const noun = (n, one, many) => `${n} ${n === 1 ? one : many}`;
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ errors: errors.length, warnings: warns.length, blocking: blockers.length, findings: findings.map((f) => ({ ...f, section: section(f) })), propuestas_fecha: propuestas, dependencias: { dias_totales: dp.total, sin_holgura: dp.sinHolgura, sin_fecha: dp.sinFecha, dias_dependientes: dp.diasDependientes } }, null, 2));
} else {
  const out = [];
  const line = (f) => `${f.level.padEnd(5)} [${f.code}] ${f.where}: ${f.msg}`;
  // 1. blocking items (an approved SOW cannot carry them)
  if (blockers.length) {
    out.push(`=== BLOQUEANTES (${blockers.length}): ${isDraft() ? "resolver antes de pasar a aprobado" : "ERRORES: la versión aprobada no puede llevarlos"} ===`);
    const bySec = new Map();
    blockers.forEach((f) => { const k = section(f); if (!bySec.has(k)) bySec.set(k, []); bySec.get(k).push(f); });
    for (const [k, list] of bySec) { out.push(`  ${k}: ${list.length}`); list.forEach((f) => out.push(`    [${f.code}] ${f.where}: ${f.msg}`)); }
    out.push("");
  } else out.push("=== BLOQUEANTES: ninguno ===", "");
  // 2. other errors
  const otherErr = errors.filter((f) => !f.blocking);
  if (otherErr.length) {
    out.push(`=== ERRORES (${otherErr.length}) ===`);
    const pend = otherErr.filter((f) => f.code === "PENDING");
    otherErr.filter((f) => f.code !== "PENDING").forEach((f) => out.push("  " + line(f)));
    if (pend.length) groupBy(pend, section).forEach(([k, l]) => out.push(`  ${k}: ${noun(l.length, "valor pendiente", "valores pendientes")} (no permitidos en una versión aprobada)`));
    out.push("");
  }
  // 3. warnings grouped by section: pending values are counted, not listed one by one
  const otherWarn = warns.filter((f) => !f.blocking);
  if (otherWarn.length) {
    out.push(`=== ADVERTENCIAS (${otherWarn.length}) ===`);
    groupBy(otherWarn, section).forEach(([k, list]) => {
      const pend = list.filter((f) => f.code === "PENDING"), rest = list.filter((f) => f.code !== "PENDING");
      out.push(`  ${k}: ${[pend.length ? noun(pend.length, "pendiente", "pendientes") : "", rest.length ? noun(rest.length, "aviso", "avisos") : ""].filter(Boolean).join(", ")}`);
      rest.forEach((f) => out.push("    " + line(f)));
      if (pend.length) out.push(`    pendientes: ${pend.slice(0, 4).map((f) => f.where).join(", ")}${pend.length > 4 ? `, … (+${pend.length - 4})` : ""}`);
    });
    out.push("");
  }
  // 4. proposed dates
  if (propuestas.length) {
    out.push("=== PROPUESTA DE FECHAS PARA DEPENDENCIAS SIN FECHA (sugerencia; no se escribe en el documento) ===");
    if (noStart) out.push("  Define cronograma.inicio para calcular las fechas propuestas.");
    propuestas.forEach((x) => out.push(`  ${x.where}: "${String(x.item).slice(0, 80)}" -> ${x.propuesta ? "proponer " + x.propuesta : "sin cálculo"}${x.hito ? ` (la necesita el hito "${x.hito}")` : ""}`));
    if (dp.sinHolgura) out.push(`  El cronograma suma ${dp.total} días hábiles (sin holgura): ${dp.diasDependientes} de ellos dependen de entregables del cliente sin fecha.`);
    out.push("");
  }
  out.push(`${errors.length} error(s), ${warns.length} warning(s) (${blockers.length} blocking, ${findings.filter((f) => f.code === "PENDING").length} pending values). ${isDraft() ? "Status: en_revision." : "Status: aprobado."}`);
  console.log(out.join("\n"));
}
function groupBy(list, fn) { const m = new Map(); list.forEach((x) => { const k = fn(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); }); return [...m.entries()]; }
process.exit(errors.length ? 1 : 0);
