// ═══════════════════════════════════════════════════════════
// Skills Page — My Skills + ClawHub Marketplace
// Design: spacious (max-w 900px), clean list, pill categories
// Data: Gateway skills.status + ClawHub API (clawhub.ai)
// ═══════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Loader2, RefreshCw, Package, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { gateway } from '@/services/gateway/index';
import { useChatStore } from '@/stores/chatStore';
import clsx from 'clsx';
import {
  MySkillRow,
  HubSkillRow,
  SkillDetailPanel,
  CategoryChips,
  type MySkill,
  type HubSkill,
  type SkillDetail,
  CATEGORIES,
} from './components';

// ═══════════════════════════════════════════════════════════
// ClawHub API
// ═══════════════════════════════════════════════════════════

const CLAWHUB_API = 'https://clawhub.ai/api/v1';

async function fetchHubSkills(sort = 'downloads', limit = 30): Promise<HubSkill[]> {
  try {
    // Try /skills endpoint first
    const res = await fetch(`${CLAWHUB_API}/skills?sort=${sort}&limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const items = (data.items || data.skills || []).map(mapHubSkill);
    if (items.length > 0) return items;

    // Fallback: /search endpoint returns results when /skills is empty
    const searchRes = await fetch(`${CLAWHUB_API}/search?q=skill`);
    if (!searchRes.ok) return [];
    const searchData = await searchRes.json();
    return (searchData.results || []).map(mapHubSkill);
  } catch (err) {
    console.warn('[Skills] ClawHub fetch failed:', err);
    return [];
  }
}

async function searchHubSkills(query: string): Promise<HubSkill[]> {
  try {
    const res = await fetch(`${CLAWHUB_API}/search?q=${encodeURIComponent(query)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    // API returns { results: [{score, slug, displayName, summary, version, ...}] }
    return (data.results || data.skills || []).map(mapHubSkill);
  } catch {
    return [];
  }
}

async function fetchSkillDetail(slug: string): Promise<SkillDetail | null> {
  try {
    const [skillRes, versionsRes] = await Promise.all([
      fetch(`${CLAWHUB_API}/skills/${slug}`),
      fetch(`${CLAWHUB_API}/skills/${slug}/versions`).catch(() => null),
    ]);
    if (!skillRes.ok) return null;
    // API returns { skill: {..., stats}, latestVersion, owner, moderation }
    const data = await skillRes.json();
    const skill = data.skill || data;
    const owner = data.owner || {};
    const versions = versionsRes?.ok ? await versionsRes.json() : [];
    return {
      ...mapHubSkill(skill),
      owner: owner.displayName || owner.handle || skill.owner?.handle || '',
      ownerAvatar: owner.image || skill.owner?.image || '',
      version: data.latestVersion?.version || skill.latestVersion?.version || skill.tags?.latest || '0.0.0',
      readme: skill.readme || skill.description || skill.summary || '',
      requirements: {
        env: skill.requirements?.env || skill.envKeys || [],
        bin: skill.requirements?.bin || skill.binaries || [],
      },
      versions: (versions.versions || versions.items || []).map((v: any) => ({
        version: v.version || v.tag,
        date: v.publishedAt || v.createdAt || v.date || '',
        changelog: v.changelog || v.summary || '',
        latest: v.latest || false,
      })),
    };
  } catch {
    return null;
  }
}

function mapHubSkill(raw: any): HubSkill {
  // API nests stats: { stats: { downloads, stars, installsAllTime, ... } }
  const stats = raw.stats || {};
  return {
    slug: raw.slug || raw.name || raw.id || '',
    name: raw.displayName || raw.name || raw.slug || '',
    emoji: raw.emoji || guessEmoji(raw.slug || ''),
    summary: raw.summary || raw.description || '',
    owner: raw.owner?.displayName || raw.owner?.handle || raw.owner?.username || raw.author || '',
    ownerAvatar: raw.owner?.image || raw.owner?.avatarUrl || '',
    stars: stats.stars ?? raw.stars ?? 0,
    downloads: stats.downloads ?? raw.downloads ?? 0,
    installs: stats.installsAllTime ?? stats.installsCurrent ?? raw.installs ?? 0,
    version: raw.latestVersion?.version || raw.version || raw.tags?.latest || '0.0.0',
    badge: raw.official ? 'official' : raw.featured ? 'featured' : undefined,
    category: raw.category || guessCategory(raw.slug || '', raw.summary || ''),
  };
}

function guessEmoji(slug: string): string {
  const s = slug.toLowerCase();
  if (s.includes('weather')) return '🌤️';
  if (s.includes('image') || s.includes('banana')) return '🎨';
  if (s.includes('whisper') || s.includes('audio')) return '🎙️';
  if (s.includes('github') || s.includes('git')) return '🐙';
  if (s.includes('search') || s.includes('tavily')) return '🔎';
  if (s.includes('browser')) return '🌐';
  if (s.includes('gog') || s.includes('gmail') || s.includes('google')) return '📧';
  if (s.includes('notion')) return '📓';
  if (s.includes('calendar')) return '📅';
  if (s.includes('skill') || s.includes('creator')) return '🛠️';
  if (s.includes('health')) return '🏥';
  if (s.includes('agent') || s.includes('improving')) return '🧠';
  if (s.includes('summar')) return '📝';
  if (s.includes('sonos') || s.includes('audio')) return '🔊';
  if (s.includes('obsidian')) return '💎';
  if (s.includes('human') || s.includes('write')) return '✍️';
  if (s.includes('update')) return '🔄';
  return '🧩';
}

function guessCategory(slug: string, summary: string): string {
  const s = (slug + ' ' + summary).toLowerCase();
  if (s.includes('google') || s.includes('notion') || s.includes('calendar') || s.includes('summar') || s.includes('obsidian') || s.includes('weather')) return 'prod';
  if (s.includes('github') || s.includes('browser') || s.includes('code')) return 'dev';
  if (s.includes('agent') || s.includes('improving') || s.includes('ontology') || s.includes('image') || s.includes('whisper')) return 'ai';
  if (s.includes('search') || s.includes('tavily') || s.includes('find')) return 'search';
  if (s.includes('sonos') || s.includes('home')) return 'home';
  if (s.includes('human') || s.includes('write')) return 'write';
  if (s.includes('update') || s.includes('devops')) return 'devops';
  return 'ai';
}

// ═══════════════════════════════════════════════════════════
// Gateway — Installed Skills
// ═══════════════════════════════════════════════════════════

async function fetchInstalledSkills(): Promise<MySkill[]> {
  try {
    const result = await gateway.call('skills.status', {});
    const skills = result?.skills || result?.entries || [];
    return skills.map((s: any) => ({
      slug: s.slug || s.name || s.id || '',
      name: s.displayName || s.name || s.slug || '',
      emoji: s.emoji || guessEmoji(s.slug || s.name || ''),
      description: s.description || s.summary || '',
      version: s.version || '1.0.0',
      enabled: s.enabled !== false,
      source: s.source === 'clawhub' ? 'clawhub' : s.source === 'local' ? 'local' : 'bundled',
    }));
  } catch (err) {
    console.warn('[Skills] Gateway skills.status failed:', err);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════
// Main Page
// ═══════════════════════════════════════════════════════════

type SortMode = 'trending' | 'downloads' | 'stars';
type TabId = 'my' | 'hub';

export function SkillsPage() {
  const { t } = useTranslation();
  const { connected } = useChatStore();

  // ── State ──
  const [activeTab, setActiveTab] = useState<TabId>('my');
  const [mySkills, setMySkills] = useState<MySkill[]>([]);
  const [hubSkills, setHubSkills] = useState<HubSkill[]>([]);
  const [loadingMy, setLoadingMy] = useState(false);
  const [loadingHub, setLoadingHub] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('downloads');
  const [activeCat, setActiveCat] = useState('all');
  const [detailSkill, setDetailSkill] = useState<SkillDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // ── Load data ──
  const loadMySkills = useCallback(async () => {
    if (!connected) return;
    setLoadingMy(true);
    try {
      const skills = await fetchInstalledSkills();
      setMySkills(skills);
    } finally {
      setLoadingMy(false);
    }
  }, [connected]);

  const loadHubSkills = useCallback(async () => {
    setLoadingHub(true);
    try {
      const skills = await fetchHubSkills(sortMode, 30);
      setHubSkills(skills);
    } finally {
      setLoadingHub(false);
    }
  }, [sortMode]);

  // Initial load
  useEffect(() => { loadMySkills(); }, [loadMySkills]);
  useEffect(() => { loadHubSkills(); }, [loadHubSkills]);

  // Search with debounce
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const timer = setTimeout(async () => {
      setLoadingHub(true);
      try {
        const results = await searchHubSkills(searchQuery);
        if (results.length > 0) setHubSkills(results);
      } finally {
        setLoadingHub(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Clear search → reload
  useEffect(() => {
    if (!searchQuery.trim() && activeTab === 'hub') loadHubSkills();
  }, [searchQuery]); // eslint-disable-line

  // ── Filter installed skills by status ──
  const [myFilter, setMyFilter] = useState<'all' | 'ready' | 'needs-setup' | 'disabled'>('all');

  const filteredMy = useMemo(() => {
    if (myFilter === 'all') return mySkills;
    if (myFilter === 'disabled') return mySkills.filter(s => !s.enabled);
    if (myFilter === 'ready') return mySkills.filter(s => s.enabled);
    // needs-setup: placeholder — currently no way to detect from skills.status
    return mySkills;
  }, [mySkills, myFilter]);

  const myCounts = useMemo(() => ({
    all: mySkills.length,
    ready: mySkills.filter(s => s.enabled).length,
    disabled: mySkills.filter(s => !s.enabled).length,
  }), [mySkills]);

  // ── Filtered hub skills ──
  const filteredHub = useMemo(() => {
    if (activeCat === 'all') return hubSkills;
    return hubSkills.filter(s => s.category === activeCat);
  }, [hubSkills, activeCat]);

  // ── Open detail ──
  const openDetail = useCallback(async (slug: string) => {
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailSkill(null);
    try {
      const detail = await fetchSkillDetail(slug);
      if (detail) {
        setDetailSkill(detail);
      } else {
        // Fallback: use hub data
        const hub = hubSkills.find(s => s.slug === slug);
        if (hub) setDetailSkill({ ...hub, readme: '', requirements: { env: [], bin: [] }, versions: [] });
      }
    } finally {
      setDetailLoading(false);
    }
  }, [hubSkills]);

  const closeDetail = useCallback(() => {
    setDetailOpen(false);
    setTimeout(() => setDetailSkill(null), 300);
  }, []);

  // ── Toggle skill ──
  const toggleSkill = useCallback((slug: string) => {
    setMySkills(prev => prev.map(s =>
      s.slug === slug ? { ...s, enabled: !s.enabled } : s
    ));
    // TODO: gateway call to toggle skill
  }, []);

  // ═══ RENDER ═══
  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden">
      <div className="max-w-[900px] mx-auto px-9 py-8 pb-16">

        {/* ═══ Header ═══ */}
        <div className="flex items-center gap-3 mb-6">
          <span className="text-[22px]">🧩</span>
          <h1 className="text-[21px] font-bold tracking-tight">{t('skills.title')}</h1>
        </div>

        {/* ═══ Tabs ═══ */}
        <div className="inline-flex gap-0.5 p-[3px] rounded-xl glass border border-[rgb(var(--aegis-overlay)/0.05)] mb-7">
          {([
            { id: 'my' as TabId, icon: Package, label: t('skills.mySkills'), count: mySkills.length },
            { id: 'hub' as TabId, icon: Globe, label: t('skills.clawHub'), count: hubSkills.length },
          ]).map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                'flex items-center gap-2 px-5 py-2.5 rounded-[9px] text-[13px] font-medium transition-all',
                activeTab === tab.id
                  ? 'bg-aegis-primary/[0.08] text-aegis-primary font-semibold'
                  : 'text-aegis-text-muted hover:text-aegis-text-secondary',
              )}
            >
              <tab.icon size={14} />
              {tab.label}
              <span className={clsx(
                'text-[10px] px-1.5 py-0.5 rounded-md font-semibold',
                activeTab === tab.id
                  ? 'bg-aegis-primary/10 text-aegis-primary'
                  : 'bg-[rgb(var(--aegis-overlay)/0.04)] text-aegis-text-dim',
              )}>
                {tab.count > 1000 ? `${(tab.count / 1000).toFixed(1)}k` : tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* ═══ My Skills Tab ═══ */}
        <AnimatePresence mode="wait">
          {activeTab === 'my' && (
            <motion.div
              key="my"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Status filter tabs */}
              <div className="flex gap-1 mb-4">
                {(['all', 'ready', 'disabled'] as const).map((key) => (
                  <button key={key} onClick={() => setMyFilter(key)}
                    className={clsx(
                      'px-3 py-1.5 rounded-lg text-[11px] font-medium border transition-all',
                      myFilter === key
                        ? 'bg-aegis-primary/10 text-aegis-primary border-aegis-primary/20'
                        : 'bg-[rgb(var(--aegis-overlay)/0.03)] text-aegis-text-muted border-transparent hover:bg-[rgb(var(--aegis-overlay)/0.06)]'
                    )}>
                    {key === 'all' ? t('skills.filterAll') : key === 'ready' ? t('skills.filterReady') : t('skills.filterDisabled')}
                    <span className="ml-1 opacity-60 text-[9px]">{myCounts[key as keyof typeof myCounts] ?? 0}</span>
                  </button>
                ))}
              </div>

              {loadingMy ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 size={22} className="animate-spin text-aegis-text-dim" />
                </div>
              ) : filteredMy.length === 0 ? (
                <div className="text-center py-20">
                  <div className="text-[32px] mb-3">📦</div>
                  <p className="text-[13px] text-aegis-text-dim font-medium">{t('skills.noSkills')}</p>
                  <p className="text-[11px] text-aegis-text-dim/60 mt-1">{t('skills.noSkillsHint')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredMy.map((skill) => {
                    const isDisabled = !skill.enabled;
                    return (
                      <div key={skill.slug}
                        className={clsx(
                          'p-4 rounded-xl border transition-all',
                          isDisabled
                            ? 'bg-[rgb(var(--aegis-overlay)/0.01)] border-[rgb(var(--aegis-overlay)/0.04)] opacity-50'
                            : 'bg-[rgb(var(--aegis-overlay)/0.02)] border-[rgb(var(--aegis-overlay)/0.06)] hover:border-[rgb(var(--aegis-overlay)/0.12)]'
                        )}>
                        {/* Top: emoji + name + status badge */}
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[13px] font-semibold text-aegis-text flex items-center gap-1.5">
                            <span className="text-[16px]">{skill.emoji}</span>
                            {skill.name}
                          </span>
                          <span className={clsx('text-[9px] px-2 py-0.5 rounded-full font-semibold',
                            skill.enabled ? 'bg-emerald-500/12 text-emerald-400' : 'bg-zinc-500/12 text-zinc-500'
                          )}>
                            {skill.enabled ? t('skills.statusReady') : t('skills.statusDisabled')}
                          </span>
                        </div>

                        {/* Description */}
                        <div className="text-[11px] text-aegis-text-muted leading-relaxed mb-2 line-clamp-2">
                          {skill.description}
                        </div>

                        {/* Meta: source + version */}
                        <div className="flex items-center gap-2 mb-3 text-[10px] text-aegis-text-dim">
                          <span className={clsx('px-1.5 py-0.5 rounded font-medium text-[9px]',
                            skill.source === 'clawhub' ? 'bg-purple-500/10 text-purple-400'
                            : skill.source === 'local' ? 'bg-teal-500/10 text-teal-400'
                            : 'bg-blue-500/10 text-blue-400'
                          )}>
                            {skill.source === 'clawhub' ? t('skills.sourceClawHub') : skill.source === 'local' ? t('skills.sourceCustom') : t('skills.sourceBuiltIn')}
                          </span>
                          <span className="font-mono">v{skill.version}</span>
                        </div>

                        {/* Actions: toggle */}
                        <div className="flex items-center gap-2 pt-2 border-t border-[rgb(var(--aegis-overlay)/0.04)]">
                          <button onClick={() => toggleSkill(skill.slug)}
                            className={clsx(
                              'w-8 h-[18px] rounded-full relative transition-colors',
                              skill.enabled ? 'bg-aegis-primary/40' : 'bg-[rgb(var(--aegis-overlay)/0.1)]'
                            )}>
                            <div className={clsx(
                              'w-[14px] h-[14px] rounded-full bg-white absolute top-[2px] transition-all',
                              skill.enabled ? 'left-[16px]' : 'left-[2px]'
                            )} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}

          {/* ═══ ClawHub Tab ═══ */}
          {activeTab === 'hub' && (
            <motion.div
              key="hub"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {/* Search */}
              <div className="max-w-[480px] mx-auto mb-5 relative">
                <Search size={14} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-aegis-text-dim pointer-events-none" />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={t('skills.searchPlaceholder')}
                  className="w-full ps-10 pe-4 py-2.5 rounded-xl border border-[rgb(var(--aegis-overlay)/0.06)]
                    bg-[rgb(var(--aegis-overlay)/0.02)] backdrop-blur-sm text-aegis-text text-[13.5px]
                    placeholder:text-aegis-text-dim outline-none
                    focus:border-aegis-primary/30 focus:shadow-[0_0_0_3px_rgb(var(--aegis-primary)/0.08)] transition-all"
                />
              </div>

              {/* Filters */}
              <div className="flex items-center gap-2 mb-5 flex-wrap">
                <select
                  value={sortMode}
                  onChange={e => setSortMode(e.target.value as SortMode)}
                  className="px-3 py-1.5 rounded-lg text-[11.5px] font-medium
                    bg-aegis-menu-bg border border-aegis-menu-border
                    text-aegis-text-secondary outline-none cursor-pointer
                    focus:border-aegis-primary/30"
                >
                  <option className="bg-aegis-bg text-aegis-text" value="downloads">⬇️ {t('skills.mostDownloaded')}</option>
                  <option className="bg-aegis-bg text-aegis-text" value="stars">⭐ {t('skills.mostStars')}</option>
                  <option className="bg-aegis-bg text-aegis-text" value="trending">🔥 {t('skills.trending')}</option>
                </select>

                <div className="w-px h-5 bg-[rgb(var(--aegis-overlay)/0.06)] shrink-0" />

                <CategoryChips active={activeCat} onSelect={setActiveCat} />
              </div>

              {/* Results */}
              {loadingHub ? (
                <div className="flex items-center justify-center py-20">
                  <Loader2 size={22} className="animate-spin text-aegis-text-dim" />
                </div>
              ) : filteredHub.length === 0 ? (
                <div className="text-center py-16 text-aegis-text-dim text-[13px]">
                  {t('skills.noResults')}
                </div>
              ) : (
                <div className="flex flex-col gap-px">
                  {filteredHub.map(skill => (
                    <HubSkillRow
                      key={skill.slug}
                      skill={skill}
                      onClick={() => openDetail(skill.slug)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ═══ Detail Panel ═══ */}
      <SkillDetailPanel
        open={detailOpen}
        skill={detailSkill}
        loading={detailLoading}
        onClose={closeDetail}
      />
    </div>
  );
}
