import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header } from './components/Header';
import { SummaryCards } from './components/SummaryCards';
import { DomainInput } from './components/DomainInput';
import { SettingsPanel } from './components/SettingsPanel';
import { ProgressBar } from './components/ProgressBar';
import { ResultsTable } from './components/ResultsTable';
import { DetailModal } from './components/DetailModal';
import { TestSuiteModal } from './components/TestSuiteModal';
import { downloadCsv, downloadExcel } from './utils/export';
import type {
  InspectionState,
  CheckerSettings,
  DomainItem,
  InspectionStats,
  ValidationSummary
} from './types';

const STORAGE_KEY = 'domainInspectorState';

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
  enableWhois: true
};

const DEFAULT_STATS: InspectionStats = {
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
  percentComplete: 0
};

const DEFAULT_STATE: InspectionState = {
  status: 'idle',
  items: [],
  settings: DEFAULT_SETTINGS,
  stats: DEFAULT_STATS,
  activeWorkers: 0,
  currentWorkerAssignments: {},
  startedAt: null,
  updatedAt: new Date().toISOString()
};

function calculateStats(items: DomainItem[]): InspectionStats {
  let completed = 0;
  let pending = 0;
  let inFlight = 0;
  let retryRequired = 0;
  let sslYes = 0;
  let sslNo = 0;
  let websiteYes = 0;
  let websiteNo = 0;
  let bothYes = 0;
  let whoisFound = 0;

  for (const item of items) {
    if (item.status === 'completed') completed++;
    else if (item.status === 'pending') pending++;
    else if (item.status === 'checking') inFlight++;
    else if (item.status === 'retry_required') retryRequired++;

    if (item.ssl.status === 'YES') sslYes++;
    else if (item.ssl.status === 'NO') sslNo++;

    if (item.website.status === 'YES') websiteYes++;
    else if (item.website.status === 'NO') websiteNo++;

    if (item.ssl.status === 'YES' && item.website.status === 'YES') {
      bothYes++;
    }

    if (item.whois.status === 'FOUND') {
      whoisFound++;
    }
  }

  const total = items.length;
  const percentComplete = total > 0 ? Math.round((completed / total) * 100) : 0;

  return {
    total,
    completed,
    pending,
    inFlight,
    retryRequired,
    sslYes,
    sslNo,
    websiteYes,
    websiteNo,
    bothYes,
    whoisFound,
    percentComplete
  };
}

function loadInitialState(): InspectionState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.items) && parsed.items.length > 0) {
        if (parsed.status === 'running') {
          parsed.status = 'stopped';
        }
        parsed.stats = calculateStats(parsed.items);
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Could not restore state from localStorage:', err);
  }
  return DEFAULT_STATE;
}

