/**
 * Gets the Google Sheet ID from Script Properties.
 *
 * Script property key: `SHEET_ID`.
 *
 * @returns {string} Spreadsheet ID
 * @throws {Error} If `SHEET_ID` is not configured
 */
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

/**
 * Gets the GroupMe Bot ID from Script Properties.
 *
 * Script property key: `GROUPME_BOT_ID`.
 *
 * @returns {string} GroupMe bot id
 * @throws {Error} If `GROUPME_BOT_ID` is not configured
 */
function getGroupMeBotId_() {
  var botId = PropertiesService.getScriptProperties().getProperty("GROUPME_BOT_ID");
  if (!botId) {
    throw new Error(
      "Missing script property GROUPME_BOT_ID. Create a bot at https://dev.groupme.com/bots " +
      "and set it in Project Settings → Script properties."
    );
  }

  return botId;
}

/**
 * Gets the GroupMe Bot ID for testing from Script Properties.
 *
 * Script property key: `TEST_GROUPME_BOT_ID`.
 *
 * @returns {string} GroupMe bot id
 * @throws {Error} If `TEST_GROUPME_BOT_ID` is not configured
 */
function getTestGroupMeBotId_() {
  var botId = PropertiesService.getScriptProperties().getProperty("TEST_GROUPME_BOT_ID");
  if (!botId) {
    throw new Error(
      "Missing script property TEST_GROUPME_BOT_ID. Create a bot at https://dev.groupme.com/bots " +
      "and set it in Project Settings → Script properties."
    );
  }

  return botId;
}

var ScheduleSheetName = "Schedule";
var EmailSheetName = "Emails";

// Note: Date formatting uses the script timezone (Project Settings → Time zone).

// -----------------------------------------------------------------------------
// Sheet access
// -----------------------------------------------------------------------------
/**
 * Loads all values from a named sheet within the configured spreadsheet.
 *
 * @param {string} sheetName Sheet tab name
 * @returns {Array<Array<any>>} 2D array of values (rows x columns)
 */
function getSheetData_(sheetName) {
  var ss = SpreadsheetApp.openById(getSheetId_());
  var sheet = ss.getSheetByName(sheetName);

  return sheet.getDataRange().getValues(); // 2D array
}

// -----------------------------------------------------------------------------
// Schedule lookup
// -----------------------------------------------------------------------------
/**
 * Finds the first upcoming row in the next 7 days.
 *
 * Expects column A (index 0) to contain a date value. Skips the header row.
 *
 * @param {Array<Array<any>>} data 2D array of Schedule sheet values
 * @returns {Array<any>|null} First matching row, or null if none
 */
function getNextUpcomingRow_(data) {
  var today = new Date();

  var maxDate = new Date(today);
  maxDate.setDate(maxDate.getDate() + 7); // 7 days from today

  for (var i = 1; i < data.length; i++) { // Skip header row.
    var k = data[i];
    var rowDate = new Date(k[0]);
    if (rowDate >= today && rowDate <= maxDate) {
      return k; // first upcoming date within 7 days
    }
  }

  return null; // no upcoming row within 7 days
}

/**
 * Returns true when the schedule row represents a "No Group" meeting.
 *
 * Convention: Location column (index 2) contains the string "No Group".
 *
 * @param {Array<any>|null} k Row values from the Schedule sheet
 * @returns {boolean}
 */
function isNoGroupRow_(k) {
  if (!k) return false;
  var location = (k[2] || "").toString().trim().toLowerCase();
  return location === "no group";
}

// -----------------------------------------------------------------------------
// Email content
// -----------------------------------------------------------------------------
/**
 * Builds the HTML email body for a schedule row.
 *
 * Uses the script timezone to format the date and forces the time to midday
 * to reduce timezone-related day shifts.
 *
 * @param {Array<any>|null} k Row values from the Schedule sheet
 * @returns {string} HTML email body
 */
function buildEmailBody_(k) {
  if (!k) return "No upcoming events found.";

  if (isNoGroupRow_(k)) {
    var noGroupDate = new Date(k[0]);
    noGroupDate.setHours(12, 0, 0, 0); // midday
    var noGroupFormattedDate = Utilities.formatDate(noGroupDate, Session.getScriptTimeZone(), "MM-dd");
    return `NO GROUP for Mendez/Williams City Group on ${noGroupFormattedDate}`;
  }

  // Force midday to avoid timezone shifts.
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

/**
 * Builds the email subject for a schedule row.
 *
 * Format: "Reminder for Mendez/Williams City Group on 12-17".
 * Uses the script timezone and forces the time to midday to reduce
 * timezone-related day shifts.
 *
 * @param {Array<any>|null} k Row values from the Schedule sheet
 * @returns {string} Email subject
 */
function buildEmailSubject_(k) {
  if (!k) return "Reminder for Mendez/Williams City Group";

  if (isNoGroupRow_(k)) {
    var noGroupDate = new Date(k[0]);
    noGroupDate.setHours(12, 0, 0, 0); // midday
    var noGroupFormattedDate = Utilities.formatDate(noGroupDate, Session.getScriptTimeZone(), "MM-dd");
    return `NO GROUP for Mendez/Williams City Group on ${noGroupFormattedDate}`;
  }

  // Force midday to avoid timezone shifts.
  var rowDate = new Date(k[0]);
  rowDate.setHours(12, 0, 0, 0); // midday

  var formattedDate = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "MM-dd");
  return `Reminder for Mendez/Williams City Group on ${formattedDate}`;
}

