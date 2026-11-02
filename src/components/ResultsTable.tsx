import React, { useState, useMemo } from 'react';
import {
  Search,
  Download,
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
  Layers,
  Filter,
  Check
} from 'lucide-react';
import type { DomainItem, SSLStatus, WebsiteStatus } from '../types';

interface ResultsTableProps {
  items: DomainItem[];
  activeFilter: string;
  onFilterChange: (f: string) => void;
  onViewDetails: (item: DomainItem) => void;
  onRecheck: (item: DomainItem) => void;
  onRetryAllIssues: () => void;
  onRecheckMissingDates?: () => void;
  onDownloadCsv: () => void;
  onDownloadExcel: () => void;
  isChecking: boolean;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({
  items,
  activeFilter,
  onFilterChange,
  onViewDetails,
  onRecheck,
  onRetryAllIssues,
  onRecheckMissingDates,
  onDownloadCsv,
  onDownloadExcel,
  isChecking
}) => {
  const [searchQuery, setSearchQuery] = useState('');

  const missingDatesCount = useMemo(() => {
    return items.filter(
      (it) => it.status === 'completed' && (!it.whois.registeredOn || it.whois.status !== 'FOUND')
    ).length;
  }, [items]);

  // Filter items based on activeFilter and searchQuery
  // Note: Underlying export order is always preserved by originalIndex regardless of UI search/filter!
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // 1. Text search
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesDomain = item.domain.toLowerCase().includes(query);
        const matchesRegistrar = item.whois.registrar?.toLowerCase().includes(query);
        const matchesSslReason = item.ssl.reason.toLowerCase().includes(query);
        const matchesWebReason = item.website.reason.toLowerCase().includes(query);
        if (!matchesDomain && !matchesRegistrar && !matchesSslReason && !matchesWebReason) {
          return false;
        }
      }

