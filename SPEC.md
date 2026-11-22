# Demo 03 — Purchase Approval Agent

## Pitch
"Staff submit a purchase request on a form. The agent checks it's complete, codes it to the
right budget line, checks funds, routes it to the right approver with one-click
Approve/Reject buttons, generates the paperwork, and chases anyone who's holding it up."

## Demo story
1. Google Form "Purchase Request" has ~8 fake submissions (one missing a vendor, one over budget,
   one large enough to need two approvers).
2. On submit, the agent:
   - Validates completeness. If something's missing, it emails the requester asking for exactly what's missing, sets status `Needs Info`.
   - Asks Claude to pick a budget line and write a one-line justification summary.
   - Checks `Budget` tab remaining funds. If insufficient, it flags the request and still routes it, marked "over budget".
   - Picks approver(s) by amount tier, generates a request PDF from a Doc template, and emails the approver with Approve / Reject links.
3. Approver clicks Approve. The web app records the decision, timestamps it, advances to the next tier or completes, notifies the requester, and deducts from the budget.
4. Daily reminder trigger nudges approvers on requests pending > 48h.
5. `Requests` sheet shows the full status trail. The dashboard tab shows counts by status and spend by budget line.

## Architecture
- Form → linked Sheet → installable `onFormSubmit` trigger → `handleSubmission(e)`
- Web app (`doGet`) handles `?id=<requestId>&action=approve|reject&token=<hmac>`
- Daily trigger 8:00 AM → `sendReminders()`
- AI: Claude for budget-line classification + summary; all routing/thresholds are deterministic code

## Form fields
Requester name · Requester email · Item/service description · Vendor · Estimated cost ($) ·
Needed by (date) · Purpose / justification · Quote attachment (file upload, optional)

## Sheets
**Requests** — Request ID (PR-0001) · Submitted · Requester · Email · Description · Vendor · Amount ·
Needed By · Budget Line · AI Summary · AI Confidence · Budget OK (Y/N) · Status · Approver 1 ·
Decision 1 · Decided 1 · Approver 2 · Decision 2 · Decided 2 · PDF Link · Notes
Status values: `Needs Info` · `Pending Approval` · `Approved` · `Rejected`

**Budget** — Budget Line · Annual Amount · Spent (approved) · Remaining (formula)
Seed: Instructional Supplies 15,000 · Technology 25,000 · Facilities 30,000 · Food Service 12,000 ·
Professional Services 20,000 · Office & Admin 8,000 · Events 6,000

**Approval Tiers** — Min $ · Max $ · Approver 1 email · Approver 2 email (blank = single)
Seed (demo uses owner plus-addresses so all mail stays in one inbox):
0–999.99 → owner+manager@ · 1,000–4,999.99 → owner+director@ · 5,000+ → owner+director@ then owner+finance@

**Dashboard** — formulas/charts only: counts by status, approved spend by budget line, avg approval time

**AI Log** — same as other demos

## AI output schema
```json
{ "budget_line": "one of the Budget lines", "summary": "<= 20 words", "confidence": 0.0,
  "concerns": "string or null (e.g. 'description vague', 'looks like recurring subscription')" }
```

## Security
- Approve/Reject links carry an HMAC token (`Utilities.computeHmacSha256Signature`) of
  requestId + approverEmail + action, signed with a secret in Script Properties.
- Web app verifies token AND that the request is still pending at that approver's step.
- Web app deploys "Execute as: me", "Who has access: anyone with Google account" for demo.

## Acceptance criteria
- [ ] `setup()` creates the Form, linked Sheet, all tabs, Doc template, triggers; logs the web app deploy steps
- [ ] `seedSampleData()` submits 8 fake responses via FormApp (`createResponse().submit()`)
- [ ] Missing-info path emails requester and resumes when they resubmit (match by email + description)
- [ ] Two-tier approval works in order; reject at any tier ends the flow
- [ ] Clicking a link twice shows "already decided" and changes nothing
- [ ] Reminders only for items pending > 48h at the current step, max one per day
- [ ] Budget `Spent` updates only on final approval
