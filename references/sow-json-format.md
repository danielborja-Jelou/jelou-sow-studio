# `sow.json` format (v2)

`sow.json` is the single source of truth. The Word file, the diagrams and the HTML bot simulator are all generated from it, so they can never disagree. A complete example is in `assets/example-sow.json`.

The **keys are Spanish** (they mirror the sections of the Spanish SOW) and **all values are Spanish text**. A value that is not yet known is written exactly `"POR COMPLETAR"` (people, dates, names) or `"POR DEFINIR"` (decisions, figures). Both render in **red** in the Word file and count as pending in the linter.

## Top level

```jsonc
{
  "meta": {
    "proyecto": "Optimización y orquestación de agentes de WhatsApp",
    "cliente": "Nombre del cliente",
    "proveedor": "Jelou",
    "pais": "Ecuador",
    "tipo": "nuevo",              // nuevo | upgrade | mejora
    "codigo": "EC-01-000-01",     // optional: account code in ClickUp
    "version": "1.0",             // 1.0 initial; 1.1, 1.2 corrections; 2.0, 3.0 new baselines (max 3). Never 0.x
    "estado": "en_revision",      // en_revision | aprobado: approval is a status, not a number
    "fecha": "2026-10-05",
    "autor": "Nombre Jelou",      // "Preparado por"
    "prioridad": "Fase 1: … · Fase 2: …",   // optional
    "equipo_confirmado": false,   // true only after the user confirmed the team (names from Diio/ClickUp are proposals)
    "excepcion_plazo": ""         // only if the project must exceed 20 business days (see rules)
  },
  "brief": ["párrafo 1", "párrafo 2"],
  "principios_diseno": [ { "titulo": "Un toque, no teclear", "texto": "…" } ],   // optional
  "objetivos": {
    "general": "texto",
    "especificos": ["medible 1", "medible 2"],
    "por_agente": [ { "agente": "R1", "objetivos": ["…"] } ]                      // optional
  },
  "equipo": [ { "rol": "PM", "nombre": "…", "organizacion": "Jelou", "cargo": "Project Manager", "responsabilidad": "…", "correo": "…" } ],
  "seguimiento": "Reunión semanal los jueves 09h30 por Teams…",                   // optional
  "alcance": { … },        // see below
  "parametros": { … },     // operating parameters, key → value
  "agentes": [ { … } ],    // conversation graphs, see below
  "diagrama_general": { "titulo": "Orquestación E2E", "pasos": [ … ] },            // optional, same node shape
  "reglas": [ … ], "solucion": { … }, "escalamiento": [ … ], "datos": [ … ],
  "integraciones": [ … ], "mapeo_datos": [ … ], "validaciones": [ … ],
  "historias": [ … ], "pruebas": [ … ],
  "esfuerzo": { … },       // hours with AI, see below
  "dependencias_cliente": [ … ], "cronograma": { … },
  "responsabilidades": { "jelou": ["…"], "cliente": ["…"] },
  "revision_seguridad": [ { "aspecto": "…", "revisado": "Sí", "mitigacion": "…" } ],
  "riesgos": [ … ], "cambios": [ … ], "versiones": [ … ],
  "preguntas_abiertas": [ { "id": "Q-1", "pregunta": "…", "bloquea": true, "responsable": "UANATACA EC" } ],
  "firmas": { "jelou": { "nombre": "…", "cargo": "…" }, "cliente": { "nombre": "POR COMPLETAR", "cargo": "POR COMPLETAR" } }
}
```

### Team (`equipo`)
Ask "¿Tienes la información del equipo de trabajo?" before filling it, even if the sources name people (offer them as proposals); `meta.equipo_confirmado: true` records that the user confirmed. One row per role the project needs: AM, PM, implementer/bot builder, client functional reference, client technical contact (for integrations) and any partner. **If the user does not have the data, keep the row with `"POR COMPLETAR"` in the unknown fields** (they render in red). Never invent names.

### Scope (`alcance`)
```jsonc
"alcance": {
  "fases": [ { "fase": "Fase 1 (prioridad)", "requerimiento": "R1 · Agente …", "publico": "…", "canal": "WhatsApp …" } ],
  "incluido_admin":   [ { "id": "F-A1", "texto": "…" } ],
  "incluido_usuario": [ { "id": "F-U1", "texto": "…", "agente": "R1" } ],     // agente is optional, groups the list
  "fuera_de_alcance": [ { "id": "OOS-1", "texto": "…", "terminos": ["palabra clave"] } ],
  "supuestos": ["…"]
}
```

### Agents and the conversation graph (`agentes`)
Each agent is a graph of `pasos` (nodes). **The same graph produces the table "etapa / texto propuesto", the diagram and the interactive simulator**, which guarantees they match.

