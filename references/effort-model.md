# Effort model with AI

Machine-readable rates: `scripts/lib/effort-rates.json` (this file explains them). The SOW carries them in `esfuerzo` (format in `references/sow-json-format.md`, section "Effort with AI"); each `items[].tipo` must be a key below.

## What these numbers are

**They are ESTIMATES for AI-assisted work, not measured data.** No source has real hour telemetry. Assumption: Claude Code with the Jelou CLI and skills produces the draft (workflows, tools, functions, templates, front); an experienced human reviews, tests and decides; the client answers in reasonable time. Hours are Jelou team work hours, not calendar time. Rates exclude external waits (Meta, client, gateways), project management (added as `gestion_pct`) and the client's UAT.

**Calibration:** after 3-5 real projects, replace these ranges with logged hours. Until then, tell the reader in the SOW that effort is an estimate.

## Rates (hours per unit, min-max)

| `tipo` | Hours | One-line justification |
|---|---|---|
| `workflow_simple` | 2-4 | Menu, FAQ or 3-5 data capture; CLI generation is near instant, time goes to copy and branch tests. |
| `workflow_medio` | 6-12 | Several steps, 1-2 HTTP integrations, conditionals; each integration adds API reading, error handling and real-data tests. |
| `workflow_complejo` | 16-32 | Self-service or AI Agent with tools and escalation; draft is fast, cost is iterating the prompt on real conversations and edge cases. |
| `function` | 3-8 | API adapter, AI scaffolds and tests locally; time goes to credentials, real formats and client-system failures (cron/deferred: +2-4 h). |
| `formulario` | 3-10 | Form in WhatsApp while Flow vs WebView is undecided: the range covers both; change to `flow_whatsapp` or `webview_*` once decided. |
| `webview_simple` | 4-10 | 1-3 screen form; AI builds the whole front, human adjusts brand and tests on mobile. |
| `webview_backend` | 6-16 | Multi-screen with backend; adjusted down because many reusable webview examples exist. |
| `flow_whatsapp` | 3-8 | Flow JSON and validation are quick; phone tests and possible Meta resubmission (endpoint: add a function). |
| `plantilla_hsm` | 0.5-1.5 | Drafting and `template validate` are automatable; Meta's wait does not count; allow for MARKETING rejections. |
| `kyc` | 3-8 | Adjusted down: marketplace tool and `kyc onboard` exist; remaining work is tuning rules with real documents and compliance review. |
| `pagos` | 3-8 | Adjusted down: marketplace tool exists; remaining work is status wiring, provider certification and real-credential tests. |
| `integracion_api` | 4-10 | Per endpoint or endpoint group; depends on the client's docs, authentication and test environment (catalog: Lambda/API Gateway integration 4-10 h plus client dependency). |
| `datum` | 2-4 | Base plus 3-5 collections: schema design and CLI creation; large imports add cleaning. |
| `base_conocimiento` | 3-8 | Per document set: AI-assisted cleaning/chunking, human curation. |
| `campana` | 2-4 | Config, CSV and test; real send needs human approval. |
| `handoff_asesor` | 2-6 | CONNECT node is simple; teams, hours and rules are manual in the dashboard. |
| `agente_faq` | 4-10 | Reasoned: FAQ AI Agent (prompt, guardrails, fallback, test cases); knowledge base counted separately. |
| `canal_whatsapp_activacion` | 1-3 | Short work; Meta verification and Business Manager access dominate the calendar and are dated dependencies. |
| `capacitacion` | 2-4 | Reasoned: one operator/admin session plus AI-generated guide and map (jelou-graph). |
| `pruebas_qa` | 3-8 | Per agent (several workflows): `jelou-test-workflows` runs draft cases; human reviews and does a real-WhatsApp pass (catalog: 1-3 h per workflow). |

`gestion_pct`: 15-25 % over the item total (coordination, status, client communication). Use 20 by default.

## How to choose within the range

