import React, { useState } from 'react';
import {
  X,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Loader2,
  Play,
  Clock,
  ShieldCheck,
  Globe,
  Layers,
  ArrowRight
} from 'lucide-react';

interface TestSuiteResult {
  total: number;
  passed: number;
  failed: number;
  results: Array<{
    name: string;
    category: 'SSL' | 'Website' | 'Execution' | 'Export';
    status: 'passed' | 'failed';
    details: string;
    durationMs: number;
  }>;
}

interface TestSuiteModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TestSuiteModal: React.FC<TestSuiteModalProps> = ({ isOpen, onClose }) => {
  const [isRunning, setIsRunning] = useState(false);
  const [testOutput, setTestOutput] = useState<TestSuiteResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const runTests = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const res = await fetch('/api/test-suite/run', { method: 'POST' });
      if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
      const data = await res.json();
      setTestOutput(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to run test suite');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
              <FlaskConical className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Automated Verification Test Suite
              </h3>
              <p className="text-2xs text-slate-500 mt-0.5">
                Evaluates Section 15 testing specifications against the live backend
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Action bar */}
        <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between gap-3">
          <div className="text-xs text-slate-600">
            {testOutput ? (
              <span className="font-medium">
                Results: <strong className="text-emerald-700">{testOutput.passed} passed</strong>
                {testOutput.failed > 0 && <span className="text-rose-700 ml-1">, {testOutput.failed} failed</span>}
                <span className="text-slate-400 ml-1">of {testOutput.total} tests</span>
              </span>
            ) : (
              <span>Run the automated tests to verify SSL, Website 404/Namecheap exclusions, and order preservation.</span>
            )}
          </div>

          <button
            type="button"
            onClick={runTests}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-2xs"
          >
            {isRunning ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Running Tests...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Run Tests Now</span>
              </>
            )}
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto flex-1 space-y-3 text-xs">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800">
              {error}
            </div>
          )}

          {!testOutput && !isRunning && (
            <div className="text-center py-12 text-slate-400 space-y-2">
              <FlaskConical className="w-8 h-8 mx-auto text-slate-300" />
              <p className="text-sm font-medium text-slate-600">No tests executed yet</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Click "Run Tests Now" to execute synthetic and live network checks validating all requirements.
              </p>
            </div>
          )}

          {isRunning && !testOutput && (
            <div className="text-center py-12 text-slate-500 space-y-2">
              <Loader2 className="w-8 h-8 mx-auto text-indigo-600 animate-spin" />
              <p className="font-semibold text-slate-800">Executing verification tests...</p>
              <p className="text-xs text-slate-400">Testing TLS handshakes, exclusion rules, and order sorting</p>
            </div>
          )}

          {testOutput && (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
              {testOutput.results.map((r, i) => (
                <div key={i} className="p-3.5 hover:bg-slate-50/70 transition-colors flex items-start gap-3">
                  {r.status === 'passed' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{r.name}</span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-3xs uppercase font-mono font-bold px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                          {r.category}
                        </span>
                        <span className="text-2xs font-mono tabular-nums text-slate-400">
                          {r.durationMs}ms
                        </span>
                      </div>
                    </div>
                    <p className="text-2xs text-slate-600 mt-1">{r.details}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/70 flex justify-end">
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
