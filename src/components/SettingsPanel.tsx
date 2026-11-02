import React from 'react';
import {
  SlidersHorizontal,
  Cpu,
  Clock,
  RotateCw,
  Lock,
  Globe,
  FileText
} from 'lucide-react';
import type { CheckerSettings } from '../types';

interface SettingsPanelProps {
  settings: CheckerSettings;
  onChange: (newSettings: CheckerSettings) => void;
  disabled: boolean;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  settings,
  onChange,
  disabled
}) => {
  const workerOptions = [1, 2, 3, 4, 5, 8];
  const timeoutOptions = [
    { label: '15s', value: 15 },
    { label: '30s (Default)', value: 30 },
    { label: '45s', value: 45 }
  ];
  const retryOptions = [0, 1, 2, 3];

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
      <div className="flex items-center gap-2 mb-4">
        <SlidersHorizontal className="w-4 h-4 text-slate-700" />
        <h3 className="text-sm font-bold text-slate-900 tracking-tight">
          Checking Engine Settings
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Workers configuration */}
        <div>
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-2">
            <Cpu className="w-3.5 h-3.5 text-slate-500" />
            <span>Parallel Workers</span>
          </label>
          <div className="flex items-center gap-1.5">
            {workerOptions.map((w) => (
              <button
                key={w}
                type="button"
                disabled={disabled}
                onClick={() => onChange({ ...settings, workers: w })}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                  settings.workers === w
                    ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 disabled:opacity-50'
                }`}
              >
                {w}
              </button>
            ))}
          </div>
          <p className="text-2xs text-slate-500 mt-1.5">
            Default 4 workers. Each worker runs SSL → Website → WHOIS sequentially.
          </p>
        </div>

        {/* Timeout & Retries */}
        <div>
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-2">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Navigation Timeout</span>
          </label>
          <select
            disabled={disabled}
            value={settings.timeoutSeconds}
            onChange={(e) =>
              onChange({ ...settings, timeoutSeconds: parseInt(e.target.value, 10) })
            }
            className="w-full px-3 py-1.5 text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 disabled:opacity-50"
          >
            {timeoutOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>

          <div className="mt-2.5 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-700 flex items-center gap-1">
              <RotateCw className="w-3 h-3 text-slate-500" /> Auto-Retries:
            </span>
            <div className="flex items-center gap-1">
              {retryOptions.map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange({ ...settings, maxRetries: r })}
                  className={`w-6 h-6 text-xs font-semibold rounded border transition-colors ${
                    settings.maxRetries === r
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 disabled:opacity-50'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Inspection Toggles */}
        <div>
          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 mb-2">
            <span>Active Modules</span>
          </label>
          <div className="space-y-2">
            <label className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70">
              <span className="flex items-center gap-1.5 text-slate-800 font-medium">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                SSL / TLS Verification
              </span>
              <input
                type="checkbox"
                disabled={disabled}
                checked={settings.enableSSL}
                onChange={(e) =>
                  onChange({ ...settings, enableSSL: e.target.checked })
                }
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
            </label>

            <label className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70">
              <span className="flex items-center gap-1.5 text-slate-800 font-medium">
                <Globe className="w-3.5 h-3.5 text-blue-600" />
                Website Availability
              </span>
              <input
                type="checkbox"
                disabled={disabled}
                checked={settings.enableWebsite}
                onChange={(e) =>
                  onChange({ ...settings, enableWebsite: e.target.checked })
                }
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
            </label>

            <label className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100/70">
              <span className="flex items-center gap-1.5 text-slate-800 font-medium">
                <FileText className="w-3.5 h-3.5 text-indigo-600" />
                WHOIS / RDAP Lookup
              </span>
              <input
                type="checkbox"
                disabled={disabled}
                checked={settings.enableWhois}
                onChange={(e) =>
                  onChange({ ...settings, enableWhois: e.target.checked })
                }
                className="w-4 h-4 text-emerald-600 rounded border-slate-300 focus:ring-emerald-500"
              />
            </label>

            {settings.enableWhois && (
              <div className="pt-1 flex items-center justify-between text-2xs text-slate-600">
                <span className="font-semibold text-slate-700">Pacing Delay:</span>
                <select
                  disabled={disabled}
                  value={settings.whoisPacedDelayMs || 800}
                  onChange={(e) =>
                    onChange({ ...settings, whoisPacedDelayMs: parseInt(e.target.value, 10) })
                  }
                  className="px-2 py-1 text-2xs bg-white border border-slate-200 rounded font-medium focus:ring-1 focus:ring-emerald-500"
                >
                  <option value={400}>400ms (Fast)</option>
                  <option value={800}>800ms (Recommended)</option>
                  <option value={1500}>1500ms (Slow & Safe)</option>
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
