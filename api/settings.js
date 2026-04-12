const {
  CONFIG,
  formatDateOnly,
  addDays,
  hasGoogleCredentials,
  getGoogleStatus
} = require("./lib/google");

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

  const now = new Date();
  const googleStatus = getGoogleStatus();

  return res.status(200).json({
    brandName: CONFIG.BRAND_NAME,
    slogan: CONFIG.SLOGAN,
    timezone: CONFIG.TIMEZONE,
    openHour: CONFIG.OPEN_HOUR,
    closeHour: CONFIG.CLOSE_HOUR,
    arenaWhatsappNumber: CONFIG.ARENA_WHATSAPP_NUMBER,
    durations: CONFIG.DURATIONS,
    minDate: formatDateOnly(now),
    maxDate: formatDateOnly(addDays(now, CONFIG.MAX_DAYS_AHEAD)),
    googleReady: hasGoogleCredentials(),
    googleStatus
  });
};
