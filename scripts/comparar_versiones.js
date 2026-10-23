#!/usr/bin/env node
// Fase 2 explícita: «qué cambió respecto al pre-kickoff». Compara el sow.json anterior con el nuevo y escribe un resumen para la persona
// que lo revisa y para la reunión con el cliente (no entra al Word del cliente).
// Uso: node comparar_versiones.js sow-anterior.json sow-nuevo.json out-dir [--nombre CAMBIOS.md]
// build_all.js lo llama solo cuando recibe --anterior <sow.json>. Nunca escribe en la carpeta del anterior: avisa si out-dir es la misma.
const fs = require("fs");
const path = require("path");
const arr = (x) => (Array.isArray(x) ? x : []);
const PEND = /POR (?:DEFINIR|COMPLETAR)/gi;
const txt = (o) => JSON.stringify(o == null ? "" : o);
const cut = (s, n = 140) => { s = String(s || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const same = (a, b) => txt(a) === txt(b);

const porId = (xs, key = "id") => new Map(arr(xs).map((x, i) => [String(x[key] != null ? x[key] : `#${i}`), x]));
function diffLista(antes, despues, key, etiqueta) {
  const A = porId(antes, key), B = porId(despues, key);
  const nuevos = [...B].filter(([k]) => !A.has(k)).map(([, v]) => v);
  const quitados = [...A].filter(([k]) => !B.has(k)).map(([, v]) => v);
  const cambiados = [...B].filter(([k, v]) => A.has(k) && !same(A.get(k), v)).map(([k, v]) => ({ antes: A.get(k), despues: v }));
  return { nuevos, quitados, cambiados, etiqueta };
}
const contarPend = (o) => (txt(o).match(PEND) || []).length;

function pasosDe(sow) {
  const m = new Map();
  for (const a of arr(sow.agentes)) for (const p of arr(a.pasos)) m.set(`${a.id}.${p.id}`, { ...p, _agente: a.nombre || a.id });
  return m;
}
const abierta = (q) => !(q.respuesta || q.respondida || q.estado === "respondida" || q.estado === "cerrada");

function comparar(antes, despues) {
  const R = { secciones: [], resumen: {} };
  const sec = (titulo, lineas) => { if (lineas.length) R.secciones.push({ titulo, lineas }); };
  const ma = antes.meta || {}, mb = despues.meta || {};
  R.resumen.version = `${ma.version || "?"} (${ma.fase || ma.estado || "?"}) → ${mb.version || "?"} (${mb.fase || mb.estado || "completo"})`;

  // 1. Preguntas abiertas: resueltas / nuevas / siguen abiertas
  const qa = porId(antes.preguntas_abiertas), qb = porId(despues.preguntas_abiertas);
  const resueltas = [...qa].filter(([k, q]) => abierta(q) && (!qb.has(k) || !abierta(qb.get(k)))).map(([, q]) => q);
  const nuevasQ = [...qb].filter(([k]) => !qa.has(k)).map(([, q]) => q);
  const siguen = [...qb].filter(([, q]) => abierta(q));
  const bloqueantes = siguen.filter(([, q]) => q.bloquea).map(([, q]) => q);
  R.resumen.preguntas = { resueltas: resueltas.length, nuevas: nuevasQ.length, abiertas: siguen.length, bloqueantes: bloqueantes.length };
  sec("Preguntas abiertas", [
    `Resueltas desde el pre-kickoff: **${resueltas.length}**. Nuevas: **${nuevasQ.length}**. Siguen abiertas: **${siguen.length}** (bloqueantes: **${bloqueantes.length}**).`,
    ...resueltas.slice(0, 15).map((q) => `- ✅ ${q.id || ""} ${cut(q.pregunta)}`),
    ...nuevasQ.slice(0, 10).map((q) => `- 🆕 ${q.id || ""} ${cut(q.pregunta)}${q.bloquea ? " (bloquea la aprobación)" : ""}`),
    ...bloqueantes.slice(0, 10).map((q) => `- ⛔ Sigue bloqueando: ${q.id || ""} ${cut(q.pregunta)}`),
  ]);

  // 2. Valores «POR DEFINIR / POR COMPLETAR»
  const pa = contarPend(antes), pb = contarPend(despues);
  R.resumen.porDefinir = { antes: pa, ahora: pb };
  sec("Datos por completar", [`Marcas «POR DEFINIR / POR COMPLETAR»: **${pa} → ${pb}**${pb ? " (siguen rojas en el Word; el simulador las muestra con datos probables)" : " (todo definido)"}.`]);

  // 3. Flujos y pasos
  const A = pasosDe(antes), B = pasosDe(despues);
  const pasosNuevos = [...B].filter(([k]) => !A.has(k)), pasosQuitados = [...A].filter(([k]) => !B.has(k));
  const pasosCamb = [...B].filter(([k, v]) => A.has(k) && !same({ ...A.get(k), _agente: 0 }, { ...v, _agente: 0 }));
  const agA = diffLista(antes.agentes, despues.agentes, "id", "agentes");
  R.resumen.flujos = { nuevos: agA.nuevos.length, quitados: agA.quitados.length, pasosNuevos: pasosNuevos.length, pasosQuitados: pasosQuitados.length, pasosCambiados: pasosCamb.length };
  const L = [];
  agA.nuevos.forEach((a) => L.push(`- 🆕 Flujo nuevo: ${a.id} ${cut(a.nombre, 80)}`));
  agA.quitados.forEach((a) => L.push(`- ➖ Flujo retirado: ${a.id} ${cut(a.nombre, 80)}`));
  if (pasosNuevos.length || pasosQuitados.length || pasosCamb.length) L.push(`Pasos: **${pasosNuevos.length}** nuevos, **${pasosQuitados.length}** retirados, **${pasosCamb.length}** modificados.`);
  pasosCamb.slice(0, 20).forEach(([k, v]) => { const o = A.get(k); const campos = ["tipo", "mensaje", "herramienta", "formulario", "integracion", "siguiente"].filter((c) => !same(o[c], v[c])); L.push(`- ✏️ ${k} «${cut(v.etapa || v.diagrama, 60)}»: cambió ${campos.join(", ") || "detalle"}`); });
  pasosNuevos.slice(0, 10).forEach(([k, v]) => L.push(`- 🆕 ${k} «${cut(v.etapa || v.diagrama, 60)}»`));
  pasosQuitados.slice(0, 10).forEach(([k, v]) => L.push(`- ➖ ${k} «${cut(v.etapa || v.diagrama, 60)}»`));
  sec("Flujos y pasos", L);

  // 4. Herramientas de formulario y modo del simulador (decisiones que mueven la demo)
  const herr = [];
  for (const [k, v] of B) { const o = A.get(k); if (!o) continue; const ha = (o.formulario && o.formulario.herramienta) || o.herramienta, hb = (v.formulario && v.formulario.herramienta) || v.herramienta; if (ha !== hb && (ha || hb)) herr.push(`- ${k}: ${ha || "sin definir"} → ${hb || "sin definir"}`); }
  const modoA = (antes.demo || {}).modo || "auto", modoB = (despues.demo || {}).modo || "auto";
  const dec = [...herr]; if (modoA !== modoB) dec.push(`- Modo del simulador: ${modoA} → ${modoB}`);
  const obs = arr((despues.demo || {}).observaciones_cliente);
  obs.forEach((o) => dec.push(`- Observación del cliente: ${cut(typeof o === "string" ? o : o.texto || txt(o))}`));
  sec("Decisiones que cambian el simulador", dec);

  // 5. Reglas, integraciones, parámetros
  for (const [clave, titulo, nombre] of [["reglas", "Reglas de negocio", (x) => x.titulo], ["integraciones", "Integraciones", (x) => x.nombre], ["parametros", "Parámetros", (x) => x.nombre || x.id]]) {
    const d = diffLista(antes[clave], despues[clave], "id", clave);
    const l = [];
    d.nuevos.forEach((x) => l.push(`- 🆕 ${x.id || ""} ${cut(nombre(x), 90)}`));
    d.quitados.forEach((x) => l.push(`- ➖ ${x.id || ""} ${cut(nombre(x), 90)}`));
    d.cambiados.slice(0, 15).forEach(({ despues: x }) => l.push(`- ✏️ ${x.id || ""} ${cut(nombre(x), 90)}`));
    if (l.length) sec(titulo, [`${d.nuevos.length} nuevas/os, ${d.quitados.length} retiradas/os, ${d.cambiados.length} modificadas/os.`, ...l]);
  }

  // 6. Alcance: ampliaciones, cambios vs. preventa, fuera de alcance
  const amp = diffLista(antes.ampliaciones_solicitadas, despues.ampliaciones_solicitadas, "id", "amp");
  const camP = diffLista(antes.cambios_respecto_preventa, despues.cambios_respecto_preventa, "id", "cambios");
  const l6 = [];
  amp.nuevos.forEach((x) => l6.push(`- 🆕 Solicitud fuera del alcance base (${x.estado || "por_decidir"}): ${cut(x.descripcion)} → revisar con Comercial/CSM`));
  camP.nuevos.forEach((x) => l6.push(`- 🆕 Cambio frente a preventa: ${cut(x.descripcion || x.cambio || txt(x))}`));
  if (!same(antes.alcance && antes.alcance.base, despues.alcance && despues.alcance.base)) l6.push("- ⚠️ `alcance.base` cambió: debe estar congelado con el SOW de preventa. Revísalo.");
  sec("Alcance", l6);

  // 7. Dependencias del cliente y esfuerzo
  const dep = diffLista(antes.dependencias_cliente, despues.dependencias_cliente, "item", "dep");
  const l7 = [];
  dep.nuevos.forEach((x) => l7.push(`- 🆕 ${cut(x.item)} (${x.responsable || "cliente"}, ${x.fecha_limite || "sin fecha"})`));
  dep.cambiados.forEach(({ despues: x }) => l7.push(`- ✏️ ${cut(x.item)} (${x.responsable || "cliente"}, ${x.fecha_limite || "sin fecha"})`));
  sec("Dependencias del cliente", l7);
  const ia = arr((antes.esfuerzo || {}).items), ib = arr((despues.esfuerzo || {}).items);
  if (!same(ia, ib)) sec("Esfuerzo", [`Ítems de esfuerzo: ${ia.length} → ${ib.length}. Las horas y el cronograma solo se muestran al cliente cuando el SOW está aprobado.`]);
  return R;
}

function aMarkdown(R, nombreA, nombreB) {
  const out = [`# Qué cambió respecto al pre-kickoff`, ``, `Anterior: \`${nombreA}\` · Nuevo: \`${nombreB}\` · Versión: ${R.resumen.version}`, ``,
    `Para uso interno y para la reunión de cierre de pendientes; no se entrega al cliente.`, ``];
  const r = R.resumen;
  out.push(`**En una línea:** ${r.preguntas.resueltas} preguntas resueltas, ${r.preguntas.abiertas} siguen abiertas (${r.preguntas.bloqueantes} bloqueantes), datos por completar ${r.porDefinir.antes} → ${r.porDefinir.ahora}, ${r.flujos.pasosCambiados} pasos modificados, ${r.flujos.pasosNuevos} nuevos y ${r.flujos.pasosQuitados} retirados.`, ``);
  if (!R.secciones.length) out.push("No hay diferencias entre las dos versiones.");
  for (const s of R.secciones) out.push(`## ${s.titulo}`, ``, ...s.lineas, ``);
  return out.join("\n");
}

function main() {
  const args = process.argv.slice(2); const ni = args.indexOf("--nombre");
  const nombre = ni >= 0 ? args[ni + 1] : "CAMBIOS-vs-prekickoff.md";
  const pos = args.filter((a, i) => !a.startsWith("--") && !(ni >= 0 && i === ni + 1));
  const [fa, fb, outDir] = pos;
  if (!fa || !fb || !outDir) { console.error("Uso: node comparar_versiones.js sow-anterior.json sow-nuevo.json out-dir [--nombre CAMBIOS.md]"); process.exit(2); }
  const antes = JSON.parse(fs.readFileSync(fa, "utf8")), despues = JSON.parse(fs.readFileSync(fb, "utf8"));
  const R = comparar(antes, despues);
  fs.mkdirSync(outDir, { recursive: true });
  const dest = path.join(outDir, nombre);
  fs.writeFileSync(dest, aMarkdown(R, path.basename(fa), path.basename(fb)));
  if (path.resolve(path.dirname(fa)) === path.resolve(outDir)) console.warn("Aviso: la carpeta de salida es la misma del sow.json anterior. La fase 2 debe ir en una carpeta nueva (p. ej. «<Proyecto>_SOW_v1.0») para no pisar el pre-kickoff.");
  console.log(`Cambios respecto al pre-kickoff: ${dest}`);
  console.log(`  ${R.resumen.preguntas.resueltas} preguntas resueltas · ${R.resumen.preguntas.abiertas} abiertas (${R.resumen.preguntas.bloqueantes} bloqueantes) · por definir ${R.resumen.porDefinir.antes} → ${R.resumen.porDefinir.ahora}`);
}

if (require.main === module) main();
module.exports = { comparar, aMarkdown };
