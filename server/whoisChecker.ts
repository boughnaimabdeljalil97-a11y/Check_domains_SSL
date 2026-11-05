import https from 'node:https';
import http from 'node:http';
import net from 'node:net';
import { URL } from 'node:url';
import type { WhoisResult } from './types.js';

interface WhoisOptions {
  timeoutMs?: number;
  pacedDelayMs?: number;
  maxAttempts?: number;
  onRetry?: (attempt: number, error: string) => void;
}

// Authoritative RDAP base URLs by TLD
const RDAP_REGISTRY_MAP: Record<string, string> = {
  com: 'https://rdap.verisign.com/com/v1/domain/',
  net: 'https://rdap.verisign.com/net/v1/domain/',
  org: 'https://rdap.publicinterestregistry.org/rdap/domain/',
  info: 'https://rdap.identitydigital.services/rdap/domain/',
  biz: 'https://rdap.nic.biz/domain/',
  co: 'https://rdap.nic.co/domain/',
  us: 'https://rdap.nic.us/domain/',
  club: 'https://rdap.nic.club/domain/',
  online: 'https://rdap.centralnic.com/online/domain/',
  site: 'https://rdap.centralnic.com/site/domain/',
  store: 'https://rdap.centralnic.com/store/domain/',
  tech: 'https://rdap.centralnic.com/tech/domain/'
};

// Port 43 WHOIS server mapping by TLD
const WHOIS_SERVER_MAP: Record<string, string> = {
  com: 'whois.verisign-grs.com',
  net: 'whois.verisign-grs.com',
  org: 'whois.pir.org',
  uk: 'whois.nic.uk',
  'co.uk': 'whois.nic.uk',
  'org.uk': 'whois.nic.uk',
  'me.uk': 'whois.nic.uk',
  ca: 'whois.cira.ca',
  de: 'whois.denic.de',
  fr: 'whois.afnic.fr',
  eu: 'whois.eu',
  nl: 'whois.domain-registry.nl',
  io: 'whois.nic.io',
  co: 'whois.nic.co',
  me: 'whois.nic.me',
  in: 'whois.registry.in',
  it: 'whois.nic.it',
  au: 'whois.auda.org.au',
  ma: 'whois.registre.ma'
};

/**
 * Global Async Rate-Limiter / Pacing Queue
 * Ensures registry servers (Verisign, Nominet, PIR) receive queries sequentially with
 * controlled delay, preventing 429 Too Many Requests and IP socket bans.
 */
class WhoisRequestPacer {
  private lastRequestTime = 0;
  private queue: Promise<any> = Promise.resolve();

  public async schedule<T>(fn: () => Promise<T>, delayMs: number = 750): Promise<T> {
    const run = async (): Promise<T> => {
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      if (elapsed < delayMs) {
        await new Promise((r) => setTimeout(r, delayMs - elapsed));
      }
      this.lastRequestTime = Date.now();
      return fn();
    };

    // Chain execution
    const resultPromise = this.queue.then(run, run);
    this.queue = resultPromise.catch(() => {});
    return resultPromise;
  }
}

export const whoisPacer = new WhoisRequestPacer();

/**
 * Checks domain registration information with:
 * 1. Global pacing queue to prevent registry rate limits (Verisign 429 / Port 43 socket throttling)
 * 2. Multi-channel execution (Registry RDAP -> Registry Socket WHOIS -> Referral WHOIS)
 * 3. Persistent auto-retries with exponential backoff if dates are missing on first attempt
 */
