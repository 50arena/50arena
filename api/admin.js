const {
  CONFIG,
  getGoogleStatus,
  getRequiredEnv,
  getSheetsClient,
  formatDateOnly
} = require("./lib/google");

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase();
}

function buildColumnMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    map[normalizeHeader(header)] = index;
  });
  return map;
}

function pickCell(row, map, aliases, fallbackIndex = -1) {
  for (const alias of aliases) {
    const index = map[normalizeHeader(alias)];
    if (typeof index === "number") {
      return String(row[index] || "").trim();
    }
  }

  if (fallbackIndex >= 0) {
    return String(row[fallbackIndex] || "").trim();
  }

  return "";
}

function parsePrice(value) {
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : 0;
}

function parseDurationHours(startText, endText) {
  const normalize = value => {
    const text = String(value || "").trim();
    const match = text.match(/(\d{1,2}):(\d{2})/);
    if (!match) {
      return null;
    }

    let hour = Number(match[1]);
    const minute = Number(match[2]);
    const isPm = /م/i.test(text);
    const isAm = /ص/i.test(text);

    if (isPm && hour !== 12) {
      hour += 12;
    }

    if (isAm && hour === 12) {
      hour = 0;
    }

    return hour * 60 + minute;
  };

  const startMinutes = normalize(startText);
  const endMinutes = normalize(endText);

  if (startMinutes === null || endMinutes === null) {
    return 0;
  }

  return Math.max(0, (endMinutes - startMinutes) / 60);
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)} دينار`;
}

function compareBookings(a, b) {
  if (a.date === b.date) {
    return a.startValue.localeCompare(b.startValue);
  }
  return a.date.localeCompare(b.date);
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const googleStatus = getGoogleStatus();
    if (!googleStatus.ready) {
      return res.status(503).json({ error: googleStatus.message });
    }

    const env = getRequiredEnv();
    const sheets = await getSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: env.sheetId,
      range: "Bookings!A:Z"
    });

    const values = response.data.values || [];
    if (!values.length) {
      return res.status(200).json({
        brandName: CONFIG.BRAND_NAME,
        today: formatDateOnly(new Date()),
        summary: {
          todayBookings: 0,
          todayRevenue: formatMoney(0),
          monthBookings: 0,
          monthRevenue: formatMoney(0),
          todayHours: 0
        },
        phoneNumbersToday: [],
        upcomingToday: [],
        bookings: []
      });
    }

    const headers = values[0];
    const rows = values.slice(1);
    const columnMap = buildColumnMap(headers);
    const today = formatDateOnly(new Date());
    const currentMonth = today.slice(0, 7);

    const bookings = rows
      .filter(row => row.some(cell => String(cell || "").trim() !== ""))
      .map(row => {
        const record = {
          createdAt: pickCell(row, columnMap, ["Created At"], 0),
          name: pickCell(row, columnMap, ["Name"], 1),
          phone: pickCell(row, columnMap, ["Phone"], 2),
          date: pickCell(row, columnMap, ["Date"], 3),
          start: pickCell(row, columnMap, ["Start"], 4),
          end: pickCell(row, columnMap, ["End"], 5),
          jod: pickCell(row, columnMap, ["JOD"], 6),
          notes: pickCell(row, columnMap, ["Notes"], 7),
          eventId: pickCell(row, columnMap, ["Calendar Event ID"], 8),
          status: pickCell(row, columnMap, ["Status"], 9) || "Active",
          cancelledAt: pickCell(row, columnMap, ["Cancelled At"], 10)
        };

        if (!record.date && record.createdAt && /^\d{4}-\d{2}-\d{2}$/.test(record.createdAt)) {
          record.date = record.createdAt;
        }

        record.priceValue = parsePrice(record.jod);
        record.durationHours = parseDurationHours(record.start, record.end);
        record.startValue = record.start;

        return record;
      })
      .filter(record => record.date);

    bookings.sort(compareBookings);

    const activeBookings = bookings.filter(record => record.status !== "Cancelled");
    const todayBookings = activeBookings.filter(record => record.date === today);
    const monthBookings = activeBookings.filter(record => record.date.startsWith(currentMonth));
    const upcomingToday = todayBookings.slice().sort(compareBookings);
    const phoneNumbersToday = [...new Set(todayBookings.map(record => record.phone).filter(Boolean))];

    return res.status(200).json({
      brandName: CONFIG.BRAND_NAME,
      today,
      summary: {
        todayBookings: todayBookings.length,
        todayRevenue: formatMoney(todayBookings.reduce((sum, record) => sum + record.priceValue, 0)),
        monthBookings: monthBookings.length,
        monthRevenue: formatMoney(monthBookings.reduce((sum, record) => sum + record.priceValue, 0)),
        todayHours: todayBookings.reduce((sum, record) => sum + record.durationHours, 0)
      },
      phoneNumbersToday,
      upcomingToday,
      bookings: activeBookings
    });
  } catch (error) {
    return res.status(500).json({
      error: error && error.message ? error.message : "تعذر تحميل لوحة الإدارة"
    });
  }
};
