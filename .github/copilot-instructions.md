# Copilot Instructions — community-group-google-scripts

## Project overview
This repo contains a **Google Apps Script** project in `script.js` plus a **Node/Jest** test harness under `__tests__/`.

Goals:
- Send a scheduled reminder email based on the next upcoming row in the **Schedule** sheet.
- Load recipient emails from the **Emails** sheet (or from script properties for test sends).

## Key files
- `script.js`: Apps Script code (also CommonJS-exported for tests).
- `__tests__/script.test.cjs`: Jest tests that mock Apps Script globals.
- `package.json`: test runner config.

## Runtime environments
### Google Apps Script
- Uses Apps Script services: `SpreadsheetApp`, `PropertiesService`, `MailApp`, `Logger`, `Session`, `Utilities`.
- **Script Properties** required:
  - `SHEET_ID`: Spreadsheet ID containing the `Schedule` and `Emails` tabs.
  - `TEST_EMAIL_RECIPIENTS`: Comma-separated emails used by `testSendScheduledEmailFromSheet()`.
  - `GROUPME_BOT_ID`: Bot id used to post messages via the GroupMe Bot API.
  - `TEST_GROUPME_BOT_ID`: Bot id used by the GroupMe test posting entry point.

### Node/Jest (local testing)
- Tests run in Node, so Apps Script globals are **mocked** in Jest.
- Keep functions pure where possible and avoid side effects outside entry points.

## Conventions / patterns to follow
### Date handling
- The Schedule sheet date is in **column A**.
- To avoid timezone day-shift issues, when formatting dates:
  - Create a `Date` from the sheet value.
  - Force time to **midday**: `setHours(12, 0, 0, 0)`.
  - Format using script timezone: `Utilities.formatDate(date, Session.getScriptTimeZone(), ...)`.

### Subject line format
- The email subject is built by `buildEmailSubject_(row)`.
- Current required format:
  - `Reminder for Mendez/Williams City Group on MM-dd`
  - If Location is `No Group` (case-insensitive), use:
    - `NO GROUP for Mendez/Williams City Group on MM-dd`

### Body special-case
- If Location is `No Group` (case-insensitive), `buildEmailBody_(row)` should return the single-line message:
  - `NO GROUP for Mendez/Williams City Group on MM-dd`

### Public entry points (triggers)
- `sendScheduledEmailFromSheet()`: production send; reads recipients from `Emails` sheet.
- `testSendScheduledEmailFromSheet()`: test send; reads recipients from `TEST_EMAIL_RECIPIENTS`.
- `postGroupMeReminderFromSheet()`: posts a plaintext version of the email details to GroupMe (no HTML; requires `GROUPME_BOT_ID`).
- `testPostGroupMeReminderFromSheet()`: posts the same plaintext message to GroupMe using `TEST_GROUPME_BOT_ID`.

New combined entry points:
- `sendScheduledEmailAndGroupMeFromSheet()`: production combined send; emails via `Emails` sheet and posts to GroupMe using `GROUPME_BOT_ID`.
- `testSendScheduledEmailAndGroupMeFromSheet(optBaseDate)`: test combined send; emails via `TEST_EMAIL_RECIPIENTS` and posts to GroupMe using `TEST_GROUPME_BOT_ID`. Accepts an optional base date to simulate "today". Examples: `12/15/25`, `1/30/2026`, or a `Date` object. Defaults to actual today when omitted.

## GroupMe Bot setup
- Create a bot at https://dev.groupme.com/bots (pick the target group).
- Copy the bot's `bot_id` into Script Properties as `GROUPME_BOT_ID`.
- (Optional) Create a separate bot for testing and set `TEST_GROUPME_BOT_ID`.
- Run `postGroupMeReminderFromSheet()` manually once to verify posting.
- Use `testPostGroupMeReminderFromSheet()` to test without posting to the main group.
- Note: GroupMe bots do not render HTML; messages must be plain text.

### Exports for tests
- `script.js` conditionally exports helpers when `module.exports` is available.
- When adding helpers that should be test-covered, export them in the same block (e.g., `buildGroupMeMessage_`).

### Logging
- Prefer `Logger.log(...)` for Apps Script logs.
- Do not log PII beyond recipient emails already present in sheets/properties.

## How to validate changes
- Run tests from Git Bash:
  - `cd /c/FALCOR/community-group-google-scripts && npm test`
- If you change date formatting, update Jest mocks/assertions accordingly.

## Change guidelines
- Keep changes minimal and directly related to the requested behavior.
- Preserve existing sheet names and column meanings unless explicitly requested.
- If behavior is ambiguous, choose the simplest implementation and keep it testable.
- If you change behavior, configuration, sheet expectations, subject/body formats, or test commands, update this `copilot-instructions.md` in the same PR.
