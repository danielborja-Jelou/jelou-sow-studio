# Reading a Pre-Sales solution design document ("Diseño de solución")

Before a SOW exists, Pre-Sales usually hands over a **solution design document** (`Diseño_Cliente_<Cliente>.docx`, often exported to PDF). It is the richest input this skill receives: it already describes the flows step by step, tags each step with the Jelou component that delivers it, lists the integrations and records the assumptions. When it exists, it is the **primary source of scope**; Diio meetings, deal data and notes complement it.

This file explains how that document is laid out, how each part maps to `sow.json` (v2, conversation graph in `agentes[].pasos`), and what it almost never answers (those gaps become `preguntas_abiertas`).

## 1. Typical layout

Pre-Sales documents follow the same template. Section names are in Spanish:

| Section | What it holds | Example shape |
|---|---|---|
| Header | Client, vertical, version, date | `Vertical: Financiero / Pensiones y Cesantías` · `Versión: 1.0` |
| **1. Contexto** | The client's business, today's pain, business type, channel | "Hoy el proceso opera solo en canal web…" · `Canal: WhatsApp` |
| **2. UX Propuesta** | One block per flow, `Flujo_1: <Nombre>` … `Flujo_N`, each with bullet steps written as "El usuario …" and tagged with `→ <componente>` | `El usuario ingresa tipo y número de documento. → Flows` |
| Cruce con workflows estándar | Table: each flow against Jelou's standard workflow stock, service-message count and AI complexity | `Flujo_2 · Verificación de Identidad · 21 mensajes · Sin IA` |
| **3. Integraciones** | One row per service, numbered `WS#1`…`WS#N`, with description and who exposes it | `WS#4 · API de identidad · Expuesta por el cliente` |
| **4. Componentes Jelou** | Which platform pieces are used and for what: IA conversacional, Flows, Integración, HSM y Campañas, PMA, Datum (with the list of collections), Métricas | `Datum: registro de usuarios, de citas, tracking…` |
| **5. Observaciones** | Grouped notes: general scope, integrations, campaigns, identity and security, regulatory compliance, human attention, commercial scope. Items marked **`[Supuesto]`** are unconfirmed | `[Supuesto] El video se entrega como URL pública del cliente.` |
| Footer | The Pre-Sales engineer who wrote it | (goes to the team table only) |

### Step tags (`→ …`) and what they mean

| Tag in the design | Meaning | In `sow.json` |
|---|---|---|
| `Determinístico` | Fixed nodes: messages, conditionals, code | step `componente: "Determinístico"`; the capability is `ejecucion: "determinista"` |
| `Flows` | A WhatsApp Flow (in-chat form) | `componente: "Flows"`, step `tipo: "formulario"` (`herramienta: "flows"`) with its `formulario.campos` (`webview` is an accepted alias); each form is a deliverable |
| `IA conversacional` | An AI agent/task interprets or explains | `componente: "IA conversacional"`; `ejecucion: "conversacional"` |
| `PMA` | Handoff to human agents (Connect / multi-agent panel) | `componente: "PMA"`, step `tipo: "asesor"`; one `escalamiento` entry |
| `API <nombre> (WS#n)` | A call to integration `WS#n`, often combined with another tag (`API … (WS#2) / Flows`) | step `tipo: "api"` + `integracion: "INT-n"` + the tag in `componente` |
| `Webview` | A web page opened from the chat | **Ambiguous on purpose in designs**: decide which one (Jelou Shop, Webview Studio, Jelou Sites, KYC webview, payment checkout) with `references/catalogo-jelou.md` §2 and write it in `solucion`; if the design does not say, it is an open question |
| `Functions` / `Lambda` | Server-side logic: an intermediate layer, a scheduled job, a webhook | New logic is a Jelou Function; an existing AWS Lambda is a client or legacy dependency with an owner (catalog §3) |
| `KYC` / `Biometría` / `Firma` | Identity verification or electronic signature | Native Jelou modules vs the client's own provider behind an API change scope and liability (catalog §4) |

A step with **two tags** (`API … / Determinístico`) is one step that uses both; keep both in `componente` (`"API (WS#7) / Determinístico"`). The Word stage table prints the tag next to the step.

## 2. Mapping to `sow.json`

**Each `Flujo_N` becomes one entry of `agentes[]`** with `id: "F<N>"` and `nombre` exactly `Flujo_N: <Nombre>` (same order as the design). Each bullet becomes one step in its `pasos`, with `etapa` (short label), `diagrama`, the proposed bot text when it is a message, `integracion` for API steps, and `componente` = its `→` tag. All flows of one bot share the same `persona`. The orchestration between flows (menu → `Flujo_N`) goes in `diagrama_general`. The diagram engine draws one diagram per flow, so a long flow never makes the general one unreadable. Every branch needs labeled exits and ends in a `fin` step (the linter checks it).

