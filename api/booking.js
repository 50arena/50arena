const {
  CONFIG,
  cleanString,
  isValidJordanPhone,
  normalizeJordanPhoneLocal,
  getPrice,
  getDurationLabel,
  formatTime,
  eventOverlaps,
  listCalendarEventsForDay,
  appendBookingToSheet,
  ensureSheetHeader,
  getCalendarClient
} = require("./_lib/google");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const data = req.body || {};

    const name = cleanString(data.name);
    const phone = cleanString(data.phone);
    const notes = cleanString(data.notes || "");
    const date = cleanString(data.date);
    const startIso = cleanString(data.startIso);
    const durationMinutes = Number(data.durationMinutes);

    if (!name) throw new Error("الاسم مطلوب");
    if (!phone) throw new Error("رقم الهاتف مطلوب");
    if (!isValidJordanPhone(phone)) throw new Error("رقم الهاتف غير صحيح");
    if (!date) throw new Error("التاريخ مطلوب");
    if (!startIso) throw new Error("يرجى اختيار موعد");
    if (!durationMinutes) throw new Error("مدة الحجز مطلوبة");

    const start = new Date(startIso);
    const end = new Date(start.getTime() + durationMinutes * 60000);
    const price = getPrice(durationMinutes);
    const durationLabel = getDurationLabel(durationMinutes);
    const phoneLocal = normalizeJordanPhoneLocal(phone);

    const dayEvents = await listCalendarEventsForDay(start);
    const taken = dayEvents.some(ev => eventOverlaps(start, end, ev.start, ev.end));
    if (taken) throw new Error("هذا الموعد لم يعد متاحاً");

    const calendar = await getCalendarClient();
    const created = await calendar.events.insert({
      calendarId: process.env.GOOGLE_CALENDAR_ID,
      requestBody: {
        summary: `${CONFIG.BRAND_NAME} - ${name}`,
        description:
          `الاسم: ${name}\n` +
          `الهاتف: ${phoneLocal}\n` +
          `التاريخ: ${date}\n` +
          `الوقت: ${formatTime(start)} - ${formatTime(end)}\n` +
          `المدة: ${durationLabel}\n` +
          `JOD: ${price}\n` +
          `ملاحظات: ${notes || "-"}`,
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

    await ensureSheetHeader();
    await appendBookingToSheet({
      name,
      phone: phoneLocal,
      date,
      start: start.toISOString(),
      end: end.toISOString(),
      price,
      notes: notes || "-",
      eventId: created.data.id || ""
    });

    const whatsappText =
      `تأكيد حجز *${CONFIG.BRAND_NAME}*\n` +
      `الاسم: ${name}\n` +
      `رقم الهاتف: ${phoneLocal}\n` +
      `التاريخ: ${date}\n` +
      `الوقت: ${formatTime(start)} - ${formatTime(end)}\n` +
      `المدة: ${durationLabel}\n` +
      `السعر: ${price} دينار\n` +
      `الملاحظات: ${notes || "-"}`;

    return res.status(200).json({
      success: true,
      message: "تم تأكيد الحجز بنجاح",
      bookingDetails: {
        name,
        phone: phoneLocal,
        date,
        time: `${formatTime(start)} - ${formatTime(end)}`,
        duration: durationLabel,
        price: `${price} دينار`,
        notes: notes || "-"
      },
      whatsappText,
      arenaWhatsappNumber: CONFIG.ARENA_WHATSAPP_NUMBER
    });
  } catch (error) {
    return res.status(400).json({ error: error.message || "حدث خطأ" });
  }
};