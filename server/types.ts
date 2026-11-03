export type SSLStatus = 'YES' | 'NO' | 'UNKNOWN' | 'CHECKING';
export type WebsiteStatus = 'YES' | 'NO' | 'UNKNOWN' | 'CHECKING';
export type WhoisStatus = 'FOUND' | 'NOT_FOUND' | 'ERROR' | 'CHECKING' | 'SKIPPED';
export type DomainJobStatus = 'pending' | 'checking' | 'completed' | 'paused' | 'failed' | 'retry_required';
export type StepType = 'idle' | 'ssl' | 'website' | 'whois' | 'done';

export interface SSLResult {
  status: SSLStatus;
  valid: boolean;
  reason: string;
  issuer?: string;
  subject?: string;
  validFrom?: string;
  validTo?: string;
  daysRemaining?: number;
  sans?: string[];
  protocol?: string;
  cipher?: string;
  checkedAt?: string;
  certDetails?: {
    serialNumber?: string;
    fingerprint?: string;
    selfSigned?: boolean;
    expired?: boolean;
    hostnameMismatch?: boolean;
    untrusted?: boolean;
  };
}

export interface WebsiteResult {
  status: WebsiteStatus;
  available: boolean;
  reason: string;
  statusCode: number | null;
  finalUrl: string;
  title: string;
  redirects: string[];
  loadTimeMs: number;
  checkedAt?: string;
  detectedExclusionType?: 'none' | '404_not_found' | 'namecheap_expired' | 'bot_challenge' | 'dns_permanent_fail' | 'other';
  headers?: Record<string, string>;
}

export interface WhoisResult {
  status: WhoisStatus;
  registeredOn: string | null;
  updatedOn: string | null;
  expiresOn: string | null;
  registrar: string | null;
  domainStatus: string[];
  nameservers: string[];
  rawSummary: string | null;
  source: 'rdap' | 'whois' | 'skipped' | 'none';
  checkedAt?: string;
}

export interface DomainLog {
  step: 'system' | 'ssl' | 'website' | 'whois';
  timestamp: string;
  message: string;
  type: 'info' | 'success' | 'warn' | 'error';
}

export interface DomainItem {
  id: string;
  domain: string;
  cleanDomain: string;
  originalIndex: number;
  status: DomainJobStatus;
  currentStep: StepType;
  currentWorkerId?: number | null;
  ssl: SSLResult;
  website: WebsiteResult;
  whois: WhoisResult;
  retries: number;
  maxRetries: number;
  logs: DomainLog[];
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
}

export interface CheckerSettings {
  workers: number; // 1, 2, 3, 4, 5, 8 (default 4)
  timeoutSeconds: number; // default 30
  maxRetries: number; // default 2
  enableSSL: boolean; // default true
  enableWebsite: boolean; // default true
  enableWhois: boolean; // default true
  whoisPacedDelayMs?: number; // default 800ms pacing between registry WHOIS queries
}

export interface InspectionStats {
  total: number;
  completed: number;
  pending: number;
  inFlight: number;
  retryRequired: number;
  sslYes: number;
  sslNo: number;
  websiteYes: number;
  websiteNo: number;
  bothYes: number;
  whoisFound: number;
  percentComplete: number;
}

export interface InspectionState {
  status: 'idle' | 'running' | 'paused' | 'stopped' | 'completed';
  items: DomainItem[];
  settings: CheckerSettings;
  stats: InspectionStats;
  activeWorkers: number;
  currentWorkerAssignments: Record<number, string>; // workerId -> domain
  startedAt?: string | null;
  updatedAt: string;
  needsContinue?: boolean;
}

