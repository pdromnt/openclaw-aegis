// ═══════════════════════════════════════════════════════════
// Calendar Conversions — Hijri (Islamic) & Chinese calendar
// Pure Intl.DateTimeFormat — zero external dependencies
//
// KEY DESIGN RULE:
// - Hijri tab → ALWAYS Arabic script (هجري = عربي)
// - Chinese tab → ALWAYS Chinese characters (农历 = 中文)
// - Gregorian tab → app language
// - UI chrome (buttons, labels) → app language
// ═══════════════════════════════════════════════════════════

export type CalendarSystem = 'gregorian' | 'hijri' | 'chinese';

// ── Hijri (Islamic Umm al-Qura — Saudi official calendar) ──

const hijriNumericFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
  day: 'numeric', month: 'numeric', year: 'numeric',
});

const hijriArabicDayFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
  day: 'numeric',
});

const hijriArabicMonthFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
  month: 'long',
});

const hijriArabicFullFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
  day: 'numeric', month: 'long', year: 'numeric',
});

const hijriArabicMonthYearFmt = new Intl.DateTimeFormat('ar-SA-u-ca-islamic-umalqura', {
  month: 'long', year: 'numeric',
});

export interface HijriDate {
  day: number;        // 1–30
  month: number;      // 1–12
  year: number;       // e.g. 1447
  dayAr: string;      // ٩
  monthNameAr: string; // شوال
  fullAr: string;     // ٩ شوال ١٤٤٧ هـ
  monthYearAr: string; // شوال ١٤٤٧ هـ
}

/** Convert a Gregorian Date to Hijri parts */
export function toHijri(date: Date): HijriDate {
  const parts = hijriNumericFmt.formatToParts(date);
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '1');
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '1');
  const year = parseInt(parts.find(p => p.type === 'year')?.value || '1447');

  return {
    day,
    month,
    year,
    dayAr: hijriArabicDayFmt.format(date).replace(/[^\u0660-\u0669٠-٩]/g, '') || toEasternArabic(day),
    monthNameAr: hijriArabicMonthFmt.format(date),
    fullAr: hijriArabicFullFmt.format(date),
    monthYearAr: hijriArabicMonthYearFmt.format(date),
  };
}

/** Convert number to Eastern Arabic numerals (٠١٢٣٤٥٦٧٨٩) */
export function toEasternArabic(n: number): string {
  return n.toString().replace(/[0-9]/g, d => '٠١٢٣٤٥٦٧٨٩'[parseInt(d)]);
}

/** Get days in a Hijri month by brute-force scanning */
export function hijriMonthDays(gregDate: Date): { daysInMonth: number; firstDayDow: number; monthStart: Date } {
  const { month: hMonth, year: hYear } = toHijri(gregDate);

  // Find the first Gregorian date that maps to day 1 of this Hijri month
  // Scan backwards from gregDate
  let scan = new Date(gregDate);
  scan.setDate(scan.getDate() - 35); // Go back enough

  let monthStart: Date | null = null;
  let monthEnd: Date | null = null;

  for (let i = 0; i < 70; i++) {
    const h = toHijri(scan);
    if (h.year === hYear && h.month === hMonth) {
      if (!monthStart) monthStart = new Date(scan);
      monthEnd = new Date(scan);
    } else if (monthStart && monthEnd) {
      break; // Past the month
    }
    scan.setDate(scan.getDate() + 1);
  }

  if (!monthStart || !monthEnd) {
    monthStart = new Date(gregDate);
    monthEnd = new Date(gregDate);
  }

  const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000) + 1;
  const firstDayDow = monthStart.getDay(); // 0=Sun..6=Sat

  return { daysInMonth, firstDayDow, monthStart };
}

/** Get the Gregorian date for a specific day in the Hijri month visible on screen */
export function hijriDayToGregorian(monthStart: Date, dayInMonth: number): Date {
  const d = new Date(monthStart);
  d.setDate(d.getDate() + dayInMonth - 1);
  return d;
}


// ── Chinese Calendar ──

const chineseNumericFmt = new Intl.DateTimeFormat('en-u-ca-chinese', {
  day: 'numeric', month: 'numeric',
});

const chineseYearFmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
  year: 'numeric',
});

const chineseMonthFmt = new Intl.DateTimeFormat('zh-CN-u-ca-chinese', {
  month: 'short',
});

// Traditional Chinese day names (初一 to 三十)
const CHINESE_DAY_NAMES: Record<number, string> = {
  1:'初一',2:'初二',3:'初三',4:'初四',5:'初五',6:'初六',7:'初七',8:'初八',9:'初九',10:'初十',
  11:'十一',12:'十二',13:'十三',14:'十四',15:'十五',16:'十六',17:'十七',18:'十八',19:'十九',20:'二十',
  21:'廿一',22:'廿二',23:'廿三',24:'廿四',25:'廿五',26:'廿六',27:'廿七',28:'廿八',29:'廿九',30:'三十',
};

// Chinese month names
const CHINESE_MONTH_NAMES: Record<number, string> = {
  1:'正月',2:'二月',3:'三月',4:'四月',5:'五月',6:'六月',
  7:'七月',8:'八月',9:'九月',10:'十月',11:'十一月',12:'十二月',
};

// Zodiac animals
const ZODIAC_ANIMALS: Record<string, { zh: string; emoji: string }> = {
  '子': { zh: '鼠', emoji: '🐀' },
  '丑': { zh: '牛', emoji: '🐂' },
  '寅': { zh: '虎', emoji: '🐅' },
  '卯': { zh: '兔', emoji: '🐇' },
  '辰': { zh: '龙', emoji: '🐲' },
  '巳': { zh: '蛇', emoji: '🐍' },
  '午': { zh: '马', emoji: '🐴' },
  '未': { zh: '羊', emoji: '🐏' },
  '申': { zh: '猴', emoji: '🐒' },
  '酉': { zh: '鸡', emoji: '🐔' },
  '戌': { zh: '狗', emoji: '🐕' },
  '亥': { zh: '猪', emoji: '🐖' },
};

