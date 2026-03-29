// ═══════════════════════════════════════════════════════════
// CalendarSystemTabs — Gregorian / Hijri / Chinese tab bar
// Native scripts: Hijri always Arabic, Chinese always 中文
// ═══════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { CalendarSystem } from './calendarConversions';
import { toHijri, toChinese, SYSTEM_COLORS } from './calendarConversions';
import { getMonthName } from './calendarUtils';

interface CalendarSystemTabsProps {
  activeSystem: CalendarSystem;
  onSystemChange: (system: CalendarSystem) => void;
  selectedDate: Date;
}

export function CalendarSystemTabs({ activeSystem, onSystemChange, selectedDate }: CalendarSystemTabsProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';

  const tabs = useMemo(() => {
    const hijri = toHijri(selectedDate);
    const chinese = toChinese(selectedDate);
    const gregTitle = `${getMonthName(selectedDate.getMonth(), locale)} ${selectedDate.getFullYear()}`;

    return [
      {
        id: 'gregorian' as CalendarSystem,
        icon: '📅',
        name: t('calendar.systems.gregorian'),
        sub: gregTitle,
        activeClass: 'active-greg',
      },
      {
        id: 'hijri' as CalendarSystem,
        icon: '🌙',
        name: t('calendar.systems.hijri'),
        sub: hijri.monthYearAr,
        activeClass: 'active-hijri',
      },
      {
        id: 'chinese' as CalendarSystem,
        icon: '🏮',
        name: t('calendar.systems.chinese'),
        sub: `${chinese.zodiacEmoji} ${chinese.stemBranch}年 ${chinese.monthName}`,
        activeClass: 'active-chinese',
      },
    ];
  }, [selectedDate, locale, t]);

  return (
    <div className="flex gap-0 px-5 border-b shrink-0"
      style={{
        borderColor: 'var(--aegis-border)',
        background: 'rgba(255,255,255,0.01)',
      }}>
      {tabs.map((tab) => {
        const isActive = activeSystem === tab.id;
        const colors = SYSTEM_COLORS[tab.id];

        return (
          <button
            key={tab.id}
            onClick={() => onSystemChange(tab.id)}
            className="flex items-center gap-1.5 px-5 py-2.5 text-[13px] font-semibold border-b-2 transition-all"
            style={{
              color: isActive ? colors.primary : 'var(--aegis-text-dim, #5a6370)',
              borderBottomColor: isActive ? colors.primary : 'transparent',
              background: 'transparent',
            }}
          >
            <span>{tab.icon}</span>
            <span>{tab.name}</span>
            <span className="text-[10px] opacity-50 ms-1">{tab.sub}</span>
          </button>
        );
      })}
    </div>
  );
}
