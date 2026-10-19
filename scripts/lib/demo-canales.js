// Canales de mensajería y qué admite cada uno (fuente: Jelou Docs, guides/nodos/*, api/envia-mensajes/* y guides/activacion-canales/*).
// El simulador usa el kit de WhatsApp: para otro canal se aplica un «skin» (apariencia del canal) y el contenido se adapta a lo que ese canal admite.
const arr = (x) => (Array.isArray(x) ? x : []);
const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");

// skin: apariencia que dibuja assets/visuales/kit-extension.js. limite: caracteres por mensaje de texto.
const CANALES = {
  whatsapp:      { nombre: "WhatsApp", skin: "whatsapp", limite: 4096 },
  instagram:     { nombre: "Instagram", skin: "instagram", limite: 1000, ventana24h: true, nota: "Instagram: botones de respuesta (hasta 3, 20 caracteres), sin listas, carrusel, plantillas ni Flows; la conversación la inicia la persona (ventana de 24 h)." },
  messenger:     { nombre: "Messenger", skin: "messenger", limite: 2000, ventana24h: true, nota: "Messenger: botones de respuesta (hasta 3, 20 caracteres), sin listas, carrusel, plantillas ni Flows; la conversación la inicia la persona (ventana de 24 h)." },
  widget:        { nombre: "Widget web", skin: "widget", limite: 4096, nota: "Widget web: texto, botones, imágenes y archivos; sin Flows, plantillas ni carrusel (el carrusel es solo de WhatsApp Cloud)." },
  x:             { nombre: "X (Twitter)", skin: "x", limite: 4096, nota: "X: mensajes directos de texto, sin Flows, plantillas ni carrusel." },
  teams:         { nombre: "Microsoft Teams", skin: "workchat", limite: 4096, nota: "Teams: chat de trabajo; sin Flows ni plantillas de WhatsApp." },
  slack:         { nombre: "Slack", skin: "workchat", limite: 4096, nota: "Slack: chat de trabajo; sin Flows ni plantillas de WhatsApp." },
  email:         { nombre: "Correo electrónico", skin: "widget", limite: 4096, sinSkin: true, nota: "Correo: no hay simulador visual propio; se muestra como chat genérico." },
  voz:           { nombre: "Voz", skin: "widget", limite: 4096, sinSkin: true, nota: "Voz: no hay simulador visual propio; se muestra el guion como chat genérico." },
  personalizado: { nombre: "Canal personalizado", skin: "widget", limite: 4096, sinSkin: true, nota: "Canal personalizado: se muestra como chat genérico." },
};

// Señales de cada canal (sobre texto sin acentos y en minúsculas); el orden fija la prioridad en caso de empate de posición
const SENALES = [
  ["whatsapp", /whats ?app|\bwa\b/],
  ["instagram", /instagram|\big\b|\binsta\b/],
  ["messenger", /messenger|facebook|\bface\b|\bfb\b/],
  ["widget", /\bwidget\b|web ?chat|chat web|canal web|sitio web|pagina web|portal web|chat del sitio/],
  ["x", /twitter|\bdm de x\b|\bx \(twitter\)/],
  ["teams", /microsoft teams|\bteams\b/],
  ["slack", /\bslack\b/],
  ["email", /correo electronico|e-?mail|\bemail\b|correo/],
  ["voz", /\bvoz\b|llamada telefonica|\bivr\b|call ?center|telefonia/],
];
// Un valor corto como «Web» o «Chat web» en `agentes[].canal` también cuenta
const VALOR_CANAL = { web: "widget", webchat: "widget", "chat web": "widget", widget: "widget", fb: "messenger", ig: "instagram", wa: "whatsapp", x: "x" };

// Canales mencionados en un texto, en orden de aparición
function detectarCanales(texto) {
  const t = sinAcentos(texto).toLowerCase(); const out = [];
  const corto = VALOR_CANAL[t.trim()]; if (corto) return [corto];
  for (const [id, re] of SENALES) { const m = re.exec(t); if (m) out.push({ id, pos: m.index }); }
  out.sort((a, b) => a.pos - b.pos);
  return out.map((x) => x.id);
}

// Canales de un agente: `demo.canal` / `agente.canal` (explícitos, cualquier canal) -> `alcance.fases[].canal` del requerimiento del agente ->
// texto libre (`meta.canal`, brief y objetivos). Del texto libre solo se leen canales de mensajería: «correo», «voz» o «sitio web» aparecen en casi
// cualquier SOW de WhatsApp (facturas por correo, OTP, portales) y no indican el canal del bot. Si el texto libre nombra WhatsApp, el canal es solo WhatsApp.
// Por defecto WhatsApp.
function canalesDeAgente(sow, agente) { return infoCanales(sow, agente).canales; }
// { canales, origen }: origen = explicito (demo.canal / agentes[].canal) | fases (alcance.fases) | texto (brief, objetivos) | defecto (nada declarado: se asume WhatsApp)
function infoCanales(sow, agente) {
  const meta = sow.meta || {}; const demo = sow.demo || {};
  const explicitos = [demo.canal, agente.canal].filter(Boolean);
  for (const e of explicitos) { const d = detectarCanales(Array.isArray(e) ? e.join(" ") : e); if (d.length) return { canales: orden(d), origen: "explicito" }; }
  const norm = (s) => sinAcentos(s).toLowerCase(); const idA = norm(agente.id); const nomA = norm(String(agente.nombre || "").slice(0, 12));
  const delAgente = (req) => !req || arr(sow.agentes).length === 1 || norm(req).includes(idA) || (nomA.length > 3 && norm(req).includes(nomA));
  const fases = arr((sow.alcance || {}).fases).filter((f) => f.canal && delAgente(f.requerimiento));
  for (const f of fases) { const d = detectarCanales(f.canal); if (d.length) return { canales: orden(d), origen: "fases" }; }
  const libre = [meta.canal, ...arr(sow.brief), (sow.objetivos || {}).general, ...arr((sow.objetivos || {}).especificos)].filter(Boolean).join(" . ");
  const d = detectarCanales(libre).filter((c) => ["whatsapp", "instagram", "messenger", "x", "teams", "slack"].includes(c) || (c === "widget" && /widget|web ?chat|chat web|canal web|chat del sitio/i.test(sinAcentos(libre))));
  if (d.includes("whatsapp")) return { canales: ["whatsapp"], origen: "texto" };
  return d.length ? { canales: orden(d), origen: "texto" } : { canales: ["whatsapp"], origen: "defecto" };
}
// WhatsApp primero si está entre los canales; el resto en el orden en que aparecen
const orden = (ids) => [...new Set(ids)].sort((a, b) => (a === "whatsapp" ? -1 : b === "whatsapp" ? 1 : 0));

module.exports = { CANALES, detectarCanales, canalesDeAgente, infoCanales };
