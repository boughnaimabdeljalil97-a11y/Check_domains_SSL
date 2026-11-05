import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';
import { HttpsProxyAgent } from 'https-proxy-agent';
import type { SpamhausResult } from './types.js';

interface SpamhausAuthCache {
  token: string;
  expires: number; // Unix timestamp in seconds
}

interface SpamhausRequestOptions {
  username?: string;
  password?: string;
  useProxy?: boolean;
  proxies?: string[];
  timeoutMs?: number;
  pacedDelayMs?: number;
}

class SpamhausService {
  private tokenCache: SpamhausAuthCache | null = null;
  private tokenPromise: Promise<string> | null = null;
  private currentProxyIndex = 0;
  private lastRequestTime = 0;
  private requestQueue: Promise<any> = Promise.resolve();

  // In-memory credential fallback from UI drawer
  private runtimeCredentials: { username?: string; password?: string } = {};

  public setRuntimeCredentials(username?: string, password?: string) {
    if (username) this.runtimeCredentials.username = username.trim();
    if (password) this.runtimeCredentials.password = password.trim();
    // If credentials change, invalidate token
    this.tokenCache = null;
  }

  public getEffectiveCredentials(opts?: { username?: string; password?: string }) {
    const username = opts?.username?.trim() || this.runtimeCredentials.username || process.env.SPAMHAUS_USERNAME || '';
    const password = opts?.password?.trim() || this.runtimeCredentials.password || process.env.SPAMHAUS_PASSWORD || '';
    return { username, password };
  }

  public hasCredentials(opts?: { username?: string; password?: string }): boolean {
    const { username, password } = this.getEffectiveCredentials(opts);
    return Boolean(username && password);
  }

