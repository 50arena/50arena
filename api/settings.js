const {
  CONFIG,
  formatDateOnly,
  addDays
} = require("./_lib/google");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  return res.status(200).json({
    durations: CONFIG.DURATIONS,
    minDate: formatDateOnly(new Date()),
    maxDate: formatDateOnly(addDays(new Date(), CONFIG.MAX_DAYS_AHEAD))
  });
};
