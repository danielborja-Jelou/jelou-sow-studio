# How Jelou bots work (to write a realistic SOW)

This document exists so the SOW describes the solution with real components and neither promises what the platform does not do nor omits what always appears. It comes from reviewing production bots of several clients (commerce, restaurants, real estate). If you doubt a limit or capability, verify it in the Jelou documentation or, for an existing bot, with the CLI in read-only mode (`jelou context`, `jelou graph`). Do not modify anything.

## 1. Anatomy of a project

| Piece | What it is | What it implies for the SOW |
|---|---|---|
| **Channel** | WhatsApp number (production) and a sandbox number for tests | Who provides the number, Meta verification and when it is tested in sandbox |
| **Workflows** | Conversation flows. Almost always: *Start* (default), an *AI router* that decides the destination, one workflow per domain (sales, payments, FAQ, after-sales), *Agent* and utilities | The SOW's conversation map must correspond to these workflows |
| **Nodes** | Messages, conditionals, code, HTTP calls, tools, subflows, AI tasks, human handoff (CONNECT), HSM templates, pauses, memory | Critical rules must live in deterministic nodes (see section 3) |
| **Tools** | Reusable actions, own (query stock, validate customer) or from the marketplace (email OTP, reminders, payments) | Each SOW integration is usually one or several tools |
| **Functions** | Serverless code with cron. Used as an intermediate layer with the client's system or to synchronize a catalog | Decides who builds and hosts that layer and how often it runs |
| **Datum** | Jelou's database with collections (users, sessions, orders, events) and Excel/CSV export | It is the default "report"; what is not in Datum cannot be reported |
| **Jelou Shop** | Catalog, cart and purchase webview | "Catalog by webview" almost always means Shop; define SKU loading and who maintains it |
| **WhatsApp Flows** | In-chat forms, sometimes with a validation function | Each form is a deliverable with defined fields |
| **HSM templates** | Messages initiated by the bot, approved by Meta | Need approved texts and approval time in the schedule |
| **Knowledge base** | Documents the bot consults to answer FAQs | The client must deliver the documents; define whether it answers only from them |
| **Agent panel (PMA / Connect)** | Handoff to agent teams with hours | Each team, its hours and the out-of-hours message belong in the SOW |
| **Secrets** | Credentials stored securely | The SOW never carries credentials; it only names which ones are needed |

## 2. Frequent capabilities and how they are delivered

| Capability the client asks for | How it is delivered in Jelou | What the SOW must say |
|---|---|---|
| Browse the catalog and buy | Jelou Shop + webview + stock tool | Catalog source, number of SKUs, sync frequency, who loads images |
| Validate customer, credit limit or balance | HTTP tool to the client's system | Exact operation, returned fields, what happens on failure |
| Verify identity | Email OTP (marketplace tool) or ID validation | Attempts, validity, what happens on failure, whether several emails exist |
| Create an order in an ERP | HTTP tool or function + intermediate layer | Connection mode, who hosts, input and output data, error handling |
| Payments | Marketplace payments app or the client's gateway | Provider, methods, retries, environment; if there is no charge in the chat, say so in plain words |
| Frequently asked questions | Knowledge base | Documents, language, what is escalated to a human |
| Talk to an agent | CONNECT to a team with hours | Teams, hours, escalation criteria |
| Campaigns and reminders | HSM templates + reminders tool | Texts, Meta approval, sending windows |
| Forms and registration | WhatsApp Flows or guided conversation | Fields, validations, where they are stored |
| Reports | Datum + export; platform metrics | Which columns, what frequency; do not promise custom dashboards |

## 3. Deterministic vs conversational (a decision almost never in the SOW)

A bot combines deterministic nodes (always do the same thing) and AI tasks (interpret language and can vary). In real bots, important rules ended up written in the AI prompt, so they are not guaranteed: for example the OTP or the escalation to an agent.

Rule for the SOW: every rule that moves money, validates identity or decides an approval must be declared **deterministic**. Wording, tone, product search or understanding the intent may be **conversational**. Each solution component carries this attribute and the linter warns if a critical rule is left as conversational.

## 4. Elements that almost always appear (decide to accept or exclude them)

1. **Resolution of the user's phone.** If the WhatsApp number does not arrive resolved, the bot asks to share the contact (phone guard). Applies to any bot that uses the phone as identity.
2. **Acceptance of terms and data policy**, stored with a date.
3. **Out-of-hours message** and handoff behavior per team.
4. **Log or audit** of events and failures in Datum.
5. **Confirmation emails** (to the customer and the salesperson).
6. **Reminders** (abandoned cart, pending payment).
7. **Sandbox vs production mode** and test data.

If the client did not ask for them, the SOW must say whether they are included or left out. Otherwise they show up in the bot without anyone having agreed to them.

## 5. Known constraints and traps

- **Meta pricing from 1 October 2026:** every non-template message is charged (service messages and in-window utility templates included; the unit is each bubble). Design to send fewer, fuller messages; prefer a WhatsApp Flow over one question per turn. Details in `catalogo-jelou.md` §8.
- **Which tool, exactly:** for webviews, server logic, identity, payments and data, pick one concrete Jelou tool with `catalogo-jelou.md`; a bare "webview" or "Lambda" is a gap.
- **HSM templates** require Meta approval: include that time in the schedule and treat the texts as a dependency.
- **The catalog and checkout webview** is provided by Jelou Shop; a custom one is not designed unless it is in scope and budget.
- **Client internal systems** (ERP, databases) usually require an IP whitelist, VPN or an integration user; it is a client dependency with a date.
- **Batch updates** (cron) and real-time queries coexist: the SOW must say which one is used for each decision.
- **The bot sees no more than the system hands it.** If a rule needs a datum (credit limit, block), it must exist in some documented read operation.
- **Personal data**: ID number, email and phone that are stored need a purpose and retention.
- **Secrets, not literals.** Credentials are never written in nodes or in the SOW; the SOW lists the required secrets by name.
- **Environments.** If the variable that selects the environment is missing, it must not fall back to production by default.
- **Test data.** QA shortcuts (fixed phone numbers or ID numbers that skip validations) do not go to production.

