#!/usr/bin/env node
// Deterministic activation check for the pre-kickoff mode.
// Input: sow.json built from the presales SOW + the first Diio. Besides the team, ANY of:
//   - 5 or more blocking open questions,
//   - integrations without documentation or without a QA/test environment,
//   - presales assumptions ([Supuesto]) not confirmed by the client (alcance.supuestos as strings, or objects without confirmado_cliente: true)
// => "prekickoff": do NOT build the full SOW yet (deck + faltantes first). Otherwise "sow_completo": the context is enough.
// Usage: node umbral_prekickoff.js sow.json [--json]    (exit code is always 0; read the mode from the output)
const fs = require("fs");
const C = require("./lib/common");

const file = process.argv[2];
if (!file) { console.error("Usage: node umbral_prekickoff.js sow.json [--json]"); process.exit(2); }
const sow = JSON.parse(fs.readFileSync(file, "utf8"));
const r = C.prekickoffThreshold(sow);
if (process.argv.includes("--json")) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
if (r.modo === "prekickoff") {
  console.log("MODO PRE-KICKOFF: antes del SOW completo se generan el deck para el cliente y los documentos de faltantes (cliente e interno).");
  r.razones.forEach((x) => console.log("  - " + x));
  console.log("Siguiente: node build_all.js sow.json out --modo prekickoff");
} else {
  console.log("El contexto es suficiente: ninguna condición del umbral se cumple. Se puede ir directo al SOW completo.");
  console.log("Pide al usuario que lo confirme y que entregue los recursos de ejemplo (documentos, textos, accesos) antes de construir.");
}