  /**
  /**
   * Pacing queue: enforces default 1 request per second to avoid rl_qps=1 limits.
   * Releases the queue immediately on error or timeout so workers are never blocked.
   */
  public async schedulePaced<T>(fn: () => Promise<T>, delayMs: number = 1000, timeoutMs: number = 15000): Promise<T> {
    const run = async (): Promise<T> => {
      const now = Date.now();
      const elapsed = now - this.lastRequestTime;
      if (elapsed < delayMs) {
        await new Promise((r) => setTimeout(r, delayMs - elapsed));
      }
      this.lastRequestTime = Date.now();

      let timer: NodeJS.Timeout | null = null;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Spamhaus request exceeded hard timeout limit of ${timeoutMs}ms`));
        }, timeoutMs);
      });

      try {
        return await Promise.race([fn(), timeoutPromise]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    const resultPromise = this.requestQueue.then(run, run);
    // Always release queue on resolution or error so subsequent queued items are not blocked
    this.requestQueue = resultPromise.then(() => {}, () => {});
    return resultPromise;
  }

  /**
   * Authentication: POST https://api.spamhaus.org/api/v1/login
   * Valid ~24h. Refreshed ~10 min before expiration or once on 401.
   * NEVER logins per request.
   */
  public async getToken(opts: SpamhausRequestOptions = {}, forceRefresh: boolean = false): Promise<string> {
    const nowUnix = Math.floor(Date.now() / 1000);

    // Return cached token if valid and not expiring in next 600s (10 min)
    if (!forceRefresh && this.tokenCache && this.tokenCache.expires - nowUnix > 600) {
      return this.tokenCache.token;
    }

    // Coalesce in-flight login requests
    if (this.tokenPromise && !forceRefresh) {
      return this.tokenPromise;
    }

    this.tokenPromise = (async () => {
      const { username, password } = this.getEffectiveCredentials(opts);
      if (!username || !password) {
        throw new Error('Spamhaus credentials not configured (SPAMHAUS_USERNAME / SPAMHAUS_PASSWORD)');
      }

      const loginBody = JSON.stringify({
        username,
        password,
        realm: 'intel'
      });

      const res = await this.executeHttpRequest(
        'https://api.spamhaus.org/api/v1/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          body: loginBody,
          timeoutMs: opts.timeoutMs || 15000,
          useProxy: opts.useProxy,
          proxies: opts.proxies
        }
      );

      if (res.statusCode === 401 || res.statusCode === 403) {
        throw new Error('Agreement not signed or invalid credentials');
      }

      if (res.statusCode !== 200) {
        let errMsg = `Spamhaus login failed (HTTP ${res.statusCode})`;
        try {
          const parsed = JSON.parse(res.body);
          if (parsed.message) errMsg += `: ${parsed.message}`;
          else if (parsed.error) errMsg += `: ${parsed.error}`;
        } catch {}
        throw new Error(errMsg);
      }

      const data = JSON.parse(res.body);
      if (!data.token) {
        throw new Error('Spamhaus login response did not contain an auth token');
      }

      const expires = typeof data.expires === 'number' ? data.expires : nowUnix + 23 * 3600;
      this.tokenCache = {
        token: data.token,
        expires
      };

      return data.token;
    })().finally(() => {
      this.tokenPromise = null;
    });

    return this.tokenPromise;
  }

  /**
   * Main domain inspection
   * GET https://api.spamhaus.org/api/intel/v2/byobject/domain/{DOMAIN}
   */
  public async checkDomain(domain: string, options: SpamhausRequestOptions = {}): Promise<SpamhausResult> {
    const { username, password } = this.getEffectiveCredentials(options);
    if (!username || !password) {
      return {
        status: 'skipped',
        tags: '',
        clusters: '',
        clusterAuthId: null,
        clusterInfraId: null,
        error: 'Spamhaus credentials not configured',
        checkedAt: new Date().toISOString()
      };
    }

    const apex = getApexDomain(domain);
    const delayMs = options.pacedDelayMs || 1000;
    const timeoutMs = options.timeoutMs || 15000;

    return this.schedulePaced(async () => {
      const max429Attempts = 3;
      let attempt429 = 0;
      let tokenRefreshedOnce = false;

      while (true) {
        try {
          const token = await this.getToken(options);
          const url = `https://api.spamhaus.org/api/intel/v2/byobject/domain/${encodeURIComponent(apex)}`;

          const res = await this.executeHttpRequest(url, {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/json'
            },
            timeoutMs,
            useProxy: options.useProxy,
            proxies: options.proxies
          });

          // 1. Handle 404 (domain unknown to Spamhaus) -> Not an error!
          if (res.statusCode === 404) {
            return {
              status: 'not found',
              tags: '',
              clusters: 'NO',
              clusterAuthId: null,
              clusterInfraId: null,
              abused: false,
              score: null,
              domain: apex,
              checkedAt: new Date().toISOString()
            };
          }

          // 2. Handle 403 -> Agreement not signed or forbidden -> fail fast, no retries
          if (res.statusCode === 403) {
            return {
              status: 'error',
              tags: '',
              clusters: 'NO',
              clusterAuthId: null,
              clusterInfraId: null,
              domain: apex,
              error: 'Agreement not signed or invalid credentials',
              checkedAt: new Date().toISOString()
            };
          }

          // 3. Handle 401 (token expired or invalid) -> refresh once & retry
          if (res.statusCode === 401) {
            if (!tokenRefreshedOnce) {
              tokenRefreshedOnce = true;
              this.tokenCache = null;
              try {
                await this.getToken(options, true);
                continue; // retry with fresh token
              } catch (refreshErr: any) {
                return {
                  status: 'error',
                  tags: '',
                  clusters: 'NO',
                  clusterAuthId: null,
                  clusterInfraId: null,
                  domain: apex,
                  error: 'Agreement not signed or invalid credentials',
                  checkedAt: new Date().toISOString()
                };
              }
            }
            // 401 after one token refresh -> fail fast
            return {
              status: 'error',
              tags: '',
              clusters: 'NO',
              clusterAuthId: null,
              clusterInfraId: null,
              domain: apex,
              error: 'Agreement not signed or invalid credentials',
              checkedAt: new Date().toISOString()
            };
          }

          // 4. Handle 429 (rate limited) -> backoff up to 3 times
          if (res.statusCode === 429) {
            attempt429++;
            if (attempt429 <= max429Attempts) {
              const backoffMs = attempt429 * 1500;
              await new Promise((r) => setTimeout(r, backoffMs));
              continue;
            }
            return {
              status: 'rate limited',
              tags: '',
              clusters: 'NO',
              clusterAuthId: null,
              clusterInfraId: null,
              domain: apex,
              error: 'Spamhaus API rate limit exceeded (HTTP 429)',
              checkedAt: new Date().toISOString()
            };
          }

          // 5. Handle non-200 responses
          if (res.statusCode !== 200) {
            let errorMsg = `HTTP ${res.statusCode}`;
            try {
              const errObj = JSON.parse(res.body);
              if (errObj.message) errorMsg += `: ${errObj.message}`;
            } catch {}
            return {
              status: 'error',
              tags: '',
              clusters: 'NO',
              clusterAuthId: null,
              clusterInfraId: null,
              domain: apex,
              error: `Spamhaus lookup failed (${errorMsg})`,
              checkedAt: new Date().toISOString()
            };
          }

          // 5. Successful parse (200 OK)
          const data = JSON.parse(res.body);

          // Extraction rules:
          // tags: array has items -> join with ", "; if missing/empty -> ""
          let tags = '';
          if (Array.isArray(data.tags) && data.tags.length > 0) {
            tags = data.tags.join(', ');
          }

          // clusters:
          // has auth and infra -> "auth, infra"
          // only auth -> "auth"
          // only infra -> "infra"
          // none/empty -> "NO"
          const clusterAuth = data.clusters?.auth || null;
          const clusterInfra = data.clusters?.infra || null;

          let clusters = 'NO';
          if (clusterAuth && clusterInfra) {
            clusters = 'auth, infra';
          } else if (clusterAuth) {
            clusters = 'auth';
          } else if (clusterInfra) {
            clusters = 'infra';
          }

          return {
            status: 'done',
            tags,
            clusters,
            clusterAuthId: clusterAuth,
            clusterInfraId: clusterInfra,
            abused: Boolean(data.abused),
            score: typeof data.score === 'number' ? data.score : null,
            rawJson: data,
            checkedAt: new Date().toISOString()
          };
        } catch (err: any) {
          return {
            status: 'error',
            tags: '',
            clusters: 'NO',
            clusterAuthId: null,
            clusterInfraId: null,
            error: err?.message || 'Spamhaus check exception',
            checkedAt: new Date().toISOString()
          };
        }
      }
    }, delayMs);
  }

  /**
   * Connection tester for config drawer
   * POST /api/spamhaus/test -> login + GET /api/intel/v1/limits
   */
  public async testConnection(
    credentials?: { username?: string; password?: string },
    proxies?: string[],
    useProxy?: boolean
  ): Promise<{ success: boolean; message: string; limits?: any }> {
    try {
      const opts: SpamhausRequestOptions = {
        username: credentials?.username,
        password: credentials?.password,
        proxies,
        useProxy
      };

      const token = await this.getToken(opts, true);
      const limitsRes = await this.executeHttpRequest('https://api.spamhaus.org/api/intel/v1/limits', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json'
        },
        timeoutMs: 15000,
        proxies,
        useProxy
      });

      if (limitsRes.statusCode === 401 || limitsRes.statusCode === 403) {
        return {
          success: false,
          message: 'Agreement not signed or invalid credentials'
        };
      }

      let limits: any = null;
      if (limitsRes.statusCode === 200) {
        try {
          limits = JSON.parse(limitsRes.body);
        } catch {}
      }

      return {
        success: true,
        message: 'Successfully authenticated with Spamhaus Intelligence API!',
        limits
      };
    } catch (err: any) {
      const msg = err?.message || 'Failed connecting to Spamhaus';
      const isAuthError = msg.includes('Agreement not signed') || msg.includes('401') || msg.includes('403');
      return {
        success: false,
        message: isAuthError ? 'Agreement not signed or invalid credentials' : msg
      };
    }
  }

  /**
   * HTTP request execution with optional proxy rotation & automatic fallback
   */
  private async executeHttpRequest(
    urlStr: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeoutMs?: number;
      useProxy?: boolean;
      proxies?: string[];
    }
  ): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
    const rawProxies = options.proxies || [];
    const activeProxies = rawProxies
      .map((p) => p.trim())
      .filter((p) => p.length > 0 && (p.startsWith('http://') || p.startsWith('https://')));

    const shouldAttemptProxy = Boolean(options.useProxy && activeProxies.length > 0);

    if (!shouldAttemptProxy) {
      return this.singleRequest(urlStr, options, null);
    }

    // Try rotating through active proxies starting at current round-robin index
    const startIndex = this.currentProxyIndex % activeProxies.length;
    this.currentProxyIndex = (this.currentProxyIndex + 1) % activeProxies.length;

    let lastError: any = null;

    for (let i = 0; i < activeProxies.length; i++) {
      const proxyUrl = activeProxies[(startIndex + i) % activeProxies.length];
      try {
        const agent = new HttpsProxyAgent(proxyUrl);
        return await this.singleRequest(urlStr, options, agent);
      } catch (err: any) {
        lastError = err;
        // Proxy failed (timeout, network error, 407, etc.), try next proxy
        console.warn(`[Spamhaus] Proxy attempt failed for ${proxyUrl.replace(/:\/\/.*@/, '://***@')}: ${err.message}. Trying next proxy...`);
      }
    }

    // All proxies failed: fallback to direct request and log
    console.warn('[Spamhaus] All configured proxies failed. Falling back to direct request.');
    try {
      return await this.singleRequest(urlStr, options, null);
    } catch (directErr: any) {
      throw new Error(`Proxy attempts failed (${lastError?.message || 'proxy error'}) and direct connection failed (${directErr.message})`);
    }
  }

  private singleRequest(
    urlStr: string,
    options: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeoutMs?: number;
    },
    agent: any | null
  ): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(urlStr);
      const isHttps = parsedUrl.protocol === 'https:';
      const client = isHttps ? https : http;

      const timeoutMs = options.timeoutMs || 15000;
      const abortController = new AbortController();
      let isSettled = false;

      const timer = setTimeout(() => {
        if (!isSettled) {
          isSettled = true;
          try {
            abortController.abort(new Error(`Spamhaus HTTP request timed out after ${timeoutMs}ms`));
          } catch {}
          reject(new Error(`Spamhaus HTTP request timed out after ${timeoutMs}ms`));
        }
      }, timeoutMs);

      const cleanup = () => {
        isSettled = true;
        clearTimeout(timer);
      };

      const headers: Record<string, string> = {
        'User-Agent': 'DomainInspector/2.0 (Spamhaus-Intel-Client)',
        ...(options.headers || {})
      };

      const reqOptions: https.RequestOptions = {
        method: options.method || 'GET',
        headers,
        signal: abortController.signal,
        timeout: timeoutMs
      };

      if (agent) {
        reqOptions.agent = agent;
      }

      let req: http.ClientRequest;
      try {
        req = client.request(parsedUrl, reqOptions, (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            cleanup();
            const body = Buffer.concat(chunks).toString('utf8');
            const respHeaders: Record<string, string> = {};
            for (const [k, v] of Object.entries(res.headers)) {
              if (typeof v === 'string') respHeaders[k.toLowerCase()] = v;
              else if (Array.isArray(v)) respHeaders[k.toLowerCase()] = v.join(', ');
            }
            resolve({
              statusCode: res.statusCode || 0,
              headers: respHeaders,
              body
            });
          });

          res.on('error', (resErr) => {
            cleanup();
            reject(resErr);
          });
        });
      } catch (err) {
        cleanup();
        return reject(err);
      }

      req.on('timeout', () => {
        try {
          req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
        } catch {}
      });

      req.on('error', (err) => {
        cleanup();
        reject(err);
      });

      if (options.body) {
        req.write(options.body);
      }

      req.end();
    });
  }
}

/**
 * Extracts apex domain, supporting standard multi-part country code TLDs
 * e.g. "sub.example.com" -> "example.com"
 * "test.co.uk" -> "test.co.uk"
 * "sub.test.co.uk" -> "test.co.uk"
 */
export function getApexDomain(domain: string): string {
  if (!domain) return '';
  const clean = domain.toLowerCase().trim().replace(/^\.+|\.+$/g, '');
  const parts = clean.split('.');
  if (parts.length <= 2) return clean;

  const tld = parts[parts.length - 1];
  const secondToLast = parts[parts.length - 2];

  // Common second-level domains for 2-letter ccTLDs
  const commonSecondLevels = new Set([
    'co', 'com', 'org', 'net', 'edu', 'gov', 'ac', 'nom', 'me', 'ne', 'or'
  ]);

  if (parts.length >= 3 && tld.length === 2 && commonSecondLevels.has(secondToLast)) {
    return parts.slice(-3).join('.');
  }

  return parts.slice(-2).join('.');
}

export const spamhausChecker = new SpamhausService();
