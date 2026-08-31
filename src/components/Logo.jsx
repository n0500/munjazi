import { colors, font } from '../lib/theme';

// الشعار الرسمي لمنجزي — أيقونة الأعمدة المتصاعدة + الوردمارك
// size: 'sm' (شريط علوي)، 'md' (افتراضي)، 'lg' (صفحة تسجيل الدخول)
export default function Logo({ size = 'md' }) {
  const dims = {
    sm: { icon: 28, ar: 15, en: 6 },
    md: { icon: 40, ar: 22, en: 8 },
    lg: { icon: 56, ar: 30, en: 10 },
  }[size];

  return (
    <div dir="rtl" style={{ display: 'flex', alignItems: 'center', gap: dims.icon * 0.28 }}>
      <svg width={dims.icon} height={dims.icon} viewBox="0 0 46 46">
        <rect x="1" y="1" width="44" height="44" rx="12" fill={colors.primary} />
        <rect x="13" y="26" width="6" height="8" rx="2" fill="#ffffff" />
        <rect x="20" y="19" width="6" height="15" rx="2" fill="#ffffff" />
        <rect x="27" y="12" width="6" height="22" rx="2" fill="#ffffff" />
      </svg>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ fontFamily: font.family, fontSize: dims.ar, fontWeight: font.weightBold, color: colors.ink, lineHeight: 1 }}>
          منجزي
        </div>
        <div style={{ fontFamily: font.family, fontSize: dims.en, fontWeight: font.weightMedium, color: colors.primary, letterSpacing: dims.en * 0.3 }}>
          MUNJAZI
        </div>
      </div>
    </div>
  );
}
