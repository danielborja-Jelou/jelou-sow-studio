#!/usr/bin/env node
// Aprende pantallas faltantes desde la documentación pública de Jelou (docs.jelou.ai): busca la página, descarga las capturas de lo que
// VE la persona (webview, checkout, mensaje en WhatsApp), saca fotogramas de animaciones (GIF) y videos (mp4) y registra el recurso con
// aprender_recurso.js. Es el camino por defecto cuando el simulador avisa «usa la pantalla genérica de respaldo» o un recurso no tiene capturas.
//
//   node aprender_desde_docs.js --buscar wompi                       # páginas de la documentación que mencionan «wompi»
//   node aprender_desde_docs.js --pagina guides/integraciones/pagos/proveedores/wompi/uso-y-configuracion \
//        --base pago --proveedor wompi --proveedor-nombre Wompi --experiencia webview
//   node aprender_desde_docs.js --pagina <ruta> --videos --dry-run    # solo muestra qué tomaría (con fotogramas de videos)
//   node aprender_desde_docs.js --sembrar                             # aprende TODO el manifiesto assets/visuales/fuentes-docs.json (una vez por máquina)
//
// Opciones: --pagina <ruta o URL> | --buscar <texto> | --sembrar; --base <recurso> | --id <recurso>; --proveedor, --proveedor-nombre, --match,
//   --nombre, --senales, --aplica-a, --experiencia, --botones, --color, --pais (se pasan a aprender_recurso.js); --filtro <regex de alt>,
//   --excluir <regex de alt>, --solo <regex sobre alt/archivo>, --max <n> (capturas, por defecto 8), --videos, --incluir-todo,
//   --en usuario|skill|cliente <sow.json>, --dry-run.
// Las capturas son material de la documentación de Jelou: se guardan en TU carpeta de usuario (uso interno), no en la skill publicada;
// cada persona las reconstruye con --sembrar.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const argv = process.argv.slice(2);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d; };
const flag = (f) => argv.includes(f);
const die = (m) => { console.error("Error: " + m); process.exit(1); };
const ORIGEN = "https://docs.jelou.ai";
const sh = process.platform === "win32";

async function get(url, binario) {
  const r = await fetch(url, { redirect: "follow" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return binario ? Buffer.from(await r.arrayBuffer()) : r.text();
}

async function buscar(texto) {
  const idx = await get(`${ORIGEN}/llms.txt`);
  const listas = [...idx.matchAll(/\((https:\/\/docs\.jelou\.ai\/_llms\/es\/[^)\s]+\.txt)\)/g)].map((m) => m[1]);
  const re = new RegExp(texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"); const out = [];
  for (const l of listas) {
    let t; try { t = await get(l); } catch (e) { continue; }
    for (const linea of t.split("\n")) { const m = linea.match(/\[([^\]]+)\]\((https:\/\/docs\.jelou\.ai[^)\s]+)\)/); if (m && (re.test(m[1]) || re.test(m[2]))) out.push(`${m[1]}  →  ${m[2].replace(ORIGEN + "/", "")}`); }
  }
  return [...new Set(out)];
}

const unicos = (xs) => { const seen = new Set(); return xs.filter((i) => { const k = i.src.split("?")[0]; if (seen.has(k)) return false; seen.add(k); return /^https?:/.test(i.src); }); };
const imagenesDe = (md) => {
  const out = [];
  for (const m of md.matchAll(/<img\b[^>]*>/g)) { const s = m[0]; const src = (s.match(/\ssrc=["']([^"']+)["']/) || [])[1]; const alt = (s.match(/\salt=["']([^"']*)["']/) || [])[1] || ""; if (src) out.push({ src, alt }); }
  for (const m of md.matchAll(/!\[([^\]]*)\]\(([^)\s]+)\)/g)) out.push({ src: m[2], alt: m[1] });
  return unicos(out);
};
const videosDe = (md) => {
  const out = [];
  for (const m of md.matchAll(/(?:caption=["']([^"']*)["'][\s\S]{0,400}?)?<video\b[^>]*\ssrc=["']([^"']+)["']/g)) out.push({ src: m[2], alt: m[1] || "", video: true });
  return unicos(out);
};