export async function checkDomainWhois(
  domain: string,
  options: WhoisOptions = {}
): Promise<WhoisResult> {
  const timeoutMs = options.timeoutMs || 10000;
  const pacedDelayMs = options.pacedDelayMs !== undefined ? options.pacedDelayMs : 750;
  const maxAttempts = options.maxAttempts || 3;
  const cleanDomain = domain.toLowerCase().trim();

  let lastResult: WhoisResult = {
    status: 'NOT_FOUND',
    registeredOn: null,
    updatedOn: null,
    expiresOn: null,
    registrar: null,
    domainStatus: [],
    nameservers: [],
    rawSummary: 'Registration data pending',
    source: 'none',
    checkedAt: new Date().toISOString()
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const result = await whoisPacer.schedule(
      () => singleWhoisAttempt(cleanDomain, timeoutMs),
      pacedDelayMs
    );

    // If registration date is successfully found, return immediately!
    if (result.status === 'FOUND' && result.registeredOn) {
      return result;
    }

    lastResult = result;

    // If still missing and attempts remain, backoff and retry
    if (attempt < maxAttempts) {
      const backoffMs = attempt * 1200;
      options.onRetry?.(attempt + 1, `Date missing on attempt ${attempt}. Waiting ${backoffMs}ms before re-checking...`);
      await new Promise((r) => setTimeout(r, backoffMs));
    }
  }

  return lastResult;
}

/**
 * Executes a single multi-channel WHOIS/RDAP attempt
 */
async function singleWhoisAttempt(cleanDomain: string, timeoutMs: number): Promise<WhoisResult> {
  const tld = extractTld(cleanDomain);

  // Channel 1: Authoritative Registry RDAP (Verisign, PIR, CentralNic)
  const rdapBase = RDAP_REGISTRY_MAP[tld];
  if (rdapBase) {
    try {
      const rdapUrl = `${rdapBase}${encodeURIComponent(cleanDomain)}`;
      const rdapData = await fetchJsonWithTimeout(rdapUrl, timeoutMs);
      if (rdapData && !rdapData.errorCode && !('title' in rdapData && rdapData.title?.includes('Too Many Requests'))) {
        const parsed = parseRdapResponse(rdapData, cleanDomain);
        if (parsed.status === 'FOUND' && parsed.registeredOn) {
          return parsed;
        }
      }
    } catch {
      // Continue to Channel 2
    }
  }

  // Channel 2: Native Port 43 Socket WHOIS
  const whoisServer =
    WHOIS_SERVER_MAP[cleanDomain.split('.').slice(-2).join('.')] ||
    WHOIS_SERVER_MAP[tld] ||
    'whois.iana.org';

  try {
    const rawWhois = await queryWhoisSocket(cleanDomain, whoisServer, timeoutMs);
    if (rawWhois && !rawWhois.toLowerCase().includes('rate limit exceeded')) {
      const parsed = parseWhoisText(rawWhois, cleanDomain);
      if (parsed.status === 'FOUND' && parsed.registeredOn) {
        return parsed;
      }

      // Channel 2.1: Follow Registrar Referral WHOIS server if present
      const referralServerMatch = rawWhois.match(/Registrar WHOIS Server:\s*([^\s\r\n]+)/i);
      if (referralServerMatch && referralServerMatch[1]) {
        const refServer = referralServerMatch[1].trim();
        if (refServer && refServer !== whoisServer) {
          const refWhois = await queryWhoisSocket(cleanDomain, refServer, timeoutMs);
          if (refWhois) {
            const parsedRef = parseWhoisText(refWhois, cleanDomain);
            if (parsedRef.status === 'FOUND' && parsedRef.registeredOn) {
              return parsedRef;
            }
          }
        }
      }
    }
  } catch {
    // Continue to Channel 3
  }

  // Channel 3: IANA / Public RDAP fallback
  try {
    const ianaUrl = `https://rdap.iana.org/domain/${encodeURIComponent(cleanDomain)}`;
    const ianaData = await fetchJsonWithTimeout(ianaUrl, timeoutMs);
    if (ianaData && !ianaData.errorCode) {
      const parsed = parseRdapResponse(ianaData, cleanDomain);
      if (parsed.status === 'FOUND' && parsed.registeredOn) {
        return parsed;
      }
    }
  } catch {}

  return {
    status: 'NOT_FOUND',
    registeredOn: null,
    updatedOn: null,
    expiresOn: null,
    registrar: null,
    domainStatus: [],
    nameservers: [],
    rawSummary: 'Registration record could not be retrieved from registry',
    source: 'none',
    checkedAt: new Date().toISOString()
  };
}

function extractTld(domain: string): string {
  const parts = domain.split('.');
  if (parts.length >= 2) {
    return parts[parts.length - 1];
  }
  return '';
}

/**
 * Native TCP connection on port 43 to authoritative WHOIS servers
 */
