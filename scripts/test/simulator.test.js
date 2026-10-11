// Pruebas del simulador: node scripts/test/simulator.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const S = require("../lib/simulator");
const E = S.engine;
const sow = JSON.parse(fs.readFileSync(path.join(__dirname, "simulator-fixture.json"), "utf8"));
const R1 = sow.agentes[0], R2 = sow.agentes[1];
let n = 0;
const t = (name, fn) => { fn(); n++; console.log("ok  " + name); };

t("el flujo arranca: usuario + router automáticos y espera botones", () => {
  const r = E.start(R1);
  assert.strictEqual(r.events[0].t, "user");
  assert(r.events.some((e) => e.kind === "wait"), "router muestra indicador");
  assert.strictEqual(r.wait.kind, "choice");
  assert.deepStrictEqual(r.wait.buttons, ["Nuevo pedido", "Estado de mi pedido", "Hablar con asesor"]);
});
t("botón -> lista -> webview -> api (panel de resultado) -> éxito -> tercero -> fin", () => {
  let r = E.start(R1); const ctx = r.ctx;
  r = E.answer(R1, r.wait, { type: "choice", value: "Nuevo pedido" }, ctx);
  assert.strictEqual(r.wait.kind, "choice"); assert.strictEqual(r.wait.list.length, 4);
  r = E.answer(R1, r.wait, { type: "choice", value: "Bebidas" }, ctx);
  assert.strictEqual(r.wait.kind, "webview"); assert.strictEqual(r.wait.id, "P5");
  r = E.answer(R1, r.wait, { type: "submit" }, ctx);
  assert.strictEqual(r.events[0].form, true);
  assert.strictEqual(r.wait.kind, "outcome"); assert.deepStrictEqual(r.wait.options, ["aprobado", "crédito insuficiente", "error de sistema"]);
  r = E.answer(R1, r.wait, { type: "outcome", value: "aprobado" }, ctx);
  assert.strictEqual(r.wait.kind, "end");
  assert(r.events.some((e) => e.t === "bot" && /confirmado/.test(e.text)));
  assert(r.events.some((e) => e.kind === "wait" && /tercero/.test(e.text)));
  assert(r.events.some((e) => e.kind === "end"));
});
t("rama de error y reintento (ciclo) vuelve al api", () => {
  let r = E.start(R1); const ctx = r.ctx;
  r = E.answer(R1, r.wait, { type: "choice", value: "Nuevo pedido" }, ctx);
  r = E.answer(R1, r.wait, { type: "choice", value: "Abarrotes" }, ctx);
  r = E.answer(R1, r.wait, { type: "submit" }, ctx);
  r = E.answer(R1, r.wait, { type: "outcome", value: "error de sistema" }, ctx);
  assert.strictEqual(r.wait.id, "P10");
  r = E.answer(R1, r.wait, { type: "choice", value: "Reintentar" }, ctx);
  assert.strictEqual(r.wait.kind, "outcome"); assert.strictEqual(r.wait.id, "P6");
});
t("decisión sí/no", () => {
  let r = E.start(R1); const ctx = r.ctx;
  r = E.answer(R1, r.wait, { type: "choice", value: "Estado de mi pedido" }, ctx);
  assert.strictEqual(r.wait.kind, "outcome"); assert.deepStrictEqual(r.wait.options, ["sí", "no"]);
  const r2 = E.answer(R1, r.wait, { type: "outcome", value: "no" }, ctx);
  assert.strictEqual(r2.wait.id, "P15");
});
t("asesor deriva y termina", () => {
  let r = E.start(R1); const ctx = r.ctx;
  r = E.answer(R1, r.wait, { type: "choice", value: "Hablar con asesor" }, ctx);
  assert(r.events.some((e) => e.kind === "derive")); assert.strictEqual(r.wait.kind, "end");
});
t("texto libre: coincidencia por similitud y recordatorio sin coincidencia", () => {
  const r = E.start(R1), ctx = r.ctx, w = r.wait;
  assert.strictEqual(E.matchLabel("quiero hacer un nuevo pedido", w.options), 0);
  assert.strictEqual(E.matchLabel("ESTADO de mi pedido?", w.options), 1);
  assert.strictEqual(E.matchLabel("asesor", w.options), 2);
  assert.strictEqual(E.matchLabel("clima de mañana", w.options), -1);
  const bad = E.answer(R1, w, { type: "text", text: "blablabla" }, ctx);
  assert.strictEqual(bad.wait, w);
  const rem = bad.events.find((e) => e.reminder);
  assert(rem && rem.botones.length === 3);
  const ok = E.answer(R1, w, { type: "text", text: "nuevo pedido porfa" }, ctx);
  assert.strictEqual(ok.wait.id, "P4");
});
t("usuario intermedio espera texto libre (R2)", () => {
  let r = E.start(R2); const ctx = r.ctx;
  r = E.answer(R2, r.wait, { type: "choice", value: "Garantía" }, ctx);
  assert.strictEqual(r.wait.kind, "text"); assert.strictEqual(r.wait.example, "100234");
  r = E.answer(R2, r.wait, { type: "text", text: "555" }, ctx);
  assert.strictEqual(r.wait.kind, "outcome"); assert.strictEqual(r.wait.id, "Q6");
});
t("grafo con ciclo automático no cuelga", () => {
  const loop = { pasos: [{ id: "A", tipo: "router", siguiente: [{ a: "B" }] }, { id: "B", tipo: "tercero", siguiente: [{ a: "A" }] }] };
  const r = E.start(loop);
  assert.strictEqual(r.wait.kind, "end");
  assert(r.events.length <= 130);
});
t("conteo de mensajes del bot por camino", () => {
  const a1 = S.analyzePaths(R1);
  assert.deepStrictEqual(a1.principal.ids, ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P11", "P13"]);
  assert.strictEqual(a1.principal.n, 4); // P3, P4, P7 y P13 (fin con mensaje)
  assert(a1.otros.length >= 3);
  const a2 = S.analyzePaths(R2);
  assert.strictEqual(a2.principal.n, 3); // Q3, Q4 y Q13
});
t("galería: finita con ciclos, cubre webview/asesor/tercero/lista", () => {
  const sc = S.buildScreens(R1);
  const kinds = new Set(sc.map((s) => s.kind));
  ["chat", "form", "ext", "sheet"].forEach((k) => assert(kinds.has(k), "falta " + k));
  assert(sc.some((s) => s.tipo === "asesor"));
  assert(sc.length <= 40 && new Set(sc.map((s) => s.id)).size === sc.length);
  const cyc = { pasos: [{ id: "A", tipo: "mensaje", mensaje: "x", botones: ["otra vez"], siguiente: [{ a: "A", si: "otra vez" }] }] };
  assert.strictEqual(S.buildScreens(cyc).length, 1);
  assert.strictEqual(S.buildScreens({}).length, 0);
});
t("HTML: autocontenido, pestañas, rojo para pendientes", () => {
  const diag = { R1: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10"/></svg>' };
  const html = S.buildHtml(sow, { diagramas: diag });
  assert(/Pantallas/.test(html) && /Simular/.test(html) && /Diagrama/.test(html));
  assert(/camino principal: 4 mensajes del bot/.test(html));
  assert(/Simulación basada en el SOW v0\.1 — los textos son propuestos/.test(html));
  assert(/<span class="pend">\[NÚMERO DE PEDIDO\]<\/span>/.test(html) && /<span class="pend">POR DEFINIR<\/span>/.test(html));
  assert(!/(src|href)\s*=\s*["']https?:/i.test(html), "sin recursos externos");
  assert(!/<link /i.test(html));
  const noDiag = S.buildHtml(sow, {});
  assert(!/role="tab"[^>]*>Diagrama/.test(noDiag));
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.strictEqual(scripts.length, 2); scripts.forEach((s) => new Function(s));
  fs.mkdirSync(path.join(__dirname, "out"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "out", "simulador.html"), html, "utf8");
});
t("HTML: contenido no confiable se escapa", () => {
  const evil = JSON.parse(JSON.stringify(sow));
  const bad = "<img src=x onerror=alert(1)></script><script>alert(2)</script>";
  evil.meta.proyecto = bad; evil.agentes[0].nombre = bad; evil.agentes[0].pasos[2].mensaje = bad;
  evil.agentes[0].pasos[2].botones = [bad, "b", "c"]; evil.agentes[0].pasos[4].webview.titulo = bad;
  const html = S.buildHtml(evil, { diagramas: { R1: "<svg onload=alert(3)><script>alert(4)</script></svg>" } });
  assert(!html.includes("<img src=x"), "img sin escapar");
  assert(!/<script>alert\(/.test(html));
  assert(!/onload=alert\(3\)/.test(html) && !/alert\(4\)/.test(html));
  assert.strictEqual((html.match(/<script/g) || []).length, 3, "solo los 3 scripts propios");
});
const FX = JSON.parse(fs.readFileSync(path.join(__dirname, "figuras-fixture.json"), "utf8"));
t("formulario (y alias webview): campos con opciones y ejemplo, herramienta en el pie", () => {
  const html = S.buildHtml(FX, {});
  assert(/Opciones: Vivienda · Educación · Otro/.test(html), "opciones del selector");
  assert(/3500000/.test(html) && /1234567890/.test(html), "valores de ejemplo");
  assert(/Formulario \(WhatsApp Flow\)/.test(html) && /Formulario \(WhatsApp Flow \/ WebView\)/.test(html), "herramienta flows y por definir");
  assert(!/>0000</.test(html), "sin placeholder 0000");
  const r = E.start(FX.agentes[0]);
  const r1 = E.answer(FX.agentes[0], r.wait, { type: "choice", value: "Acepto" }, r.ctx);
  assert.strictEqual(E.answer(FX.agentes[0], r1.wait, { type: "outcome", value: "Acepto" }, r.ctx).wait.kind, "webview");
});
t("cabecera: conteo por tipo, integración con nombre, persona pendiente en rojo", () => {
  const html = S.buildHtml(FX, {});
  assert(/camino principal: 3 mensajes del bot · 10 formularios · 6 consultas a sistemas/.test(html), "conteo por tipo");
  assert(/Consultando WS#5 · API consulta de empleador/.test(html), "nombre de la integración");
  assert(/<span class="pendh">POR DEFINIR<\/span>/.test(html) && /pendiente de definir/.test(html), "persona pendiente");
});
t("pantallas de chat: pocas burbujas de historial", () => {
  S.buildScreens(FX.agentes[0]).filter((s) => s.kind === "chat" || s.kind === "sheet").forEach((s) => assert(s.hist.length <= 6, s.id + " " + s.hist.length));
});
t("pestaña Diagrama acepta varias figuras", () => {
  const html = S.buildHtml(FX, { diagramas: { F1: [{ id: "F1.1", titulo: "a", caption: "Figura F1.1", svg: "<svg></svg>" }, { id: "F1.2", titulo: "b", caption: "Figura F1.2", svg: "<svg></svg>" }] } });
  assert((html.match(/class="dfig"/g) || []).length === 2);
});
console.log("\n" + n + " pruebas OK -> scripts/test/out/simulador.html");
