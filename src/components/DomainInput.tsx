import React, { useMemo } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Trash2,
  Sparkles
} from 'lucide-react';
import type { ValidationSummary } from '../types';

interface DomainInputProps {
  value: string;
  onChange: (val: string) => void;
  validation: ValidationSummary;
  isChecking: boolean;
  onClear: () => void;
  onLoadSample: () => void;
}

export const DomainInput: React.FC<DomainInputProps> = ({
  value,
  onChange,
  validation,
  isChecking,
  onClear,
  onLoadSample
}) => {
  const lineCount = useMemo(() => {
    if (!value.trim()) return 0;
    return value.split(/\r?\n/).filter((l) => l.trim().length > 0).length;
  }, [value]);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-2xs transition-colors space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              Domain Targets
            </h2>
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 tabular-nums">
              {validation.totalValid} Valid
            </span>
          </div>
          <p className="text-2xs text-slate-500 dark:text-slate-400 mt-0.5">
            One domain per line. Protocols & paths stripped automatically. Original order preserved.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onLoadSample}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 shadow-2xs"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Load Sample</span>
          </button>

          {value && (
            <button
              type="button"
              onClick={onClear}
              disabled={isChecking}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900/60 rounded-xl hover:bg-rose-100 dark:hover:bg-rose-900/60 transition-colors disabled:opacity-50 shadow-2xs"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear</span>
            </button>
          )}
        </div>
      </div>

      <div className="relative">
        <textarea
          rows={6}
          disabled={isChecking}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={`Enter domains to inspect (one per line):

example.com
google.com
github.com
cloudflare.com`}
          className="w-full px-4 py-3 text-xs sm:text-sm font-mono text-slate-900 dark:text-slate-100 bg-slate-50/70 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:focus:border-indigo-500 transition-colors resize-y placeholder:text-slate-400 dark:placeholder:text-slate-600 disabled:opacity-60"
        />
      </div>

      {/* Validation feedback bar */}
      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2.5 text-2xs text-slate-600 dark:text-slate-400">
        <div className="flex items-center flex-wrap gap-3">
          <span className="flex items-center gap-1">
            <span className="font-bold text-slate-900 dark:text-white tabular-nums">{lineCount}</span> lines
          </span>
          <span className="text-slate-300 dark:text-slate-700">·</span>
          <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-semibold">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            <span className="tabular-nums">{validation.totalValid}</span> valid targets ready
          </span>

          {validation.totalDuplicates > 0 && (
            <>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="text-amber-700 dark:text-amber-400 font-medium">
                <span className="tabular-nums font-bold">{validation.totalDuplicates}</span> duplicates removed
              </span>
            </>
          )}

          {validation.totalInvalid > 0 && (
            <>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="flex items-center gap-1 text-rose-600 dark:text-rose-400 font-semibold">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="tabular-nums">{validation.totalInvalid}</span> invalid lines skipped
              </span>
            </>
          )}
        </div>

        {validation.totalInvalid > 0 && (
          <div className="text-slate-400 dark:text-slate-500 text-3xs truncate max-w-xs">
            Skipped: {validation.invalid.slice(0, 2).join(', ')}
            {validation.invalid.length > 2 ? ` (+${validation.invalid.length - 2} more)` : ''}
          </div>
        )}
      </div>
    </div>
  );
};
