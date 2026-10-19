// Convertidor sow.json -> guion.json del kit jelou-demo-whatsapp, y armado real si el plugin está instalado.
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { buildGuion } = require("../sow_a_demo");
const K = require("../lib/demo-kit");

let n = 0, failed = 0;
const t = (name, fn) => { try { fn(); n++; console.log("ok  " + name); } catch (e) { failed++; console.log("FAIL " + name + ": " + e.message); } };
const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, f), "utf8"));

for (const f of ["prekickoff-fixture.json", "full-scope-lock-fixture.json"]) {
  const sow = load(f);
  const { guion } = buildGuion(sow);
  t(`${f}: one journey per flow, every journey ends in "fin"`, () => {
    assert(guion.journeys.length >= sow.agentes.length);
    guion.journeys.forEach((j) => { assert(j.pasos.length); assert.strictEqual(j.pasos[j.pasos.length - 1].tipo, "fin", j.id); });
  });
  t(`${f}: respects WhatsApp limits and leaves no pending placeholder`, () => {
    guion.journeys.forEach((j) => j.pasos.forEach((p) => {
      if (p.tipo === "botones") { assert(p.botones.length <= 3); p.botones.forEach((b) => assert(b.titulo.length <= 20)); }
      if (p.tipo === "lista") assert(p.secciones.reduce((a, s) => a + s.filas.length, 0) <= 10);
    }));
    assert(!/POR (DEFINIR|COMPLETAR)/.test(JSON.stringify(guion)), "pending values are mocked");
  });
  t(`${f}: every flow/webview referenced by a step exists`, () => {
    guion.journeys.forEach((j) => j.pasos.forEach((p) => { if (p.flow) assert(guion.flows[p.flow], p.flow); if (p.webview) assert(guion.webviews[p.webview], p.webview); }));
  });
}
t("pre-kickoff panel says it is preliminary and that data is probable", () => {
  const { guion } = buildGuion(load("prekickoff-fixture.json"));
  assert(/pre-kickoff/i.test(guion.panel.subtitulo) && /valores de ejemplo/.test(guion.panel.pie));
});
t("outbound flow starts with a notification and a template", () => {
  const { guion } = buildGuion(load("prekickoff-fixture.json"));
  const j = guion.journeys.find((x) => x.tech === "hsm");
  assert(j && j.pasos.some((p) => p.tipo === "notificacion") && j.pasos.some((p) => p.tipo === "plantilla"));
});
// ---- fidelidad visual 1:1 (fixture anonimizado de un pago in-chat de parqueo) ----
{
  const { guion, stats } = buildGuion(load("demo-pago-fixture.json"));
  const main = guion.journeys[0]; const tipos = main.pasos.map((p) => p.tipo);
  t("visual: the photo with a QR is an image, not text", () => {
    const foto = main.pasos.find((p) => p.tipo === "usuario" && p.imagen);
    assert(foto && /^data:image\/png;base64,/.test(foto.imagen.src));
  });
  t("visual: the payment gateway is a screen (webview with summary and pay button), with provider-specific notes", () => {
    const cta = main.pasos.find((p) => p.tipo === "cta_url" && /Pantalla de pago de Datafast/.test(p.nota));
    assert(cta && guion.webviews[cta.webview]);
    const w = guion.webviews[cta.webview]; assert(w.pantallas[0].bloques.some((b) => b.tipo === "resumen") && w.pantallas[0].bloques.some((b) => b.tipo === "pago") && /^Pagar/.test(w.pantallas[0].boton));
    assert(/no coinciden/.test(cta.nota), "the Datafast marketplace vs docs discrepancy is flagged");
  });
  t("visual: the receipt and the invoice are PDF documents", () => {
    assert(main.pasos.filter((p) => p.tipo === "documento").length >= 2);
  });
  t("chat: API calls and decisions are NOT chat steps (they go in the notes)", () => {
    assert(!tipos.includes("sistema") && !tipos.includes("pausa"));
    assert(main.pasos.some((p) => /Detrás de escena: Jelou/.test(p.nota || "")));
  });
  t("branches chosen by the person are inside the chat (buttons with ir) and retries loop back", () => {
    const b = main.pasos.find((p) => p.tipo === "botones" && p.botones.length === 2 && /Pagar ahora/.test(p.botones[0].titulo));
    assert(b && b.botones.every((x) => x.ir) && b.botones[0].ir !== b.botones[1].ir);
    const ids = new Set(main.pasos.map((p) => p.id).filter(Boolean));
    main.pasos.forEach((p) => { if (p.ir) assert(ids.has(p.ir), p.ir); (p.botones || []).forEach((x) => x.ir && assert(ids.has(x.ir), x.ir)); });
  });
  t("system-decided branches are alternative journeys with readable names", () => {
    assert(guion.journeys.length >= 3 && guion.journeys.some((j) => /pago no completado/.test(j.nombre)) && guion.journeys.some((j) => /código QR/.test(j.nombre)));
  });
  t("mock data is probable, never the word «pendiente» inside the chat", () => {
    const txt = JSON.stringify(guion);
    assert(!/dato por confirmar/.test(txt) && /Parqueo · 2 h 15 min/.test(txt) && /PDF por este chat/.test(txt));
  });
  t("coverage stats report images, documents and payment screens", () => { assert(stats.imagenes >= 1 && stats.documentos >= 2 && stats.pagos >= 1 && stats.flows >= 1); });
  t("demo.pasos overrides persist (adjunto/ocultar) and the native payment experience builds a card Flow", () => {
    const sow = load("demo-pago-fixture.json"); sow.demo.pago = { experiencia: "nativa" };
    const g = buildGuion(sow).guion; const f = g.journeys[0].pasos.find((p) => p.tipo === "flow" && JSON.stringify(g.flows[p.flow]).includes("Número de tarjeta"));
    assert(f, "native card Flow");
  });
}
// ---- motor de recursos: cualquier tipo de cliente, ampliable con datos ----
{
  const { guion, avisos, stats } = buildGuion(load("demo-recursos-fixture.json"));
  const main = guion.journeys[0]; const blocks = Object.values(guion.webviews).flatMap((w) => w.pantallas.flatMap((p) => p.bloques.map((b) => b.tipo)));
  t("resources: ecommerce, photo of ID, biometrics, e-signature, another gateway, location and a generic fallback are all matched", () => {
    for (const r of ["ecommerce", "foto-usuario", "biometria", "firma-electronica", "pago", "ubicacion", "generico-externo"]) assert(stats.recursos[r], `recurso ${r}`);
    assert(main.pasos.some((p) => p.tipo === "solicitar_ubicacion"));
    // ecommerce = webview de Jelou Shop (catálogo, detalle, carrito) con mensaje de pedido confirmado que vuelve al catálogo
    const shop = Object.values(guion.webviews).find((w) => w.dominio === "shop.jelou.ai");
    assert(shop && shop.pantallas.length === 3);
    const tipos = shop.pantallas.flatMap((p) => p.bloques.map((b) => b.tipo));
    for (const b of ["cabecera", "buscador", "producto_fila", "chips", "boton_oscuro", "titulo_precio", "resumen"]) assert(tipos.includes(b), b);
    const abre = main.pasos.find((p) => p.tipo === "cta_url" && p.webview && guion.webviews[p.webview] === shop);
    assert(abre && abre.header && abre.header.tipo === "imagen" && abre.boton === "Ver Detalles");
    const conf = main.pasos.find((p) => p.tipo === "botones" && /Pedido confirmado/.test(p.cuerpo));
    assert(conf && conf.botones.find((b) => /Agregar más/.test(b.titulo)).ir === abre.id && conf.botones.every((b) => !("accion" in b)));
  });
  t("resources: webviews use camera, progress, signature, code and checklist blocks (kit extension)", () => {
    for (const b of ["camara", "progreso", "firma", "codigo", "checklist", "documento"]) assert(blocks.includes(b), b);
  });
  t("resources: the gateway is resolved by provider (PayPhone) and the document to sign is named «Contrato»", () => {
    assert(Object.values(guion.webviews).some((w) => w.titulo === "PayPhone"));
    assert(/Contrato/.test(JSON.stringify(guion.webviews)));
  });
  t("resources: an unknown system uses the generic fallback and says how to teach it", () => {
    assert(avisos.some((m) => /pantalla genérica de respaldo/.test(m) && /aprender_recurso/.test(m)));
  });
  t("resources: sow.demo.recursos adds a client-specific resource without touching code", () => {
    const sow = load("demo-recursos-fixture.json");
    sow.demo = { recursos: [{ id: "garantias", nombre: "Garantías", aplica_a: ["tercero"], senales: { texto: "garant" }, receta: { abre: "webview", nota: "Garantías de {{marca}}", mensaje: { cuerpo: "Registra tu garantía", boton: "Registrar" }, webview: { titulo: "Garantías", dominio: "g.demo", pantallas: [{ bloques: [{ tipo: "marca" }, { tipo: "lista", items: [{ titulo: "Producto", valor: "2 años" }] }], boton: "Listo" }], exito: { titulo: "Registrada" } } } }] };
    const r = buildGuion(sow); assert(r.stats.recursos.garantias === 1 && !r.stats.recursos["generico-externo"]);
  });
  t("resources: explicit `recurso` on a step wins over the signals", () => {
    const sow = load("demo-recursos-fixture.json"); sow.agentes[0].pasos.find((p) => p.id === "A13").recurso = "firma-electronica";
    assert(buildGuion(sow).stats.recursos["firma-electronica"] === 2);
  });
  t("provider by country and own message: Mercado Pago Colombia uses its own screenshots and message", () => {
    const sow = load("demo-pago-fixture.json"); sow.meta.pais = "Colombia"; sow.demo.pago = { proveedor: "mercadopago" };
    const g = buildGuion(sow).guion; const cta = g.journeys[0].pasos.find((p) => p.tipo === "cta_url");
    assert(/Mercado Pago/.test(cta.cuerpo) && cta.boton === "Proceder al pago");
  });
  t("extension: injected only when the kit still exposes wvBlock", () => {
    const { inyectarExtension } = require("../sow_a_demo");
    const ok = inyectarExtension("<html><body><script>function wvBlock(b){}</script></body></html>");
    assert(ok.ok && /kit-extension|x-cam/.test(ok.html));
    assert(!inyectarExtension("<html><body></body></html>").ok);
  });
}
t("kit lookup: finds the kit from the plugin or the skill library cache and never throws", () => {
  const f = K.findKit(); assert(f === null || fs.existsSync(path.join(f, "build.py")));
  const c = K.kitFromSkillCache(); assert(c === null || fs.existsSync(path.join(c, "build.py")));
  const old = process.env.SKILLBOX_MJS; process.env.SKILLBOX_MJS = path.join(os.tmpdir(), "no-existe.mjs");
  assert.doesNotThrow(() => K.kitFromLibrary()); if (old === undefined) delete process.env.SKILLBOX_MJS; else process.env.SKILLBOX_MJS = old;
});
if (K.findKit()) {
  t("teaching a resource with screenshots: aprender_recurso -> the webview shows those screenshots", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aprender-")); const caps = path.join(dir, "caps"); fs.mkdirSync(caps);
    const A = require("../lib/demo-assets");
    ["pantalla", "factura"].forEach((k, i) => fs.writeFileSync(path.join(caps, `p${i + 1}.png`), Buffer.from(A.imagenSintetica(k, {}).split(",")[1], "base64")));
    const env = { ...process.env, JELOU_SOW_VISUALES: path.join(dir, "user") };
    const a = spawnSync("node", [path.join(__dirname, "..", "aprender_recurso.js"), "--id", "garantias", "--nombre", "Garantías", "--aplica-a", "tercero,webview", "--senales", "garant", "--proveedor", "garantias-ejemplo", "--proveedor-nombre", "Garantías Ejemplo", "--capturas", caps, "--botones", "Siguiente,Registrar"], { encoding: "utf8", env });
    assert.strictEqual(a.status, 0, a.stdout + a.stderr);
    const out = path.join(dir, "sim.html");
    const r = spawnSync("node", [path.join(__dirname, "..", "sow_a_demo.js"), path.join(__dirname, "demo-recursos-fixture.json"), out], { encoding: "utf8", env });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    const g = JSON.parse(fs.readFileSync(out.replace(/\.html$/, ".guion.json"), "utf8"));
    const w = Object.values(g.webviews).find((x) => x.titulo === "Garantías Ejemplo");
    assert(w && w.pantallas.length === 2 && w.pantallas.every((p) => p.bloques[0].tipo === "captura" && /^data:image\/png/.test(p.bloques[0].src)) && w.pantallas[1].boton === "Registrar");
    assert(!/pantalla genérica de respaldo/.test(r.stdout));
  });

  t("real build with the installed kit (Meta validator included)", () => {
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "demo-test-")), "sim.html");
    const r = spawnSync("node", [path.join(__dirname, "..", "sow_a_demo.js"), path.join(__dirname, "demo-pago-fixture.json"), out], { encoding: "utf8" });
    assert.strictEqual(r.status, 0, r.stdout + r.stderr);
    assert(fs.statSync(out).size > 100000);
  });
} else console.log("skip real build: plugin jelou-demos-whatsapp not installed");
console.log(`\n${n} demo tests passed` + (failed ? `, ${failed} FAILED` : ""));
process.exit(failed ? 1 : 0);
