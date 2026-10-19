# Review round: no «dato de ejemplo» in the simulator
Every value the person types (user steps, Flow/webview fields) is now inferred from the field label, the form title and the step text (`DOMINIO` table: work order, order, plate, material, quantity, supplier, reason, comment, city, branch…; then the generic table, then `sow.demo.datos`). Fields without an `ejemplo` also get a typed value. The last resort is a believable code built from the key word («Atributo 01»), never «dato de ejemplo», and the build warns which values were not inferred so they can be filled from the presale document / Diio (SOW field `ejemplo`, step `mensaje`, or `sow.demo.datos`).

# Review round: the SOW itself is channel-aware
Until now only the simulator knew the channel; the SOW, the linter and the instructions assumed WhatsApp, so nothing stopped a widget project from promising WhatsApp Flows.
- **Linter `CANAL`** (new section 18, `lib/demo-canales.js infoCanales`): each agent's channel (explicit, `alcance.fases`, brief; default WhatsApp with a warning). On a project with no WhatsApp channel: ERROR for a `formulario` with `herramienta: flows`, a step `componente` that says Flows, `lista` steps, and for WhatsApp Flows / carousel / drop-down list / native location-contact requests mentioned in solution, stories, scope, integrations or rules; WARN for undecided form tool, HSM templates, WhatsApp Business verification, outbound flows (24 h window), text over the channel limit and channels without simulator. Multi-channel agents get a reminder of what is WhatsApp-only. WhatsApp projects are unchanged.
- **Instructions:** SKILL.md A3 «Channel first» (declare the channel, never promise WhatsApp-only features elsewhere) and per-channel limits; `references/catalogo-jelou.md` §6.1 capability matrix from the Jelou docs (unverified cells marked «confirm»); `minimum-questions.md` asks the channel first.
- Tests: lint cases for widget vs WhatsApp.

# Review round: probable form fields, simulated variables, channels other than WhatsApp
- **Forms with no fields** (the presales SOW does not detail them): a `formulario` with 0 or 1 field gets probable fields from the new `campos_probables` catalog section (identity, billing, scheduling, claim, survey, credit, delivery, company, vehicle, contact, generic; consent forms stay as is, forms with 2+ fields are never touched). The title weighs most, the user/client layers win ties; the step note and a warning list the probable fields. Same for webview forms.
- **Template variables** `{{x}}` are never shown: simulated by keyword (name, amount, date, city, entity, document, code…), kit variables kept, `demo.variables` overrides, final safety sweep over the whole script.
- **Channels:** `lib/demo-canales.js` (capabilities from the Jelou docs) detects the channel per agent (`demo.canal`, `agentes[].canal`, `alcance.fases[].canal`, free text limited to messaging channels so «correo»/«portal web» do not mislabel WhatsApp bots; several channels give one set of journeys each). `assets/visuales/kit-skins.js` re-skins the kit (Instagram, Messenger, widget web, X, work chat; email/voice/custom shown generic with a warning). Content is adapted per channel: no templates/notification, Flows become web forms, lists become numbered text + buttons, WhatsApp-only formats become text, per-channel text limits; unused Flows/webviews are pruned from the script.
- Tests: 36 simulator tests (fields, variables, channel detection and adaptation, multi-channel, skins injection). Docs: `references/simulador-visual.md` §1b-1d, `sow-json-format.md`, SKILL.md A3.
- Local change until published.

