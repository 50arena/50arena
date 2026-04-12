const { google } = require("googleapis");

const CONFIG = {
  BRAND_NAME: "50 Arena",
  SLOGAN: "أول ملعب 5×5 بمواصفات فيفا في الطفيلة",
  OPEN_HOUR: 12,
  CLOSE_HOUR: 24,
  SLOT_STEP_MINUTES: 30,
  BUFFER_MINUTES: 0,
  MAX_DAYS_AHEAD: 30,
  TIMEZONE: process.env.TIMEZONE || "Asia/Amman",
  ARENA_WHATSAPP_NUMBER: "962779605047",
  DURATIONS: [
    { label: "ساعة", value: 60, price: 15 },
    { label: "ساعة ونصف", value: 90, price: 20 },
    { label: "ساعتان", value: 120, price: 25 },
    { label: "3 ساعات", value: 180, price: 35 }
  ]
};

function cleanString(value) {
  return String(value || "").trim();
}

function getFormatter(locale, options) {
  return new Intl.DateTimeFormat(locale, {
    timeZone: CONFIG.TIMEZONE,
    ...options
  });
}

function getParts(date) {
  const parts = getFormatter("en-US", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  }).formatToParts(date);

  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
    hour: Number(map.hour),
    minute: Number(map.minute),
    second: Number(map.second)
  };
}

function getTimeZoneOffsetMinutes(date) {
  const tzName = getFormatter("en-US", {
    timeZoneName: "shortOffset"
  })
    .formatToParts(date)
    .find(part => part.type === "timeZoneName");

  const value = tzName ? tzName.value : "GMT+0";
  if (value === "GMT" || value === "UTC") {
    return 0;
  }

  const match = value.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes);
}

function makeZonedDate(year, month, day, hour = 0, minute = 0, second = 0) {
  let utcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  for (let i = 0; i < 2; i += 1) {
    const offsetMinutes = getTimeZoneOffsetMinutes(new Date(utcMs));
    utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - offsetMinutes * 60000;
  }

  return new Date(utcMs);
}

function formatDateOnly(date) {
  const parts = getParts(date);
  return [
    String(parts.year).padStart(4, "0"),
    String(parts.month).padStart(2, "0"),
    String(parts.day).padStart(2, "0")
  ].join("-");
}

function formatTime(date) {
  return new Intl.DateTimeFormat("ar-JO-u-nu-latn", {
    timeZone: CONFIG.TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function parseDateOnly(dateStr) {
  const match = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error("صيغة التاريخ غير صحيحة");
  }

  const [, year, month, day] = match;
  return makeZonedDate(Number(year), Number(month), Number(day), 0, 0, 0);
}

function addDays(date, days) {
  const parts = getParts(date);
  const seed = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days, 12, 0, 0));
  const target = getParts(seed);
  return makeZonedDate(target.year, target.month, target.day, 0, 0, 0);
}

function sameDate(a, b) {
  const aParts = getParts(a);
  const bParts = getParts(b);

  return (
    aParts.year === bParts.year &&
    aParts.month === bParts.month &&
    aParts.day === bParts.day
  );
}

function nowInTimezone() {
  return new Date();
}

function isDateWithinBookingWindow(targetDate) {
  const today = nowInTimezone();
  const minDate = formatDateOnly(today);
  const maxDate = formatDateOnly(addDays(today, CONFIG.MAX_DAYS_AHEAD));
  const value = formatDateOnly(targetDate);
  return value >= minDate && value <= maxDate;
}

function isSlotStepAligned(date) {
  const parts = getParts(date);
  return parts.minute % CONFIG.SLOT_STEP_MINUTES === 0 && parts.second === 0;
}

function normalizeJordanPhoneLocal(phone) {
  let cleaned = String(phone || "").replace(/[^\d+]/g, "");

  if (cleaned.startsWith("00962")) {
    cleaned = "0" + cleaned.slice(5);
  } else if (cleaned.startsWith("+962")) {
    cleaned = "0" + cleaned.slice(4);
  } else if (cleaned.startsWith("962")) {
    cleaned = "0" + cleaned.slice(3);
  }

  return cleaned;
}

function isValidJordanPhone(phone) {
  const normalized = normalizeJordanPhoneLocal(phone);
  return /^07[789]\d{7}$/.test(normalized);
}

function getPrice(durationMinutes) {
  const found = CONFIG.DURATIONS.find(item => Number(item.value) === Number(durationMinutes));
  return found ? found.price : 0;
}

function getDurationLabel(durationMinutes) {
  const found = CONFIG.DURATIONS.find(item => Number(item.value) === Number(durationMinutes));
  return found ? found.label : `${durationMinutes} دقيقة`;
}

function getDayBounds(targetDate) {
  const parts = getParts(targetDate);
  return {
    start: makeZonedDate(parts.year, parts.month, parts.day, 0, 0, 0),
    end: makeZonedDate(parts.year, parts.month, parts.day, 23, 59, 59)
  };
}

function getWorkBounds(targetDate) {
  const parts = getParts(targetDate);
  return {
    openTime: makeZonedDate(parts.year, parts.month, parts.day, CONFIG.OPEN_HOUR, 0, 0),
    closeTime: makeZonedDate(parts.year, parts.month, parts.day + 1, 0, 0, 0)
  };
}

