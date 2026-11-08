# Online4Tech Publisher

لوحة مستقلة لإدارة محتوى Online4Tech وجدولة ونشر المنشورات على Facebook وInstagram من خلال واجهات Meta الرسمية، بدون الاعتماد على Metricool.

> المشروع في مرحلة التأسيس. لا يوجد اتصال فعلي بـ Meta أو نشر تلقائي مفعّل حتى الآن.

## أهداف المشروع
- ربط Facebook Page وInstagram Professional بتفويض OAuth رسمي.
- إنشاء وإدارة المسودات والمنشورات والوسائط.
- تقويم يومي وأسبوعي وشهري بتوقيت القاهرة.
- جدولة دائمة تعمل من الخادم حتى لو المتصفح مغلق.
- سجل واضح لحالات النشر والأخطاء وإعادة المحاولة.
- حماية بيانات الدخول والرموز السرية وعدم كشفها للمتصفح.

## التقنية المستهدفة
- Frontend: React + TypeScript + Vite + Tailwind CSS
- Backend: Node.js + TypeScript
- Database: PostgreSQL + Prisma
- Jobs: Redis + BullMQ

## حالة التنفيذ
- [x] إنشاء المستودع المستقل.
- [x] توثيق المعمارية ومتطلبات ربط Meta.
- [x] إضافة نموذج متغيرات البيئة الآمن.
- [x] إعداد هيكل التطبيق وبيئة Docker المحلية واختبارات CI الأساسية.
- [ ] إعداد Meta OAuth واكتشاف الحسابات.
- [ ] بناء محرر المحتوى والتقويم.
- [ ] بناء محرك الجدولة والنشر.
- [ ] اختبار النشر الحقيقي قبل الإطلاق.

## تشغيل البيئة المحلية

يتطلب التشغيل المحلي تثبيت Docker Desktop وDocker Compose.

1. انسخ `.env.example` إلى ملف محلي باسم `.env`.
2. شغّل الخدمات من جذر المستودع:

   ```bash
   docker compose up --build -d
   ```

3. افحص الحالة والسجلات:

   ```bash
   docker compose ps
   docker compose logs -f api worker
   ```

4. افتح واجهة API للفحص: `http://localhost:4000/api/health`.
5. افحص جاهزية قاعدة البيانات: `http://localhost:4000/api/ready`.

لإيقاف الخدمات: `docker compose down`. ولإيقافها مع حذف بيانات قواعد البيانات المحلية فقط: `docker compose down -v`.

> خدمات Docker الحالية مخصصة للتطوير المحلي والتحقق الأولي. الـ Worker يظل متصلًا بـ Redis لكنه لا ينشر منشورات بعد. لا تستخدم ملفات الحاويات الحالية كإعداد إنتاج نهائي قبل فصل بيئة البناء عن التشغيل وتقليل الحزم والصلاحيات.

## البدء
راجع [وثيقة المعمارية](docs/architecture.md) و[قائمة تجهيز Meta](docs/meta-integration-checklist.md) و[قرارات اكتشاف Meta](docs/meta-api-decisions.md) و[متطلبات الاستضافة](docs/deployment-requirements.md).

لا تضع App Secret أو Access Token أو كلمات مرور داخل المستودع. استخدم متغيرات البيئة في بيئة التشغيل فقط.
