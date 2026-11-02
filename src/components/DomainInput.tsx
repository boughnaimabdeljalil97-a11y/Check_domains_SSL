import React, { useMemo } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  Copy,
  Trash2,
  Sparkles,
  Info
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
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3.5">
        <div>
          <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
            Domain Input List
            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 tabular-nums">
              {validation.totalValid} Valid
            </span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            One domain per line. HTTP/HTTPS prefixes automatically handled. Original order preserved.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onLoadSample}
            disabled={isChecking}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>Load Sample Domains</span>
          </button>

          {value && (
            <button
              type="button"
              onClick={onClear}
              disabled={isChecking}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-slate-50 border border-slate-200 rounded-lg hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200 transition-colors disabled:opacity-50"
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
          placeholder={`Paste domains here, one domain per line.

Example:

jombre takula.com
carcrashkits.com
supporteasyjet.com
repro-tech.co.uk`}
          className="w-full px-3.5 py-2.5 text-xs sm:text-sm font-mono text-slate-900 bg-slate-50/50 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-colors resize-y placeholder:text-slate-400 disabled:bg-slate-100 disabled:text-slate-500"
        />
      </div>

      {/* Validation feedback bar */}
      <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center flex-wrap gap-3.5 text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-slate-900 tabular-nums">{lineCount}</span> lines entered
          </span>
          <span className="text-slate-300">|</span>
          <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span className="tabular-nums font-semibold">{validation.totalValid}</span> valid domains ready
          </span>

          {validation.totalDuplicates > 0 && (
            <>
              <span className="text-slate-300">|</span>
              <span className="text-amber-700">
                <span className="tabular-nums font-semibold">{validation.totalDuplicates}</span> duplicates ignored
              </span>
            </>
          )}

          {validation.totalInvalid > 0 && (
            <>
              <span className="text-slate-300">|</span>
              <span className="flex items-center gap-1 text-rose-600 font-medium">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="tabular-nums font-semibold">{validation.totalInvalid}</span> invalid lines rejected
              </span>
            </>
          )}
        </div>

        {validation.totalInvalid > 0 && (
          <div className="text-slate-500 text-2xs truncate max-w-md">
            Rejected: {validation.invalid.slice(0, 2).join(', ')}
            {validation.invalid.length > 2 ? ` (+${validation.invalid.length - 2} more)` : ''}
          </div>
        )}
      </div>
    </div>
  );
};
