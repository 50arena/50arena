const {
  CONFIG,
  cleanString,
  findBookingRowByEventId,
  updateBookingCancellation,
  getCalendarClient,
  getRequiredEnv
} = require("./lib/google");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const eventId = cleanString(req.body && req.body.eventId);

    if (!eventId) {
      throw new Error("معرف الحجز غير صالح");
    }

    const booking = await findBookingRowByEventId(eventId);

    if (!booking) {
      throw new Error("لم يتم العثور على هذا الحجز");
    }

    const status = String(booking.values[9] || "").trim();
    if (status === "Cancelled") {
      return res.status(200).json({
        success: true,
        alreadyCancelled: true,
        message: "تم إلغاء هذا الحجز مسبقًا"
      });
    }

    const calendar = await getCalendarClient();
    const env = getRequiredEnv();

    await calendar.events.delete({
      calendarId: env.calendarId,
      eventId
    });

    const cancelledAt = new Date().toLocaleString("en-GB", {
      timeZone: CONFIG.TIMEZONE
    });

    await updateBookingCancellation(booking.rowNumber, cancelledAt);

    return res.status(200).json({
      success: true,
      message: "تم إلغاء الحجز بنجاح",
      cancelledAt
    });
  } catch (error) {
    const message = error && error.message ? error.message : "تعذر إلغاء الحجز";
    const statusCode =
      /غير صالح|العثور|مسبقًا/.test(message) ? 400 :
      /Google|Calendar|التقويم/.test(message) ? 503 :
      500;

    return res.status(statusCode).json({ error: message });
  }
};
