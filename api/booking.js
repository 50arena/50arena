const {
  CONFIG,
  cleanString,
  isValidJordanPhone,
  normalizeJordanPhoneLocal,
  normalizeJordanPhoneInternational,
  getPrice,
  getDurationLabel,
  formatDateOnly,
  parseDateOnly,
  formatTime,
  nowInTimezone,
  isDateWithinBookingWindow,
  isSlotStepAligned,
  isWithinWorkBounds,
  eventOverlaps,
  listCalendarEventsForDay,
  appendBookingToSheet,
  ensureSheetHeader,
  getCalendarClient,
  getRequiredEnv,
  hasGoogleCredentials,
  createCancellationToken
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
    if (!hasGoogleCredentials()) {
      return res.status(503).json({
        error: "ربط Google غير مكتمل بعد. أضف Environment Variables ثم أعد المحاولة."
      });
    }

    const data = req.body || {};
    const name = cleanString(data.name);
    const phone = cleanString(data.phone);
    const notes = cleanString(data.notes);
    const date = cleanString(data.date);
    const startIso = cleanString(data.startIso);
    const durationMinutes = Number(data.durationMinutes);
    const price = getPrice(durationMinutes);

    if (!name) throw new Error("الاسم مطلوب");
    if (!phone) throw new Error("رقم الهاتف مطلوب");
    if (!isValidJordanPhone(phone)) throw new Error("رقم الهاتف غير صحيح");
    if (!date) throw new Error("التاريخ مطلوب");
    if (!startIso) throw new Error("يرجى اختيار موعد");
    if (!durationMinutes || !price) throw new Error("مدة الحجز غير صحيحة");

    const requestedDate = parseDateOnly(date);
    if (!isDateWithinBookingWindow(requestedDate)) {
      throw new Error("التاريخ خارج فترة الحجز المتاحة");
    }

    const now = nowInTimezone();
    const start = new Date(startIso);
    if (Number.isNaN(start.getTime())) {
      throw new Error("الموعد المختار غير صالح");
    }

    if (start <= now) {
      throw new Error("لا يمكن الحجز في وقت ماضٍ");
    }

    if (!isSlotStepAligned(start)) {
      throw new Error("بداية الموعد غير صحيحة");
    }

    const end = new Date(start.getTime() + durationMinutes * 60000);
    if (!isWithinWorkBounds(start, end)) {
      throw new Error("الموعد المختار خارج أوقات العمل");
    }

    if (formatDateOnly(start) !== formatDateOnly(requestedDate)) {
      throw new Error("التاريخ لا يطابق الموعد المختار");
    }

    const durationLabel = getDurationLabel(durationMinutes);
    const phoneLocal = normalizeJordanPhoneLocal(phone);
    const phoneInternational = normalizeJordanPhoneInternational(phone);
    const dayEvents = await listCalendarEventsForDay(start);
    const taken = dayEvents.some(event =>
      eventOverlaps(start, end, event.start, event.end)
    );

    if (taken) {
      throw new Error("هذا الموعد لم يعد متاحاً");
    }

    const calendar = await getCalendarClient();
    const env = getRequiredEnv();
    const timeText = `${formatTime(start)} - ${formatTime(end)}`;

    const created = await calendar.events.insert({
      calendarId: env.calendarId,
      requestBody: {
        summary: `${CONFIG.BRAND_NAME} - ${name}`,
        description: [
          `الاسم: ${name}`,
          `الهاتف: ${phoneLocal}`,
          `التاريخ: ${date}`,
          `الوقت: ${timeText}`,
          `المدة: ${durationLabel}`,
          `JOD: ${price}`,
          `ملاحظات: ${notes || "-"}`
        ].join("\n"),
        start: {
          dateTime: start.toISOString(),
          timeZone: CONFIG.TIMEZONE
        },
        end: {
          dateTime: end.toISOString(),
          timeZone: CONFIG.TIMEZONE
        }
      }
    });

    try {
      await ensureSheetHeader();
      await appendBookingToSheet({
        createdAt: new Date().toLocaleString("en-GB", {
          timeZone: CONFIG.TIMEZONE
        }),
        name,
        phone: phoneInternational,
        date,
        start: formatTime(start),
        end: formatTime(end),
        price,
        notes: notes || "-",
        eventId: created.data.id || "",
        status: "Active",
        cancelledAt: ""
      });
    } catch (sheetError) {
      if (created.data.id) {
        try {
          await calendar.events.delete({
            calendarId: env.calendarId,
            eventId: created.data.id
          });
        } catch (rollbackError) {
          throw new Error("فشل حفظ الحجز في Google Sheets وتعذر التراجع عن حدث التقويم");
        }
      }

      throw new Error("فشل حفظ الحجز في Google Sheets وتم التراجع عن حدث التقويم");
    }

    const cancelToken = createCancellationToken({
      eventId: created.data.id || "",
      phone: phoneInternational,
      date
    });

    const baseUrl =
      cleanString(process.env.PUBLIC_BASE_URL) ||
      `${req.headers["x-forwarded-proto"] || "https"}://${req.headers.host}`;
    const cancelUrl = `${baseUrl}/cancel?token=${encodeURIComponent(cancelToken)}`;

    const whatsappText = [
      `تأكيد حجز \u200E50 Arena\u200E`,
      `الاسم: ${name}`,
      `رقم الهاتف: ${phoneLocal}`,
      `التاريخ: ${date}`,
      `الوقت: ${timeText}`,
      `المدة: ${durationLabel}`,
      `السعر: ${price} دينار`,
      `الملاحظات: ${notes || "-"}`,
      "",
      "إذا أردت إلغاء الحجز استخدم الرابط التالي:",
      cancelUrl
    ].join("\n");

    return res.status(200).json({
      success: true,
      message: "تم تأكيد الحجز بنجاح، شكرًا لاختيارك ملعب \u200E50 Arena\u200E",
      bookingDetails: {
        name,
        phone: phoneLocal,
        date,
        time: timeText,
        duration: durationLabel,
        price: `${price} دينار`,
        notes: notes || "-"
      },
      whatsappText,
      cancelUrl,
      arenaWhatsappNumber: CONFIG.ARENA_WHATSAPP_NUMBER
    });
  } catch (error) {
    const message = error && error.message ? error.message : "حدث خطأ أثناء تنفيذ الحجز";
    const statusCode = /غير صحيح|مطلوب|غير صالح|خارج أوقات العمل|لا يطابق|لم يعد متاحاً|وقت ماضٍ|فترة الحجز|بداية الموعد/.test(message)
      ? 400
      : /Google|Calendar|Sheets|التقويم|Environment Variables/.test(message)
        ? 503
        : 500;

    return res.status(statusCode).json({ error: message });
  }
};