- Go to the high end (or above) when: no client test environment, undocumented API, several channels or languages, regulated sector (banking, insurance, health).
- Go to the low end when a similar project exists that Claude can reuse as a reference.
- `cantidad` multiplies the range; put the reason in `nota`.
- Per-project totals: `horas_min` = sum(min x cantidad); `horas_max` = sum(max x cantidad).

## Calendar rules (set by the user, apply as written)

1. **A project cannot last more than 20 business days end to end.** The linter errors above 20 unless `meta.excepcion_plazo` justifies it (then it is a warning).
2. **Dates are dominated by client dependencies** (accesses, final texts, UAT, Meta approvals) more than by build hours. Those waits must appear in `dependencias_cliente` as dependencies with a date; do not inflate hours to cover them.
3. **Formula:**

```
días_construcción = ceil( horas_max_total × (1 + gestión_pct/100) / (personas × horas_dia) )
```

`horas_max_total` is the sum of maxima of all `esfuerzo.items` (including `pruebas_qa`). `gestion_pct` is the percentage as written in `esfuerzo` (20 = 20 %). `horas_dia` = productive hours per person per day (6 by default).

4. **Indicative split of the 20 days** (a guide, adjust to the case): planning and SOW 3, construction (and internal tests; the formula result covers both) 9-11, client UAT 4, production and closure 2. Internal tests take about 2 of the construction days; the remainder is slack. The sum of the milestones' `dias_habiles` is what the linter checks.

| Block | Days (guide) |
|---|---|
| Planning and SOW | 3 |
| Construction + internal tests (formula) | up to 11 |
| Client UAT | 4 |
| Production and closure | 2 |

## Example 1: one simple agent (FAQ with handoff)

`esfuerzo`: personas 1, horas_dia 6, gestion_pct 20.

| Item (`tipo` x cantidad) | Min | Max |
|---|---|---|
| Workflow de bienvenida y menú (`workflow_simple` x1) | 2 | 4 |
| Agente FAQ (`agente_faq` x1) | 4 | 10 |
| Documentos fuente (`base_conocimiento` x1) | 3 | 8 |
| Escalamiento a asesor (`handoff_asesor` x1) | 2 | 6 |
| Activación del número (`canal_whatsapp_activacion` x1) | 1 | 3 |
| Pruebas (`pruebas_qa` x1) | 3 | 8 |
| Capacitación (`capacitacion` x1) | 2 | 4 |
| **Total** | **17** | **43** |

```jsonc
"esfuerzo": { "personas": 1, "horas_dia": 6, "gestion_pct": 20,
  "items": [
    { "entregable": "Workflow de bienvenida y menú", "tipo": "workflow_simple", "cantidad": 1, "nota": "Menú de 4 opciones" },
    { "entregable": "Agente FAQ", "tipo": "agente_faq", "cantidad": 1, "nota": "Solo responde desde documentos" },
    { "entregable": "Base de conocimiento", "tipo": "base_conocimiento", "cantidad": 1, "nota": "Un conjunto de PDF entregado por el cliente" },
    { "entregable": "Escalamiento a asesor", "tipo": "handoff_asesor", "cantidad": 1, "nota": "Un equipo, horario de oficina" },
    { "entregable": "Activación de WhatsApp", "tipo": "canal_whatsapp_activacion", "cantidad": 1, "nota": "Business Manager del cliente" },
    { "entregable": "Pruebas internas", "tipo": "pruebas_qa", "cantidad": 1, "nota": "" },
    { "entregable": "Capacitación a asesores", "tipo": "capacitacion", "cantidad": 1, "nota": "Una sesión" } ] }
```

Calculation: 43 x 1.20 = 51.6 h; 51.6 / (1 x 6) = 8.6 -> **9 construction days**.
Calendar: planning 3 + construction/internal tests 9 + UAT 4 + production 2 = **18 business days** (2 spare). Fits.

## Example 2: two agents with WebViews and an API integration

`esfuerzo`: personas 2, horas_dia 6, gestion_pct 20.

