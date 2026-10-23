#!/usr/bin/env node
// Entrega a Google Drive de la cuenta de la persona que usa la skill: <Company>/inicio | proceso | cierre.
//   inicio  = pre-kickoff (deck, faltantes, simulador del pre-kickoff)     -> sow.json con meta.fase "prekickoff"
//   proceso = SOW en revisión (Word, diagramas, simulador, cambios)         -> versiones 1.x / 2.x con meta.estado "en_revision"
//   cierre  = SOW aprobado (Word, Gantt, cronograma, propuesta)             -> meta.estado "aprobado"
// Siempre prepara la carpeta local `<out>/drive/<Company>/<etapa>/` (se puede arrastrar a Drive a mano). Con --subir la sube a Drive de la persona.
// Es visible para terceros solo si se comparte: este script NO comparte nada. Antes de --subir, la skill muestra el plan y pide confirmación.
//
// Uso: node entrega_drive.js sow.json out-dir [--etapa inicio|proceso|cierre] [--subir] [--raiz <folderId>] [--dry-run]
// Credencial para --subir (en este orden): variable GOOGLE_DRIVE_TOKEN, o `gcloud auth print-access-token` (cuenta con --enable-gdrive-access).
// Sin credencial no falla: deja la carpeta local lista y dice cómo subirla (conector de Drive de Claude o arrastrándola).
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ETAPAS = ["inicio", "proceso", "cierre"];
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const MIME = { ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation", ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ".pdf": "application/pdf", ".png": "image/png", ".svg": "image/svg+xml", ".html": "text/html", ".md": "text/markdown", ".json": "application/json" };

// Nombre de carpeta seguro en Drive y en el disco
const limpio = (s) => String(s || "").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || "Proyecto";

function etapaDe(sow, forzada) {
  if (forzada) { if (!ETAPAS.includes(forzada)) throw new Error(`Etapa «${forzada}» no válida. Usa: ${ETAPAS.join(", ")}.`); return { etapa: forzada, motivo: "indicada por la persona" }; }
  const m = (sow && sow.meta) || {};
  if (String(m.estado || "").toLowerCase() === "aprobado") return { etapa: "cierre", motivo: "meta.estado = aprobado" };
  if (m.fase === "prekickoff") return { etapa: "inicio", motivo: "meta.fase = prekickoff" };
  return { etapa: "proceso", motivo: "SOW en revisión" };
}

// Archivos entregables de la carpeta de salida (no se suben guiones intermedios, linter ni node_modules)
function archivosDe(outDir) {
  const out = [];
  const OK = new Set([".docx", ".pptx", ".xlsx", ".pdf", ".html", ".md", ".png"]);
  const rec = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name.startsWith(".") || e.name === "node_modules" || e.name === "drive") continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (rel.length < 2) rec(p, [...rel, e.name]); continue; }
      const ext = path.extname(e.name).toLowerCase();
      if (!OK.has(ext) || /guion\.json$|-lint\./i.test(e.name)) continue;
      if (ext === ".png" && !rel.length) continue;           // las imágenes sueltas de la raíz no son entregables
      out.push({ origen: p, rel: [...rel, e.name], bytes: fs.statSync(p).size });
    }
  };
  rec(outDir, []);
  return out;
}

function plan(sow, outDir, opts = {}) {
  const { etapa, motivo } = etapaDe(sow, opts.etapa);
  const empresa = limpio((sow.meta || {}).cliente || (sow.meta || {}).proyecto);
  const archivos = archivosDe(outDir);
  const local = path.join(outDir, "drive", empresa, etapa);
  return { empresa, etapa, motivo, ruta: `${empresa}/${etapa}`, local, archivos, bytes: archivos.reduce((a, f) => a + f.bytes, 0) };
}

