import React, { useState } from 'react';
import {
  X,
  Lock,
  Globe,
  FileText,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  ShieldAlert,
  ListOrdered,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Info
} from 'lucide-react';
import type { DomainItem } from '../types';

interface DetailModalProps {
  item: DomainItem | null;
  onClose: () => void;
  onRecheck?: (item: DomainItem) => void;
}

export const DetailModal: React.FC<DetailModalProps> = ({ item, onClose, onRecheck }) => {
  if (!item) return null;

  const [activeTab, setActiveTab] = useState<'overview' | 'ssl' | 'website' | 'whois' | 'spamhaus' | 'logs'>('overview');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isRawJsonOpen, setIsRawJsonOpen] = useState(false);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden transition-colors">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-3 bg-slate-50/70 dark:bg-slate-950/50">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400 bg-slate-200/80 dark:bg-slate-800 px-2 py-0.5 rounded-md">
                #{item.originalIndex}
              </span>
              <h3 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">
                {item.domain}
              </h3>
              <button
                type="button"
                onClick={() => copyToClipboard(item.cleanDomain, 'domain')}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5"
                title="Copy domain to clipboard"
              >
                {copiedKey === 'domain' ? (
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
              <a
                href={`http://${item.cleanDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors p-0.5"
                title="Open domain in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
              ID: <code className="font-mono text-slate-600 dark:text-slate-300">{item.id.slice(0, 13)}...</code>
              {item.completedAt && ` · Finished: ${new Date(item.completedAt).toLocaleTimeString()}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {onRecheck && (
              <button
                type="button"
                onClick={() => {
                  onRecheck(item);
                  onClose();
                }}
                className="text-xs font-semibold px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors shadow-2xs"
              >
                Recheck
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-slate-200/80 dark:border-slate-800 px-5 gap-2 sm:gap-3 text-xs font-semibold bg-white dark:bg-slate-900 overflow-x-auto">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'overview'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            <span>Overview</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('ssl')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'ssl'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>SSL Cert</span>
            <span
              className={`text-3xs px-1.5 py-0.2 rounded font-bold ${
                item.ssl.status === 'YES'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : item.ssl.status === 'NO'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {item.ssl.status}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('website')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'website'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Website</span>
            <span
              className={`text-3xs px-1.5 py-0.2 rounded font-bold ${
                item.website.status === 'YES'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : item.website.status === 'NO'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {item.website.status}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('whois')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'whois'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>WHOIS</span>
            <span className="text-3xs px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold">
              {item.whois.status}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('spamhaus')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'spamhaus'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Spamhaus SIA</span>
            <span
              className={`text-3xs px-1.5 py-0.2 rounded font-bold uppercase ${
                (item.spamhaus?.status || item.spamhausStatus) === 'done'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : (item.spamhaus?.status || item.spamhausStatus) === 'not found'
                  ? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  : (item.spamhaus?.status || item.spamhausStatus) === 'error'
                  ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                  : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {item.spamhaus?.status || item.spamhausStatus || 'skipped'}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'logs'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Audit</span>
            <span className="text-3xs px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
              {item.logs.length}
            </span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 text-xs space-y-4">
          {/* TAB: OVERVIEW */}
          {activeTab === 'overview' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">SSL Status</span>
                  <p className="font-bold text-slate-900 dark:text-white mt-1">{item.ssl.status}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Website Live</span>
                  <p className="font-bold text-slate-900 dark:text-white mt-1">{item.website.status}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">RDAP Status</span>
                  <p className="font-bold text-slate-900 dark:text-white mt-1">{item.whois.status}</p>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Spamhaus Intel</span>
                  <p className="font-bold text-slate-900 dark:text-white mt-1 uppercase">
                    {item.spamhaus?.status || item.spamhausStatus || 'skipped'}
                  </p>
                </div>
              </div>

              <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
                <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Quick Details
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Registrar:</span>{' '}
                    <span className="font-medium text-slate-900 dark:text-slate-100">
                      {item.whois.registrar || 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">HTTP Status:</span>{' '}
                    <span className="font-medium font-mono text-slate-900 dark:text-slate-100">
                      {item.website.statusCode ?? 'N/A'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Registered:</span>{' '}
                    <span className="font-medium font-mono text-slate-900 dark:text-slate-100">
                      {item.whois.registeredOn || 'Unavailable'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Expires:</span>{' '}
                    <span className="font-medium font-mono text-slate-900 dark:text-slate-100">
                      {item.whois.expiresOn || 'Unavailable'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: SSL */}
          {activeTab === 'ssl' && (
            <div className="space-y-4">
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                  item.ssl.status === 'YES'
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
                    : item.ssl.status === 'NO'
                    ? 'bg-rose-50/70 border-rose-200 text-rose-950 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200'
                    : 'bg-slate-50 border-slate-200 text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'
                }`}
              >
                {item.ssl.status === 'YES' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : item.ssl.status === 'NO' ? (
                  <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <HelpCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="font-bold text-sm">
                    SSL Status: {item.ssl.status}
                  </h4>
                  <p className="mt-0.5 font-medium">{item.ssl.reason}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Issuer</span>
                  <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{item.ssl.issuer || 'N/A'}</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Subject</span>
                  <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">{item.ssl.subject || 'N/A'}</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Valid From</span>
                  <p className="font-mono text-slate-900 dark:text-slate-100 mt-0.5">{item.ssl.validFrom || 'N/A'}</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Valid Until</span>
                  <p className="font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                    {item.ssl.validTo || 'N/A'}
                    {item.ssl.daysRemaining !== undefined && (
                      <span className="text-slate-500 font-sans ml-1">
                        ({item.ssl.daysRemaining} days remaining)
                      </span>
                    )}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">TLS Protocol</span>
                  <p className="font-mono text-slate-900 dark:text-slate-100 mt-0.5">{item.ssl.protocol || 'TLS'}</p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Cipher Suite</span>
                  <p className="font-mono text-slate-900 dark:text-slate-100 mt-0.5">{item.ssl.cipher || 'N/A'}</p>
                </div>
              </div>
            </div>
          )}

          {/* TAB: WEBSITE */}
          {activeTab === 'website' && (
            <div className="space-y-4">
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                  item.website.status === 'YES'
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
                    : item.website.status === 'NO'
                    ? 'bg-rose-50/70 border-rose-200 text-rose-950 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200'
                    : 'bg-amber-50/70 border-amber-200 text-amber-950 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200'
                }`}
              >
                {item.website.status === 'YES' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : item.website.status === 'NO' ? (
                  <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="font-bold text-sm">
                    Website Status: {item.website.status}
                  </h4>
                  <p className="mt-0.5 font-medium">{item.website.reason}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">HTTP Status</span>
                  <p className="font-mono font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {item.website.statusCode ?? 'N/A'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Load Time</span>
                  <p className="font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                    {item.website.loadTimeMs ? `${item.website.loadTimeMs} ms` : 'N/A'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 sm:col-span-2">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Final Destination URL</span>
                  <p className="font-mono text-slate-900 dark:text-slate-100 mt-0.5 break-all">
                    {item.website.finalUrl || `http://${item.cleanDomain}`}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 sm:col-span-2">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Page Title</span>
                  <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                    {item.website.title || '(No title tag found)'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB: WHOIS */}
          {activeTab === 'whois' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 sm:col-span-2">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Registrar</span>
                  <p className="font-bold text-slate-900 dark:text-slate-100 mt-0.5">
                    {item.whois.registrar || 'Registrar unavailable via RDAP'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Registration Date</span>
                  <p className="font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                    {item.whois.registeredOn || 'Unavailable'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Updated Date</span>
                  <p className="font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                    {item.whois.updatedOn || 'Unavailable'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 sm:col-span-2">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Expiration Date</span>
                  <p className="font-mono text-slate-900 dark:text-slate-100 mt-0.5">
                    {item.whois.expiresOn || 'Unavailable'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB: SPAMHAUS */}
          {activeTab === 'spamhaus' && (
            <div className="space-y-4">
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                  (item.spamhaus?.status || item.spamhausStatus) === 'done'
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-200'
                    : (item.spamhaus?.status || item.spamhausStatus) === 'not found'
                    ? 'bg-slate-50 border-slate-200 text-slate-900 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'
                    : (item.spamhaus?.status || item.spamhausStatus) === 'rate limited'
                    ? 'bg-amber-50/70 border-amber-200 text-amber-950 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-200'
                    : (item.spamhaus?.status || item.spamhausStatus) === 'error'
                    ? 'bg-rose-50/70 border-rose-200 text-rose-950 dark:bg-rose-950/40 dark:border-rose-800 dark:text-rose-200'
                    : 'bg-slate-50 border-slate-200 text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100'
                }`}
              >
                {(item.spamhaus?.status || item.spamhausStatus) === 'done' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                ) : (item.spamhaus?.status || item.spamhausStatus) === 'error' ? (
                  <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                ) : (item.spamhaus?.status || item.spamhausStatus) === 'rate limited' ? (
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <HelpCircle className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="font-bold text-sm">
                    Spamhaus Status: {(item.spamhaus?.status || item.spamhausStatus || 'skipped').toUpperCase()}
                  </h4>
                  <p className="mt-0.5 font-medium">
                    {item.spamhaus?.error
                      ? item.spamhaus.error
                      : (item.spamhaus?.status || item.spamhausStatus) === 'not found'
                      ? 'Domain is unknown to Spamhaus Intelligence API (404 Not Found).'
                      : (item.spamhaus?.status || item.spamhausStatus) === 'done'
                      ? 'Intelligence data retrieved successfully from Spamhaus.'
                      : (item.spamhaus?.status || item.spamhausStatus) === 'rate limited'
                      ? 'Spamhaus API rate limit reached (HTTP 429).'
                      : 'Spamhaus check was not executed.'}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 sm:col-span-2">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Threat Tags</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {item.spamhausTags ? (
                      item.spamhausTags.split(', ').map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded text-2xs font-medium bg-amber-100 text-amber-900 border border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800"
                        >
                          {tag}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400 italic">No threat tags</span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Clusters</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    {item.spamhausClusters && item.spamhausClusters !== 'NO' ? (
                      item.spamhausClusters.split(', ').map((cluster, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded text-2xs font-bold uppercase bg-indigo-100 text-indigo-800 border border-indigo-200 dark:bg-indigo-950 dark:text-indigo-300 dark:border-indigo-800"
                        >
                          {cluster}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400 font-mono">NO</span>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Abused Flag</span>
                  <p className="mt-1 font-semibold text-slate-900 dark:text-slate-100">
                    {item.spamhausAbused === true ? 'YES (Abused)' : item.spamhausAbused === false ? 'NO (Clean)' : 'N/A'}
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Cluster Auth ID</span>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="font-mono text-2xs text-slate-900 dark:text-slate-100 truncate">
                      {item.spamhausClusterAuth || 'None'}
                    </p>
                    {item.spamhausClusterAuth && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(item.spamhausClusterAuth!, 'authId')}
                        className="p-1 text-slate-400 hover:text-slate-600"
                      >
                        {copiedKey === 'authId' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Cluster Infra ID</span>
                  <div className="flex items-center justify-between gap-1 mt-0.5">
                    <p className="font-mono text-2xs text-slate-900 dark:text-slate-100 truncate">
                      {item.spamhausClusterInfra || 'None'}
                    </p>
                    {item.spamhausClusterInfra && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(item.spamhausClusterInfra!, 'infraId')}
                        className="p-1 text-slate-400 hover:text-slate-600"
                      >
                        {copiedKey === 'infraId' ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* Collapsible Raw JSON */}
              {item.spamhaus?.rawJson && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setIsRawJsonOpen(!isRawJsonOpen)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800/80 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <span>Raw Spamhaus Intelligence Payload</span>
                    {isRawJsonOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </button>
                  {isRawJsonOpen && (
                    <div className="p-3 bg-slate-950 text-slate-100 font-mono text-3xs overflow-x-auto max-h-48">
                      <pre>{JSON.stringify(item.spamhaus.rawJson, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* TAB: AUDIT LOGS */}
          {activeTab === 'logs' && (
            <div className="space-y-2">
              <span className="text-2xs font-semibold text-slate-400 uppercase">
                Sequential Execution History
              </span>
              <div className="border border-slate-200 dark:border-slate-800 rounded-xl divide-y divide-slate-100 dark:divide-slate-800 font-mono text-2xs">
                {item.logs.map((log, i) => (
                  <div key={i} className="p-2.5 flex items-start gap-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <span className="text-slate-400 shrink-0 tabular-nums">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={`uppercase text-3xs font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        log.type === 'success'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                          : log.type === 'error'
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : log.type === 'warn'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {log.step}
                    </span>
                    <span className="text-slate-700 dark:text-slate-300">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-center justify-between">
          <span className="text-2xs text-slate-500 dark:text-slate-400">
            Retries attempted: {item.retries} / {item.maxRetries}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-xl hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
