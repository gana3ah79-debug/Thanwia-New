# Thanwia-New — رحلة الثانوية

مشروع Android مستقل باسم Thanwia-New، منفصل عن مشروع Thanwia القديم.

- Android 6.0+ (API 23)
- واجهة مستقلة جديدة
- Supabase للمصادقة والبيانات
- محرك أسئلة AI عبر Edge Function
- لا يتم تحميل ملفات الواجهة القديمة
- applicationId مستقل: `com.thanwia.newapp`

## البناء
المشروع موجود داخل `android_project`.

## واجهة التطبيق
الملف الرئيسي: `android_project/app/src/main/assets/www/index.html`

وحدة التطبيق: `android_project/app/src/main/assets/www/thanwia-new-app.js`

محرك الأسئلة: `android_project/app/src/main/assets/www/ai-question-engine.js`