function prepararLocal(p) {
  fs.mkdirSync(p.local, { recursive: true });
  for (const f of p.archivos) { const d = path.join(p.local, ...f.rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(f.origen, d); }
}

function token() {
  if (process.env.GOOGLE_DRIVE_TOKEN) return process.env.GOOGLE_DRIVE_TOKEN.trim();
  const r = spawnSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8", shell: process.platform === "win32" });
  return r.status === 0 ? String(r.stdout || "").trim() : null;
}

// ---- Drive v3 (REST). `http` se puede inyectar en las pruebas ----
async function api(http, tk, url, init = {}) {
  const r = await http(url, { ...init, headers: { Authorization: `Bearer ${tk}`, ...(init.headers || {}) } });
  if (!r.ok) throw new Error(`Drive ${r.status}: ${String(await r.text()).slice(0, 200)}`);
  return r;
}
const q = (s) => String(s).replace(/\\/g, "\\\\").replace(/'/g, "\\'");
async function carpeta(http, tk, nombre, padre) {
  const filtro = `name='${q(nombre)}' and mimeType='application/vnd.google-apps.folder' and trashed=false and '${padre}' in parents`;
  const b = await (await api(http, tk, `${DRIVE}/files?q=${encodeURIComponent(filtro)}&fields=files(id,name)&spaces=drive`)).json();
  if (b.files && b.files[0]) return b.files[0].id;
  const c = await (await api(http, tk, `${DRIVE}/files?fields=id`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: nombre, mimeType: "application/vnd.google-apps.folder", parents: [padre] }) })).json();
  return c.id;
}
async function subirArchivo(http, tk, f, padre) {
  const nombre = f.rel[f.rel.length - 1];
  const filtro = `name='${q(nombre)}' and trashed=false and '${padre}' in parents`;
  const ex = await (await api(http, tk, `${DRIVE}/files?q=${encodeURIComponent(filtro)}&fields=files(id)`)).json();
  const id = ex.files && ex.files[0] && ex.files[0].id;   // mismo nombre: se reemplaza el contenido y se conserva el enlace
  const mime = MIME[path.extname(nombre).toLowerCase()] || "application/octet-stream";
  const ini = await api(http, tk, id ? `${UPLOAD}/files/${id}?uploadType=resumable&fields=id` : `${UPLOAD}/files?uploadType=resumable&fields=id`, {
    method: id ? "PATCH" : "POST", headers: { "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime },
    body: JSON.stringify(id ? {} : { name: nombre, parents: [padre] }) });
  const loc = ini.headers.get("location");
  const r = await api(http, tk, loc, { method: "PUT", headers: { "Content-Type": mime }, body: fs.readFileSync(f.origen) });
  return { id: (await r.json()).id, reemplazado: !!id };
}
async function subir(p, { http = fetch, tk, raiz = "root" } = {}) {
  const idEmpresa = await carpeta(http, tk, p.empresa, raiz);
  const idEtapa = await carpeta(http, tk, p.etapa, idEmpresa);
  for (const e of ETAPAS) if (e !== p.etapa) await carpeta(http, tk, e, idEmpresa);   // deja la estructura completa: inicio, proceso y cierre
  const cache = new Map([["", idEtapa]]); const res = [];
  for (const f of p.archivos) {
    let padre = idEtapa; let clave = "";
    for (const d of f.rel.slice(0, -1)) { clave += "/" + d; if (!cache.has(clave)) cache.set(clave, await carpeta(http, tk, d, padre)); padre = cache.get(clave); }
    const r = await subirArchivo(http, tk, f, padre);
    res.push({ archivo: f.rel.join("/"), ...r });
  }
  return { carpeta: `https://drive.google.com/drive/folders/${idEtapa}`, archivos: res };
}

async function main() {
  const args = process.argv.slice(2);
  const val = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const pos = args.filter((a, i) => !a.startsWith("--") && !["--etapa", "--raiz"].includes(args[i - 1]));
  const [inFile, outDir] = pos;
  if (!inFile || !outDir) { console.error("Uso: node entrega_drive.js sow.json out-dir [--etapa inicio|proceso|cierre] [--subir] [--raiz <folderId>] [--dry-run]"); process.exit(2); }
  const sow = JSON.parse(fs.readFileSync(inFile, "utf8"));
  const p = plan(sow, outDir, { etapa: val("--etapa") });
  console.log(`Entrega a Drive · ${p.ruta}/  (etapa por ${p.motivo})`);
  console.log(`  ${p.archivos.length} archivo(s), ${(p.bytes / 1048576).toFixed(1)} MB:`);
  p.archivos.forEach((f) => console.log(`   - ${f.rel.join("/")}`));
  if (!p.archivos.length) { console.error("No hay archivos entregables en la carpeta de salida: genera el paquete primero (build_all.js)."); process.exit(1); }
  if (args.includes("--dry-run")) { console.log("Dry run: no se copió ni se subió nada."); return; }
  prepararLocal(p);
  console.log(`Carpeta local lista: ${p.local}`);
  if (!args.includes("--subir")) { console.log("Para subirla a tu Drive: repite el comando con --subir (o arrastra esa carpeta a Drive)."); return; }
  const tk = token();
  if (!tk) {
    console.log("Sin credencial de Drive (GOOGLE_DRIVE_TOKEN o gcloud con acceso a Drive). Alternativas: súbela con el conector de Drive de Claude (archivos pequeños), o arrastra la carpeta local a tu Drive.");
    process.exit(3);
  }
  const r = await subir(p, { tk, raiz: val("--raiz") || "root" });
  console.log(`Subido a tu Drive: ${r.carpeta}`);
  r.archivos.forEach((a) => console.log(`   ${a.reemplazado ? "actualizado" : "nuevo"}: ${a.archivo}`));
  console.log("No se compartió con nadie; compártelo tú desde Drive si hace falta.");
}

if (require.main === module) main().catch((e) => { console.error(String(e.message || e)); process.exit(1); });
module.exports = { plan, etapaDe, archivosDe, subir, limpio, prepararLocal };
