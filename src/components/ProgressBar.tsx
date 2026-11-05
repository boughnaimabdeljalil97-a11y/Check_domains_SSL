import React from 'react';
import { Cpu, CheckCircle2, Loader2, AlertCircle, Clock } from 'lucide-react';
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

  // Calculate rough ETA if running
  const remaining = Math.max(0, stats.total - stats.completed);
  const estimatedSeconds = activeWorkers > 0 ? Math.ceil((remaining / Math.max(settings.workers, 1)) * 2) : 0;
  const etaText = estimatedSeconds > 60 ? `~${Math.ceil(estimatedSeconds / 60)} min remaining` : `~${estimatedSeconds}s remaining`;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-2xs space-y-3 transition-colors">
      {/* Top metrics row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-900 dark:text-white text-sm">
            {isRunning ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400 animate-spin" />
                Scanning {stats.completed} of {stats.total}
              </span>
            ) : status === 'completed' ? (
              <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                Completed all {stats.total} domains
              </span>
            ) : status === 'paused' ? (
              <span className="text-amber-700 dark:text-amber-400">
                Paused at {stats.completed}/{stats.total}
              </span>
            ) : (
              <span>Progress: {stats.completed}/{stats.total}</span>
            )}
          </span>
          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="text-slate-700 dark:text-slate-300 font-mono font-bold tabular-nums">
            {stats.percentComplete}%
          </span>
          {isRunning && remaining > 0 && (
            <>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-2xs font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <Clock className="w-3 h-3 text-slate-400" />
                {etaText}
              </span>
            </>
          )}
        </div>

        <div className="flex items-center flex-wrap gap-2 text-slate-500 dark:text-slate-400 font-medium text-2xs">
          <span className="flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
            {settings.workers} Workers
          </span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span className="text-indigo-700 dark:text-indigo-400 font-semibold tabular-nums">
            {activeWorkers} in-flight
          </span>
          {stats.retryRequired > 0 && (
            <>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-amber-700 dark:text-amber-400 flex items-center gap-1 font-semibold tabular-nums">
                <AlertCircle className="w-3 h-3 text-amber-500" />
                {stats.retryRequired} retries
              </span>
            </>
          )}
        </div>
      </div>

      {/* Slim Animated Progress Track */}
      <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 overflow-hidden relative">
        <div
          className={`h-full transition-all duration-300 rounded-full ${
            status === 'completed'
              ? 'bg-emerald-500'
              : status === 'paused'
              ? 'bg-amber-500'
              : 'bg-indigo-600 dark:bg-indigo-500'
          }`}
          style={{ width: `${Math.min(stats.percentComplete, 100)}%` }}
        />
      </div>

      {/* In-flight worker badges */}
      {isRunning && activeWorkers > 0 && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-1.5">
          <span className="text-2xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1">
            Workers:
          </span>
          {Object.entries(currentWorkerAssignments).map(([wId, domain]) => (
            <span
              key={wId}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-50 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 text-2xs font-mono border border-slate-200/80 dark:border-slate-700 shadow-2xs"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="font-bold text-slate-400">W{wId}</span>
              <span className="font-medium text-slate-800 dark:text-slate-100 truncate max-w-[150px]">
                {domain}
              </span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
};
