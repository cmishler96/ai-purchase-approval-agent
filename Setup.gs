/**
 * One-time (re-runnable) setup: Form + linked Sheet, tabs with seed data, PDF template, Drive folder,
 * HMAC secret, and triggers. Safe to run again: existing pieces are reused, triggers are replaced.
 */

function setup() {
  const props = PropertiesService.getScriptProperties();
  const ss = getOrCreateSpreadsheet_();
  const form = getOrCreateForm_(ss);

  Object.keys(HEADERS).forEach(name => ensureTab_(ss, name, HEADERS[name]));
  formatRequestsTab_(ss);
  seedBudget_(ss);
  seedTiers_(ss);
  buildDashboard_(ss);
  const def = ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 1 && def.getLastRow() === 0) ss.deleteSheet(def);

  if (!props.getProperty('HMAC_SECRET')) {
    props.setProperty('HMAC_SECRET', Utilities.getUuid() + Utilities.getUuid());
  }
  getOrCreateTemplate_();
  getOrCreatePdfFolder_();
  installTriggers_(ss);

  const webAppUrl = getWebAppUrl_();
  console.log('Setup complete.\n' +
    '  Sheet: ' + ss.getUrl() + '\n' +
    '  Form (share this): ' + form.getPublishedUrl() + '\n' +
    '  Form editor: ' + form.getEditUrl() + '\n' +
    '  Triggers: handleSubmission on form submit; sendReminders daily at ' + CONFIG.REMINDER_HOUR + ':00\n' +
    (webAppUrl
      ? '  Web app (Approve/Reject links): ' + webAppUrl
      : '  Web app: NOT DEPLOYED. Deploy > New deployment > Web app (Execute as: Me; Who has access: ' +
        'Anyone with Google account), then add Script Property WEBAPP_URL = the /exec URL.') + '\n' +
    (props.getProperty('ANTHROPIC_API_KEY')
      ? '  ANTHROPIC_API_KEY: set'
      : '  ANTHROPIC_API_KEY: MISSING — add it under Project Settings > Script Properties'));
}

function getOrCreateSpreadsheet_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (err) {
      console.warn('Stored SHEET_ID could not be opened; creating a new sheet. ' + err);
    }
  }
  const ss = SpreadsheetApp.create(CONFIG.SHEET_NAME);
  props.setProperty('SHEET_ID', ss.getId());
  return ss;
}

function getOrCreateForm_(ss) {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FORM_ID');
  if (id) {
    try { return FormApp.openById(id); } catch (err) {
      console.warn('Stored FORM_ID could not be opened; creating a new form. ' + err);
    }
  }
  const form = FormApp.create('Purchase Request')
    .setDescription('Submit a purchase request. You will get an email when it is approved, rejected, or if ' +
      'anything is missing.')
    .setCollectEmail(false)
    .setAllowResponseEdits(false);

  form.addTextItem().setTitle(F.NAME).setRequired(true);
  form.addTextItem().setTitle(F.EMAIL).setRequired(true)
    .setValidation(FormApp.createTextValidation().requireTextIsEmail().build());
  form.addParagraphTextItem().setTitle(F.DESCRIPTION).setRequired(true)
    .setHelpText('What are you buying? Include quantities.');
  form.addTextItem().setTitle(F.VENDOR).setHelpText('Who are you buying from?');
  form.addTextItem().setTitle(F.COST).setRequired(true).setHelpText('Numbers only, e.g. 1250.00');
  form.addDateItem().setTitle(F.NEEDED_BY).setRequired(true);
  form.addParagraphTextItem().setTitle(F.PURPOSE).setRequired(true);
  // Apps Script cannot create file-upload questions; a link to the quote works the same for the demo.
  form.addTextItem().setTitle(F.QUOTE).setHelpText('Optional: link to a quote (Drive, email, or vendor site).');

  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  props.setProperty('FORM_ID', form.getId());
  return form;
}

