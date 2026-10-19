# Simulator: show the SOW 1:1 as a WhatsApp experience (for any kind of client)

The simulator is built by `scripts/sow_a_demo.js` with the kit of the `jelou-demo-whatsapp` plugin (see SKILL.md "Prerequisite") plus this skill's **visual extension** (`assets/visuales/kit-extension.js`, injected in the HTML; the plugin is not modified). A client who plays it must see what their user will see in WhatsApp: **if it is visible to the person, it is drawn; if it is behind the scenes, it is a note.**

There is **no per-client code**. What gets drawn comes from a **catalog of visual resources** (data) matched against the SOW; whatever the catalog does not know is drawn with a generic screen and a warning, and you teach it once (§5).

## 1. How a step becomes a picture
1. **Flow structure** (always): the person's own choices (buttons / lists whose labels match a decision's exits) stay inside ONE journey with `ir` and loop back on retries; system-decided branches become alternative journeys; API calls, decisions and routers are not bubbles: they go into the presenter note of the next visible step.
2. **Resource match**: every step is compared with the catalog (`assets/visuales/recursos.json` + your user catalog + `sow.demo.recursos`). Signals are regexes over the step's `etapa`, `componente`, `diagrama`, `mensaje`, `herramienta` and over its integration (`nombre`, `sistema`, `proposito`); the highest score wins; `excluir` removes false positives. Explicit always wins: `recurso: "firma-electronica"` (or `{ recurso, proveedor, params }`) on the step, `recurso`/`visual` on the integration, or `demo.pasos.<idPaso>.recurso`.
3. **Provider**: inside a resource, the provider is chosen by its `match` (Datafast, PayPhone, Dátil, Shopify…), else the integration's `sistema`, else the resource default. The provider can change the experience (`webview` / `nativa`), color, payment methods and carry real screenshots (`capturas`).
4. **Recipe**: the resource's recipe says what is drawn and with which text: a bot message that opens a **webview** or a **WhatsApp Flow**, raw **kit steps** (catalog, location request, image…), and what is sent **afterwards** (a PDF). Texts use variables `{{marca}} {{proveedor}} {{monto}} {{concepto}} {{documento}} {{usuario_nombre}} {{etapa}} {{mensaje}}…`; images use `{ "generar": "ticket-qr|documento-identidad|selfie|factura|producto|firma|pantalla" }` or `{ "src": "captura.png" }`.

### Resources included
| id | Draws | Typical signals |
|---|---|---|
| `foto-usuario` | The person sends a photo (sample ticket+QR, ID, selfie, invoice, product…) or a voice note | `usuario` step `[Foto…]`, «análisis de imagen» |
| `pago` | Payment gateway: webview checkout (summary, methods, pay button, approval) or native card Flow, per provider (Datafast, PayPhone, Placetopay, Deuna, Nuvei, Stripe, Culqi, Niubiz, Kushki, Wompi, Mercado Pago, Conekta, PayPal, JelouPay) | integration/step names a gateway, «pasarela», «cobro con tarjeta» |
| `documento-pdf` | Receipt / invoice / certificate as a PDF document after the next message | «genera la factura», «comprobante … PDF» |
| `firma-electronica` | E-signature webview: document preview, signature pad, confirmation code, signed (Dátil, Firmaza, DocuSign, Signaturit…) | «firma electrónica», Dátil… |
| `biometria` | Liveness / face verification webview: instructions, camera with face guide, result | «biometría», «prueba de vida», KYC |
| `captura-documento` | Capture of the ID document, front and back, with on-screen guide | «foto de la cédula», OCR de documento |
| `ecommerce` | **Jelou Shop webview** (always, whatever the source: Shopify, VTEX, WooCommerce or API sync into Jelou Shop): message with product image and «Ver Detalles», catalog screen (search, product rows, color/size chips, «Agregar al carrito»), product detail, cart with IVA, then «✅ ¡Pedido confirmado!» with «Ir al pago / Agregar más / Ver mi carrito» («Agregar más» loops back). Variant `externo` (`demo.ecommerce.checkout: "externo"`): the store's own checkout via `checkout_url` (Shopify/WooCommerce). Catalog and detail follow the Jelou docs; the cart is structural (no screenshot in the docs) | «catálogo», «carrito», «tienda», Shopify, VTEX, WooCommerce, Jelou Shop |
| `ubicacion` | Native «Enviar ubicación» button and map | «comparte tu ubicación» |
| `generico-externo` | **Fallback**: generic webview for any external step that matched nothing, flagged with a warning | `tercero` / `webview` |

