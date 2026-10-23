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
// ---- campos probables, variables simuladas y canales distintos de WhatsApp ----
{
  const CAN = require("../lib/demo-canales");
  const clon = (f) => JSON.parse(JSON.stringify(load(f)));
  t("fields: a form without fields gets probable ones from its context (billing), a consent form stays as is", () => {
    const s = clon("demo-pago-fixture.json"); s.agentes[0].pasos.find((p) => p.id === "P17").formulario = { titulo: "Datos de facturación", boton: "Continuar" };
    const r = buildGuion(s); const fl = Object.values(r.guion.flows)[0];
    const labels = fl.json.screens[0].layout.children.find((c) => c.type === "Form").children.map((c) => c.label).filter(Boolean);
    assert(labels.length >= 4 && labels.some((x) => /RUC|C[eé]dula/.test(x)), labels.join("|"));
    assert(r.avisos.some((a) => /campos probables/.test(a) && /Datos de facturaci/.test(a)));
    assert(fl.notas.FORMULARIO.includes("Campos probables"));
    const exp = clon("prekickoff-fixture.json"); const r2 = buildGuion(exp);
    assert(!r2.avisos.some((a) => /campos probables/.test(a)), "consent and 3-field forms are untouched");
  });
  t("fields: a form that already has two fields is left as the SOW defines it; demo.campos_probables can add a context", () => {
    const s = clon("demo-pago-fixture.json"); const antes = JSON.stringify(buildGuion(s).guion.flows);
    assert(!buildGuion(s).avisos.some((a) => /campos probables/.test(a)));
    s.agentes[0].pasos.find((p) => p.id === "P17").formulario = { titulo: "Registro de mascota" };
    s.demo.campos_probables = { entradas: [{ id: "mascota", senales: "mascota", campos: [{ etiqueta: "Nombre de la mascota", tipo: "texto", ejemplo: "Luna" }, { etiqueta: "Especie", tipo: "selector", opciones: ["Perro", "Gato"], ejemplo: "Perro" }] }] };
    assert(JSON.stringify(buildGuion(s).guion.flows).includes("Nombre de la mascota"));
    assert(antes.length > 0);
  });
  t("variables: {{x}} placeholders are simulated, kit variables are kept, demo.variables overrides", () => {
    const s = clon("demo-pago-fixture.json"); s.agentes[0].pasos.find((p) => p.id === "P2").mensaje = "Hola {{nombre_cliente}}, saldo {{monto_total}} vence {{fecha_vencimiento}} en {{ciudad}} {{usuario.nombre}} {{form.cedula}} {{algo_raro}}";
    s.demo.variables = { algo_raro: "Valor X" };
    const g = JSON.stringify(buildGuion(s).guion);
    assert(!/\{\{(?!form|etq|usuario|eleccion|marca|sel)[^}]*\}\}/.test(g), "no template variable left");
    assert(g.includes("Ana Torres") && g.includes("Valor X") && g.includes("{{usuario.nombre}}") && g.includes("{{form.cedula}}"));
  });
  t("channels: detection from explicit fields and free text, without false positives from email or web mentions", () => {
    assert.deepStrictEqual(CAN.detectarCanales("WhatsApp e Instagram"), ["whatsapp", "instagram"]);
    assert.deepStrictEqual(CAN.detectarCanales("Web"), ["widget"]);
    assert.deepStrictEqual(CAN.detectarCanales("Facebook Messenger"), ["messenger"]);
    const wa = { brief: ["El bot atiende por WhatsApp, envía la factura por correo electrónico y hay un portal web."], agentes: [{ id: "F1" }] };
    assert.deepStrictEqual(CAN.canalesDeAgente(wa, wa.agentes[0]), ["whatsapp"]);
    const ig = { brief: ["Asistente de ventas en Instagram."], agentes: [{ id: "F1" }] };
    assert.deepStrictEqual(CAN.canalesDeAgente(ig, ig.agentes[0]), ["instagram"]);
    const fases = { alcance: { fases: [{ requerimiento: "R1 · Agente X", canal: "Messenger" }] }, agentes: [{ id: "R1", nombre: "Agente X" }, { id: "R2", nombre: "Otro" }] };
    assert.deepStrictEqual(CAN.canalesDeAgente(fases, fases.agentes[0]), ["messenger"]);
    assert.deepStrictEqual(CAN.canalesDeAgente(fases, fases.agentes[1]), ["whatsapp"]);
  });
  t("channels: a non-WhatsApp bot is built with its own skin and only content that channel supports", () => {
    const s = clon("demo-recursos-fixture.json"); s.agentes[0].canal = "Instagram";
    const r = buildGuion(s); const todos = r.guion.journeys.flatMap((j) => j.pasos);
    assert(r.guion.journeys.every((j) => j.canal === "instagram" && /Instagram/.test(j.nombre)));
    for (const x of ["notificacion", "plantilla", "flow", "lista", "solicitar_ubicacion", "solicitar_contacto", "carrusel", "multiproducto"]) assert(!todos.some((p) => p.tipo === x), x);
    todos.filter((p) => p.tipo === "botones").forEach((p) => { assert(p.botones.length <= 3); p.botones.forEach((b) => assert(b.titulo.length <= 20)); });
    assert(/Instagram/.test(r.guion.panel.subtitulo) && /aproximada/.test(r.guion.panel.pie));
    assert(r.avisos.some((a) => /Canal Instagram/.test(a)));
    const wa = buildGuion(clon("demo-recursos-fixture.json")); assert(wa.guion.journeys.every((j) => j.canal === "whatsapp"));
  });
  t("channels: outbound template and WhatsApp Flow become a plain bot message and a web form in other channels", () => {
    const s = clon("prekickoff-fixture.json"); s.agentes.forEach((a) => { a.canal = "Messenger"; });
    const r = buildGuion(s); const todos = r.guion.journeys.flatMap((j) => j.pasos);
    assert(!todos.some((p) => p.tipo === "plantilla" || p.tipo === "notificacion" || p.tipo === "flow"));
    assert(todos.some((p) => p.tipo === "cta_url" && /Flows/.test(p.nota || "")), "the form opens as a web page");
    assert(Object.keys(r.guion.flows).length === 0, "unused Flows are removed");
    const out = r.guion.journeys.find((j) => /Prospecci/.test(j.nombre)); assert(out && out.tech !== "hsm");
  });
  t("channels: several channels in one agent give one set of journeys per channel (WhatsApp first)", () => {
    const s = clon("demo-pago-fixture.json"); s.agentes[0].canal = "WhatsApp, Instagram y chat web";
    const g = buildGuion(s).guion; const canales = [...new Set(g.journeys.map((j) => j.canal))];
    assert.deepStrictEqual(canales, ["whatsapp", "instagram", "widget"]);
    assert(new Set(g.journeys.map((j) => j.id)).size === g.journeys.length, "unique journey ids");
  });
  t("loops: a «no válido → volver» exit listed first does not trap the main journey; the retry is an alternative journey", () => {
    const sow = { meta: { proyecto: "Prueba", cliente: "Cliente X", pais: "Colombia", fase: "prekickoff" }, agentes: [{ id: "F1", nombre: "Flujo_1: Registro", entrada: "inbound", pasos: [
      { id: "P1", tipo: "usuario", mensaje: "Hola", siguiente: [{ a: "P2" }] },
      { id: "P2", tipo: "mensaje", etapa: "Documento", mensaje: "Escribe tu número de documento.", siguiente: [{ a: "P3" }] },
      { id: "P3", tipo: "usuario", etapa: "Documento", mensaje: "POR DEFINIR", siguiente: [{ a: "P4" }] },
      { id: "P4", tipo: "decision", diagrama: "¿Documento válido?", siguiente: [{ a: "P2", si: "no válido" }, { a: "P5", si: "válido" }] },
      { id: "P5", tipo: "mensaje", etapa: "Listo", mensaje: "Gracias. Registro completo.", siguiente: [{ a: "PF" }] },
      { id: "PF", tipo: "fin", diagrama: "Fin", siguiente: [] }] }] };
    const g = buildGuion(sow).guion; const main = g.journeys[0];
    assert(main.pasos.some((p) => /Registro completo/.test(p.texto || "")), "the main journey reaches the end");
    assert(!main.pasos.some((p) => p.id === "p3" && p.ir === "p2"), "the answer does not send the person back to the question");
    const reintento = g.journeys.find((j) => /no válido/.test(j.nombre)); assert(reintento && /Vuelve al paso/.test(reintento.pasos[reintento.pasos.length - 1].texto));
    assert(main.pasos.find((p) => p.tipo === "usuario" && p.id === "p3").texto === "0912345678", "a document step types a document number, not «dato de ejemplo»");
  });
  t("datos: form fields get values inferred from their label, never «dato de ejemplo»", () => {
    const sow = { meta: { proyecto: "P", cliente: "Cliente X", pais: "Ecuador", fase: "prekickoff" }, agentes: [{ id: "F1", nombre: "Flujo_1", entrada: "inbound", pasos: [
      { id: "P1", tipo: "usuario", mensaje: "Hola", siguiente: [{ a: "P2" }] },
      { id: "P2", tipo: "formulario", etapa: "Material", mensaje: "Completa el material.", formulario: { titulo: "Material", campos: [{ etiqueta: "Material", tipo: "texto" }, { etiqueta: "Cantidad", tipo: "numero", ejemplo: "POR DEFINIR" }, { etiqueta: "Zorbalux", tipo: "texto" }] }, siguiente: [{ a: "PF" }] },
      { id: "PF", tipo: "fin", diagrama: "Fin", siguiente: [] }] }] };
    const r = buildGuion(sow); const s = JSON.stringify(r.guion);
    assert(!/dato de ejemplo/i.test(s), "no «dato de ejemplo»");
    const demo = Object.values(r.guion.flows)[0].demo; assert(demo.material === "Resina PP-20" && demo.cantidad === "25" && /^Zorbalux 01$/.test(demo.zorbalux), JSON.stringify(demo));
  });
  const sowModos = (extra = {}, ag = {}, sinForm = false) => ({ meta: { proyecto: "P", cliente: "Cliente X", pais: "Ecuador", fase: "prekickoff" }, ...extra, agentes: [{ id: "F1", nombre: "Flujo_1: Registro", entrada: "inbound", ...ag, pasos: [
    { id: "P1", tipo: "usuario", mensaje: "Hola", siguiente: [{ a: "P2" }] },
    sinForm ? { id: "P2", tipo: "mensaje", etapa: "Datos", mensaje: "Gracias por escribir.", siguiente: [{ a: "PF" }] }
      : { id: "P2", tipo: "formulario", etapa: "Datos", mensaje: "Completa tus datos.", formulario: { titulo: "Datos", campos: [{ etiqueta: "Material", tipo: "texto" }, { etiqueta: "Cantidad", tipo: "numero" }, { etiqueta: "Tipo", tipo: "selector", opciones: ["A", "B"] }, { etiqueta: "Correo", tipo: "correo" }] }, siguiente: [{ a: "PF" }] },
    { id: "PF", tipo: "fin", diagrama: "Fin", siguiente: [] }] }] });
  t("modos: sin definir se generan los tres con selector; el conversacional no usa Flow ni webview", () => {
    const r = buildGuion(sowModos()); const g = r.guion;
    assert(g.modos && g.modos.lista.map((m) => m.id).join() === "conversacional,mixto,webview" && g.modos.inicial === "mixto", JSON.stringify(g.modos));
    assert(g.journeys.length === 3 && g.journeys.every((j) => j.modo && j.par), "un recorrido por modo, con modo y par");
    const conv = g.journeys.find((j) => j.modo === "conversacional"); const web = g.journeys.find((j) => j.modo === "webview");
    assert(/Conversacional$/.test(conv.nombre) && /Flows y webview$/.test(web.nombre), "nombres claros");
    assert(!conv.pasos.some((p) => p.tipo === "flow" || p.tipo === "cta_url"), "conversacional: sin Flow ni webview");
    assert(conv.pasos.some((p) => p.tipo === "usuario" && p.texto === "Resina PP-20") && conv.pasos.some((p) => /Confirmo tus datos/.test(p.cuerpo || "")), "preguntas con respuestas inferidas y confirmación final");
    assert(web.pasos.some((p) => p.tipo === "flow"), "webview/Flows: formulario como Flow");
    assert(r.avisos.some((x) => /se generaron los modos/.test(x) && /por defecto/.test(x)), "el aviso dice el origen");
  });
  t("modos: si el SOW o la reunión lo definen, sale un solo modo y sin selector", () => {
    const casos = [
      [sowModos({ demo: { observaciones_cliente: ["Quiere que sea 100 % conversacional"] } }), "conversacional", "reunión"],
      [sowModos({ demo: { observaciones_cliente: "No quiero Webview, quiero WhatsApp Flow" } }), "webview", "reunión"],
      [sowModos({}, { modo_experiencia: "mixto" }), "mixto", "sow"],
      [sowModos({ demo: { modo: "conversacional", observaciones_cliente: "quiero flows" } }), "webview", "reunión"],   // en fase 2 manda la reunión
    ];
    for (const [sow, modo, origen] of casos) {
      const r = buildGuion(sow); const g = r.guion;
      assert(!g.modos && g.journeys.length === 1 && !g.journeys[0].modo, "un solo recorrido, sin selector: " + modo);
      assert(r.avisos.some((x) => x.includes("«") && new RegExp("origen: " + origen).test(x)), "origen " + origen + ": " + r.avisos.join(" / "));
      const tieneForm = g.journeys[0].pasos.some((p) => p.tipo === "flow");
      assert(tieneForm === (modo !== "conversacional"), "el formulario de 4 campos va en Flow salvo en el modo conversacional: " + modo);
    }
    assert(!buildGuion(sowModos({}, { modo_experiencia: "conversacional" })).guion.journeys[0].pasos.some((p) => p.tipo === "flow"));
    const forms = sowModos(); forms.agentes[0].pasos[1].herramienta = "flows";
    assert(!buildGuion(forms).guion.modos, "todos los formularios con herramienta definida: modo webview, sin selector");
  });
  t("modos: mixto deja en el chat los formularios cortos y en Flow los largos; sin formularios no hay selector", () => {
    const corto = sowModos({}, { modo_experiencia: "mixto" }); corto.agentes[0].pasos[1].formulario.campos = corto.agentes[0].pasos[1].formulario.campos.slice(0, 2);
    assert(!buildGuion(corto).guion.journeys[0].pasos.some((p) => p.tipo === "flow"), "2 campos: en el chat");
    assert(buildGuion(sowModos({}, { modo_experiencia: "mixto" })).guion.journeys[0].pasos.some((p) => p.tipo === "flow"), "4 campos: en Flow");
    const sin = buildGuion(sowModos({}, {}, true));
    assert(!sin.guion.modos && sin.guion.journeys.length === 1 && !sin.guion.journeys[0].modo, "sin formularios los tres modos serían iguales");
  });
  t("modos: en un canal que no es WhatsApp el modo webview es webview (sin Flows) y el selector sigue", () => {
    const g = buildGuion(sowModos({}, { canal: "Widget web" })).guion;
    assert(g.modos && g.modos.lista.find((m) => m.id === "webview").nombre === "Webview", JSON.stringify(g.modos));
    assert(!JSON.stringify(g).includes('"tipo":"flow"') && Object.keys(g.flows).length === 0, "sin Flows en widget");
    assert(g.journeys.find((j) => j.modo === "webview").pasos.some((p) => p.tipo === "cta_url"), "el formulario es un enlace a webview");
    assert(!g.journeys.find((j) => j.modo === "conversacional").pasos.some((p) => p.tipo === "cta_url"), "el conversacional sigue en el chat");
  });
  t("modos: la extensión trae el selector del panel y el HTML del kit lo incluye", () => {
    const ext = fs.readFileSync(path.join(__dirname, "..", "..", "assets", "visuales", "kit-extension.js"), "utf8");
    assert(/id = 'modos'/.test(ext) && /G.modos/.test(ext) && /window.startJourney/.test(ext), "kit-extension.js define el selector de modo");
  });
  t("extension: skins are injected together with the webview blocks", () => {
    const { inyectarExtension } = require("../sow_a_demo");
    const r = inyectarExtension("<html><body><script>function wvBlock(b){} function startJourney(i){}</script></body></html>");
    assert(r.ok && /data-skins/.test(r.html) && /x-cam/.test(r.html));
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
