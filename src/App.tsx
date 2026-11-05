import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity,
  Cpu,
  Clock,
  Layers,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Play,
  Pause,
  Square,
  Settings,
  X
} from 'lucide-react';
import { Header } from './components/Header';
import { SummaryCards } from './components/SummaryCards';
import { DomainInput } from './components/DomainInput';
import { SettingsPanel } from './components/SettingsPanel';
import { ProgressBar } from './components/ProgressBar';
import { ResultsTable } from './components/ResultsTable';
import { DetailModal } from './components/DetailModal';
import { TestSuiteModal } from './components/TestSuiteModal';
import type {
  InspectionState,
  CheckerSettings,
  DomainItem,
  ValidationSummary
} from './types';

const INITIAL_SAMPLE_DOMAINS = `jombre takula.com
carcrashkits.com
supporteasyjet.com
repro-tech.co.uk`;

const DEFAULT_SETTINGS: CheckerSettings = {
  workers: 4,
  timeoutSeconds: 30,
  maxRetries: 2,
  enableSSL: true,
  enableWebsite: true,
  enableWhois: true,
  enableSpamhaus: false,
  spamhausUseProxy: false,
  spamhausPacedDelayMs: 1000
};

const DEFAULT_STATE: InspectionState = {
  status: 'idle',
  items: [],
  settings: DEFAULT_SETTINGS,
  stats: {
    total: 0,
    completed: 0,
    pending: 0,
    inFlight: 0,
    retryRequired: 0,
    sslYes: 0,
    sslNo: 0,
    websiteYes: 0,
    websiteNo: 0,
    bothYes: 0,
    whoisFound: 0,
    clustersFound: 0,
    taggedCount: 0,
    spamhausErrors: 0,
    percentComplete: 0
  },
  activeWorkers: 0,
  currentWorkerAssignments: {},
  startedAt: null,
  updatedAt: new Date().toISOString()
};

interface Toast {
  id: string;
  type: 'success' | 'info' | 'error' | 'warn';
  message: string;
}

