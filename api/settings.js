module.exports = async function handler(req, res) {
  return res.status(200).json({
    durations: [
      { label: "ساعة", value: 60, price: 15 },
      { label: "ساعة ونصف", value: 90, price: 20 },
      { label: "ساعتان", value: 120, price: 25 },
      { label: "3 ساعات", value: 180, price: 35 }
    ],
    minDate: "2026-04-11",
    maxDate: "2026-05-11"
  });
};
