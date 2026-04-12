const {
  CONFIG,
  cleanString,
  verifyCancellationToken,
  findBookingRowByEventId,
  updateBookingCancellation,
  getCalendarClient,
  getRequiredEnv
} = require("./lib/google");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const token =
      req.method === "GET"
        ? cleanString(req.query && req.query.token)
        : cleanString(req.body && req.body.token);

    if (!token) {
      throw new Error("رابط الإلغاء غير صالح");
    }

    const payload = verifyCancellationToken(token);
    const booking = await findBookingRowByEventId(payload.eventId);

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
      eventId: payload.eventId
    });

    const cancelledAt = new Date().toLocaleString("en-GB", {
      timeZone: CONFIG.TIMEZONE
    });

    await updateBookingCancellation(booking.rowNumber, cancelledAt);

    return res.status(200).json({
      success: true,
      message: "تم إلغاء الحجز بنجاح",
      cancelledAt,
      bookingDetails: {
        name: booking.values[1] || "-",
        phone: booking.values[2] || "-",
        date: booking.values[3] || "-",
        start: booking.values[4] || "-",
        end: booking.values[5] || "-"
      }
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
