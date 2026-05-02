import { useState, useRef, useEffect, useCallback, lazy, Suspense } from 'react';
import { Send, Paperclip, Camera, Mic, X, Loader2, Square, FilePlus, RotateCcw, StopCircle, RefreshCw, Layers, Zap, Lightbulb, Eraser, Maximize, Terminal, BarChart3, Info, Download, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { gateway } from '@/services/gateway/index';
import { EmojiPicker } from './EmojiPicker';

// Lazy-load heavy modals (only needed on user action)
const ScreenshotPicker = lazy(() => import('./ScreenshotPicker').then(m => ({ default: m.ScreenshotPicker })));
const VoiceRecorder = lazy(() => import('./VoiceRecorder').then(m => ({ default: m.VoiceRecorder })));
const SpeechToText = lazy(() => import('./SpeechToText').then(m => ({ default: m.SpeechToText })));

// Import isSpeechRecognitionSupported separately (lightweight check)
let _sttSupported: boolean | null = null;
function isSpeechRecognitionSupported(): boolean {
  if (_sttSupported === null) {
    _sttSupported = !!(window as any).SpeechRecognition || !!(window as any).webkitSpeechRecognition;
  }
  return _sttSupported;
}
import { getDirection } from '@/i18n';
import clsx from 'clsx';

// ═══════════════════════════════════════════════════════════
// Message Input — premium input with attachments
// ═══════════════════════════════════════════════════════════

interface PendingFile {
  name: string;
  base64: string;
  mimeType: string;
  isImage: boolean;
  size: number;
  preview?: string;
  path?: string;  // Windows path — non-image files send path instead of base64
}

// ── Slash commands definition ──
const SLASH_COMMANDS = [
  { cmd: '/new', label: 'New Session', icon: FilePlus },
  { cmd: '/reset', label: 'Reset Session', icon: RotateCcw },
  { cmd: '/stop', label: 'Stop Generation', icon: StopCircle },
  { cmd: '/compact', label: 'Compact Context', icon: RefreshCw },
  { cmd: '/model', label: 'Change Model', icon: Layers, hasArg: true },
  { cmd: '/fast', label: 'Toggle Fast Mode', icon: Zap },
  { cmd: '/think', label: 'Toggle Thinking', icon: Lightbulb, hasArg: true },
  { cmd: '/clear', label: 'Clear Display', icon: Eraser },
  { cmd: '/focus', label: 'Focus Mode', icon: Maximize },
  { cmd: '/verbose', label: 'Toggle Verbose', icon: Terminal },
  { cmd: '/usage', label: 'Token Usage', icon: BarChart3 },
  { cmd: '/status', label: 'Session Status', icon: Info },
  { cmd: '/export', label: 'Export Chat', icon: Download },
];

export function MessageInput() {
  const { t } = useTranslation();
  const { language } = useSettingsStore();
  const dir = getDirection(language);
  const { isSending, setIsSending, connected, addMessage, setIsTyping, isTyping, activeSessionKey, drafts, setDraft, messages, historyLoader } = useChatStore();
  const [text, setText] = useState(() => drafts[activeSessionKey] || '');
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [screenshotOpen, setScreenshotOpen] = useState(false);
  const [voiceMode, setVoiceMode] = useState<false | 'record' | 'stt'>(false);
  const [voiceMenuOpen, setVoiceMenuOpen] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync draft when switching sessions
  useEffect(() => {
    setText(drafts[activeSessionKey] || '');
  }, [activeSessionKey]);

  // Save draft on text change
  useEffect(() => {
    setDraft(activeSessionKey, text);
  }, [text, activeSessionKey]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, 180);
    el.style.height = newHeight + 'px';
  }, [text]);

  useEffect(() => { textareaRef.current?.focus(); }, []);

  // Close voice menu on outside click (with delay to avoid instant close)
  const voiceMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!voiceMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (voiceMenuRef.current && !voiceMenuRef.current.contains(e.target as Node)) {
        setVoiceMenuOpen(false);
      }
    };
    // Delay adding listener so the opening click doesn't immediately close it
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 50);
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handler); };
  }, [voiceMenuOpen]);

  // Listen for file drops from ChatView overlay
  useEffect(() => {
    const handler = (e: Event) => {
      const droppedFiles = (e as CustomEvent).detail?.files as File[];
      if (!droppedFiles?.length) return;
      for (const file of droppedFiles) {
        const isImage = file.type.startsWith('image/');
        const filePath = (file as any).path || '';
        if (isImage) {
          const reader = new FileReader();
          reader.onload = () => {
            const dataUrl = reader.result as string;
            const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
            setFiles((prev) => [...prev, { name: file.name, base64, mimeType: file.type, isImage: true, size: file.size, preview: dataUrl, path: filePath }]);
          };
          reader.readAsDataURL(file);
        } else {
          setFiles((prev) => [...prev, { name: file.name, base64: '', mimeType: file.type || 'application/octet-stream', isImage: false, size: file.size, path: filePath }]);
        }
      }
    };
    window.addEventListener('aegis:file-drop', handler);
    return () => window.removeEventListener('aegis:file-drop', handler);
  }, []);

  // Listen for quick-action events from CommandPalette / Dashboard
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.message) {
        gateway.sendMessage(detail.message, undefined, activeSessionKey);
      }
    };
    window.addEventListener('aegis:quick-action', handler);
    return () => window.removeEventListener('aegis:quick-action', handler);
  }, [activeSessionKey]);

  // ── Slash menu logic ──
  const slashQuery = text.startsWith('/') ? text.split(' ')[0].toLowerCase() : '';
  const filteredSlash = slashQuery
    ? SLASH_COMMANDS.filter(c => c.cmd.startsWith(slashQuery))
    : SLASH_COMMANDS;

  useEffect(() => {
    setSlashMenuOpen(text.startsWith('/') && !text.includes(' ') && text.length < 15);
    setSlashMenuIndex(0);
  }, [text]);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if ((!trimmed && files.length === 0) || isSending || !connected) return;

    // On first interaction — load history before sending so context is visible
    if (messages.length === 0 && historyLoader) {
      await historyLoader();
    }

    setIsSending(true);

    // Separate: images → base64 attachments, non-images → path in message text
    const imageFiles = files.filter((f) => f.isImage);
    const nonImageFiles = files.filter((f) => !f.isImage);

    const userAttachments = imageFiles
      .filter((f) => f.preview)
      .map((f) => ({ mimeType: f.mimeType, content: f.preview!, fileName: f.name }));

    // Build file path references for non-image files
    const filePathRefs = nonImageFiles
      .map((f) => `📎 file: ${f.path} (${f.mimeType}, ${formatSize(f.size)})`)
      .join('\n');

    // Combine user text + file paths
    let fullMessage = trimmed;
    if (filePathRefs) {
      fullMessage = fullMessage ? `${fullMessage}\n\n${filePathRefs}` : filePathRefs;
    }
    if (!fullMessage && imageFiles.length > 0) {
      fullMessage = `📎 ${imageFiles.map((f) => f.name).join(', ')}`;
    }

    const userMsg = {
      id: `user-${Date.now()}`, role: 'user' as const,
      content: fullMessage || '',
      timestamp: new Date().toISOString(),
      ...(userAttachments.length > 0 ? { attachments: userAttachments } : {}),
    };
    addMessage(userMsg);

    // Only send image files as base64 attachments
    const attachments = imageFiles.map((f) => ({
      type: 'base64', mimeType: f.mimeType, content: f.base64, fileName: f.name,
    }));

    setText('');
    setFiles([]);
    setIsTyping(true);
    // Clear quick reply buttons when user sends manually
    useChatStore.getState().setQuickReplies([]);

    try {
      await gateway.sendMessage(fullMessage || '', attachments.length > 0 ? attachments : undefined, activeSessionKey);
    } catch (err) {
      console.error('[Send] Error:', err);
    } finally {
      setIsSending(false);
    }
  }, [text, files, isSending, connected, addMessage, setIsSending, setIsTyping, messages, historyLoader]);

  const handleSlashSelect = async (cmd: string) => {
    const hasArg = SLASH_COMMANDS.find(c => c.cmd === cmd)?.hasArg;
    setSlashMenuOpen(false);
    if (!hasArg) {
      // Clear display locally for /clear
      if (cmd === '/clear') {
        useChatStore.getState().clearMessages();
        setText('');
        return;
      }
      if (cmd === '/focus') {
        useSettingsStore.getState().toggleFocusMode();
        setText('');
        return;
      }
      // Send slash command to gateway
      setText('');
      setIsTyping(true);
      try { await gateway.sendMessage(cmd, undefined, activeSessionKey); } catch {}
    } else {
      setText(cmd + ' ');
      textareaRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (slashMenuOpen && filteredSlash.length > 0) {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSlashMenuIndex((i) => (i > 0 ? i - 1 : filteredSlash.length - 1));
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSlashMenuIndex((i) => (i < filteredSlash.length - 1 ? i + 1 : 0));
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        handleSlashSelect(filteredSlash[slashMenuIndex].cmd);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setSlashMenuOpen(false);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // File type icon based on MIME type
  const getFileIcon = (mimeType: string): string => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType === 'application/pdf') return '📕';
    if (mimeType.startsWith('text/csv') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.startsWith('text/')) return '📝';
    if (mimeType.includes('wordprocessing') || mimeType.includes('msword')) return '📘';
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return '📙';
    if (mimeType.includes('zip') || mimeType.includes('compressed') || mimeType.includes('archive')) return '📦';
    if (mimeType.startsWith('audio/')) return '🎵';
    if (mimeType.startsWith('video/')) return '🎬';
    return '📄';
  };

  const handleFileSelect = async () => {
    const result = await window.aegis?.file.openDialog();
    if (result?.canceled || !result?.filePaths?.length) return;
    for (const filePath of result.filePaths) {
      const file = await window.aegis.file.read(filePath);
      if (file) {
        const isImage = file.mimeType?.startsWith('image/') ?? false;
        setFiles((prev) => [...prev, {
          name: file.name,
          base64: isImage ? file.base64 : '',  // Only store base64 for images
          mimeType: file.mimeType,
          isImage, size: file.size,
          preview: isImage ? `data:${file.mimeType};base64,${file.base64}` : undefined,
          path: filePath,  // Store original Windows path
        }]);
      }
    }
  };

  const handleScreenshotCapture = (dataUrl: string) => {
    const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
    setFiles((prev) => [...prev, {
      name: `screenshot-${Date.now()}.png`, base64, mimeType: 'image/png',
      isImage: true, size: base64.length * 0.75, preview: dataUrl,
    }]);
    textareaRef.current?.focus();
  };

  // ── STT result handler ──
  const handleSTTResult = useCallback((text: string) => {
    setVoiceMode(false);
    setText((prev) => (prev ? prev + ' ' + text : text));
    textareaRef.current?.focus();
  }, []);

  const handleVoiceSend = useCallback(async (base64: string, mimeType: string, durationSec: number, localUrl: string) => {
    setVoiceMode(false);
    addMessage({
      id: `user-${Date.now()}`, role: 'user',
      content: t('voice.voiceMessage', { seconds: durationSec }),
      timestamp: new Date().toISOString(),
      mediaUrl: localUrl, mediaType: 'audio',
    });
    setIsTyping(true);
    setIsSending(true);
    try {
      const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
      const filename = `voice-${Date.now()}.${ext}`;
      let savedPath = '';
      if (window.aegis?.voice?.save) {
        savedPath = await window.aegis.voice.save(filename, base64) || '';
      }
      if (savedPath) {
        await gateway.sendMessage(`🎤 [voice] ${savedPath} (${durationSec}s)`);
      } else {
        await gateway.sendMessage(`🎤 [voice:${mimeType}:base64] ${base64.substring(0, 50)}... (${durationSec}s)`);
      }
    } catch (err) { console.error('[Voice] Send error:', err); }
    finally { setIsSending(false); }
  }, [addMessage, setIsTyping, setIsSending, t]);

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of Array.from(items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.replace(/^data:image\/\w+;base64,/, '');
          setFiles((prev) => [...prev, {
            name: 'clipboard.png', base64, mimeType: 'image/png',
            isImage: true, size: blob.size, preview: dataUrl,
          }]);
        };
        reader.readAsDataURL(blob);
        break;
      }
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    for (const file of Array.from(e.dataTransfer.files)) {
      const isImage = file.type.startsWith('image/');
      const filePath = (file as any).path || '';  // Electron adds .path to File objects

      if (isImage) {
        // Images: read base64 for preview + attachment
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          const base64 = dataUrl.replace(/^data:[^;]+;base64,/, '');
          setFiles((prev) => [...prev, {
            name: file.name, base64, mimeType: file.type,
            isImage: true, size: file.size,
            preview: dataUrl, path: filePath,
          }]);
        };
        reader.readAsDataURL(file);
      } else {
        // Non-images: store path only (no base64 needed)
        setFiles((prev) => [...prev, {
          name: file.name, base64: '', mimeType: file.type || 'application/octet-stream',
          isImage: false, size: file.size, path: filePath,
        }]);
      }
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  };

  const removeFile = (index: number) => setFiles((prev) => prev.filter((_, i) => i !== index));

  return (
    <div className="shrink-0 border-t border-[rgb(var(--aegis-overlay)/0.04)] bg-[var(--aegis-bg-frosted-60)] backdrop-blur-xl">
      {/* File Previews — improved cards */}
      {files.length > 0 && (
        <div className="flex gap-2.5 px-4 pt-3 pb-1 overflow-x-auto scrollbar-hidden">
          {files.map((file, i) => (
            <div key={i} className="relative shrink-0 rounded-xl border border-aegis-border/30 overflow-hidden bg-aegis-surface/60 group transition-all hover:border-aegis-border/50">
              {file.isImage && file.preview ? (
                <div className="w-[80px] h-[80px]">
                  <img src={file.preview} alt={file.name} className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="flex items-center gap-2.5 px-3 py-2.5 min-w-[160px] max-w-[220px]">
                  <span className="text-2xl shrink-0">{getFileIcon(file.mimeType)}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-aegis-text font-medium truncate">{file.name}</div>
                    <div className="text-[9px] text-aegis-text-dim mt-0.5">{formatSize(file.size)}</div>
                  </div>
                </div>
              )}
              {/* Remove button */}
              <button onClick={() => removeFile(i)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-aegis-bg-solid/90 border border-aegis-border/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-aegis-danger/80">
                <X size={10} className="text-aegis-text" />
              </button>
              {/* Size badge for images */}
              {file.isImage && (
                <div className="absolute bottom-0 left-0 right-0 bg-aegis-bg-solid/80 backdrop-blur-sm text-[8px] text-center text-aegis-text-dim py-0.5">
                  {formatSize(file.size)}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Slash Command Autocomplete */}
      {slashMenuOpen && filteredSlash.length > 0 && (
        <div className="mx-3 mb-1 border border-aegis-border/15 bg-aegis-surface/95 backdrop-blur-xl shadow-float overflow-hidden max-h-[280px] overflow-y-auto scrollbar-thin" style={{ borderRadius: 'var(--aegis-radius)' }}>
          {filteredSlash.map((cmd, i) => {
            const Icon = cmd.icon;
            return (
              <button key={cmd.cmd}
                onClick={() => handleSlashSelect(cmd.cmd)}
                onMouseEnter={() => setSlashMenuIndex(i)}
                className={clsx(
                  'w-full flex items-center gap-3 px-3 py-2 text-[13px] transition-colors',
                  i === slashMenuIndex
                    ? 'bg-aegis-primary/10 text-aegis-text'
                    : 'text-aegis-text-muted hover:bg-[rgb(var(--aegis-overlay)/0.04)]'
                )}
              >
                <Icon size={14} className={i === slashMenuIndex ? 'text-aegis-primary' : 'text-aegis-text-dim'} />
                <span className="font-mono font-medium">{cmd.cmd}</span>
                <span className="text-aegis-text-dim text-[11px]">{cmd.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Input Area */}
      {voiceMode === 'record' ? (
        <Suspense fallback={<div className="p-4 text-center text-aegis-text-dim text-[12px]">...</div>}>
          <VoiceRecorder onSendVoice={handleVoiceSend} onCancel={() => setVoiceMode(false)} disabled={!connected} />
        </Suspense>
      ) : voiceMode === 'stt' ? (
        <Suspense fallback={<div className="p-4 text-center text-aegis-text-dim text-[12px]">...</div>}>
          <SpeechToText onResult={handleSTTResult} onCancel={() => setVoiceMode(false)} />
        </Suspense>
      ) : (
        <div className="flex items-end gap-2 p-3" dir={dir}>
          {/* Input Wrapper (matches mockup) */}
          <div className={clsx(
            'flex items-center gap-2 px-3 py-2 flex-1',
            'bg-aegis-surface border border-[rgb(var(--aegis-overlay)/0.06)]',
            'transition-all duration-200',
            'focus-within:border-aegis-primary/30',
            'focus-within:shadow-[0_0_0_3px_rgb(var(--aegis-primary)/0.06),0_0_16px_rgb(var(--aegis-primary)/0.08)]',
            !connected && 'opacity-40'
          )}
          style={{ borderRadius: 'var(--aegis-radius)' }}>
            {/* Action Buttons */}
            <EmojiPicker
              onSelect={(emoji) => { setText((prev) => prev + emoji); textareaRef.current?.focus(); }}
              disabled={!connected}
            />
            {[
              { icon: Paperclip, action: handleFileSelect, title: t('input.attachFile') },
              { icon: Camera, action: () => setScreenshotOpen(true), title: t('input.screenshot') },
            ].map(({ icon: Icon, action, title }) => (
              <button key={title} onClick={action}
                className={clsx(
                  'w-[34px] h-[34px] rounded-lg flex items-center justify-center flex-shrink-0',
                  'bg-[rgb(var(--aegis-overlay)/0.03)] border-none',
                  'text-aegis-text-muted hover:text-aegis-text-muted hover:bg-[rgb(var(--aegis-overlay)/0.07)]',
                  'transition-colors disabled:opacity-30'
                )}
                title={title}>
                <Icon size={16} />
              </button>
            ))}

            {/* Mic button with voice mode picker */}
            <div className="relative" ref={voiceMenuRef}>
              <button
                onClick={() => {
                  if (isSpeechRecognitionSupported()) {
                    setVoiceMenuOpen(!voiceMenuOpen);
                  } else {
                    setVoiceMode('record');
                  }
                }}
                disabled={!connected}
                className={clsx(
                  'w-[34px] h-[34px] rounded-lg flex items-center justify-center flex-shrink-0',
                  'bg-[rgb(var(--aegis-overlay)/0.03)] border-none',
                  'text-aegis-text-muted hover:text-aegis-text-muted hover:bg-[rgb(var(--aegis-overlay)/0.07)]',
                  'transition-colors disabled:opacity-30'
                )}
                title={t('input.voiceRecord', 'Voice')}
              >
                <Mic size={16} />
              </button>

              {/* Voice mode picker dropdown */}
              {voiceMenuOpen && (
                <div className="absolute bottom-full mb-2 ltr:left-0 rtl:right-0 w-48 border border-aegis-border/20 bg-aegis-bg-solid shadow-float overflow-hidden z-50" style={{ borderRadius: 'var(--aegis-radius)' }}>
                  <button
                    onClick={() => { setVoiceMenuOpen(false); setVoiceMode('stt'); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12px] text-aegis-text hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
                  >
                    <MessageSquare size={14} className="text-aegis-primary" />
                    <div className="text-start">
                      <div className="font-medium">{t('input.speechToText')}</div>
                      <div className="text-[10px] text-aegis-text-dim">{t('input.sttSubtitle')}</div>
                    </div>
                  </button>
                  <div className="mx-2 border-t border-aegis-border/10" />
                  <button
                    onClick={() => { setVoiceMenuOpen(false); setVoiceMode('record'); }}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-[12px] text-aegis-text hover:bg-[rgb(var(--aegis-overlay)/0.06)] transition-colors"
                  >
                    <Mic size={14} className="text-amber-400" />
                    <div className="text-start">
                      <div className="font-medium">{t('input.voiceRecording')}</div>
                      <div className="text-[10px] text-aegis-text-dim">{t('input.voiceSubtitle')}</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Text Input */}
            <div className="relative flex-1">
              <textarea ref={textareaRef} data-input="message" value={text} onChange={(e) => setText(e.target.value)}
                onKeyDown={handleKeyDown} onPaste={handlePaste}
                placeholder={connected ? t('input.placeholder') : t('input.placeholderDisconnected')}
                disabled={!connected}
                className={clsx(
                  'w-full resize-none bg-transparent border-none text-[14px] leading-snug',
                  'text-aegis-text placeholder:text-aegis-text-muted',
                  'focus:outline-none pt-2.5 pb-1.5',
                  'max-h-[180px] scrollbar-hidden'
                )}
                dir={dir} rows={1} />
              {text.length > 50 && (
                <span className="absolute bottom-0 right-1 text-[9px] text-aegis-text-dim pointer-events-none select-none tabular-nums">
                  {text.length}
                </span>
              )}
            </div>

            {/* Send / Stop Button */}
            {isTyping || isSending ? (
              <button onClick={async () => {
                try { await gateway.abortChat(); setIsTyping(false); setIsSending(false); }
                catch (err) { console.error('[Abort] Error:', err); }
              }}
                className="w-[34px] h-[34px] rounded-lg flex items-center justify-center flex-shrink-0 bg-aegis-danger/80 hover:bg-aegis-danger text-aegis-text transition-all"
                title={t('input.stop')}>
                <Square size={16} fill="currentColor" />
              </button>
            ) : (
              <button onClick={handleSend}
                disabled={(!text.trim() && files.length === 0) || !connected}
                className={clsx(
                  'w-[34px] h-[34px] rounded-lg flex items-center justify-center flex-shrink-0 transition-all',
                  text.trim() || files.length > 0
                    ? 'bg-gradient-to-br from-aegis-primary to-aegis-primary/70 text-aegis-bg shadow-[0_2px_8px_rgb(var(--aegis-primary)/0.3)] hover:shadow-[0_4px_16px_rgb(var(--aegis-primary)/0.4)] hover:-translate-y-px'
                    : 'bg-[rgb(var(--aegis-overlay)/0.04)] text-aegis-text-dim',
                  'disabled:opacity-30 disabled:cursor-not-allowed disabled:shadow-none'
                )}
                title={t('input.send')}>
                <Send size={16} />
              </button>
            )}
          </div>
        </div>
      )}

      {screenshotOpen && (
        <Suspense fallback={null}>
          <ScreenshotPicker open={screenshotOpen} onClose={() => setScreenshotOpen(false)} onCapture={handleScreenshotCapture} />
        </Suspense>
      )}
    </div>
  );
}
