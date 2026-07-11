// Central i18n dictionary. Arabic (ar) is the primary language; English (en) is
// the LTR toggle. NO hardcoded UI strings anywhere else in the app — always t(key).

export type Locale = 'ar' | 'en';

export const LOCALES: Locale[] = ['ar', 'en'];

export const DIRECTION: Record<Locale, 'rtl' | 'ltr'> = {
  ar: 'rtl',
  en: 'ltr',
};

// A flat key → { ar, en } map keeps lookups trivial and type-safe.
export const dictionary = {
  'app.name': { ar: 'نادي القوة', en: 'Power Gym' },
  'app.tagline': {
    ar: 'طوّر قوتك',
    en: 'Build your strength',
  },

  'lang.toggle': { ar: 'English', en: 'العربية' },

  'nav.home': { ar: 'الرئيسية', en: 'Home' },
  'nav.plans': { ar: 'الباقات', en: 'Plans' },
  'nav.branches': { ar: 'الفروع', en: 'Branches' },
  'nav.trainers': { ar: 'المدربون', en: 'Trainers' },
  'nav.contact': { ar: 'تواصل معنا', en: 'Contact' },
  'nav.join': { ar: 'اشترك الآن', en: 'Join Now' },
  'nav.login': { ar: 'تسجيل الدخول', en: 'Login' },
  'nav.logout': { ar: 'تسجيل الخروج', en: 'Logout' },

  'dashboard.title': { ar: 'لوحة التحكم', en: 'Dashboard' },
  'dashboard.members': { ar: 'الأعضاء', en: 'Members' },
  'dashboard.checkin': { ar: 'تسجيل الدخول للنادي', en: 'Check-in' },
  'dashboard.payments': { ar: 'المدفوعات', en: 'Payments' },
  'dashboard.plans': { ar: 'الباقات', en: 'Plans' },
  'dashboard.analytics': { ar: 'التحليلات', en: 'Analytics' },
  'dashboard.settings': { ar: 'الإعدادات', en: 'Settings' },
  'dashboard.pending': { ar: 'طلبات معلّقة', en: 'Pending sign-ups' },

  'portal.title': { ar: 'حسابي', en: 'My Account' },
  'portal.subscription': { ar: 'اشتراكي', en: 'My Subscription' },
  'portal.payments': { ar: 'مدفوعاتي', en: 'My Payments' },
  'portal.checkins': { ar: 'زياراتي', en: 'My Check-ins' },
  'portal.renew': { ar: 'طلب تجديد', en: 'Request Renewal' },

  'auth.login.title': { ar: 'تسجيل الدخول', en: 'Sign in' },
  'auth.email': { ar: 'البريد الإلكتروني', en: 'Email' },
  'auth.password': { ar: 'كلمة المرور', en: 'Password' },
  'auth.submit': { ar: 'دخول', en: 'Sign in' },
  'auth.signing_in': { ar: 'جارٍ الدخول…', en: 'Signing in…' },
  'auth.error.invalid': { ar: 'بيانات الدخول غير صحيحة', en: 'Invalid credentials' },
  'auth.error.no_profile': {
    ar: 'لا يوجد ملف تعريف مرتبط بهذا الحساب. تواصل مع الإدارة.',
    en: 'No profile linked to this account. Contact the admin.',
  },

  'role.super_admin': { ar: 'مدير عام', en: 'Super Admin' },
  'role.reception': { ar: 'موظف استقبال', en: 'Reception' },
  'role.member': { ar: 'عضو', en: 'Member' },

  'status.active': { ar: 'نشط', en: 'Active' },
  'status.expiring': { ar: 'ينتهي قريباً', en: 'Expiring soon' },
  'status.expired': { ar: 'منتهي', en: 'Expired' },
  'status.frozen': { ar: 'مجمّد', en: 'Frozen' },
  'status.pending': { ar: 'معلّق', en: 'Pending' },

  'common.loading': { ar: 'جارٍ التحميل…', en: 'Loading…' },
  'common.soon': { ar: 'قريباً', en: 'Coming soon' },
  'common.back_home': { ar: 'العودة للرئيسية', en: 'Back home' },

  'error.config.title': { ar: 'الإعداد غير مكتمل', en: 'Configuration missing' },
  'error.config.body': {
    ar: 'لم يتم ضبط رابط ومفتاح Supabase. أضفهما في ملف ‎.env‎.',
    en: 'Supabase URL and anon key are not set. Add them to your .env file.',
  },

  'notfound.title': { ar: 'الصفحة غير موجودة', en: 'Page not found' },
} as const;

export type MessageKey = keyof typeof dictionary;