# Review round: the simulator kit comes from the skill library
- The skill `jelou-demo-whatsapp` was published to the skill library (revision 87e5dbe4…; full contents, reference screenshots downscaled to fit the server's size limit). `lib/demo-kit.js` now finds the kit in the plugin, the plugin's stable folder or the skillbox cache, and `instalar_plugin_demos.js` downloads it with `skillbox fetch` before falling back to the plugin zip. Handles skillbox's EPERM on an already cached revision.

> **Dependency:** the WhatsApp simulator needs the separate plugin `jelou-demos-whatsapp` (skill `jelou-demo-whatsapp`, v0.4.0+), installed with `node scripts/instalar_plugin_demos.js`. It is not bundled in this skill.

# Review round: Jelou docs as a source of real screens, Jelou Shop webview
- `scripts/aprender_desde_docs.js`: searches docs.jelou.ai (`--buscar`), reads a page as markdown, downloads the screenshots of what the end user sees (filters out node/canvas/config images), takes distinct frames from GIFs (Pillow) and videos (ffmpeg) and registers them with `aprender_recurso.js` in the user catalog. `--sembrar` learns everything in `assets/visuales/fuentes-docs.json` (Wompi, PayPal, Mercado Pago ×6 countries, Stripe, Deuna). Screenshots are Jelou documentation: kept in the user's folder, not shipped in the skill. Known gaps listed there (e-signature, biometrics/KYC, ID capture, Jelou Shop cart/checkout, other gateways' own checkouts).
- Engine: provider chosen by `meta.pais` (per-country providers inherit from the base provider with the same `match`), provider-level `mensaje`, full-screen `captura` blocks (`completa`, `recorte`), array variables spread inside block lists, `accion: "repetir"` buttons that loop back, `header` image on the opening message.
- Standard Jelou payment message (webview): «¡Es hora de procesar tu pago de forma segura! … [Proceder al pago]» and Mercado Pago's own message.
- `ecommerce` rebuilt as the **Jelou Shop webview** (whatever the source platform): image message + «Ver Detalles», catalog (search, rows, color/size chips), product detail, cart with IVA, «✅ ¡Pedido confirmado!» with «Agregar más» looping back; `externo` variant for the store's checkout (`demo.ecommerce.checkout`). New extension blocks `cabecera buscador producto_fila chips boton_oscuro titulo_precio`.
- Tests: 27 simulator tests (Jelou Shop structure and loop, provider by country with its own message).
- Local change, not uploaded to the library.

# Review round: visual resources as a catalog (any client), teachable
Feedback: the first fix (QR, payment, invoice) was a patch for one case; it must adapt to any client (other gateways, ecommerce, biometrics, e-signature in webview, images).
- **Resource catalog (data, not code):** `assets/visuales/recursos.json` (replaces `pagos.json`): foto-usuario, pago (14 providers, webview or native), documento-pdf, firma-electronica (Dátil, Firmaza, DocuSign, Signaturit), biometria, captura-documento, ecommerce, ubicacion and a generic fallback. Each = signals + recipe with variables. `scripts/lib/demo-recursos.js` matches (score over etapa/componente/diagrama/mensaje/integration, `excluir`, explicit `recurso`), picks the provider and applies the recipe. `sow_a_demo.js` no longer has per-resource rules.
- **Three catalog layers, last wins by id:** the skill, the user's (`~/.claude/jelou-sow-studio/visuales/`, survives skill updates) and `sow.demo.recursos` (one client).
- **Visual extension of the kit without touching the plugin:** `assets/visuales/kit-extension.js` is injected into the HTML and wraps `wvBlock` with blocks `imagen, captura, camara, firma, codigo, productos, lista, progreso, documento, checklist, boton`; it warns and degrades if the kit's engine changes.
- **More synthetic images:** ticket+QR, ID document, selfie, invoice, product, signature, generic screen (`lib/demo-assets.js`); real files from the user supported.
- **Teaching:** `scripts/aprender_recurso.js` registers a provider or a new resource from screenshots (`--capturas`), button labels, marketplace info (`--desde-marketplace`, read-only) in the user catalog, the skill or one client's sow.json. Screenshots become the webview screens.
- Warnings: generic fallback in use («enséñasela a la skill»), visual mention not drawn. Tests: `demo-recursos-fixture.json` (store: ecommerce, ID photo, biometrics, e-signature, PayPhone, location, unknown system) and 8 new assertions including the teaching round trip. SKILL.md A3/A7, `references/simulador-visual.md` (rewritten) and `sow-json-format.md` updated.
- Local change, not uploaded to the library.

