// Planificador de carriles en paralelo (determinista). La skill decide sola cómo repartir la construcción; el usuario no declara los carriles.
//
// Entrada: esfuerzo.items (tipo, cantidad, y opcionalmente `agente` = id del flujo, p. ej. "F1"). Se reparte SOLO el trabajo de construcción.
// Dos ejes para formar las unidades de trabajo:
//   1. por flujo / agente: los items con `agente` forman una unidad por agente (Flujo_1, Flujo_2…);
//   2. por tipo de trabajo: el resto se agrupa en flujos, integraciones, front (webviews / Flows / plantillas) y conocimiento.
// Las unidades se reparten en MÁXIMO 3 carriles con LPT (la unidad más pesada primero, en el carril menos cargado).
// El paralelismo reduce horas Y días (estimación pendiente de calibrar con horas reales):
//   - horas de construcción: -10 % por carril adicional, máximo -20 % (solo items de construcción; no gestión, pruebas, UAT, capacitación ni activación);
//   - días de construcción = ruta crítica = el carril más largo (no la suma de los carriles).
const arr = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

const MAX_CARRILES = 3;
const REDUCCION_POR_CARRIL = 0.10;
const REDUCCION_MAX = 0.20;
// no son construcción: se programan después (pruebas, UAT) o fuera de los carriles (capacitación, activación del canal)
const NO_CONSTRUCCION = new Set(["pruebas_qa", "uat_acompanamiento", "capacitacion", "canal_whatsapp_activacion"]);
const GRUPO = {
  workflow_simple: "flujos", workflow_medio: "flujos", workflow_complejo: "flujos",
  function: "integraciones", integracion_api: "integraciones", datum: "integraciones", kyc: "integraciones", pagos: "integraciones",
  webview_simple: "front", webview_backend: "front", flow_whatsapp: "front", formulario: "front", plantilla_hsm: "front",
  base_conocimiento: "conocimiento", agente_faq: "conocimiento", campana: "conocimiento", handoff_asesor: "conocimiento",
};
const ETIQUETA_GRUPO = { flujos: "Workflows", integraciones: "Integraciones y servicios", front: "Webviews, Flows y plantillas", conocimiento: "Conocimiento, FAQ y atención", otros: "Otros entregables" };

const reduccionPara = (n) => Math.min(REDUCCION_MAX, REDUCCION_POR_CARRIL * Math.max(0, n - 1));

// rangos: { tipo: [min, max] }; esfuerzo: sow.esfuerzo; nombresAgentes: { F1: "Flujo_1: …" } (opcional, solo para rotular)
function planificar(esfuerzo, rangos, nombresAgentes = {}) {
  const e = esfuerzo || {};
  const par = e.paralelismo || {};
  const g = (e.gestion_pct == null ? 15 : e.gestion_pct) / 100;
  const horasDia = e.horas_dia || 6;
  const items = arr(e.items).map((it, i) => {
    const r = rangos[it.tipo]; const q = it.cantidad || 1;
    return { i, it, conocido: !!r, construccion: !!r && !NO_CONSTRUCCION.has(it.tipo), min: r ? r[0] * q : 0, max: r ? r[1] * q : 0 };
  });
  const build = items.filter((x) => x.construccion);
  // unidades de trabajo: por agente (eje 1) y por tipo de trabajo (eje 2)
  const unidades = new Map();
  for (const x of build) {
    const key = x.it.agente ? `agente:${x.it.agente}` : `trabajo:${GRUPO[x.it.tipo] || "otros"}`;
    if (!unidades.has(key)) unidades.set(key, { key, items: [], min: 0, max: 0, nombre: x.it.agente ? (nombresAgentes[x.it.agente] || String(x.it.agente)) : ETIQUETA_GRUPO[GRUPO[x.it.tipo] || "otros"] });
    const u = unidades.get(key); u.items.push(x); u.min += x.min; u.max += x.max;
  }
  const lista = [...unidades.values()].sort((a, b) => b.max - a.max || a.key.localeCompare(b.key));
  const tope = Math.min(MAX_CARRILES, Math.max(1, Math.floor(Number(par.carriles) || MAX_CARRILES)));
  const desactivado = par.activo === false || par.carriles === 1;
  const n = desactivado ? Math.min(1, lista.length) : Math.min(tope, lista.length);
  const carriles = Array.from({ length: n }, (_, k) => ({ id: `C${k + 1}`, unidades: [], items: [], min: 0, max: 0 }));
  for (const u of lista) {
    const c = carriles.reduce((a, b) => (b.max < a.max ? b : a), carriles[0]);
    c.unidades.push(u); c.items.push(...u.items); c.min += u.max ? u.min : 0; c.max += u.max;
  }
  const f = 1 - reduccionPara(carriles.length);
  carriles.forEach((c) => {
    c.nombre = c.unidades.map((u) => u.nombre).join(" + ");
    c.horasMin = c.min * f; c.horasMax = c.max * f;
    c.diasMin = Math.ceil((c.horasMin * (1 + g)) / horasDia - 1e-9);
    c.diasMax = Math.ceil((c.horasMax * (1 + g)) / horasDia - 1e-9);
    c.dias = c.diasMax;
  });
  const sum = (k) => build.reduce((a, x) => a + x[k], 0);
  return {
    activo: carriles.length > 1, carriles, nCarriles: carriles.length, factor: f, reduccionPct: Math.round((1 - f) * 100),
    horasAntesMin: sum("min"), horasAntesMax: sum("max"), horasDespuesMin: sum("min") * f, horasDespuesMax: sum("max") * f,
    diasConstruccionMin: Math.max(0, ...carriles.map((c) => c.diasMin)), diasConstruccionMax: Math.max(0, ...carriles.map((c) => c.diasMax)),
    construccion: new Set(build.map((x) => x.i)), maxCarriles: MAX_CARRILES,
  };
}

