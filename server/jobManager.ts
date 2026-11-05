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
import { spamhausChecker } from './spamhausChecker.js';

export class JobManager extends EventEmitter {
  private items: Map<string, DomainItem> = new Map();
  private queue: string[] = []; // Domain IDs waiting to be processed
  private inFlightWorkers: Map<number, string> = new Map(); // workerId -> domainId
  private stateStatus: 'idle' | 'running' | 'paused' | 'stopped' | 'completed' = 'idle';
  private startedAt: string | null = null;
  private settings: CheckerSettings = {
    workers: 4,
    timeoutSeconds: 30,
    maxRetries: 2,
    enableSSL: true,
    enableWebsite: true,
    enableWhois: true,
    enableSpamhaus: Boolean(process.env.SPAMHAUS_USERNAME && process.env.SPAMHAUS_PASSWORD),
    whoisPacedDelayMs: 800,
    spamhausPacedDelayMs: 1000,
    spamhausUseProxy: false,
    spamhausProxies: []
  };
  private isProcessing = false;


  constructor() {
    super();
  }

  public getFullState(): InspectionState {
    const itemsArray = Array.from(this.items.values());
    const stats = this.computeStats(itemsArray);

    const workerAssignments: Record<number, string> = {};
    for (const [wId, dId] of this.inFlightWorkers.entries()) {
      const item = this.items.get(dId);
      if (item) {
        workerAssignments[wId] = item.domain;
      }
    }

    const sanitizedSettings: CheckerSettings = {
      ...this.settings,
      spamhausPassword: this.settings.spamhausPassword ? '••••••••' : undefined,
      hasSpamhausCreds: spamhausChecker.hasCredentials()
    };

    return {
      status: this.stateStatus,
      items: itemsArray,
      settings: sanitizedSettings,
      stats,
      activeWorkers: this.inFlightWorkers.size,
      currentWorkerAssignments: workerAssignments,
      startedAt: this.startedAt,
      updatedAt: new Date().toISOString()
    };
  }

  public isStopped(): boolean {
    return (this.stateStatus as string) === 'stopped';
  }

  public isRunning(): boolean {
    return (this.stateStatus as string) === 'running';
  }

  public startJob(domains: string[] | string, customSettings?: Partial<CheckerSettings>): InspectionState {
    if (customSettings) {
      this.settings = { ...this.settings, ...customSettings };
      if (customSettings.spamhausUsername || customSettings.spamhausPassword) {
        spamhausChecker.setRuntimeCredentials(customSettings.spamhausUsername, customSettings.spamhausPassword);
      }
    }

    // Clear previous state
    this.items.clear();
    this.queue = [];
    this.inFlightWorkers.clear();
    this.stateStatus = 'running';
    this.startedAt = new Date().toISOString();

    // Parse and normalize input domains, preserving original input order
    const normalizedDomains = this.parseInputDomains(domains);

    normalizedDomains.forEach((domain, index) => {
      const id = crypto.randomUUID();
      const item: DomainItem = {
        id,
        domain,
        cleanDomain: domain,
        originalIndex: index + 1, // 1-based permanent order
        status: 'pending',
        currentStep: 'idle',
        currentWorkerId: null,
        ssl: {
          status: this.settings.enableSSL ? 'CHECKING' : 'UNKNOWN',
          valid: false,
          reason: this.settings.enableSSL ? 'Queued' : 'SSL check disabled in settings'
        },
        website: {
          status: this.settings.enableWebsite ? 'CHECKING' : 'UNKNOWN',
          available: false,
          reason: this.settings.enableWebsite ? 'Queued' : 'Website check disabled in settings',
          statusCode: null,
          finalUrl: `https://${domain}`,
          title: '',
          redirects: [],
          loadTimeMs: 0
        },
        whois: {
          status: this.settings.enableWhois ? 'CHECKING' : 'SKIPPED',
          registeredOn: null,
          updatedOn: null,
          expiresOn: null,
          registrar: null,
          domainStatus: [],
          nameservers: [],
          rawSummary: null,
          source: this.settings.enableWhois ? 'none' : 'skipped'
        },
        spamhaus: {
          status: this.settings.enableSpamhaus && spamhausChecker.hasCredentials() ? 'pending' : 'skipped',
          tags: '',
          clusters: '',
          clusterAuthId: null,
          clusterInfraId: null
        },
        spamhausTags: '',
        spamhausClusters: '',
        spamhausClusterAuth: null,
        spamhausClusterInfra: null,
        spamhausStatus: this.settings.enableSpamhaus && spamhausChecker.hasCredentials() ? 'pending' : 'skipped',
        retries: 0,
        maxRetries: this.settings.maxRetries,
        logs: [
          {
            step: 'system',
            timestamp: new Date().toISOString(),
            message: `Domain #${index + 1} queued for inspection`,
            type: 'info'
          }
        ]
      };

      this.items.set(id, item);
      this.queue.push(id);
    });

    this.emitStateChange('job_started');
    this.scheduleWorkers();
    return this.getFullState();
  }