| Item (`tipo` x cantidad) | Min | Max |
|---|---|---|
| Workflows de los 2 agentes (`workflow_medio` x2) | 12 | 24 |
| WebViews de agendamiento y pago de datos (`webview_backend` x2) | 12 | 32 |
| API del cliente: consulta y creación (`integracion_api` x1) | 4 | 10 |
| Datum: citas y usuarios (`datum` x1) | 2 | 4 |
| Plantillas de recordatorio (`plantilla_hsm` x3) | 1.5 | 4.5 |
| Escalamiento a asesor (`handoff_asesor` x1) | 2 | 6 |
| Activación del número (`canal_whatsapp_activacion` x1) | 1 | 3 |
| Pruebas (`pruebas_qa` x2) | 6 | 16 |
| Capacitación (`capacitacion` x1) | 2 | 4 |
| **Total** | **42.5** | **103.5** |

```jsonc
"esfuerzo": { "personas": 2, "horas_dia": 6, "gestion_pct": 20,
  "items": [
    { "entregable": "Workflows agentes R1 y R2", "tipo": "workflow_medio", "cantidad": 2, "nota": "Una integración cada uno" },
    { "entregable": "WebViews de agendamiento", "tipo": "webview_backend", "cantidad": 2, "nota": "Base reutilizada" },
    { "entregable": "Integración API de agenda", "tipo": "integracion_api", "cantidad": 1, "nota": "Un grupo de 2 endpoints" },
    { "entregable": "Datum", "tipo": "datum", "cantidad": 1, "nota": "3 colecciones" },
    { "entregable": "Plantillas de recordatorio", "tipo": "plantilla_hsm", "cantidad": 3, "nota": "UTILITY" },
    { "entregable": "Escalamiento a asesor", "tipo": "handoff_asesor", "cantidad": 1, "nota": "" },
    { "entregable": "Activación de WhatsApp", "tipo": "canal_whatsapp_activacion", "cantidad": 1, "nota": "" },
    { "entregable": "Pruebas internas", "tipo": "pruebas_qa", "cantidad": 2, "nota": "Uno por agente" },
    { "entregable": "Capacitación", "tipo": "capacitacion", "cantidad": 1, "nota": "" } ] }
```

Calculation: 103.5 x 1.20 = 124.2 h; 124.2 / (2 x 6) = 10.35 -> **11 construction days**.
Calendar: planning 3 + construction/internal tests 11 + UAT 4 + production 2 = **20 business days**. Fits with zero slack: any late access, text or Meta approval breaks it, so every such dependency needs a date in `dependencias_cliente` and the SOW must say that a delay by the client moves the end date.

## Example 3: does NOT fit in 20 days

Scope: 3 complex agents, 3 `webview_backend`, `kyc`, `pagos`, 3 `integracion_api`, 2 `flow_whatsapp`, `datum`, 6 `plantilla_hsm`, `handoff_asesor`, `canal_whatsapp_activacion`, `base_conocimiento`, 3 `pruebas_qa`, `capacitacion`.
Totals: min 112 h, max 264 h. With 3 people: 264 x 1.20 = 316.8; 316.8 / 18 = 17.6 -> 18 days. 3 + 18 + 4 + 2 = **27 business days > 20**. Even with 4 people: 316.8 / 24 = 13.2 -> 14 days; 3 + 14 + 4 + 2 = 23 > 20 (and more people add coordination cost).

What to do (pick one, never silently):
1. **Split into phases** (preferred): Phase 1 = priority agent + channel + handoff + QA + UAT inside 20 days; Phase 2 = remaining agents, KYC and payments as their own SOW or version, each also <= 20 days. Record the split in `alcance.fases` and `meta.prioridad`.
2. **Justify** the overrun in `meta.excepcion_plazo` (reason, who approved, which dependency forces it). The linter then downgrades the error to a warning.
Never hide the overrun by lowering hours or shortening UAT.

The Word shows the Spanish `etiqueta` of every type (field `etiqueta` in `scripts/lib/effort-rates.json`), never the raw key. When the schedule has no slack (20 days) and client dependencies have no date, the effort section states how many of the days depend on them.
