import React, { useState } from 'react';
import {
  SlidersHorizontal,
  Cpu,
  Clock,
  RotateCw,
  Lock,
  Globe,
  FileText,
  ShieldAlert,
  Server,
  CheckCircle2,
  AlertCircle,
  Eye,
  EyeOff,
  X,
  Layers,
  Sparkles,
  Info
} from 'lucide-react';
import type { CheckerSettings } from '../types';

interface SettingsPanelProps {
  settings: CheckerSettings;
  onChange: (newSettings: CheckerSettings) => void;
  disabled: boolean;
  isOpen?: boolean;
  onClose?: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onChange,
  disabled,
  isOpen = false,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'general' | 'modules' | 'spamhaus'>('general');
  const [showPassword, setShowPassword] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    limits?: any;
  } | null>(null);

  const workerOptions = [1, 2, 3, 4, 5, 8];
  const timeoutOptions = [
    { label: '15 seconds (Fast)', value: 15 },
    { label: '30 seconds (Default)', value: 30 },
    { label: '45 seconds (Extended)', value: 45 },
    { label: '60 seconds (Heavy load)', value: 60 }
  ];
  const retryOptions = [0, 1, 2, 3];

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/spamhaus/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          username: settings.spamhausUsername?.trim() || undefined,
          password: settings.spamhausPassword || undefined,
          useProxy: settings.spamhausUseProxy,
          proxies: settings.spamhausProxies
        })
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setTestResult({
          success: false,
          message: `Server returned non-JSON response (status ${res.status})`
        });
        return;
      }

      const data = await res.json();
      setTestResult({
        success: Boolean(data.ok ?? data.success),
        message: data.message || (data.ok || data.success ? 'Connected successfully' : 'Connection failed'),
        limits: data.limits
      });
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || 'Connection test failed'
      });
    } finally {
      setTestingConnection(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity animate-in fade-in duration-200"
      />

      {/* Slide-over Drawer */}
      <div className="fixed inset-y-0 right-0 max-w-md w-full flex">
        <div className="w-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-250">
          {/* Drawer Header */}
          <div className="p-5 border-b border-slate-200/80 dark:border-slate-800 flex items-center justify-between bg-slate-50/70 dark:bg-slate-950/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                <SlidersHorizontal className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  Engine Settings
                </h3>
                <p className="text-2xs text-slate-500 dark:text-slate-400">
                  Workers, timeouts, active checks & Spamhaus API
                </p>
              </div>
            </div>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                title="Close settings drawer"
              >
                <X className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center border-b border-slate-200/80 dark:border-slate-800 px-5 gap-2 text-xs font-semibold bg-white dark:bg-slate-900">
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'general'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Cpu className="w-3.5 h-3.5" />
              <span>General</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('modules')}
              className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'modules'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Modules</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('spamhaus')}
              className={`py-3 flex items-center gap-1.5 border-b-2 transition-colors ${
                activeTab === 'spamhaus'
                  ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'border-transparent text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Spamhaus SIA</span>
              {settings.hasSpamhausCreds && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              )}
            </button>
          </div>

          {/* Drawer Body (Scrollable single-column full-width form) */}
          <div className="p-5 overflow-y-auto flex-1 space-y-5 text-xs text-slate-800 dark:text-slate-200">
            {/* TAB 1: GENERAL */}
            {activeTab === 'general' && (
              <div className="space-y-5 animate-in fade-in duration-150">
                {/* Workers */}
                <div>
                  <label className="block text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
                    Parallel Workers
                  </label>
                  <p className="text-2xs text-slate-500 dark:text-slate-400 mb-2">
                    Number of concurrent pipelines running independently.
                  </p>
                  <div className="grid grid-cols-6 gap-1.5">
                    {workerOptions.map((w) => (
                      <button
                        key={w}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange({ ...settings, workers: w })}
                        className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                          settings.workers === w
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/80 disabled:opacity-50'
                        }`}
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Navigation Timeout */}
                <div>
                  <label className="block text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
                    Network Timeout
                  </label>
                  <select
                    disabled={disabled}
                    value={settings.timeoutSeconds}
                    onChange={(e) =>
                      onChange({ ...settings, timeoutSeconds: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3.5 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
                  >
                    {timeoutOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1">
                    Maximum wait time for TLS handshake and HTTP response.
                  </p>
                </div>

                {/* Auto Retries */}
                <div>
                  <label className="block text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
                    Automatic Retries
                  </label>
                  <p className="text-2xs text-slate-500 dark:text-slate-400 mb-2">
                    Attempts made when transient timeouts or challenges occur.
                  </p>
                  <div className="grid grid-cols-4 gap-2">
                    {retryOptions.map((r) => (
                      <button
                        key={r}
                        type="button"
                        disabled={disabled}
                        onClick={() => onChange({ ...settings, maxRetries: r })}
                        className={`py-2 text-xs font-bold rounded-xl border transition-all ${
                          settings.maxRetries === r
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700/80 disabled:opacity-50'
                        }`}
                      >
                        {r === 0 ? 'Off (0)' : `${r} ${r === 1 ? 'time' : 'times'}`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* WHOIS Pacing */}
                <div>
                  <label className="block text-xs font-semibold text-slate-900 dark:text-slate-100 mb-1.5">
                    WHOIS / RDAP Pacing Delay
                  </label>
                  <select
                    disabled={disabled}
                    value={settings.whoisPacedDelayMs || 800}
                    onChange={(e) =>
                      onChange({ ...settings, whoisPacedDelayMs: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3.5 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
                  >
                    <option value={400}>400ms (Fastest)</option>
                    <option value={800}>800ms (Recommended)</option>
                    <option value={1500}>1500ms (Conservative / Safe)</option>
                  </select>
                  <p className="text-2xs text-slate-500 dark:text-slate-400 mt-1">
                    Rate pacing delay between sequential registry lookups.
                  </p>
                </div>
              </div>
            )}

            {/* TAB 2: MODULES */}
            {activeTab === 'modules' && (
              <div className="space-y-3 animate-in fade-in duration-150">
                <p className="text-2xs text-slate-500 dark:text-slate-400 mb-2">
                  Toggle inspection modules on or off for subsequent inspection runs.
                </p>

                {/* SSL Toggle */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <Lock className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">
                        SSL / TLS Verification
                      </span>
                      <span className="text-2xs text-slate-500 dark:text-slate-400">
                        Validates cert expiry, issuer, and protocol
                      </span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={settings.enableSSL}
                      onChange={(e) => onChange({ ...settings, enableSSL: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600" />
                  </label>
                </div>

                {/* Website Toggle */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">
                        Website Availability
                      </span>
                      <span className="text-2xs text-slate-500 dark:text-slate-400">
                        HTTP status, redirects, 404 & title detection
                      </span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={settings.enableWebsite}
                      onChange={(e) => onChange({ ...settings, enableWebsite: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600" />
                  </label>
                </div>

                {/* WHOIS Toggle */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">
                        WHOIS / RDAP Registry
                      </span>
                      <span className="text-2xs text-slate-500 dark:text-slate-400">
                        Registrar, registration, expiry, & nameservers
                      </span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={settings.enableWhois}
                      onChange={(e) => onChange({ ...settings, enableWhois: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600" />
                  </label>
                </div>

                {/* Spamhaus Toggle */}
                <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/50 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">
                        Spamhaus Intelligence API
                      </span>
                      <span className="text-2xs text-slate-500 dark:text-slate-400">
                        Threat tags, clusters, abuse flags & score
                      </span>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={settings.enableSpamhaus ?? false}
                      onChange={(e) => onChange({ ...settings, enableSpamhaus: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                  </label>
                </div>
              </div>
            )}

            {/* TAB 3: SPAMHAUS */}
            {activeTab === 'spamhaus' && (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="p-3 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800 flex items-start gap-2.5">
                  <Info className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <p className="text-2xs text-indigo-950 dark:text-indigo-200 leading-relaxed">
                    Credentials are held in server memory only and never logged or exported. 24h JWT tokens are cached and refreshed before expiry.
                  </p>
                </div>

                {/* Enable toggle */}
                <div className="flex items-center justify-between py-1">
                  <div>
                    <label className="text-xs font-bold text-slate-900 dark:text-white block">
                      Enable Spamhaus Check
                    </label>
                    <span className="text-2xs text-slate-500 dark:text-slate-400">
                      Query Spamhaus SIA per domain
                    </span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      disabled={disabled}
                      checked={settings.enableSpamhaus ?? false}
                      onChange={(e) => onChange({ ...settings, enableSpamhaus: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                  </label>
                </div>

                {/* Username */}
                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Spamhaus Username
                  </label>
                  <input
                    type="text"
                    disabled={disabled}
                    value={settings.spamhausUsername || ''}
                    onChange={(e) => onChange({ ...settings, spamhausUsername: e.target.value })}
                    placeholder="Username or email (or via SPAMHAUS_USERNAME)"
                    className="w-full px-3.5 py-2 text-xs font-mono bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Spamhaus Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      disabled={disabled}
                      value={settings.spamhausPassword || ''}
                      onChange={(e) => onChange({ ...settings, spamhausPassword: e.target.value })}
                      placeholder={
                        settings.hasSpamhausCreds
                          ? '•••••••• (configured on server/env)'
                          : 'Password (or via SPAMHAUS_PASSWORD)'
                      }
                      className="w-full px-3.5 py-2 pr-9 text-xs font-mono bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Pacing Delay */}
                <div>
                  <label className="block text-2xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                    Query Pacing (rl_qps = 1 limit)
                  </label>
                  <select
                    disabled={disabled}
                    value={settings.spamhausPacedDelayMs ?? 1000}
                    onChange={(e) =>
                      onChange({ ...settings, spamhausPacedDelayMs: parseInt(e.target.value, 10) })
                    }
                    className="w-full px-3.5 py-2 text-xs font-medium bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50"
                  >
                    <option value={500}>500ms (2 req/sec)</option>
                    <option value={1000}>1000ms (1 req/sec - Standard)</option>
                    <option value={1500}>1500ms (0.66 req/sec - Safe)</option>
                    <option value={2000}>2000ms (0.5 req/sec - Strict)</option>
                  </select>
                </div>

                {/* Proxy Toggle & Textarea */}
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-900 dark:text-white block">
                        Proxy Rotation
                      </span>
                      <span className="text-2xs text-slate-500 dark:text-slate-400">
                        Optional round-robin proxies
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={settings.spamhausUseProxy ?? false}
                        onChange={(e) =>
                          onChange({ ...settings, spamhausUseProxy: e.target.checked })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-10 h-6 bg-slate-200 dark:bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
                    </label>
                  </div>

                  <label className="block text-2xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    Spamhaus Proxies (1 per line, max 3)
                  </label>
                  <textarea
                    disabled={disabled}
                    rows={3}
                    value={(settings.spamhausProxies || []).join('\n')}
                    onChange={(e) => {
                      const lines = e.target.value.split('\n').slice(0, 3);
                      onChange({ ...settings, spamhausProxies: lines });
                    }}
                    placeholder={`http://user:pass@host:port\nhttp://user:pass@host2:port`}
                    className="w-full px-3 py-2 text-2xs font-mono bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 disabled:opacity-50 resize-none"
                  />
                  <p className="text-3xs text-slate-400">
                    If proxy fails or times out, engine automatically falls back to direct connection.
                  </p>
                </div>

                {/* Test Connection Button & Result */}
                <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-2.5">
                  <button
                    type="button"
                    disabled={testingConnection || disabled}
                    onClick={handleTestConnection}
                    className="w-full py-2.5 px-4 text-xs font-semibold rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 disabled:opacity-50 transition-all flex items-center justify-center gap-2 shadow-2xs"
                  >
                    {testingConnection ? (
                      <RotateCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ShieldAlert className="w-3.5 h-3.5" />
                    )}
                    <span>{testingConnection ? 'Authenticating with Spamhaus...' : 'Test Connection'}</span>
                  </button>

                  {testResult && (
                    <div
                      className={`p-3 rounded-xl border flex items-start gap-2.5 text-xs ${
                        testResult.success
                          ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                          : 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
                      }`}
                    >
                      {testResult.success ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div className="overflow-hidden">
                        <p className="font-semibold">{testResult.message}</p>
                        {testResult.limits && (
                          <pre className="text-3xs font-mono mt-1 p-1.5 bg-black/5 dark:bg-white/5 rounded max-h-24 overflow-x-auto">
                            {JSON.stringify(testResult.limits, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Drawer Footer */}
          <div className="p-4 border-t border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 flex items-center justify-between">
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                onChange({
                  workers: 4,
                  timeoutSeconds: 30,
                  maxRetries: 2,
                  enableSSL: true,
                  enableWebsite: true,
                  enableWhois: true,
                  enableSpamhaus: false,
                  spamhausUseProxy: false,
                  spamhausPacedDelayMs: 1000
                });
              }}
              className="text-2xs font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 transition-colors"
            >
              Reset to Defaults
            </button>

            {onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors shadow-2xs"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