```jsonc
"agentes": [
  {
    "id": "R1", "nombre": "Agente Firma La Favorita", "fase": "Fase 1", "canal": "WhatsApp La Favorita",
    "persona": { "nombre": "Emi", "tono": "cálido y cercano", "apelativo": "socio" },
    "titulo_diagrama": "Agente Firma La Favorita (fase 1): flujo E2E",
    "pasos": [
      {
        "id": "P1",
        "tipo": "usuario",               // usuario | mensaje | router | formulario | api | decision | asesor | tercero | fin   (webview = alias of formulario)
        "etapa": "Entrada",              // short label for the stage table
        "diagrama": "El cliente escanea el QR o escribe al WhatsApp",   // text inside the diagram box (≤ 110 chars)
        "mensaje": "¡Hola! Soy …",       // exact proposed bot text (tipo mensaje) or what the user types (tipo usuario)
        "botones": ["Activar mi firma", "Estado", "Hablar con asesor"], // ≤ 3, each ≤ 20 chars
        "lista": ["Reenviar email", "Cancelar solicitud"],              // ≤ 10 rows, each ≤ 24 chars
        "herramienta": "por_definir",    // formulario only: flows | webview | por_definir (default). Legend: "Formulario (WhatsApp Flow / WebView)"
        "formulario": { "titulo": "Activa tu firma", "boton": "Enviar",
                     "campos": [ { "etiqueta": "Cédula", "tipo": "texto", "obligatorio": true, "ejemplo": "1234567890" },
                                 { "etiqueta": "Motivo", "tipo": "selector", "opciones": ["Nuevo", "Renovación"], "ejemplo": "Nuevo" } ] },   // tipo: texto | correo | selector | archivo | casilla | numero | fecha | telefono; opciones and ejemplo feed the simulator
        "grupo": "Verificación de identidad",   // optional: name of the business stage this step opens (alias: fase); used to split long diagrams
        "recibe": ["Datos capturados"],  // asesor only: what the advisor receives (shown under the handoff figure)
        "integracion": "INT-1",          // required when tipo is api
        "reglas": ["RN-01"],
        "siguiente": [ { "a": "P2" }, { "a": "P9", "si": "no válido" } ]    // edges; "si" is the label (button text, "sí"/"no", condition)
      }
    ]
  }
]
```
Node types and their meaning: `usuario` (what the user does or types), `mensaje` (bot message), `router` (intent orchestration), `formulario` (form inside WhatsApp: WhatsApp Flow or WebView, `herramienta` says which; `webview` is a backward-compatible alias), `api` (call to a system), `decision` (branch, ≥ 2 labeled edges), `asesor` (human handoff), `tercero` (process on the client side, drawn dashed), `fin`.

#### Diagrams of long flows
Up to 18 steps an agent is one figure (`F<n>.1`). Above that the engine builds: `F<n>.1` overview (one box per stage), `F<n>.2…` one detail per stage (at most 12 nodes counting link and terminal nodes) and a last **handoff común** figure. Stages come from `pasos[].grupo` (or `fase`), else `pasos[].etapa`; steps without a label inherit from the previous step on the main path; fine-grained etapas are merged automatically (the linter suggests `grupo`). Exits to an advisor or to the shared end become a local terminal ("Derivar a asesor (ver diagrama de handoff)" / "Fin"); looping retries stay as short loops. `agente.dividir_diagrama: false` keeps one figure. A user-defined `diagrama_general` is figure `FG`. Generated files: `diagramas/F1.1.png|svg`… and `figuras.json`.

### Business rules, solution, escalation, data
As in v1: `reglas` (with `parametros`, `si_no_cumple`, `fuente`), `solucion.componentes` (each with `ejecucion`: determinista | conversacional | mixto), `escalamiento` (`modo`: automatico | ofrecido), `datos` (entity, fields, retention).

### Integrations (`integraciones`)
```jsonc
{ "id": "INT-1", "nombre": "API UANATACA WhatsApp (api_wa_ua v1)", "sistema": "…", "proposito": "…",
  "endpoints": "https://… (POST, JSON, Bearer): validarCodigoDST · consultarEstadosCP · …",   // optional
  "uso": "Fase 1: consulta de estados. Fase 2: seis gestiones.",                                // optional
  "operaciones": [ { "tipo": "lectura|escritura", "descripcion": "…" } ],
  "conexion": "directa|api_cliente|middleware_jelou|middleware_cliente", "quien_hospeda": "…",
  "autenticacion": "…", "documentacion": "si|no|pendiente", "ambiente_pruebas": "si|no|pendiente",
  "estado_actual": "validarCodigoDST integrado; el resto por conectar",                         // optional
  "condicion": "La API no se modifica",                                                         // optional
  "responsable_cliente": "UANATACA EC · TI", "disponibilidad": "…", "restricciones_red": "…" }
```

