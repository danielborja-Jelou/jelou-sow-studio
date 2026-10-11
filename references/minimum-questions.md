# Minimum questions before treating a SOW as good

Compare `sow.json` against this list. Whatever Sales material does not answer goes into `preguntas_abiertas`. Mark `bloquea: true` on the ones that prevent building or contradict the scope; the rest may stay as an assumption confirmed by the client.

Write the client-facing questions in Spanish, in business language, one per line, without Jelou technical terms. (They are shown here in English for the maintainers.)

## Operation
- What hours does the bot serve and what hours do human agents work (per day, including Saturdays and Sundays)? Which holidays apply?
- What should the bot answer out of hours, and is any follow-up scheduled?
- In which countries, cities or zones is the service provided? What is answered to someone outside them?
- What language and tone are expected (formal, close, regionalisms)? Does the assistant have a name and personality?

## Users and data
- Which kinds of users exist (customer, prospect, company, individual) and what can each do?
- What data is requested from the user and why? How long is it kept?
- Are there terms and conditions or a data policy the user must accept? Does the client supply them?
- Is identity validated (ID number, OTP by email or SMS)? How many attempts and how long does the code last?

## Business rules
- Are there minimum or maximum amounts, credit limits or caps? What happens below, inside and above each threshold?
- Which taxes, discounts or extra costs apply, what are they calculated on and who defines them?
- When is a human agent involved: keywords, number of failures, blocked customer, change of sensitive data, complaints? Is escalation automatic or offered?
- Which states does an order, request or case have and what is reported in each?
- What must happen when an external system fails?

## Payments and logistics (if applicable)
- Is there in-chat payment, a payment link, cash on delivery or approval by an agent? With which provider?
- How is shipping calculated? Is there pickup at a store or warehouse, and at which ones?
- Which payment retries are allowed and what happens on failure?

## Integrations (one question set per system)
- Which system is it, which operations do we need (read, write) and which data?
- Is there a documented API or views? Who maintains them? Is there a test environment?
- How does it authenticate and what network restrictions apply (IP whitelist, VPN)?
- Who is the client's technical owner and by when are the accesses delivered?
- What availability does the service require?

## Behavior on failures
- For each rule or validation: if the user does not meet it, is it rejected, adjusted automatically, retried, escalated or does the flow end?
- What happens if the client's system does not respond or returns an error when creating an order?
- If the WhatsApp number does not arrive identified, is the user asked to share the contact?
- Can a customer have more than one email or phone registered?
- Is any product, category or customer type always escalated to an agent?

## Tests and go-live
- Who supplies the test customers, the sandbox numbers and the sample data, and by when?
- Who builds, hosts and maintains the intermediate layer between Jelou and the client's system (if one exists)?
- What service level applies to the periodic data refresh (for example, inventory)?
- Which standard Jelou behaviors (out-of-hours message, confirmation email, event logging) does the client want or not want?

## Measurement and operation
- Which metrics does the client want to see and how often?
- Which reports and in what format?
- Who trains whom?
- What goes to production and how is it stabilized (duration, support)?

## Commitments
- Which dates has Sales already promised the client?
- Which client dependencies condition the schedule?
- What is explicitly out of scope?

## Team (ask this first)
- Do you have the information of the work team? If yes, for each role (AM, PM, implementer / bot builder, client functional reference, client technical contact, partner): full name, organization, position and responsibility. If not, leave the fields as POR COMPLETAR.
- Who answers on the client side for texts, brand manual, accesses and the UAT? Which day and time is the weekly follow-up meeting?

## Conversation design
- What is the agent's name and personality, and does it address the user as "tú" or "usted"?
- For each flow: which buttons, lists or forms does the user see, and what exact texts does the client want?
- What does the user see on every error path (invalid data, no results, system down, timeout) and what happens after the third failed attempt?
- Which steps use a form (WebView or WhatsApp Flow) and which stay conversational?
- Which features did the client switch off or postpone? They must disappear from every message and mockup.

## Tool choices (see `catalogo-jelou.md`)
- For each page opened from the chat: WhatsApp Flow, Jelou Shop, a custom page (Jelou Sites or Webview Studio), KYC or the payment provider's checkout? Who designs it and who provides the branding?
- Is there existing logic in AWS Lambdas the bot must reuse? Who owns it, is it shared with other clients, and does it stay there or move to a Jelou Function?
- Which processes need a verified phone number (CRM, OTP, delivery, campaigns)? What happens if the user does not share it?
- Which WhatsApp provider will the number use? (Flows, contact request and some buttons need WhatsApp Cloud.)
- Identity and signature: Jelou KYC (which plan and checks) or the client's own provider behind an API? Who carries fraud liability?
- Payments: which provider and whose account? What happens on pending or failed payments?
- Data: Databases v2 or existing Legacy tables? What is exported and by whom?
- Is Meta Business Agent or Voice part of the scope? Does the client's vertical qualify for Meta Business Agent?

## Design document gaps (see `design-document.md` §3)
- For each `[Supuesto]` of the Pre-Sales design: which is the client's confirmed answer? Platform doubts go to Jelou's technical owner, not to the client.
