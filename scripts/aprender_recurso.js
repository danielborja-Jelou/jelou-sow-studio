#!/usr/bin/env node
// Enseña un recurso visual nuevo al simulador (pasarela, firma, biometría, un sistema del cliente…) con capturas reales.
// Guarda en TU carpeta de usuario (~/.claude/jelou-sow-studio/visuales/, sobrevive a las actualizaciones de la skill),
// o en la skill (--en skill), o solo para un cliente (--en cliente <sow.json> -> sow.demo.recursos).
//
// Ejemplos:
//   # Un proveedor nuevo de un recurso que ya existe (la receta se hereda; las capturas reemplazan las pantallas):
//   node aprender_recurso.js --base firma-electronica --proveedor firmaec --nombre "FirmaEC" --match "firmaec" \
//        --capturas ./capturas/firmaec --botones "Continuar,Firmar,Listo"
//   # Un recurso completamente nuevo (p. ej. el sistema de garantías de un cliente):
//   node aprender_recurso.js --id garantias --nombre "Registro de garantías" --aplica-a tercero,webview \
//        --senales "garant[ií]a" --proveedor garantias-ejemplo --proveedor-nombre "Garantías Ejemplo" --capturas ./capturas/garantias
//   # Traer lo que Jelou sabe de una app del marketplace (solo lectura): nombre, tipo, qué envuelve
//   node aprender_recurso.js --base pago --proveedor datafast --desde-marketplace datafast --experiencia webview
//
// Opciones: --id | --base, --nombre, --proveedor, --proveedor-nombre, --match, --senales, --aplica-a, --experiencia webview|nativa,
//           --capturas <carpeta|archivo,archivo>, --botones "a,b,c", --color "#hex", --desde-marketplace <slug>,
//           --en usuario|skill|cliente <sow.json>, --dry-run
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const R = require("./lib/demo-recursos");

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const flag = (f) => argv.includes(f);
const slug = (s) => String(s || "x").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "x";
const die = (m) => { console.error("Error: " + m); process.exit(1); };
const IMG = /\.(png|jpe?g|webp|gif|svg)$/i;

const base = val("--base"); const id = base || val("--id");
if (!id) die("indica --base <recurso existente> o --id <recurso nuevo>.");
const provId = slug(val("--proveedor", ""));
const destino = val("--en", "usuario");
const catalogo = R.cargarCatalogo({});
const existente = catalogo.find((r) => r.id === id);
if (base && !existente) die(`el recurso base «${base}» no existe. Disponibles: ${catalogo.map((r) => r.id).join(", ")}`);
if (!base && existente) console.log(`Aviso: ya existe un recurso «${id}»; se fusionará con lo que indiques.`);

// capturas
let capturas = [];
const cap = val("--capturas");
if (cap) {
  const items = cap.split(",").map((s) => s.trim()).filter(Boolean);
  for (const it of items) {
    if (!fs.existsSync(it)) die(`no existe ${it}`);
    if (fs.statSync(it).isDirectory()) capturas.push(...fs.readdirSync(it).filter((f) => IMG.test(f)).sort().map((f) => path.join(it, f)));
    else capturas.push(it);
  }
  if (!capturas.length) die("no encontré imágenes (png, jpg, webp, gif, svg) en --capturas.");
}

// marketplace (solo lectura)
let marketplace = null;
const slugMp = val("--desde-marketplace");
if (slugMp) {
  const r = spawnSync("jelou", ["marketplace", "inspect", slugMp, "--agent"], { encoding: "utf8", shell: process.platform === "win32" });
  try { const d = JSON.parse(r.stdout).data; marketplace = { slug: d.slug, tipo: d.type, descripcion: d.description, envuelve: arr(d.wraps).map((w) => w.name).filter(Boolean).join(", ") }; }
  catch (e) { console.log(`Aviso: no pude leer el marketplace «${slugMp}» (${(r.stderr || r.stdout || "").slice(0, 120).trim()}).`); }
}
function arr(x) { return Array.isArray(x) ? x : []; }

