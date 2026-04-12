# 50 Arena

موقع حجز لملعب `50 Arena` مع ربط مباشر بـ Google Calendar وGoogle Sheets، وإرسال تأكيد الحجز عبر واتساب، مع إمكانية إلغاء الحجز من رابط خاص.

## المميزات

- واجهة عربية بسيطة وسريعة
- عرض المواعيد المتاحة حسب اليوم والمدة
- منع الحجز على المواعيد المشغولة من Google Calendar
- حفظ الحجوزات في Google Sheets
- إرسال تفاصيل الحجز عبر واتساب
- رابط إلغاء حجز آمن لكل حجز
- صفحة إلغاء حجز مستقلة
- لوحة إدارة أولية عبر `admin.html`

## هيكل المشروع

```text
api/
  lib/
    google.js
  admin.js
  booking.js
  cancel-booking.js
  settings.js
  slots.js

cancel/
  index.html

admin.html
index.html
package.json
README.md
