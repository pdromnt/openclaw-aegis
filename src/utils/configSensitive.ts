// ═══════════════════════════════════════════════════════════
// Config Sensitive Field Detection
// Detects API keys, tokens, secrets, and passwords in config
// Used by ConfigManager to auto-mask sensitive values
// ═══════════════════════════════════════════════════════════

/** Patterns that indicate a field contains sensitive data */
const SENSITIVE_PATTERNS = [
  /apikey/i,
  /api_key/i,
  /token/i,
  /secret/i,
  /password/i,
  /passphrase/i,
  /credential/i,
  /\.key$/i,
  /auth$/i,
];

/** Known safe fields that match patterns but are NOT sensitive */
const SAFE_FIELDS = new Set([
  'gatewayToken',     // displayed separately, not a secret per se in local context
  'tokenUsage',
  'maxTokens',
  'contextTokens',
  'totalTokens',
  'token_count',
  'tokenLimit',
]);

/**
 * Check if a config field key indicates sensitive data.
 * @param key — the field name (e.g. "apiKey", "token", "webhookSecret")
 * @param fullPath — optional dot-path (e.g. "providers.anthropic.apiKey")
 */
export function isSensitiveField(key: string, fullPath?: string): boolean {
  // Check safe list first
  if (SAFE_FIELDS.has(key)) return false;
  if (fullPath && SAFE_FIELDS.has(fullPath.split('.').pop() || '')) return false;

  // Check patterns
  return SENSITIVE_PATTERNS.some(p => p.test(key));
}

/**
 * Check if a string value looks like an API key or token.
 * Heuristic: long alphanumeric string, starts with known prefixes, etc.
 */
export function looksLikeSecret(value: string): boolean {
  if (typeof value !== 'string' || value.length < 20) return false;
  // Known prefixes
  if (/^(sk-|xai-|gsk_|ghp_|glpat-|AKIA|AIza|whsec_|shpss_)/.test(value)) return true;
  // Long base64-ish string with no spaces
  if (value.length >= 32 && /^[A-Za-z0-9+/=_-]+$/.test(value) && !value.includes(' ')) return true;
  return false;
}

/**
 * Mask a sensitive value for display.
 * Shows first 4 chars + dots + last 4 chars for long values.
 */
export function maskValue(value: string): string {
  if (!value || value.length < 8) return '••••••••';
  return `${value.slice(0, 4)}${'•'.repeat(Math.min(value.length - 8, 16))}${value.slice(-4)}`;
}
