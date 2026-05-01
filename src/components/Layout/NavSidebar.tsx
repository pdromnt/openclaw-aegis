// ═══════════════════════════════════════════════════════════
// NavSidebar — Compact icon-only sidebar (64px)
// Matches conceptual design: icons + active bar + user avatar
// ═══════════════════════════════════════════════════════════

import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import {
  LayoutDashboard, MessageCircle, Kanban, DollarSign,
  Clock, Bot, Settings, Settings2, Blocks, Users, Puzzle,
  Terminal, CalendarDays, Mic,
} from 'lucide-react';
import { useSettingsStore } from '@/stores/settingsStore';
import { getDirection } from '@/i18n';
import clsx from 'clsx';

interface NavItem {
  to: string;
  icon: any;
  labelKey: string;
  badge?: string;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const navSections: NavSection[] = [
  {
    label: 'main',
    items: [
      { to: '/', icon: LayoutDashboard, labelKey: 'nav.dashboard' },
      { to: '/chat', icon: MessageCircle, labelKey: 'nav.chat' },
    ],
  },
  {
    label: 'monitor',
    items: [
      { to: '/cron', icon: Clock, labelKey: 'nav.cron' },
      { to: '/agents', icon: Bot, labelKey: 'nav.agents' },
      { to: '/costs', icon: DollarSign, labelKey: 'nav.costs' },
    ],
  },
  {
    label: 'tools',
    items: [
      { to: '/terminal', icon: Terminal, labelKey: 'nav.terminal' },
      { to: '/calendar', icon: CalendarDays, labelKey: 'nav.calendar' },
      { to: '/voice', icon: Mic, labelKey: 'nav.voiceLive' },
    ],
  },
  {
    label: 'more',
    items: [
      { to: '/plugins', icon: Blocks, labelKey: 'nav.plugins' },
      { to: '/config', icon: Settings2, labelKey: 'nav.config' },
    ],
  },
];

// Flat list for prefetch
const navItems = navSections.flatMap((s) => s.items);


// Prefetch heavy lazy chunks on hover (before click)
const PREFETCH_MAP: Record<string, () => void> = {
  '/chat': () => import('@/pages/ChatPage'),
  '/costs': () => import('@/pages/FullAnalytics'),
  '/cron': () => import('@/pages/CronMonitor'),
  '/terminal': () => import('@/pages/TerminalPage'),
};

export function NavSidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const { language } = useSettingsStore();
  const dir = getDirection(language);
  const isRTL = dir === 'rtl';

  const borderClass = isRTL ? 'border-l' : 'border-r';

  return (
    <div
      className={clsx(
        'w-[64px] shrink-0 flex flex-col items-center',
        'chrome-bg', borderClass, 'border-aegis-border',
        'py-3 relative'
      )}
    >
      {/* Navigation Icons — Sectioned */}
      <nav className="flex-1 flex flex-col items-center gap-0 overflow-y-auto overflow-x-hidden scrollbar-none">
        {navSections.map((section, si) => (
          <div key={section.label || si} className="w-full flex flex-col items-center">
            {/* Section divider (skip first) */}
            {si > 0 && (
              <div className="w-[28px] h-px bg-[rgb(var(--aegis-overlay)/0.06)] my-1.5" />
            )}

            {/* Section items */}
            <div className="flex flex-col items-center gap-1">
              {section.items.map((item) => {
                const isActive = location.pathname === item.to ||
                  (item.to !== '/' && location.pathname.startsWith(item.to));

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onMouseEnter={() => PREFETCH_MAP[item.to]?.()}
                    aria-current={isActive ? 'page' : undefined}
                    className={clsx(
                      'relative w-[44px] h-[44px]',
                      'flex items-center justify-center',
                      'transition-all duration-300 group',
                      isActive
                        ? 'nav-icon-active-glow text-aegis-primary'
                        : 'text-aegis-text-muted hover:text-aegis-text-secondary hover:bg-[rgb(var(--aegis-overlay)/0.04)]'
                    )}
                    style={{ borderRadius: 'var(--aegis-radius)' }}
                  >
                    {isActive && (
                      <motion.div
                        layoutId="nav-active-bar"
                        className={clsx(
                          'absolute top-1/2 -translate-y-1/2',
                          'w-[3px] h-[20px] rounded-full',
                          'bg-aegis-primary',
                          'shadow-[0_0_12px_rgb(var(--aegis-primary)/0.4)]',
                          isRTL ? '-right-[12px]' : '-left-[12px]'
                        )}
                        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                      />
                    )}

                    <div className="relative">
                      <item.icon size={18} className={clsx(isActive && 'icon-halo-teal')} />
                      {item.badge && (
                        <span className="absolute -top-1.5 -right-2 text-[8px]">{item.badge}</span>
                      )}
                    </div>

                    <div className={clsx(
                      'absolute top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg',
                      'bg-aegis-elevated-solid border border-aegis-border shadow-lg',
                      'text-aegis-text text-[11px] font-medium whitespace-nowrap',
                      'opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50',
                      isRTL ? 'right-full mr-3' : 'left-full ml-3'
                    )}>
                      {t(item.labelKey)}
                    </div>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom: Settings */}
      <div className="pt-3">
        <NavLink
          to="/settings"
          aria-current={location.pathname === '/settings' ? 'page' : undefined}
          className={clsx(
            'relative w-[44px] h-[44px]',
            'flex items-center justify-center',
            'transition-all duration-300 group',
            location.pathname === '/settings'
              ? 'nav-icon-active-glow text-aegis-primary'
              : 'text-aegis-text-muted hover:text-aegis-text-secondary hover:bg-[rgb(var(--aegis-overlay)/0.04)]'
          )}
          style={{ borderRadius: 'var(--aegis-radius)' }}
        >
          {location.pathname === '/settings' && (
            <motion.div
              layoutId="nav-active-bar"
              className={clsx(
                'absolute top-1/2 -translate-y-1/2',
                'w-[3px] h-[20px] rounded-full',
                'bg-aegis-primary',
                'shadow-[0_0_12px_rgb(var(--aegis-primary)/0.4)]',
                isRTL ? '-right-[12px]' : '-left-[12px]'
              )}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            />
          )}
          <Settings size={18} className={clsx(location.pathname === '/settings' && 'icon-halo-teal')} />
          <div className={clsx(
            'absolute top-1/2 -translate-y-1/2 px-2.5 py-1.5 rounded-lg',
            'bg-aegis-elevated-solid border border-aegis-border shadow-lg',
            'text-aegis-text text-[11px] font-medium whitespace-nowrap',
            'opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50',
            isRTL ? 'right-full mr-3' : 'left-full ml-3'
          )}>
            {t('nav.settings')}
          </div>
        </NavLink>
      </div>
    </div>
  );
}
