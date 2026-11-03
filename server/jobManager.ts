import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import type {
  DomainItem,
  InspectionState,
  InspectionStats,
  CheckerSettings,
  DomainLog,
  WhoisResult
} from './types.js';
import { checkDomainSSL } from './sslChecker.js';
import { checkDomainWebsite } from './websiteChecker.js';
import { checkDomainWhois } from './whoisChecker.js';

export const DEFAULT_SETTINGS: CheckerSettings = {
  workers: 4,
  timeoutSeconds: 30,
  maxRetries: 2,
  enableSSL: true,
  enableWebsite: true,
  enableWhois: true,
  whoisPacedDelayMs: 800
};

export const DEFAULT_STATE: InspectionState = {
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

export function calculateStats(items: DomainItem[]): InspectionStats {
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

export function normalizeDomain(raw: string): string | null {
  if (!raw) return null;
  let s = raw.trim();

  s = s.replace(/^["']|["']$/g, '').trim();
  s = s.replace(/^(?:https?:\/\/)/i, '');
  s = s.split('/')[0].split('?')[0].split('#')[0];
  s = s.split(':')[0];
  s = s.toLowerCase().trim();

  if (!s || s.includes(' ') || s.includes('@')) {
    return null;
  }

  const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
  if (!domainRegex.test(s)) {
    return null;
  }

  return s;
}

export function parseInputDomains(input: string[] | string): string[] {
  let lines: string[] = [];
  if (Array.isArray(input)) {
    lines = input;
  } else if (typeof input === 'string') {
    lines = input.split(/\r?\n/);
  }

  const seen = new Set<string>();
  const validDomains: string[] = [];

  for (const raw of lines) {
    const clean = normalizeDomain(raw);
    if (clean && !seen.has(clean)) {
      seen.add(clean);
      validDomains.push(clean);
    }
  }

  return validDomains;
}

export function addLog(
  item: DomainItem,
  step: DomainLog['step'],
  message: string,
  type: DomainLog['type']
) {
  item.logs.push({
    step,
    timestamp: new Date().toISOString(),
    message,
    type
  });
}

/**
 * STRICT 7-STEP SEQUENTIAL PIPELINE PER DOMAIN
 * STEP 1 -> SSL CHECK
 * STEP 2 -> SAVE SSL RESULT
 * STEP 3 -> WEBSITE CHECK
 * STEP 4 -> SAVE WEBSITE RESULT
 * STEP 5 -> WHOIS/RDAP LOOKUP
 * STEP 6 -> SAVE REGISTRATION INFORMATION
 * STEP 7 -> MARK DOMAIN AS COMPLETED
 */
export async function processDomainSequential(
  item: DomainItem,
  workerId: number,
  settings: CheckerSettings
): Promise<DomainItem> {
  const timeoutMs = (settings.timeoutSeconds || 30) * 1000;
  item.status = 'checking';
  item.currentWorkerId = workerId;
  item.startedAt = item.startedAt || new Date().toISOString();

  // STEP 1 & 2: SSL CHECK & SAVE
  if (settings.enableSSL) {
    item.currentStep = 'ssl';
    addLog(item, 'ssl', `Worker #${workerId}: Starting TLS certificate check on port 443...`, 'info');

    try {
      const sslRes = await checkDomainSSL(item.cleanDomain, {
        timeoutMs: Math.min(timeoutMs, 15000)
      });
      item.ssl = sslRes;

      const logType = sslRes.status === 'YES' ? 'success' : 'warn';
      addLog(
        item,
        'ssl',
        `Worker #${workerId}: SSL Check completed: ${sslRes.status} (${sslRes.reason})`,
        logType
      );
    } catch (sslErr: any) {
      item.ssl = {
        status: 'NO',
        valid: false,
        reason: `SSL check exception: ${sslErr.message}`,
        checkedAt: new Date().toISOString()
      };
      addLog(item, 'ssl', `Worker #${workerId}: SSL Check error: ${sslErr.message}`, 'error');
    }
  }

  // STEP 3 & 4: WEBSITE CHECK & SAVE
  if (settings.enableWebsite) {
    item.currentStep = 'website';
    addLog(item, 'website', `Worker #${workerId}: Starting Website availability inspection...`, 'info');

    try {
      const webRes = await checkDomainWebsite(item.cleanDomain, { timeoutMs });
      item.website = webRes;

      const logType =
        webRes.status === 'YES' ? 'success' : webRes.status === 'UNKNOWN' ? 'warn' : 'error';
      addLog(
        item,
        'website',
        `Worker #${workerId}: Website Check completed: ${webRes.status} (${webRes.reason})`,
        logType
      );
    } catch (webErr: any) {
      item.website = {
        status: 'UNKNOWN',
        available: false,
        reason: `Website check exception: ${webErr.message}`,
        statusCode: null,
        finalUrl: `http://${item.cleanDomain}`,
        title: '',
        redirects: [],
        loadTimeMs: 0,
        detectedExclusionType: 'other',
        checkedAt: new Date().toISOString()
      };
      addLog(item, 'website', `Worker #${workerId}: Website Check error: ${webErr.message}`, 'error');
    }
  }

  // STEP 5 & 6: WHOIS / RDAP LOOKUP & SAVE
  if (settings.enableWhois) {
    item.currentStep = 'whois';
    addLog(item, 'whois', `Worker #${workerId}: Querying RDAP registration data...`, 'info');

    try {
      const whoisRes = await checkDomainWhois(item.cleanDomain, {
        timeoutMs: 14000,
        pacedDelayMs: settings.whoisPacedDelayMs || 800,
        maxAttempts: 3,
        onRetry: (attempt, msg) => {
          addLog(item, 'whois', `Worker #${workerId} (Attempt ${attempt}): ${msg}`, 'info');
        }
      });
      item.whois = whoisRes;

      const logType =
        whoisRes.status === 'FOUND' && whoisRes.registeredOn ? 'success' : 'info';
      addLog(
        item,
        'whois',
        `Worker #${workerId}: Registration info: ${whoisRes.status} (${whoisRes.registrar || 'No registrar'} | ${whoisRes.registeredOn || 'Unavailable'})`,
        logType
      );
    } catch (whoisErr: any) {
      item.whois = {
        status: 'NOT_FOUND',
        registeredOn: null,
        updatedOn: null,
        expiresOn: null,
        registrar: null,
        domainStatus: [],
        nameservers: [],
        rawSummary: `WHOIS lookup error: ${whoisErr.message}`,
        source: 'none',
        checkedAt: new Date().toISOString()
      };
      addLog(item, 'whois', `Worker #${workerId}: Registration check error: ${whoisErr.message}`, 'warn');
    }
  }

  // STEP 7: MARK DOMAIN AS COMPLETED OR RETRY REQUIRED
  item.currentStep = 'done';
  item.completedAt = new Date().toISOString();
  item.currentWorkerId = null;

  if (item.website.status === 'UNKNOWN' && item.retries < item.maxRetries) {
    item.status = 'retry_required';
    addLog(item, 'system', `Domain marked as Retry Required (${item.website.reason})`, 'warn');
  } else {
    item.status = 'completed';
    addLog(item, 'system', `All inspection steps completed successfully`, 'success');
  }

  return item;
}

/**
 * Creates empty/queued DomainItems for a list of normalized domains
 */
export function createDomainItems(
  domains: string[],
  settings: CheckerSettings,
  startIndex: number = 1
): DomainItem[] {
  return domains.map((domain, idx) => ({
    id: crypto.randomUUID(),
    domain,
    cleanDomain: domain,
    originalIndex: startIndex + idx,
    status: 'pending',
    currentStep: 'idle',
    currentWorkerId: null,
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
        message: `Domain #${startIndex + idx} queued for inspection`,
        type: 'info'
      }
    ]
  }));
}

/**
 * Fully stateless inspection engine:
 * Runs worker pool with up to `settings.workers` concurrent inspections.
 * Returns complete InspectionState directly in response.
 */
export async function inspectDomains(
  domainsInput: string[] | string,
  customSettings?: Partial<CheckerSettings>
): Promise<InspectionState> {
  const settings: CheckerSettings = {
    ...DEFAULT_SETTINGS,
    ...customSettings
  };

  const normalized = parseInputDomains(domainsInput);
  const items = createDomainItems(normalized, settings);

  if (items.length === 0) {
    return {
      status: 'completed',
      items: [],
      settings,
      stats: calculateStats([]),
      activeWorkers: 0,
      currentWorkerAssignments: {},
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }

  const workerCount = Math.min(Math.max(settings.workers || 4, 1), 8);
  let nextQueueIndex = 0;

  // Run worker pool
  async function runWorker(workerId: number) {
    while (nextQueueIndex < items.length) {
      const idx = nextQueueIndex++;
      const item = items[idx];
      try {
        await processDomainSequential(item, workerId, settings);
      } catch (err: any) {
        item.status = 'failed';
        item.currentStep = 'done';
        addLog(item, 'system', `Worker #${workerId} failure: ${err.message}`, 'error');
      }
    }
  }

  const activeWorkerPromises: Promise<void>[] = [];
  for (let w = 1; w <= Math.min(workerCount, items.length); w++) {
    activeWorkerPromises.push(runWorker(w));
  }

  await Promise.all(activeWorkerPromises);

  return {
    status: 'completed',
    items,
    settings,
    stats: calculateStats(items),
    activeWorkers: 0,
    currentWorkerAssignments: {},
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

/**
 * Re-runs WHOIS lookup only for specified domains
 */
export async function recheckWhoisOnly(
  domains: string[],
  settings?: Partial<CheckerSettings>
): Promise<Array<{ domain: string; whois: WhoisResult }>> {
  const whoisPacedDelayMs = settings?.whoisPacedDelayMs || 800;
  const results: Array<{ domain: string; whois: WhoisResult }> = [];

  for (const raw of domains) {
    const clean = normalizeDomain(raw);
    if (!clean) continue;

    try {
      const whois = await checkDomainWhois(clean, {
        timeoutMs: 14000,
        pacedDelayMs: whoisPacedDelayMs,
        maxAttempts: 3
      });
      results.push({ domain: clean, whois });
    } catch (err: any) {
      results.push({
        domain: clean,
        whois: {
          status: 'NOT_FOUND',
          registeredOn: null,
          updatedOn: null,
          expiresOn: null,
          registrar: null,
          domainStatus: [],
          nameservers: [],
          rawSummary: `WHOIS check failed: ${err.message}`,
          source: 'none',
          checkedAt: new Date().toISOString()
        }
      });
    }
  }

  return results;
}

/**
 * CRITICAL REQUIREMENT: PRESERVE ORIGINAL INPUT ORDER
 * Sorts strictly by originalIndex before export!
 */
export function generateExportData(items: DomainItem[]): Array<Record<string, any>> {
  const sorted = [...items].sort((a, b) => a.originalIndex - b.originalIndex);

  return sorted.map((item) => ({
    '#': item.originalIndex,
    'Domain': item.domain,
    'Registered On': item.whois.registeredOn || 'N/A',
    'Updated On': item.whois.updatedOn || 'N/A',
    'Expires On': item.whois.expiresOn || 'N/A',
    'Registrar': item.whois.registrar || 'N/A',
    'SSL': item.ssl.status,
    'SSL Reason': item.ssl.reason,
    'SSL Issuer': item.ssl.issuer || 'N/A',
    'SSL Expiry': item.ssl.validTo || 'N/A',
    'Days Until Expiry': item.ssl.daysRemaining !== undefined ? item.ssl.daysRemaining : 'N/A',
    'Website': item.website.status,
    'Website Reason': item.website.reason,
    'Final URL': item.website.finalUrl || `https://${item.domain}`,
    'HTTP Status': item.website.statusCode ?? 'N/A',
    'Load Time (ms)': item.website.loadTimeMs || 0,
    'Completed At': item.completedAt || 'In progress'
  }));
}

export function exportToCsv(items: DomainItem[]): string {
  const data = generateExportData(items);
  if (data.length === 0) {
    return '#,Domain,Registered On,Updated On,Expires On,Registrar,SSL,SSL Reason,SSL Issuer,SSL Expiry,Days Until Expiry,Website,Website Reason,Final URL,HTTP Status,Load Time (ms),Completed At\n';
  }

  const headers = Object.keys(data[0]);
  const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headerLine = headers.map(escapeCsv).join(',');
  const rows = data.map((row) => headers.map((h) => escapeCsv(row[h])).join(','));

  return [headerLine, ...rows].join('\r\n');
}

export function exportToExcel(items: DomainItem[]): Buffer {
  const data = generateExportData(items);
  const worksheet = XLSX.utils.json_to_sheet(data);

  const colWidths = [
    { wch: 4 },  // #
    { wch: 25 }, // Domain
    { wch: 14 }, // Registered On
    { wch: 14 }, // Updated On
    { wch: 14 }, // Expires On
    { wch: 22 }, // Registrar
    { wch: 10 }, // SSL
    { wch: 36 }, // SSL Reason
    { wch: 26 }, // SSL Issuer
    { wch: 14 }, // SSL Expiry
    { wch: 18 }, // Days Until Expiry
    { wch: 10 }, // Website
    { wch: 38 }, // Website Reason
    { wch: 30 }, // Final URL
    { wch: 12 }, // HTTP Status
    { wch: 14 }, // Load Time (ms)
    { wch: 22 }  // Completed At
  ];
  worksheet['!cols'] = colWidths;

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Domain Inspection');

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
}

// Stateful/in-memory adapter for local dev server and test-suite compatibility
let localMemoryState: InspectionState = JSON.parse(JSON.stringify(DEFAULT_STATE));

export class JobManager {
  private currentState: InspectionState = JSON.parse(JSON.stringify(DEFAULT_STATE));

  public normalizeDomain(raw: string) {
    return normalizeDomain(raw);
  }

  public parseInputDomains(input: string[] | string) {
    return parseInputDomains(input);
  }

  public async getFullState(): Promise<InspectionState> {
    return this.currentState;
  }

  public getFullStateSync(): InspectionState {
    return this.currentState;
  }

  public async startJob(
    domains: string[] | string,
    settings?: Partial<CheckerSettings>
  ): Promise<InspectionState> {
    this.currentState = await inspectDomains(domains, settings);
    localMemoryState = this.currentState;
    return this.currentState;
  }

  public async tickOrStatus(): Promise<InspectionState> {
    return this.currentState;
  }

  public async pauseJob(): Promise<InspectionState> {
    this.currentState.status = 'paused';
    return this.currentState;
  }

  public async resumeJob(): Promise<InspectionState> {
    this.currentState.status = 'completed';
    return this.currentState;
  }

  public async stopJob(): Promise<InspectionState> {
    this.currentState.status = 'stopped';
    return this.currentState;
  }

  public async retryItem(itemId: string): Promise<boolean> {
    const item = this.currentState.items.find((i) => i.id === itemId);
    if (!item) return false;
    await processDomainSequential(item, 1, this.currentState.settings);
    this.currentState.stats = calculateStats(this.currentState.items);
    return true;
  }

  public async retryAllIssues(): Promise<InspectionState> {
    const issues = this.currentState.items.filter(
      (it) => it.ssl.status !== 'YES' || it.website.status !== 'YES'
    );
    for (const item of issues) {
      await processDomainSequential(item, 1, this.currentState.settings);
    }
    this.currentState.stats = calculateStats(this.currentState.items);
    return this.currentState;
  }

  public async recheckMissingDates(): Promise<InspectionState> {
    const missing = this.currentState.items.filter(
      (it) => !it.whois.registeredOn || it.whois.status !== 'FOUND'
    );
    const domainNames = missing.map((m) => m.cleanDomain);
    const results = await recheckWhoisOnly(domainNames, this.currentState.settings);
    for (const res of results) {
      const match = this.currentState.items.find((it) => it.cleanDomain === res.domain);
      if (match) {
        match.whois = res.whois;
      }
    }
    this.currentState.stats = calculateStats(this.currentState.items);
    return this.currentState;
  }

  public async getExportData(): Promise<Array<Record<string, any>>> {
    return generateExportData(this.currentState.items);
  }

  public async exportToCsv(): Promise<string> {
    return exportToCsv(this.currentState.items);
  }

  public async exportToExcel(): Promise<Buffer> {
    return exportToExcel(this.currentState.items);
  }

  public on(_event: string, _fn: any) {}
  public emit(_event: string, _data: any) {}
}

export const jobManager = new JobManager();