# Review round: simulator shows the SOW 1:1 as a WhatsApp experience
Result of the Malecón test (no QR image, no payment gateway, no invoice; the chat read like a log).
- `scripts/sow_a_demo.js` rewritten: graph conversion instead of linear paths. The person's own choices (buttons/lists matching the decision exits) stay in ONE journey with `ir` and loop back on retries; only system-decided branches become alternative journeys (named by the decision, e.g. «Resultado del pago: pago no completado»; none duplicated for flows that continue into another one).
- API calls, decisions and routers are no longer chat bubbles: they go into the presenter note of the next visible step. A user step that only repeats a button tap is hidden (fuzzy match).
- Visual resources: photo/QR sent by the person (synthetic ticket PNG, `scripts/lib/demo-assets.js`, QR not readable), payment gateway screen (webview checkout or native card Flow; `assets/visuales/pagos.json`, built from the Jelou docs and `jelou marketplace inspect`; flags the Datafast marketplace-vs-docs discrepancy; never invents other brands' colors), receipt/invoice PDF documents, bot images/locations/videos via `adjunto`.
- Probable data instead of «dato por confirmar» (`demo.datos`, `demo.monto`, `demo.concepto`, `demo.pago`).
- Per-step enrichment that survives rebuilds: `demo.pasos`, plus `adjunto` / `pantalla` on steps. Coverage line and warnings («menciona un recurso visual… y no se dibuja nada»).
- New `references/simulador-visual.md` (mapping table, probable data, payment gateways, how to train the skill with screenshots, mandatory visual QA); SKILL.md A3 and A7 and the tools table updated.
- Tests: `test/demo-pago-fixture.json` (anonymized parking-payment case) and 9 new assertions in `test/demo.test.js`.
- Local change, not uploaded to the library.

# Review round: simulator through the jelou-demo-whatsapp plugin
- The simulator is now generated with the kit of the `jelou-demo-whatsapp` skill (plugin `jelou-demos-whatsapp` v0.4.0, from `jelou-demos-plugin-v0.4.0.zip`): `scripts/sow_a_demo.js` converts `agentes[].pasos` into the kit's `guion.json` (journeys per flow + alternative paths per decision, Meta Flows for `formulario`, webviews for `tercero`, plantilla + notificación for outbound), runs the kit's validator (Meta's Flow validator) and builds the HTML. Missing data is mocked as probable and noted; rebuilt from the final `sow.json` in later versions. Optional `demo` section in sow.json.
- `scripts/lib/demo-kit.js` + `scripts/instalar_plugin_demos.js`: find the installed plugin (`claude plugin list`), or install it (source: `--fuente`, `JELOU_DEMOS_PLUGIN`, `assets/jelou-demos-plugin*.zip`, Downloads) as a local marketplace under `~/.claude/marketplaces-locales/` + `claude plugin install`. `build_all.js` installs it automatically when missing; the old `lib/simulator.js` stays only as a fallback.
- Local change, not uploaded to the library. When the plugin is published in the library, point `--fuente`/`JELOU_DEMOS_PLUGIN` to it.

# Review round: WhatsApp-look simulator, pre-kickoff simulator, upgrade reading

1. **Scope lock widened:** anything said in ANY Diio (handoff, pre-kickoff session, later ones), email or note that is not in the presales SOW becomes a `por_decidir` addition with ONE question owned by Comercial (SKILL.md, `references/prekickoff.md`). Each Diio is compared line by line against the presales SOW before the scope is closed.
2. **Simulator also in pre-kickoff:** `build_all.js --modo prekickoff` now writes `*-simulador.html` next to the deck and the two faltantes documents (also generated when the context is enough and the flow goes straight to the full SOW).
3. **Simulator redesigned 1:1 with WhatsApp** (`lib/simulator.js`, UI layer only; the engine and the sow.json format are unchanged): Android-style header (back, avatar, business account, video/call/menu), doodle wallpaper, date chip, encryption and business notices, bubbles with tails, time and blue double tick, WhatsApp text formatting (`*bold*`, `_italic_`, `~strike~`), reply buttons attached under the bubble, list message with bottom sheet (radio + Enviar), WhatsApp Flow as bottom sheet ("Gestionado por la empresa") and WebView as in-app browser, input bar with emoji/attach/camera/mic-send, "escribiendo…" in the header, light/dark (auto + toggle), phone bezel on desktop and full-bleed on mobile. System steps (API, router, third party, handoff, simulated outcomes) no longer pollute the chat: they go to a "Detrás de escena" panel with the current step, the choice of simulated result and a log; "Ritmo rápido" and "Reiniciar". Tabs: Simular (default), Pantallas (same look, annotated), Diagrama. Still a single HTML with no external resources; can also be published as a private artifact on request.
4. **Upgrade / upselling with an existing bot:** SKILL.md A1b and mode 0: ask for the Jelou CLI profile, read the bot read-only (`--profile`, never `auth switch`, scratch folder), build the SOW as close to the real bot as possible (existing vs new work, deviations vs presales, no credentials or personal data), never push or publish.

# Review round: pre-kickoff mode, scope lock, hours cap, tests in the schedule

## A. Mode 0: pre-kickoff (before the SOW)
- New front mode in SKILL.md with a deterministic activation rule (`scripts/umbral_prekickoff.js`, `lib/common.js prekickoffThreshold`): besides the team, >= 5 blocking questions, integrations without documentation or QA environment, or presales assumptions not confirmed by the client. If none, the skill says the context is enough and asks for confirmation and example resources.
- `meta.fase: "prekickoff"` (or `build_all.js --modo prekickoff`): partial sow.json; the linter is tolerant (full-SOW sections not required, client deliverables missing are warnings) but still checks credentials, graph integrity, contradictions, scope lock and diagram rules.
- **Pre-kickoff deck** `scripts/build_kickoff_pptx.js` + `lib/pptx.js`: injects generated slides into `assets/kickoff-template.pptx`, **decompiled from the example kickoff deck** (theme "Jelou", master/layouts rescaled to 16:9, five embedded Poppins faces, two logos, 23 line icons; every slide and client-specific text removed; placeholder pattern slides + icon gallery). Tokens in `assets/kickoff-brand.json`. 21-24 slides from sow.json (team to fill live, HOY vs CON JELOU, stages, components, actors, native-shape end-to-end flow, "quién llama a quién", outbound, one validation slide per stage with the client notes area, integrations expone/consume, assumptions, pending, risks, next steps + UAT rule, closing). Lists are measured with the Poppins metrics and split into continuation slides; no overflow.
- **Faltantes documents** `scripts/build_faltantes_docx.js` (shared Word kit `lib/wordxml.js`, extracted from build_sow_docx.js): `*-faltantes-cliente.docx` (business language) and `*-faltantes-interno.docx` (capability checks, presales doubts, assumptions, additionals for Comercial, changes versus presales, team, UAT clause pending Legal).
- `dev/extract_kickoff_template.js` documents and reproduces the decompilation (not needed at runtime). Docs: `references/prekickoff.md`.

## B. Scope lock
`alcance.base` (frozen) + `ampliaciones_solicitadas[]` (por_decidir | aprobada_comercial | rechazada) + `cambios_respecto_preventa[]`. por_decidir items are out of scope ("Sujeto a evaluación comercial" in the Word), cannot appear in flows, stories, solution or effort (linter ERROR) and produce exactly ONE question owned by Comercial; approved ones need `cobro_adicional` and a `cambios` row. New question fields: `audiencia` (cliente | interna | comercial), `tipo`, `etapa`, `tema`, `ampliacion`.

## C. Other changes
1. **End-to-end diagram** FE "Diagrama end-to-end" (at most ~8 boxes, business milestones, entries and exits) in addition to the per-stage figures, first in the Word's conversation map, also in the simulator "Diagrama" tab and the deck. `agentes[].resumen_cliente` (explicit) with automatic fallback; new node type `hito`; merged overview stage names read better ("A y B").
2. **Hours cap** 72 h including management (`meta.tope_horas`, `meta.excepcion_horas`); `effort-rates.json` and `references/effort-model.md` recalibrated for Claude automating almost everything (ratio table, new examples); management default 15 %. Default pending business confirmation of whether management counts.
3. **Tests in the schedule:** "Pruebas internas" and "UAT del cliente" are explicit milestones (`hito.tipo`) with days and dates in the Word, the Gantt (UAT owner = Cliente) and the proposal; effort items `pruebas_qa` and the new `uat_acompanamiento`; linter ERROR when a milestone is missing.
4. **UAT time rule** (draft clause, pending Legal review) in the schedule, client responsibilities, acceptance section and the deck's next steps, plus a `dependencias_cliente` entry `tipo: "uat"`; linter warnings `UAT` and `LEGAL`.
5. Everything previous kept (split diagrams, `formulario`, grouped lint with BLOQUEANTES, team question, compare-with-bot).
- Tests: `test/prekickoff.test.js` (threshold, tolerant lint, deck structure and no overflow, faltantes, scope lock, E2E), extended `lint.test.js` and `figuras.test.js`; anonymized fixtures `test/prekickoff-fixture.json` and `test/full-scope-lock-fixture.json` (credit-origination case, no real names). `npm test` runs everything.

# Review round: Colfondos real-world test

1. **Diagrams split.** New `scripts/lib/figuras.js`: flows over 18 steps become an overview (F1.1), one detail per stage (at most 12 nodes, `Viene de` / `Continúa en` link nodes) and a common handoff figure; error/advisor/end exits are local terminals ("Derivar a asesor (ver diagrama de handoff)" / "Fin"), never long edges. Stages from `pasos[].grupo` (alias `fase`) > `etapa`, inheriting along the main path; fine-grained etapas are merged automatically. Small flows (example R1) stay one figure; `dividir_diagrama: false`; user `diagrama_general` is `FG`. Word, `diagramas/F*.png|svg` + `figuras.json`, proposal (`sow_a_paquete.py` asks `lib/figuras.js`), `render_diagram.js` and the simulator "Diagrama" tab use the same set. Engine: split figures use a 1200 px canvas (larger text in the Word), edge labels can no longer fall outside the canvas, new types `etapa` and `enlace`, `validateGraph` accepts fragments (`spec.fragmento`). Linter warns for figures over 12 nodes and for auto-merged stages.
2. **`formulario` step type** (`herramienta`: flows | webview | por_definir; fields in `formulario.campos`); `webview` kept as alias. Legend and simulator: "Formulario (WhatsApp Flow / WebView)". New effort type `formulario`. Field types `fecha`, `telefono`.
3. **Simulator:** form screens use `etiqueta/tipo/opciones/ejemplo/obligatorio` (no more "0000"); the Simular form has real inputs, options, example values and required validation; header counts steps by type; API steps show the integration name; pending persona renders red with a pending header; Diagrama tab shows all figures.
4. **Word:** effort table uses Spanish `etiqueta` from `effort-rates.json`; "1 persona / N personas"; headings keep the original casing with " — " instead of nested parentheses; the effort section says how many days depend on client deliverables without date (and that there is no slack).
5. **Linter:** report starts with a "BLOQUEANTES" block, warnings grouped by section with counts, pending values counted not listed. Blocking (ERROR when `aprobado`): personal-data retention, escalation automatic + offered to the same destination, integrations without owner/documentation/test environment and no dated dependency, dependencies without deadline. Proposed dates for dependencies without `fecha_limite` (suggestion only; new optional `hito` and `integracion` fields on dependencies).
6. **Team:** SKILL.md A2 requires asking before building even when sources name people; lint warns when `equipo` has names and `meta.equipo_confirmado` is not true.
7. Docs, example and tests updated (`test/figuras.test.js`, `test/figuras-fixture.json` anonymized from the 31-step Colfondos graph; simulator and lint tests extended).

> **Dependency:** the simulator needs the separate plugin `jelou-demos-whatsapp` (skill `jelou-demo-whatsapp`, v0.4.0+). It is not part of this skill: `node scripts/instalar_plugin_demos.js` installs it from a zip (`--fuente`), the env var `JELOU_DEMOS_PLUGIN`, `assets/` or Downloads.

# Review round: hours and dates only after approval
- SKILL.md (A5, A5b, A7, A8, mode B, rules): the SOW under review has ONE schedule table (phase, deliverable, description) with no times, days or dates and no AI-effort table. Hours, business days and dates are added when the SOW is approved (`meta.estado: "aprobado"`, then set `cronograma.inicio`); the Gantt and the proposal are generated only then. `esfuerzo` stays in sow.json (72 h cap still checked).
- `build_sow_docx.js` applies it (effort table and schedule days/dates only when approved); `lint_sow.js` asks for `cronograma.inicio` and the UAT date only when approved; references `sow-json-format.md` and `paquete-de-entrega.md` updated.
- Local change, not uploaded to the library. The pre-kickoff deck still shows days and dates in its next-steps slide.

# jelou-sow-studio: what this folder is

Local merge of the library skill `jelou-sow-studio` (revision 8a6ee25d-cd14-4dbf-b281-6cf2967bc371 as of 2026-10-15) and the local skill `jelou-sow`, with the **look of jelou-sow**. Nothing was published or uploaded; `jelou-sow` was only read.

## From the library skill (jelou-sow-studio)
- Modes A (new SOW), B (new version, vX.Y), C (package), D (deliver) and the tools table (Jelou AI Docs MCP, Webview Studio MCP, Jelou MCP/CLI read-only, Diio, ClickUp).
- Pre-Sales design ingestion (`Flujo_N`, `WS#n`, `[Supuesto]`): `references/design-document.md`, now mapped to the v2 graph (one `agentes[]` entry per `Flujo_N`, `componente` tag on steps).
- `references/`: ciclo-y-entrega, paquete-de-entrega (rewritten for the new pipeline), catalogo-jelou (merged), how-jelou-bots-work (library version + docs map, merged), minimum-questions and consistency-checklist (union).
- Versioning convention: 1.0 initial, 1.1/1.2 corrections, 2.0/3.0 baselines (max 3), approval = `meta.estado` (`en_revision` | `aprobado`), never 0.x.
- Linter checks ported into the single `scripts/lint_sow.js`: bare webview/Lambda, refined money-word detection, `componente` API/WS#n needs `integracion`, `Flujo_N` naming and order, `WS#n` = `INT-n`, version/estado/date rules, optional `cronograma.inicio`.
- Package extras, adapted to sow.json v2: `scripts/cronograma.py` (editable .xlsx Gantt), `scripts/propuesta.py` + `assets/propuesta.css` (one-page proposal), `scripts/sow_a_paquete.py` (derives both from v2).
- Mode B rule: every clause of the previous DOCX must land in `sow.json` or be removed on purpose (diff before writing).

## From jelou-sow (kept as is)
- Word pipeline: `assets/template/sow-template.docx` (Poppins, letterhead), `scripts/build_sow_docx.js`, `build_all.js`, `assets/brand.json`, fonts.
- Diagram engine (`lib/diagram.js`, PNG + SVG), HTML simulator (`lib/simulator.js`, `build_html.js`), `render_diagram.js`.
- Graph per agent, effort model (`references/effort-model.md`, `lib/effort-rates.json`), 20-business-day limit, team question (POR COMPLETAR in red), optional `desviaciones` comparison, all linter checks, tests (`diagram`, `simulator`), `jelou-tools-catalog.md` content (merged into `catalogo-jelou.md` §0 and §10), checklist items 30-37, Team and Conversation-design questions.
- Example SOW `assets/example-sow.json` (now 1.0 / `en_revision`).

## Changed
- Draft marking in the Word, footer, simulator and linter is driven by `meta.estado`, not by version < 1.0. The version-control paragraph in the Word describes the 1.0 convention.
- `sow_a_paquete.py` reads v2 and no longer emits a Mermaid map; the proposal embeds the engine's SVGs (`--diagramas out/diagramas`).
- Gantt is drawn locally as SVG/PNG/PDF with `brand.json` colors and Poppins (no Mermaid); the proposal uses Poppins and brand colors. PNG uses `scripts/svg_to_png.js` (resvg); PDFs use Chrome or Edge if present.
- `how-jelou-bots-work.md` §6: the old 39-day milestone guide was replaced by a pointer to the effort model (20-day limit).
- `package.json` minimal: `@resvg/resvg-js`, `jszip` (the unused `docx` dependency was dropped).
- New `scripts/test/lint.test.js`: example lints with 0 errors and 15 seeded errors are caught.

## Removed (library corporate-template path)
`build_sow_corporativo.py`, `actualizar_docx_plantilla.py`, `insertar_en_sow.py`, `render_diagrama.py` (Mermaid), `assets/plantilla/textos.json`, `plantilla-corporativa.md`, the Montserrat template background, the library's v1 `sow.json` example and `build_sow_docx.js`, `mapa_ejemplo.mmd`, and every text saying the client must see the Montserrat template. The client now sees the jelou-sow template.

## Not migrated
- Embedding the Gantt image and the deliverables table into the Word (it was done by `insertar_en_sow.py` on the corporate DOCX): the Word keeps its own schedule table; the Gantt goes as separate attachments.
- Editing a copy of the previous real DOCX section by section: replaced by regenerating from `sow.json`.
- `--sin-pendientes` (Word without the pending annex) and `--matriz-url`: not in the jelou-sow builder.
- The library `example-sow.json` (v1 format).

## How to run
```bash
cd scripts && npm install
node build_all.js ../assets/example-sow.json ../out      # lint + docx + diagrams + simulator
node test/diagram.test.js && node test/simulator.test.js && node test/lint.test.js
python sow_a_paquete.py ../assets/example-sow.json ../out/paquete/SOW_demo     # needs openpyxl
python cronograma.py ../out/paquete/SOW_demo_cronograma.json ../out/paquete/SOW_demo_cronograma
python propuesta.py ../out/paquete/SOW_demo_propuesta.json ../out/paquete/SOW_demo_propuesta \
  --cronograma ../out/paquete/SOW_demo_cronograma.json --diagramas ../out/diagramas
```
