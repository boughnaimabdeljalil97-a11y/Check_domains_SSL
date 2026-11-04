import React, { useState, useEffect, useCallback, useMemo } from 'react';
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
  enableWhois: true
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
    percentComplete: 0
  },
  activeWorkers: 0,
  currentWorkerAssignments: {},
  startedAt: null,
  updatedAt: new Date().toISOString()
};

export default function App() {
  const [domainText, setDomainText] = useState(INITIAL_SAMPLE_DOMAINS);
  const [settings, setSettings] = useState<CheckerSettings>(DEFAULT_SETTINGS);
  const [state, setState] = useState<InspectionState>(DEFAULT_STATE);
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
  }, []);

  // Handlers
  const handleStart = async () => {
    if (validation.valid.length === 0) return;
    try {
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
    }
  };

  const handlePause = async () => {
    try {
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
      const res = await fetch('/api/recheck-missing-whois', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        setState(data.state);
      }
    } catch (err) {
      console.error('Failed to recheck missing dates', err);
    }
  };

  const handleDownloadCsv = () => {
    window.location.href = '/api/export/csv';
  };

  const handleDownloadExcel = () => {
    window.location.href = '/api/export/xlsx';
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
              onClear={() => setDomainText('')}
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