      // 2. Segmented status filter
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
        case 'issues':
          return (
            item.ssl.status === 'NO' ||
            item.website.status === 'NO' ||
            item.status === 'failed' ||
            item.status === 'retry_required' ||
            item.website.status === 'UNKNOWN'
          );
        case 'retry_required':
          return item.status === 'retry_required' || item.website.status === 'UNKNOWN';
        case 'all':
        default:
          return true;
      }
    });
  }, [items, activeFilter, searchQuery]);

  const issueCount = useMemo(() => {
    return items.filter(
      (it) =>
        it.ssl.status === 'NO' ||
        it.website.status === 'NO' ||
        it.status === 'failed' ||
        it.status === 'retry_required' ||
        it.website.status === 'UNKNOWN'
    ).length;
  }, [items]);

  const renderSSLBadge = (status: SSLStatus, reason: string) => {
    switch (status) {
      case 'YES':
        return (
          <span
            title={reason}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            YES
          </span>
        );
      case 'NO':
        return (
          <span
            title={reason}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"
          >
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            NO
          </span>
        );
      case 'CHECKING':
        return (
          <span
            title="TLS verification in progress..."
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"
          >
            <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
            CHECKING
          </span>
        );
      case 'UNKNOWN':
      default:
        return (
          <span
            title={reason || 'Unknown'}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200"
          >
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
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
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            YES
          </span>
        );
      case 'NO':
        return (
          <span
            title={reason}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200"
          >
            <XCircle className="w-3.5 h-3.5 text-rose-600" />
            NO
          </span>
        );
      case 'CHECKING':
        return (
          <span
            title="Inspecting website response..."
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200"
          >
            <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
            CHECKING
          </span>
        );
      case 'UNKNOWN':
      default:
        return (
          <span
            title={reason || 'Unknown'}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200"
          >
            <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
            UNKNOWN
          </span>
        );
    }
  };

  const filters = [
    { id: 'all', label: 'All Domains', count: items.length },
    { id: 'ssl_yes', label: 'SSL YES', count: items.filter((i) => i.ssl.status === 'YES').length },
    { id: 'website_yes', label: 'Website YES', count: items.filter((i) => i.website.status === 'YES').length },
    { id: 'both_yes', label: 'SSL & Website YES', count: items.filter((i) => i.ssl.status === 'YES' && i.website.status === 'YES').length },
    { id: 'issues', label: 'Issues', count: issueCount },
    { id: 'retry_required', label: 'Retry Required', count: items.filter((i) => i.status === 'retry_required' || i.website.status === 'UNKNOWN').length }
  ];

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
      {/* Top Toolbar: Filter pills, Search, and Export Buttons */}
      <div className="p-4 border-b border-slate-200 space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          {/* Filter tabs */}
          <div className="flex items-center flex-wrap gap-1.5 p-1 bg-slate-100/80 rounded-lg">
            {filters.map((f) => {
              const active = activeFilter === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onFilterChange(f.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-all flex items-center gap-1.5 ${
                    active
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                  }`}
                >
                  <span>{f.label}</span>
                  <span
                    className={`text-2xs px-1.5 py-0.2 rounded-full tabular-nums font-mono ${
                      active ? 'bg-slate-100 text-slate-800' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {f.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Export buttons */}
          <div className="flex items-center flex-wrap gap-2">
            {issueCount > 0 && (
              <button
                type="button"
                onClick={onRetryAllIssues}
                disabled={isChecking}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-50 shadow-2xs"
                title="Retry domains marked with errors or unknown status"
              >
                <RotateCw className="w-3.5 h-3.5" />
                <span>Retry Issues ({issueCount})</span>
              </button>
            )}

            {missingDatesCount > 0 && onRecheckMissingDates && (
              <button
                type="button"
                onClick={onRecheckMissingDates}
                disabled={isChecking}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-800 bg-indigo-50 border border-indigo-300 rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50 shadow-2xs"
                title="Slowly re-query registry and socket for missing dates with automatic retries"
              >
                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                <span>Paced Date Recheck ({missingDatesCount})</span>
              </button>
            )}

            <button
              type="button"
              onClick={onDownloadCsv}
              disabled={items.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors disabled:opacity-50 shadow-2xs"
              title="Download CSV preserving original input order"
            >
              <FileText className="w-3.5 h-3.5 text-slate-500" />
              <span>Download CSV</span>
            </button>

            <button
              type="button"
              onClick={onDownloadExcel}
              disabled={items.length === 0}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 transition-colors disabled:opacity-50 shadow-2xs"
              title="Download Excel (.xlsx) preserving original input order"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
              <span>Download Excel</span>
            </button>
          </div>
        </div>

        {/* Second toolbar row: Search input & Preservation notice */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search domains, registrar, or status details..."
              className="w-full pl-9 pr-3 py-1.5 text-xs text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>

          <div className="text-2xs text-slate-500 flex items-center gap-1.5 font-medium">
            <Check className="w-3 h-3 text-emerald-600" />
            <span>Exports strictly preserve original 1-to-N input order</span>
          </div>
        </div>
      </div>

      {/* Main Data Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50/90 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-2xs">
              <th className="py-3 px-3.5 text-center w-12">#</th>
              <th className="py-3 px-4 min-w-[220px]">Domain</th>
              <th className="py-3 px-4 min-w-[120px]">Registered On</th>
              <th className="py-3 px-4 min-w-[120px]">Updated On</th>
              <th className="py-3 px-4 text-center min-w-[100px]">SSL</th>
              <th className="py-3 px-4 text-center min-w-[100px]">Website</th>
              <th className="py-3 px-4 text-center min-w-[110px]">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-slate-400">
                  {items.length === 0 ? (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-600">No domains entered yet</p>
                      <p className="text-xs text-slate-400">Paste your domains in the input box above and click "Start Checking".</p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-slate-600">No matching domains found</p>
                      <p className="text-xs text-slate-400">Try adjusting your search query or selecting a different filter tab.</p>
                    </div>
                  )}
                </td>
              </tr>
            ) : (
              filteredItems.map((item) => {
                return (
                  <tr
                    key={item.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    {/* Index */}
                    <td className="py-3 px-3.5 text-center text-slate-400 font-mono tabular-nums">
                      {item.originalIndex}
                    </td>

                    {/* Domain */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-900 group-hover:text-emerald-700 transition-colors">
                          {item.domain}
                        </span>
                        {item.currentWorkerId && (
                          <span className="text-3xs px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-semibold border border-emerald-200">
                            W{item.currentWorkerId}
                          </span>
                        )}
                        {item.retries > 0 && (
                          <span className="text-3xs px-1 py-0.2 rounded bg-amber-50 text-amber-700 font-semibold border border-amber-200">
                            R{item.retries}
                          </span>
                        )}
                      </div>
                      {item.whois.registrar && (
                        <span className="block text-3xs text-slate-400 truncate max-w-xs mt-0.5">
                          {item.whois.registrar}
                        </span>
                      )}
                    </td>

                    {/* Registered On */}
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                      {item.whois.registeredOn || (
                        <span className="text-slate-300 font-sans">Unavailable</span>
                      )}
                    </td>

                    {/* Updated On */}
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600">
                      {item.whois.updatedOn || (
                        <span className="text-slate-300 font-sans">Unavailable</span>
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
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => onViewDetails(item)}
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                          title="View detailed results"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        <a
                          href={`http://${item.cleanDomain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors"
                          title="Open domain in new tab"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>

                        <button
                          type="button"
                          onClick={() => onRecheck(item)}
                          disabled={isChecking && item.status === 'checking'}
                          className="p-1.5 text-slate-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors disabled:opacity-30"
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
      <div className="p-3 bg-slate-50/70 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-2 text-2xs text-slate-500 font-medium">
        <span>
          Showing {filteredItems.length} of {items.length} domains
        </span>
        <div className="flex items-center gap-3">
          <span>Sort: Permanent Original Order (1..N)</span>
        </div>
      </div>
    </div>
  );
};