function ensureTab_(ss, name, headers) {
  const sheet = ss.getSheetByName(name) || ss.insertSheet(name);
  if (sheet.getLastRow() === 0 && headers.length) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function formatRequestsTab_(ss) {
  const sheet = ss.getSheetByName(TABS.REQUESTS);
  sheet.getRange(2, col_('Amount'), sheet.getMaxRows() - 1, 1).setNumberFormat('$#,##0.00');
  sheet.getRange(2, col_('AI Confidence'), sheet.getMaxRows() - 1, 1).setNumberFormat('0.00');
  // Bookkeeping columns for reminders; hidden to keep the status trail readable.
  sheet.hideColumns(col_('Routed At'), 2);
}

function seedBudget_(ss) {
  const sheet = ss.getSheetByName(TABS.BUDGET);
  if (sheet.getLastRow() > 1) return;
  const lines = [['Instructional Supplies', 15000], ['Technology', 25000], ['Facilities', 30000],
    ['Food Service', 12000], ['Professional Services', 20000], ['Office & Admin', 8000], ['Events', 6000]];
  const rows = lines.map((l, i) => [l[0], l[1], 0, `=B${i + 2}-C${i + 2}`]);
  sheet.getRange(2, 1, rows.length, 4).setValues(rows);
  sheet.getRange(2, 2, rows.length, 3).setNumberFormat('$#,##0.00');
  sheet.autoResizeColumns(1, 4);
}

function seedTiers_(ss) {
  const sheet = ss.getSheetByName(TABS.TIERS);
  if (sheet.getLastRow() > 1) return;
  // Owner plus-addresses keep every demo email in one inbox.
  sheet.getRange(2, 1, 3, 4).setValues([
    [0, 999.99, plusAddress_('manager'), ''],
    [1000, 4999.99, plusAddress_('director'), ''],
    [5000, '', plusAddress_('director'), plusAddress_('finance')],
  ]);
  sheet.getRange(2, 1, 3, 2).setNumberFormat('$#,##0.00');
  sheet.autoResizeColumns(1, 4);
}

/** Dashboard: formulas only, so it updates live as requests move. */
function buildDashboard_(ss) {
  const sheet = ss.getSheetByName(TABS.DASHBOARD);
  if (sheet.getLastRow() > 0) return;
  const R = `'${TABS.REQUESTS}'!`;
  const c = h => colLetter_(h);
  const status = `${R}${c('Status')}2:${c('Status')}`;

  sheet.getRange('A1').setValue('Purchase Approval Dashboard').setFontSize(16).setFontWeight('bold');

  sheet.getRange('A3:B3').setValues([['Requests by status', 'Count']]).setFontWeight('bold');
  const statuses = [STATUS.NEEDS_INFO, STATUS.PENDING, STATUS.APPROVED, STATUS.REJECTED];
  sheet.getRange(4, 1, statuses.length, 2).setValues(statuses.map(s => [s, `=COUNTIF(${status},"${s}")`]));

  sheet.getRange('A9:B9').setValues([['Average approval time (hours)', '']]).setFontWeight('bold');
  sheet.getRange('B9').setFormula(
    `=IFERROR(ROUND(AVERAGE(FILTER(ARRAYFORMULA(IF(${R}${c('Decided 2')}2:${c('Decided 2')}<>"",` +
    `${R}${c('Decided 2')}2:${c('Decided 2')},${R}${c('Decided 1')}2:${c('Decided 1')})-` +
    `${R}${c('Submitted')}2:${c('Submitted')}),${status}="${STATUS.APPROVED}"))*24,1),"—")`);

  sheet.getRange('D3:E3').setValues([['Approved spend by budget line', 'Spent']]).setFontWeight('bold');
  sheet.getRange('D4').setFormula(`='${TABS.BUDGET}'!A2:A`);
  sheet.getRange('E4').setFormula(`=ARRAYFORMULA(IF(D4:D="",,SUMIFS(${R}${c('Amount')}2:${c('Amount')},` +
    `${R}${c('Budget Line')}2:${c('Budget Line')},D4:D,${status},"${STATUS.APPROVED}")))`);
  sheet.getRange('E4:E20').setNumberFormat('$#,##0.00');

  sheet.insertChart(sheet.newChart()
    .setChartType(Charts.ChartType.BAR)
    .addRange(sheet.getRange('D3:E10'))
    .setNumHeaders(1)
    .setOption('title', 'Approved spend by budget line')
    .setOption('legend', { position: 'none' })
    .setPosition(12, 1, 0, 0)
    .build());
  sheet.autoResizeColumns(1, 5);
}

/** Google Doc template with {{PLACEHOLDERS}}; copied and filled for each request PDF. */
function getOrCreateTemplate_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('TEMPLATE_ID');
  if (id) {
    try { DocumentApp.openById(id); return id; } catch (err) { /* recreate */ }
  }
  const doc = DocumentApp.create('Purchase Request Template (demo)');
  const body = doc.getBody();
  body.appendParagraph('Purchase Request {{REQUEST_ID}}').setHeading(DocumentApp.ParagraphHeading.HEADING1);
  body.appendParagraph('Submitted {{SUBMITTED}}').setForegroundColor('#5f6368');
  const table = body.appendTable([
    ['Requester', '{{REQUESTER}} ({{EMAIL}})'],
    ['Item / service', '{{DESCRIPTION}}'],
    ['Vendor', '{{VENDOR}}'],
    ['Estimated cost', '{{AMOUNT}}'],
    ['Needed by', '{{NEEDED_BY}}'],
    ['Budget line', '{{BUDGET_LINE}}'],
    ['Budget status', '{{BUDGET_STATUS}}'],
    ['Approval route', '{{APPROVERS}}'],
  ]);
  table.setBorderColor('#dadce0');
  for (let r = 0; r < table.getNumRows(); r++) {
    table.getCell(r, 0).setBackgroundColor('#f1f3f4').setWidth(130).editAsText().setBold(true);
  }
  body.appendParagraph('Purpose / justification').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph('{{PURPOSE}}');
  body.appendParagraph('AI summary').setHeading(DocumentApp.ParagraphHeading.HEADING3);
  body.appendParagraph('{{SUMMARY}}');
  body.appendParagraph('Reviewer notes: {{CONCERNS}}').setForegroundColor('#5f6368');
  body.appendParagraph('Generated automatically by the Purchase Approval Agent.')
    .setForegroundColor('#9aa0a6').setFontSize(8);
  // Body starts with an empty paragraph; drop it so the title is first.
  const first = body.getChild(0);
  if (first.getType() === DocumentApp.ElementType.PARAGRAPH && !first.asParagraph().getText()) first.removeFromParent();
  doc.saveAndClose();
  props.setProperty('TEMPLATE_ID', doc.getId());
  return doc.getId();
}

function getOrCreatePdfFolder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('PDF_FOLDER_ID');
  if (id) {
    try {
      const f = DriveApp.getFolderById(id);
      if (!f.isTrashed()) return f;
    } catch (err) { /* recreate */ }
  }
  const folder = DriveApp.createFolder('Purchase Requests');
  props.setProperty('PDF_FOLDER_ID', folder.getId());
  return folder;
}

function installTriggers_(ss) {
  const handlers = ['handleSubmission', 'sendReminders'];
  ScriptApp.getProjectTriggers()
    .filter(t => handlers.indexOf(t.getHandlerFunction()) !== -1)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('handleSubmission').forSpreadsheet(ss).onFormSubmit().create();
  ScriptApp.newTrigger('sendReminders').timeBased().everyDays(1).atHour(CONFIG.REMINDER_HOUR).create();
}