// entrada del recurso
const proveedor = provId ? {
  id: provId, nombre: val("--proveedor-nombre") || val("--nombre") || provId, match: val("--match") || (val("--proveedor-nombre") || provId).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().split(/[^a-z0-9]+/).filter(Boolean).join(".?"),
  ...(val("--experiencia") ? { experiencia: val("--experiencia") } : {}), ...(val("--color") ? { color: val("--color") } : {}),
  ...(val("--pais") ? { paises: val("--pais").split(",").map((s) => s.trim()) } : {}), ...(val("--recorte-superior") ? { recorte_superior: Number(val("--recorte-superior")) } : {}),
  ...(flag("--con-cabecera") ? { pantalla_completa: false } : {}),
  ...(marketplace ? { marketplace, docs: undefined } : {}), ...(val("--botones") ? { botones: val("--botones").split(",").map((s) => s.trim()) } : {}),
} : null;
const rutaImg = (dirBase) => path.join(dirBase, "imagenes", id, provId || "_");
const entrada = { id };
if (!base || !existente) {
  entrada.nombre = val("--nombre") || id;
  entrada.aplica_a = (val("--aplica-a") || "tercero,webview").split(",").map((s) => s.trim());
  entrada.senales = val("--senales") ? { texto: val("--senales") } : {};
  entrada.receta = { abre: "webview", nota: "{{proveedor}}: pantallas del proveedor (capturas reales).", mensaje: { cuerpo: "{{etapa}}", boton: "Continuar" },
    webview: { titulo: "{{proveedor}}", dominio: "{{proveedor_slug}}.demo", pantallas: [{ bloques: [{ tipo: "marca" }, { tipo: "aviso", texto: "Agrega capturas con --capturas." }], boton: "Continuar" }], exito: { titulo: "Paso completado", texto: "Vuelve al chat para continuar.", boton: "Volver a WhatsApp" } } };
  if (!proveedor && val("--match")) entrada.senales.texto = [entrada.senales.texto, val("--match")].filter(Boolean).join("|");
}
if (proveedor) entrada.proveedores = [proveedor];

function copiarCapturas(dirBase) {
  const dst = rutaImg(dirBase); fs.mkdirSync(dst, { recursive: true });
  return capturas.map((f, i) => { const n = `${String(i + 1).padStart(2, "0")}-${slug(path.basename(f, path.extname(f)))}${path.extname(f).toLowerCase()}`; fs.copyFileSync(f, path.join(dst, n)); return n; });
}

if (destino === "cliente") {
  const sowFile = argv[argv.indexOf("--en") + 2]; if (!sowFile || sowFile.startsWith("--")) die("--en cliente requiere la ruta del sow.json.");
  const sow = JSON.parse(fs.readFileSync(sowFile, "utf8")); sow.demo = sow.demo || {}; sow.demo.recursos = arr(sow.demo.recursos);
  const dirImg = path.join(path.dirname(path.resolve(sowFile)), "imagenes", id, provId || "_");
  if (capturas.length && proveedor) { fs.mkdirSync(dirImg, { recursive: true }); proveedor.capturas = capturas.map((f, i) => { const n = `${String(i + 1).padStart(2, "0")}-${slug(path.basename(f, path.extname(f)))}${path.extname(f).toLowerCase()}`; if (!flag("--dry-run")) fs.copyFileSync(f, path.join(dirImg, n)); return n; }); }
  const i = sow.demo.recursos.findIndex((r) => r.id === id); if (i >= 0) sow.demo.recursos[i] = { ...sow.demo.recursos[i], ...entrada }; else sow.demo.recursos.push(entrada);
  if (flag("--dry-run")) console.log(JSON.stringify(entrada, null, 2)); else { fs.writeFileSync(sowFile, JSON.stringify(sow, null, 2), "utf8"); console.log(`Recurso «${id}${provId ? "/" + provId : ""}» guardado en ${sowFile} (demo.recursos). Capturas junto al sow.json en imagenes/${id}/.`); }
  process.exit(0);
}

const dirCat = destino === "skill" ? R.SKILL_DIR : R.USER_DIR;
const f = path.join(dirCat, "recursos.json");
const cat = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : { version: 2, leeme: "Recursos que enseñaste al simulador (se fusionan sobre los de la skill). Ver references/simulador-visual.md.", recursos: [] };
if (capturas.length && proveedor) {
  if (flag("--dry-run")) proveedor.capturas = capturas.map((c, i) => `${String(i + 1).padStart(2, "0")}-${slug(path.basename(c, path.extname(c)))}${path.extname(c).toLowerCase()}`);
  else proveedor.capturas = copiarCapturas(dirCat);
}
const k = cat.recursos.findIndex((r) => r.id === id);
if (k >= 0) { const prev = cat.recursos[k]; const m = new Map(arr(prev.proveedores).map((p) => [p.id, p])); for (const p of arr(entrada.proveedores)) m.set(p.id, { ...(m.get(p.id) || {}), ...p }); cat.recursos[k] = { ...prev, ...entrada, senales: { ...(prev.senales || {}), ...(entrada.senales || {}) }, proveedores: [...m.values()] }; }
else cat.recursos.push(entrada);
if (flag("--dry-run")) { console.log(JSON.stringify(entrada, null, 2)); process.exit(0); }
fs.mkdirSync(dirCat, { recursive: true }); fs.writeFileSync(f, JSON.stringify(cat, null, 2), "utf8");
console.log(`Recurso «${id}${provId ? "/" + provId : ""}» guardado en ${f}${capturas.length ? ` con ${capturas.length} captura(s)` : ""}.`);
if (marketplace) console.log(`Marketplace: ${marketplace.slug} (${marketplace.tipo})${marketplace.envuelve ? " · envuelve: " + marketplace.envuelve : ""}`);
console.log("Siguiente: vuelve a generar el simulador (build_all.js o sow_a_demo.js) y revisa que el paso use el recurso (línea «Cobertura visual»).");
