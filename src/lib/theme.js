// نظام التصميم الموحّد لمنجزي — كل الصفحات تستورد قيمها من هنا
// بدل تكرار ألوان/أحجام inline بكل ملف لحاله

export const colors = {
  // الأخضر — نجاح / إجراء رئيسي / إثرائي
  primary: '#0b7a4b',
  primaryDark: '#085c38',
  primaryTint: '#eaf6ee',

  // الكهرماني — يحتاج انتباه / علاجي
  amber: '#8a5a00',
  amberBorder: '#e0b25c',
  amberTint: '#fdf3e2',

  // الأحمر — حرج / حذف / خروج
  red: '#a10000',
  redBorder: '#c62828',
  redTint: '#fdecea',

  // الحبر والنصوص
  ink: '#14261e',
  text: '#4a4a4a',
  textMuted: '#8a8a8a',

  // الخلفيات والحدود
  pageBg: '#fafafa',
  cardBg: '#ffffff',
  border: '#e2e2e2',
};

export const font = {
  family: "'IBM Plex Sans Arabic', sans-serif",
  weightBold: 700,
  weightMedium: 500,
  weightRegular: 400,
};

export const radius = {
  card: 12,
  button: 8,
  pill: 20,
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const shadow = {
  card: '0 1px 3px rgba(0,0,0,0.05)',
};
