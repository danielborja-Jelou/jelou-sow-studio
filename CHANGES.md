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

# jelou-sow-studio: what this folder is

Local merge of the library skill `jelou-sow-studio` (revision f2a9a92d-1008-4ebd-93f5-7272a1952c4c) and the local skill `jelou-sow`, with the **look of jelou-sow**. Nothing was published or uploaded; `jelou-sow` was only read.

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