export default function App() {
  const [domainText, setDomainText] = useState(INITIAL_SAMPLE_DOMAINS);
  const [settings, setSettings] = useState<CheckerSettings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<InspectionState>(loadInitialState);
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [selectedDetailItem, setSelectedDetailItem] = useState<DomainItem | null>(null);
  const [isTestSuiteOpen, setIsTestSuiteOpen] = useState(false);
  const [validation, setValidation] = useState<ValidationSummary>({
    valid: [],
    invalid: [],
    duplicates: [],
    totalValid: 0,
    totalInvalid: 0,
    totalDuplicates: 0
  });

  const abortControllerRef = useRef<AbortController | null>(null);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn('Failed to save inspection state to localStorage', e);
    }
  }, [state]);

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

  // Handlers
  const handleStart = async () => {
    if (validation.valid.length === 0) return;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Build immediate optimistic placeholder items
    const initialItems: DomainItem[] = validation.valid.map((domain, index) => ({
      id: `item-${index + 1}-${domain}`,
      domain,
      cleanDomain: domain,
      originalIndex: index + 1,
      status: 'checking',
      currentStep: 'ssl',
      currentWorkerId: (index % (settings.workers || 4)) + 1,
      ssl: {
        status: settings.enableSSL ? 'CHECKING' : 'UNKNOWN',
        valid: false,
        reason: settings.enableSSL ? 'Queued' : 'SSL check disabled'
      },
      website: {
        status: settings.enableWebsite ? 'CHECKING' : 'UNKNOWN',
        available: false,
        reason: settings.enableWebsite ? 'Queued' : 'Website check disabled',
        statusCode: null,
        finalUrl: `https://${domain}`,
        title: '',
        redirects: [],
        loadTimeMs: 0
      },
      whois: {
        status: settings.enableWhois ? 'CHECKING' : 'SKIPPED',
        registeredOn: null,
        updatedOn: null,
        expiresOn: null,
        registrar: null,
        domainStatus: [],
        nameservers: [],
        rawSummary: null,
        source: settings.enableWhois ? 'none' : 'skipped'
      },
      retries: 0,
      maxRetries: settings.maxRetries,
      logs: [
        {
          step: 'system',
          timestamp: new Date().toISOString(),
          message: `Domain #${index + 1} queued for inspection`,
          type: 'info'
        }
      ]
    }));

    const runningState: InspectionState = {
      status: 'running',
      items: initialItems,
      settings,
      stats: calculateStats(initialItems),
      activeWorkers: Math.min(settings.workers || 4, initialItems.length),
      currentWorkerAssignments: {},
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    setState(runningState);

    try {
      const res = await fetch('/api/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domains: domainText,
          settings
        }),
        signal: controller.signal
      });

      if (res.ok) {
        const data = await res.json();
        if (data.state) {
          setState(data.state);
          // Sync selected modal item
          setSelectedDetailItem((prev) => {
            if (!prev) return null;
            return (
              data.state.items.find(
                (it: DomainItem) => it.id === prev.id || it.cleanDomain === prev.cleanDomain
              ) || prev
            );
          });
        }
      } else {
        setState((prev) => ({ ...prev, status: 'stopped' }));
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        console.log('Inspection stopped by user');
      } else {
        console.error('Failed to start inspection', err);
        setState((prev) => ({ ...prev, status: 'stopped' }));
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handlePause = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState((prev) => ({
      ...prev,
      status: 'paused',
      activeWorkers: 0,
      updatedAt: new Date().toISOString()
    }));
    fetch('/api/pause', { method: 'POST' }).catch(() => {});
  };

  const handleResume = async () => {
    handleStart();
  };

  const handleStop = async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setState((prev) => {
      const updated = prev.items.map((it) => {
        if (it.status === 'checking' || it.status === 'pending') {
          return {
            ...it,
            status: 'failed' as const,
            currentStep: 'done' as const
          };
        }
        return it;
      });
      return {
        ...prev,
        status: 'stopped',
        items: updated,
        activeWorkers: 0,
        stats: calculateStats(updated),
        updatedAt: new Date().toISOString()
      };
    });
    fetch('/api/stop', { method: 'POST' }).catch(() => {});
  };

  const handleRecheckItem = async (item: DomainItem) => {
    setState((prev) => {
      const updated = prev.items.map((it) =>
        it.id === item.id
          ? {
              ...it,
              status: 'checking' as const,
              currentStep: 'ssl' as const,
              retries: it.retries + 1,
              ssl: { ...it.ssl, status: 'CHECKING' as const },
              website: { ...it.website, status: 'CHECKING' as const },
              whois: { ...it.whois, status: 'CHECKING' as const }
            }
          : it
      );
      return { ...prev, items: updated, stats: calculateStats(updated) };
    });

    try {
      const res = await fetch('/api/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: [item.cleanDomain || item.domain], settings })
      });
      if (res.ok) {
        const data = await res.json();
        const freshItem: DomainItem | undefined = data.items?.[0] || data.state?.items?.[0];
        if (freshItem) {
          setState((prev) => {
            const updated = prev.items.map((it) =>
              it.id === item.id || it.cleanDomain === freshItem.cleanDomain
                ? { ...freshItem, id: it.id, originalIndex: it.originalIndex }
                : it
            );
            return { ...prev, items: updated, stats: calculateStats(updated) };
          });
          setSelectedDetailItem((prev) => {
            if (!prev || (prev.id !== item.id && prev.cleanDomain !== freshItem.cleanDomain)) {
              return prev;
            }
            return { ...freshItem, id: prev.id, originalIndex: prev.originalIndex };
          });
        }
      }
    } catch (err) {
      console.error('Failed to recheck item', err);
    }
  };

  const handleRetryAllIssues = async () => {
    const issues = state.items.filter(
      (it) =>
        it.ssl.status !== 'YES' ||
        it.website.status !== 'YES' ||
        it.status === 'failed' ||
        it.status === 'retry_required'
    );
    if (issues.length === 0) return;

    const issueDomains = issues.map((i) => i.cleanDomain || i.domain);

    setState((prev) => {
      const updated = prev.items.map((it) => {
        const isIssue =
          it.ssl.status !== 'YES' ||
          it.website.status !== 'YES' ||
          it.status === 'failed' ||
          it.status === 'retry_required';
        if (!isIssue) return it;
        return {
          ...it,
          status: 'checking' as const,
          retries: it.retries + 1,
          ssl: { ...it.ssl, status: 'CHECKING' as const },
          website: { ...it.website, status: 'CHECKING' as const }
        };
      });
      return { ...prev, items: updated, stats: calculateStats(updated) };
    });

    try {
      const res = await fetch('/api/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: issueDomains, settings })
      });
      if (res.ok) {
        const data = await res.json();
        const newItems: DomainItem[] = data.items || data.state?.items || [];
        const itemMap = new Map(newItems.map((n) => [n.cleanDomain, n]));

        setState((prev) => {
          const merged = prev.items.map((it) => {
            const fresh = itemMap.get(it.cleanDomain);
            if (fresh) {
              return { ...fresh, id: it.id, originalIndex: it.originalIndex };
            }
            return it;
          });
          return { ...prev, items: merged, stats: calculateStats(merged) };
        });
      }
    } catch (err) {
      console.error('Failed to retry all issues', err);
    }
  };

  const handleRecheckMissingDates = async () => {
    const missing = state.items.filter(
      (it) => it.status === 'completed' && (!it.whois.registeredOn || it.whois.status !== 'FOUND')
    );
    if (missing.length === 0) return;

    const missingDomains = missing.map((m) => m.cleanDomain || m.domain);

    setState((prev) => {
      const updated = prev.items.map((it) => {
        if (it.status === 'completed' && (!it.whois.registeredOn || it.whois.status !== 'FOUND')) {
          return {
            ...it,
            whois: { ...it.whois, status: 'CHECKING' as const }
          };
        }
        return it;
      });
      return { ...prev, items: updated, stats: calculateStats(updated) };
    });

    try {
      const res = await fetch('/api/recheck-missing-whois', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domains: missingDomains, settings })
      });
      if (res.ok) {
        const data = await res.json();
        const results: Array<{ domain: string; whois: any }> = data.results || [];
        const resultMap = new Map(results.map((r) => [r.domain, r.whois]));

        setState((prev) => {
          const merged = prev.items.map((it) => {
            const whois = resultMap.get(it.cleanDomain);
            if (whois) {
              return {
                ...it,
                whois,
                logs: [
                  ...it.logs,
                  {
                    step: 'whois' as const,
                    timestamp: new Date().toISOString(),
                    message: `Re-checked registration: ${whois.status} (${whois.registrar || 'N/A'} | ${whois.registeredOn || 'Unavailable'})`,
                    type: whois.status === 'FOUND' && whois.registeredOn ? ('success' as const) : ('warn' as const)
                  }
                ]
              };
            }
            return it;
          });
          return { ...prev, items: merged, stats: calculateStats(merged) };
        });

        setSelectedDetailItem((prev) => {
          if (!prev) return null;
          const whois = resultMap.get(prev.cleanDomain);
          if (whois) {
            return { ...prev, whois };
          }
          return prev;
        });
      }
    } catch (err) {
      console.error('Failed to recheck missing dates', err);
    }
  };

  const handleDownloadCsv = () => {
    downloadCsv(state.items);
  };

  const handleDownloadExcel = () => {
    downloadExcel(state.items);
  };

  const handleClearDomains = () => {
    setDomainText('');
  };

  const isChecking = state.status === 'running';

  return (
    <div className="min-h-screen bg-slate-50/60 text-slate-900 flex flex-col font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* 1. Header */}
      <Header
        state={state}
        onStart={handleStart}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
        onOpenTestSuite={() => setIsTestSuiteOpen(true)}
        hasValidDomains={validation.totalValid > 0}
      />

      {/* Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* 2. Top Metric Cards */}
        <SummaryCards
          stats={state.stats}
          activeFilter={activeFilter}
          onSelectFilter={(f) => setActiveFilter(f)}
        />

        {/* 3. Progress Track (visible when checks have started) */}
        <ProgressBar state={state} />

        {/* 4. Input & Settings Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Domain Input Textarea */}
          <div className="lg:col-span-7">
            <DomainInput
              value={domainText}
              onChange={setDomainText}
              validation={validation}
              isChecking={isChecking}
              onClear={handleClearDomains}
              onLoadSample={() => setDomainText(INITIAL_SAMPLE_DOMAINS)}
            />
          </div>

          {/* Engine Settings Panel */}
          <div className="lg:col-span-5">
            <SettingsPanel
              settings={settings}
              onChange={setSettings}
              disabled={isChecking}
            />
          </div>
        </div>

        {/* 5. Results Table with Search & Exports */}
        <ResultsTable
          items={state.items}
          activeFilter={activeFilter}
          onFilterChange={setActiveFilter}
          onViewDetails={(item) => setSelectedDetailItem(item)}
          onRecheck={handleRecheckItem}
          onRetryAllIssues={handleRetryAllIssues}
          onRecheckMissingDates={handleRecheckMissingDates}
          onDownloadCsv={handleDownloadCsv}
          onDownloadExcel={handleDownloadExcel}
          isChecking={isChecking}
        />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 mt-auto py-4 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>Domain Inspector — Advanced SSL, Website & WHOIS Verification Engine</span>
          <span className="font-mono text-2xs text-slate-400">Strict Independent Evaluation & Original Index Preservation</span>
        </div>
      </footer>

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
    </div>
  );
}
