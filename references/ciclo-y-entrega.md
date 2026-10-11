# The SOW cycle with the client and how to deliver it

## 1. The cycle

1. **SOW 1.0 → 1.1, 1.2 → approved.** Built from the Pre-Sales design and Sales material (the main flow of this skill) as 1.0 `en_revision`; corrections during review are 1.1, 1.2; when the client approves it, `meta.estado` becomes `aprobado` (a later baseline is 2.0, at most 3.0). There are no 0.x versions.
2. **Meeting with the client.** Capture scope decisions, chosen integrations, UX and tone feedback, commitments with owner and date, and the formal communication channel. The "pains/objections" in the Diio minutes are direct input for the next version. Answers to open questions and `[Supuesto]` items become decisions in `sow.json` (`fuente: "cliente"`).
3. **SOW vX.Y.** Update `sow.json` (the single source of truth), diff it against what the previous version said (see mode B in `SKILL.md`), run the linter and regenerate with `build_all.js`. The client always receives the jelou-sow template Word, regenerated from `sow.json`, never a hand-edited copy. New agreements go into the sections they touch (brief with an "Actualización vX.Y" paragraph, team, scope, diagrams, rules, integrations, criteria, security) + a new row in `versiones` and, for scope changes, a `cambios` entry.
4. **Progress presentation** (optional) → export to PDF to send. The one-page proposal and the Gantt (`paquete-de-entrega.md`) can feed it.
5. **Email to the client** (on the formal channel if one was agreed): SOW vX.Y + recap of commitments + prioritized request for inputs. Look for the existing Gmail thread before opening a new one (traceability).
6. **ClickUp**: attach the SOW to the "Creación SOW" task, comment the changelog, keep the implementation task up to date.
7. After the client's agreement → final SOW for signature.

Steps 5 and 6 are visible to third parties: **do them only when the user asks**, and show the email draft before sending.

Unknown client-team emails are written "POR COMPLETAR" (red in the Word) — never invent contact data.

## 2. Sending documents — real Google Workspace pitfalls

- **Links in emails sent by API get wrapped** in an unsigned Google "Redirect Notice" (google.com/url without `usg=`): the receiver sees an intermediate page that looks like an error, in plain text and in HTML `<a href>`. The one-click access path is the **native Drive invitation**: put the file in the team's shared drive (inherits permissions) and the user does Share → Commenter → "Notify people" (Google sends its own email with signed links). The API email carries the *context* of the review, not the access.
- `share_file` by API is blocked by policy on shared drives ("caller does not have permission"), and the connector does not upload large binaries (base64 inline). Tested flow: the user drags the file in, the agent moves/renames it into the workspace folder (`update_file` with `parentId`), and the user triggers the native notification.
- **Rule:** the client email always carries the direct links to the documents **in the body**, besides the Drive share with notification — the email must be self-sufficient if the notification gets lost.
- Real attachments through the Gmail connector are not viable above ~100 KB. Pattern: upload to **My Drive** with gcloud (external sharing by API works there) + permissions API with `sendNotificationEmail=true` + links in the email. Updating a PDF's **content** by its fileId (`PATCH uploadType=media`) keeps the same shared link.

## 3. Never test credential links

Activation or password-reset links (Salesforce, and any `c=<token>` link) can be **single-use**: a simple GET (curl, prefetch, link scanner) consumes them and the user later sees "invalid link". Verifying a credential link = burning it. To diagnose, inspect only the domain (HEAD on the root) or wait for the user to use it. If it was burned: "Forgot Password" with the right username (watch sandbox suffixes like `.scopy`) issues a fresh one.

## 4. Integration activation guide (marketplace)

A short, non-technical document (~2 pages, in the jelou-sow look: Poppins, teal and dark colors from `assets/brand.json`): what is activated and why, requirements, numbered steps per provider with its marketplace `install_url`, an OAuth security note (we never see passwords; access is revocable), what happens next, Tech Lead signature. Always recommend activating **first a test account of our own** to validate end to end; the client authorizes theirs afterwards (swapping is a re-authorization, no development).