Webview blocks available to recipes: the kit's (`marca titulo texto resumen opciones campo pago aviso`) plus the extension's (`imagen captura camara firma codigo productos lista progreso documento checklist boton cabecera buscador producto_fila chips boton_oscuro titulo_precio`). `captura` shows a real screenshot full width (`completa` hides the kit's header, `recorte` crops the phone's status bar). Providers can carry their own `mensaje` (Mercado Pago's «Proceder al pago» text) and, per country, their own screenshots (`mercadopago-colombia`…, chosen by `meta.pais`).

## 1b. Channel: the simulator is not always WhatsApp
The kit draws WhatsApp. For a bot on another channel the simulator keeps the same engine but applies the **skin of that channel** and adapts the content to what Jelou says that channel supports (Jelou Docs: `guides/nodos/*`, `api/envia-mensajes/*`, `guides/activacion-canales/*`).
- **Which channel:** `demo.canal` or `agentes[].canal` (explicit, any channel) → the `canal` of the agent's row in `alcance.fases` → free text (`meta.canal`, brief, objetivos; only messaging channels are read from free text, because «correo», «voz» or «sitio web» show up in almost every WhatsApp SOW). If the free text names WhatsApp, the channel is WhatsApp. Default WhatsApp. An agent can list several channels («WhatsApp, Instagram y chat web»): one set of journeys per channel, WhatsApp first.
- **Skins:** Instagram, Messenger, Widget web (header in the brand color, «Powered by Jelou»), X (Twitter), work chat (Teams, Slack). Email, voice and custom channels have no visual simulator: they are shown as a generic chat and a warning says so. The skins are approximations, not official copies (the panel footer says it).
- **Content adaptation:** no templates (HSM) or lock-screen notification (outbound becomes a plain bot message; on Instagram/Messenger the bot can only write first inside the 24 h window); no WhatsApp Flows (the form opens as a web page); no lists (numbered list + up to 3 buttons of 20 characters); no native location/contact requests, carousel, catalog or call permission (shown as text); text limits per channel (Instagram 1 000, Messenger 2 000); the embedded WebView is WhatsApp's (on Instagram/Messenger the link opens in the phone's browser).
- Each journey carries `canal` (skin) and its name ends with the channel when it is not WhatsApp or when there are several.

## 1c. Forms the SOW does not detail
A form step (`formulario`) with 0 or 1 field gets **probable fields** from `campos_probables` in the catalog (identity, billing, scheduling, claim, survey, credit, delivery, company, vehicle, contact, generic), chosen from the form title, stage and text (the title weighs most); up to 5 fields, the SOW's own first. Consent/authorization forms stay as they are. A form with 2 or more fields is never touched. The step note and a warning say which fields are probable; define `formulario.campos` (or `demo.pasos.<id>.formulario`) to replace them. Extend with `demo.campos_probables` or the user catalog.

## 1d. Template variables
`{{nombre_cliente}}`, `{{monto}}`, `{{fecha}}`… never show in the simulator: they are replaced by simulated values by keyword (name → the demo user, amount, date, city of the country, entity, document, code…). Variables the kit resolves itself (`{{form.x}}`, `{{etq.x}}`, `{{usuario.x}}`, `{{eleccion}}`, `{{marca.x}}`) are kept. Override with `demo.variables` (`{ "plan": "Plan Plus" }`).

## 2. Data that is missing: probable, not «pendiente»
In pre-kickoff the simulator never shows «dato por confirmar» inside the chat. Every `POR DEFINIR (hint)` becomes a probable value chosen from the hint and its sentence (amount `$3,50`, concept `Parqueo · 2 h 15 min`, delivery `PDF por este chat`…), the step note says «Valor de ejemplo: se confirma con el cliente», and the footer says the demo uses example values. Override with `demo.datos` (`{ "regex de la pista": "valor" }`), `demo.monto`, `demo.concepto`, `demo.pago`, `demo.productos`, `demo.marca`, `demo.usuario`. Never real personal data. The final SOW rebuilds the simulator from the final graph, so real values replace the probable ones.

## 3. Enrich by hand (persists across rebuilds; never edit `*-simulador.guion.json`)
- On the step or under `demo.pasos.<idPaso>` (`F1.P10` limits it to one agent): `recurso`, `adjunto: { tipo: "imagen|documento|audio|ubicacion|video", qr, generar, nombre, caption }`, `ocultar: true`, `mensaje` (text only in the demo).
- Client-specific resources in `demo.recursos[]` (same schema as the catalog, merged by `id`).

## 4. Integrations and what we can and cannot read
Read-only sources: `jelou marketplace inspect <slug> --agent` / the Jelou MCP marketplace list (app type, what it wraps, inputs) and the Jelou docs (`guides/integraciones/*`: embedded WebView or native in chat, countries, requirements). **The look of a third party's own screens (a gateway checkout, an e-signature provider, a bank page) is not in any of those sources**, so recipes draw a faithful flow with the client's brand color and never invent another brand's colors or logo. For pixel-faithful screens, teach the resource with screenshots (§5).
Known discrepancy to raise with Jelou (add it as an internal `preguntas_abiertas`): **Datafast** — marketplace app (TOOL wrapping «Pago WebView», checkout seguro de Datafast) versus its docs page (native in chat with Flows, assisted enablement). The catalog uses WebView and says so in the note.

