// ═══════════════════════════════════════════════════════════
// MonthView — Full month grid calendar with Hijri/Chinese support
// Gregorian: app language | Hijri: Arabic script | Chinese: 中文
// ═══════════════════════════════════════════════════════════

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useCalendarStore } from '@/stores/calendarStore';
import { EventCard } from './EventCard';
import {
  daysInMonth, firstDayOffset, eventsForDate, toDateStr,
  getWeekOrder, getDayName,
} from './calendarUtils';
import {
  toHijri, toChinese, toEasternArabic,
  hijriMonthDays, hijriDayToGregorian,
  chineseMonthDays, chineseDayToGregorian,
  getCalendarWeekdays,
  SYSTEM_COLORS,
} from './calendarConversions';
import type { CalendarEvent } from './calendarTypes';
import type { CalendarSystem } from './calendarConversions';

interface MonthViewProps {
  onDateClick: (date: Date) => void;
  onEventClick: (event: CalendarEvent) => void;
}

interface GridCell {
  day: number | string;    // Display value (number, Arabic numeral, or Chinese character)
  dateStr: string;         // YYYY-MM-DD for event lookup
  gregDate: Date;          // Gregorian Date object
  isOther: boolean;        // Not in current month
  isToday: boolean;
  secondary?: string;      // Secondary calendar text
  monthBadge?: string;     // Badge when a new month starts (Hijri/Chinese)
}

