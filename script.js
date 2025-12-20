// Store the Sheet ID in Apps Script PropertiesService under key: SHEET_ID
// (keeps identifiers out of source control).
function getSheetId_() {
  var sheetId = PropertiesService.getScriptProperties().getProperty("SHEET_ID");
  if (!sheetId) {
    throw new Error(
      "Missing script property SHEET_ID. Run initSheetIdFromActiveSpreadsheet() (if container-bound) " +
      "or set it in Project Settings → Script properties."
    );
  }

  return sheetId;
}

var ScheduleSheetName = "Schedule";
var EmailSheetName = "Emails";

// todo have to set up the spreedsheet time zone

// ------------------------
// 1. Get sheet data
// ------------------------
function getSheetData(sheetName) {
  var ss = SpreadsheetApp.openById(getSheetId_());
  var sheet = ss.getSheetByName(sheetName);

  return sheet.getDataRange().getValues(); // 2D array
}

// ------------------------
// 2. Find the next upcoming k
// ------------------------
function getNextUpcomingRow(data) {
  var today = new Date();

  var maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 7); // 7 days from today

  for (var i = 1; i < data.length; i++) { // skip header
    var k = data[i];
    var rowDate = new Date(k[0]);
    if (rowDate >= today && rowDate <= maxDate) {
      return k; // first upcoming date within 7 days
    }
  }

  return null; // no upcoming row within 7 days
}

// ------------------------
// 3. Build email body from k (Option 2: force midday to avoid timezone issues)
// ------------------------
function buildEmailBody(k) {
  if (!k) return "No upcoming events found.";

  // Convert date and force midday to avoid timezone shifts
  var rowDate = new Date(k[0]);
  rowDate.setHours(12, 0, 0, 0); // midday

  var formattedDate = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "EEEE, MMMM d, yyyy");

  var sheetId = getSheetId_();
  var signupUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit?usp=sharing`;

  var htmlBody = `
  <p><strong>Date:</strong> ${formattedDate}</p>
  <p><strong>Description:</strong> ${k[1]}</p>
  <p><strong>Location:</strong> ${k[2]}</p>
  <p><strong>Food Theme:</strong> ${k[3]}</p>
  <p><strong>Childcare Duty:</strong> ${k[4]}</p>
  <p><a href="${signupUrl}">Click here to sign up</a></p>
`;

  return htmlBody;
}

// ------------------------
// 4. Load emails from 'Emails' sheet
// ------------------------
function getEmailRecipients() {
  var data = getSheetData(EmailSheetName);
  var emails = [];

  for (var i = 1; i < data.length; i++) { // skip header
    var email = data[i][0]; // assume column A has email addresses
    if (email) {
      emails.push(email);
    }
  }

  return emails;
}

// Store test recipients in Apps Script PropertiesService under key: TEST_EMAIL_RECIPIENTS
// Value format: comma-separated list (e.g. "a@example.com,b@example.com").
function getTestEmailRecipients_() {
  var value = PropertiesService.getScriptProperties().getProperty("TEST_EMAIL_RECIPIENTS");
  if (!value) {
    throw new Error(
      "Missing script property TEST_EMAIL_RECIPIENTS. Set it in Project Settings → Script properties (comma-separated emails)."
    );
  }

  return value
    .split(",")
    .map(function (e) { return (e || "").toString().trim(); })
    .filter(function (e) { return !!e; });
}

function isValidEmail_(email) {
  if (!email) return false;
  if (email.length > 320) return false;
  // Practical (not fully RFC) validation.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ------------------------
// 5. Send email to multiple recipients
// ------------------------
function sendEmailToRecipients(subject, body, recipients) {
  if (!recipients || recipients.length === 0) {
    Logger.log("No email recipients provided.");
    return;
  }

  var normalizedRecipients = recipients
    .map(function (r) { return (r || "").toString().trim(); });

  var validRecipients = [];
  var invalidRecipients = [];
  for (var i = 0; i < normalizedRecipients.length; i++) {
    if (isValidEmail_(normalizedRecipients[i])) {
      validRecipients.push(normalizedRecipients[i]);
    } else {
      invalidRecipients.push(normalizedRecipients[i]);
    }
  }

  if (invalidRecipients.length > 0) {
    Logger.log("Invalid email recipients provided: " + invalidRecipients.join(","));
  }

  if (validRecipients.length === 0) {
    Logger.log("No valid email recipients provided.");
    return;
  }

  MailApp.sendEmail({
    to: validRecipients.join(","),
    subject: subject,
    htmlBody: body
  });
}

// ------------------------
// 6. Main function
// ------------------------
function sendScheduledEmailFromSheet() {
  var scheduleData = getSheetData(ScheduleSheetName);
  var nextRow = getNextUpcomingRow(scheduleData);
  var emailBody = buildEmailBody(nextRow);
  var recipients = getEmailRecipients();
  sendEmailToRecipients("Upcoming Event Info", emailBody, recipients);
}

function testSendScheduledEmailFromSheet() {
  var scheduleData = getSheetData(ScheduleSheetName);
  var nextRow = getNextUpcomingRow(scheduleData);
  var emailBody = buildEmailBody(nextRow);
  var recipients = getTestEmailRecipients_();
  sendEmailToRecipients("Upcoming Event Info", emailBody, recipients);
}

// ------------------------
// Node/test exports (no-op in Apps Script)
// ------------------------
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getNextUpcomingRow,
    buildEmailBody,
    sendEmailToRecipients,
    getEmailRecipients,
    getSheetData,
    getSheetId_
  };
}
