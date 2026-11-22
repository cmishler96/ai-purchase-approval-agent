/**
 * Submits fake purchase requests through the Form so the real trigger path runs.
 * Requester emails are owner plus-addresses so all demo mail stays in one inbox.
 * People, vendors, and amounts are fictional. Dates are relative to the day you seed.
 */

function sampleRequests_() {
  const plus = plusAddress_;
  return [
    { name: 'Jordan Ellis', email: plus('jordan'), desc: '30 graphing calculators for Algebra II', vendor: 'Brightline Office Supply',
      cost: '2,340', byDays: 19, why: 'Current set is broken or missing; needed for the winter unit.' },
    { name: 'Sam Torres', email: plus('sam'), desc: 'HDMI adapters and spare projector lamp, Room 110', vendor: 'Ridgeback IT Services',
      cost: '186.50', byDays: 3, why: 'Projector is unusable; teachers need it working Monday.' },
    { name: 'Maya Chen', email: plus('maya'), desc: 'Catering for family math night (~120 people)', vendor: 'Northwind Catering Co.',
      cost: '1,450', byDays: 13, why: 'Family engagement event in the cafeteria.' },
    // Missing vendor → Needs Info path (run seedResubmission() afterwards to show it resume)
    { name: 'Chris Patel', email: plus('chris'), desc: 'Replacement ceiling tiles after leak, Room 204', vendor: '',
      cost: '780', byDays: 7, why: 'Water damage repair; tiles are stained and sagging.' },
    // Large → two approvers (director, then finance). Vendor/item mismatch should draw an AI concern.
    { name: 'Alex Rivera', email: plus('alex'), desc: '25 Chromebooks for the 6th grade cart', vendor: 'Pixelwise Software',
      cost: '8,975', byDays: 45, why: 'Replace end-of-life devices before spring testing.' },
    // Over budget for its line (Events is seeded at $6,000) and two approvers
    { name: 'Taylor Brooks', email: plus('taylor'), desc: 'Spring showcase stage rental and sound system', vendor: 'Harbor Print & Sign',
      cost: '6,800', byDays: 110, why: 'Annual spring showcase for families.' },
    // Recurring subscription → AI concern
    { name: 'Jordan Ellis', email: plus('jordan'), desc: 'Annual subscription to reading assessment platform', vendor: 'Pixelwise Software',
      cost: '1,200', byDays: 10, why: 'Required for progress monitoring this year.' },
    // Vague → AI concern
    { name: 'Riley Kim', email: plus('riley'), desc: 'misc stuff for the office', vendor: 'QuickShip Online',
      cost: '300', byDays: 9, why: 'need it' },
  ];
}

function seedSampleData() {
  const form = getDemoForm_();
  sampleRequests_().forEach(r => {
    submitRequest_(form, r);
    Utilities.sleep(5000); // give the trigger room; the lock queues anything that overlaps
  });
  console.log('Submitted 8 requests. The form trigger processes them over the next minute or two — ' +
    'watch the Requests tab and your inbox.');
}

/** Chris resubmits with the vendor filled in; the agent resumes the original Needs Info request. */
function seedResubmission() {
  const chris = sampleRequests_().find(r => r.name === 'Chris Patel');
  submitRequest_(getDemoForm_(), Object.assign({}, chris, { vendor: 'Cascade Facilities Group' }));
  console.log('Resubmitted Chris Patel\'s request with a vendor. It should move from Needs Info to Pending Approval.');
}

/** Backdates "Routed At" on pending requests by 3 days so sendReminders() has something to nudge. */
function simulateStaleRequests() {
  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 3600 * 1000);
  const pending = readRequests_().filter(r => r['Status'] === STATUS.PENDING);
  pending.forEach(r => updateRequest_(r['Request ID'], { 'Routed At': threeDaysAgo, 'Last Reminder': '' }));
  console.log(`${pending.length} pending request(s) backdated. Run sendReminders() now.`);
}

/**
 * Resets the demo for a fresh recording: clears form responses, the Requests and AI Log tabs, and Budget spend,
 * and trashes generated request PDFs. Trash is recoverable for 30 days.
 */
function resetDemo() {
  const form = getDemoForm_();
  form.deleteAllResponses();
  const ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
  const responses = ss.getSheets().find(s => s.getFormUrl && s.getFormUrl());
  if (responses && responses.getLastRow() > 1) responses.deleteRows(2, responses.getLastRow() - 1);

  [TABS.REQUESTS, TABS.AI_LOG].forEach(name => {
    const sheet = getSheet_(name);
    if (sheet.getLastRow() > 1) sheet.deleteRows(2, sheet.getLastRow() - 1);
  });
  const budget = getSheet_(TABS.BUDGET);
  if (budget.getLastRow() > 1) budget.getRange(2, 3, budget.getLastRow() - 1, 1).setValue(0);

  let trashed = 0;
  const files = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('PDF_FOLDER_ID')).getFiles();
  while (files.hasNext()) { files.next().setTrashed(true); trashed++; }
  console.log(`resetDemo: cleared responses, requests, AI log, and budget spend; trashed ${trashed} PDF(s).`);
}

function getDemoForm_() {
  const formId = PropertiesService.getScriptProperties().getProperty('FORM_ID');
  if (!formId) throw new Error('Run setup() first.');
  return FormApp.openById(formId);
}

function submitRequest_(form, r) {
  const byTitle = {};
  form.getItems().forEach(it => { byTitle[it.getTitle()] = it; });
  const resp = form.createResponse();
  const add = (title, value) => {
    if (value === '' || value == null) return;
    const item = byTitle[title];
    if (!item) throw new Error('Form question missing: ' + title);
    switch (item.getType()) {
      case FormApp.ItemType.TEXT: resp.withItemResponse(item.asTextItem().createResponse(String(value))); break;
      case FormApp.ItemType.PARAGRAPH_TEXT: resp.withItemResponse(item.asParagraphTextItem().createResponse(String(value))); break;
      case FormApp.ItemType.DATE: resp.withItemResponse(item.asDateItem().createResponse(value)); break;
      default: throw new Error(`Unsupported question type for "${title}": ${item.getType()}`);
    }
  };
  const neededBy = new Date();
  neededBy.setDate(neededBy.getDate() + r.byDays);
  add(F.NAME, r.name);
  add(F.EMAIL, r.email);
  add(F.DESCRIPTION, r.desc);
  add(F.VENDOR, r.vendor);
  add(F.COST, r.cost);
  add(F.NEEDED_BY, neededBy);
  add(F.PURPOSE, r.why);
  resp.submit();
}