function isWithinWorkBounds(start, end) {
  const { openTime, closeTime } = getWorkBounds(start);
  return start >= openTime && end <= closeTime;
}

function eventOverlaps(start, end, eventStart, eventEnd) {
  const bufferMs = CONFIG.BUFFER_MINUTES * 60000;
  const bufferedStart = new Date(eventStart.getTime() - bufferMs);
  const bufferedEnd = new Date(eventEnd.getTime() + bufferMs);
  return start < bufferedEnd && end > bufferedStart;
}

function getRequiredEnv() {
  return {
    clientEmail: cleanString(process.env.GOOGLE_CLIENT_EMAIL),
    privateKey: cleanString(process.env.GOOGLE_PRIVATE_KEY).replace(/\\n/g, "\n"),
    calendarId: cleanString(process.env.GOOGLE_CALENDAR_ID),
    sheetId: cleanString(process.env.GOOGLE_SHEET_ID)
  };
}

function getGoogleStatus() {
  const env = getRequiredEnv();
  const hasClientEmail = Boolean(env.clientEmail);
  const hasPrivateKey = Boolean(env.privateKey);
  const hasSheetId = Boolean(env.sheetId);
  const hasCalendarId = Boolean(env.calendarId);
  const calendarLooksValid = hasCalendarId && env.calendarId.toLowerCase() !== "primary";

  return {
    hasClientEmail,
    hasPrivateKey,
    hasSheetId,
    hasCalendarId,
    calendarLooksValid,
    ready: hasClientEmail && hasPrivateKey && hasSheetId && calendarLooksValid,
    message: !hasClientEmail || !hasPrivateKey || !hasSheetId || !hasCalendarId
      ? "إعدادات Google غير مكتملة في Environment Variables"
      : !calendarLooksValid
        ? "GOOGLE_CALENDAR_ID يجب أن يكون Calendar ID حقيقيًا وليس primary"
        : "Google Ready"
  };
}

function hasGoogleCredentials() {
  return getGoogleStatus().ready;
}

function assertGoogleEnv() {
  const status = getGoogleStatus();
  if (status.ready) {
    return;
  }

  throw new Error(status.message);
}

function getAuth() {
  assertGoogleEnv();
  const env = getRequiredEnv();

  return new google.auth.GoogleAuth({
    credentials: {
      client_email: env.clientEmail,
      private_key: env.privateKey
    },
    scopes: [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/spreadsheets"
    ]
  });
}

async function getCalendarClient() {
  const auth = await getAuth().getClient();
  return google.calendar({ version: "v3", auth });
}

async function getSheetsClient() {
  const auth = await getAuth().getClient();
  return google.sheets({ version: "v4", auth });
}

async function listCalendarEventsForDay(targetDate) {
  assertGoogleEnv();
  const env = getRequiredEnv();
  const calendar = await getCalendarClient();
  const { start, end } = getDayBounds(targetDate);

  const response = await calendar.events.list({
    calendarId: env.calendarId,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
    timeZone: CONFIG.TIMEZONE
  });

  return (response.data.items || []).map(item => ({
    start: new Date(item.start.dateTime || item.start.date),
    end: new Date(item.end.dateTime || item.end.date)
  }));
}

async function tryListCalendarEventsForDay(targetDate) {
  try {
    const events = await listCalendarEventsForDay(targetDate);
    return { ok: true, events, source: "google", message: null };
  } catch (error) {
    return {
      ok: false,
      events: [],
      source: "mock",
      message: error && error.message ? error.message : "تعذر قراءة Google Calendar"
    };
  }
}

async function ensureSheetHeader() {
  assertGoogleEnv();
  const env = getRequiredEnv();
  const sheets = await getSheetsClient();

  const headerResponse = await sheets.spreadsheets.values.get({
    spreadsheetId: env.sheetId,
    range: "Bookings!A1:H1"
  });

  const values = headerResponse.data.values || [];
  if (values.length) {
    return;
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.sheetId,
    range: "Bookings!A1:H1",
    valueInputOption: "RAW",
    requestBody: {
      values: [[
        "Name",
        "Phone",
        "Date",
        "Start",
        "End",
        "JOD",
        "Notes",
        "Calendar Event ID"
      ]]
    }
  });
}

async function appendBookingToSheet(row) {
  assertGoogleEnv();
  const env = getRequiredEnv();
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.sheetId,
    range: "Bookings!A:H",
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [[
        row.name,
        row.phone,
        row.date,
        row.start,
        row.end,
        row.price,
        row.notes,
        row.eventId
      ]]
    }
  });
}

module.exports = {
  CONFIG,
  cleanString,
  formatDateOnly,
  formatTime,
  parseDateOnly,
  addDays,
  sameDate,
  nowInTimezone,
  isDateWithinBookingWindow,
  isSlotStepAligned,
  normalizeJordanPhoneLocal,
  isValidJordanPhone,
  getPrice,
  getDurationLabel,
  getDayBounds,
  getWorkBounds,
  isWithinWorkBounds,
  eventOverlaps,
  hasGoogleCredentials,
  getGoogleStatus,
  getRequiredEnv,
  listCalendarEventsForDay,
  tryListCalendarEventsForDay,
  ensureSheetHeader,
  appendBookingToSheet,
  getCalendarClient
};
