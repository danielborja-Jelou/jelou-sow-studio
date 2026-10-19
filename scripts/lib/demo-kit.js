// Localiza (y, si falta, instala) el plugin `jelou-demos-whatsapp`, cuyo kit genera el simulador de WhatsApp.
// El plugin se instala una sola vez por máquina; la skill jelou-sow-studio lo usa desde `claude plugin list`.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const PLUGIN = "jelou-demos-whatsapp";
const MARKETPLACE = "jelou-demos";
const LOCAL_DIR = path.join(os.homedir(), ".claude", "marketplaces-locales", "jelou-demos-plugin");
const KIT_REL = path.join("skills", "jelou-demo-whatsapp", "kit");
const SKILL_ROOT = path.join(__dirname, "..", "..");

const claude = (args) => spawnSync("claude", args, { encoding: "utf8", shell: process.platform === "win32" });
const kitOf = (pluginDir) => { const k = path.join(pluginDir, KIT_REL); return fs.existsSync(path.join(k, "build.py")) ? k : null; };

// Ruta del plugin según `claude plugin list` (null si no está instalado)
function installedPluginDir() {
  const r = claude(["plugin", "list"]);
  if (r.status !== 0 || !r.stdout) return null;
  const m = r.stdout.match(new RegExp(`${PLUGIN}@[^\\n]*\\n[\\s\\S]*?Read from:\\s*([^\\n]+)`));
  return m ? m[1].trim() : null;
}

// ---- skill `jelou-demo-whatsapp` de la skill library (misma skill que el plugin, sin instalar nada en Claude Code) ----
const LIB_SKILL = "jelou-demo-whatsapp";
const kitDeSkill = (dir) => { const k = path.join(dir, "kit"); return fs.existsSync(path.join(k, "build.py")) ? k : null; };
function skillboxCmd() {
  const cands = [process.env.SKILLBOX_MJS, path.join(os.homedir(), ".local", "share", "jelou-skills", "skillbox.mjs")].filter(Boolean);
  const mjs = cands.find((c) => fs.existsSync(c));
  return mjs ? { cmd: "node", args: [mjs] } : null;
}
// Última copia ya descargada por skillbox (no usa red)
function kitFromSkillCache() {
  const root = process.env.SKILLBOX_CACHE || path.join(os.homedir(), ".cache", "skillbox");
  if (!fs.existsSync(root)) return null;
  const found = [];
  for (const h of fs.readdirSync(root)) {
    const d = path.join(root, h); if (!fs.statSync(d).isDirectory()) continue;
    for (const s of fs.readdirSync(d)) if (s.startsWith(LIB_SKILL + "-")) { const k = kitDeSkill(path.join(d, s)); if (k) found.push({ k, t: fs.statSync(path.join(d, s)).mtimeMs }); }
  }
  found.sort((a, b) => b.t - a.t); return found.length ? found[0].k : null;
}
// Descarga (o refresca) la skill desde la library con `skillbox fetch`
function kitFromLibrary() {
  const sb = skillboxCmd(); if (!sb) return null;
  const r = spawnSync(sb.cmd, [...sb.args, "fetch", LIB_SKILL], { encoding: "utf8" });
  // skillbox falla (EPERM al renombrar) si esa revisión ya está en la caché: en ese caso se usa la copia descargada
  if (r.status !== 0) return kitFromSkillCache();
  const dir = (r.stdout || "").trim().split("\n").pop().trim();
  return dir && fs.existsSync(dir) ? kitDeSkill(dir) : null;
}

// Kit instalado y utilizable, o null: plugin instalado, carpeta estable del plugin, o skill ya descargada de la library
function findKit() {
  const dir = installedPluginDir();
  if (dir) { const k = kitOf(dir); if (k) return k; }
  const local = kitOf(path.join(LOCAL_DIR, "plugins", PLUGIN));   // carpeta estable, aunque `claude` no responda
  return local || kitFromSkillCache();
}