// fotogramas distintos de un GIF (necesita Python con Pillow)
function fotogramasGif(gif, dir, max) {
  const code = [
    "import sys",
    "from PIL import Image, ImageChops, ImageStat",
    "src, out, mx = sys.argv[1], sys.argv[2], int(sys.argv[3])",
    "im = Image.open(src); n = im.n_frames; pick = []; last = None",
    "for i in range(n):",
    "    im.seek(i); f = im.convert('RGB')",
    "    if last is None or sum(ImageStat.Stat(ImageChops.difference(f.resize((64,128)), last)).mean) > 14:",
    "        pick.append(f.copy()); last = f.resize((64,128))",
    "if len(pick) > mx: pick = [pick[int(k*(len(pick)-1)/(mx-1))] for k in range(mx)]",
    "for k, f in enumerate(pick): f.save(f'{out}-{k+1:02d}.png')",
    "print(len(pick))",
  ].join("\n");
  for (const py of ["python", "python3"]) {
    const r = spawnSync(py, ["-I", "-c", code, gif, path.join(dir, path.basename(gif, ".gif")), String(max)], { encoding: "utf8" });
    if (r.status === 0) return parseInt(r.stdout.trim(), 10) || 0;
  }
  return -1;
}
// fotogramas de un video con ffmpeg (cambios de escena; si hay pocos, uno por segundo)
function fotogramasVideo(mp4, dir, max) {
  const stem = path.basename(mp4, path.extname(mp4)); const base = path.join(dir, stem);
  const lista = () => fs.readdirSync(dir).filter((f) => f.startsWith(stem + "-") && f.endsWith(".png")).sort();
  let r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-vf", "select='gt(scene,0.06)',scale=480:-2", "-vsync", "vfr", `${base}-%02d.png`], { encoding: "utf8", shell: sh });
  let files = lista();
  if (r.status !== 0 || files.length < 3) {
    for (const f of files) fs.unlinkSync(path.join(dir, f));
    r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp4, "-vf", "fps=1,scale=480:-2", `${base}-%02d.png`], { encoding: "utf8", shell: sh });
    files = lista();
  }
  if (r.status !== 0 && !files.length) return -1;
  while (files.length > max) { const k = Math.floor(files.length / 2); fs.unlinkSync(path.join(dir, files[k])); files.splice(k, 1); }
  return files.length;
}