export interface ChineseDate {
  day: number;          // 1–30
  month: number;        // 1–12
  dayName: string;      // 初十
  monthName: string;    // 二月
  yearName: string;     // 2026丙午年
  stemBranch: string;   // 丙午
  zodiacEmoji: string;  // 🐴
  zodiacZh: string;     // 马
  fullZh: string;       // 丙午年 二月初十
}

/** Convert a Gregorian Date to Chinese calendar parts */
export function toChinese(date: Date): ChineseDate {
  const parts = chineseNumericFmt.formatToParts(date);
  const day = parseInt(parts.find(p => p.type === 'day')?.value || '1');
  const month = parseInt(parts.find(p => p.type === 'month')?.value || '1');

  const yearStr = chineseYearFmt.format(date); // e.g. "2026丙午年"
  // Extract stem-branch from year string (2 Chinese characters before 年)
  const match = yearStr.match(/([\u4e00-\u9fff]{2})年/);
  const stemBranch = match ? match[1] : '';
  const branch = stemBranch[1] || '';

  const zodiac = ZODIAC_ANIMALS[branch] || { zh: '', emoji: '' };
  const dayName = CHINESE_DAY_NAMES[day] || `${day}`;
  const monthName = CHINESE_MONTH_NAMES[month] || chineseMonthFmt.format(date);

  return {
    day,
    month,
    dayName,
    monthName,
    yearName: yearStr,
    stemBranch,
    zodiacEmoji: zodiac.emoji,
    zodiacZh: zodiac.zh,
    fullZh: `${stemBranch}年 ${monthName}${dayName}`,
  };
}

/** Get days in a Chinese month by scanning Gregorian dates */
export function chineseMonthDays(gregDate: Date): { daysInMonth: number; firstDayDow: number; monthStart: Date } {
  const { month: cMonth } = toChinese(gregDate);

  // Scan backwards to find the start of this Chinese month
  let scan = new Date(gregDate);
  scan.setDate(scan.getDate() - 35);

  let monthStart: Date | null = null;
  let monthEnd: Date | null = null;

  for (let i = 0; i < 70; i++) {
    const c = toChinese(scan);
    if (c.month === cMonth) {
      if (!monthStart) monthStart = new Date(scan);
      monthEnd = new Date(scan);
    } else if (monthStart && monthEnd) {
      break;
    }
    scan.setDate(scan.getDate() + 1);
  }

  if (!monthStart || !monthEnd) {
    monthStart = new Date(gregDate);
    monthEnd = new Date(gregDate);
  }

  const daysInMonth = Math.round((monthEnd.getTime() - monthStart.getTime()) / 86400000) + 1;
  const firstDayDow = monthStart.getDay();

  return { daysInMonth, firstDayDow, monthStart };
}

/** Get the Gregorian date for a specific day in the Chinese month visible on screen */
export function chineseDayToGregorian(monthStart: Date, dayInMonth: number): Date {
  const d = new Date(monthStart);
  d.setDate(d.getDate() + dayInMonth - 1);
  return d;
}


// ── Shared helpers ──

/** Get secondary calendar text for a Gregorian day cell */
export function getSecondaryText(date: Date, system: CalendarSystem): string {
  if (system === 'gregorian') {
    const h = toHijri(date);
    return `${h.dayAr} ${h.monthNameAr}`;
  }
  if (system === 'hijri') {
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  }
  if (system === 'chinese') {
    return date.toLocaleDateString('en', { month: 'short', day: 'numeric' });
  }
  return '';
}

/** Hijri weekday names — always Arabic */
export const HIJRI_WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** Chinese weekday names — always Chinese */
export const CHINESE_WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** Get weekday names for a calendar system */
export function getCalendarWeekdays(system: CalendarSystem, locale: string, weekStart: number): string[] {
  const order = Array.from({ length: 7 }, (_, i) => (weekStart + i) % 7);

  if (system === 'hijri') {
    return order.map(i => HIJRI_WEEKDAYS[i]);
  }
  if (system === 'chinese') {
    return order.map(i => CHINESE_WEEKDAYS[i]);
  }
  // Gregorian: use app locale
  const base = new Date(2026, 0, 4); // Sunday
  return order.map(i => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(d);
  });
}

/** Theme colors per calendar system */
export const SYSTEM_COLORS = {
  gregorian: {
    primary: 'rgb(var(--aegis-text))',
    accent: 'rgb(var(--aegis-primary))',
    surface: 'rgba(255,255,255,0.015)',
    border: 'rgba(255,255,255,0.04)',
    todayBorder: 'rgba(78,201,176,0.3)',
    todaySurface: 'rgba(78,201,176,0.04)',
  },
  hijri: {
    primary: '#4EC9B0',
    accent: '#4EC9B0',
    surface: 'rgba(78,201,176,0.02)',
    border: 'rgba(78,201,176,0.06)',
    todayBorder: 'rgba(78,201,176,0.4)',
    todaySurface: 'rgba(78,201,176,0.08)',
  },
  chinese: {
    primary: '#f59e0b',
    accent: '#f59e0b',
    surface: 'rgba(245,158,11,0.02)',
    border: 'rgba(245,158,11,0.06)',
    todayBorder: 'rgba(245,158,11,0.4)',
    todaySurface: 'rgba(245,158,11,0.08)',
  },
} as const;