### Data map and validations
```jsonc
"mapeo_datos": [ { "agente": "R1", "campos": [ { "campo": "cedula", "aplica": "Activar, Estado", "descripcion": "10 dígitos", "obligatorio": "Sí" } ] } ],
"validaciones": [ { "campo": "Cédula", "validacion": "10 dígitos, módulo 10", "mensaje": "Revisa la cédula: debe tener 10 dígitos válidos.", "aplica": "R1, R2" } ]
```

### Stories (`historias`) and tests (`pruebas`)
`historias[]`: `{ "id": "HU-LF-01", "agente": "R1", "titulo": "Bienvenida con botones", "perfil": "…", "quiero": "…", "para": "…", "reglas": ["RN-01"], "criterios": [ { "dado": "…", "cuando": "…", "entonces": "…" } ] }`. `pruebas[]` as in v1.

### Effort with AI (`esfuerzo`)
```jsonc
"esfuerzo": {
  "personas": 1, "horas_dia": 6,                 // productive hours per person per day
  "items": [ { "entregable": "Workflow del agente R1", "tipo": "workflow_medio", "cantidad": 1, "nota": "…" } ],
  "gestion_pct": 20                              // management overhead (15–25 %)
}
```
`tipo` must be a key of the rate table (the Word prints the Spanish `etiqueta` of each type, defined in `scripts/lib/effort-rates.json`; `formulario` covers a form whose tool is not decided) in `references/effort-model.md` (hours are ranges for AI-assisted work with human review). The generator prints the table and totals; the schedule must be consistent with them.

### Client dependencies (`dependencias_cliente`)
`{ "item": "…", "responsable": "…", "fecha_limite": "2026-10-16", "hito": "Construcción del agente", "integracion": "INT-1" }`. `fecha_limite` is required (a dependency without a date is a blocking lint item). `integracion` (id or list) or an INT-n / WS#n mention in `item` (ranges such as "WS#4 a WS#7" count) links it to an integration; `hito` (id or name) says which milestone needs it. Without `fecha_limite` the linter prints a *proposed* date (last business day before that milestone starts, from `cronograma.inicio`): a suggestion for the user, never written into the SOW.

### Schedule (`cronograma`)
```jsonc
"cronograma": { "inicio": "2026-10-12", "festivos": ["2026-11-02"],
  "hitos": [ { "id": "H0", "fase": "0", "nombre": "Planificación y definiciones", "descripcion": "…", "dias_habiles": 2, "entregable": "SOW firmado" } ] }
```
**The whole project must not exceed 20 business days.** The linter raises an error above 20 unless `meta.excepcion_plazo` explains why (then it is a warning). Dates are computed by the generator, never typed.

### Changes (`cambios`)
For SOWs that evolve: `{ "id": "CC-01", "fecha": "2026-05-12", "area": "Épica 2", "descripcion": "…", "evidencia": "Sesión 12/05", "impacto": "Incorporado v2.0" }`.

### Deviations from an existing bot (`desviaciones`, optional)
Only when the user asks to compare the SOW with a bot already built (read-only: `jelou context`, `jelou graph`; never push or publish). One row per difference: `{ "id": "DV-01", "area": "OTP", "sow": "3 intentos", "bot": "5 intentos", "decision": "Ajustar el bot | Corregir el SOW | POR DEFINIR" }`. The Word file adds a section "Comparación con el bot existente". Never copy credentials found in the bot.

### Versioning
The template convention: **1.0 is the initial version**; corrections during review are 1.1, 1.2; a new baseline is 2.0, 3.0 (at most 3 version controls). Approval is `meta.estado: "aprobado"`, set only when the client approves and no blocking question or pending value remains. A verbal "1.0.1" is 1.1. `versiones` gets one row per version (`fecha`, `version`, `descripcion`, `autor`) and its last row matches `meta.version`. The Word marks the document "en revisión" until `meta.estado` is `aprobado`.

### From a Pre-Sales design document
Each `Flujo_N` of the design is one `agentes[]` entry (`id: "F<N>"`, `nombre: "Flujo_N: <Nombre>"`); each step may carry `componente` (the design's `→` tag, e.g. `"API (WS#2) / Flows"`, printed in the stage table for steps that have an `etapa`; a step tagged API or WS#n must have `integracion`); each `WS#n` is `INT-n` with the label kept in `nombre`. See `references/design-document.md`.

## Why a single graph and these fields
- IDs (`RN-`, `HU-`, `INT-`, `ESC-`, `OOS-`, `PR-`, `C-`, `P`) allow cross-references checked by the linter.
- `terminos` on out-of-scope items detect contradictions anywhere in the document, including bot messages.
- `si_no_cumple` and `conexion` exist because, in real projects, the bot builder decided those silently when the SOW did not.
- Pending values in red make it impossible to send a document with holes unnoticed.
