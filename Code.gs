/**
 * BBT app — Google Apps Script backend.
 *
 * Setup:
 *  1. Your Google Sheet needs a header row with columns named Timestamp, BBT and
 *     (optionally) Notes, Marks and Ov pain, on any tab. Marks holds days you set as a
 *     shift or drop by hand; Ov pain holds L, R or both. A Form responses tab works too.
 *  2. Extensions → Apps Script, paste this whole file in place of Code.gs.
 *  3. Project Settings (gear icon) → Script properties → Add property:
 *       Property: TOKEN    Value: a passphrase of your own (letters, numbers, dashes)
 *     and click "Save script properties".
 *  4. Deploy → New deployment → type "Web app":
 *       Execute as: Me      Who has access: Anyone
 *     Copy the URL ending in /exec. Enter it, plus your TOKEN, in the app's settings.
 *  5. After editing this script: Deploy → Manage deployments → pencil → Version: New version → Deploy.
 *
 * Troubleshooting: open  <your /exec URL>?debug=1&token=<your token>  in a browser.
 * It reports which tab and columns the script found and how many readings it can read.
 *
 * Your token never appears in this file or in the app's code — only in Script
 * properties and on your own phone.
 */

const SHEET_NAME = '';   // leave blank to find the tab with a "BBT" header automatically

// ---------- helpers ----------
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function authorized_(token) {
  const real = (PropertiesService.getScriptProperties().getProperty('TOKEN') || '').trim();
  return !!real && String(token || '').trim() === real;
}

// Finds the tab and the Timestamp / BBT / Notes columns by their header names.
function layout_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const tabs = SHEET_NAME ? [ss.getSheetByName(SHEET_NAME)] : ss.getSheets();
  for (const sh of tabs) {
    if (!sh || sh.getLastColumn() < 2) continue;
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(h => String(h).trim().toLowerCase());
    const temp = head.findIndex(h => h === 'bbt' || h === 'temp' || h === 'temperature');
    if (temp < 0) continue;
    let ts = head.findIndex(h => h === 'timestamp' || h === 'date');
    if (ts < 0) ts = 0;
    const note = head.findIndex(h => h === 'notes' || h === 'note');
    const mark = head.findIndex(h => h === 'marks' || h === 'mark');
    const pain = head.findIndex(h => h === 'ov pain' || h === 'ovulation pain' || h === 'pain');
    return { sh, ts, temp, note, mark, pain, head };
  }
  return null;
}

// Accepts a real date cell, or text like "12/3/2024 8:00:00", "10/30/2026" or "2026-10-30 07:05".
function parseStamp_(v, tz) {
  if (v instanceof Date && !isNaN(v)) {
    return { date: Utilities.formatDate(v, tz, 'yyyy-MM-dd'), time: Utilities.formatDate(v, tz, 'HH:mm') };
  }
  const s = String(v || '').trim();
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2}))?/.exec(s);
  if (m) {
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return { date: `${y}-${pad_(m[1])}-${pad_(m[2])}`, time: m[4] ? `${pad_(m[4])}:${m[5]}` : '00:00' };
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T]+(\d{1,2}):(\d{2}))?/.exec(s);
  if (m) return { date: `${m[1]}-${pad_(m[2])}-${pad_(m[3])}`, time: m[4] ? `${pad_(m[4])}:${m[5]}` : '00:00' };
  return null;
}
function pad_(n) { return String(n).padStart(2, '0'); }

function readRows_(L, tz) {
  const values = L.sh.getDataRange().getValues().slice(1);
  const rows = [];
  values.forEach((r, i) => {
    const st = parseStamp_(r[L.ts], tz), temp = parseFloat(String(r[L.temp]).replace(',', '.'));
    const mark = L.mark >= 0 ? String(r[L.mark] || '').trim().toLowerCase() : '';
    const pain = L.pain >= 0 ? String(r[L.pain] || '').trim() : '';
    if (!st || (!isFinite(temp) && !mark && !pain)) return;   // rows with only a mark or pain are kept too
    rows.push({ date: st.date, time: st.time, temp: isFinite(temp) ? temp : null,
      note: L.note >= 0 ? String(r[L.note] || '') : '', mark: mark, pain: pain, _row: i + 2 });
  });
  return rows;
}

