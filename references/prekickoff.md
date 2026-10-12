# Pre-kickoff mode (before the SOW)

## Why it exists
The real flow: Sales/Presales hand over an **incomplete pre-SOW** (Word) and the **Diio of the handoff meeting** (what was sold). When much is missing beyond the team, building the full SOW only produces a document full of red. Instead the skill first generates **three things** and then waits for the client meeting:

1. a **pre-kickoff deck** (`.pptx`) to present to the client (21-24 slides, the Jelou kickoff format);
2. a **faltantes document for the CLIENT** (Word, business language: what they must deliver or decide, owner, date);
3. a **faltantes document INTERNAL** (Word, Jelou only: capability checks, presales doubts, assumptions, additionals for Comercial, changes versus presales, team data, the UAT clause pending Legal).

Then the user holds the client meeting and brings the **new Diio** with the answers. With pre-SOW + Diio 1 + Diio 2 (+ any inputs) the skill builds the whole package (mode A/C: SOW Word, figures, simulator, Gantt, proposal). If the client does not deliver the technical inputs for v1, mode B versions it (1.1, 1.2…) when they arrive, keeping unresolved items red.

```
pre-SOW + Diio 1 ──► sow.json (meta.fase "prekickoff") ──► umbral_prekickoff.js ──┬─ context enough ─► full SOW (confirm with the user, ask for example resources)
                                                                                   └─ threshold met ──► build_all.js --modo prekickoff
                                                                                        ├─ deck .pptx (present to the client)
                                                                                        ├─ faltantes-cliente.docx
                                                                                        └─ faltantes-interno.docx
client meeting ─► Diio 2 ─► update sow.json (answers; scope lock) ─► remove meta.fase ─► build_all.js ─► full package ─► (no technical inputs yet?) versions 1.1, 1.2…
```

## Activation threshold (deterministic: `node scripts/umbral_prekickoff.js sow.json`)
Besides the team, enter pre-kickoff when ANY of:

| Condition | How it is counted |
|---|---|
| **>= 5 blocking open questions** | `preguntas_abiertas[].bloquea: true`, excluding `tipo: "equipo"` or `tema: "Equipo"` |
| **Integrations without documentation or QA/test environment** | any `integraciones[]` whose `documentacion` or `ambiente_pruebas` is not `si` |
| **Presales assumptions not confirmed by the client** | any `alcance.supuestos` entry that is a string (a `[Supuesto]` of the presales doc) or an object without `confirmado_cliente: true` |

If none applies the script says the context is enough: tell the user, **ask them to confirm** going straight to the full SOW and to **provide example resources** (documents, texts, access), then follow mode A.

## What the skill does, step by step
1. Read the pre-SOW (`references/design-document.md`) and Diio 1; ask the team question (SKILL.md A2).
2. Build a **partial `sow.json`** with `meta.fase: "prekickoff"`: agents with the conversation graph (`Flujo_N`), `integraciones` (with `expone`/`consume`), `preguntas_abiertas` with `audiencia`, `tipo`, `etapa`, `tema`; `alcance.supuestos` (objects with the question that closes each), `riesgos`, `dependencias_cliente`, `cronograma` (proposed days), and the `prekickoff` section below. Do not invent figures: pending = `POR COMPLETAR` / `POR DEFINIR` (red).
3. Detect **extras** and **changes versus presales** (below): extras become `ampliaciones_solicitadas` + ONE question to Comercial each; contradictions become `cambios_respecto_preventa` + a question.
4. `node scripts/umbral_prekickoff.js sow.json`, then `node scripts/build_all.js sow.json out --modo prekickoff` (or just set `meta.fase`). The linter is tolerant in this mode (full-SOW sections are not required, client deliverables still missing are warnings) but still checks credentials, graph integrity, contradictions with out of scope, the scope lock and the diagram rules.
5. Look at the deck (render it: PowerPoint/LibreOffice, or open it), and read both faltantes documents. Deliver the three files; do not send anything to the client unless the user asks.

## The deck: slides and where each one comes from
Format decompiled from the Jelou kickoff deck (`assets/kickoff-template.pptx`, tokens in `assets/kickoff-brand.json`: 960x540 pt, Poppins embedded, colours `151C2A` ink, `00B4C7` turquoise, `206C83` petrol, `E6F2F4` mint, `FAFBFF` background, `FF6633` orange, alert `FFF4EE`). Emphasis in titles: `*words*` turn turquoise; `POR COMPLETAR` / `POR DEFINIR` print red.