/**
 * Builds a plaintext GroupMe message for a schedule row (no HTML).
 *
 * - If Location is "No Group", returns the single-line NO GROUP message.
 * - Otherwise includes a subject line, long-form date, details, and signup link.
 *
 * @param {Array<any>|null} k Row values from the Schedule sheet
 * @returns {string} Plaintext message suitable for GroupMe
 */
function buildGroupMeMessage_(k) {
  if (!k) return "Reminder for Mendez/Williams City Group";

  if (isNoGroupRow_(k)) {
    var noGroupDate = new Date(k[0]);
    noGroupDate.setHours(12, 0, 0, 0);
    var noGroupFormattedDate = Utilities.formatDate(noGroupDate, Session.getScriptTimeZone(), "MM-dd");
    return `NO GROUP for Mendez/Williams City Group on ${noGroupFormattedDate}`;
  }

  var rowDate = new Date(k[0]);
  rowDate.setHours(12, 0, 0, 0);
  var shortDate = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "MM-dd");

  var sheetId = getSheetId_();
  var signupUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/edit?usp=sharing`;

  var lines = [
    `Reminder for Mendez/Williams City Group on ${shortDate}`,
    `Description: ${k[1]}`,
    `Location: ${k[2]}`,
    `Food Theme: ${k[3]}`,
    `Childcare Duty: ${k[4]}`,
    `Sign up: ${signupUrl}`,
  ];

  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// Recipient lookup
// -----------------------------------------------------------------------------
/**
 * Loads recipient emails from the configured Emails sheet.
 *
 * Expects emails in column A, with a header in the first row.
 *
 * @returns {string[]} Email addresses
 */
function getEmailRecipients_() {
  var data = getSheetData_(EmailSheetName);
  var emails = [];

  for (var i = 1; i < data.length; i++) { // Skip header row.
    var email = data[i][0]; // Column A
    if (email) {
      emails.push(email);
    }
  }

  return emails;
}

/**
 * Loads test recipients from Script Properties.
 *
 * Script property key: `TEST_EMAIL_RECIPIENTS`.
 * Value format: comma-separated list (e.g. "a@example.com,b@example.com").
 *
 * @returns {string[]} Email addresses
 * @throws {Error} If `TEST_EMAIL_RECIPIENTS` is not configured
 */
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

/**
 * Best-effort email validation.
 *
 * This is a practical check (not full RFC compliance) to catch obvious issues.
 *
 * @param {string} email Email address to validate
 * @returns {boolean} True if the email looks valid
 */
function isValidEmail_(email) {
  if (!email) return false;
  if (email.length > 320) return false;
  // Practical (not fully RFC) validation.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// -----------------------------------------------------------------------------
// Sending
// -----------------------------------------------------------------------------
/**
 * Sends a single HTML email to all valid recipients using the 'to' field.
 *
 * Invalid recipients are logged and excluded. If there are no valid recipients,
 * no email is sent.
 *
 * @param {string} subject Email subject
 * @param {string} body HTML body
 * @param {Array<any>} recipients Array of recipient values (strings preferred)
 * @returns {void}
 */
function sendEmailToRecipients_(subject, body, recipients) {
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

/**
 * Posts a message to a GroupMe group via the Bot API, using an explicit bot id.
 *
 * @param {string} botId GroupMe bot id
 * @param {string} text Message text
 * @returns {void}
 */
function postGroupMeMessageWithBotId_(botId, text) {
  var message = (text || "").toString().trim();
  if (!message) {
    Logger.log("No GroupMe message text provided.");
    return;
  }

  var normalizedBotId = (botId || "").toString().trim();
  if (!normalizedBotId) {
    Logger.log("No GroupMe bot id provided.");
    return;
  }

  var url = "https://api.groupme.com/v3/bots/post";
  var payload = {
    bot_id: normalizedBotId,
    text: message
  };

  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}

// -----------------------------------------------------------------------------
// Entry points
// -----------------------------------------------------------------------------
/**
 * Entry point: reads schedule + recipients from sheets and sends the email.
 *
 * Intended for time-based triggers.
 *
 * @returns {void}
 */
function sendScheduledEmailFromSheet() {
  var scheduleData = getSheetData_(ScheduleSheetName);
  var nextRow = getNextUpcomingRow_(scheduleData);
  var emailBody = buildEmailBody_(nextRow);
  var subject = buildEmailSubject_(nextRow);
  var recipients = getEmailRecipients_();
  sendEmailToRecipients_(subject, emailBody, recipients);
}

/**
 * Entry point: same as sendScheduledEmailFromSheet but uses `TEST_EMAIL_RECIPIENTS`.
 *
 * Useful for manually testing delivery without emailing the full group.
 *
 * @returns {void}
 */
function testSendScheduledEmailFromSheet() {
  var scheduleData = getSheetData_(ScheduleSheetName);
  var nextRow = getNextUpcomingRow_(scheduleData);
  var emailBody = buildEmailBody_(nextRow);
  var subject = buildEmailSubject_(nextRow);
  var recipients = getTestEmailRecipients_();
  sendEmailToRecipients_(subject, emailBody, recipients);
}

/**
 * Entry point: posts the upcoming reminder message to GroupMe.
 *
 * The message content matches the email subject (including the NO GROUP case).
 * Intended for time-based triggers.
 *
 * Requires script property `GROUPME_BOT_ID`.
 *
 * @returns {void}
 */
function postGroupMeReminderFromSheet() {
  var scheduleData = getSheetData_(ScheduleSheetName);
  var nextRow = getNextUpcomingRow_(scheduleData);
  var message = buildGroupMeMessage_(nextRow);
  var botId = getGroupMeBotId_();
  postGroupMeMessageWithBotId_(botId, message);
}

/**
 * Entry point: posts the upcoming reminder message to GroupMe using TEST bot id.
 *
 * Requires script property `TEST_GROUPME_BOT_ID`.
 *
 * @returns {void}
 */
function testPostGroupMeReminderFromSheet() {
  var scheduleData = getSheetData_(ScheduleSheetName);
  var nextRow = getNextUpcomingRow_(scheduleData);
  var message = buildGroupMeMessage_(nextRow);
  var botId = getTestGroupMeBotId_();
  postGroupMeMessageWithBotId_(botId, message);
}

/**
 * Entry point: sends the upcoming reminder via email and posts to GroupMe.
 *
 * Production variant: reads recipients from `Emails` sheet and uses `GROUPME_BOT_ID`.
 *
 * @returns {void}
 */
function sendScheduledEmailAndGroupMeFromSheet() {
  var scheduleData = getSheetData_(ScheduleSheetName);
  var nextRow = getNextUpcomingRow_(scheduleData);

  var emailBody = buildEmailBody_(nextRow);
  var subject = buildEmailSubject_(nextRow);
  var recipients = getEmailRecipients_();
  sendEmailToRecipients_(subject, emailBody, recipients);

  var message = buildGroupMeMessage_(nextRow);
  var botId = getGroupMeBotId_();
  postGroupMeMessageWithBotId_(botId, message);
}

/**
 * Entry point: test variant that sends email and posts to GroupMe test bot.
 *
 * Test recipients are loaded from `TEST_EMAIL_RECIPIENTS` and posting uses `TEST_GROUPME_BOT_ID`.
 *
 * @returns {void}
 */
function testSendScheduledEmailAndGroupMeFromSheet() {
  var scheduleData = getSheetData_(ScheduleSheetName);
  var nextRow = getNextUpcomingRow_(scheduleData);

  var emailBody = buildEmailBody_(nextRow);
  var subject = buildEmailSubject_(nextRow);
  var recipients = getTestEmailRecipients_();
  sendEmailToRecipients_(subject, emailBody, recipients);

  var message = buildGroupMeMessage_(nextRow);
  var botId = getTestGroupMeBotId_();
  postGroupMeMessageWithBotId_(botId, message);
}

// -----------------------------------------------------------------------------
// Node/test exports (no-op in Apps Script)
// -----------------------------------------------------------------------------
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    getNextUpcomingRow_,
    isNoGroupRow_,
    buildEmailBody_,
    buildEmailSubject_,
    buildGroupMeMessage_,
    sendEmailToRecipients_,
    getGroupMeBotId_,
    getTestGroupMeBotId_,
    postGroupMeMessageWithBotId_,
    postGroupMeReminderFromSheet,
    testPostGroupMeReminderFromSheet,
    sendScheduledEmailAndGroupMeFromSheet,
    testSendScheduledEmailAndGroupMeFromSheet,
    getEmailRecipients_,
    getSheetData_,
    getSheetId_
  };
}