// ---------- GET: load readings ----------
function doGet(e) {
  const tz = Session.getScriptTimeZone();
  if (e.parameter.debug) {
    const L = layout_(), out = { version: 'debug-2', tokenMatch: authorized_(e.parameter.token) };
    if (!out.tokenMatch) return json_(out);
    if (!L) { out.problem = 'No tab has a column headed BBT, Temp or Temperature in row 1'; return json_(out); }
    const raw = L.sh.getRange(2, L.ts + 1, Math.min(3, Math.max(1, L.sh.getLastRow() - 1)), 1).getValues().map(r => r[0]);
    Object.assign(out, { tab: L.sh.getName(), headers: L.head, columns: { timestamp: L.ts + 1, bbt: L.temp + 1, notes: L.note + 1, marks: L.mark + 1, ovPain: L.pain + 1 },
      firstTimestamps: raw.map(v => (v instanceof Date ? 'date: ' : 'text: ') + String(v)), readingsFound: readRows_(L, tz).length });
    return json_(out);
  }
  if (!authorized_(e.parameter.token)) return json_({ error: 'unauthorized' });
  const L = layout_();
  if (!L) return json_({ error: 'no tab with a BBT column found' });
  return json_({ rows: readRows_(L, tz).map(({ _row, ...r }) => r) });
}

// ---------- POST: save a reading ----------
// Body (text/plain JSON): { token, date:'yyyy-MM-dd', time:'HH:mm', temp, note, mark, pain }
// Only date is required. temp/time/note update the reading; mark and pain are written
// whenever they are included ('' clears them). A date that already has a row is updated in place.
function doPost(e) {
  let body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: 'bad request' }); }
  if (!authorized_(body.token)) return json_({ ok: false, error: 'unauthorized' });

  const temp = parseFloat(body.temp), hasTemp = isFinite(temp);
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(body.date || '');
  const hasMark = 'mark' in body, hasPain = 'pain' in body;
  const mark = String(body.mark || '').trim().toLowerCase(), pain = String(body.pain || '').trim();
  if (!dm || (!hasTemp && !hasMark && !hasPain)) return json_({ ok: false, error: 'need date and temp' });
  const tm = /^(\d{1,2}):(\d{2})/.exec(body.time || '') || [null, '0', '0'];
  const ts = new Date(+dm[1], +dm[2] - 1, +dm[3], +tm[1], +tm[2]);   // script's time zone
  const note = String(body.note || '');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const L = layout_();
    if (!L) return json_({ ok: false, error: 'no tab with a BBT column found' });
    if (mark && L.mark < 0) return json_({ ok: false, error: 'add a column headed Marks to the Sheet' });
    if (pain && L.pain < 0) return json_({ ok: false, error: 'add a column headed Ov pain to the Sheet' });
    const tz = Session.getScriptTimeZone();
    const existing = readRows_(L, tz).find(r => r.date === body.date);
    if (existing) {
      const at = col => L.sh.getRange(existing._row, col + 1);
      if (hasTemp) { at(L.ts).setValue(ts); at(L.temp).setValue(temp); }
      if (hasTemp && note && L.note >= 0) at(L.note).setValue(note);
      if (hasMark && L.mark >= 0) at(L.mark).setValue(mark);
      if (hasPain && L.pain >= 0) at(L.pain).setValue(pain);
    } else if (hasTemp || mark || pain) {
      const row = new Array(L.sh.getLastColumn()).fill('');
      row[L.ts] = hasTemp ? ts : new Date(+dm[1], +dm[2] - 1, +dm[3]);
      if (hasTemp) row[L.temp] = temp;
      if (L.note >= 0) row[L.note] = hasTemp ? note : '';
      if (L.mark >= 0) row[L.mark] = mark;
      if (L.pain >= 0) row[L.pain] = pain;
      L.sh.appendRow(row);
    }
  } finally {
    lock.releaseLock();
  }
  return json_({ ok: true });
}