## 5a. Use the Jelou docs first for missing screens
The public docs (docs.jelou.ai, also readable through the Jelou Docs MCP) carry real screenshots, animations and videos of what the end user sees in WhatsApp. Whenever the simulator warns «pantalla genérica» or a provider has no screenshots:
```bash
node scripts/aprender_desde_docs.js --buscar wompi                 # which docs pages mention it
node scripts/aprender_desde_docs.js --pagina <ruta> --videos --dry-run   # what it would take (images, GIF/video frames)
node scripts/aprender_desde_docs.js --pagina <ruta> --base pago --proveedor wompi --proveedor-nombre Wompi --omitir 1 --recorte-superior 9
node scripts/aprender_desde_docs.js --sembrar                      # once per machine: everything in assets/visuales/fuentes-docs.json
```
It downloads the images, takes distinct frames from GIFs (Pillow) and videos (ffmpeg), and registers them in your user catalog (internal use: the screenshots are Jelou documentation and are not shipped inside the skill; each person rebuilds them with `--sembrar`). Known from the docs today: Wompi, PayPal, Mercado Pago (Colombia, Perú, México, Chile, Argentina, Uruguay), Stripe, Deuna, and the Jelou Shop webview structure. **Gaps the docs do not cover** (ask the user for screenshots, §5): e-signature (Dátil…), biometrics/KYC, ID capture, Jelou Shop cart and checkout, Datafast's own checkout, Placetopay, PayPhone, Kushki, Culqi, Niubiz, Nuvei.

## 5. Teaching a new resource or provider (the "training")
What to hand over: the provider's name, the marketplace slug if any, the docs page, which experience the client will use, and **screenshots or a screen recording (frames) of the real screens in test mode**, in order, from the first screen to the result.
```bash
# new provider of an existing resource (recipe inherited, screenshots become the screens)
node scripts/aprender_recurso.js --base firma-electronica --proveedor firmaec --proveedor-nombre "FirmaEC" --capturas ./capturas/firmaec --botones "Continuar,Firmar,Listo"
# a new resource (e.g. the client's own warranty system)
node scripts/aprender_recurso.js --id garantias --nombre "Registro de garantías" --aplica-a tercero,webview --senales "garant[ií]a" --proveedor garantias-ejemplo --proveedor-nombre "Garantías Ejemplo" --capturas ./capturas/garantias
# read what Jelou knows about a marketplace app (read-only)
node scripts/aprender_recurso.js --base pago --proveedor datafast --desde-marketplace datafast
```
Where it is saved: your user catalog `~/.claude/jelou-sow-studio/visuales/` (default, survives skill updates), `--en skill` (`assets/visuales/`), or `--en cliente <sow.json>` (only that client). Rebuild and check the «Cobertura visual» line shows the resource and the «pantalla genérica» warning is gone. When the same provider appears in several clients, move the entry to the skill catalog so everyone gets it.
If the SOW mentions a visual the catalog cannot draw at all (a signature pad on a map, a 3D viewer…), draw it with the closest blocks, say so in the note, and add the new block to `assets/visuales/kit-extension.js` (CSS + a `case`) and a recipe.

## 6. Visual QA (mandatory before delivering the simulator)
`sow_a_demo.js` prints a coverage line (journeys, images, documents, Flows, webviews, resources used) and warnings (generic fallback, visual mention not drawn, system steps in the chat). Then open the HTML in a browser (serve the folder with `python -m http.server` if `file://` is blocked) and:
1. Run the kit's check in the console: `const out=[]; for(let i=0;i<G.journeys.length;i++){ startJourney(i); goTo(G.journeys[i].beats-1); await new Promise(r=>setTimeout(r,800)); out.push([G.journeys[i].nombre, S.jx===i, S.atEnd]); } out` — every journey `true, true`, no console errors (the extension logs `[kit-extension]` if the kit's engine changed).
2. Look at screenshots of: every image/photo, every webview screen (gateway, signature, biometrics, document capture, store), the receipt/invoice, one Flow, one template and a secondary branch.
3. Checklist: does every photo, QR, payment, signature, biometric step, invoice, map, form or template that the SOW mentions appear as a visual? Is any API call or decision a chat bubble? Do retries loop? Any «pendiente» text in the chat? Any generic fallback you can teach?
4. Fix by enriching `sow.json` (§3) or teaching resources (§5), rebuild, repeat.
