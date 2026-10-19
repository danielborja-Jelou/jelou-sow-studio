// Recursos visuales sintéticos para el simulador (datos de ejemplo, nunca reales): foto de un ticket con QR, foto de un documento.
// Se devuelven como data URI PNG para ir dentro del guion del kit (`imagen: { src }`).
const fs = require("fs");
const path = require("path");

const FONTS = path.join(__dirname, "..", "..", "assets", "fonts");
const FONT_FILES = ["Poppins-Regular.ttf", "Poppins-SemiBold.ttf"].map((f) => path.join(FONTS, f)).filter((f) => fs.existsSync(f));

// PRNG determinista para que el mismo SOW produzca siempre la misma imagen
function rng(seed) { let s = 0; for (const ch of String(seed)) s = (s * 31 + ch.charCodeAt(0)) >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

// Matriz tipo QR (21x21, tres cuadros de posición + módulos pseudoaleatorios). Es una imagen de ejemplo, NO un QR legible.
function qrModules(seed) {
  const N = 21, r = rng(seed), m = Array.from({ length: N }, () => Array.from({ length: N }, () => r() > 0.52));
  const finder = (x0, y0) => { for (let y = -1; y <= 7; y++) for (let x = -1; x <= 7; x++) { const X = x0 + x, Y = y0 + y; if (X < 0 || Y < 0 || X >= N || Y >= N) continue; const ring = x === 0 || x === 6 || y === 0 || y === 6, core = x >= 2 && x <= 4 && y >= 2 && y <= 4; m[Y][X] = x >= 0 && x <= 6 && y >= 0 && y <= 6 && (ring || core); } };
  finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
  return m;
}

function ticketSvg(o = {}) {
  const W = 600, H = 800, N = 21, cell = 15, qx = (W - N * cell) / 2, qy = 250, esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const m = qrModules(o.seed || "ticket");
  let rects = "";
  m.forEach((row, y) => row.forEach((on, x) => { if (on) rects += `<rect x="${qx + x * cell}" y="${qy + y * cell}" width="${cell}" height="${cell}"/>`; }));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Poppins">
  <rect width="${W}" height="${H}" fill="#cfd8dc"/>
  <g transform="rotate(-2 300 400)"><rect x="60" y="40" width="480" height="720" rx="14" fill="#ffffff" stroke="#b0bec5" stroke-width="3"/>
  <rect x="60" y="40" width="480" height="96" rx="14" fill="${o.color || "#0f3d5e"}"/>
  <text x="300" y="98" text-anchor="middle" font-size="30" font-weight="600" fill="#ffffff">${esc(o.titulo || "TICKET DE PARQUEO")}</text>
  <text x="300" y="190" text-anchor="middle" font-size="22" fill="#37474f">${esc(o.sitio || "")}</text>
  <rect x="${qx - 14}" y="${qy - 14}" width="${N * cell + 28}" height="${N * cell + 28}" fill="#ffffff" stroke="#263238" stroke-width="3"/>
  <g fill="#111">${rects}</g>
  <text x="300" y="${qy + N * cell + 62}" text-anchor="middle" font-size="26" font-weight="600" fill="#263238">${esc(o.numero || "Nº 000123")}</text>
  <text x="300" y="${qy + N * cell + 100}" text-anchor="middle" font-size="20" fill="#607d8b">${esc(o.linea || "Ingreso 14:05 · Ejemplo")}</text>
  <text x="300" y="730" text-anchor="middle" font-size="16" fill="#90a4ae">Imagen de ejemplo para la demostración</text></g></svg>`;
}

function documentoSvg(o = {}) {
  const W = 600, H = 800, esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Poppins">
  <rect width="${W}" height="${H}" fill="#cfd8dc"/><rect x="70" y="150" width="460" height="300" rx="16" fill="#ffffff" stroke="#b0bec5" stroke-width="3"/>
  <rect x="94" y="180" width="110" height="140" rx="8" fill="#cfd8dc"/><circle cx="149" cy="226" r="26" fill="#90a4ae"/><rect x="119" y="262" width="60" height="40" rx="20" fill="#90a4ae"/>
  <text x="230" y="204" font-size="22" font-weight="600" fill="#263238">${esc(o.titulo || "DOCUMENTO DE IDENTIDAD")}</text>
  <rect x="230" y="224" width="260" height="14" rx="7" fill="#cfd8dc"/><rect x="230" y="252" width="200" height="14" rx="7" fill="#cfd8dc"/><rect x="230" y="280" width="230" height="14" rx="7" fill="#cfd8dc"/>
  <rect x="94" y="350" width="396" height="14" rx="7" fill="#eceff1"/><rect x="94" y="378" width="300" height="14" rx="7" fill="#eceff1"/>
  <text x="300" y="560" text-anchor="middle" font-size="16" fill="#90a4ae">Imagen de ejemplo para la demostración</text></svg>`;
}

function selfieSvg(o = {}) {
  const W = 600, H = 800;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Poppins">
  <rect width="${W}" height="${H}" fill="#9fb4bd"/><ellipse cx="300" cy="360" rx="150" ry="195" fill="#d9a98c"/><path d="M60 800c10-190 110-250 240-250s230 60 240 250z" fill="#4b6a88"/>
  <path d="M150 300c10-120 80-160 150-160s140 40 150 160c-40-60-100-80-150-80s-110 20-150 80z" fill="#3a2a22"/>
  <circle cx="245" cy="345" r="12" fill="#2b2b2b"/><circle cx="355" cy="345" r="12" fill="#2b2b2b"/><path d="M255 450c30 26 60 26 90 0" fill="none" stroke="#7a3d33" stroke-width="7" stroke-linecap="round"/>
  <text x="300" y="780" text-anchor="middle" font-size="16" fill="#e6eef2">Imagen de ejemplo para la demostración</text></svg>`;
}
function facturaSvg(o = {}) {
  const W = 600, H = 800, esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;"); let rows = "";
  for (let i = 0; i < 6; i++) rows += `<rect x="70" y="${330 + i * 44}" width="300" height="12" rx="6" fill="#e3e9ec"/><rect x="430" y="${330 + i * 44}" width="100" height="12" rx="6" fill="#cfd8dc"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Poppins"><rect width="${W}" height="${H}" fill="#cfd8dc"/>
  <rect x="40" y="40" width="520" height="720" rx="8" fill="#fff"/><text x="70" y="110" font-size="32" font-weight="600" fill="${o.color || "#0f3d5e"}">${esc(o.titulo || "FACTURA")}</text>
  <text x="70" y="150" font-size="18" fill="#607d8b">${esc(o.sitio || "")}</text><rect x="70" y="190" width="460" height="2" fill="#cfd8dc"/>${rows}
  <rect x="330" y="640" width="200" height="2" fill="#263238"/><text x="530" y="690" text-anchor="end" font-size="26" font-weight="600" fill="#263238">${esc(o.total || "Total $3,50")}</text>
  <text x="300" y="745" text-anchor="middle" font-size="14" fill="#90a4ae">Imagen de ejemplo para la demostración</text></svg>`;
}
function productoSvg(o = {}) {
  const W = 600, H = 600; return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="Poppins"><rect width="${W}" height="${H}" fill="#eef2f4"/>
  <path d="M170 220h260l30 280H140z" fill="${o.color || "#0f3d5e"}"/><path d="M230 220c0-60 30-90 70-90s70 30 70 90" fill="none" stroke="#263238" stroke-width="14" stroke-linecap="round"/>
  <text x="300" y="560" text-anchor="middle" font-size="18" fill="#90a4ae">Imagen de ejemplo para la demostración</text></svg>`;
}
function firmaSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240" viewBox="0 0 600 240"><rect width="600" height="240" fill="#fff"/>
  <path d="M40 160c40-110 70-140 90-110s-40 120-16 120 60-90 96-90 6 80 36 74 54-70 84-70 12 54 42 48 48-38 84-38 18 28 60 16" fill="none" stroke="#1d3557" stroke-width="7" stroke-linecap="round"/></svg>`;
}
function pantallaSvg(o = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800" font-family="Poppins"><rect width="600" height="800" fill="#cfd8dc"/>
  <rect x="80" y="120" width="440" height="560" rx="24" fill="#fff"/><rect x="110" y="160" width="380" height="60" rx="12" fill="${o.color || "#0f3d5e"}"/>
  <rect x="110" y="260" width="300" height="14" rx="7" fill="#e3e9ec"/><rect x="110" y="300" width="340" height="14" rx="7" fill="#e3e9ec"/><rect x="110" y="340" width="260" height="14" rx="7" fill="#e3e9ec"/><rect x="110" y="560" width="380" height="64" rx="14" fill="#eef2f4"/>
  <text x="300" y="740" text-anchor="middle" font-size="16" fill="#90a4ae">Imagen de ejemplo para la demostración</text></svg>`;
}

function png(svg) {
  const { Resvg } = require("@resvg/resvg-js");
  const r = new Resvg(svg, { fitTo: { mode: "width", value: 480 }, font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: "Poppins" } });
  return r.render().asPng();
}
const uri = (svg) => "data:image/png;base64," + png(svg).toString("base64");
const MIME = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml" };

// Archivo de imagen real (por ejemplo, una captura que dio la persona) -> data URI
function imagenDeArchivo(file) {
  const m = MIME[path.extname(file).toLowerCase()]; if (!m) return null;
  return `data:${m};base64,` + fs.readFileSync(file).toString("base64");
}

// kind: ticket-qr | documento-identidad (alias: documento) | selfie | factura | producto | firma | pantalla
const GENERADORES = { "ticket-qr": ticketSvg, "documento-identidad": documentoSvg, documento: documentoSvg, selfie: selfieSvg, factura: facturaSvg, producto: productoSvg, firma: firmaSvg, pantalla: pantallaSvg };
function imagenSintetica(kind, o = {}) { const f = GENERADORES[kind] || GENERADORES.pantalla; return uri(f(o)); }

module.exports = { imagenSintetica, imagenDeArchivo, generadores: Object.keys(GENERADORES), ticketSvg };
