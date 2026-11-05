import React from 'react';
import {
  Globe,
  Lock,
  CheckCircle2,
  FileText,
  Layers,
  Network,
  Tag
} from 'lucide-react';
import type { InspectionStats } from '../types';

interface SummaryCardsProps {
  stats: InspectionStats;
  onSelectFilter?: (filter: string) => void;
  activeFilter?: string;
}

export const SummaryCards: React.FC<SummaryCardsProps> = ({
  stats,
  onSelectFilter,
  activeFilter
}) => {
  const cards = [
    {
      id: 'all',
      title: 'Total Scanned',
      value: stats.total,
      subtext: `${stats.completed} done · ${stats.pending} wait`,
      icon: Layers,
      color: 'slate',
      bgGlow: 'from-slate-500/10 to-transparent'
    },
    {
      id: 'ssl_yes',
      title: 'Valid SSL/TLS',
      value: stats.sslYes,
      subtext: stats.total > 0 ? `${Math.round((stats.sslYes / stats.total) * 100)}% valid certificates` : '0% valid certificates',
      icon: Lock,
      color: 'emerald',
      bgGlow: 'from-emerald-500/10 to-transparent'
    },
    {
      id: 'website_yes',
      title: 'Website Online',
      value: stats.websiteYes,
      subtext: stats.total > 0 ? `${Math.round((stats.websiteYes / stats.total) * 100)}% responding 200` : '0% responding 200',
      icon: Globe,
      color: 'blue',
      bgGlow: 'from-blue-500/10 to-transparent'
    },
    {
      id: 'both_yes',
      title: 'SSL & Web Live',
      value: stats.bothYes,
      subtext: 'Secure & active host',
      icon: CheckCircle2,
      color: 'indigo',
      bgGlow: 'from-indigo-500/10 to-transparent'
    },
    {
      id: 'whois_found',
      title: 'WHOIS Record',
      value: stats.whoisFound,
      subtext: stats.total > 0 ? `${Math.round((stats.whoisFound / stats.total) * 100)}% registered` : '0% registered',
      icon: FileText,
      color: 'purple',
      bgGlow: 'from-purple-500/10 to-transparent'
    },
    {
      id: 'clusters_yes',
      title: 'Clusters Found',
      value: stats.clustersFound || 0,
      subtext: stats.total > 0 ? `${Math.round(((stats.clustersFound || 0) / stats.total) * 100)}% infrastructure` : '0% infrastructure',
      icon: Network,
      color: 'violet',
      bgGlow: 'from-violet-500/10 to-transparent'
    },
    {
      id: 'has_tags',
      title: 'Tagged Intel',
      value: stats.taggedCount || 0,
      subtext: stats.total > 0 ? `${Math.round(((stats.taggedCount || 0) / stats.total) * 100)}% spam/threat` : '0% spam/threat',
      icon: Tag,
      color: 'amber',
      bgGlow: 'from-amber-500/10 to-transparent'
    }
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-3.5">
      {cards.map((card) => {
        const Icon = card.icon;
        const isSelected = activeFilter === card.id;

        return (
          <div
            key={card.id}
            onClick={() => onSelectFilter?.(card.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') onSelectFilter?.(card.id);
            }}
            className={`p-4 rounded-2xl bg-white dark:bg-slate-900 border transition-all text-left cursor-pointer group relative overflow-hidden flex flex-col justify-between ${
              isSelected
                ? 'border-indigo-600 ring-2 ring-indigo-500/20 shadow-md dark:border-indigo-500'
                : 'border-slate-200/80 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-xs'
            }`}
          >
            {/* Top row: Label & Icon */}
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-2xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {card.title}
              </span>
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110 ${
                  card.color === 'emerald'
                    ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400'
                    : card.color === 'blue'
                    ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                    : card.color === 'indigo'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400'
                    : card.color === 'purple' || card.color === 'violet'
                    ? 'bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400'
                    : card.color === 'amber'
                    ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
            </div>

            {/* Middle: Big Number */}
            <div className="my-0.5">
              <span className="text-2xl font-bold font-mono tracking-tight text-slate-900 dark:text-white tabular-nums">
                {card.value}
              </span>
            </div>

            {/* Bottom: Subtext */}
            <p className="mt-1 text-2xs text-slate-500 dark:text-slate-400 font-medium leading-tight">
              {card.subtext}
            </p>
          </div>
        );
      })}
    </div>
  );
};