## 6. Indicative effort

Hours and calendar come from `effort-model.md` (AI-assisted rates; **a project lasts at most 15 business days end to end, with the construction split into at most 3 parallel lanes**). Older Jelou templates used longer milestones (planning ≈ 11 days, construction ≈ 12, testing ≈ 8, go-live ≈ 8); do not copy them: they predate the AI-assisted model. Add time when there are undocumented integrations, HSM templates to approve or accesses the client has not delivered yet, and model those waits as dated client dependencies, not as build hours.

## 7. How to check technical context without touching anything

- **Jelou documentation (Jelou AI Docs MCP):** this is the source of truth for what Jelou offers. Use it before stating any capability, limit or constraint in the SOW — see §8 for how and where to look.
- **Existing bot (upgrade or improvement):** `jelou context` and `jelou graph` in a folder of your own, read-only. Describe what exists and what changes, without copying credentials, phone numbers or emails. Differences between the SOW and the bot go in `desviaciones` (optional comparison mode in `SKILL.md`).
- **Never** run `push` or `publish`, or modify the platform, from this skill.

## 8. Jelou documentation through the Jelou AI Docs MCP

The tables above are a summary written from real bots; the platform changes faster than this file. The **Jelou AI Docs MCP server** (public docs at `https://docs.jelou.ai`) gives the current, official answer. Use it in three moments:

1. **While building `solucion`**: for every capability, confirm the component exists and does what the SOW will promise.
2. **While writing rules and parameters**: confirm limits (template sizes, OTP validity, attempts, Function limits, supported providers).
3. **While answering a `[Supuesto]` from the design document**: if the doubt is about the platform (not the client), the docs usually close it.

### How to query it

| Tool | When |
|---|---|
| `search_jelou_ai_docs` (`query`, `language: "es"`) | Conceptual search: "plantillas de autenticación OTP", "límites de Functions", "horarios del panel multiagente". Returns titles, snippets and links |
| `query_docs_filesystem_jelou_ai_docs` | Read a full page (`head -200 /guides/nodos/whatsapp-flows.mdx`), list a section (`ls /guides/integraciones/identidad`) or grep exact words (`rg -il "SOAP" /`). A search result at `/x/y` is read as `/x/y.mdx` |

Paths are site-specific: discover them with `tree / -L 2` or the search tool, never guess.

### Where each SOW topic lives (Spanish docs)

| SOW topic | Docs path |
|---|---|
| Nodes a flow can use (messages, buttons, API, SOAP, code, conditional, pause, webview, payments, contact request) | `/guides/nodos/` |
| WhatsApp Flows (forms) | `/guides/nodos/whatsapp-flows.mdx` |
| AI agents, prompting, native tools, AI security, tokens | `/guides/agentes-ia/` |
| AI Routing between workflows | `/guides/getting-started/ai-routing.mdx` |
| Asking for the user's phone (phone guard) | `/guides/getting-started/solicitar-telefono.mdx`, `/guides/nodos/solicitud-contacto.mdx` |
| Identity / KYC / biometrics, government validation, human-in-the-loop | `/guides/integraciones/identidad/` |
| Electronic signature | `/guides/integraciones/firma/firma.mdx` |
| Payments: providers, costs, test mode | `/guides/integraciones/pagos/` |
| E-commerce: Jelou Shop, webview, Shopify, VTEX, WooCommerce | `/guides/integraciones/e-commerce/` |
| Datum: collections, imports, triggers, API keys | `/guides/datum/` |
| Functions: limits, cron, secrets, webhooks, API proxy | `/guides/functions/` |
| HSM templates: categories, formats, sizes, Meta approval, campaigns | `/connect/campanas/` |
| Human agents (PMA / Connect): teams, scheduled hours, automatic messages, transfers, CRM | `/connect/configuraciones/`, `/connect/panel-multi-agente/` |
| Channels other than WhatsApp | `/guides/activacion-canales/` |
| Public APIs (send messages, campaigns, Datum, users, metrics) | `/api/`, `/api-reference/` |
| Billing and prices | `/guides/billing/` |

### Rules

- **Docs over memory.** If the docs contradict this file, the docs win; tell the user so this reference gets updated.
- **Not documented ≠ not possible, but it is not promised either.** If a capability the design relies on is not in the docs, write it as a `preguntas_abiertas` entry for the Jelou technical owner (not the client) and do not state it as a fact in `solucion`.
- **Cite what you checked.** In `solucion.componentes[].detalle`, a short "(ver docs.jelou.ai/<ruta>)" next to a non-obvious limit helps the implementation team.
- **Prices come from the commercial owner**, never from `/guides/billing/`: the SOW does not quote amounts on its own.
- **Webview Studio is not in these docs.** Its own MCP (Webview Studio MCP) is the source of truth for it: see `catalogo-jelou.md` §2.1.
- **If the MCP is not connected**, fall back to `https://docs.jelou.ai` with a web fetch; if neither works, mark the capability as "por verificar en documentación" and tell the user.
