#!/usr/bin/env node
// Reparte la construcción en carriles paralelos (máximo 3) a partir de esfuerzo.items y los muestra; con --aplicar los escribe en sow.json.
//   node planificar_cronograma.js sow.json            -> imprime el plan (no modifica nada)
//   node planificar_cronograma.js sow.json --aplicar  -> actualiza el hito de construcción (tareas por carril, dias_habiles = ruta crítica) y esfuerzo.paralelismo
// Regla de reducción (estimación pendiente de calibrar): -10 % de horas de construcción por carril adicional, máximo -20 %.
const fs = require("fs");
const C = require("./lib/common");
const PL = require("./lib/planificar");

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
if (!file) { console.error("Uso: node planificar_cronograma.js sow.json [--aplicar]"); process.exit(2); }
const sow = JSON.parse(fs.readFileSync(file, "utf8"));
const nombres = Object.fromEntries((sow.agentes || []).map((a) => [a.id, a.nombre ? `${a.nombre}` : a.id]));
const rangos = C.loadRates().rangos;
const { sow: s2, plan } = PL.aplicar(sow, rangos, nombres);
if (!plan.carriles.length) { console.log("No hay items de construcción en esfuerzo.items: no hay carriles que planificar."); process.exit(0); }
console.log(`Carriles: ${plan.nCarriles} (máximo ${PL.MAX_CARRILES}) · reducción de horas de construcción: ${plan.reduccionPct} % · ruta crítica de construcción: ${plan.diasConstruccionMax} día(s) hábil(es)`);
plan.carriles.forEach((c) => console.log(`  ${c.id}: ${c.nombre} — ${c.horasMax.toFixed(1)} h máx. → ${c.dias} día(s)`));
console.log(`Horas de construcción (máx.): ${plan.horasAntesMax.toFixed(1)} → ${plan.horasDespuesMax.toFixed(1)} h`);
if (args.includes("--aplicar")) { fs.writeFileSync(file, JSON.stringify(s2, null, 2) + "\n"); console.log(`Aplicado en ${file}.`); }
else console.log("(solo lectura: usa --aplicar para escribirlo en sow.json)");
