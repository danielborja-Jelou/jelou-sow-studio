# Catalog of Jelou capabilities for scoping

What every Jelou tool is, when it is the right choice, what the SOW must write down for it, what to ask the client, where to verify it, and which skill builds it afterwards. Use it while writing `solucion`, `integraciones`, `reglas`, `parametros` and `preguntas_abiertas`.

**Sources and freshness.** Facts here come from the Jelou implementation skills, the Webview Studio MCP, the Jelou CLI help and the Jelou documentation as of 2026-10 (CLI 4.10.1, read-only research). Limits change: before stating a limit in a client document, confirm it in the Jelou AI Docs MCP (paths in `how-jelou-bots-work.md` §8) — or, for Webview Studio, in its own MCP (§2.1). If the docs and this file disagree, the docs win — say so to the user so this file gets updated.

**Source tags (used in §10).** [DOC] documented in docs.jelou.ai; [SKILL] documented in a Jelou skill; [CLI] seen in `--help`; [MCP] observed through an MCP; [NO VERIFICADO] no evidence found, inference, or must be confirmed with Jelou. Never turn a [NO VERIFICADO] item into a firm SOW commitment: make it an open question with an owner.

**The scoping rule.** A SOW component names **one concrete tool**, not a category. "Webview", "Lambda", "integración" or "IA" alone hide who builds it, who hosts it, what it costs and what can fail. The linter warns on a bare "webview" or "lambda".

Effort hours and calendar rules are **not** here: see `effort-model.md`. Platform anatomy is in `how-jelou-bots-work.md`.

---

## 0. Need -> tool, and the decision tree

| Client need | Jelou tool |
|---|---|
| Guided or AI conversation on WhatsApp/Web/IG/FB | Brain (workflows + nodes), AI Agent, AI Task (§1) |
| Own business logic or client-system integration | HTTP/SOAP/CODE nodes, Tools, Jelou Functions (§1, §3) |
| Form or rich screen inside the chat | WhatsApp Flow, Webview Studio or Jelou Sites (§2, tree below) |
| Store bot data | Databases v2 / Datum, Databases Legacy (§5) |
| Catalog and orders | Jelou Shop (or Shopify, VTEX, WooCommerce sync) (§2) |
| Charge in chat | Payments (MCP node from a marketplace gateway) (§4) |
| Verify identity | KYC / biometrics (§4) |
| Bulk outbound messages | HSM templates + campaigns (§6) |
| Escalate to a human | Connect / PMA (CONNECT node), HubSpot, Genesys (§7) |
| Voice calls | Voice (§6) |
| Measure | Metrics, logs (§8) |
| The client's AWS Lambdas / systems | Consumed over HTTP (§3, §10.3) |

**Decision tree: conversation, WhatsApp Flow, Webview Studio or Sites** (authoring guidance, not a platform limit):

1. Only a few short questions (about 5 or fewer simple fields, no layout)? -> **Conversation** (INPUT nodes, buttons, lists).
2. A native in-chat form (multi-field, dropdowns, date pickers), WhatsApp Cloud / Gupshup CAPI / Aldeamo, Meta-verified business, no custom branding? -> **WhatsApp Flow**.
3. Needs branding, custom UI, own backend logic, payments/checkout, scheduling, dashboards, or a channel without Flows? -> **Webview Studio** (light `server.js` backend on Cloudflare Workers).
4. Front already built or built with any framework, static `dist`, and the page must know who the chat user is (webview session)? -> **Jelou Sites** (server logic goes in Functions; Sites has no SDK, secrets, cron or tools).
5. Webview Studio vs Sites for a new project: Jelou's official preference is [NO VERIFICADO]. Pick one in the SOW, justify it and confirm with Jelou.

What the SOW must specify per option:
- **Conversation:** fields, validations, what happens on invalid input (`si_no_cumple`), where data is stored.
- **WhatsApp Flow:** screens, fields, validations, whether it has a data endpoint (who builds it, where it lives, e.g. a Function), device tests, plan for changes after publishing (a published Flow is immutable).
- **Webview Studio:** screens, validations, integrations, branding, category and URL, environments, registry PR, who operates it, no secrets in the HTML.
- **Sites:** screens, framework, data in/out, domain, CSP/embedding, accessibility, browsers, session data used (`data`/`state`), which Function holds server logic.

---

## 1. Brain Studio: workflows, AI and tools

