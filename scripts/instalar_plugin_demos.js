#!/usr/bin/env node
// Instala o verifica el plugin `jelou-demos-whatsapp` (skill jelou-demo-whatsapp + kit) que usa jelou-sow-studio para el simulador.
// Uso:
//   node instalar_plugin_demos.js --verificar            → dice si está instalado y dónde está el kit (código 1 si falta)
//   node instalar_plugin_demos.js [--fuente <zip|carpeta>] [--forzar]
// Orden de búsqueda del origen: --fuente, variable JELOU_DEMOS_PLUGIN, assets/jelou-demos-plugin*.zip de la skill, Descargas.
// Después de instalar hay que abrir una sesión nueva de Claude Code para que cargue la skill /jelou-demo-whatsapp;
// el kit ya se puede usar de inmediato desde estos scripts.
const K = require("./lib/demo-kit");
const argv = process.argv.slice(2);
const val = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined; };

if (argv.includes("--verificar")) {
  const kit = K.findKit();
  if (kit) { console.log(`Plugin ${K.PLUGIN} instalado. Kit: ${kit}`); process.exit(0); }
  console.log(`Plugin ${K.PLUGIN} NO instalado. Ejecuta: node instalar_plugin_demos.js [--fuente <zip>]`);
  process.exit(1);
}
try {
  const r = K.install({ source: val("--fuente"), force: argv.includes("--forzar") });
  console.log(`Plugin ${K.PLUGIN}: ${r.accion}${r.origen ? " desde " + r.origen : ""}.\nKit: ${r.kit}`);
  if (r.accion !== "ya instalado") console.log("Abre una sesión nueva de Claude Code para que cargue la skill /jelou-demo-whatsapp.");
} catch (e) { console.error("Error: " + e.message); process.exit(1); }
