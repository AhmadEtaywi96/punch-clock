const { google } = require('googleapis');

let sheetsClient;

function getSheets() {
  if (sheetsClient) return sheetsClient;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // .env files store the key on one line with literal "\n" sequences.
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key || !process.env.GOOGLE_SHEET_ID) {
    throw new Error('Google Sheets environment variables are missing');
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

async function appendRow(row) {
  const tab = process.env.SHEET_TAB || 'Sheet1';
  const res = await getSheets().spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: `${tab}!A:E`,
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
  return res.data.updates?.updatedRange;
}

module.exports = { appendRow };
