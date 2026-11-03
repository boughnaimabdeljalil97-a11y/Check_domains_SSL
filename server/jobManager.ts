import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import * as XLSX from 'xlsx';
import type {
  DomainItem,
  InspectionState,
  InspectionStats,
  CheckerSettings,
  DomainLog
} from './types.js';
import { checkDomainSSL } from './sslChecker.js';
import { checkDomainWebsite } from './websiteChecker.js';
import { checkDomainWhois } from './whoisChecker.js';
import { jobStore } from './jobStore.js';

const DEFAULT_SETTINGS: CheckerSettings = {
  workers: 4,
  timeoutSeconds: 30,
  maxRetries: 2,
  enableSSL: true,
  enableWebsite: true,
  enableWhois: true,
  whoisPacedDelayMs: 800
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

export class JobManager extends EventEmitter {
  private inMemoryState: InspectionState = JSON.parse(JSON.stringify(DEFAULT_STATE));
  private isProcessing = false;

  constructor() {
    super();
  }

  public async getFullState(jobId: string = 'current'): Promise<InspectionState> {
    const stored = await jobStore.getJob(jobId);
    if (stored) {
      this.inMemoryState = stored;
      return stored;
    }
    return this.inMemoryState;
  }

  public getFullStateSync(): InspectionState {
    return this.inMemoryState;
  }

  public async saveState(state: InspectionState, jobId: string = 'current'): Promise<void> {
    this.inMemoryState = state;
    state.updatedAt = new Date().toISOString();
    state.stats = this.computeStats(state.items);
    await jobStore.saveJob(jobId, state);
    this.emit('update', {
      event: 'state_updated',
      state
    });
  }

  public async startJob(
    domains: string[] | string,
    customSettings?: Partial<CheckerSettings>,
    jobId: string = 'current'
  ): Promise<InspectionState> {
    const settings: CheckerSettings = {
      ...DEFAULT_SETTINGS,
      ...this.inMemoryState.settings,
      ...customSettings
    };

    const normalizedDomains = this.parseInputDomains(domains);

    const items: DomainItem[] = normalizedDomains.map((domain, index) => {
      const id = crypto.randomUUID();
      return {
        id,
        domain,
        cleanDomain: domain,
        originalIndex: index + 1,
        status: 'pending',
        currentStep: 'idle',
        currentWorkerId: null,
        ssl: {
          status: settings.enableSSL ? 'CHECKING' : 'UNKNOWN',
          valid: false,
          reason: settings.enableSSL ? 'Queued' : 'SSL check disabled in settings'
        },
        website: {
          status: settings.enableWebsite ? 'CHECKING' : 'UNKNOWN',
          available: false,
          reason: settings.enableWebsite ? 'Queued' : 'Website check disabled in settings',
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
      };
    });

    const newState: InspectionState = {
      status: items.length > 0 ? 'running' : 'completed',
      items,
      settings,
      stats: this.computeStats(items),
      activeWorkers: 0,
      currentWorkerAssignments: {},
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await this.saveState(newState, jobId);

    // Process first batch inline so progress starts immediately
    if (items.length > 0) {
      await this.processNextBatch(jobId);
    }

    return this.getFullState(jobId);
  }

  /**
   * Heartbeat / Tick: called on every /api/status request
   * If job is running, executes the next batch of pending domains and saves state.
   */
  public async tickOrStatus(jobId: string = 'current'): Promise<InspectionState> {
    const state = await this.getFullState(jobId);
    if (state.status === 'running') {
      const hasPending = state.items.some((it) => it.status === 'pending');
      if (hasPending && !this.isProcessing) {
        await this.processNextBatch(jobId);
      } else if (!hasPending && state.activeWorkers === 0) {
        state.status = 'completed';
        await this.saveState(state, jobId);
      }
    }
    return this.getFullState(jobId);
  }

  public async pauseJob(jobId: string = 'current'): Promise<InspectionState> {
    const state = await this.getFullState(jobId);
    if (state.status === 'running') {
      state.status = 'paused';
      await this.saveState(state, jobId);
    }
    return state;
  }

  public async resumeJob(jobId: string = 'current'): Promise<InspectionState> {
    const state = await this.getFullState(jobId);
    if (state.status === 'paused') {
      state.status = 'running';
      await this.saveState(state, jobId);
      await this.processNextBatch(jobId);
    }
    return this.getFullState(jobId);
  }

  public async stopJob(jobId: string = 'current'): Promise<InspectionState> {
    const state = await this.getFullState(jobId);
    state.status = 'stopped';
    state.activeWorkers = 0;
    state.currentWorkerAssignments = {};

    for (const item of state.items) {
      if (item.status === 'pending') {
        item.status = 'failed';
        item.currentStep = 'done';
        if (item.ssl.status === 'CHECKING') item.ssl.status = 'UNKNOWN';
        if (item.website.status === 'CHECKING') item.website.status = 'UNKNOWN';
        if (item.whois.status === 'CHECKING') item.whois.status = 'NOT_FOUND';
      }
    }

    await this.saveState(state, jobId);
    return state;
  }

  public async retryItem(itemId: string, jobId: string = 'current'): Promise<boolean> {
    const state = await this.getFullState(jobId);
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return false;

    item.status = 'pending';
    item.currentStep = 'idle';
    item.retries += 1;
    item.logs.push({
      step: 'system',
      timestamp: new Date().toISOString(),
      message: `Manual retry requested (Attempt ${item.retries + 1})`,
      type: 'info'
    });

    if (state.settings.enableSSL) item.ssl.status = 'CHECKING';
    if (state.settings.enableWebsite) item.website.status = 'CHECKING';
    if (state.settings.enableWhois) item.whois.status = 'CHECKING';

    state.status = 'running';
    await this.saveState(state, jobId);
    await this.processNextBatch(jobId);
    return true;
  }

  public async retryAllIssues(jobId: string = 'current'): Promise<InspectionState> {
    const state = await this.getFullState(jobId);
    let queuedCount = 0;

    for (const item of state.items) {
      const isIssue =
        item.status === 'failed' ||
        item.status === 'retry_required' ||
        item.website.status === 'UNKNOWN' ||
        item.ssl.status === 'UNKNOWN';

      if (isIssue) {
        item.status = 'pending';
        item.currentStep = 'idle';
        item.retries += 1;
        item.logs.push({
          step: 'system',
          timestamp: new Date().toISOString(),
          message: `Batch retry requested (Attempt ${item.retries + 1})`,
          type: 'info'
        });
        if (state.settings.enableSSL) item.ssl.status = 'CHECKING';
        if (state.settings.enableWebsite) item.website.status = 'CHECKING';
        if (state.settings.enableWhois) item.whois.status = 'CHECKING';
        queuedCount++;
      }
    }

    if (queuedCount > 0) {
      state.status = 'running';
      await this.saveState(state, jobId);
      await this.processNextBatch(jobId);
    }

    return this.getFullState(jobId);
  }

  public async recheckMissingDates(jobId: string = 'current'): Promise<InspectionState> {
    const state = await this.getFullState(jobId);
    const missingItems = state.items.filter(
      (it) => it.whois.status !== 'FOUND' || !it.whois.registeredOn
    );

    if (missingItems.length === 0) return state;

    // Take next batch of missing items (up to 4 at a time with pacing)
    const batch = missingItems.slice(0, 4);
    const paceMs = Math.max(state.settings.whoisPacedDelayMs || 800, 400);

    for (const item of batch) {
      item.whois.status = 'CHECKING';
      try {
        const res = await checkDomainWhois(item.cleanDomain, {
          timeoutMs: 12000,
          pacedDelayMs: paceMs,
          maxAttempts: 3
        });
        item.whois = res;
        this.log(
          item,
          'whois',
          `Re-check result: ${res.status} (${res.registrar || 'N/A'} | ${res.registeredOn || 'Unavailable'})`,
          res.status === 'FOUND' && res.registeredOn ? 'success' : 'warn'
        );
      } catch (err: any) {
        this.log(item, 'whois', `Re-check error: ${err.message}`, 'error');
      }
    }

    await this.saveState(state, jobId);
    return this.getFullState(jobId);
  }

  /**
   * Dispatches the next batch of pending domains adhering to configured parallel workers.
   * Concurrently processes domains across workers, while keeping steps 1-7 strictly sequential per domain.
   */
  public async processNextBatch(jobId: string = 'current'): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const state = await this.getFullState(jobId);
      if (state.status !== 'running') return;

      const pendingItems = state.items.filter((it) => it.status === 'pending');
      if (pendingItems.length === 0) {
        state.status = 'completed';
        state.activeWorkers = 0;
        state.currentWorkerAssignments = {};
        await this.saveState(state, jobId);
        return;
      }

      const maxWorkers = Math.min(Math.max(state.settings.workers || 4, 1), 8);
      const batch = pendingItems.slice(0, maxWorkers);

      // Assign in-flight workers
      state.activeWorkers = batch.length;
      state.currentWorkerAssignments = {};
      batch.forEach((item, index) => {
        const workerId = index + 1;
        item.currentWorkerId = workerId;
        item.status = 'checking';
        item.startedAt = item.startedAt || new Date().toISOString();
        state.currentWorkerAssignments[workerId] = item.domain;
      });

      await this.saveState(state, jobId);

      // Process batch domains in parallel using configured workers
      await Promise.all(
        batch.map((item, index) =>
          this.processDomainSequential(item, index + 1, state.settings).catch((err) => {
            this.log(item, 'system', `Unexpected worker error: ${err.message}`, 'error');
            item.status = 'failed';
          })
        )
      );

      // Free workers for finished batch
      batch.forEach((item) => {
        item.currentWorkerId = null;
      });
      state.activeWorkers = 0;
      state.currentWorkerAssignments = {};

      const remainingPending = state.items.filter((it) => it.status === 'pending');
      if (remainingPending.length === 0) {
        state.status = 'completed';
      }

      await this.saveState(state, jobId);
    } finally {
      this.isProcessing = false;
    }
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
  public async processDomainSequential(
    item: DomainItem,
    workerId: number,
    settings: CheckerSettings
  ): Promise<void> {
    const timeoutMs = (settings.timeoutSeconds || 30) * 1000;

    // STEP 1 & 2: SSL CHECK & SAVE
    if (settings.enableSSL) {
      item.currentStep = 'ssl';
      this.log(item, 'ssl', `Worker #${workerId}: Starting TLS certificate check on port 443...`, 'info');

      try {
        const sslRes = await checkDomainSSL(item.cleanDomain, { timeoutMs: Math.min(timeoutMs, 15000) });
        item.ssl = sslRes;

        const logType = sslRes.status === 'YES' ? 'success' : 'warn';
        this.log(item, 'ssl', `Worker #${workerId}: SSL Check completed: ${sslRes.status} (${sslRes.reason})`, logType);
      } catch (sslErr: any) {
        item.ssl = {
          status: 'NO',
          valid: false,
          reason: `SSL check exception: ${sslErr.message}`,
          checkedAt: new Date().toISOString()
        };
        this.log(item, 'ssl', `Worker #${workerId}: SSL Check error: ${sslErr.message}`, 'error');
      }
    }

    // STEP 3 & 4: WEBSITE CHECK & SAVE
    if (settings.enableWebsite) {
      item.currentStep = 'website';
      this.log(item, 'website', `Worker #${workerId}: Starting Website availability inspection...`, 'info');

      try {
        const webRes = await checkDomainWebsite(item.cleanDomain, { timeoutMs });
        item.website = webRes;

        const logType = webRes.status === 'YES' ? 'success' : webRes.status === 'UNKNOWN' ? 'warn' : 'error';
        this.log(item, 'website', `Worker #${workerId}: Website Check completed: ${webRes.status} (${webRes.reason})`, logType);
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
        this.log(item, 'website', `Worker #${workerId}: Website Check error: ${webErr.message}`, 'error');
      }
    }

    // STEP 5 & 6: WHOIS / RDAP LOOKUP & SAVE
    if (settings.enableWhois) {
      item.currentStep = 'whois';
      this.log(item, 'whois', `Worker #${workerId}: Querying RDAP registration data...`, 'info');

      try {
        const whoisRes = await checkDomainWhois(item.cleanDomain, {
          timeoutMs: 12000,
          pacedDelayMs: settings.whoisPacedDelayMs || 800,
          maxAttempts: 3,
          onRetry: (attempt, msg) => {
            this.log(item, 'whois', `Worker #${workerId} (Attempt ${attempt}): ${msg}`, 'info');
          }
        });
        item.whois = whoisRes;

        const logType = whoisRes.status === 'FOUND' && whoisRes.registeredOn ? 'success' : 'info';
        this.log(
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
        this.log(item, 'whois', `Worker #${workerId}: Registration check error: ${whoisErr.message}`, 'warn');
      }
    }

    // STEP 7: MARK DOMAIN AS COMPLETED OR RETRY REQUIRED
    item.currentStep = 'done';
    item.completedAt = new Date().toISOString();

    if (item.website.status === 'UNKNOWN' && item.retries < item.maxRetries) {
      item.status = 'retry_required';
      this.log(item, 'system', `Domain marked as Retry Required (${item.website.reason})`, 'warn');
    } else {
      item.status = 'completed';
      this.log(item, 'system', `All inspection steps completed successfully`, 'success');
    }
  }

  public log(item: DomainItem, step: DomainLog['step'], message: string, type: DomainLog['type']) {
    item.logs.push({
      step,
      timestamp: new Date().toISOString(),
      message,
      type
    });
  }

  public parseInputDomains(input: string[] | string): string[] {
    let lines: string[] = [];
    if (Array.isArray(input)) {
      lines = input;
    } else if (typeof input === 'string') {
      lines = input.split(/\r?\n/);
    }

    const seen = new Set<string>();
    const validDomains: string[] = [];

    for (const raw of lines) {
      const clean = this.normalizeDomain(raw);
      if (clean && !seen.has(clean)) {
        seen.add(clean);
        validDomains.push(clean);
      }
    }

    return validDomains;
  }

  public normalizeDomain(raw: string): string | null {
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

  public computeStats(items: DomainItem[]): InspectionStats {
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

    for (const it of items) {
      if (it.status === 'completed') completed++;
      if (it.status === 'pending') pending++;
      if (it.status === 'checking') inFlight++;
      if (it.status === 'retry_required') retryRequired++;

      if (it.ssl.status === 'YES') sslYes++;
      if (it.ssl.status === 'NO') sslNo++;

      if (it.website.status === 'YES') websiteYes++;
      if (it.website.status === 'NO') websiteNo++;

      if (it.ssl.status === 'YES' && it.website.status === 'YES') bothYes++;
      if (it.whois.status === 'FOUND') whoisFound++;
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

  /**
   * CRITICAL REQUIREMENT: PRESERVE ORIGINAL INPUT ORDER
   * Sorts strictly by originalIndex before export!
   */
  public async getExportData(jobId: string = 'current'): Promise<Array<Record<string, any>>> {
    const state = await this.getFullState(jobId);
    const items = [...state.items];

    // Sort strictly by permanent originalIndex
    items.sort((a, b) => a.originalIndex - b.originalIndex);

    return items.map((item) => ({
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

  public async exportToCsv(jobId: string = 'current'): Promise<string> {
    const data = await this.getExportData(jobId);
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

  public async exportToExcel(jobId: string = 'current'): Promise<Buffer> {
    const data = await this.getExportData(jobId);
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
}

export const jobManager = new JobManager();
