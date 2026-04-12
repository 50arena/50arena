# 50 Arena

موقع حجز ملعب 50 Arena، يعمل على Vercel باستخدام Serverless Functions، مع ربط Google Calendar وGoogle Sheets.

## المميزات

- واجهة عربية
- خط Tajawal
- عرض المواعيد المتاحة
- الحجز حسب المدة
- إضافة الحجز إلى Google Calendar
- إضافة الحجز إلى Google Sheets
- ملخص حجز للمستخدم
- زر تأكيد عبر واتساب
- جاهز للنشر على Vercel

## التقنيات المستخدمة

- HTML / CSS / JavaScript
- Vercel Serverless Functions
- Node.js
- Google Calendar API
- Google Sheets API
- Service Account

## هيكل المشروع

```text
api/
  booking.js
  settings.js
  slots.js
  lib/
    google.js

index.html
package.json
README.md
