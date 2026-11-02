import React from 'react';
import { Cpu, CheckCircle2, Loader2, AlertCircle } from 'lucide-react';
import type { InspectionState } from '../types';

interface ProgressBarProps {
  state: InspectionState;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({ state }) => {
  const { stats, settings, activeWorkers, currentWorkerAssignments, status } = state;
  const isRunning = status === 'running';

  if (stats.total === 0 && status === 'idle') {
    return null;
  }

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
      {/* Top metrics row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-900 text-sm">
            {isRunning ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
                Checking {stats.completed}/{stats.total}
              </span>
            ) : status === 'completed' ? (
              <span className="flex items-center gap-1.5 text-emerald-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Completed all {stats.total} domains
              </span>
            ) : status === 'paused' ? (
              <span className="text-amber-700">
                Paused at {stats.completed}/{stats.total}
              </span>
            ) : (
              <span>Progress: {stats.completed}/{stats.total}</span>
            )}
          </span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-600 font-medium tabular-nums">
            {stats.percentComplete}%
          </span>
        </div>

        <div className="flex items-center gap-2 text-slate-500 font-medium">
          <span className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-slate-600" />
            Running {settings.workers} parallel workers
          </span>
          <span className="text-slate-300">·</span>
          <span className="text-emerald-700 font-semibold tabular-nums">
            {activeWorkers} currently in-flight
          </span>
          {stats.retryRequired > 0 && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-amber-700 flex items-center gap-1 font-semibold tabular-nums">
                <AlertCircle className="w-3 h-3 text-amber-500" />
                {stats.retryRequired} retry-required
              </span>
            </>
          )}
        </div>
      </div>

      {/* Progress Track */}
      <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${
            status === 'completed'
              ? 'bg-emerald-600'
              : status === 'paused'
              ? 'bg-amber-500'
              : 'bg-emerald-500'
          }`}
          style={{ width: `${Math.min(stats.percentComplete, 100)}%` }}
        />
      </div>

      {/* In-flight worker badges */}
      {isRunning && activeWorkers > 0 && (
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-2xs font-semibold text-slate-400 uppercase tracking-wider">
            In-Flight Workers:
          </span>
          {Object.entries(currentWorkerAssignments).map(([wId, domain]) => (
            <span
              key={wId}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 text-xs font-mono border border-slate-200"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-semibold text-slate-500">W{wId}:</span>
              <span className="font-medium text-slate-900">{domain}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
