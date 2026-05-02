// ═══════════════════════════════════════════════════════════
// SettingsPage — Full settings with Gateway, Theme, Model
// ═══════════════════════════════════════════════════════════

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Settings, Bell, BellOff, Globe, Volume2, VolumeX,
  Wifi, WifiOff, Cpu, CheckCircle, Loader2, Keyboard, Copy, Sun, Moon
} from 'lucide-react';
import { APP_VERSION } from '@/hooks/useAppVersion';
import { GlassCard } from '@/components/shared/GlassCard';
import { PageTransition } from '@/components/shared/PageTransition';
import { StatusDot } from '@/components/shared/StatusDot';
import { useSettingsStore } from '@/stores/settingsStore';
import { useChatStore } from '@/stores/chatStore';
import { useGatewayDataStore } from '@/stores/gatewayDataStore';
import { gateway } from '@/services/gateway/index';
import { notifications } from '@/services/notifications';
import { changeLanguage } from '@/i18n';
import clsx from 'clsx';

export function SettingsPageFull() {
  const { t } = useTranslation();
  const {
    theme, setTheme,
    language, setLanguage,
    notificationsEnabled, setNotificationsEnabled,
    soundEnabled, setSoundEnabled,
    dndMode, setDndMode,
    gatewayUrl, setGatewayUrl,
    gatewayToken, setGatewayToken,
    accentColor, setAccentColor,
    uiRoundness, setUiRoundness,
  } = useSettingsStore();
  const { connected, connecting } = useChatStore();
  const sessions = useGatewayDataStore((s) => s.sessions);

  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'fail' | null>(null);
  const [editUrl, setEditUrl] = useState(gatewayUrl);
  const [editToken, setEditToken] = useState(gatewayToken);
  const [connectionDirty, setConnectionDirty] = useState(false);

  const mainSession = sessions.find((s) => (s.key || '') === 'agent:main:main');
  const mainModel = mainSession?.model || '—';
  const contextTokens = mainSession?.contextTokens || 0;

  const handleLanguageChange = (lang: 'ar' | 'en' | 'zh' | 'es') => {
    setLanguage(lang);
    changeLanguage(lang);
  };

  const handleNotificationsToggle = (enabled: boolean) => {
    setNotificationsEnabled(enabled);
    notifications.setEnabled(enabled);
  };

  const handleSoundToggle = (enabled: boolean) => {
    setSoundEnabled(enabled);
    notifications.setSoundEnabled(enabled);
  };

  const handleDndToggle = (dnd: boolean) => {
    setDndMode(dnd);
    notifications.setDndMode(dnd);
  };

  const resolveConnectionUrl = async (): Promise<{ url: string; token: string }> => {
    const userUrl = editUrl.trim();
    const userToken = editToken.trim();
    if (userUrl) return { url: userUrl, token: userToken };
    try {
      const config = await window.aegis?.config.get();
      return {
        url: config?.gatewayUrl || config?.gatewayWsUrl || 'ws://127.0.0.1:18789',
        token: config?.gatewayToken || '',
      };
    } catch {
      return { url: 'ws://127.0.0.1:18789', token: '' };
    }
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const { url, token } = await resolveConnectionUrl();
      gateway.connect(url, token);
      await new Promise((r) => setTimeout(r, 2500));
      setTestResult(useChatStore.getState().connected ? 'success' : 'fail');
    } catch {
      setTestResult('fail');
    } finally {
      setTestingConnection(false);
    }
  };

  const handleReconnect = async () => {
    const { url, token } = await resolveConnectionUrl();
    gateway.connect(url, token);
  };

  const handleSaveConnection = () => {
    setGatewayUrl(editUrl.trim());
    setGatewayToken(editToken.trim());
    setConnectionDirty(false);
    // Reconnect with new settings
    const url = editUrl.trim() || 'ws://127.0.0.1:18789';
    gateway.connect(url, editToken.trim());
  };

  // Toggle switch — unified design (used everywhere in settings)
  const Toggle = ({
    enabled,
    onChange,
    disabled,
  }: {
    enabled: boolean;
    onChange: (v: boolean) => void;
    disabled?: boolean;
  }) => (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      className={clsx(
        'w-[42px] h-[24px] rounded-full relative transition-all shrink-0 border',
        enabled
          ? 'bg-aegis-primary/30 border-aegis-primary/40'
          : 'bg-[rgb(var(--aegis-overlay)/0.08)] border-[rgb(var(--aegis-overlay)/0.1)]',
        disabled && 'opacity-50 cursor-not-allowed'
      )}
    >
      <div className={clsx(
        'absolute top-[2px] w-[18px] h-[18px] rounded-full transition-all duration-300',
        enabled
          ? 'left-[21px] bg-aegis-primary shadow-[0_0_8px_rgb(var(--aegis-primary)/0.5)]'
          : 'left-[2px] bg-[rgb(var(--aegis-overlay)/0.3)]'
      )} />
    </button>
  );

  return (
    <PageTransition className="p-6 space-y-6 max-w-[700px] mx-auto">
      <div>
        <h1 className="text-[22px] font-bold text-aegis-text flex items-center gap-3">
          <Settings size={24} className="text-aegis-text-dim" />
          {t('settings.title')}
        </h1>
      </div>

      {/* Language */}
      <GlassCard delay={0.05}>
        <h3 className="text-[14px] font-semibold text-aegis-text mb-4 flex items-center gap-2">
          <Globe size={16} className="text-aegis-primary" />
          {t('settings.language')}
        </h3>
        <div className="flex items-center gap-3">
          <button
            onClick={() => handleLanguageChange('ar')}
            className={clsx(
              'flex-1 py-3 rounded-xl text-[14px] font-medium border transition-colors',
              language === 'ar'
                ? 'bg-aegis-primary/15 border-aegis-primary/30 text-aegis-primary'
                : 'border-aegis-border/20 text-aegis-text-dim hover:border-aegis-border/40'
            )}
          >
            العربية
          </button>
          <button
            onClick={() => handleLanguageChange('en')}
            className={clsx(
              'flex-1 py-3 rounded-xl text-[14px] font-medium border transition-colors',
              language === 'en'
                ? 'bg-aegis-primary/15 border-aegis-primary/30 text-aegis-primary'
                : 'border-aegis-border/20 text-aegis-text-dim hover:border-aegis-border/40'
            )}
          >
            English
          </button>
          <button
            onClick={() => handleLanguageChange('zh')}
            className={clsx(
              'flex-1 py-3 rounded-xl text-[14px] font-medium border transition-colors',
              language === 'zh'
                ? 'bg-aegis-primary/15 border-aegis-primary/30 text-aegis-primary'
                : 'border-aegis-border/20 text-aegis-text-dim hover:border-aegis-border/40'
            )}
          >
            中文
          </button>
          <button
            onClick={() => handleLanguageChange('es')}
            className={clsx(
              'flex-1 py-3 rounded-xl text-[14px] font-medium border transition-colors',
              language === 'es'
                ? 'bg-aegis-primary/15 border-aegis-primary/30 text-aegis-primary'
                : 'border-aegis-border/20 text-aegis-text-dim hover:border-aegis-border/40'
            )}
          >
            Español
          </button>
        </div>
      </GlassCard>

      {/* Theme */}
      <GlassCard delay={0.08}>
        <h3 className="text-[14px] font-semibold text-aegis-text mb-4 flex items-center gap-2">
          <Moon size={16} className="text-aegis-primary" />
          {t('settings.theme')}
        </h3>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTheme('aegis-dark')}
            className={clsx(
              'flex-1 py-3 rounded-xl text-[14px] font-medium border transition-colors flex items-center justify-center gap-2',
              (theme || 'aegis-dark') === 'aegis-dark'
                ? 'bg-aegis-primary text-aegis-btn-primary-text border-transparent'
                : 'bg-aegis-glass text-aegis-text-secondary border border-aegis-border'
            )}
          >
            <Moon size={15} />
            {t('settings.themeDark')}
          </button>
          <button
            onClick={() => setTheme('aegis-light')}
            className={clsx(
              'flex-1 py-3 rounded-xl text-[14px] font-medium border transition-colors flex items-center justify-center gap-2',
              (theme || 'aegis-dark') === 'aegis-light'
                ? 'bg-aegis-primary text-aegis-btn-primary-text border-transparent'
                : 'bg-aegis-glass text-aegis-text-secondary border border-aegis-border'
            )}
          >
            <Sun size={15} />
            {t('settings.themeLight')}
          </button>
          <button
            onClick={() => setTheme('aegis-knot')}
            className={clsx(
              'flex-1 py-3 rounded-xl text-[14px] font-medium border transition-colors flex items-center justify-center gap-2',
              (theme || 'aegis-dark') === 'aegis-knot'
                ? 'bg-aegis-primary text-aegis-btn-primary-text border-transparent'
                : 'bg-aegis-glass text-aegis-text-secondary border border-aegis-border'
            )}
          >
            <span className="text-[15px] leading-none">🔴</span>
            {t('settings.themeKnot', 'Knot')}
          </button>
        </div>
      </GlassCard>

      {/* Accent Color */}
      <GlassCard delay={0.09}>
        <h3 className="text-[14px] font-semibold text-aegis-text mb-4 flex items-center gap-2">
          <span className="text-aegis-primary">🎨</span>
          {t('settings.accentColor', 'Accent Color')}
        </h3>
        <div className="flex gap-3 flex-wrap">
          {(['teal', 'blue', 'purple', 'rose', 'amber', 'emerald'] as const).map((color) => (
            <button
              key={color}
              onClick={() => setAccentColor(color)}
              className={clsx(
                'w-8 h-8 rounded-full border-2 transition-all',
                accentColor === color
                  ? 'border-aegis-text scale-110'
                  : 'border-transparent hover:border-aegis-text-dim hover:scale-105'
              )}
              style={{
                backgroundColor: {
                  teal: 'rgb(78, 201, 176)',
                  blue: 'rgb(96, 165, 250)',
                  purple: 'rgb(192, 132, 252)',
                  rose: 'rgb(251, 113, 133)',
                  amber: 'rgb(251, 191, 36)',
                  emerald: 'rgb(52, 211, 153)',
                }[color],
              }}
              title={color.charAt(0).toUpperCase() + color.slice(1)}
            />
          ))}
        </div>
      </GlassCard>

      {/* Roundness */}
      <GlassCard delay={0.10}>
        <h3 className="text-[14px] font-semibold text-aegis-text mb-4 flex items-center gap-2">
          <span className="text-aegis-primary">◼</span>
          {t('settings.roundness', 'Roundness')}
        </h3>
        <div className="flex gap-2">
          {(['sharp', 'soft', 'round'] as const).map((r) => (
            <button
              key={r}
              onClick={() => setUiRoundness(r)}
              className={clsx(
                'px-4 py-2 text-[12px] font-medium transition-all border',
                uiRoundness === r
                  ? 'border-aegis-primary/40 bg-aegis-primary/10 text-aegis-text'
                  : 'border-[rgb(var(--aegis-overlay)/0.1)] bg-[rgb(var(--aegis-overlay)/0.03)] text-aegis-text-dim hover:border-aegis-primary/25'
              )}
              style={{ borderRadius: { sharp: '2px', soft: '6px', round: '12px' }[r] }}
            >
              {r.charAt(0).toUpperCase() + r.slice(1)}
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Notifications */}
      <GlassCard delay={0.1}>
        <h3 className="text-[14px] font-semibold text-aegis-text mb-4 flex items-center gap-2">
          <Bell size={16} className="text-aegis-warning" />
          {t('settings.notifications')}
        </h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] text-aegis-text">{t('settings.enableNotifications')}</div>
              <div className="text-[11px] text-aegis-text-dim">{t('settings.notificationsDesc')}</div>
            </div>
            <Toggle enabled={notificationsEnabled} onChange={handleNotificationsToggle} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] text-aegis-text flex items-center gap-2">
                {soundEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
                {t('settings.sound')}
              </div>
              <div className="text-[11px] text-aegis-text-dim">{t('settings.soundDesc')}</div>
            </div>
            <Toggle enabled={soundEnabled} onChange={handleSoundToggle} />
          </div>

          <div className="flex items-center justify-between">
            <div>
              <div className="text-[13px] text-aegis-text flex items-center gap-2">
                <BellOff size={14} />
                {t('settings.dnd')}
              </div>
              <div className="text-[11px] text-aegis-text-dim">{t('settings.dndDesc')}</div>
            </div>
            <Toggle enabled={dndMode} onChange={handleDndToggle} />
          </div>

          <button
            onClick={() => notifications.notify({ type: 'info', title: 'AEGIS', body: t('settings.testNotification') })}
            className="text-[12px] px-4 py-2 rounded-xl border border-aegis-border/20 text-aegis-text-dim hover:text-aegis-text hover:border-aegis-border/40 transition-colors"
          >
            🔔 {t('settings.testSound')}
          </button>
        </div>
      </GlassCard>

      {/* Gateway */}
      <GlassCard delay={0.15}>
        <h3 className="text-[14px] font-semibold text-aegis-text mb-4 flex items-center gap-2">
          {connected ? <Wifi size={16} className="text-aegis-success" /> : <WifiOff size={16} className="text-aegis-danger" />}
          {t('settings.gateway', 'Gateway')}
        </h3>
        <div className="space-y-4">
          {/* Connection Status */}
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-aegis-text">{t('settingsExtra.connectionStatus')}</div>
            <div className="flex items-center gap-2">
              <StatusDot status={connected ? 'active' : connecting ? 'idle' : 'error'} size={7} />
              <span className={clsx('text-[12px] font-medium',
                connected ? 'text-aegis-success' : connecting ? 'text-aegis-warning' : 'text-aegis-danger'
              )}>
                {connected ? t('connection.connected') : connecting ? t('connection.connecting') : t('connection.disconnected')}
              </span>
            </div>
          </div>

          {/* Gateway URL — editable */}
          <div>
            <label className="text-[12px] text-aegis-text-muted font-medium mb-1.5 block">
              {t('settings.wsUrl')}
            </label>
            <input
              type="text"
              value={editUrl}
              onChange={(e) => { setEditUrl(e.target.value); setConnectionDirty(true); }}
              placeholder="ws://127.0.0.1:18789"
              className="w-full px-3 py-2.5 rounded-xl text-[13px] font-mono
                bg-[rgb(var(--aegis-overlay)/0.03)] border border-aegis-border
                text-aegis-text placeholder:text-aegis-text-dim
                outline-none focus:border-aegis-accent/40 focus:bg-aegis-accent/[0.03] transition-all"
              dir="ltr"
            />
            <div className="text-[10px] text-aegis-text-dim mt-1">
              {t('settings.gatewayUrlHint', 'Leave empty to use default (ws://127.0.0.1:18789)')}
            </div>
          </div>

          {/* Gateway Token — editable */}
          <div>
            <label className="text-[12px] text-aegis-text-muted font-medium mb-1.5 block">
              {t('settings.gatewayToken')}
            </label>
            <input
              type="password"
              value={editToken}
              onChange={(e) => { setEditToken(e.target.value); setConnectionDirty(true); }}
              placeholder={t('settingsExtra.tokenPlaceholder')}
              className="w-full px-3 py-2.5 rounded-xl text-[13px] font-mono
                bg-[rgb(var(--aegis-overlay)/0.03)] border border-aegis-border
                text-aegis-text placeholder:text-aegis-text-dim
                outline-none focus:border-aegis-accent/40 focus:bg-aegis-accent/[0.03] transition-all"
              dir="ltr"
            />
          </div>

          {/* Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {connectionDirty && (
              <button
                onClick={handleSaveConnection}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-[12px] font-semibold
                  bg-aegis-primary/15 text-aegis-primary border border-aegis-primary/25
                  hover:bg-aegis-primary/25 transition-colors"
              >
                <CheckCircle size={13} />
                {t('settingsExtra.saveReconnect')}
              </button>
            )}
            <button
              onClick={handleTestConnection}
              disabled={testingConnection}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] border border-aegis-border/20 text-aegis-text-dim hover:text-aegis-text hover:border-aegis-border/40 transition-colors disabled:opacity-40"
            >
              {testingConnection ? <Loader2 size={13} className="animate-spin" /> : <Wifi size={13} />}
              {t('settings.testConnection')}
            </button>
            {!connected && !connectionDirty && (
              <button
                onClick={handleReconnect}
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] bg-aegis-primary/10 text-aegis-primary border border-aegis-primary/20 hover:bg-aegis-primary/20 transition-colors"
              >
                <Wifi size={13} />
                {t('connection.reconnect')}
              </button>
            )}
            {testResult && (
              <span className={clsx('text-[11px] flex items-center gap-1',
                testResult === 'success' ? 'text-aegis-success' : 'text-aegis-danger'
              )}>
                <CheckCircle size={12} />
                {testResult === 'success' ? '✓' : '✗'}
              </span>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Model */}
      <GlassCard delay={0.2}>
        <h3 className="text-[14px] font-semibold text-aegis-text mb-4 flex items-center gap-2">
          <Cpu size={16} className="text-aegis-accent" />
          {t('settingsExtra.model')}
        </h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-aegis-text">{t('settingsExtra.activeModel')}</div>
            <span className="text-[12px] font-mono text-aegis-primary font-medium">
              {mainModel.split('/').pop() || mainModel}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="text-[13px] text-aegis-text">{t('settingsExtra.provider')}</div>
            <span className="text-[12px] font-mono text-aegis-text-dim">
              {mainModel.includes('/') ? mainModel.split('/')[0] : '—'}
            </span>
          </div>
          {contextTokens > 0 && (
            <div className="flex items-center justify-between">
              <div className="text-[13px] text-aegis-text">{t('settingsExtra.contextWindow')}</div>
              <span className="text-[12px] font-mono text-aegis-text-dim">
                {contextTokens >= 1000000 ? `${(contextTokens / 1000000).toFixed(0)}M` : `${Math.round(contextTokens / 1000)}k`} tokens
              </span>
            </div>
          )}
          <p className="text-[10px] text-aegis-text-dim/60 mt-1">
            {t('settingsExtra.modelNote')}
          </p>
        </div>
      </GlassCard>

      {/* Keyboard Shortcuts */}
      <GlassCard delay={0.25}>
        <h3 className="text-[14px] font-semibold text-aegis-text mb-4 flex items-center gap-2">
          <Keyboard size={16} className="text-aegis-primary" />
          {t('settingsExtra.shortcuts')}
        </h3>
        <div className="space-y-2.5">
          {[
            ['Ctrl+K', t('settings.commandPalette')],
            ['Ctrl+F', t('settings.searchInChat')],
            ['Ctrl+Shift+F', t('settings.focusMode')],
            ['/', t('settings.slashCommands')],
            ['Ctrl+1-8', t('settingsExtra.navigatePages')],
            ['Ctrl+N', t('settingsExtra.newTab')],
            ['Ctrl+W', t('settingsExtra.closeTab')],
            ['Ctrl+Tab', t('settingsExtra.nextTab')],
            ['Ctrl+,', t('settingsExtra.openSettings')],
            ['Ctrl+R', t('settingsExtra.refresh')],
            ['Escape', t('settingsExtra.closeModal') + ' / ' + t('settings.exitFocusMode')],
          ].map(([key, desc]) => (
            <div key={key} className="flex items-center justify-between">
              <span className="text-[12px] text-aegis-text-muted">{desc}</span>
              <kbd
                className="text-[10px] font-mono px-2 py-1 rounded"
                style={{ background: 'rgb(var(--aegis-overlay) / 0.08)', color: 'rgb(var(--aegis-text-muted))', border: '1px solid var(--aegis-border-hover)' }}
              >{key}</kbd>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* About + System Info */}
      <GlassCard delay={0.3}>
        <div className="text-center py-4 mb-4">
          <div className="text-3xl mb-2">Æ</div>
          <div className="text-[14px] font-bold text-aegis-text">AEGIS</div>
          <div className="text-[12px] text-aegis-text-dim mt-1">v{APP_VERSION}</div>
          <div className="text-[11px] text-aegis-text-dim mt-0.5">Advanced Executive General Intelligence System</div>
        </div>
        <div className="space-y-2 border-t border-aegis-border/15 pt-3">
          {[
            [t('settings.platform'), typeof navigator !== 'undefined' ? navigator.platform : '—'],
            [t('settings.userAgent'), typeof navigator !== 'undefined' ? (navigator.userAgent.match(/Electron\/[\d.]+/)?.[0] || '—') : '—'],
            [t('settings.gateway'), connected ? `${localStorage.getItem('aegis-gateway-http')?.replace('http', 'ws') || 'ws://127.0.0.1:18789'} ✓` : '— ✗'],
            [t('settings.model'), mainModel.split('/').pop() || '—'],
          ].map(([label, value]) => (
            <div key={label} className="flex items-center justify-between">
              <span className="text-[11px] text-aegis-text-dim">{label}</span>
              <span className="text-[10px] font-mono text-aegis-text-muted truncate max-w-[250px]">{value}</span>
            </div>
          ))}
        </div>
        <button onClick={() => {
          const info = `AEGIS v${APP_VERSION}\nPlatform: ${navigator.platform}\nModel: ${mainModel}\nGateway: ${connected ? 'connected' : 'disconnected'}`;
          navigator.clipboard?.writeText(info);
        }}
          className="mt-3 flex items-center gap-1.5 mx-auto px-3 py-1.5 rounded-lg text-[11px] text-aegis-text-dim hover:text-aegis-text border border-aegis-border/20 hover:border-aegis-border/40 transition-colors">
          <Copy size={12} /> {t('settingsExtra.copySystemInfo')}
        </button>
      </GlassCard>
    </PageTransition>
  );
}