| Capability | What it is / when | What the SOW must write | Builds it |
|---|---|---|---|
| **Workflows and nodes** | The conversation, editable by the client in Studio. Native nodes are the default; logic moved to a Function is invisible in Studio. | Flows `Flujo_1..N`, entry point, menu or AI routing | `jelou-build-workflows` |
| **AI Agent / AI Task** | Agent = autonomous conversation (instructions, model, tools, MCPs, knowledge); Task = one-shot with structured output (extract, classify). Variable by nature. | Which steps are conversational; cases handled, what it must NOT do, knowledge sources, tools, escalation, fallback. Rules that move money, validate identity, sign or approve are **never** left to the AI | `jelou-build-workflows` |
| **AI Routing** | Routes the first message to the right workflow without menus; percentage rollout and allow-lists (VIP) available. | Whether there is a menu or AI routing, the default workflow for ambiguous messages | `jelou-build-workflows` |
| **Knowledge base (RAG)** | Files the AI answers from: PDF, TXT, CSV, JSON, XLSX, MD, **max 2 MB each**; public URLs up to 5 MB. | Who delivers and maintains the documents, language, "answers only from them", what is escalated | `jelou-project` |
| **Tools** (reusable subgraphs) | Shared logic called by several workflows. Scoped to the **app**, so editing one affects every sibling project; versions are pinned per caller. Cannot contain user interaction (INPUT, AI_TASK, messages, HSM, CONNECT). | Only when reuse across workflows is real; versioning owner; inputs/outputs | `jelou-build-workflows` |
| **Marketplace apps** | Payments, KYC, OTP, Shopify, reminders… Each install is an OAuth grant done by a human in a browser. A deterministic payment/KYC step is an MCP node with success / pending / failed branches. | Which app, whose account authorizes it (Jelou test account first, then the client's), the three outcome paths | `jelou-project` (install), `jelou-build-workflows` (wiring) |
| **Workflows as MCP** | Exposes enabled workflows as an MCP server for external agents. Activated per organization (ask Jelou). | Only if the client's own agents will consume the bot: which MCP client, authentication, scope | `jelou-build-workflows` |

**Publishing model (affects go-live and the schedule).** Edits go to a **draft**; channels keep serving the last published commit until a publish. A publish moves in-flight conversations to the new commit, and production can be rolled back to an earlier commit. A channel can run a branch, and testers can run `dev` on the production number. The first turn after a publish is slower (cold cache): never publish right before a demo. Write in the SOW who publishes and in which window.

## 2. Pages opened from the chat: choose ONE

The most frequent ambiguity in designs. Each option changes builder, effort, security and what the client provides.

| Option | What it is | Use it when | Limits and traps | Builds it |
|---|---|---|---|---|
| **WhatsApp Flows** | Meta-hosted native forms inside WhatsApp | 3+ sequential questions with validation (data capture, consent, OTP entry, date/slot picking, portfolio choice). Saves messages vs one question per turn. | **WhatsApp only** (no web, IG, FB); providers whatsapp_cloud, gupshup_capi, aldeamo. A published Flow is immutable (clone → edit → publish → repoint). Screens fixed at publish. Company-scoped: does not survive a project clone. | `jelou-whatsapp` (asset), `jelou-build-workflows` (node) |
| **Jelou Shop webview** | Catalog, cart and checkout of the company's store | Selling from a catalog | One store per company; plan limits on products/branches; external catalogs (Shopify, WooCommerce, VTEX, Facebook) sync **one way**; variations and modifiers only in Shop Admin | `jelou-shop` |
| **Jelou Sites** | A static site (`dist`) the platform hosts, with a **webview session**: the page knows who opened it and returns data to the workflow | A custom UI with no server code: rich forms, simulators, calendars, document viewers | Static only (server logic → a Function). Max 1000 files, 5 MB each, 25 MB total. Session link TTL 30 s–24 h (default 300 s), `data`/`state` 16 KB each. Deploy is live immediately (draft preview available). **What the user submits never reaches the AI** — the bot cannot discuss it. No logs. | `jelou-sites` |
| **Webview Studio** | Jelou's internal studio for custom webviews, deployed on Cloudflare Workers (or Fly.io). **Source of truth: the Webview Studio MCP** (not in the public docs) — see §2.1 | A custom page that needs **server-side code, environment variables or secrets**, or one of its categories: webview, landing, report, service, chatbot, payment, onboarding, login | See §2.1 | Webview Studio MCP |
| **KYC webview** | The biometrics capture of the Jelou KYC app | Identity verification with document + face | See §4 | `jelou-kyc` + `jelou-build-workflows` |
| **Payment provider checkout** | The gateway's own checkout in a webview | In-chat payments | See §4 | marketplace app |

### 2.1 Webview Studio, through its MCP

Webview Studio is not in the public Jelou documentation: **its MCP is the source of truth** for what it does, its conventions and its limits, the same way the Jelou AI Docs MCP is for the rest of the platform. If the MCP is not connected in the session, say so and mark Webview Studio items "por verificar con el equipo de Webview Studio".

**What it offers (from the MCP):**
- **Project = one webview** with hierarchy client → project → webview. URL: `https://<client_slug>.<categoria>.jelou.app/<project_slug>` (e.g. `<cliente>.wb.jelou.app/pago`); `client_slug` is the technical id that makes the URL work in production.
- **Categories:** `wb` webview, `lp` landing page, `rp` report, `sv` service, `ct` chatbot, `pg` payment, `ob` onboarding, `lg` login.
- **Templates:** blank, form, portal, landing, login. **An existing project can be duplicated** as the base for a new client (less effort than starting blank).
- **Environments:** staging and production. Encrypted environment variables per environment, marked secret when needed (only names are ever listed, never values).
- **Release path:** draft → preview → push to GitHub (PR in the `webviews-registry` repo, **required before production**) → deploy. Deployment history, deploy logs, code snapshots and restore, audit log.
- **Capacity:** Cloudflare Worker slots per account are finite (`get_cf_usage` shows used vs limit and orphan workers).

**Mandatory conventions (every Webview Studio page):** mobile-first (designed for 375 px, touch targets ≥ 44 px, text ≥ 14 px), Jelou identity (favicon and watermark, title "<Nombre> | Jelou"), everything rendered with the client's data kept confidential.

**Consult it while scoping (read-only):**
| Question | MCP tool |
|---|---|
| Does the client already have webviews we can reuse or extend? | `list_projects`, `get_project` |
| What is live and since when? | `list_deployments` |
| Which secrets/variables does an existing webview depend on (names only)? | `list_env_vars` |
| Is there Worker capacity for new webviews? | `get_cf_usage` |
| What does it look like today? | `preview_project` |

Never create, duplicate, deploy or change variables from this skill: that is implementation.

**What the SOW must write for a Webview Studio page:** category and template (or which existing project is duplicated), `client_slug` and the resulting URL, who designs the UI and provides branding assets, the data it collects and where it sends it (workflow callback, client API, Function), the server-side calls and the **secrets by name** it needs per environment, staging and production dates, who approves the PR to production, and the workflow branches for `exit` / `error` / `expire`.

**Questions for the client:** brand assets and copy, fields and validations, domains or URLs they must allow, which APIs the page calls and their test environment, accessibility or legal text (consent, terms), who signs off the design.

**Common to every webview opened from a workflow:** the node pauses the flow until a callback or expiry, with `exit`, `error` and `expire` branches (no default) — the SOW must say what happens on each. Callback authentication is required for payments, KYC and orders. Use a CTA button, not a URL in the text (a link preview can consume the link). WhatsApp providers that deliver webview/CTA URL: whatsapp_cloud, gupshup_capi, gupshup, aldeamo. Also ask: expiry time, what happens if the user closes it.

## 3. Server-side logic: HTTP node, Jelou Functions or existing Lambdas

| Option | Use it when | Limits | Builds it |
|---|---|---|---|
| **HTTP / SOAP node** (default) | The client exposes an API and one call per step is enough | Default timeout 30 s, configurable retries; credentials only as `{{$secret.NAME}}` | `jelou-build-workflows` |
| **Jelou Functions** | At least one is true: generating or sending a **PDF/document** (mandatory: the project's single `document-pdf` Function); unbounded iteration; logic shared by 2+ workflows; native would need >3 conditional branches or >5 extra nodes; no transport (custom signing, multi-call orchestration); **time-shifted work** (reminders, cart recovery, NPS); a webhook receiver; a catalog sync. "Fewer lines" is not a reason. | Serverless TypeScript (Deno). Timeout 30 s default, **120 s max**. 1 MB per deployment, 256 KB per file. **10 cron schedules per function**, IANA timezone. Deferred executions: ~1000 active per company, up to 30 days ahead, 64 KB payload. Request body from a workflow 64 KB. Deploy goes **straight to production** (rollback is a live swap). The plan must include Functions access. Docs mark Functions as **preview**: cite it in the SOW as a condition and contact Jelou support before critical production flows. | `jelou-functions` |
| **Existing AWS Lambdas** | Legacy company backends already running (e.g. in the `JelouLatam/lambda-functions` repo, or shared utility Lambdas) | Not managed by the Jelou CLI and not platform Functions. **A shared Lambda serves several clients**: changing it for one project can break others. | Owner of that Lambda (not this project by default) |

**Rules for the SOW:**
- New logic goes to **Jelou Functions**. Reusing an existing Lambda is a dependency with an owner, a documented contract (auth, request, response, errors) and a decision on whether it stays shared or is copied into a project-owned Function.
- Every intermediate layer says **who builds it, who hosts it and who maintains it** (`conexion` + `quien_hospeda`).
- Scheduled or deferred work: frequency, timezone and the guard at fire time (opt-out, already converted).
- Sending messages from a Function obeys the 24-hour window and needs templates outside it.

## 4. Identity, signature and payments

| Capability | What the SOW must decide | Limits and traps | Builds it |
|---|---|---|---|
| **KYC / biometrics** (Jelou KYC app) | Plan (business / enterprise / self-service), vertical, country; document-check level (medium/advanced); face-match threshold; government validation; **enterprise only**: human-in-the-loop and recapture/manipulation checks; capture channel (webview, Flows, photo/video) | Needs the app installed and a productive configuration. Custom branding not supported yet. **Demo mode** gives mock verdicts for up to 50 test numbers, but downstream webhooks still fire: disable money/account actions or use a non-production company for UAT. | `jelou-kyc`, `jelou-build-workflows` |
| **Client's own identity provider** (e.g. OTP by SMS through the client's service) | It is an integration, not KYC: the client owns the provider contract and fraud liability; Jelou is the channel | Write the liability split literally | `jelou-build-workflows` |
| **Electronic signature** | Native Jelou signature vs the client's provider behind an API; who keeps the signed document | Verify in `/guides/integraciones/firma/` | `jelou-build-workflows` |
| **OTP templates on WhatsApp** | AUTHENTICATION category, validity 1–90 min | Requires a verified Meta portfolio. **A BSUID recipient is silently skipped**: OTP needs a real phone (§6) | `jelou-whatsapp` |
| **Payments** | Provider (Mercado Pago, Stripe, Kushki, PayPhone, Wompi, PlaceToPay, Niubiz, Nuvei, Datafast, Culqi, Conekta, PayPal, Deuna… — not a closed list), experience (webview checkout, native in-chat, wallet/transfer), retries, refunds, test mode | **Jelou never holds funds**: each client uses its own provider account and credentials. The flow continues on the real transaction status (success / pending / failed). Money rules are always deterministic. | marketplace app + `jelou-build-workflows` |

## 5. Data, secrets and environments

| Capability | What it is | What the SOW must write | Builds it |
|---|---|---|---|
| **Databases v2** (default for new builds) | One managed database per organization with REST API, scoped keys, webhook triggers and an MCP connector; reached from workflows through an HTTP node | Collections, fields, retention, who exports what, which events trigger webhooks | `jelou-databases` |
| **Databases Legacy (DATUM node)** | Older tables by numeric id; existing nodes still run but no new ones should be added | In upgrades, say whether data stays in Legacy or migrates | `jelou-databases` |
| **Secrets** | Three scopes that do **not** merge: company, project, function. Tools only read company scope. Values are write-only; a deleted secret silently becomes empty. | The list of required secrets **by name** and owner (never values), and how dev and prod are separated | `jelou` |
| **Environments** | A variable that switches DEV/PROD must be asserted, never defaulted to production | Test environment of each integration and its dates | — |

"Datum" names two different products: say which one.

## 6. Channels

| Channel / feature | What the SOW must write | Limits and traps | Builds it |
|---|---|---|---|
| **WhatsApp** | New or migrated number, Meta Business Account owner, who completes Meta verification, provider (WhatsApp Cloud recommended) | Activation needs an active Meta Business Account and a number not already on WhatsApp; a human finishes the Meta sign-in. **Provider matters**: Flows, contact request, carousel and Flow buttons need WhatsApp Cloud (some also gupshup_capi/aldeamo). Sandbox: shared number, testers by phone, template names get a random prefix. Media: image 5 MB, video/audio 16 MB, document 100 MB; max 3 quick-reply buttons (lists beyond). | `jelou-whatsapp` |
| **HSM templates and campaigns** | Number of templates, texts, category (marketing / utility / authentication), who approves, sending windows, who segments | Meta approval takes minutes to hours and **each rejection burns a limited approval attempt**. UTILITY cannot carry promotion. Campaign CSV max 5 MiB, cost preview mandatory. | `jelou-whatsapp` |
| **Phone resolution (BSUID)** | Which processes need a **verified phone** (CRM, OTP, delivery, campaigns by phone) and the capture or decline path | Meta can identify a user with a business-scoped id instead of the phone, so `$user.id` may not be a phone. Capture with the contact-request node (blocking if the phone is required) or a Flow field, and persist the phone and its source. **The skills disagree on whether `$user.phone` is reliable** — verify in `/guides/getting-started/solicitar-telefono.mdx` and with the phone skills before promising it. | `jelou-phone-migration` (guard), `jelou-phone-audit` (swap) |
| **Meta Business Agent** | Whether Meta's own AI agent answers on the number, and how it hands over to Jelou | WhatsApp Cloud only; Meta's AI terms accepted; the Meta app subscribed to the `standby` webhook (**without it Jelou keeps no history**). Only some verticals are enabled (automotive, CPG, professional services, retail/e-commerce, travel); finance, government, health and similar are barred. Any Jelou message takes control away from the agent. | `jelou-whatsapp` |
| **Voice** | Inbound or outbound calls, voice agent prompt, voice, language, tools (HTTP to the client's API), knowledge base, number provisioning (ElevenLabs channel, SIP trunk or Twilio) or calls over the WhatsApp number, recordings and transcripts, campaigns, webhooks | Agent and number are configured separately and then connected. No implementation skill yet: verify everything in `/guides/voice/`. | Jelou team (docs) |
| **Web, Facebook, Instagram, email, Teams, Slack, X** | Which channels, and what changes per channel | WhatsApp-only features (Flows, contact request, templates) do not exist there; a Facebook/Instagram user id is never a phone | `jelou-project` |

## 7. Human attention (Connect / PMA)

Teams, operators, **scheduled hours**, automatic and out-of-hours messages, transfers between teams, close reasons, CRM link (HubSpot, Genesys), mobile app, live monitoring. The SOW writes per escalation: trigger, automatic or offered, team, hours, out-of-hours message. Docs: `/connect/configuraciones/`, `/connect/panel-multi-agente/`. Handoff wiring: `jelou-build-workflows`.

## 8. Operation: metrics, cost and testing

- **Metrics:** Jelou default metrics and the metrics catalog behind Studio dashboards; analysis of volume, intents, sentiment, resolution and operator load (`jelou-metrics`). Do not promise custom dashboards unless they are in scope.
- **Cost drivers to keep out of the design** (`jelou-cost-workflows`):
  - **From 1 October 2026 Meta charges every non-template message**, service messages and in-window utility templates included; the billed unit is each bubble. Click-to-WhatsApp entries (72-hour window) stay free. Marketing templates are always charged.
  - Message multipliers: split AI answers, several consecutive messages, one question per turn where a Flow would do, mid-conversation templates, retry loops.
  - Token drivers: long prompts on every turn, dynamic data at the start of the prompt, deterministic work done by the AI, duplicated rules, a model larger than the job, long history windows.
  - The SOW never quotes amounts: prices come from the commercial owner.
- **Testing** (`jelou-test-workflows`): draft-mode synthetic tester (routing, branches, traces; it does not see rendered buttons or media, and its user id is not a phone), live WhatsApp tests on the **published** commit, tool tests, KYC demo numbers, WhatsApp sandbox testers. Shared backends: use test data and a throwaway project. These shape the "Pruebas" and "Datos de prueba" sections.
- **Quality and pre-production review:** `jelou-scan-workflows`, `jelou-audit-workflows`, `jelou-security-review`, `jelou-graph`, `jelou-retire-workflows` (static, risk, security, dependency and retirement review). The SOW includes draft QA, UAT with the client in sandbox and the exit audit as deliverables.

## 9. From SOW to implementation

| SOW topic | Skill that builds it |
|---|---|
| Flows, nodes, AI, routing, tools, handoff | `jelou-build-workflows` |
| Project, channels, knowledge, marketplace apps, publishing | `jelou-project` |
| Functions (intermediate layers, cron, webhooks, PDFs) | `jelou-functions` |
| Static webviews | `jelou-sites` |
| Custom webviews with server code | Webview Studio MCP (create, draft, PR to `webviews-registry`, deploy) |
| WhatsApp number, Flows, templates, campaigns, Meta Business Agent | `jelou-whatsapp` |
| KYC configuration and demo | `jelou-kyc` |
| Catalog and store | `jelou-shop` |
| Databases | `jelou-databases` |
| Secrets, accounts | `jelou` |
| Phone capture | `jelou-phone-migration` / `jelou-phone-audit` |
| Settings by company, bot, team or user | `jelou-settings` |
| QA | `jelou-test-workflows` |
| Pre-ship risk review | `jelou-audit-workflows` |
| Cost review | `jelou-cost-workflows` |

Naming the implementing skill in `solucion.componentes[].detalle` is optional, but it makes the handoff to the implementation team explicit.

---

## 10. Extra detail by tool (limits, what the SOW must say)

Additions from the CLI and documentation review that §1-§9 do not already carry. Tags as defined above. "AI speed-up" says how much of the work AI-assisted building removes (see `effort-model.md` for hours).

### 10.1 Jelou CLI (`jelou`)
- Unified CLI (v4.10.1) for projects, workflows, tools, functions, sites, channels, templates, campaigns, shop, voice, KYC, payments, databases, metrics, logs, settings. Agent mode: `--agent` (compact JSON, no prompts), `--describe`. [CLI]
- Needs a v2 API key per company (`jelou login`); v1 tokens get 401. `channels create` by CLI supports only type web; WhatsApp is `channels activate whatsapp` (Meta login in a browser, needs a person); Facebook/Instagram only from the dashboard (OAuth). In agent mode `jelou push` publishes automatically; `channels connect` silently overwrites channel routing. [SKILL][DOC][CLI]
- SOW must say: Jelou company and plan, who delivers the API key, environment (draft vs published), repository (one monorepo per organization via `jelou org`).
- AI speed-up: near total for scaffolding, validating and pushing; human: production decisions (publish, channels, secrets), Meta login, approvals.

### 10.2 Brain nodes and AI
- Authorable nodes (`jelou workflow node-spec --list`): START, CHANNEL_MESSAGE (text, buttons, lists, carousels, media), INPUT, END, HTTP, SOAP, CODE (isolated JavaScript), TOOL, SKILL, SKILL_MARKETPLACE, CONDITIONAL, RANDOM, PAUSE, MEMORY, CHECKPOINT, DATUM, DATUM_MARKETPLACE, CONNECT, AI_TASK, AI_LOGIC (legacy), HSM, WEBHOOK, BILLING, MCP, HUBSPOT, GENESYS, EXTERNAL_AGENT, WHATSAPP_FLOW, LOCATION_REQUEST, NOTE. Not authorable by an agent: PMA, IF, IF_ERROR, EMPTY, FLOW, ECOMMERCE, PAYMENT, MESSAGE; IF/IF_ERROR are deprecated since 2026-09-25 (use CONDITIONAL and `failed` routes). [CLI]
- Pause minimum 1 unit; SOAP default timeout 30 s; `$memory.set` is for scalars, arrays/objects need `getJson/setJson` with TTL (memory v2); each channel restricts blocks (WhatsApp groups reject buttons, lists and carousels). Plans: Free = 125 workflow executions; paid = credits; Enterprise = fixed price per 24 h conversation. [DOC][SKILL]
- Models: Llama 4 Scout/Maverick, GPT 4.1 / 4.1 Mini, GPT 4o / 4o Mini (Azure), Claude 3.5 Sonnet, custom; real list via `jelou models` (docs may be stale). Native agent tools: product search, dates, interactive messages, transfer to agent. Token cost is separate (§8). [DOC][CLI]
- Tools and marketplace skills: a tool sees ORGANIZATION and its own WORKFLOW secrets, not BRAIN; a per-project switch goes in a CODE node of the workflow. [CLI]
- EXTERNAL_AGENT delegates to an agent hosted outside Jelou; a workflow with "Habilitar MCP" in START exposes `skill_list`, `skill_execute`, `execution_status`, `execution_cancel`. [DOC][CLI]
- Jelou Apps / jlu.ai: shared Jelou WhatsApp number (link, code, QR) to try workflows without an own number — useful for demos and UAT. [DOC]
- SOW must say: workflows (simple / medium / complex), channels, integrations per workflow, acceptance criteria, languages, hours, child flows, AI Routing. AI speed-up: high; human: business rules, final copy, UAT, publish approval.

### 10.3 Functions and the client's AWS systems
- Functions deploy: max 20 files, 256 KB per file, 1 MB total; only .ts .js .json .md .txt; entrypoint `index.ts`. `define()` makes an HTTP endpoint with Zod validation and an MCP tool; `app()` groups tools. Production URL like `https://<name>.fn.jelou.ai`. Cron does not validate input (`ctx.isCron`); `ctx.memory.set` value max 255 chars (use `setJson`), TTL max 24 h, per user; secrets UPPER_SNAKE_CASE, prefix `__FN_` blocked; tool name max 64 chars, description 1,024; token prefix `jfn_pat_`. Webhook signature verification: Stripe, Shopify, Meta. [DOC][SKILL]
- SOW must say: list of functions, inputs/outputs, calling systems, required secrets, SLA, who operates in production, and the preview condition. AI speed-up: very high; human: real credentials, tests against client systems, deploy approval.
- **Client's Lambdas / AWS.** No dedicated Jelou-to-Lambda integration is documented: the pattern is a Brain HTTP/SOAP node or a Function calling the client's API over HTTP (API Gateway, function URL). Functions run on Deno Subhosting, not in the client's AWS. mTLS: per-company certificates (Company > Security > Certificates) for API calls and HTTP/SOAP nodes. [DOC][SKILL]
- **Not documented, do not promise nor deny:** fixed egress IP, IP allowlisting, VPC, PrivateLink. [NO VERIFICADO] If the client requires one: `preguntas_abiertas` with `bloquea: true`, `responsable: "Jelou (soporte/arquitectura)"` and the client's network contact, plus an assumption (`fuente: "supuesto"`) until Jelou answers. Never write "Jelou has a fixed IP" or "Jelou connects through VPC".
- Client work (expose the endpoint, authentication, OpenAPI docs, test environment, mTLS certificate if used) goes in `dependencias_cliente` with a date. "New logic that lives in Jelou" = Function; "logic already in the client's Lambdas" = consumed over HTTP (`conexion: "api_cliente"` or `middleware_cliente`, `quien_hospeda` = client).

### 10.4 Databases, Shop, Sites, Webview Studio
- **Databases v2** (PocketBase): typed collections, CSV/XLSX import (up to 500 MB), API keys with abilities (`files:write` requires `records:write`), triggers (webhooks on create/update/delete; must be public HTTPS), MCP connector, DATUM node. One database per organization (`jelou databases limits`); compute plans NANO vs DEDICATED (about 10x cost; do not choose without asking). Legacy CLI only reads and creates/updates a row. Use for bot state, appointments, leads, small catalogs, audit — not the client's core system. SOW: collections and fields, volume, retention, who reads/writes, plan, initial migration, PII compliance. [SKILL][DOC]
- **Shop**: search V2 (hybrid/semantic/keyword), spreadsheet import (async, one sheet per upload), orders read-only in CLI, stock, coupons, branches; limits per plan (`jelou shop usage`); admin panel apps.jelou.ai/shop-v2 for what the CLI lacks. SOW: catalog size, source of truth, sync frequency, prices per branch, coupons, order flow, payment methods, logistics. [DOC][SKILL]
- **Sites**: `jelou sites init/dev/deploy/activate/rollback/update/delete`; `deploy --draft` uploads without going live and only the newest build can be activated; session: 50 opens per link, rate limit 120/min creating and 6,000/min traffic; the CLI validates limits before upload (`--dry-run`). [SKILL]
- **Webview Studio** (observed through the MCP): Cloudflare account limit 500 scripts (186 used at 2026-10-11). Versus Sites: Webview Studio has a light backend (`server.js` in a Worker) and its own deploy; Sites is static hosting with user session. Choose one and justify. Use for forms, data capture, balance/status lookup, scheduling, checkout, dashboards, campaign landings. [MCP]
- AI speed-up: high to very high; human: brand, final UX, device tests, security review, deploy approval.

### 10.5 WhatsApp detail
- **Activation:** Cloud only in self-service (Enterprise also BSP); needs an active (preferably verified) Meta business portfolio, a number with no WhatsApp account attached, and a person with access to the client's Business Manager (the client's, not the agency's). Sandbox: shared Jelou number with a tester allowlist (`jelou channels testers`); profile/username not editable. SOW must also cover number migration from another provider, coexistence (Connect > coexistence), business profile and BSUID/usernames. [DOC][SKILL]
- **Flows:** managed with `jelou channels flows` (list/show/pull/validate/diff/create/clone/push/publish/deprecate/delete/key); a published Flow is immutable (clone, edit draft, publish, update `flow_id` in every workflow); Flows with an endpoint share one RSA key per number; button text max 30 chars; local `validate` is structural only, Meta validates on push; not all devices support Flows; Meta review time has no documented figure. [DOC][SKILL][NO VERIFICADO for time]
- **HSM templates:** formats text, image, video, document, carousel, products (Cloud only), LTO, copy-code, Flow. Body 900 chars (600 in LTO), header 60, footer 60, button 24, `elementName` snake_case, LTO text 16, carousel card body 120. Media: image .jpg/.jpeg/.png 5 MB, video .mp4 15 MB, document .pdf 15 MB. Only APPROVED or REJECTED templates can be edited; PENDING is locked; editing an APPROVED one restarts approval. Meta prepends a random 4-char prefix; use the returned name in campaigns. Approval "minutes to hours", no documented SLA: never promise a date; keep a 1-3 business day buffer for rejections [NO VERIFICADO]. SOW: templates with category, language, variables, media; who approves; plan B on rejection. [SKILL][DOC]
- **Campaigns:** `jelou campaign list/get/create/cancel/reschedule`; CSV max 5 MiB, numbers with country code, no `+` or spaces; name 5-80 chars; cancelling does not retract delivered messages; billed by type and recipient country; Free, Builder and Business plans need a card in the Meta Business Manager, Enterprise uses prepaid credits; "Meta experiment" errors: retry after 24 h. SOW: volume and frequency, who delivers the CSV and with what opt-in, message budget (Meta cost separate), send window, metrics. [DOC][SKILL]
- **Meta Business Agent:** `jelou mba status/activate/instructions get|set/deactivate`; instructions 20,000 chars; skill title 64, description 1,024; Meta bills it; audience "all" needs a valid payment method; mark vertical eligibility as a condition. [DOC][SKILL]

### 10.6 KYC, Connect, payments, marketplace, knowledge, voice, metrics
- **KYC:** liveness, document check (OCR, validity, anti-fraud), facematch, auditable evidence; channels conversational (selfie video), webview (photo), WhatsApp Flows; government validation data-only (Ecuador, Colombia, Peru; Mexico and Chile in integration) and data plus photo (Ecuador, Peru); extra checks (Interpol, Police/Procuraduria). CLI `jelou kyc onboard/status/configure-advanced/report/simulate/demo`. Limits: public-URL Terms and Conditions PDF mandatory in the full flow; the user must be able to take a photo from the chat; government validation has extra cost; `configLocked` cannot be undone without internal support; per-validation rates [NO VERIFICADO]. SOW: countries and document types, channel, stages, thresholds, manual review policy, evidence retention and legal basis, terms. [DOC][SKILL]
- **Connect / PMA:** operator seat 25 USD per user (recurring, independent of volume); per-channel transfer only on Enterprise; HubSpot (inbox) and Genesys Cloud (nodes enabled + client OAuth) need Enterprise; `jelou connect operators list`. SOW: operators/teams/roles, schedules, assignment rules, closing reasons, metrics, what the bot escalates and with what context. AI speed-up low (teams and rules are manual in the dashboard). [DOC][CLI]
- **Payments:** platform cost 0.10 USD per approved production transaction (rejected, pending and test mode free) on top of the gateway fee; webview and native payment need a verified WhatsApp Business account; in workflows it is an MCP node of the installed app; `jelou payments` checks configuration. SOW: gateway, country, experience, test and production credentials (who delivers, when), status handling, reconciliation, refunds out of scope unless included, provider's test cards. [DOC][CLI][SKILL]
- **Marketplace apps:** `jelou marketplace list|inspect <slug>|install`; `jelou context` lists installed apps and `mcpTools`; external ones via AI_TASK with an MCP connection; app metadata (Shopify needs the store URL); install polling times out at 120 s. SOW: required apps, who authorizes OAuth, permissions, fallback if the client lacks the app. [CLI][SKILL]
- **Knowledge base:** `jelou project knowledge upload/list/delete`; deleting knowledge retrains the project and can change answers; Voice has its own knowledge base. SOW: source documents, who delivers and maintains them, update frequency, format, versioning, policy for answers without a source. [DOC][SKILL]
- **Voice:** voice agents (ElevenLabs and others), numbers (ElevenLabs, SIP trunk, Twilio), recorded/transcribed calls, outbound campaigns, WhatsApp voice calls; `jelou voice status/calls/numbers/agents/contacts/schedules/billing/reports/webhooks/orgs`; rates [NO VERIFICADO]. SOW: call cases, language/voice, hours, numbers, in-call integrations, recording and consent. [DOC][CLI]
- **Metrics and logs:** `jelou metrics` (inbox, ecommerce, payments, voice, biometrics, brain, ai, general; the catalog is per company, discovered live, never hardcode keys), `jelou logs` (production conversations), node alerts. SOW: KPIs, baseline, measurement period, dashboards, reporting frequency. [CLI][SKILL][DOC]
- **Other:** secrets via `jelou secret` (ORGANIZATION, BRAIN, WORKFLOW; Functions separate), config via `jelou settings`; extra channels (Web, FB, IG, email, Slack, Teams, X, custom), e-signature, Meta/Google Ads attribution, multi-organization and message grouping are listed in docs but not reviewed; migrations skills: `jelou-company-migration`, memory v1 to v2, BSUID (`$user.id` to `$user.phone`). [CLI][SKILL][DOC]

### 10.7 Cross-cutting SOW checklist
1. Jelou environment and account (plan, company, draft/production environments) and who publishes.
2. Channels and accesses the client must deliver with a date (Meta Business Manager, number, API credentials, mTLS certificates).
3. External dependencies with timings Jelou does not control: Meta verification, template and Flow approval, OAuth of apps, gateway credentials, client APIs (including their Lambdas).
4. Scope per deliverable with volume and complexity (workflows, tools, functions, webviews, templates, Flows, integrations).
5. Recurring costs outside fees (Jelou credits, Meta messages, AI tokens, operator seats, per-approved-payment fee, KYC government validation) — listed apart, never quoted by this skill.
6. Acceptance criteria and test plan (draft QA, UAT, audit).
7. Functions preview condition and technical limits (timeouts, sizes).
8. Compliance: personal data, campaign consent, KYC evidence retention.
9. Explicit out of scope (post-publish Flow changes, refunds, new channels).

### 10.8 Not verified
- Formal relation between Jelou Functions and client Lambdas/AWS, fixed egress IP, VPC.
- Meta approval times for templates, Flows and business verification: no official figures; never put fixed Meta timings in the schedule, use dated dependencies and a buffer.
- Real plan/pricing of the company the SOW is for; KYC, Voice and government-validation rates.
- Official criterion Webview Studio vs Jelou Sites for new projects.
- Current AI model list (docs vs `jelou models`).
- Custom channel skills (`jelou-canal-*`), e-signature, Meta/Google Ads, email/Slack/Teams/X: listed only.
- Commands needing an active session (`context`, `marketplace list`, `models`, `databases limits`, `shop usage`) were not run, so installed apps, plan and real quotas of a company are unverified.
