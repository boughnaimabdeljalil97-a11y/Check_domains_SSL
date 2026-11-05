import React, { useState, useMemo } from 'react';
import {
  Search,
  FileSpreadsheet,
  FileText,
  ExternalLink,
  Eye,
  RotateCw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
  Clock,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Check,
  ShieldAlert,
  Inbox
} from 'lucide-react';
import type { DomainItem, SSLStatus, WebsiteStatus } from '../types';

interface ResultsTableProps {
  items: DomainItem[];
  activeFilter: string;
  onFilterChange: (f: string) => void;
  onViewDetails: (item: DomainItem) => void;
  onRecheck: (item: DomainItem) => void;
  onRetryAllIssues: () => void;
  onRetrySpamhaus?: () => void;
  onRecheckMissingDates?: () => void;
  onDownloadCsv: () => void;
  onDownloadExcel: () => void;
  isChecking: boolean;
}

type SortField = 'originalIndex' | 'domain' | 'ssl' | 'website' | 'registeredOn' | 'updatedOn' | 'clusters';
type SortDirection = 'asc' | 'desc';

export const ResultsTable: React.FC<ResultsTableProps> = ({
  items,
  activeFilter,
  onFilterChange,
  onViewDetails,
  onRecheck,
  onRetryAllIssues,
  onRetrySpamhaus,
  onRecheckMissingDates,
  onDownloadCsv,
  onDownloadExcel,
  isChecking
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField>('originalIndex');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const missingDatesCount = useMemo(() => {
    return items.filter(
      (it) => it.status === 'completed' && (!it.whois.registeredOn || it.whois.status !== 'FOUND')
    ).length;
  }, [items]);

  const spamhausErrorCount = useMemo(() => {
    return items.filter(
      (it) => it.spamhaus?.status === 'error' || it.spamhaus?.status === 'rate limited'
    ).length;
  }, [items]);

  const issueCount = useMemo(() => {
    return items.filter(
      (it) =>
        it.ssl.status === 'NO' ||
        it.website.status === 'NO' ||
        it.status === 'failed' ||
        it.status === 'retry_required' ||
        it.website.status === 'UNKNOWN' ||
        it.spamhaus?.status === 'error' ||
        it.spamhaus?.status === 'rate limited'
    ).length;
  }, [items]);

  // Filter items based on activeFilter and searchQuery
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Text search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesDomain = item.domain.toLowerCase().includes(query);
        const matchesRegistrar = item.whois.registrar?.toLowerCase().includes(query);
        const matchesSslReason = item.ssl.reason.toLowerCase().includes(query);
        const matchesWebReason = item.website.reason.toLowerCase().includes(query);
        const matchesTags = (item.spamhausTags || item.spamhaus?.tags || '').toLowerCase().includes(query);
        const matchesClusters = (item.spamhausClusters || item.spamhaus?.clusters || '').toLowerCase().includes(query);

        if (
          !matchesDomain &&
          !matchesRegistrar &&
          !matchesSslReason &&
          !matchesWebReason &&
          !matchesTags &&
          !matchesClusters
        ) {
          return false;
        }
      }

      // 2. Segmented status filter
      const clusterVal = item.spamhausClusters || item.spamhaus?.clusters || '';
      const tagsVal = item.spamhausTags || item.spamhaus?.tags || '';

      switch (activeFilter) {
        case 'ssl_yes':
          return item.ssl.status === 'YES';
        case 'ssl_no':
          return item.ssl.status === 'NO';
        case 'website_yes':
          return item.website.status === 'YES';
        case 'website_no':
          return item.website.status === 'NO';
        case 'both_yes':
          return item.ssl.status === 'YES' && item.website.status === 'YES';
        case 'clusters_yes':
          return clusterVal !== 'NO' && clusterVal.length > 0;
        case 'clusters_no':
          return clusterVal === 'NO';
        case 'has_tags':
          return tagsVal.trim().length > 0;
        case 'issues':
          return (
            item.ssl.status === 'NO' ||
            item.website.status === 'NO' ||
            item.status === 'failed' ||
            item.status === 'retry_required' ||
            item.website.status === 'UNKNOWN' ||
            item.spamhaus?.status === 'error' ||
            item.spamhaus?.status === 'rate limited'
          );
        case 'retry_required':
          return item.status === 'retry_required' || item.website.status === 'UNKNOWN';
        case 'all':
        default:
          return true;
      }
    });
  }, [items, activeFilter, searchQuery]);

  // Sort filtered items (UI table display only; underlying export order always preserved by originalIndex)
  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let cmp = 0;
      switch (sortField) {
        case 'originalIndex':
          cmp = a.originalIndex - b.originalIndex;
          break;
        case 'domain':
          cmp = a.domain.localeCompare(b.domain);
          break;
        case 'ssl':
          cmp = a.ssl.status.localeCompare(b.ssl.status);
          break;
        case 'website':
          cmp = a.website.status.localeCompare(b.website.status);
          break;
        case 'registeredOn':
          cmp = (a.whois.registeredOn || '').localeCompare(b.whois.registeredOn || '');
          break;
        case 'updatedOn':
          cmp = (a.whois.updatedOn || '').localeCompare(b.whois.updatedOn || '');
          break;
        case 'clusters':
          cmp = (a.spamhausClusters || '').localeCompare(b.spamhausClusters || '');
          break;
        default:
          cmp = a.originalIndex - b.originalIndex;
      }
      return sortDirection === 'asc' ? cmp : -cmp;
    });
  }, [filteredItems, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIndicator = (field: SortField) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-3 h-3 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />;
    }
    return sortDirection === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
    );
  };

  const renderSSLBadge = (status: SSLStatus, reason: string) => {
    switch (status) {
      case 'YES':
        return (
          <span
            title={reason}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            YES
          </span>
        );
      case 'NO':
        return (
          <span
            title={reason}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
          >
            <XCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
            NO
          </span>
        );
      case 'CHECKING':
        return (
          <span
            title="TLS verification in progress..."
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
          >
            <Loader2 className="w-3 h-3 text-amber-600 dark:text-amber-400 animate-spin" />
            CHECKING
          </span>
        );
      case 'UNKNOWN':
      default:
        return (
          <span
            title={reason || 'Unknown'}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
          >
            <HelpCircle className="w-3 h-3 text-slate-400" />
            UNKNOWN
          </span>
        );
    }
  };

  const renderWebsiteBadge = (status: WebsiteStatus, reason: string) => {
    switch (status) {
      case 'YES':
        return (
          <span
            title={reason}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
          >
            <CheckCircle2 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
            YES
          </span>
        );
      case 'NO':
        return (
          <span
            title={reason}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
          >
            <XCircle className="w-3 h-3 text-rose-600 dark:text-rose-400" />
            NO
          </span>
        );
      case 'CHECKING':
        return (
          <span
            title="Inspecting website response..."
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
          >
            <Loader2 className="w-3 h-3 text-amber-600 dark:text-amber-400 animate-spin" />
            CHECKING
          </span>
        );
      case 'UNKNOWN':
      default:
        return (
          <span
            title={reason || 'Unknown'}
            className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700"
          >
            <HelpCircle className="w-3 h-3 text-slate-400" />
            UNKNOWN
          </span>
        );
    }
  };

  const renderClustersBadge = (item: DomainItem) => {
    const clusters = item.spamhausClusters || item.spamhaus?.clusters || '';
    const status = item.spamhausStatus || item.spamhaus?.status;

    if (status === 'skipped') {
      return <span className="text-slate-300 dark:text-slate-600 font-mono text-2xs">-</span>;
    }

    if (status === 'running') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
          <Loader2 className="w-2.5 h-2.5 text-amber-600 animate-spin" />
          SIA...
        </span>
      );
    }

    if (status === 'error') {
      return (
        <span
          title={item.spamhaus?.error || 'Spamhaus check error'}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold uppercase bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800"
        >
          Error
        </span>
      );
    }

    if (status === 'rate limited') {
      return (
        <span
          title="Spamhaus rate limit (HTTP 429)"
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
        >
          429
        </span>
      );
    }

    if (clusters === 'auth, infra') {
      return (
        <div className="flex items-center justify-center gap-1">
          <span className="px-1.5 py-0.5 rounded-md text-3xs font-bold uppercase bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
            auth
          </span>
          <span className="px-1.5 py-0.5 rounded-md text-3xs font-bold uppercase bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
            infra
          </span>
        </div>
      );
    }

    if (clusters === 'auth') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-3xs font-bold uppercase bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
          auth
        </span>
      );
    }

    if (clusters === 'infra') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md text-3xs font-bold uppercase bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
          infra
        </span>
      );
    }

    if (clusters === 'NO') {
      return (
        <span className="text-slate-400 dark:text-slate-500 font-mono text-2xs font-bold">
          NO
        </span>
      );
    }

    return <span className="text-slate-300 dark:text-slate-600 font-mono text-2xs">-</span>;
  };

  const renderTags = (item: DomainItem) => {
    const tagsStr = item.spamhausTags || item.spamhaus?.tags || '';
    if (!tagsStr.trim()) {
      return <span className="text-slate-300 dark:text-slate-600 font-mono text-2xs">-</span>;
    }
    const tagList = tagsStr.split(',').map((t) => t.trim()).filter(Boolean);
    return (
      <div className="flex flex-wrap items-center gap-1">
        {tagList.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center px-2 py-0.5 rounded-md text-3xs font-mono font-semibold bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800"
          >
            {tag}
          </span>
        ))}
      </div>
    );
  };

  const filters = [
    { id: 'all', label: 'All', count: items.length },
    { id: 'ssl_yes', label: 'SSL YES', count: items.filter((i) => i.ssl.status === 'YES').length },
    { id: 'website_yes', label: 'Web YES', count: items.filter((i) => i.website.status === 'YES').length },
    { id: 'both_yes', label: 'Both Live', count: items.filter((i) => i.ssl.status === 'YES' && i.website.status === 'YES').length },
    {
      id: 'clusters_yes',
      label: 'Clusters: YES',
      count: items.filter((i) => (i.spamhausClusters || i.spamhaus?.clusters) && (i.spamhausClusters || i.spamhaus?.clusters) !== 'NO').length
    },
    {
      id: 'clusters_no',
      label: 'Clusters: NO',
      count: items.filter((i) => (i.spamhausClusters || i.spamhaus?.clusters) === 'NO').length
    },
    {
      id: 'has_tags',
      label: 'Has Tags',
      count: items.filter((i) => Boolean((i.spamhausTags || i.spamhaus?.tags)?.trim())).length
    },
    { id: 'issues', label: 'Issues', count: issueCount },
    { id: 'retry_required', label: 'Retries', count: items.filter((i) => i.status === 'retry_required' || i.website.status === 'UNKNOWN').length }
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xs overflow-hidden transition-colors">
      {/* Top Toolbar: Filter pills, Search, and Export Buttons */}
      <div className="p-4 sm:p-5 border-b border-slate-200/80 dark:border-slate-800 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Filter pills */}
          <div className="flex items-center flex-wrap gap-1.5 p-1 bg-slate-100/80 dark:bg-slate-800/80 rounded-xl">
            {filters.map((f) => {
              const active = activeFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onFilterChange(f.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 ${
                    active
                      ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-400 shadow-2xs font-bold'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                  }`}
                >
                  <span>{f.label}</span>
                  <span
                    className={`text-2xs px-1.5 py-0.2 rounded-full tabular-nums font-mono ${
                      active
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {f.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Action & Export buttons */}
          <div className="flex items-center flex-wrap gap-2">
            {issueCount > 0 && (
              <button
                type="button"
                onClick={onRetryAllIssues}
                disabled={isChecking}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl hover:bg-amber-100 dark:hover:bg-amber-900/60 transition-colors disabled:opacity-50 shadow-2xs"
                title="Retry domains marked with errors or unknown status"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Retry Issues ({issueCount})</span>
              </button>
            )}

            {spamhausErrorCount > 0 && onRetrySpamhaus && (
              <button
                type="button"
                onClick={onRetrySpamhaus}
                disabled={isChecking}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-rose-800 dark:text-rose-200 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors disabled:opacity-50 shadow-2xs"
                title="Retry domains with Spamhaus errors or rate limits"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Retry Spamhaus ({spamhausErrorCount})</span>
              </button>
            )}

            {missingDatesCount > 0 && onRecheckMissingDates && (
              <button
                type="button"
                onClick={onRecheckMissingDates}
                disabled={isChecking}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-800 dark:text-indigo-200 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 rounded-xl hover:bg-indigo-100 dark:hover:bg-indigo-900/60 transition-colors disabled:opacity-50 shadow-2xs"
                title="Slowly re-query registry and socket for missing dates with automatic retries"
              >
                <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Paced RDAP ({missingDatesCount})</span>
              </button>
            )}

            {/* Download CSV (Secondary button) */}
            <button
              type="button"
              onClick={onDownloadCsv}
              disabled={items.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 shadow-2xs"
              title="Download CSV preserving original input order"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
              <span>CSV</span>
            </button>

            {/* Download Excel (Primary button) */}
            <button
              type="button"
              onClick={onDownloadExcel}
              disabled={items.length === 0}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 rounded-xl transition-all disabled:opacity-50 shadow-xs shadow-indigo-500/20"
              title="Download Excel (.xlsx) preserving original input order"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>Excel (XLSX)</span>
            </button>
          </div>
        </div>

        {/* Second toolbar row: Search input & Order note */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search domains, registrar, tags, clusters..."
              className="w-full pl-9 pr-8 py-2 text-xs text-slate-900 dark:text-white bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors placeholder:text-slate-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                Clear
              </button>
            )}
          </div>

          <div className="text-2xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5 font-medium">
            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Exports strictly preserve original 1-to-N input order</span>
          </div>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-xs border-b border-slate-200/80 dark:border-slate-800 text-slate-600 dark:text-slate-400 font-semibold uppercase tracking-wider text-2xs">
            <tr>
              <th
                onClick={() => handleSort('originalIndex')}
                className="py-3.5 px-3.5 text-center w-12 cursor-pointer group hover:text-slate-900 dark:hover:text-white select-none"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>#</span>
                  {renderSortIndicator('originalIndex')}
                </div>
              </th>
              <th
                onClick={() => handleSort('domain')}
                className="py-3.5 px-4 min-w-[200px] cursor-pointer group hover:text-slate-900 dark:hover:text-white select-none"
              >
                <div className="flex items-center gap-1">
                  <span>Domain</span>
                  {renderSortIndicator('domain')}
                </div>
              </th>
              <th className="py-3.5 px-4 min-w-[140px]">Tags</th>
              <th
                onClick={() => handleSort('clusters')}
                className="py-3.5 px-4 text-center min-w-[110px] cursor-pointer group hover:text-slate-900 dark:hover:text-white select-none"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Clusters</span>
                  {renderSortIndicator('clusters')}
                </div>
              </th>
              <th
                onClick={() => handleSort('registeredOn')}
                className="py-3.5 px-4 min-w-[120px] cursor-pointer group hover:text-slate-900 dark:hover:text-white select-none"
              >
                <div className="flex items-center gap-1">
                  <span>Registered</span>
                  {renderSortIndicator('registeredOn')}
                </div>
              </th>
              <th
                onClick={() => handleSort('updatedOn')}
                className="py-3.5 px-4 min-w-[120px] cursor-pointer group hover:text-slate-900 dark:hover:text-white select-none"
              >
                <div className="flex items-center gap-1">
                  <span>Updated</span>
                  {renderSortIndicator('updatedOn')}
                </div>
              </th>
              <th
                onClick={() => handleSort('ssl')}
                className="py-3.5 px-4 text-center min-w-[100px] cursor-pointer group hover:text-slate-900 dark:hover:text-white select-none"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>SSL</span>
                  {renderSortIndicator('ssl')}
                </div>
              </th>
              <th
                onClick={() => handleSort('website')}
                className="py-3.5 px-4 text-center min-w-[100px] cursor-pointer group hover:text-slate-900 dark:hover:text-white select-none"
              >
                <div className="flex items-center justify-center gap-1">
                  <span>Website</span>
                  {renderSortIndicator('website')}
                </div>
              </th>
              <th className="py-3.5 px-4 text-center min-w-[110px]">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {sortedItems.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-16 text-center text-slate-400 dark:text-slate-500">
                  <div className="max-w-sm mx-auto flex flex-col items-center gap-2">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-1">
                      <Inbox className="w-6 h-6" />
                    </div>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                      {items.length === 0 ? 'No domains queued yet' : 'No matching domains found'}
                    </p>
                    <p className="text-2xs text-slate-400 dark:text-slate-500">
                      {items.length === 0
                        ? 'Paste domains in the input box and click "Inspect Domains" to begin.'
                        : 'Try searching with a different term or clear the active filter tab.'}
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              sortedItems.map((item, idx) => {
                const isItemChecking = item.status === 'checking';

                return (
                  <tr
                    key={item.id}
                    className={`transition-colors group ${
                      idx % 2 === 0
                        ? 'bg-white dark:bg-slate-900'
                        : 'bg-slate-50/50 dark:bg-slate-950/40'
                    } hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20`}
                  >
                    {/* Index */}
                    <td className="py-3 px-3.5 text-center text-slate-400 dark:text-slate-500 font-mono tabular-nums text-2xs">
                      {item.originalIndex}
                    </td>

                    {/* Domain */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {item.domain}
                        </span>
                        {item.currentWorkerId && (
                          <span className="text-3xs px-1.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800">
                            W{item.currentWorkerId}
                          </span>
                        )}
                        {item.retries > 0 && (
                          <span className="text-3xs px-1.5 py-0.5 rounded-full bg-amber-50 dark:bg-amber-950/80 text-amber-700 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-800">
                            R{item.retries}
                          </span>
                        )}
                      </div>
                      {item.whois.registrar && (
                        <span className="block text-3xs text-slate-400 dark:text-slate-500 truncate max-w-xs mt-0.5">
                          {item.whois.registrar}
                        </span>
                      )}
                    </td>

                    {/* Tags */}
                    <td className="py-3 px-4">
                      {renderTags(item)}
                    </td>

                    {/* Clusters */}
                    <td className="py-3 px-4 text-center">
                      {renderClustersBadge(item)}
                    </td>

                    {/* Registered On */}
                    <td className="py-3 px-4 font-mono tabular-nums text-2xs text-slate-600 dark:text-slate-300">
                      {item.whois.registeredOn || (
                        <span className="text-slate-300 dark:text-slate-600 font-sans">Unavailable</span>
                      )}
                    </td>

                    {/* Updated On */}
                    <td className="py-3 px-4 font-mono tabular-nums text-2xs text-slate-600 dark:text-slate-300">
                      {item.whois.updatedOn || (
                        <span className="text-slate-300 dark:text-slate-600 font-sans">Unavailable</span>
                      )}
                    </td>

                    {/* SSL */}
                    <td className="py-3 px-4 text-center">
                      {renderSSLBadge(item.ssl.status, item.ssl.reason)}
                    </td>

                    {/* Website */}
                    <td className="py-3 px-4 text-center">
                      {renderWebsiteBadge(item.website.status, item.website.reason)}
                    </td>

                    {/* Actions */}
                    <td className="py-3 px-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          onClick={() => onViewDetails(item)}
                          className="p-1.5 text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="Deep Inspection Details"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <a
                          href={`http://${item.cleanDomain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                          title="Open domain in new tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>

                        <button
                          type="button"
                          onClick={() => onRecheck(item)}
                          disabled={isChecking && isItemChecking}
                          className="p-1.5 text-slate-500 hover:text-emerald-600 dark:text-slate-400 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg transition-colors disabled:opacity-30"
                          title="Recheck this domain"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Table Footer */}
      <div className="p-3.5 bg-slate-50/70 dark:bg-slate-950/50 border-t border-slate-200/80 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 text-2xs text-slate-500 dark:text-slate-400 font-medium">
        <span>
          Showing {sortedItems.length} of {items.length} domains
        </span>
        <div className="flex items-center gap-3">
          <span>Sort column: <code className="font-mono text-slate-700 dark:text-slate-300 font-semibold">{sortField} ({sortDirection})</code></span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span>Exports preserve original 1..N order</span>
        </div>
      </div>
    </div>
  );
};
