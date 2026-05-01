import { useState, useRef, useEffect } from 'react';
import { Smile } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSettingsStore } from '@/stores/settingsStore';
import { getDirection } from '@/i18n';
import EmojiPickerComponent, { type EmojiClickData, EmojiStyle, SkinTonePickerLocation, Theme } from 'emoji-picker-react';
import clsx from 'clsx';

// ═══════════════════════════════════════════════════════════
// Emoji Picker — floating emoji selector using emoji-picker-react
// ═══════════════════════════════════════════════════════════

// Lazy-load locale data on demand (static import paths so Vite can code-split).
// Arabic falls through to default (English) — no ar locale available.
const localeLoaders: Record<string, () => Promise<any>> = {
  en: () => import('emoji-picker-react/dist/data/emojis-en'),
  es: () => import('emoji-picker-react/dist/data/emojis-es'),
  zh: () => import('emoji-picker-react/dist/data/emojis-zh'),
};

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  disabled?: boolean;
}

export function EmojiPicker({ onSelect, disabled }: EmojiPickerProps) {
  const { t } = useTranslation();
  const { language, theme } = useSettingsStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [localeData, setLocaleData] = useState<any>(undefined);

  // Load locale data when language changes
  useEffect(() => {
    let cancelled = false;
    const loader = localeLoaders[language];
    if (!loader) {
      setLocaleData(undefined);
      return;
    }
    loader().then((mod) => {
      if (!cancelled) setLocaleData(mod);
    });
    return () => { cancelled = true; };
  }, [language]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      <button
        onClick={() => setOpen(!open)}
        disabled={disabled}
        className={clsx(
          'p-2 rounded-xl transition-colors',
          open
            ? 'bg-aegis-primary/20 text-aegis-primary'
            : 'hover:bg-[rgb(var(--aegis-overlay)/0.04)] text-aegis-text-dim hover:text-aegis-text-muted',
          'disabled:opacity-30'
        )}
        title={t('input.emoji')}
      >
        <Smile size={17} />
      </button>

      {/* Picker Popup */}
      {open && (
        <div className={clsx(
          "absolute bottom-full mb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200",
          getDirection(language) === 'rtl' ? 'right-0' : 'left-0'
        )}>
          <div className="rounded-2xl overflow-hidden shadow-2xl border border-aegis-menu-border bg-aegis-menu-bg">
            <EmojiPickerComponent
              onEmojiClick={(emojiData: EmojiClickData) => {
                onSelect(emojiData.emoji);
                setOpen(false);
              }}
              theme={theme === 'aegis-light' ? Theme.LIGHT : Theme.DARK}
              emojiStyle={EmojiStyle.NATIVE}
              previewConfig={{ showPreview: false }}
              skinTonePickerLocation={SkinTonePickerLocation.SEARCH}
              emojiData={localeData as any}
            />
          </div>
        </div>
      )}
    </div>
  );
}
