# The delivery package: Word, diagrams, simulator, Gantt and proposal

Every SOW version (new or updated) goes out as a package with the same base name and version. All of it comes from `sow.json`; the whole package uses the look of `assets/brand.json` (Poppins, teal and dark palette).

| File | Purpose | Made by | Sent to the client |
|---|---|---|---|
| `SOW-<Cliente>-vX.Y.docx` | The SOW on the jelou-sow Word template (letterhead, Poppins), diagrams embedded, schedule table | `build_all.js` | Yes |
| `diagramas/F1.1.png` / `.svg`, `F1.2`…, `figuras.json` | Figure set: one figure per small agent; overview + one per stage + common handoff per large agent (`F<n>.k`), and `FG` for a user-defined general diagram | `build_all.js` (engine `lib/diagram.js`) | Yes, when useful |
| `SOW-<Cliente>-vX.Y-simulador.html` | Phone screens per step and an interactive chat of the bot | `build_all.js` (`lib/simulator.js`) | Yes, for validation |
| `…-lint.txt` | Linter report | `build_all.js` | No |
| `<base>_cronograma.xlsx` | **Editable** Gantt (the PM adjusts it) + Entregables sheet | `cronograma.py` | Yes |
| `<base>_cronograma_gantt.png` / `.pdf` / `.svg` | Gantt readable without Excel | `cronograma.py` | Yes |
| `<base>_propuesta.html` / `.pdf` | The "selling" one-page version of the same content | `propuesta.py` | Yes, when Sales asks for it |
| `sow.json` | **The single source of truth** | — | No |
| `_cronograma.json`, `_propuesta.json` | Derived sources | `sow_a_paquete.py` | No |

Requirements: Node 18+ and `cd scripts && npm install` (only `@resvg/resvg-js` and `jszip`); for the extras Python 3 with `openpyxl` (`pip install openpyxl`) and, for the PDFs, Chrome or Edge installed (or `CHROME_PATH`). Everything is rendered **locally**: never a web service — the client's design is confidential. Without Chrome/Edge the proposal HTML still works (print it to PDF from the browser); without openpyxl there is no `.xlsx`.

## 1. Word, diagrams and simulator

```bash
cd scripts && npm install              # first time only
node build_all.js ../sow.json ../out   # lint → Word → diagrams (PNG + SVG) → HTML simulator
```
The linter must report 0 errors (otherwise `--force`, and say so). The Word marks "en revisión" unless `meta.estado` is `aprobado`. Visual check of the generated pages before delivering (open the DOCX, look at the diagrams and the red pending values).

## 2. Derive the extras from `sow.json`

```bash
python scripts/sow_a_paquete.py sow.json out/paquete/SOW_<Cliente>_vX.Y
# → _cronograma.json (only if cronograma.inicio exists) and _propuesta.json
```
It does not overwrite existing files unless `--forzar`. **Do not fix the derived files by hand**: the fix goes into `sow.json` and is derived again; otherwise the Gantt, the proposal and the SOW drift apart in the next version. The only hand edits allowed are the ones `sow.json` cannot express (the proposal's commercial blocks, the "reto" cards) — and they must be repeated in each version. There is no Mermaid map any more: the diagrams come from the engine of `build_all.js`, the same one the Word uses.

## 3. Schedule (Gantt)

`sow_a_paquete.py` turns `cronograma.hitos` into tasks: one task per milestone (or the milestone's own `tareas`, optional `{tarea, responsable, dias}`) plus a dated deliverable. Dates are business days, skipping weekends and `festivos` — the same calculation as the SOW's schedule table. A milestone may carry `responsable` ("Jelou" | "Cliente" | "Ambos"). Make the **client's tasks explicit** (inputs, validations, UAT) with `responsable: "Cliente"`: they are what moves the end date. The project is at most 20 business days.

```bash
python scripts/cronograma.py out/paquete/SOW_<Cliente>_vX.Y_cronograma.json out/paquete/SOW_<Cliente>_vX.Y_cronograma
# → .xlsx, _gantt.svg/.png/.pdf, _entregables.json
```

## 4. Proposal (one-page HTML + PDF)

The "selling" version of the same content, light/dark and mobile, with a PDF to attach. Fixed design in `assets/propuesta.css` (brand tokens filled from `assets/brand.json`, Poppins embedded); per project only the JSON changes. `sow_a_paquete.py` pre-fills hero, solution stages per agent, an illustrative chat from the main path of the first agent, architecture, scope (includes / does not include / client responsibilities), integrations per step and the route; the `_pendiente` list in the generated JSON says what is left to write by hand.

```bash
python scripts/propuesta.py out/paquete/SOW_<Cliente>_vX.Y_propuesta.json out/paquete/SOW_<Cliente>_vX.Y_propuesta \
  --cronograma out/paquete/SOW_<Cliente>_vX.Y_cronograma.json --diagramas out/diagramas     # → .html + .pdf
```
- `solucion.mapas` lists `{titulo, id}` (`sow_a_paquete.py` fills it with the same figure set as the Word, asking `node lib/figuras.js`); each SVG is read from `--diagramas <dir>/<id>.svg` (generate them first with `build_all.js`). A missing SVG is skipped with a warning.
- Text admits `**bold**`, not HTML.
- The illustrative WhatsApp chat uses **fictitious data** (never real client data) and carries the note "Conversación ilustrativa…". Review what `sow_a_paquete.py` copied from the steps.
- **Investment amounts and fees are set by the commercial owner**: never invent them; if they are missing, leave the section out and say so.
- Check: open the HTML and look at the PDF pages (no block split across pages).