async function aprenderPagina(o) {
  const pag = o.pagina;
  const url = /^https?:/.test(pag) ? pag.replace(/\.md$/, "") + ".md" : `${ORIGEN}/${String(pag).replace(/^\/+/, "").replace(/\.mdx?$/, "")}.md`;
  const md = await get(url);
  const incluir = o.todo ? null : new RegExp(o.filtro || "webview|checkout|whatsapp|vista previa|mensaje|experiencia|pantalla|ejemplo de|usuario final|pagador|conversaci", "i");
  const excluir = new RegExp(o.excluir || "nodo|canvas|panel|pesta[ñn]a|configuraci|sidebar|api key|credencial|dashboard|marketplace|sandbox accounts|cuenta personal|wizard|modal de brain|instalaci|registro en|clave secreta", "i");
  const todas = [...imagenesDe(md), ...(o.videos ? videosDe(md) : [])];
  const sol = o.solo ? new RegExp(o.solo, "i") : null;
  const candidatas = todas.filter((i) => (!incluir || incluir.test(i.alt) || (i.video && !i.alt)) && !excluir.test(i.alt) && (!sol || sol.test(`${i.alt} ${i.src}`)));
  console.log(`${url}\n${todas.length} recurso(s) en la página, ${candidatas.length} de lo que ve la persona:`);
  candidatas.forEach((i) => console.log(`  - ${i.video ? "[video] " : ""}${i.alt || "(sin texto)"}  [${i.src.split("?")[0].split("/").pop()}]`));
  if (!candidatas.length) { console.log("Nada que aprender aquí. Prueba --incluir-todo, --videos o otra página (--buscar)."); return 0; }
  if (o.dry) return candidatas.length;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "docs-")); const max = parseInt(o.max || "8", 10);
  for (const [k, i] of candidatas.entries()) {
    const ext = (i.src.split("?")[0].match(/\.(png|jpe?g|webp|gif|mp4|webm)$/i) || [".png"])[0].toLowerCase();
    const f = path.join(tmp, `${String(k + 1).padStart(2, "0")}${ext}`);
    try { fs.writeFileSync(f, await get(i.src, true)); } catch (e) { console.log(`  (no pude bajar ${i.src.split("?")[0].split("/").pop()}: ${e.message})`); continue; }
    if (ext === ".gif") { const c = fotogramasGif(f, tmp, Math.max(3, max)); fs.unlinkSync(f); if (c < 0) console.log("  (no pude sacar fotogramas del GIF: instala Pillow, `pip install pillow`)"); }
    else if (ext === ".mp4" || ext === ".webm") { const c = fotogramasVideo(f, tmp, Math.max(3, max)); fs.unlinkSync(f); if (c < 0) console.log("  (no pude sacar fotogramas del video: instala ffmpeg)"); }
  }
  const imgs = fs.readdirSync(tmp).filter((f) => /\.(png|jpe?g|webp|gif)$/i.test(f)).sort();
  if (!imgs.length) { console.log("  (no quedó ninguna imagen utilizable)"); return 0; }
  imgs.splice(0, parseInt(o.omitir || "0", 10));   // p. ej. el primer fotograma suele ser el chat, no la pantalla del proveedor
  while (imgs.length > max) imgs.splice(Math.floor(imgs.length / 2), 1);
  const lista = imgs.map((f) => path.join(tmp, f)).join(",");
  const pasar = ["base", "id", "proveedor", "proveedor-nombre", "match", "nombre", "senales", "aplica-a", "experiencia", "botones", "color", "pais", "recorte-superior"].flatMap((k) => (o[k] ? [`--${k}`, String(o[k])] : []));
  const en = o.en ? ["--en", ...String(o.en).split(" ")] : [];
  const r = spawnSync("node", [path.join(__dirname, "aprender_recurso.js"), ...pasar, "--capturas", lista, ...en], { stdio: "inherit" });
  if (r.status !== 0) throw new Error("aprender_recurso.js falló");
  console.log(`Fuente: ${url} (${imgs.length} captura(s)). Revisa que sean las pantallas correctas y en orden.`);
  return imgs.length;
}

const enArg = () => { const i = argv.indexOf("--en"); return i >= 0 ? argv.slice(i + 1, i + 3).filter((x, j) => j === 0 || !x.startsWith("--")).join(" ") : undefined; };

(async () => {
  if (flag("--sembrar")) {
    const f = path.join(__dirname, "..", "assets", "visuales", "fuentes-docs.json");
    const m = JSON.parse(fs.readFileSync(f, "utf8")); let ok = 0, mal = 0;
    for (const e of m.fuentes) {
      console.log(`\n== ${e.base || e.id}/${e.proveedor || "-"}${e.pais ? " (" + e.pais + ")" : ""} ==`);
      try { const n = await aprenderPagina({ ...e, en: enArg() }); n ? ok++ : mal++; } catch (err) { console.log("  Error: " + err.message); mal++; }
    }
    console.log(`\nSembrado: ${ok} fuente(s) aprendidas, ${mal} sin material o con error. Destino: ${process.env.JELOU_SOW_VISUALES || path.join(os.homedir(), ".claude", "jelou-sow-studio", "visuales")}`);
    return;
  }
  if (val("--buscar")) {
    const r = await buscar(val("--buscar"));
    if (!r.length) { console.log("Sin resultados."); return; }
    console.log(r.slice(0, 40).join("\n")); if (r.length > 40) console.log(`… y ${r.length - 40} más.`); return;
  }
  const pag = val("--pagina") || val("--url"); if (!pag) die("indica --pagina <ruta> (usa --buscar <texto> para encontrarla) o --sembrar.");
  const o = { pagina: pag, todo: flag("--incluir-todo"), videos: flag("--videos"), dry: flag("--dry-run"), en: enArg() };
  for (const k of ["filtro", "excluir", "max", "solo", "omitir", "base", "id", "proveedor", "proveedor-nombre", "match", "nombre", "senales", "aplica-a", "experiencia", "botones", "color", "pais", "recorte-superior"]) if (val("--" + k)) o[k] = val("--" + k);
  await aprenderPagina(o);
})().catch((e) => die(e.message));