  public pauseJob(): InspectionState {
    if (this.stateStatus === 'running') {
      this.stateStatus = 'paused';
      this.emitStateChange('job_paused');
    }
    return this.getFullState();
  }

  public resumeJob(): InspectionState {
    if (this.stateStatus === 'paused') {
      this.stateStatus = 'running';
      this.emitStateChange('job_resumed');
      this.scheduleWorkers();
    }
    return this.getFullState();
  }

  public stopJob(): InspectionState {
    this.stateStatus = 'stopped';
    this.queue = []; // Empty waiting queue
    for (const item of this.items.values()) {
      if (item.status === 'pending') {
        item.status = 'failed';
        item.currentStep = 'done';
        if (item.ssl.status === 'CHECKING') item.ssl.status = 'UNKNOWN';
        if (item.website.status === 'CHECKING') item.website.status = 'UNKNOWN';
        if (item.whois.status === 'CHECKING') item.whois.status = 'NOT_FOUND';
      }
    }
    this.emitStateChange('job_stopped');
    return this.getFullState();
  }

  public retryItem(itemId: string): boolean {
    const item = this.items.get(itemId);
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

    if (this.settings.enableSSL) item.ssl.status = 'CHECKING';
    if (this.settings.enableWebsite) item.website.status = 'CHECKING';
    if (this.settings.enableWhois) item.whois.status = 'CHECKING';
    if (this.settings.enableSpamhaus) {
      item.spamhaus.status = 'pending';
      item.spamhausStatus = 'pending';
    }

    this.queue.push(itemId);
    if (this.stateStatus !== 'running') {
      this.stateStatus = 'running';
    }
    this.emitStateChange('item_retry_queued', item);
    this.scheduleWorkers();
    return true;
  }

  public retryAllIssues(): InspectionState {
    for (const item of this.items.values()) {
      const isIssue =
        item.status === 'failed' ||
        item.status === 'retry_required' ||
        item.website.status === 'UNKNOWN' ||
        item.ssl.status === 'UNKNOWN' ||
        item.spamhaus?.status === 'error' ||
        item.spamhaus?.status === 'rate limited';

      if (isIssue && !this.queue.includes(item.id) && !Array.from(this.inFlightWorkers.values()).includes(item.id)) {
        item.status = 'pending';
        item.currentStep = 'idle';
        item.retries += 1;
        item.logs.push({
          step: 'system',
          timestamp: new Date().toISOString(),
          message: `Batch retry requested (Attempt ${item.retries + 1})`,
          type: 'info'
        });
        if (this.settings.enableSSL) item.ssl.status = 'CHECKING';
        if (this.settings.enableWebsite) item.website.status = 'CHECKING';
        if (this.settings.enableWhois) item.whois.status = 'CHECKING';
        if (this.settings.enableSpamhaus) {
          item.spamhaus.status = 'pending';
          item.spamhausStatus = 'pending';
        }
        this.queue.push(item.id);
      }
    }

    if (this.stateStatus !== 'running' && this.queue.length > 0) {
      this.stateStatus = 'running';
    }
    this.emitStateChange('batch_retry_started');
    this.scheduleWorkers();
    return this.getFullState();
  }

