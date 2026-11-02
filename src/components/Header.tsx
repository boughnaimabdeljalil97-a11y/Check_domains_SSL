import React from 'react';
import {
  ShieldCheck,
  Play,
  Pause,
  RotateCcw,
  Square,
  FlaskConical,
  Activity
} from 'lucide-react';
import type { InspectionState } from '../types';

interface HeaderProps {
  state: InspectionState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onOpenTestSuite: () => void;
  hasValidDomains: boolean;
}

export const Header: React.FC<HeaderProps> = ({
  state,
  onStart,
  onPause,
  onResume,
  onStop,
  onOpenTestSuite,
  hasValidDomains
}) => {
  const isRunning = state.status === 'running';
  const isPaused = state.status === 'paused';
  const isStopped = state.status === 'stopped';
  const isCompleted = state.status === 'completed';

  const getStatusBadge = () => {
    switch (state.status) {
      case 'running':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Checking in progress
          </span>
        );
      case 'paused':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-amber-50 text-amber-700 border border-amber-200">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            Paused
          </span>
        );
      case 'stopped':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-rose-50 text-rose-700 border border-rose-200">
            <span className="w-2 h-2 rounded-full bg-rose-500" />
            Stopped
          </span>
        );
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-blue-50 text-blue-700 border border-blue-200">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            Completed
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-md bg-slate-100 text-slate-700 border border-slate-200">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            Ready
          </span>
        );
    }
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        {/* Left: Brand & Status */}
        <div className="flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-lg bg-slate-900 text-white flex items-center justify-center shadow-xs shrink-0">
            <ShieldCheck className="w-6 h-6 text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">
                Domain Inspector
              </h1>
              {getStatusBadge()}
            </div>
            <p className="text-xs text-slate-500 font-medium">
              SSL, Website & WHOIS Monitoring
            </p>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center flex-wrap gap-2.5">
          <button
            type="button"
            onClick={onOpenTestSuite}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-2xs"
            title="Run verification tests against SSL, 404 detector, and order preservation"
          >
            <FlaskConical className="w-3.5 h-3.5 text-indigo-600" />
            <span>Verify Tests</span>
          </button>

          {isRunning && (
            <button
              type="button"
              onClick={onPause}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-amber-800 bg-amber-50 border border-amber-300 rounded-lg hover:bg-amber-100 transition-colors shadow-2xs"
            >
              <Pause className="w-3.5 h-3.5" />
              <span>Pause</span>
            </button>
          )}

          {isPaused && (
            <button
              type="button"
              onClick={onResume}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-300 rounded-lg hover:bg-emerald-100 transition-colors shadow-2xs"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Resume</span>
            </button>
          )}

          {(isRunning || isPaused) && (
            <button
              type="button"
              onClick={onStop}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-rose-800 bg-rose-50 border border-rose-300 rounded-lg hover:bg-rose-100 transition-colors shadow-2xs"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>Stop</span>
            </button>
          )}

          <button
            type="button"
            onClick={onStart}
            disabled={!hasValidDomains || isRunning}
            className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg transition-colors shadow-xs ${
              !hasValidDomains || isRunning
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-200'
                : 'bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-700'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>{isCompleted || isStopped ? 'Start New Check' : 'Start Checking'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};
