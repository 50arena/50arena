const {
  parseDateOnly,
  formatTime,
  sameDate,
  getWorkBounds,
  eventOverlaps,
  listCalendarEventsForDay
} = require("./_lib/google");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const dateStr = String(req.query.date || "");
    const durationMinutes = Number(req.query.durationMinutes || 0);

    if (!dateStr) {
      return res.status(400).json({ error: "التاريخ مطلوب" });
    }

    if (!durationMinutes) {
      return res.status(400).json({ error: "مدة الحجز مطلوبة" });
    }

    const targetDate = parseDateOnly(dateStr);
    const events = await listCalendarEventsForDay(targetDate);
    const { openTime, closeTime } = getWorkBounds(targetDate);

    const slots = [];
    const now = new Date();

    for (
      let start = new Date(openTime);
      start.getTime() + durationMinutes * 60000 <= closeTime.getTime();
      start = new Date(start.getTime() + 30 * 60000)
    ) {
      const end = new Date(start.getTime() + durationMinutes * 60000);

      if (sameDate(targetDate, now) && start <= now) {
        continue;
      }

      const hasOverlap = events.some(ev => eventOverlaps(start, end, ev.start, ev.end));
      if (!hasOverlap) {
        slots.push({
          value: start.toISOString(),
          label: `${formatTime(start)} - ${formatTime(end)}`
        });
      }
    }

    return res.status(200).json(slots);
  } catch (error) {
    return res.status(500).json({ error: error.message || "حدث خطأ" });
  }
};