  public retrySpamhausErrors(): InspectionState {
    for (const item of this.items.values()) {
      const isSpamhausIssue =
        item.spamhaus?.status === 'error' ||
        item.spamhaus?.status === 'rate limited';

      if (isSpamhausIssue && !this.queue.includes(item.id) && !Array.from(this.inFlightWorkers.values()).includes(item.id)) {
        item.status = 'pending';
        item.currentStep = 'idle';
        item.spamhaus.status = 'pending';
        item.spamhausStatus = 'pending';
        item.retries += 1;
        item.logs.push({
          step: 'spamhaus',
          timestamp: new Date().toISOString(),
          message: `Retry requested for Spamhaus error`,
          type: 'info'
        });
        this.queue.push(item.id);
      }
    }

    if (this.stateStatus !== 'running' && this.queue.length > 0) {
      this.stateStatus = 'running';
    }
    this.emitStateChange('batch_retry_started');
    this.scheduleWorkers();
    return this.getFullState();
  }

  /**
   * Slowly and reliably re-checks only domains that currently lack registration dates,
   * with inter-request spacing and automatic multi-channel retries until dates appear.
   */
  public async recheckMissingDates(): Promise<InspectionState> {
    const missingItems = Array.from(this.items.values()).filter(
      (it) => it.whois.status !== 'FOUND' || !it.whois.registeredOn
    );

    if (missingItems.length === 0) return this.getFullState();

    // Mark items as checking in WHOIS
    for (const item of missingItems) {
      item.whois.status = 'CHECKING';
      this.log(item, 'whois', 'Paced re-check initiated for missing registration dates...', 'info');
    }
    this.emitStateChange('whois_recheck_started');

    // Run sequentially with controlled pacing
    (async () => {
      const paceMs = Math.max(this.settings.whoisPacedDelayMs || 1000, 800);
      for (const item of missingItems) {
        if (this.isStopped()) break;

        try {
          const res = await checkDomainWhois(item.cleanDomain, {
            timeoutMs: 12000,
            pacedDelayMs: paceMs,
            maxAttempts: 3,
            onRetry: (attempt, msg) => {
              this.log(item, 'whois', `Retry #${attempt}: ${msg}`, 'info');
              this.emitStateChange('item_updated', item);
            }
          });
          item.whois = res;

          const isSuccess = res.status === 'FOUND' && res.registeredOn;
          this.log(
            item,
            'whois',
            `Re-check result: ${res.status} (${res.registrar || 'N/A'} | ${res.registeredOn || 'Unavailable'})`,
            isSuccess ? 'success' : 'warn'
          );
        } catch (err: any) {
          this.log(item, 'whois', `Re-check failed: ${err.message}`, 'error');
        }

        this.emitStateChange('item_updated', item);
      }
      this.emitStateChange('whois_recheck_completed');
    })();

    return this.getFullState();
  }