| # | Slide | Source in sow.json |
|---|---|---|
| 1 | Cover (client, channel pills, date to fill) | `meta`, `prekickoff.portada_titulo`, `subtitulo`, `canal`, `fecha_sesion` |
| 2 | Agenda "hoja de ruta" (6 cards) | `prekickoff.agenda` (default texts) |
| 3 | Team blocks to fill live (Jelou / client roles) | `equipo` (names only when present; empty cells otherwise), `prekickoff.roles_cliente` |
| 4 | Context HOY vs CON JELOU | `prekickoff.contexto` {titulo, hoy[], con_jelou[], dato}; fallback `objetivos.especificos` |
| 5 | Scope by stages (Jelou stages dark, others white) | `prekickoff.etapas.items` {nombre, texto, jelou, titulo_validacion}; fallback `grupo` names of the first agent |
| 6 | Components Jelou builds (cards, 6 per slide) | `prekickoff.componentes.items`; fallback `solucion.componentes` |
| 7 | Actors (cards, one highlighted) | `prekickoff.actores.items` {nombre, texto, icono, destacado} |
| 8 | End-to-end flow (native shapes: boxes, arrows, labels; inbound/outbound entries) | `agentes[].resumen_cliente` (same figure FE as the Word), `prekickoff.e2e` {titulo, nota} |
| 9 | Technical table "quién llama a quién" | `prekickoff.llamadas.filas` {de_a, que_viaja, mecanismo}; fallback `integraciones` |
| 10 | Outbound (rows + "A validar" box) | `prekickoff.outbound` {titulo, items[{titulo, texto, quien}], validar} |
| 11 | Block divider "Validación etapa por etapa" | automatic when there are client questions |
| 12-15 | Validation per stage: 2 or 3 question cards + "Notas / respuesta del cliente" box | `preguntas_abiertas` with `audiencia: cliente` (default), grouped by `etapa` then `tema` |
| 16 | Integrations table (expone / consume / contacto · doc · QA) | `integraciones` (`expone`, `consume`, `responsable_cliente`, `documentacion`, `ambiente_pruebas`), `prekickoff.integraciones_nota` |
| 17 | Assumptions to confirm or close (supuesto / pregunta / decisión) | `alcance.supuestos` not confirmed |
| 18 | Pending items: from the document / from the client / **por evaluar (Comercial)** | `prekickoff.pendientes`; `dependencias_cliente`; `ampliaciones_solicitadas` por_decidir + `cambios_respecto_preventa` |
| 19 | Risks (cards 2x3) | `riesgos` |
| 20 | Deliverables and next steps (+ the **UAT rule**) | `cronograma.hitos` (days, dates, owner: UAT = client), the UAT clause |
| 21 | Closing | `prekickoff.cierre_titulo`, `cierre_texto`, `cierre_boton` |

Rules the builder enforces: every list is measured with the real Poppins metrics and **split into continuation slides** instead of overflowing (validation cards, tables, pending, risks); the font shrinks (12 -> 11 -> 10.5) before a card is split; a title never exceeds two lines; an end-to-end diagram with more than 6 layers falls back to the engine's picture and the builder prints a notice. Layout notices (`layout notice:` lines) mean something had to be truncated: fix the text.

The deck is a first draft of a conversation, not a contract: client-facing wording only; never credentials, never internal doubts (those go to the internal faltantes).

## The faltantes documents
- **Client** (`*-faltantes-cliente.docx`): business language. What they must deliver (`dependencias_cliente` with owner and date), decisions and answers needed (`preguntas_abiertas` of audience `cliente`, grouped by stage, with a column for the answer), team data to complete, and the UAT dates rule. It says the agreed scope does not change. It never contains internal doubts, capability checks or the Commercial questions.
- **Internal** (`*-faltantes-interno.docx`, "USO INTERNO"): why pre-kickoff (threshold figures), capabilities to verify and presales doubts (`audiencia: interna`), unconfirmed presales assumptions, **additionals detected (Comercial)**, **changes versus presales**, `alertas_internas`, integration status, Jelou team data, and the **UAT clause marked "borrador: pendiente de revisión por Legal"** plus the 72 h cap note.

## Scope lock in this flow
Normally the client does not ask for extras: **the scope is the presales SOW**. Anything that appears later (Diio 2, emails) and is not in `alcance.base` goes to `ampliaciones_solicitadas[]` with `estado: "por_decidir"`:
- it is NOT in scope: out of scope as "sujeto a evaluación comercial", and the linter errors if its `terminos` appear in flows, stories, rules, solution or effort;
- it produces exactly ONE open question, owner Comercial: "¿Se debe tomar en cuenta este adicional? (requiere aprobación de Comercial y cobro adicional)", visible in the internal faltantes and in the deck's pending slide;
- only `aprobada_comercial` (with `cobro_adicional` and a `cambios` CC-xx row stating the approval) may enter the scope.

Also compare what later meetings say against the presales **assumptions** (for example who does the biometrics, OTP vs facial recognition, retries): list them in `cambios_respecto_preventa` as questions to confirm, never as decisions. Beware follow-up emails that promise an extended scope: record it in `alertas_internas`.

Worked example (anonymized fixture `scripts/test/full-scope-lock-fixture.json`, derived from a credit-origination case): document upload and validation, a dematerialized promissory note, e-signature, installment calculation and a full "credit factory" from the second meeting are five `por_decidir` additions with five Commercial questions; the facial-biometrics-versus-OTP configuration, the retry policy and the test phone line are three changes versus presales with their questions.

## How the template was decompiled (and how to refresh it)
`scripts/dev/extract_kickoff_template.js <example.pptx> <base.pptx>` keeps the theme (colour scheme "Jelou", Poppins), master and layouts (rescaled from 4:3 to 16:9), the five embedded Poppins faces (EOT `.fntdata`) and the media renamed by content (two Jelou logos, 23 line icons: see `assets/kickoff-brand.json` > `iconos`), and drops every slide, the thumbnail, printer settings and document properties. `node scripts/build_kickoff_pptx.js --patrones assets/kickoff-template.pptx` writes the placeholder pattern slides (cover, agenda, divider, team, compare, stages, cards, flow, table, rows, questions, risks, pending, next steps, closing, icon gallery) into the template so it can be opened and inspected. The skill needs nothing outside its folder at runtime.

Fonts: Poppins is embedded in the pptx. If the viewer's PowerPoint ignores embedded fonts, it falls back to Arial/Calibri and text looks narrower; install `assets/fonts/Poppins-*.ttf` for exact fidelity.
