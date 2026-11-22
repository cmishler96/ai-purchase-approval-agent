# Changelog — Demo 03 Purchase Approval Agent

## 2026-11-21 — Initial release

### Features
- `setup()` (now in `Setup.gs`) creates:
  - the "Purchase Request" Form, linked to a new `Purchase Approval Demo` sheet;
  - the Requests, Budget (Remaining is a formula), Approval Tiers (owner plus-addresses) and AI Log tabs, plus a
    formula-driven Dashboard with counts by status, average approval hours, approved spend by line and a chart;
  - the Doc template with `{{PLACEHOLDERS}}`, the `Purchase Requests` Drive folder and the HMAC secret;
  - both triggers (form submit, and daily reminders at 8 AM).

  You can run it again safely: existing pieces are reused and triggers are replaced.
- The sheet helpers are complete: PR-0001-style IDs, header-based reads and writes, status and notes, decisions
  with timestamps, budget lines, remaining funds, spend (on final approval only), tier lookup, and PDF generation.
- Missing-info path: the requester gets a bulleted list of what's missing and a link to the form. When they
  resubmit with the **same email and a similar description** (containment or ≥50% word overlap), the original request
  is updated and continues instead of creating a duplicate.
- Web app: verifies the HMAC token for that approver, step and action, and that it's that step's turn (step 2 can't
  act before step 1 approves). A second click shows "Already decided" and changes nothing. Approve at step 1 routes
  to step 2, reject at any step ends the flow, and final approval updates the budget. Result pages are styled.
- Emails:
  - Approvers get a summary table, warnings for over-budget, uncoded and AI-concern requests, a PDF link, and
    green/red buttons.
  - Requesters are told what info is missing, and later the outcome, with the decision trail and next steps.
- Reminders: a request pending more than 48h at its current step gets a "Reminder:" email to the current approver,
  at most once per day. They're tracked in the hidden Routed At / Last Reminder columns.

### Reliability fixes
- The form-submit lock wait went from 10s to 4 min. Eight back-to-back submissions each make a Claude call and a PDF,
  and with a 10s wait the later ones would time out and be silently dropped.
- If the Claude call fails, the request is still routed, with "budget line needs manual coding", instead of getting
  stuck.
- PDF placeholders are filled with literal text inserts. `replaceText` treats `$` specially, which would garble
  amounts like "$1,450.00".
- Token check uses a constant-time comparison. The approver email is lowercased inside the signature.

### Claude API
- Shared helper (API `2026-10-21`, structured outputs, retries, AI Log).
- `claude-sonnet-5-5` at `effort: "low"`. `budget_line` is an enum built from the Budget tab.
- Server-side refusal fallback is on. Turn it off with `CONFIG.USE_FALLBACKS = false`.

### Web app deployment, automated
- `clasp create-deployment` deploys the web app, then the `/exec` URL is written into `Deployment.gs`
  (`WEBAPP_URL_DEFAULT`), and the same deployment is updated so the URL never changes. A `WEBAPP_URL` Script Property
  still overrides it.
- The deployment ID is saved in `.deployment-id`, for redeploying after code changes.

### Sample data
- Each response is submitted through FormApp with the right item type: text, paragraph, or date. "Needed by" dates
  are relative to the seed day.
- Added demo helpers:
  - `seedResubmission()`: Chris resubmits with a vendor, which shows Needs Info → Pending.
  - `simulateStaleRequests()`: backdates pending requests so `sendReminders()` has something to send.
  - `resetDemo()`: clears responses, requests, AI log and budget spend, and trashes the PDFs.
- "Amazon" was replaced with the fictional "QuickShip Online", per the fake-data rule.

### Scopes
- `gmail.send` was replaced with `script.send_mail`. Mail goes through MailApp, a narrower scope, since this demo
  only sends.

### Design decisions
- **Quote attachment**: Apps Script can't create file-upload questions, so the form has an optional
  "Quote link" text field instead. You can add a real file-upload question by hand in the Form editor.
- **Extra columns** on Requests: `Purpose`, which the approver email and PDF need and the spec's columns don't
  store, plus hidden `Routed At` / `Last Reminder`, which the spec itself suggests.
- **Email safety**: mail goes only to the owner or the owner's plus-addresses. Any other
  address is redirected to the owner, with a banner saying who it was meant for.
- **Vendor is optional on the form**, so the missing-info path can happen naturally. The agent still treats it as
  required.