// Busca el origen del plugin: argumento, variable de entorno, assets de la skill, Descargas
function findSource(explicit) {
  const cands = [explicit, process.env.JELOU_DEMOS_PLUGIN];
  const assets = path.join(SKILL_ROOT, "assets");
  if (fs.existsSync(assets)) for (const f of fs.readdirSync(assets)) if (/^jelou-demos-plugin.*\.zip$/i.test(f)) cands.push(path.join(assets, f));
  const dl = path.join(os.homedir(), "Downloads");
  if (fs.existsSync(dl)) {
    const zips = fs.readdirSync(dl).filter((f) => /^jelou-demos-plugin.*\.zip$/i.test(f)).map((f) => path.join(dl, f));
    zips.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    cands.push(...zips);
  }
  return cands.filter(Boolean).find((c) => fs.existsSync(c)) || null;
}

function extractZip(zip, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const code = "import sys,zipfile;zipfile.ZipFile(sys.argv[1]).extractall(sys.argv[2])";
  for (const py of ["python", "python3"]) {
    const r = spawnSync(py, ["-I", "-c", code, zip, dest], { encoding: "utf8" });
    if (r.status === 0) return;
  }
  throw new Error("No se pudo descomprimir el zip: se necesita Python 3 (python o python3) en el PATH.");
}

// Instala (o actualiza con force) el plugin desde un zip o carpeta. Devuelve la ruta del kit.
function install({ source, force } = {}) {
  const had = installedPluginDir();
  if (had && !force && kitOf(had)) return { kit: kitOf(had), accion: "ya instalado" };
  // 1) la skill de la library (no requiere plugin ni reiniciar Claude Code); --fuente o --forzar piden el plugin explícitamente
  if (!source && !force) { const k = kitFromLibrary(); if (k) return { kit: k, accion: "descargado de la skill library (skill jelou-demo-whatsapp)" }; }
  const src = findSource(source);
  if (!src) throw new Error(`No encontré el kit del simulador. Opciones: la skill de la library (skillbox fetch ${LIB_SKILL}), o el plugin ${PLUGIN}: pasa --fuente <zip|carpeta>, define JELOU_DEMOS_PLUGIN, o deja jelou-demos-plugin-vX.Y.Z.zip en assets/ de la skill o en Descargas.`);
  let folder = src;
  if (/\.zip$/i.test(src)) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "jelou-demos-"));
    extractZip(src, tmp);
    folder = path.join(tmp, "jelou-demos-plugin");
  }
  if (!fs.existsSync(path.join(folder, ".claude-plugin", "marketplace.json"))) throw new Error(`${folder} no parece el marketplace jelou-demos (falta .claude-plugin/marketplace.json).`);
  fs.mkdirSync(path.dirname(LOCAL_DIR), { recursive: true });
  fs.cpSync(folder, LOCAL_DIR, { recursive: true, force: true });
  if (had) {
    claude(["plugin", "marketplace", "update", MARKETPLACE]);
    const u = claude(["plugin", "update", `${PLUGIN}@${MARKETPLACE}`]);
    if (u.status !== 0) throw new Error("claude plugin update falló: " + (u.stderr || u.stdout));
  } else {
    const a = claude(["plugin", "marketplace", "add", LOCAL_DIR]);
    if (a.status !== 0 && !/already/i.test(a.stdout + a.stderr)) throw new Error("claude plugin marketplace add falló: " + (a.stderr || a.stdout));
    const i = claude(["plugin", "install", `${PLUGIN}@${MARKETPLACE}`]);
    if (i.status !== 0) throw new Error("claude plugin install falló: " + (i.stderr || i.stdout));
  }
  const kit = findKit();
  if (!kit) throw new Error("El plugin se instaló pero no encuentro su kit.");
  return { kit, accion: had ? "actualizado" : "instalado", origen: src };
}

module.exports = { findKit, install, installedPluginDir, kitFromLibrary, kitFromSkillCache, LOCAL_DIR, PLUGIN, MARKETPLACE, LIB_SKILL };
