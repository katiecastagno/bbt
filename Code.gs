/**
 * BBT app — Google Apps Script backend.
 *
 * Setup:
 *  1. In your Google Sheet, put these headers in row 1 of the first tab:
 *       Timestamp | BBT | Notes
 *  2. Extensions → Apps Script, paste this whole file in place of Code.gs.
 *  3. Project Settings (gear icon) → Script properties → Add property:
 *       Property: TOKEN    Value: a long random passphrase of your own
 *  4. Deploy → New deployment → type "Web app":
 *       Execute as: Me      Who has access: Anyone
 *     Copy the URL ending in /exec. Enter it, plus your TOKEN, in the app's settings.
 *  5. If you edit this script later: Deploy → Manage deployments → edit → Version: New version.
 *
 * Your token never appears in this file or in the app's code — only in Script
 * properties and on your own phone.
 */

const SHEET_NAME = '';   // leave blank to use the first tab, or put a tab name here

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function authorized_(token) {
  const real = PropertiesService.getScriptProperties().getProperty('TOKEN');
  return !!real && token === real;
}

// GET ?token=... → { rows: [{ date:'yyyy-MM-dd', time:'HH:mm', temp:97.4, note:'' }, ...] }
function doGet(e) {
  if (!authorized_(e.parameter.token)) return json_({ error: 'unauthorized' });
  const tz = Session.getScriptTimeZone();
  const values = sheet_().getDataRange().getValues().slice(1);
  const rows = [];
  values.forEach(r => {
    const ts = r[0], temp = parseFloat(r[1]);
    if (!(ts instanceof Date) || !isFinite(temp)) return;
    rows.push({
      date: Utilities.formatDate(ts, tz, 'yyyy-MM-dd'),
      time: Utilities.formatDate(ts, tz, 'HH:mm'),
      temp: temp,
      note: String(r[2] || '')
    });
  });
  return json_({ rows: rows });
}

// POST body (text/plain JSON): { token, date:'yyyy-MM-dd', time:'HH:mm', temp, note }
// Saving a date that already has a reading overwrites that row.
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad request' }); }
  if (!authorized_(body.token)) return json_({ ok: false, error: 'unauthorized' });

  const temp = parseFloat(body.temp);
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(body.date || '');
  if (!dm || !isFinite(temp)) return json_({ ok: false, error: 'need date and temp' });
  const tm = /^(\d{1,2}):(\d{2})/.exec(body.time || '') || [null, '0', '0'];
  const ts = new Date(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]);   // script's time zone
  const note = String(body.note || '');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sh = sheet_(), tz = Session.getScriptTimeZone();
    const last = sh.getLastRow();
    const stamps = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
    let row = -1;
    for (let i = 0; i < stamps.length; i++) {
      const v = stamps[i][0];
      if (v instanceof Date && Utilities.formatDate(v, tz, 'yyyy-MM-dd') === body.date) { row = i + 2; break; }
    }
    if (row > 0) {
      const oldNote = sh.getRange(row, 3).getValue();
      sh.getRange(row, 1, 1, 3).setValues([[ts, temp, note || oldNote]]);
    } else {
      sh.appendRow([ts, temp, note]);
    }
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}
