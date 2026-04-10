const { google } = require("googleapis");

const CONFIG = {
  BRAND_NAME: "\u200E50 Arena\u200E",
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

function getAuth() {
  return new google.auth.GoogleAuth({
    credentials: {
      client_email: process.env.GOOGLE_CLIENT_EMAIL,
      private_key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n")
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

function cleanString(value) {
  return String(value || "").trim();
}

function parseDateOnly(dateStr) {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 0, 0, 0, 0);
}

function formatDateOnly(date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CONFIG.TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatTime(date) {
  return new Intl.DateTimeFormat("ar-JO", {
    timeZone: CONFIG.TIMEZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  }).format(date);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function sameDate(a, b) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function normalizeJordanPhoneLocal(phone) {
  let cleaned = String(phone || "").replace(/[^\d+]/g, "");

  if (cleaned.startsWith("+962")) {
    cleaned = "0" + cleaned.substring(4);
  } else if (cleaned.startsWith("962")) {
    cleaned = "0" + cleaned.substring(3);
  } else if (cleaned.startsWith("00962")) {
    cleaned = "0" + cleaned.substring(5);
  }

  return cleaned;
}

function isValidJordanPhone(phone) {
  const normalized = normalizeJordanPhoneLocal(phone);
  return /^07[789]\d{7}$/.test(normalized);
}

function getPrice(durationMinutes) {
  const found = CONFIG.DURATIONS.find(d => Number(d.value) === Number(durationMinutes));
  return found ? found.price : 0;
}

function getDurationLabel(durationMinutes) {
  const found = CONFIG.DURATIONS.find(d => Number(d.value) === Number(durationMinutes));
  return found ? found.label : `${durationMinutes} دقيقة`;
}

function getDayBounds(targetDate) {
  const start = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0, 0);
  const end = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59, 999);
  return { start, end };
}

function getWorkBounds(targetDate) {
  const openTime = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate(),
    CONFIG.OPEN_HOUR,
    0,
    0,
    0
  );

  const closeTime = new Date(
    targetDate.getFullYear(),
    targetDate.getMonth(),
    targetDate.getDate() + 1,
    CONFIG.CLOSE_HOUR - 24,
    0,
    0,
    0
  );

  return { openTime, closeTime };
}

function eventOverlaps(start, end, eventStart, eventEnd) {
  const bufferMs = CONFIG.BUFFER_MINUTES * 60000;
  const bufferedStart = new Date(eventStart.getTime() - bufferMs);
  const bufferedEnd = new Date(eventEnd.getTime() + bufferMs);
  return start < bufferedEnd && end > bufferedStart;
}

async function listCalendarEventsForDay(targetDate) {
  const calendar = await getCalendarClient();
  const { start, end } = getDayBounds(targetDate);

  const response = await calendar.events.list({
    calendarId: process.env.GOOGLE_CALENDAR_ID,
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    singleEvents: true,
    orderBy: "startTime"
  });

  return (response.data.items || []).map(item => ({
    start: new Date(item.start.dateTime || item.start.date),
    end: new Date(item.end.dateTime || item.end.date)
  }));
}

async function appendBookingToSheet(row) {
  const sheets = await getSheetsClient();

  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
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

async function ensureSheetHeader() {
  const sheets = await getSheetsClient();

  const headerResp = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEET_ID,
    range: "Bookings!A1:H1"
  });

  const values = headerResp.data.values || [];
  if (!values.length) {
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
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
}

module.exports = {
  CONFIG,
  cleanString,
  parseDateOnly,
  formatDateOnly,
  formatTime,
  addDays,
  sameDate,
  normalizeJordanPhoneLocal,
  isValidJordanPhone,
  getPrice,
  getDurationLabel,
  getDayBounds,
  getWorkBounds,
  eventOverlaps,
  listCalendarEventsForDay,
  appendBookingToSheet,
  ensureSheetHeader,
  getCalendarClient
};