export default function App() {
  const [domainText, setDomainText] = useState(INITIAL_SAMPLE_DOMAINS);
  const [settings, setSettings] = useState<CheckerSettings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<InspectionState>(DEFAULT_STATE);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedDetailItem, setSelectedDetailItem] = useState<DomainItem | null>(null);
  const [isTestSuiteOpen, setIsTestSuiteOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [validation, setValidation] = useState<ValidationSummary>({
    valid: [],
    invalid: [],
    duplicates: [],
    totalValid: 0,
    totalInvalid: 0,
    totalDuplicates: 0
  });

  const showToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  // Sync dark mode class on <html>
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Client-side domain validation & normalization
  const validateInputDomains = useCallback((text: string) => {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    const valid: string[] = [];
    const invalid: string[] = [];
    const duplicates: string[] = [];
    const seen = new Set<string>();

    const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

    for (const line of lines) {
      let s = line.replace(/^["']|["']$/g, '').trim();
      s = s.replace(/^(?:https?:\/\/)/i, '');
      s = s.split('/')[0].split('?')[0].split('#')[0];
      s = s.split(':')[0].toLowerCase().trim();

      if (!s || s.includes(' ') || s.includes('@') || !domainRegex.test(s)) {
        invalid.push(line);
      } else if (seen.has(s)) {
        duplicates.push(line);
      } else {
        seen.add(s);
        valid.push(s);
      }
    }

    setValidation({
      valid,
      invalid,
      duplicates,
      totalValid: valid.length,
      totalInvalid: invalid.length,
      totalDuplicates: duplicates.length
    });
  }, []);

  useEffect(() => {
    validateInputDomains(domainText);
  }, [domainText, validateInputDomains]);

  // Connect to backend Server-Sent Events (SSE) for live, real-time updates
  useEffect(() => {
    let evtSource: EventSource | null = null;
    let pollInterval: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      try {
        evtSource = new EventSource('/api/events');

        evtSource.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.state) {
              setState(data.state);
              // Update selected item in modal if it's currently open
              setSelectedDetailItem((prev) => {
                if (!prev) return null;
                const updated = data.state.items.find((it: DomainItem) => it.id === prev.id);
                return updated || prev;
              });

              if (data.event === 'job_completed') {
                showToast(`Inspection completed for ${data.state.stats.total} domains`, 'success');
              }
            }
          } catch (e) {
            console.error('Error parsing SSE event', e);
          }
        };

        evtSource.onerror = () => {
          evtSource?.close();
          // Fall back to lightweight polling if SSE is disconnected
          if (!pollInterval) {
            pollInterval = setInterval(fetchStatus, 2000);
          }
        };
      } catch (err) {
        console.error('SSE initialization error', err);
      }
    };

    const fetchStatus = async () => {
      try {
        const res = await fetch('/api/status');
        if (res.ok) {
          const data = await res.json();
          setState(data);
        }
      } catch {}
    };

    fetchStatus();
    connectSSE();

    return () => {
      evtSource?.close();
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [showToast]);

  // Synchronize server credential awareness to local settings if detected
  useEffect(() => {
    if (state.settings?.hasSpamhausCreds !== undefined) {
      setSettings((prev) => ({
        ...prev,
        hasSpamhausCreds: state.settings.hasSpamhausCreds,
        enableSpamhaus: prev.enableSpamhaus ?? state.settings.enableSpamhaus ?? false
      }));
    }
  }, [state.settings?.hasSpamhausCreds, state.settings?.enableSpamhaus]);

  // Handlers
  const handleStart = async () => {
    if (validation.valid.length === 0) return;
    try {
      showToast(`Starting inspection for ${validation.totalValid} domains...`, 'info');
      const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domains: domainText,
          settings
        })
      });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (err) {
      console.error('Failed to start inspection', err);
      showToast('Failed to start inspection', 'error');
    }
  };

  const handlePause = async () => {
    try {
      showToast('Pausing inspection workers...', 'info');
      const res = await fetch('/api/pause', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (err) {
      console.error('Failed to pause', err);
    }
  };

  const handleResume = async () => {
    try {
      showToast('Resuming inspection workers...', 'info');
      const res = await fetch('/api/resume', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (err) {
      console.error('Failed to resume', err);
    }
  };

  const handleStop = async () => {
    try {
      showToast('Inspection stopped', 'warn');
      const res = await fetch('/api/stop', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (err) {
      console.error('Failed to stop', err);
    }
  };

  const handleRecheckItem = async (item: DomainItem) => {
    try {
      showToast(`Queued recheck for ${item.domain}`, 'info');
      const res = await fetch('/api/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id })
      });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (err) {
      console.error('Failed to recheck item', err);
    }
  };

  const handleRetryAllIssues = async () => {
    try {
      showToast('Retrying all issue domains...', 'info');
      const res = await fetch('/api/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allIssues: true })
      });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (err) {
      console.error('Failed to retry all issues', err);
    }
  };

  const handleRecheckMissingDates = async () => {
    try {
      showToast('Initiating paced RDAP registry recheck...', 'info');
      const res = await fetch('/api/recheck-missing-whois', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (err) {
      console.error('Failed to recheck missing dates', err);
    }
  };

  const handleRetrySpamhaus = async () => {
    try {
      showToast('Retrying Spamhaus error domains...', 'info');
      const res = await fetch('/api/retry-spamhaus', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (err) {
      console.error('Failed to retry Spamhaus errors', err);
    }
  };

  const handleDownloadCsv = () => {
    showToast('Downloading CSV report (order preserved)...', 'success');
    window.location.href = '/api/export/csv';
  };

  const handleDownloadExcel = () => {
    showToast('Downloading Excel spreadsheet (order preserved)...', 'success');
    window.location.href = '/api/export/xlsx';
  };

  const isChecking = state.status === 'running';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans selection:bg-indigo-100 selection:text-indigo-900 transition-colors">
      {/* 1. Top Header */}
      <Header
        state={state}
        onStart={handleStart}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
        onOpenTestSuite={() => setIsTestSuiteOpen(true)}
        hasValidDomains={validation.totalValid > 0}
        onOpenSettings={() => setIsSettingsOpen(true)}
        isDarkMode={isDarkMode}
        onToggleDarkMode={() => setIsDarkMode(!isDarkMode)}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* 2. Responsive KPI Summary Cards */}
        <SummaryCards
          stats={state.stats}
          activeFilter={activeFilter}
          onSelectFilter={(f) => setActiveFilter(f)}
        />

        {/* 3. Main 12-Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left Column (8 cols): Domain Input + Progress Track */}
          <div className="lg:col-span-8 space-y-5">
            <DomainInput
              value={domainText}
              onChange={setDomainText}
              validation={validation}
              isChecking={isChecking}
              onClear={() => setDomainText('')}
              onLoadSample={() => setDomainText(INITIAL_SAMPLE_DOMAINS)}
            />

            <ProgressBar state={state} />
          </div>

          {/* Right Column (4 cols): Live Status & Engine Card */}
          <div className="lg:col-span-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-2xs space-y-4 h-full flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Activity className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Live Engine Status
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(true)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title="Open Settings Drawer"
                  >
                    <Settings className="w-4 h-4" />
                  </button>
                </div>

                {/* Worker Pool Activity */}
                <div className="mt-4 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500 dark:text-slate-400 font-medium">Worker Allocation</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {state.activeWorkers} / {settings.workers} Active
                    </span>
                  </div>

                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className="bg-indigo-600 dark:bg-indigo-500 h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${Math.round((state.activeWorkers / Math.max(settings.workers, 1)) * 100)}%`
                      }}
                    />
                  </div>

                  {/* Active Modules Checklist */}
                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
                    <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block">
                      Active Modules
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-2xs">
                      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${
                        settings.enableSSL
                          ? 'bg-emerald-50/70 border-emerald-200/80 text-emerald-800 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-300'
                          : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800/40 dark:border-slate-800 dark:text-slate-500 opacity-60'
                      }`}>
                        <CheckCircle2 className="w-3 h-3" />
                        <span className="font-semibold">SSL Verification</span>
                      </div>

                      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${
                        settings.enableWebsite
                          ? 'bg-blue-50/70 border-blue-200/80 text-blue-800 dark:bg-blue-950/40 dark:border-blue-800 dark:text-blue-300'
                          : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800/40 dark:border-slate-800 dark:text-slate-500 opacity-60'
                      }`}>
                        <CheckCircle2 className="w-3 h-3" />
                        <span className="font-semibold">Website Check</span>
                      </div>

                      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${
                        settings.enableWhois
                          ? 'bg-purple-50/70 border-purple-200/80 text-purple-800 dark:bg-purple-950/40 dark:border-purple-800 dark:text-purple-300'
                          : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800/40 dark:border-slate-800 dark:text-slate-500 opacity-60'
                      }`}>
                        <CheckCircle2 className="w-3 h-3" />
                        <span className="font-semibold">WHOIS/RDAP</span>
                      </div>

                      <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border ${
                        settings.enableSpamhaus
                          ? 'bg-indigo-50/70 border-indigo-200/80 text-indigo-800 dark:bg-indigo-950/40 dark:border-indigo-800 dark:text-indigo-300'
                          : 'bg-slate-50 border-slate-200 text-slate-400 dark:bg-slate-800/40 dark:border-slate-800 dark:text-slate-500 opacity-60'
                      }`}>
                        <CheckCircle2 className="w-3 h-3" />
                        <span className="font-semibold">Spamhaus SIA</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Quick Control */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-2xs">
                <span className="text-slate-500 dark:text-slate-400 font-mono">
                  Timeout: {settings.timeoutSeconds}s · Retries: {settings.maxRetries}
                </span>
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(true)}
                  className="font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                >
                  Configure &rarr;
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Results Table with Search & Exports */}
        <ResultsTable
          items={state.items}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          onViewDetails={(item) => setSelectedDetailItem(item)}
          onRecheck={handleRecheckItem}
          onRetryAllIssues={handleRetryAllIssues}
          onRetrySpamhaus={handleRetrySpamhaus}
          onRecheckMissingDates={handleRecheckMissingDates}
          onDownloadCsv={handleDownloadCsv}
          onDownloadExcel={handleDownloadExcel}
          isChecking={isChecking}
        />
      </main>

      {/* Footer */}
      <footer className="bg-white dark:bg-slate-900 border-t border-slate-200/80 dark:border-slate-800 mt-auto py-4 text-center text-xs text-slate-500 dark:text-slate-400 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Domain Inspector — Advanced SSL, Availability, RDAP & Spamhaus Intel Engine</span>
          <span className="font-mono text-2xs text-slate-400 dark:text-slate-500">
            Strict Independent Pipeline · Original Index Order Preserved
          </span>
        </div>
      </footer>

      {/* Settings Slide-Over Drawer */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        settings={settings}
        onChange={setSettings}
        disabled={isChecking}
      />

      {/* Domain Details Modal */}
      <DetailModal
        item={selectedDetailItem}
        onClose={() => setSelectedDetailItem(null)}
        onRecheck={handleRecheckItem}
      />

      {/* Automated Verification Test Suite Modal */}
      <TestSuiteModal
        isOpen={isTestSuiteOpen}
        onClose={() => setIsTestSuiteOpen(false)}
      />

      {/* Toast Notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-5 right-5 z-50 space-y-2 max-w-sm w-full pointer-events-none">
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`p-3.5 rounded-xl shadow-lg border text-xs font-semibold flex items-center justify-between pointer-events-auto animate-in slide-in-from-bottom duration-200 ${
                t.type === 'success'
                  ? 'bg-emerald-900 text-emerald-100 border-emerald-700'
                  : t.type === 'error'
                  ? 'bg-rose-900 text-rose-100 border-rose-700'
                  : t.type === 'warn'
                  ? 'bg-amber-900 text-amber-100 border-amber-700'
                  : 'bg-slate-900 text-slate-100 border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                {t.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                {t.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />}
                {t.type === 'warn' && <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />}
                {t.type === 'info' && <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0" />}
                <span>{t.message}</span>
              </div>
              <button
                type="button"
                onClick={() => setToasts((prev) => prev.filter((item) => item.id !== t.id))}
                className="text-white/60 hover:text-white p-0.5 ml-2"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
