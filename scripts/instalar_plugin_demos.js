#!/usr/bin/env node
// Instala o verifica el kit del simulador que usa jelou-sow-studio: la skill `jelou-demo-whatsapp` (kit) de la skill library, que se
// descarga con `skillbox fetch` sin instalar nada en Claude Code, o el plugin `jelou-demos-whatsapp` (misma skill) desde un zip.
// Uso:
//   node instalar_plugin_demos.js --verificar            → dice si está instalado y dónde está el kit (código 1 si falta)
//   node instalar_plugin_demos.js [--fuente <zip|carpeta>] [--forzar]
// Orden: plugin ya instalado → skill de la library (skillbox fetch) → origen del plugin: --fuente, variable JELOU_DEMOS_PLUGIN, assets/jelou-demos-plugin*.zip, Descargas.
// Después de instalar hay que abrir una sesión nueva de Claude Code para que cargue la skill /jelou-demo-whatsapp;
// el kit ya se puede usar de inmediato desde estos scripts.
const K = require("./lib/demo-kit");
const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };

if (argv.includes("--verificar")) {
  const kit = K.findKit();
  if (kit) { console.log(`Kit del simulador disponible. Kit: ${kit}`); process.exit(0); }
  console.log(`Kit del simulador NO disponible. Ejecuta: node instalar_plugin_demos.js (descarga la skill ${K.LIB_SKILL} de la library) o [--fuente <zip del plugin>]`);
  process.exit(1);
}
try {
  const r = K.install({ source: val("--fuente"), force: argv.includes("--forzar") });
  console.log(`Kit del simulador: ${r.accion}${r.origen ? " desde " + r.origen : ""}.\nKit: ${r.kit}`);
  if (r.accion === "instalado" || r.accion === "actualizado") console.log("Abre una sesión nueva de Claude Code para que cargue la skill /jelou-demo-whatsapp.");
} catch (e) { console.error("Error: " + e.message); process.exit(1); }
