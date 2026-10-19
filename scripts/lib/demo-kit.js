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

// Kit instalado y utilizable, o null
function findKit() {
  const dir = installedPluginDir();
  if (dir) { const k = kitOf(dir); if (k) return k; }
  const local = kitOf(path.join(LOCAL_DIR, "plugins", PLUGIN));   // carpeta estable, aunque `claude` no responda
  return local;
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
  const src = findSource(source);
  if (!src) throw new Error(`No encontré el plugin ${PLUGIN}. Pasa --fuente <zip|carpeta>, define JELOU_DEMOS_PLUGIN, o deja jelou-demos-plugin-vX.Y.Z.zip en assets/ de la skill o en Descargas.`);
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

module.exports = { findKit, install, installedPluginDir, LOCAL_DIR, PLUGIN, MARKETPLACE };
