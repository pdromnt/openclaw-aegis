// ═══════════════════════════════════════════════════════════
// TodayCard — Sidebar card showing today in 3 calendar systems
// Native scripts: Hijri = Arabic, Chinese = 中文
// ═══════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toHijri, toChinese, SYSTEM_COLORS } from './calendarConversions';

export function TodayCard() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';

  const today = useMemo(() => {
    const d = new Date();
    const hijri = toHijri(d);
    const chinese = toChinese(d);
    const gregStr = d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });

    return { gregStr, hijri, chinese };
  }, [locale]);

  const rows = [
    {
      color: SYSTEM_COLORS.gregorian.primary,
      dotColor: 'var(--aegis-text, #e2e8f0)',
      text: today.gregStr,
    },
    {
      color: SYSTEM_COLORS.hijri.primary,
      dotColor: SYSTEM_COLORS.hijri.primary,
      text: today.hijri.fullAr,
    },
    {
      color: SYSTEM_COLORS.chinese.primary,
      dotColor: SYSTEM_COLORS.chinese.primary,
      text: `${today.chinese.zodiacEmoji} ${today.chinese.fullZh}`,
    },
  ];

  return (
    <div className="rounded-xl p-3 border"
      style={{
        borderColor: 'var(--aegis-border)',
        background: 'rgba(255,255,255,0.02)',
      }}>
      <div className="text-[10px] font-semibold uppercase tracking-wider mb-2"
        style={{ color: 'var(--aegis-text-dim, #5a6370)' }}>
        {t('calendar.today')}
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((row, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: row.dotColor }} />
            <span className="text-[12px] font-semibold" style={{ color: row.color }}>
              {row.text}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