| Design document | `sow.json` field | Notes |
|---|---|---|
| Header client, vertical, date | `meta.cliente`, `meta.proyecto`, `brief` | The SOW starts at `meta.version: "1.0"` with `meta.estado: "en_revision"` regardless of the design's version |
| 1. Contexto | `brief` (need + solution + why), `objetivos` | The design rarely has measurable objectives: propose them as assumptions and ask |
| Channel / "número nuevo de WhatsApp" | `alcance.incluido_usuario`, `parametros`, `dependencias_cliente` | Who provides the number and Meta verification |
| 2. UX Propuesta, `Flujo_N` | `agentes[]` (one per flow), `pasos[]` | Keep the flow names **exactly**; later documents (diagrams, simulator, proposal) reuse them |
| "El usuario con X recibe A" / "El usuario con Y recibe B" | A `decision` step with labeled exits **and** a business rule `RN-…` with the threshold in `parametros` | A threshold in prose ("salario superior a 4 SMMLV") is a rule: say who supplies the value and how it is updated |
| "en cualquier punto del flujo → PMA" | `escalamiento` with `modo: "ofrecido"` (or `automatico` if the design says so) and an `asesor` step | Hours, queues and priorities are almost always `[Supuesto]` → question |
| Cruce con workflows estándar | `solucion.descripcion` and `solucion.componentes[].detalle` | Name the standard workflow each capability reuses; the message counts are commercial data, not scope |
| 3. Integraciones `WS#n` | `integraciones` with `id: "INT-n"` and the `WS#n` label kept in `nombre` | See the connection rules below; the linter warns if `WS#n` is not `INT-n` |
| 4. Componentes Jelou | `solucion.componentes` | One component per capability, with `cubre`, `reglas` and `ejecucion` |
| Datum collection list | `datos` | Each collection needs fields and retention; the design gives only names |
| HSM y Campañas | `alcance`, `dependencias_cliente` (template texts, Meta approval), `cronograma` | Who segments, who triggers, sending windows |
| 5. Observaciones — exclusions ("queda fuera", "no forman parte del alcance") | `alcance.fuera_de_alcance` with `terminos` | Each exclusion becomes an `OOS-…` item |
| 5. Observaciones — security levels, OTP attempts, masking | `reglas` (deterministic) and `parametros.reintentos` | Identity and signature rules are always `determinista` |
| 5. Observaciones — regulation (data protection law, supervisor) | `reglas` (consent before sensitive data) and `datos[].retencion` | Name the law as written in the design |
| 5. Observaciones — responsibility split (client owns provider contracts, fraud liability) | `alcance.supuestos` and `riesgos` | Do not soften or rephrase liability clauses; copy their meaning faithfully |
| 5. Observaciones — commercial scope (which budget lines are covered) | `alcance.fuera_de_alcance` for the lines not covered | Prices are never invented; leave amounts to the commercial owner |
| Every `[Supuesto]` | `alcance.supuestos` (or the field it affects) **and** a `preguntas_abiertas` entry | A `[Supuesto]` that blocks construction gets `bloquea: true` |
| Pre-Sales engineer | `equipo` only | Personal data never goes in rules or free text |

### Integration connection rules

| What the design says | `conexion` | `quien_hospeda` |
|---|---|---|
| "Expuesta por <cliente>" | `api_cliente` | — |
| "Servicio intermedio de <cliente> sobre <proveedor>" | `middleware_cliente` | the client |
| Jelou builds the intermediate layer | `middleware_jelou` | "Jelou en Jelou Functions" |
| "Jelou expone el API …" (e.g. outbound HSM) | `directa`, with the client as consumer | — |

If the design says the client provides "documentación, credenciales y ambiente de QA" for all APIs, set `documentacion` and `ambiente_pruebas` to `"pendiente"` (not `"si"`) until they are actually delivered, and add a dated `dependencias_cliente` entry. Credentials are never copied into the SOW.

## 3. What the design document almost never answers

These are the usual gaps. Check each one; whatever is missing becomes a `preguntas_abiertas` entry:

- **Failure path per step** (`si_no_cumple`): what happens when an API fails, the OTP expires, the user is not eligible or abandons a Flow halfway.
- **Thresholds and their source**: the exact value of every threshold mentioned in prose, who supplies it and how it is updated (e.g. a minimum wage that changes every year).
- **Per-integration detail**: operations (read/write), returned fields, authentication, availability, network restrictions, technical owner and delivery date.
- **Human attention**: PMA hours, queues, priorities, out-of-hours message, how many agents.
- **Datum**: fields and retention of each collection; who can export what.
- **HSM**: how many templates, their texts, who approves them and the sending windows.
- **Media and content**: who hosts videos, PDFs or infographics referenced in a step, and by when.
- **Objectives**: measurable targets (conversion, abandonment, handling time).
- **Operating parameters**: bot hours, time zone, holidays, language and tone, `identificacion_telefono`.
- **Test data and environments**: QA environment dates, test users and sandbox numbers.
- **Existing channel**: whether the WhatsApp number is new or migrated, and who completes Meta verification.
- **Persona**: agent name, tone and form of address (tú/usted) for the whole bot; the exact texts of each message.
- **Team**: the design lists only the Pre-Sales engineer; ask the team question (see `SKILL.md`).

## 4. Precedence and conflicts

1. **Design document** — scope, flows, integrations, assumptions.
2. **Diio meetings and deal data** — what was promised later, volumes, dates, decisions that resolve a `[Supuesto]`.
3. **Notes, emails and previous SOWs.**

When two sources disagree, do not pick one silently: keep the more recent decision **only if it is explicit**, otherwise write both versions in a `preguntas_abiertas` entry with `bloquea: true`. A Diio decision that resolves a `[Supuesto]` turns it into a rule or a scope item with `fuente: "cliente"`.

## 5. Checklist after mapping a design

- [ ] Every `Flujo_N` exists as an `agentes[]` entry with the same name, in the same order.
- [ ] Every `WS#n` exists as an `INT-n` and is used by at least one step.
- [ ] Every API-tagged step has `tipo: "api"` and an `integracion`.
- [ ] Every threshold in prose is a rule with values and `si_no_cumple`.
- [ ] Every `[Supuesto]` appears as an assumption and as an open question.
- [ ] Every exclusion in Observaciones is an `OOS-…` item with `terminos`.
- [ ] Identity, signature and money steps are `determinista` in `solucion`.
- [ ] Each capability stated in `solucion` was checked against the Jelou documentation (see `how-jelou-bots-work.md` §8).
- [ ] The project fits in 15 business days of critical path, with at most 3 parallel lanes (waits on the client are dated dependencies).
