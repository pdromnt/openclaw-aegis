// ═══════════════════════════════════════════════════════════
// DashboardChart — Lazy-loaded recharts component
// Keeps recharts (~331K) out of initial Dashboard bundle
// ═══════════════════════════════════════════════════════════

import { useTranslation } from 'react-i18next';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts';
import { themeHex } from '@/utils/theme-colors';
import { fmtCost } from './components';

// ── Tooltip ──────────────────────────────────────────────────
function CostTooltip({ active, payload, label }: any) {
  const { t } = useTranslation();
  if (!active || !payload?.length) return null;
  const input  = payload.find((p: any) => p.dataKey === 'input')?.value  || 0;
  const output = payload.find((p: any) => p.dataKey === 'output')?.value || 0;
  return (
    <div className="bg-aegis-card border border-aegis-border rounded-xl p-2.5 text-[11px] shadow-lg">
      <div className="text-aegis-text-dim font-mono mb-1.5">{label}</div>
      <div className="flex items-center gap-1.5 text-aegis-accent">
        <span className="w-2 h-2 rounded-full bg-aegis-accent" />
        {t('tooltip.input')}: {fmtCost(input)}
      </div>
      <div className="flex items-center gap-1.5 text-aegis-primary">
        <span className="w-2 h-2 rounded-full bg-aegis-primary" />
        {t('tooltip.output')}: {fmtCost(output)}
      </div>
      <div className="text-aegis-text font-semibold mt-1.5 pt-1.5 border-t border-[rgb(var(--aegis-overlay)/0.06)]">
        {t('tooltip.total')}: {fmtCost(input + output)}
      </div>
    </div>
  );
}

// ── Chart ────────────────────────────────────────────────────
interface DashboardChartProps {
  chartData: { date: string; input: number; output: number }[];
}

export default function DashboardChart({ chartData }: DashboardChartProps) {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-aegis-text">{t('dashboard.dailyCostChart')}</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-aegis-text-muted font-medium">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-aegis-accent" />{t('dashboard.inputCostLabel')}</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-aegis-primary" />{t('dashboard.outputCostLabel')}</span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="gInput" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={themeHex('accent')} stopOpacity={0.25} />
              <stop offset="100%" stopColor={themeHex('accent')} stopOpacity={0} />
            </linearGradient>
            <linearGradient id="gOutput" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor={themeHex('primary')} stopOpacity={0.25} />
              <stop offset="100%" stopColor={themeHex('primary')} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--aegis-overlay) / 0.04)" vertical={false} />
          <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgb(var(--aegis-text-dim))' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 10, fill: 'rgb(var(--aegis-text-dim))' }} axisLine={false} tickLine={false}
            tickFormatter={(v) => v === 0 ? '' : `$${v.toFixed(2)}`} />
          <Tooltip content={<CostTooltip />} cursor={{ stroke: 'rgb(var(--aegis-overlay) / 0.06)' }} />
          <Area type="monotone" dataKey="input"  stackId="1"
            stroke={themeHex('accent')} strokeWidth={1.5} fill="url(#gInput)" />
          <Area type="monotone" dataKey="output" stackId="1"
            stroke={themeHex('primary')} strokeWidth={1.5} fill="url(#gOutput)" />
        </AreaChart>
      </ResponsiveContainer>
    </>
  );
}