function queryWhoisSocket(domain: string, server: string, timeoutMs: number): Promise<string | null> {
  return new Promise((resolve) => {
    let resolved = false;
    const socket = net.connect(43, server, () => {
      socket.write(`${domain}\r\n`);
    });

    let buffer = '';

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (buffer.length > 100000) {
        socket.destroy();
      }
    });

    const finish = (result: string | null) => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(result);
      }
    };

    socket.on('end', () => finish(buffer));
    socket.on('error', () => finish(null));
    socket.on('timeout', () => finish(null));
    socket.setTimeout(timeoutMs);
  });
}

/**
 * Text parser for standard RFC WHOIS responses across Verisign, Nominet, PIR, Denic, etc.
 */
function parseWhoisText(raw: string, domain: string): WhoisResult {
  let registeredOn: string | null = null;
  let updatedOn: string | null = null;
  let expiresOn: string | null = null;
  let registrar: string | null = null;
  const domainStatus: string[] = [];
  const nameservers: string[] = [];

  const lines = raw.split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed || trimmed.startsWith('%') || trimmed.startsWith('#')) continue;

    // Registration / Creation Date
    if (!registeredOn) {
      const match = trimmed.match(
        /^(?:creation date|registration date|registered on|registered|created|domain created|entry created|domain name commencement date|domain registered|date de creation):\s*(.+)$/i
      );
      if (match) {
        registeredOn = formatDate(match[1]);
      }
    }

    // Updated Date
    if (!updatedOn) {
      const match = trimmed.match(
        /^(?:updated date|last updated|last-modified|modified date|changed|derniere modification):\s*(.+)$/i
      );
      if (match) {
        updatedOn = formatDate(match[1]);
      }
    }

    // Expiration Date
    if (!expiresOn) {
      const match = trimmed.match(
        /^(?:registry expiry date|expiration date|expiry date|registrar registration expiration date|free-date|expires|date d'expiration|renewal date):\s*(.+)$/i
      );
      if (match) {
        expiresOn = formatDate(match[1]);
      }
    }

    // Registrar (inline or next-line formatted)
    if (!registrar) {
      const match = trimmed.match(/^(?:registrar|registrar name|sponsoring registrar):\s*(.*)$/i);
      if (match) {
        let val = match[1].trim();
        if (!val && i + 1 < lines.length) {
          const next = lines[i + 1].trim();
          if (next && !next.toLowerCase().startsWith('url:')) {
            val = next;
          }
        }
        if (val) {
          registrar = val.replace(/\s*\[Tag\s*=[^\]]+\]/i, '').trim();
        }
      }
    }

    // Status
    const statusMatch = trimmed.match(/^(?:domain status|status|registration status):\s*(.+)$/i);
    if (statusMatch) {
      const s = statusMatch[1].trim();
      if (s && !domainStatus.includes(s)) {
        domainStatus.push(s);
      }
    }

    // Nameservers (inline or following indented lines)
    const nsHeader = trimmed.match(/^(?:name server|nameserver|nserver|name servers):\s*(.*)$/i);
    if (nsHeader) {
      const inlineNs = nsHeader[1].trim();
      if (inlineNs) {
        const cleanNs = inlineNs.split(/\s+/)[0].toLowerCase().replace(/\.$/, '');
        if (!nameservers.includes(cleanNs)) nameservers.push(cleanNs);
      } else {
        let j = i + 1;
        while (j < lines.length && (lines[j].startsWith(' ') || lines[j].startsWith('\t'))) {
          const subNs = lines[j].trim().split(/\s+/)[0].toLowerCase().replace(/\.$/, '');
          if (subNs && subNs.includes('.') && !subNs.includes(':') && !nameservers.includes(subNs)) {
            nameservers.push(subNs);
          }
          j++;
        }
      }
    }
  }

  const isFound = Boolean(registeredOn || expiresOn || registrar || nameservers.length > 0);

  return {
    status: isFound ? 'FOUND' : 'NOT_FOUND',
    registeredOn,
    updatedOn,
    expiresOn,
    registrar,
    domainStatus,
    nameservers,
    rawSummary: isFound
      ? `Registered: ${registeredOn || 'N/A'} | Registrar: ${registrar || 'N/A'}`
      : 'WHOIS record not matched',
    source: 'whois',
    checkedAt: new Date().toISOString()
  };
}

