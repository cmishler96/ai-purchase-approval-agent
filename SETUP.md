# Demo 03 setup: what you do by hand

Create, push, and deploy the project with clasp (see the Quick start in README.md). The web app URL goes in
`Deployment.gs` or the `WEBAPP_URL` Script Property. Then:

## 1. Add the API key
In the Apps Script editor, open **Project Settings (gear) → Script Properties → Add script property**.
Name it `ANTHROPIC_API_KEY`, paste your key, and save.

## 2. Authorize and set up
In the editor, open `Setup.gs`, choose **setup** in the function dropdown, and click **Run**. Approve the consent
screen with **Advanced → Go to Purchase Approval Demo (unsafe) → Allow**. It asks for Forms, Sheets, Docs, Drive,
and sending email as you. The log prints:
- the sheet link,
- the form link (the one requesters would use),
- the form editor link,
- the web app URL.

You must run setup **before clicking any Approve/Reject link**. The web app runs as you, so it needs your
authorization first.

## 3. Demo run
1. `seedSampleData()` (in `SampleData.gs`) submits 8 requests through the real form. The form trigger then
   processes them over about 1–2 minutes. Watch the **Requests** tab fill in.
2. Show what happened:
   - Chris Patel's request is **Needs Info**. Check the "More info needed" email.
   - Alex's Chromebooks ($8,975) need **two approvers**, and the AI flagged that a software vendor is selling hardware.
   - Taylor's stage rental is **over budget**, since Events has $6,000.
   - Riley's "misc stuff" and Jordan's subscription draw AI reviewer notes.
3. Open an "Approval needed" email and click **Approve**. For Alex's request, then open the step-2 email (to
   `+finance`) and approve again. Show the Budget tab's Spent updating only after the final approval.
4. Click the same Approve button again to show **"Already decided"**.
5. Click **Reject** on another request to show the requester notification.
6. `seedResubmission()`: Chris resubmits with a vendor, and PR-0004 moves from Needs Info to Pending Approval.
7. `simulateStaleRequests()`, then `sendReminders()`, shows the "Reminder:" emails.
8. Show the **Dashboard** tab.
9. `resetDemo()` gets you ready to record again.

All demo mail arrives in your own inbox, sent to plus-addresses like `you+director@gmail.com`.

## Pushing code changes later
The web app runs a fixed version. After editing code, push **and** redeploy to the same deployment, so links keep
working. Run these from this folder:
```
clasp push --force
clasp update-deployment <id from .deployment-id>
```