  /**
   * Worker loop: fills available worker slots up to settings.workers.
   * Dispatches independent domains to workers.
   */
  private scheduleWorkers() {
    if (this.stateStatus !== 'running') return;

    const maxWorkers = Math.min(Math.max(this.settings.workers, 1), 8);

    // Find free worker slots 1..maxWorkers
    for (let wId = 1; wId <= maxWorkers; wId++) {
      if (this.queue.length === 0) break;
      if (this.inFlightWorkers.has(wId)) continue; // Worker already busy

      const nextDomainId = this.queue.shift();
      if (!nextDomainId) break;

      const item = this.items.get(nextDomainId);
      if (!item) continue;

      this.inFlightWorkers.set(wId, nextDomainId);
      item.currentWorkerId = wId;
      item.status = 'checking';
      item.startedAt = item.startedAt || new Date().toISOString();

      this.emitStateChange('worker_assigned', { workerId: wId, domain: item.domain });

      // Process domain through strict sequential 7-step pipeline
      this.processDomainSequential(item, wId)
        .catch((err) => {
          this.log(item, 'system', `Unexpected worker error: ${err.message}`, 'error');
          item.status = 'failed';
        })
        .finally(() => {
          this.inFlightWorkers.delete(wId);
          item.currentWorkerId = null;

          // Check if all queued and in-flight work is complete
          if (this.queue.length === 0 && this.inFlightWorkers.size === 0) {
            this.stateStatus = 'completed';
            this.emitStateChange('job_completed');
          } else {
            // Keep dispatching remaining items
            this.scheduleWorkers();
          }
        });
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
  private async processDomainSequential(item: DomainItem, workerId: number): Promise<void> {
    const timeoutMs = this.settings.timeoutSeconds * 1000;

    try {
      // STEP 1 & 2: SSL CHECK & SAVE
      if (this.settings.enableSSL) {
        item.currentStep = 'ssl';
        this.log(item, 'ssl', `Worker #${workerId}: Starting TLS certificate check on port 443...`, 'info');
        this.emitStateChange('step_started', { domainId: item.id, step: 'ssl' });

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

        this.emitStateChange('step_completed', { domainId: item.id, step: 'ssl' });
      }

      // Check pause/stop between steps
      if (this.isStopped()) return;

      // STEP 3 & 4: WEBSITE CHECK & SAVE
      if (this.settings.enableWebsite) {
        item.currentStep = 'website';
        this.log(item, 'website', `Worker #${workerId}: Starting Website availability inspection...`, 'info');
        this.emitStateChange('step_started', { domainId: item.id, step: 'website' });

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

        this.emitStateChange('step_completed', { domainId: item.id, step: 'website' });
      }

      // Check pause/stop between steps
      if (this.isStopped()) return;

      // STEP 5 & 6: WHOIS / RDAP LOOKUP & SAVE
      if (this.settings.enableWhois) {
        item.currentStep = 'whois';
        this.log(item, 'whois', `Worker #${workerId}: Querying RDAP registration data...`, 'info');
        this.emitStateChange('step_started', { domainId: item.id, step: 'whois' });

        try {
          const whoisRes = await checkDomainWhois(item.cleanDomain, {
            timeoutMs: 12000,
            pacedDelayMs: this.settings.whoisPacedDelayMs || 800,
            maxAttempts: 3,
            onRetry: (attempt, msg) => {
              this.log(item, 'whois', `Worker #${workerId} (Attempt ${attempt}): ${msg}`, 'info');
              this.emitStateChange('item_updated', item);
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

        this.emitStateChange('step_completed', { domainId: item.id, step: 'whois' });
      }

      // Check pause/stop between steps
      if (this.isStopped()) return;

      // STEP 7 & 8: SPAMHAUS INTELLIGENCE API (SIA) CHECK
      const hasCreds = spamhausChecker.hasCredentials();
      if (!this.settings.enableSpamhaus || !hasCreds) {
        // Skip Spamhaus step entirely when disabled or credentials missing
        item.spamhaus = {
          status: 'skipped',
          tags: '',
          clusters: '',
          clusterAuthId: null,
          clusterInfraId: null
        };
        item.spamhausTags = '';
        item.spamhausClusters = '';
        item.spamhausClusterAuth = null;
        item.spamhausClusterInfra = null;
        item.spamhausStatus = 'skipped';
      } else {
        item.currentStep = 'spamhaus';
        item.spamhaus.status = 'running';
        item.spamhausStatus = 'running';
        console.log(`[Spamhaus] [${item.cleanDomain}] Step started by worker #${workerId}`);
        this.log(item, 'spamhaus', `Worker #${workerId}: Querying Spamhaus Intelligence API...`, 'info');
        this.emitStateChange('step_started', { domainId: item.id, step: 'spamhaus' });

        try {
          const shRes = await spamhausChecker.checkDomain(item.cleanDomain, {
            timeoutMs: 15000,
            useProxy: this.settings.spamhausUseProxy,
            proxies: this.settings.spamhausProxies,
            pacedDelayMs: this.settings.spamhausPacedDelayMs || 1000
          });

          item.spamhaus = shRes;
          item.spamhausTags = shRes.tags;
          item.spamhausClusters = shRes.clusters;
          item.spamhausClusterAuth = shRes.clusterAuthId;
          item.spamhausClusterInfra = shRes.clusterInfraId;
          item.spamhausAbused = shRes.abused;
          item.spamhausScore = shRes.score;
          item.spamhausStatus = shRes.status;

          console.log(`[Spamhaus] [${item.cleanDomain}] Step completed: ${shRes.status}`);
          const logType = shRes.status === 'done' ? 'success' : shRes.status === 'not found' ? 'info' : 'warn';
          this.log(
            item,
            'spamhaus',
            `Worker #${workerId}: Spamhaus result: ${shRes.status} (Tags: ${shRes.tags || 'none'}, Clusters: ${shRes.clusters})`,
            logType
          );
        } catch (shErr: any) {
          console.error(`[Spamhaus] [${item.cleanDomain}] Step error: ${shErr.message}`);
          item.spamhaus = {
            status: 'error',
            tags: '',
            clusters: 'NO',
            clusterAuthId: null,
            clusterInfraId: null,
            error: shErr.message,
            checkedAt: new Date().toISOString()
          };
          item.spamhausStatus = 'error';
          this.log(item, 'spamhaus', `Worker #${workerId}: Spamhaus check error: ${shErr.message}`, 'error');
        }

        this.emitStateChange('step_completed', { domainId: item.id, step: 'spamhaus' });
      }
    } finally {
      // STEP 9: MARK DOMAIN AS COMPLETED (always executed in finally block so worker is released)
      item.currentStep = 'done';
      item.completedAt = new Date().toISOString();

      if (item.website.status === 'UNKNOWN' && item.retries < item.maxRetries) {
        item.status = 'retry_required';
        this.log(item, 'system', `Domain marked as Retry Required (${item.website.reason})`, 'warn');
      } else if (item.status === 'checking' || item.status === 'pending') {
        item.status = 'completed';
        this.log(item, 'system', `All inspection steps completed successfully`, 'success');
      }

      this.emitStateChange('item_completed', item);
    }
  }

  private log(item: DomainItem, step: DomainLog['step'], message: string, type: DomainLog['type']) {
    item.logs.push({
      step,
      timestamp: new Date().toISOString(),
      message,
      type
    });
  }

  private emitStateChange(eventName: string, payload?: any) {
    this.emit('update', {
      event: eventName,
      payload,
      state: this.getFullState()
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

    // Remove surrounding whitespace or quotes
    s = s.replace(/^["']|["']$/g, '').trim();

    // If starts with http:// or https://, strip it
    s = s.replace(/^(?:https?:\/\/)/i, '');

    // Strip path or port
    s = s.split('/')[0].split('?')[0].split('#')[0];
    s = s.split(':')[0]; // strip port if present

    s = s.toLowerCase().trim();

    // Reject spaces or invalid characters
    if (!s || s.includes(' ') || s.includes('@')) {
      return null;
    }

    // Validate domain pattern (must have at least one dot, valid labels)
    // Supports domains like takula.com, repro-tech.co.uk
    const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
    if (!domainRegex.test(s)) {
      return null;
    }

    return s;
  }

  /**
   * Computes statistics across all domains
   */
  private computeStats(items: DomainItem[]): InspectionStats {
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
    let clustersFound = 0;
    let taggedCount = 0;
    let spamhausErrors = 0;

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

      const clusterVal = it.spamhausClusters || it.spamhaus?.clusters;
      if (clusterVal && clusterVal !== 'NO') clustersFound++;

      const tagsVal = it.spamhausTags || it.spamhaus?.tags;
      if (tagsVal && tagsVal.trim().length > 0) taggedCount++;

      if (it.spamhaus?.status === 'error' || it.spamhaus?.status === 'rate limited') {
        spamhausErrors++;
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
      clustersFound,
      taggedCount,
      spamhausErrors,
      percentComplete
    };
  }

  /**
   * CRITICAL REQUIREMENT: PRESERVE ORIGINAL INPUT ORDER
   * Assigns permanent originalIndex and sorts strictly by originalIndex before export!
   */
  public getExportData(): Array<Record<string, any>> {
    const items = Array.from(this.items.values());

    // Sort strictly by originalIndex
    items.sort((a, b) => a.originalIndex - b.originalIndex);

    return items.map((item) => ({
      '#': item.originalIndex,
      'Domain': item.domain,
      'Tags': item.spamhausTags || item.spamhaus?.tags || '',
      'Clusters': item.spamhausClusters || item.spamhaus?.clusters || 'NO',
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

  public exportToCsv(): string {
    const data = this.getExportData();
    if (data.length === 0) {
      return '#,Domain,Tags,Clusters,Registered On,Updated On,Expires On,Registrar,SSL,SSL Reason,SSL Issuer,SSL Expiry,Days Until Expiry,Website,Website Reason,Final URL,HTTP Status,Load Time (ms),Completed At\n';
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

  public exportToExcel(): Buffer {
    const data = this.getExportData();
    const worksheet = XLSX.utils.json_to_sheet(data);

    // Auto-fit column widths
    const colWidths = [
      { wch: 4 },  // #
      { wch: 25 }, // Domain
      { wch: 18 }, // Tags
      { wch: 14 }, // Clusters
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