const esConstruccion = (h) => /construcci/i.test(`${(h && h.nombre) || ""} ${(h && h.tipo) || ""}`);

// Devuelve una COPIA del sow con el hito de construcción dividido en tareas por carril (para sow_a_paquete.py y el Gantt)
// y esfuerzo.paralelismo con el resumen. No toca nada más.
function aplicar(sow, rangos, nombresAgentes = {}, opts = {}) {
  const s = JSON.parse(JSON.stringify(sow || {}));
  const plan = planificar(s.esfuerzo, rangos, nombresAgentes);
  if (!plan.carriles.length) return { sow: s, plan };
  s.esfuerzo = s.esfuerzo || {};
  s.esfuerzo.paralelismo = { ...(s.esfuerzo.paralelismo || {}), carriles: plan.nCarriles, reduccion_pct: plan.reduccionPct, horas_antes_max: round1(plan.horasAntesMax), horas_despues_max: round1(plan.horasDespuesMax), nota: "Estimación: el trabajo en paralelo reduce 10 % las horas de construcción por carril adicional (máximo 20 %); pendiente de calibrar con horas reales." };
  const hitos = arr((s.cronograma || {}).hitos);
  const h = hitos.find(esConstruccion);
  if (h) {
    // opts.conservarDias: the milestone keeps the (longer) days the author set; the longest lane is stretched so the Word table and the Gantt agree
    const autor = Number(h.dias_habiles) || 0;
    const dias = opts.conservarDias && autor > plan.diasConstruccionMax ? autor : Math.max(1, plan.diasConstruccionMax);
    if (plan.nCarriles > 1) {
      const maxD = Math.max(...plan.carriles.map((c) => c.dias));
      let estirada = false;
      h.tareas = plan.carriles.map((c) => { const largo = !estirada && c.dias === maxD; if (largo) estirada = true; return { tarea: c.nombre, responsable: "Jelou", dias: largo ? dias : Math.max(1, c.dias), carril: c.id }; });
    } else delete h.tareas;
    h.dias_habiles = dias;
  }
  return { sow: s, plan };
}
const round1 = (x) => Math.round(x * 10) / 10;

// Carriles declarados en el SOW (cronograma.hitos[].tareas[].carril, cronograma.carriles o esfuerzo.paralelismo.carriles)
function carrilesDeclarados(sow) {
  const ids = new Set();
  arr(((sow || {}).cronograma || {}).hitos).forEach((h) => arr(h.tareas).forEach((t) => { if (t.carril) ids.add(String(t.carril)); }));
  const n1 = Number(((sow || {}).cronograma || {}).carriles); const n2 = Number((((sow || {}).esfuerzo || {}).paralelismo || {}).carriles);
  return Math.max(ids.size, Number.isFinite(n1) ? n1 : 0, Number.isFinite(n2) ? n2 : 0);
}

// Ciclos o referencias rotas en depende_de de las tareas de un hito: devuelve lista de textos de error
function problemasDependencias(hito) {
  const out = []; const tareas = arr(hito && hito.tareas); const ids = new Set(tareas.map((t) => t.id).filter(Boolean));
  const deps = new Map(tareas.filter((t) => t.id).map((t) => [t.id, arr(t.depende_de)]));
  tareas.forEach((t) => arr(t.depende_de).forEach((d) => { if (!ids.has(d)) out.push(`la tarea «${t.tarea || t.id}» depende de «${d}», que no existe en el hito`); }));
  const estado = new Map();
  const visita = (id, ruta) => {
    if (estado.get(id) === 2) return; if (estado.get(id) === 1) { out.push(`ciclo en depende_de: ${[...ruta, id].join(" → ")}`); return; }
    estado.set(id, 1); arr(deps.get(id)).forEach((d) => { if (deps.has(d)) visita(d, [...ruta, id]); }); estado.set(id, 2);
  };
  [...deps.keys()].forEach((id) => visita(id, []));
  return out;
}

module.exports = { planificar, aplicar, esConstruccion, carrilesDeclarados, problemasDependencias, MAX_CARRILES, REDUCCION_POR_CARRIL, REDUCCION_MAX, NO_CONSTRUCCION, reduccionPara, GRUPO };