export function MonthView({ onDateClick, onEventClick }: MonthViewProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';
  const { selectedDate, events, settings, filter, calendarSystem } = useCalendarStore();

  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const weekStart = settings.weekStartDay;
  const todayStr = useMemo(() => toDateStr(new Date()), []);

  // Weekday headers — native script per system
  const weekdayHeaders = useMemo(
    () => getCalendarWeekdays(calendarSystem, locale, weekStart),
    [calendarSystem, locale, weekStart],
  );

  // Filter events by active categories
  const filteredEvents = useMemo(() =>
    events.filter((e) =>
      filter.categories.includes(e.category) &&
      (filter.showCompleted || e.status !== 'completed') &&
      e.status !== 'cancelled'
    ),
    [events, filter],
  );

  // Build grid cells based on calendar system
  const cells = useMemo(() => {
    if (calendarSystem === 'gregorian') {
      return buildGregorianCells(year, month, weekStart, todayStr, locale);
    }
    if (calendarSystem === 'hijri') {
      return buildHijriCells(selectedDate, weekStart, todayStr);
    }
    return buildChineseCells(selectedDate, weekStart, todayStr);
  }, [calendarSystem, year, month, weekStart, todayStr, selectedDate, locale]);

  const colors = SYSTEM_COLORS[calendarSystem];

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b shrink-0"
        style={{
          borderColor: 'var(--aegis-border)',
          background: 'var(--aegis-surface-solid)',
        }}>
        {weekdayHeaders.map((name, i) => (
          <div key={i} className="py-2.5 text-center text-[12px] font-semibold uppercase tracking-wider"
            style={{
              color: calendarSystem === 'gregorian'
                ? 'var(--aegis-text-dim, #5a6370)'
                : `${colors.primary}66`, // 40% opacity
            }}>
            {name}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-hidden">
        {cells.map((cell, idx) => {
          const dayEvents = eventsForDate(filteredEvents, cell.dateStr);
          return (
            <div
              key={idx}
              onClick={() => onDateClick(cell.gregDate)}
              className={clsx(
                'p-1.5 flex flex-col gap-0.5 cursor-pointer transition-all min-h-0 overflow-hidden relative',
                cell.isOther && 'opacity-20',
              )}
              style={{
                background: cell.isToday ? colors.todaySurface : colors.surface,
                border: `1px solid ${cell.isToday ? colors.todayBorder : colors.border}`,
                borderRadius: '8px',
                margin: '1px',
              }}
              onMouseEnter={(e) => {
                if (!cell.isToday && !cell.isOther) {
                  (e.currentTarget as HTMLElement).style.background =
                    calendarSystem === 'gregorian' ? 'rgba(255,255,255,0.03)' : `${colors.accent}0D`;
                  (e.currentTarget as HTMLElement).style.borderColor =
                    calendarSystem === 'gregorian' ? 'rgba(255,255,255,0.08)' : `${colors.accent}20`;
                }
              }}
              onMouseLeave={(e) => {
                if (!cell.isToday && !cell.isOther) {
                  (e.currentTarget as HTMLElement).style.background = colors.surface;
                  (e.currentTarget as HTMLElement).style.borderColor = colors.border;
                }
              }}
            >
              {/* Month badge (Hijri/Chinese new month) */}
              {cell.monthBadge && (
                <div className="absolute top-1 end-1 text-[8px] font-bold px-1.5 py-0.5 rounded"
                  style={{
                    background: `${colors.accent}1F`,
                    color: colors.primary,
                  }}>
                  {cell.monthBadge}
                </div>
              )}

              {/* Day number */}
              <div className={clsx(
                'text-[18px] font-bold shrink-0 leading-tight',
                calendarSystem === 'hijri' && 'text-[20px]',
                calendarSystem === 'chinese' && 'text-[18px]',
              )}
                style={{
                  color: cell.isToday
                    ? colors.primary
                    : calendarSystem === 'gregorian'
                      ? 'var(--aegis-text, #e2e8f0)'
                      : colors.primary,
                }}>
                {cell.day}
              </div>

              {/* Secondary calendar text */}
              {cell.secondary && (
                <div className="text-[9px] mt-0.5"
                  style={{
                    color: calendarSystem === 'gregorian' ? colors.accent : 'var(--aegis-text-dim, #8892a4)',
                    opacity: 0.5,
                  }}>
                  {cell.secondary}
                </div>
              )}

              {/* Event dots */}
              {dayEvents.length > 0 && (
                <div className="flex gap-0.5 mt-auto pt-1">
                  {dayEvents.slice(0, 4).map((ev) => (
                    <div key={ev.id} className="w-[5px] h-[5px] rounded-full"
                      style={{ background: ev.color || 'rgb(var(--aegis-primary))' }}
                      onClick={(e) => { e.stopPropagation(); onEventClick(ev); }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── Cell builders ──

function buildGregorianCells(
  year: number, month: number, weekStart: number, todayStr: string, locale: string,
): GridCell[] {
  const totalDays = daysInMonth(year, month);
  const offset = firstDayOffset(year, month, weekStart);
  const prevMonthDays = daysInMonth(year, month - 1);
  const result: GridCell[] = [];

  // Previous month fill
  for (let i = offset - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const prevMonth = month === 0 ? 11 : month - 1;
    const prevYear = month === 0 ? year - 1 : year;
    const gregDate = new Date(prevYear, prevMonth, d);
    const dateStr = toDateStr(gregDate);
    result.push({
      day: d,
      dateStr,
      gregDate,
      isOther: true,
      isToday: false,
    });
  }

  // Current month
  for (let d = 1; d <= totalDays; d++) {
    const gregDate = new Date(year, month, d);
    const dateStr = toDateStr(gregDate);
    result.push({
      day: d,
      dateStr,
      gregDate,
      isOther: false,
      isToday: dateStr === todayStr,
    });
  }

  // Next month fill
  const remaining = (7 - (result.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const nextMonth = month === 11 ? 0 : month + 1;
    const nextYear = month === 11 ? year + 1 : year;
    const gregDate = new Date(nextYear, nextMonth, d);
    const dateStr = toDateStr(gregDate);
    result.push({
      day: d,
      dateStr,
      gregDate,
      isOther: true,
      isToday: false,
    });
  }

  return result;
}

function buildHijriCells(
  selectedDate: Date, weekStart: number, todayStr: string,
): GridCell[] {
  const { daysInMonth: total, firstDayDow, monthStart } = hijriMonthDays(selectedDate);
  const result: GridCell[] = [];

  // Offset from weekStart
  const offset = (firstDayDow - weekStart + 7) % 7;

  // Previous month fill
  for (let i = offset - 1; i >= 0; i--) {
    const gregDate = new Date(monthStart);
    gregDate.setDate(monthStart.getDate() - i - 1);
    const dateStr = toDateStr(gregDate);
    const h = toHijri(gregDate);
    result.push({
      day: h.dayAr,
      dateStr,
      gregDate,
      isOther: true,
      isToday: false,
      secondary: gregDate.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    });
  }

  // Current Hijri month
  for (let d = 1; d <= total; d++) {
    const gregDate = hijriDayToGregorian(monthStart, d);
    const dateStr = toDateStr(gregDate);
    const h = toHijri(gregDate);
    result.push({
      day: toEasternArabic(d),
      dateStr,
      gregDate,
      isOther: false,
      isToday: dateStr === todayStr,
      secondary: gregDate.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    });
  }

  // Next month fill
  const remaining = (7 - (result.length % 7)) % 7;
  for (let i = 0; i < remaining; i++) {
    const gregDate = hijriDayToGregorian(monthStart, total + i + 1);
    const dateStr = toDateStr(gregDate);
    const h = toHijri(gregDate);
    result.push({
      day: h.dayAr,
      dateStr,
      gregDate,
      isOther: true,
      isToday: false,
      secondary: gregDate.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    });
  }

  return result;
}

function buildChineseCells(
  selectedDate: Date, weekStart: number, todayStr: string,
): GridCell[] {
  const { daysInMonth: total, firstDayDow, monthStart } = chineseMonthDays(selectedDate);
  const result: GridCell[] = [];

  const offset = (firstDayDow - weekStart + 7) % 7;

  // Previous month fill
  for (let i = offset - 1; i >= 0; i--) {
    const gregDate = new Date(monthStart);
    gregDate.setDate(monthStart.getDate() - i - 1);
    const dateStr = toDateStr(gregDate);
    const c = toChinese(gregDate);
    result.push({
      day: c.dayName,
      dateStr,
      gregDate,
      isOther: true,
      isToday: false,
      secondary: gregDate.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    });
  }

  // Current Chinese month
  let prevMonth = -1;
  for (let d = 1; d <= total; d++) {
    const gregDate = chineseDayToGregorian(monthStart, d);
    const dateStr = toDateStr(gregDate);
    const c = toChinese(gregDate);

    // Detect new Chinese month start within the grid
    let monthBadge: string | undefined;
    if (prevMonth !== -1 && c.month !== prevMonth) {
      monthBadge = c.monthName;
    }
    prevMonth = c.month;

    result.push({
      day: c.dayName,
      dateStr,
      gregDate,
      isOther: false,
      isToday: dateStr === todayStr,
      secondary: gregDate.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      monthBadge,
    });
  }

  // Next month fill
  const remaining = (7 - (result.length % 7)) % 7;
  for (let i = 0; i < remaining; i++) {
    const gregDate = chineseDayToGregorian(monthStart, total + i + 1);
    const dateStr = toDateStr(gregDate);
    const c = toChinese(gregDate);
    result.push({
      day: c.dayName,
      dateStr,
      gregDate,
      isOther: true,
      isToday: false,
      secondary: gregDate.toLocaleDateString('en', { month: 'short', day: 'numeric' }),
    });
  }

  return result;
}