/**
 * JSON Fetch helper with redirects and headers
 */
function fetchJsonWithTimeout(urlStr: string, timeoutMs: number): Promise<any> {
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (val: any) => {
      if (!resolved) {
        resolved = true;
        resolve(val);
      }
    };

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlStr);
    } catch {
      return finish(null);
    }

    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.get(
      parsedUrl,
      {
        headers: {
          Accept: 'application/rdap+json, application/json',
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36 DomainInspector/2.0'
        },
        timeout: timeoutMs
      },
      (res) => {
        if ([301, 302, 307, 308].includes(res.statusCode || 0) && res.headers.location) {
          fetchJsonWithTimeout(res.headers.location, timeoutMs).then(finish);
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          try {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (raw.trim().startsWith('<')) {
              finish(null);
              return;
            }
            const data = JSON.parse(raw);
            finish(data);
          } catch {
            finish(null);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      finish(null);
    });

    req.on('error', () => {
      finish(null);
    });
  });
}

function parseRdapResponse(data: any, domain: string): WhoisResult {
  let registeredOn: string | null = null;
  let updatedOn: string | null = null;
  let expiresOn: string | null = null;

  if (Array.isArray(data.events)) {
    for (const evt of data.events) {
      const action = (evt.eventAction || '').toLowerCase().trim();
      const date = evt.eventDate;
      if (!date) continue;

      const formatted = formatDate(date);
      if (action === 'registration' || action === 'created' || action === 'transfer') {
        if (!registeredOn) registeredOn = formatted;
      } else if (action === 'last changed' || action === 'last update' || action === 'last updated' || action === 'updated') {
        if (!updatedOn) updatedOn = formatted;
      } else if (action === 'expiration' || action === 'expired' || action === 'registry expiration') {
        if (!expiresOn) expiresOn = formatted;
      }
    }
  }

  let registrar: string | null = null;
  if (Array.isArray(data.entities)) {
    for (const entity of data.entities) {
      if (Array.isArray(entity.roles) && entity.roles.includes('registrar')) {
        if (Array.isArray(entity.vcardArray) && Array.isArray(entity.vcardArray[1])) {
          for (const item of entity.vcardArray[1]) {
            if (item[0] === 'fn' && typeof item[3] === 'string') {
              registrar = item[3];
              break;
            }
          }
        }
        if (!registrar && entity.handle) {
          registrar = entity.handle;
        }
      }
    }
  }

  const domainStatus: string[] = Array.isArray(data.status) ? data.status : [];

  const nameservers: string[] = [];
  if (Array.isArray(data.nameservers)) {
    for (const ns of data.nameservers) {
      if (ns.ldhName) {
        nameservers.push(ns.ldhName.toLowerCase());
      }
    }
  }

  const isFound = Boolean(registeredOn || expiresOn || registrar || nameservers.length > 0);

  return {
    status: isFound ? 'FOUND' : 'NOT_FOUND',
    registeredOn,
    updatedOn,
    expiresOn,
    registrar,
    domainStatus,
    nameservers,
    rawSummary: isFound
      ? `Registered: ${registeredOn || 'N/A'} | Registrar: ${registrar || 'N/A'}`
      : 'RDAP response lacked standard registration dates',
    source: 'rdap',
    checkedAt: new Date().toISOString()
  };
}

/**
 * Normalizes varied date strings (ISO, DD-Mon-YYYY, YYYY/MM/DD) into YYYY-MM-DD
 */
function formatDate(raw: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();

  try {
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch {}

  const dmyMatch = trimmed.match(/^(\d{1,2})[-/ ]([a-z]{3})[-/ ](\d{4})/i);
  if (dmyMatch) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const day = dmyMatch[1].padStart(2, '0');
    const mon = months[dmyMatch[2].toLowerCase()] || '01';
    const year = dmyMatch[3];
    return `${year}-${mon}-${day}`;
  }

  return trimmed.split('T')[0].split(' ')[0];
}
