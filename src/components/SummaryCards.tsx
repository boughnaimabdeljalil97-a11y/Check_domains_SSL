import React from 'react';
import {
  Globe,
  Lock,
  CheckCircle2,
  FileText,
  Layers,
  AlertTriangle,
  RotateCcw
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
      title: 'Total Domains',
      value: stats.total,
      subtext: `${stats.completed} completed · ${stats.pending} pending`,
      icon: Layers,
      color: 'slate',
      badgeColor: 'bg-slate-100 text-slate-700'
    },
    {
      id: 'ssl_yes',
      title: 'SSL = YES',
      value: stats.sslYes,
      subtext: stats.total > 0 ? `${Math.round((stats.sslYes / stats.total) * 100)}% valid TLS` : '0% valid TLS',
      icon: Lock,
      color: 'emerald',
      badgeColor: 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    },
    {
      id: 'website_yes',
      title: 'Website = YES',
      value: stats.websiteYes,
      subtext: stats.total > 0 ? `${Math.round((stats.websiteYes / stats.total) * 100)}% online` : '0% online',
      icon: Globe,
      color: 'emerald',
      badgeColor: 'bg-emerald-50 text-emerald-700 border border-emerald-200'
    },
    {
      id: 'both_yes',
      title: 'SSL & Website = YES',
      value: stats.bothYes,
      subtext: 'Fully secure & active',
      icon: CheckCircle2,
      color: 'blue',
      badgeColor: 'bg-blue-50 text-blue-700 border border-blue-200'
    },
    {
      id: 'whois_found',
      title: 'WHOIS Data Found',
      value: stats.whoisFound,
      subtext: stats.total > 0 ? `${Math.round((stats.whoisFound / stats.total) * 100)}% with RDAP` : '0% with RDAP',
      icon: FileText,
      color: 'indigo',
      badgeColor: 'bg-indigo-50 text-indigo-700 border border-indigo-200'
    }
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
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
            className={`p-4 rounded-xl bg-white border transition-all text-left cursor-pointer shadow-2xs ${
              isSelected
                ? 'border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                : 'border-slate-200 hover:border-slate-300'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {card.title}
              </span>
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  card.color === 'emerald'
                    ? 'bg-emerald-50 text-emerald-600'
                    : card.color === 'blue'
                    ? 'bg-blue-50 text-blue-600'
                    : card.color === 'indigo'
                    ? 'bg-indigo-50 text-indigo-600'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
            </div>

            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold tracking-tight text-slate-900 tabular-nums">
                {card.value}
              </span>
            </div>

            <p className="mt-1.5 text-xs text-slate-500 truncate font-medium">
              {card.subtext}
            </p>
          </div>
        );
      })}
    </div>
  );
};
