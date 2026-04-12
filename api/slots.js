const {
  parseDateOnly,
  formatDateOnly,
  formatTime,
  sameDate,
  nowInTimezone,
  isDateWithinBookingWindow,
  getWorkBounds,
  eventOverlaps,
  tryListCalendarEventsForDay,
  getGoogleStatus,
  getPrice,
  getDurationLabel
} = require("./lib/google");

function buildSlots(targetDate, durationMinutes, events) {
  const { openTime, closeTime } = getWorkBounds(targetDate);
  const now = nowInTimezone();
  const slots = [];

  for (
    let start = new Date(openTime);
    start.getTime() + durationMinutes * 60000 <= closeTime.getTime();
    start = new Date(start.getTime() + 30 * 60000)
  ) {
    const end = new Date(start.getTime() + durationMinutes * 60000);

    if (sameDate(targetDate, now) && start <= now) {
      continue;
    }

    const hasOverlap = events.some(event =>
      eventOverlaps(start, end, event.start, event.end)
    );

    if (!hasOverlap) {
      slots.push({
        value: start.toISOString(),
        label: `${formatTime(start)} - ${formatTime(end)}`,
        durationLabel: getDurationLabel(durationMinutes)
      });
    }
  }

  return slots;
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
    const dateStr = String(req.query.date || "");
    const durationMinutes = Number(req.query.durationMinutes || 0);

    if (!dateStr) {
      return res.status(400).json({ error: "التاريخ مطلوب" });
    }

    if (!durationMinutes || !getPrice(durationMinutes)) {
      return res.status(400).json({ error: "مدة الحجز غير صحيحة" });
    }

    const targetDate = parseDateOnly(dateStr);
    if (formatDateOnly(targetDate) !== dateStr) {
      return res.status(400).json({ error: "صيغة التاريخ غير صحيحة" });
    }

    if (!isDateWithinBookingWindow(targetDate)) {
      return res.status(400).json({ error: "التاريخ خارج فترة الحجز المتاحة" });
    }

    const googleResult = await tryListCalendarEventsForDay(targetDate);
    const events = googleResult.events;
    const googleStatus = getGoogleStatus();
    const slots = buildSlots(targetDate, durationMinutes, events);

    return res.status(200).json({
      date: dateStr,
      durationMinutes,
      durationLabel: getDurationLabel(durationMinutes),
      googleReady: googleStatus.ready && googleResult.ok,
      source: googleResult.source,
      notice: googleResult.message,
      slots
    });
  } catch (error) {
    try {
      const dateStr = String(req.query.date || "");
      const durationMinutes = Number(req.query.durationMinutes || 0);
      const targetDate = parseDateOnly(dateStr);
      const slots = durationMinutes ? buildSlots(targetDate, durationMinutes, []) : [];

      return res.status(200).json({
        date: dateStr,
        durationMinutes,
        durationLabel: durationMinutes ? getDurationLabel(durationMinutes) : "",
        googleReady: false,
        source: "mock",
        notice: error.message || "حدث خطأ أثناء تحميل المواعيد، وتم عرض مواعيد مؤقتة",
        slots
      });
    } catch (fallbackError) {}

    return res.status(200).json({
      date: String(req.query.date || ""),
      durationMinutes: Number(req.query.durationMinutes || 0),
      durationLabel: "",
      googleReady: false,
      source: "mock",
      notice: error.message || "حدث خطأ أثناء تحميل المواعيد، وتم عرض مواعيد مؤقتة",
      slots: []
    });
  }
};
