const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const pool = require('../config/database');

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

function getAuth() {
  // Production: credentials supplied as a JSON string env var (no file needed on disk)
  if (process.env.GOOGLE_CREDENTIALS_JSON) {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
    return new google.auth.GoogleAuth({ credentials, scopes: SCOPES });
  }

  // Local development: fall back to the credentials file if it exists
  const credFile = path.join(__dirname, '../google-credentials.json');
  if (fs.existsSync(credFile)) {
    return new google.auth.GoogleAuth({ keyFile: credFile, scopes: SCOPES });
  }

  throw new Error('No Google credentials found. Set GOOGLE_CREDENTIALS_JSON env var or provide google-credentials.json');
}

const fmt = (n) =>
  n === '' || n === null || n === undefined
    ? ''
    : Math.round(Number(n)).toLocaleString('en-NG');

const fmtMoney = (n) =>
  n === '' || n === null || n === undefined
    ? ''
    : Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Appends one row to the Google Sheet after a successful submission.
 * Columns mirror the admin CSV export exactly (A–AA).
 * Non-fatal: logs errors but never throws.
 */
async function appendSubmissionToSheet(formData, submissionData) {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!spreadsheetId) {
      console.warn('GOOGLE_SHEETS_SPREADSHEET_ID not configured — skipping Sheets append');
      return;
    }

    // Resolve stockbroker name from ID
    let stockbrokerName = '';
    if (formData.stockbroker) {
      try {
        const r = await pool.query('SELECT name FROM stockbrokers WHERE id = $1', [formData.stockbroker]);
        if (r.rows.length > 0) stockbrokerName = r.rows[0].name || '';
      } catch (_) { }
    }

    // Resolve shareholder address
    let shareholderAddress = '';
    if (formData.shareholder_id) {
      try {
        const r = await pool.query('SELECT address FROM shareholders WHERE id = $1', [formData.shareholder_id]);
        if (r.rows.length > 0) shareholderAddress = r.rows[0].address || '';
      } catch (_) { }
    }

    // Name split
    const nameParts = (formData.name || '').trim().split(/\s+/);
    const surname = nameParts[0] || '';
    const otherNames = nameParts.slice(1).join(' ');

    // Column calculations (matching the CSV export logic)
    const allottedRights = Math.round(parseFloat(formData.rights_issue || 0));
    let acceptedRights = Math.round(parseFloat(formData.shares_accepted || 0));
    const additionalShares = Math.round(parseFloat(formData.additional_shares || 0));

    // Fix: If full acceptance, accepted rights should equal allotted rights
    if (formData.action_type === 'full_acceptance') {
      acceptedRights = allottedRights;
    }

    const fullAcceptance = allottedRights === acceptedRights ? acceptedRights : 0;
    const partialAcceptance = allottedRights > acceptedRights ? acceptedRights : 0;
    const renouncedRights = Math.max(0, allottedRights - acceptedRights); // floor at 0, never negative
    const acceptedAndPaidFor = acceptedRights + additionalShares;

    const value = parseFloat(formData.amount_payable || 0);
    const amountPaid = parseFloat(formData.payment_amount || 0);
    const verified = amountPaid > 0 ? amountPaid : value;

    const paymentMethod =
      formData.additional_payment_cheque_number || formData.partial_payment_cheque_number
        ? 'CHEQUE'
        : 'TRANSFER';

    const paymentConfirmation =
      submissionData.payment_status === 'successful' ? 'CONFIRMED' : 'PENDING';

    const date = new Date().toLocaleDateString('en-GB').replace(/\//g, '.');
    const phone = formData.mobile_phone || formData.daytime_phone || '';

    const row = [
      'SHAREHOLDER RIGHTS ACCEPTANCE',          // A
      stockbrokerName,                           // B
      submissionData.id,                         // C  S/No
      formData.reg_account_number || '',         // D
      formData.bvn || '',                        // E
      formData.chn || '',                        // F
      phone,                                     // G
      formData.email || '',                      // H
      fmt(allottedRights),                       // I
      fmt(acceptedRights),                       // J
      fmt(fullAcceptance),                       // K
      fmt(partialAcceptance),                    // L
      fmt(renouncedRights),                      // M
      additionalShares ? fmt(additionalShares) : '', // N
      fmt(acceptedAndPaidFor),                   // O
      formData.name || '',                       // P
      fmtMoney(value),                           // Q
      amountPaid ? fmtMoney(amountPaid) : '',    // R
      fmtMoney(verified),                        // S
      paymentMethod,                             // T
      surname,                                   // U
      otherNames,                                // V
      shareholderAddress,                        // W
      formData.bank_name_edividend || '',        // X
      formData.account_number || '',             // Y
      date,                                      // Z
      paymentConfirmation,                       // AA
    ];

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    await sheets.spreadsheets.values.append({
      spreadsheetId,
      range: 'LASACO Submissions!A:AA',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [row] },
    });

    console.log(`Google Sheets: row appended for submission #${submissionData.id}`);
  } catch (err) {
    console.error('Google Sheets append failed:', err.message);
    // Non-fatal — submission must not fail because of this
  }
}

/**
 * Finds the row for the given submission ID (column C) and updates
 * column AA (payment confirmation) to CONFIRMED.
 * Non-fatal: logs errors but never throws.
 */
async function updateSheetPaymentStatus(submissionId) {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    if (!spreadsheetId) return;

    const auth = getAuth();
    const sheets = google.sheets({ version: 'v4', auth });

    // Read column C to find the row that matches submissionId
    const readRes = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: 'LASACO Submissions!C:C',
    });

    const rows = readRes.data.values || [];
    // rows[0] is the header row; submission IDs start at index 1
    let targetRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) === String(submissionId)) {
        targetRowIndex = i + 1; // Sheets rows are 1-indexed
        break;
      }
    }

    if (targetRowIndex === -1) {
      console.warn(`Google Sheets: no row found for submission #${submissionId}`);
      return;
    }

    // Update column AA on that row
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `LASACO Submissions!AA${targetRowIndex}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [['CONFIRMED']] },
    });

    console.log(`Google Sheets: payment confirmation updated to CONFIRMED for submission #${submissionId} (row ${targetRowIndex})`);
  } catch (err) {
    console.error('Google Sheets update failed:', err.message);
  }
}

module.exports = { appendSubmissionToSheet, updateSheetPaymentStatus };
