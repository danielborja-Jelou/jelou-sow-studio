# Consistency checklist (manual review after the linter)

The linter catches what is mechanical. This review catches what requires reading with judgment. Go through every point; if one fails, fix `sow.json` or turn it into an open question.

These points come from real contradictions found in earlier client SOWs and in the bots that were built from them.

## A. Scope against the rest of the document
1. **Out of scope vs tests and flow.** Does any test or flow step require something excluded? (Real example: end-to-end tests with "checkout/payment" while the scope says "no in-chat payment".)
2. **Out of scope vs FAQ and escalation.** Does a FAQ promise to answer something excluded? (Real example: FAQ "which invoices do I have to pay?" while "pending-invoice validation" is out of scope.) If the FAQ is only informational and does not query data, say so explicitly.
3. **Brief promises vs features.** Every verb in the brief ("will validate", "will query", "will update") must have a feature and a story.

## B. Rules and flow
4. **Escalation to a human.** Is it automatic or offered? It must say the same in the flow, the rules and the escalation table.
5. **Complete thresholds.** If there is a range (minimum and maximum), is it defined what happens below, inside and above, and whether the endpoints are included? (Real example: minimum 100, direct approval between 100 and 5000, and nothing said about more than 5000 except "escalate".)
6. **Calculations.** If there are several taxes or costs, is it defined what they apply to, in what order and at what level (product, order)?
7. **Real time vs periodic.** If something updates in batches (3 times a day) and is also queried in real time, is it clear which one is used for which decision?
8. **Contingencies with criteria.** An "if it takes longer than X, Y is recommended" needs who decides and when it is evaluated.
9. **One term, one meaning.** The same name for the same state, field or profile across the document (for example, "PMA" is always the agent panel).
10. **Behavior when a rule fails.** For each rule: is it rejected, adjusted automatically, retried, escalated or does the flow end? (Real examples: the SOW said "the flow ends" and the bot offers another ID number; the SOW gave a minimum quantity and the bot rounds it up without asking.)
11. **Order of the steps and when each datum enters.** If shipping cost or a tax enters the total, was the datum that determines it (address, city) already collected before the total is shown? (Real example: address chosen after "Create order", but shipping already part of the total.)
12. **Field names.** The same field is written the same way throughout (real example: `Ciudad_Provincia` and `CIUDAD_PROVINCIA`, a misspelled `unidad_minina_venta`). Write each technical name once and reuse it.
13. **Data that is used but never read.** Every datum a rule needs (credit limit, block flag, logistics service type) must come from some read operation of an integration. (Real example: the listed views did not include the credit limit or the block flag the rules used.)
14. **Things that persist.** Cart, session, lost sales: how long are they kept, where, and who sees them? A report that is mentioned but not defined is an empty promise; define columns and frequency or remove it.
15. **Exact moment of each validation.** "When adding to the cart" and "when creating the order" are not the same. If the SOW says one and the flow another, choose one.
16. **Escalation by product condition.** If certain products or categories follow another route (for example, always go to an agent), it must be written as a rule with the category list.
17. **Words open to double reading.** "Checkout", "payment", "order", "tracking". Define each one the first time. (Real example: "no payment" in the scope, but the bot registers a payment order and debits stock at checkout; the SOW should have said "no charge, with order registration and stock debit".)
18. **What Jelou builds by default.** If the bot will include phone resolution, an out-of-hours message, event auditing, confirmation emails or terms and conditions, the SOW must accept or exclude it. (Real example: one client's bot includes order tracking and confirmation emails that the SOW never mentioned, and tracking was excluded.)

## C. Integrations
19. **Single mode and who hosts it.** If the SOW offers two ways to connect (direct/VPN, API/views), is one chosen, or is there a pending decision with an owner and date? If there is an intermediate layer (Lambda, function, middleware), who builds, hosts and maintains it? Fill the `conexion` field of every integration.
20. **Every operation has a system.** Every read or write in the flow points to an integration; every integration is used in the flow.
21. **Client technical owner** named, with documentation and test environment confirmed or with a delivery date.
22. **Network security.** If the client requires an IP whitelist, VPN or a minimum-permission user, it is in client dependencies.

## D. Data and compliance
23. **Personal data.** Every personal datum the bot stores (ID number, email, phone, address) has a purpose and retention stated.
24. **Terms and data policy.** If the bot collects data, is there acceptance of terms? At which step?
25. **Identity validation.** If there is an OTP or ID validation, how many attempts, how long does the code last and what happens on failure?

## E. Operation and schedule
26. **Hours.** Bot hours, agent hours, holidays and the out-of-hours message are consistent across sections.
27. **Geographic coverage.** Which countries, cities or zones does the bot serve and what does it answer outside them?
28. **Sandbox vs production.** Which numbers/environments are used in tests and when production starts.
29. **Schedule.** Milestones with business days, a total consistent with the dates promised to the client, and client dependencies before the milestone that needs them.

## How to report
When finished, summarize for the user in a short table: point, what you found, what you did (fixed / open question / accepted). If you found nothing on a point, do not mention it.

## F. Conversation graph, diagrams and simulation (added from the JEP and Uanataca reviews)
30. **Diagram = requirement.** Every step, branch, error path and handoff of the requirement appears in the diagram; nothing in the diagram is absent from the stage table or the stories.
31. **Mockups in sync with the SOW.** A feature switched off in a later version (for example a document check) must disappear from mockups and simulations; a feature added later (for example OTP) must appear. (Real example: a v4 mockup still showed the disabled document step and no OTP.)
32. **Figures in messages match the rules.** The installments, amounts, days and limits shown in a message or mockup are the ones in the rules (real example: mockup "3 to 36 installments" against a rule of "minimum 10").
33. **One persona.** The same agent name, tone and form of address in every message of every agent (real example: two names and "tú"/"usted" mixed in one bot).
34. **Mock vs production.** If an integration is still a mock, the SOW says how and when it is replaced; the bot must not keep test data (fixed phone numbers or ID numbers) in production.
35. **Standard behaviors accepted or excluded.** Phone guard, terms and data policy, out-of-hours message, event log, confirmation emails: each one is in the scope or in the out-of-scope list.
36. **Project length.** The critical path of the schedule is at most 15 business days (parallel lanes count once, at most 3); waits on the client are dependencies with dates, not build hours.
37. **Team.** Every required role is present; unknown values are POR COMPLETAR and appear in red.
38. **Diagram readability.** Large flows are split (overview, stage details, common handoff); every figure has at most 12 nodes, error exits are local terminals, link nodes say where the flow continues, and you looked at every PNG.
39. **Forms.** Form steps use `formulario` with `herramienta` and fields with `opciones`/`ejemplo`; "Flows vs WebView" pending is an open question, not a silent choice.
40. **Team asked, not assumed.** The team question was asked before building, names from sources were confirmed (`meta.equipo_confirmado`).
41. **Blocking items.** Personal-data retention, a single escalation mode per destination, integration owner/documentation/test environment with a dated dependency, and a deadline on every dependency.
42. **Scope lock.** Every feature in the scope is in the presales base or in an addition approved by Comercial (with an additional charge and a `cambios` row). Extras mentioned later are `por_decidir`, absent from flows, stories, solution and effort, with ONE question to Comercial each. Later statements that contradict presales assumptions are questions, not decisions.
43. **Hours.** The maximum total effort (management included) is at most 72 h (or the cap in `meta.tope_horas`, or `meta.excepcion_horas` says why); both `pruebas_qa` and `uat_acompanamiento` are there.
44. **Tests in the schedule.** "Pruebas internas" and "UAT del cliente" are milestones with business days and dates in the Word, the Gantt and the proposal.
45. **UAT rule.** The client-tests clause (stipulated dates, otherwise accepted and closed) is in the schedule, the client responsibilities and the acceptance section, with a dated dependency; the wording is still a draft pending Legal review.
46. **End-to-end diagram.** The first figure "Diagrama end-to-end" has at most ~8 boxes in business words (no OTP/API/webhook), both entry points when the graph has inbound and outbound, and the main exits; you looked at the PNG.
47. **Pre-kickoff.** The threshold was checked with `umbral_prekickoff.js`; the client faltantes document has no internal doubts; the deck has no layout notices and was rendered and looked at.
