// Keys that should be scoped per gateway
const SCOPED_KEYS = [
  'aegis-memory-explorer', 'aegis-memory-mode', 'aegis-memory-api-url',
  'aegis-memory-local-path', 'aegis-budget-limit', 'aegis-context1m',
  'aegis-tool-intent', 'aegis-audio-autoplay', 'aegis-config-backups'
];

function getPrefix(): string {
  const url = localStorage.getItem('aegis-gateway-url') || '';
  if (!url) return '';
  // Simple 8-char hash
  try {
    const hash = btoa(url).replace(/[^a-zA-Z0-9]/g, '').substring(0, 8);
    return hash + ':';
  } catch { return ''; }
}

export function scopedGet(key: string): string | null {
  if (!SCOPED_KEYS.includes(key)) return localStorage.getItem(key);
  const prefix = getPrefix();
  // Try scoped first, fall back to global (migration)
  const scoped = prefix ? localStorage.getItem(prefix + key) : null;
  return scoped ?? localStorage.getItem(key);
}

export function scopedSet(key: string, value: string): void {
  if (!SCOPED_KEYS.includes(key)) {
    localStorage.setItem(key, value);
    return;
  }
  const prefix = getPrefix();
  if (prefix) {
    localStorage.setItem(prefix + key, value);
  }
  // Always write global too as fallback
  localStorage.setItem(key, value);
}
