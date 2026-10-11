#!/usr/bin/env node
// Genera el simulador del bot (HTML autocontenido) desde sow.json.
// Uso: node build_html.js <sow.json> <salida.html>
const fs = require("fs");
const path = require("path");
const { buildHtml } = require("./lib/simulator");

const [, , inFile, outFile] = process.argv;
if (!inFile || !outFile) { console.error("Uso: node build_html.js <sow.json> <salida.html>"); process.exit(2); }
let sow;
try { sow = JSON.parse(fs.readFileSync(inFile, "utf8")); }
catch (e) { console.error("No se pudo leer " + inFile + ": " + e.message); process.exit(1); }
if (!Array.isArray(sow.agentes) || !sow.agentes.length) console.error("Aviso: el SOW no tiene agentes; el HTML saldrá sin pantallas.");
fs.mkdirSync(path.dirname(path.resolve(outFile)), { recursive: true });
fs.writeFileSync(outFile, buildHtml(sow), "utf8");
console.log("Simulador generado: " + outFile);
