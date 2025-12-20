const {
  getNextUpcomingRow_,
  buildEmailBody_,
  buildEmailSubject_,
  sendEmailToRecipients_,
  postGroupMeMessage_,
} = require("../script.js");

function makeDateDaysFromNow(daysFromNow) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(0, 0, 0, 0);
  return d;
}

describe("getNextUpcomingRow", () => {
  test("returns first row within next 7 days (skips header)", () => {
    const data = [
      ["Date", "Description", "Location", "Food", "Childcare"],
      [makeDateDaysFromNow(10), "too far", "loc", "food", "cc"],
      [makeDateDaysFromNow(2), "soon", "loc", "food", "cc"],
      [makeDateDaysFromNow(1), "even sooner but later in sheet", "loc", "food", "cc"],
    ];

    const row = getNextUpcomingRow_(data);
    expect(row[1]).toBe("soon");
  });

  test("returns null when no rows fall in window", () => {
    const data = [
      ["Date", "Description"],
      [makeDateDaysFromNow(-1), "past"],
      [makeDateDaysFromNow(8), "too late"],
    ];

    expect(getNextUpcomingRow_(data)).toBeNull();
  });
});

describe("buildEmailBody", () => {
  beforeEach(() => {
    // Minimal mocks for Apps Script globals used by buildEmailBody
    global.Session = {
      getScriptTimeZone: () => "UTC",
    };

    global.Utilities = {
      formatDate: (date, tz, fmt) => {
        // Keep assertion surface small: just ensure we were given a Date.
        if (!(date instanceof Date)) throw new Error("Expected Date");
        if (tz !== "UTC") throw new Error("Expected UTC");
        if (!fmt) throw new Error("Expected format");
        if (fmt === "MM-dd") return "12-17";
        return "FORMATTED_DATE";
      },
    };

    global.PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (key) => (key === "SHEET_ID" ? "SHEET123" : null),
      }),
    };
  });

  test("returns friendly message on null input", () => {
    expect(buildEmailBody_(null)).toBe("No upcoming events found.");
  });

  test("includes formatted date and signup url", () => {
    const row = [new Date("2025-12-25T00:00:00Z"), "Desc", "Loc", "Food", "Duty"];
    const html = buildEmailBody_(row);

    expect(html).toContain("FORMATTED_DATE");
    expect(html).toContain("https://docs.google.com/spreadsheets/d/SHEET123/edit?usp=sharing");
    expect(html).toContain("<strong>Description:</strong> Desc");
    expect(html).toContain("<strong>Location:</strong> Loc");
  });

  test("returns NO GROUP message when location is No Group", () => {
    const row = [new Date("2025-12-17T00:00:00Z"), "Desc", "No Group", "Food", "Duty"];
    const body = buildEmailBody_(row);

    expect(body).toBe("NO GROUP for Mendez/Williams City Group on 12-17");
    expect(body).not.toContain("https://docs.google.com/spreadsheets/d/");
  });
});

describe("buildEmailSubject", () => {
  beforeEach(() => {
    global.Session = {
      getScriptTimeZone: () => "UTC",
    };

    global.Utilities = {
      formatDate: (date, tz, fmt) => {
        if (!(date instanceof Date)) throw new Error("Expected Date");
        if (tz !== "UTC") throw new Error("Expected UTC");
        if (fmt !== "MM-dd") throw new Error("Expected MM-dd");
        return "12-17";
      },
    };
  });

  test("returns TBD when row is null", () => {
    expect(buildEmailSubject_(null)).toBe("Reminder for Mendez/Williams City Group");
  });

  test("formats subject as Reminder for Mendez/Williams City Group on 12-17", () => {
    const row = [new Date("2025-12-17T00:00:00Z"), "Desc", "Loc", "Food", "Duty"];
    expect(buildEmailSubject_(row)).toBe("Reminder for Mendez/Williams City Group on 12-17");
  });

  test("formats subject as NO GROUP for Mendez/Williams City Group on 12-17 when location is No Group", () => {
    const row = [new Date("2025-12-17T00:00:00Z"), "Desc", "No Group", "Food", "Duty"];
    expect(buildEmailSubject_(row)).toBe("NO GROUP for Mendez/Williams City Group on 12-17");
  });
});

describe("sendEmailToRecipients", () => {
  beforeEach(() => {
    global.MailApp = {
      sendEmail: jest.fn(),
    };

    global.Logger = {
      log: jest.fn(),
    };
  });

  test("does not send when recipients list is empty", () => {
    sendEmailToRecipients_("Sub", "Body", []);
    expect(global.MailApp.sendEmail).not.toHaveBeenCalled();
    expect(global.Logger.log).toHaveBeenCalledWith("No email recipients provided.");
  });

  test("sends all recipients in the 'to' field and does not set bcc", () => {
    sendEmailToRecipients_("Sub", "Body", ["a@test.com", "b@test.com"]);

    expect(global.MailApp.sendEmail).toHaveBeenCalledTimes(1);
    const payload = global.MailApp.sendEmail.mock.calls[0][0];

    expect(payload.to).toBe("a@test.com,b@test.com");
    expect(payload.bcc).toBeUndefined();
    expect(payload.subject).toBe("Sub");
    expect(payload.htmlBody).toBe("Body");
  });

  test("logs invalid recipients but still sends to the valid ones", () => {
    sendEmailToRecipients_("Sub", "Body", ["a@test.com", "not-an-email", "b@test.com"]);

    expect(global.MailApp.sendEmail).toHaveBeenCalledTimes(1);
    const payload = global.MailApp.sendEmail.mock.calls[0][0];
    expect(payload.to).toBe("a@test.com,b@test.com");

    expect(global.Logger.log).toHaveBeenCalledWith(
      expect.stringContaining("Invalid email recipients provided")
    );
  });
});

describe("postGroupMeMessage", () => {
  beforeEach(() => {
    global.Logger = {
      log: jest.fn(),
    };

    global.PropertiesService = {
      getScriptProperties: () => ({
        getProperty: (key) => (key === "GROUPME_BOT_ID" ? "BOT123" : null),
      }),
    };

    global.UrlFetchApp = {
      fetch: jest.fn(),
    };
  });

  test("does not post when message is empty", () => {
    postGroupMeMessage_("");
    expect(global.UrlFetchApp.fetch).not.toHaveBeenCalled();
    expect(global.Logger.log).toHaveBeenCalledWith("No GroupMe message text provided.");
  });

  test("posts to GroupMe bots endpoint with bot_id and text", () => {
    postGroupMeMessage_("Hello GroupMe");

    expect(global.UrlFetchApp.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = global.UrlFetchApp.fetch.mock.calls[0];

    expect(url).toBe("https://api.groupme.com/v3/bots/post");
    expect(options.method).toBe("post");
    expect(options.contentType).toBe("application/json");

    const parsed = JSON.parse(options.payload);
    expect(parsed).toEqual({ bot_id: "BOT123", text: "Hello GroupMe" });
  });
});
