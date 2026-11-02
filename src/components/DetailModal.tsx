import React, { useState } from 'react';
import {
  X,
  Lock,
  Globe,
  FileText,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  ExternalLink,
  ShieldCheck,
  ListOrdered
} from 'lucide-react';
import type { DomainItem } from '../types';

interface DetailModalProps {
  item: DomainItem | null;
  onClose: () => void;
  onRecheck?: (item: DomainItem) => void;
}

export const DetailModal: React.FC<DetailModalProps> = ({ item, onClose, onRecheck }) => {
  if (!item) return null;

  const [activeTab, setActiveTab] = useState<'ssl' | 'website' | 'whois' | 'logs'>('ssl');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-slate-500 bg-slate-200/80 px-2 py-0.5 rounded">
                #{item.originalIndex}
              </span>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                {item.domain}
              </h3>
              <a
                href={`http://${item.cleanDomain}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-slate-400 hover:text-slate-600 transition-colors"
                title="Open domain in new tab"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
            <p className="text-2xs text-slate-500 mt-0.5">
              Unique ID: <code className="font-mono text-slate-600">{item.id.slice(0, 13)}...</code>
              {item.completedAt && ` · Completed: ${new Date(item.completedAt).toLocaleTimeString()}`}
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
                className="text-xs font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shadow-2xs"
              >
                Recheck
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex items-center border-b border-slate-200 px-5 gap-4 text-xs font-semibold bg-white">
          <button
            type="button"
            onClick={() => setActiveTab('ssl')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'ssl'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            <span>SSL Certificate</span>
            <span
              className={`text-3xs px-1.5 py-0.2 rounded font-bold ${
                item.ssl.status === 'YES'
                  ? 'bg-emerald-100 text-emerald-800'
                  : item.ssl.status === 'NO'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {item.ssl.status}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('website')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'website'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Website Availability</span>
            <span
              className={`text-3xs px-1.5 py-0.2 rounded font-bold ${
                item.website.status === 'YES'
                  ? 'bg-emerald-100 text-emerald-800'
                  : item.website.status === 'NO'
                  ? 'bg-rose-100 text-rose-800'
                  : 'bg-slate-100 text-slate-700'
              }`}
            >
              {item.website.status}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('whois')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'whois'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>WHOIS / RDAP</span>
            <span className="text-3xs px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-bold">
              {item.whois.status}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logs')}
            className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors ${
              activeTab === 'logs'
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <ListOrdered className="w-3.5 h-3.5" />
            <span>Audit Trail</span>
            <span className="text-3xs px-1.5 py-0.2 rounded bg-slate-100 text-slate-700 font-mono">
              {item.logs.length}
            </span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto flex-1 text-xs space-y-4">
          {/* TAB: SSL */}
          {activeTab === 'ssl' && (
            <div className="space-y-4">
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                  item.ssl.status === 'YES'
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : item.ssl.status === 'NO'
                    ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                    : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}
              >
                {item.ssl.status === 'YES' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : item.ssl.status === 'NO' ? (
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
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
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Issuer</span>
                  <p className="font-medium text-slate-900 mt-0.5">{item.ssl.issuer || 'N/A'}</p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Subject</span>
                  <p className="font-medium text-slate-900 mt-0.5">{item.ssl.subject || 'N/A'}</p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Valid From</span>
                  <p className="font-mono text-slate-900 mt-0.5">{item.ssl.validFrom || 'N/A'}</p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Valid Until</span>
                  <p className="font-mono text-slate-900 mt-0.5">
                    {item.ssl.validTo || 'N/A'}
                    {item.ssl.daysRemaining !== undefined && (
                      <span className="text-slate-500 font-sans ml-1">
                        ({item.ssl.daysRemaining} days remaining)
                      </span>
                    )}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">TLS Protocol</span>
                  <p className="font-mono text-slate-900 mt-0.5">{item.ssl.protocol || 'TLS'}</p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Cipher Suite</span>
                  <p className="font-mono text-slate-900 mt-0.5">{item.ssl.cipher || 'N/A'}</p>
                </div>
              </div>

              {item.ssl.sans && item.ssl.sans.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">
                    Subject Alternative Names (SANs)
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5 font-mono text-2xs text-slate-700">
                    {item.ssl.sans.map((san) => (
                      <span key={san} className="px-2 py-0.5 bg-white border border-slate-200 rounded">
                        {san}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: WEBSITE */}
          {activeTab === 'website' && (
            <div className="space-y-4">
              <div
                className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                  item.website.status === 'YES'
                    ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950'
                    : item.website.status === 'NO'
                    ? 'bg-rose-50/70 border-rose-200 text-rose-950'
                    : 'bg-amber-50/70 border-amber-200 text-amber-950'
                }`}
              >
                {item.website.status === 'YES' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : item.website.status === 'NO' ? (
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <h4 className="font-bold text-sm">
                    Website Status: {item.website.status}
                  </h4>
                  <p className="mt-0.5 font-medium">{item.website.reason}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">HTTP Status</span>
                  <p className="font-mono font-bold text-slate-900 mt-0.5">
                    {item.website.statusCode ?? 'N/A'}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Load Time</span>
                  <p className="font-mono text-slate-900 mt-0.5">
                    {item.website.loadTimeMs ? `${item.website.loadTimeMs} ms` : 'N/A'}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 sm:col-span-2">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Final Destination URL</span>
                  <p className="font-mono text-slate-900 mt-0.5 break-all">
                    {item.website.finalUrl || `http://${item.cleanDomain}`}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 sm:col-span-2">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Page Title</span>
                  <p className="font-medium text-slate-900 mt-0.5">
                    {item.website.title || '(No title tag found)'}
                  </p>
                </div>
              </div>

              {item.website.detectedExclusionType && item.website.detectedExclusionType !== 'none' && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-900">
                  <span className="text-2xs font-bold uppercase tracking-wider">
                    Exclusion Filter Triggered:
                  </span>
                  <p className="font-medium mt-0.5">
                    {item.website.detectedExclusionType === '404_not_found'
                      ? "Custom 404 Error: 'Sorry! That page cannot be found…' detected"
                      : item.website.detectedExclusionType === 'namecheap_expired'
                      ? 'Namecheap Expired Domain Landing Page detected'
                      : item.website.detectedExclusionType === 'bot_challenge'
                      ? 'Cloudflare / CAPTCHA Bot protection challenge'
                      : 'Permanent DNS Failure'}
                  </p>
                </div>
              )}

              {item.website.redirects && item.website.redirects.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">
                    Redirect Hops ({item.website.redirects.length})
                  </span>
                  <ol className="mt-1.5 space-y-1 font-mono text-2xs text-slate-700 list-decimal list-inside">
                    {item.website.redirects.map((hop, idx) => (
                      <li key={idx} className="truncate">{hop}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          {/* TAB: WHOIS */}
          {activeTab === 'whois' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 sm:col-span-2">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Registrar</span>
                  <p className="font-bold text-slate-900 mt-0.5">
                    {item.whois.registrar || 'Registrar unavailable via RDAP'}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Registration Date</span>
                  <p className="font-mono text-slate-900 mt-0.5">
                    {item.whois.registeredOn || 'Unavailable'}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Updated Date</span>
                  <p className="font-mono text-slate-900 mt-0.5">
                    {item.whois.updatedOn || 'Unavailable'}
                  </p>
                </div>

                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 sm:col-span-2">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">Expiration Date</span>
                  <p className="font-mono text-slate-900 mt-0.5">
                    {item.whois.expiresOn || 'Unavailable'}
                  </p>
                </div>
              </div>

              {item.whois.nameservers && item.whois.nameservers.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">
                    Nameservers
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5 font-mono text-2xs text-slate-700">
                    {item.whois.nameservers.map((ns) => (
                      <span key={ns} className="px-2 py-0.5 bg-white border border-slate-200 rounded">
                        {ns}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {item.whois.domainStatus && item.whois.domainStatus.length > 0 && (
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-2xs font-semibold text-slate-400 uppercase">
                    EPP Domain Status Flags
                  </span>
                  <div className="flex flex-wrap gap-1.5 mt-1.5 font-mono text-2xs text-slate-700">
                    {item.whois.domainStatus.map((st) => (
                      <span key={st} className="px-2 py-0.5 bg-white border border-slate-200 rounded">
                        {st}
                      </span>
                    ))}
                  </div>
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
              <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 font-mono text-2xs">
                {item.logs.map((log, i) => (
                  <div key={i} className="p-2.5 flex items-start gap-2.5 hover:bg-slate-50">
                    <span className="text-slate-400 shrink-0 tabular-nums">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                    <span
                      className={`uppercase text-3xs font-bold px-1.5 py-0.5 rounded shrink-0 ${
                        log.type === 'success'
                          ? 'bg-emerald-100 text-emerald-800'
                          : log.type === 'error'
                          ? 'bg-rose-100 text-rose-800'
                          : log.type === 'warn'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {log.step}
                    </span>
                    <span className="text-slate-700">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex items-center justify-between">
          <span className="text-2xs text-slate-500">
            Retries attempted: {item.retries} / {item.maxRetries}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors shadow-2xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
