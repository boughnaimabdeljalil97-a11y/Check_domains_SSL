import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns/promises';
import { URL } from 'node:url';
import type { WebsiteResult } from './types.js';

interface WebsiteCheckOptions {
  timeoutMs?: number;
}

interface FetchResult {
  statusCode: number;
  finalUrl: string;
  body: string;
  headers: Record<string, string>;
  redirects: string[];
  loadTimeMs: number;
}

// ============================================================================
// WEBSITE CONTENT CLASSIFICATION CONSTANTS & ORDERED DETECTION PATTERNS
// ============================================================================
export const MIN_VALID_BODY_BYTES = 500;

export const SUSPICIOUS_TITLE_TERMS = [
  '404',
  'error',
  'not found',
  'page cannot',
  'parked',
  'coming soon',
  'under construction',
  'just another wordpress site'
] as const;

export const ERROR_KEYWORD_PATTERNS = [
  '404',
  'page cannot be found',
  'page not found',
  'not found',
  'sorry! that page',
  'sorry, the page',
  'no brand config for domain',
  'system error',
  'error 404',
  'error page',
  "this page doesn't exist",
  'this page does not exist',
  'the page you requested',
  'domain expired',
  'domain parked',
  'parked page',
  'parked domain',
  'coming soon',
  'under construction',
  'buy this domain',
  'domain for sale',
  'hostgator',
  'godaddy parked',
  'sedoparking',
  'bodis',
  'above.com parked'
] as const;

// Additional expired/parking phrases & hostnames checked alongside the core list
export const EXTRA_EXPIRED_PARKING_PHRASES = [
  'domain registration has expired',
  'this domain has expired',
  'renew this domain'
] as const;

export const RAW_HTML_PARKING_PROVIDERS = [
  'hostgator',
  'godaddy parked',
  'sedoparking',
  'bodis',
  'above.com parked',
  'no brand config for domain',
  'parkingpage.namecheap.com'
] as const;

export const KNOWN_PARKING_HOST_PATTERNS = [
  'sedoparking',
  'sedo.com',
  'dan.com',
  'afternic',
  'hugedomains',
  'bodis',
  'parkingcrew',
  'godaddy',
  'parkingpage.namecheap.com',
  'above.com',
  'squadhelp',
  'atom.com'
] as const;

export type WebsiteDetectionMethod =
  | 'ok'
  | 'http_error'
  | 'empty_body'
  | 'error_keyword'
  | 'suspicious_title'
  | 'title_mismatch';

export interface PageClassification {
  score: number;
  matchedRules: string[];
  status: 'YES' | 'NO' | 'UNKNOWN';
  reason: string;
  visibleTextSnippet: string;
  detectedExclusionType: 'none' | '404_not_found' | 'namecheap_expired' | 'bot_challenge' | 'other';
  detectionMethod: WebsiteDetectionMethod;
}

/**
 * Decodes common HTML entities to plain characters.
 */
function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(parseInt(dec, 10));
      } catch {
        return '';
      }
    });
}

/**
 * Extracts normalized <title>, <h1>/<h2> headings, canonical/og:url links, and visible body text.
 */
function parsePageContent(html: string): {
  title: string;
  headingsText: string;
  metaDescription: string;
  canonicalUrl: string;
  visibleText: string;
} {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch
    ? decodeHtmlEntities(titleMatch[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim()
    : '';

  const metaMatch =
    html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  const metaDescription = metaMatch ? decodeHtmlEntities(metaMatch[1]).replace(/\s+/g, ' ').trim() : '';

  const canonicalMatch =
    html.match(/<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["']/i) ||
    html.match(/<link[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i) ||
    html.match(/<meta[^>]*property=["']og:url["'][^>]*content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*property=["']og:url["']/i);
  const canonicalUrl = canonicalMatch ? canonicalMatch[1].trim() : '';

  const headings: string[] = [];
  const headingMatches = html.matchAll(/<h[12][^>]*>([\s\S]*?)<\/h[12]>/gi);
  for (const m of headingMatches) {
    const text = decodeHtmlEntities(m[1].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (text) headings.push(text);
  }
  const headingsText = headings.join(' ');

  // Strip <script>, <style>, and HTML comments before extracting visible text
  const stripped = html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');
  const rawText = decodeHtmlEntities(stripped.replace(/<[^>]+>/g, ' '));
  const visibleText = rawText.replace(/\s+/g, ' ').trim();

  return {
    title,
    headingsText,
    metaDescription,
    canonicalUrl,
    visibleText
  };
}

function getHostnameBase(host: string): string {
  const clean = host.toLowerCase().replace(/^www\./, '').trim();
  const parts = clean.split('.');
  return parts[0] || clean;
}

function isSameSiteDomain(hostA: string, hostB: string): boolean {
  const a = hostA.toLowerCase().replace(/^www\./, '').trim();
  const b = hostB.toLowerCase().replace(/^www\./, '').trim();
  if (!a || !b) return true;
  if (a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`)) return true;
  // Treat identical second-level domain label (e.g. example.co.uk vs example.com) as same brand
  const baseA = getHostnameBase(a);
  const baseB = getHostnameBase(b);
  return Boolean(baseA && baseB && baseA === baseB);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchKeywordInText(textLower: string, keyword: string): boolean {
  if (keyword === '404') {
    return /\b404\b/.test(textLower);
  }
  if (keyword === 'not found') {
    return /\bnot found\b/.test(textLower);
  }
  if (keyword === 'error') {
    return /\berror\b/.test(textLower);
  }
  return textLower.includes(keyword);
}

/**
 * Deterministic ordered check pipeline:
 * 1. status_code
 * 2. empty_body (< 500 chars)
 * 3. title checks (suspicious_title -> title_mismatch)
 * 4. error_keyword
 * First match wins.
 */
export function classifyWebsiteContent(
  html: string,
  statusCode: number,
  finalUrl: string,
  headers: Record<string, string> = {},
  queriedDomain?: string
): PageClassification {
  const rawTitle = extractTitle(html);
  const parsed = parsePageContent(html);
  const title = parsed.title || rawTitle;
  const visibleTextSnippet = parsed.visibleText.slice(0, 300);

  // Preserve Bot Protection / Cloudflare Challenge / CAPTCHA as UNKNOWN
  const isBotChallenge = detectBotProtectionChallenge(html, statusCode, title, headers);
  if (isBotChallenge) {
    return {
      score: 0,
      matchedRules: ['bot_challenge'],
      status: 'UNKNOWN',
      reason: `Bot verification / Cloudflare challenge encountered (${statusCode || 403}): Unable to verify website automatically`,
      visibleTextSnippet: visibleTextSnippet || html.slice(0, 300).replace(/\s+/g, ' ').trim(),
      detectedExclusionType: 'bot_challenge',
      detectionMethod: 'http_error'
    };
  }

  // --------------------------------------------------------------------------
  // STEP 1: HTTP STATUS CODE CHECK
  // --------------------------------------------------------------------------
  if (statusCode === 0) {
    return {
      score: 3,
      matchedRules: ['http_error: HTTP 0'],
      status: 'NO',
      reason: 'HTTP 0 - no response',
      visibleTextSnippet,
      detectedExclusionType: 'other',
      detectionMethod: 'http_error'
    };
  }

  if (statusCode >= 400) {
    return {
      score: 3,
      matchedRules: [`http_error: HTTP ${statusCode}`],
      status: 'NO',
      reason: `HTTP ${statusCode} response`,
      visibleTextSnippet,
      detectedExclusionType: statusCode === 404 ? '404_not_found' : 'other',
      detectionMethod: 'http_error'
    };
  }

  // --------------------------------------------------------------------------
  // STEP 2: EMPTY / TINY BODY CHECK (< 500 chars)
  // --------------------------------------------------------------------------
  if (html.length < MIN_VALID_BODY_BYTES) {
    return {
      score: 3,
      matchedRules: [`empty_body: ${html.length} bytes`],
      status: 'NO',
      reason: `Empty or stub response (only ${html.length} bytes)`,
      visibleTextSnippet,
      detectedExclusionType: 'other',
      detectionMethod: 'empty_body'
    };
  }

  // --------------------------------------------------------------------------
  // STEP 3: TITLE CHECKS (SUSPICIOUS TITLE & TITLE-DOMAIN MISMATCH)
  // --------------------------------------------------------------------------
  const titleLower = title.toLowerCase();

  for (const term of SUSPICIOUS_TITLE_TERMS) {
    const matched =
      term === '404' || term === 'error'
        ? new RegExp(`\\b${escapeRegex(term)}\\b`, 'i').test(titleLower)
        : titleLower.includes(term);

    if (matched) {
      const is404Term = term === '404' || term === 'not found' || term === 'page cannot';
      return {
        score: 3,
        matchedRules: [`suspicious_title: ${term}`],
        status: 'NO',
        reason: `Suspicious title: '${title}'`,
        visibleTextSnippet,
        detectedExclusionType: is404Term ? '404_not_found' : 'other',
        detectionMethod: 'suspicious_title'
      };
    }
  }

  // 3b. Title-domain / canonical mismatch
  const targetDomain = (queriedDomain || '').toLowerCase().trim();
  let finalHost = '';
  try {
    finalHost = new URL(finalUrl).hostname.toLowerCase();
  } catch {
    finalHost = '';
  }

  // Check if final URL redirected to a known parking host
  if (finalHost && KNOWN_PARKING_HOST_PATTERNS.some((p) => finalHost.includes(p))) {
    return {
      score: 3,
      matchedRules: [`title_mismatch: parked host ${finalHost}`],
      status: 'NO',
      reason: `Title references a different site (${title || finalHost}) — likely a parked / templated 404 page`,
      visibleTextSnippet,
      detectedExclusionType: 'other',
      detectionMethod: 'title_mismatch'
    };
  }

  if (targetDomain) {
    const targetBase = getHostnameBase(targetDomain);
    const titleMentionsTarget = targetBase.length >= 3 && titleLower.includes(targetBase);

    // Check if <title> itself explicitly contains a different domain-looking string (e.g. foo.com / bar.net)
    const domainInTitleMatch = titleLower.match(
      /\b([a-z0-9][a-z0-9-]{1,61}\.(?:com|net|org|io|co|us|uk|ca|de|fr|info|biz|ai|app|dev|xyz|online|site|shop|store|club|travel|fishing)(?:\.[a-z]{2})?)\b/i
    );
    if (domainInTitleMatch && !isSameSiteDomain(domainInTitleMatch[1], targetDomain)) {
      return {
        score: 3,
        matchedRules: [`title_mismatch: title domain ${domainInTitleMatch[1]}`],
        status: 'NO',
        reason: `Title references a different site (${title}) — likely a parked / templated 404 page`,
        visibleTextSnippet,
        detectedExclusionType: 'other',
        detectionMethod: 'title_mismatch'
      };
    }

    // Check canonical / og:url mismatch against queried domain
    let canonicalHost = '';
    if (parsed.canonicalUrl) {
      try {
        canonicalHost = new URL(parsed.canonicalUrl, finalUrl).hostname.toLowerCase();
      } catch {
        canonicalHost = '';
      }
    }

    if (canonicalHost && !isSameSiteDomain(canonicalHost, targetDomain) && !titleMentionsTarget) {
      return {
        score: 3,
        matchedRules: [`title_mismatch: canonical ${canonicalHost} != ${targetDomain}`],
        status: 'NO',
        reason: `Title references a different site (${title || canonicalHost}) — likely a parked / templated 404 page`,
        visibleTextSnippet,
        detectedExclusionType: 'other',
        detectionMethod: 'title_mismatch'
      };
    }

    // Check cross-domain redirect mismatch when final host is a totally different domain and title doesn't mention queried site
    if (finalHost && !isSameSiteDomain(finalHost, targetDomain) && !titleMentionsTarget && title.length > 0) {
      return {
        score: 3,
        matchedRules: [`title_mismatch: redirected to ${finalHost} != ${targetDomain}`],
        status: 'NO',
        reason: `Title references a different site (${title}) — likely a parked / templated 404 page`,
        visibleTextSnippet,
        detectedExclusionType: 'other',
        detectionMethod: 'title_mismatch'
      };
    }
  }

  // --------------------------------------------------------------------------
  // STEP 4: ERROR-KEYWORD DETECTION IN BODY / HEADINGS / TITLE
  // --------------------------------------------------------------------------
  const combinedSearchableText = `${title} ${parsed.headingsText} ${parsed.metaDescription} ${parsed.visibleText}`
    .replace(/\s+/g, ' ')
    .toLowerCase();
  const normalizedRawHtml = html.replace(/\s+/g, ' ').toLowerCase();

  for (const keyword of ERROR_KEYWORD_PATTERNS) {
    const matchedVisible = matchKeywordInText(combinedSearchableText, keyword);
    const matchedRawProvider =
      (RAW_HTML_PARKING_PROVIDERS as readonly string[]).includes(keyword) &&
      normalizedRawHtml.includes(keyword);

    if (matchedVisible || matchedRawProvider) {
      const is404 =
        keyword === '404' ||
        keyword.includes('not found') ||
        keyword.includes('cannot be found') ||
        keyword.includes('sorry') ||
        keyword.includes('error') ||
        keyword.includes("doesn't exist") ||
        keyword.includes('does not exist') ||
        keyword.includes('page you requested') ||
        keyword.includes('no brand config');

      return {
        score: 3,
        matchedRules: [`error_keyword: ${keyword}`],
        status: 'NO',
        reason: `404/error page detected (matched '${keyword}')`,
        visibleTextSnippet,
        detectedExclusionType: is404 ? '404_not_found' : 'other',
        detectionMethod: 'error_keyword'
      };
    }
  }

  // Also detect Namecheap / registrar domain-expiration phrases (e.g. "Domain registration has expired")
  for (const phrase of EXTRA_EXPIRED_PARKING_PHRASES) {
    if (combinedSearchableText.includes(phrase) || normalizedRawHtml.includes(phrase)) {
      const isNamecheap = normalizedRawHtml.includes('namecheap');
      return {
        score: 3,
        matchedRules: [`error_keyword: ${phrase}`],
        status: 'NO',
        reason: `404/error page detected (matched '${phrase}')`,
        visibleTextSnippet,
        detectedExclusionType: isNamecheap ? 'namecheap_expired' : 'other',
        detectionMethod: 'error_keyword'
      };
    }
  }

  // Also check raw HTML for Namecheap parking lander marker
  if (normalizedRawHtml.includes('parkingpage.namecheap.com') || (normalizedRawHtml.includes('namecheap') && normalizedRawHtml.includes('utm_source=parkingpage'))) {
    return {
      score: 3,
      matchedRules: ['error_keyword: namecheap parking'],
      status: 'NO',
      reason: "404/error page detected (matched 'namecheap parking')",
      visibleTextSnippet,
      detectedExclusionType: 'namecheap_expired',
      detectionMethod: 'error_keyword'
    };
  }

  // --------------------------------------------------------------------------
  // STEP 5: ALL CHECKS PASSED -> STATUS "YES"
  // --------------------------------------------------------------------------
  return {
    score: 0,
    matchedRules: ['ok'],
    status: 'YES',
    reason: `Active website loaded successfully (HTTP ${statusCode}, ${html.length} bytes)`,
    visibleTextSnippet,
    detectedExclusionType: 'none',
    detectionMethod: 'ok'
  };
}

/**
 * Checks website availability independently from SSL results.
 * Attempts HTTPS first, falls back to HTTP if HTTPS fails or has SSL errors.
 * Runs ordered body/title/status checks on the final response after redirects.
 */
export async function checkDomainWebsite(
  domain: string,
  options: WebsiteCheckOptions = {}
): Promise<WebsiteResult> {
  const timeoutMs = options.timeoutMs || 30000;
  const cleanDomain = domain.toLowerCase().trim();

  const startTime = Date.now();

  // Pre-check DNS resolution to identify permanent non-existent domains early
  try {
    const addresses = await dns.lookup(cleanDomain, { all: true });
    if (!addresses || addresses.length === 0) {
      return {
        status: 'NO',
        available: false,
        reason: 'Confirmed permanent DNS resolution failure: Domain does not resolve (NXDOMAIN)',
        statusCode: null,
        finalUrl: `http://${cleanDomain}`,
        title: '',
        redirects: [],
        loadTimeMs: Date.now() - startTime,
        detectedExclusionType: 'dns_permanent_fail',
        detectionMethod: 'http_error',
        checkedAt: new Date().toISOString()
      };
    }
  } catch (dnsErr: any) {
    if (dnsErr.code === 'ENOTFOUND' || dnsErr.code === 'ENODATA' || dnsErr.code === 'NXDOMAIN') {
      return {
        status: 'NO',
        available: false,
        reason: `Confirmed permanent DNS resolution failure (${dnsErr.code}): Domain does not exist`,
        statusCode: null,
        finalUrl: `http://${cleanDomain}`,
        title: '',
        redirects: [],
        loadTimeMs: Date.now() - startTime,
        detectedExclusionType: 'dns_permanent_fail',
        detectionMethod: 'http_error',
        checkedAt: new Date().toISOString()
      };
    }
  }

  // 1. Attempt HTTPS first
  let fetchRes: FetchResult | null = null;
  let httpsError: string | null = null;

  try {
    fetchRes = await fetchWithRedirects(`https://${cleanDomain}`, timeoutMs);
  } catch (err: any) {
    httpsError = err?.message || 'HTTPS connection failed';
  }

  let classification: PageClassification | null = null;
  if (fetchRes) {
    classification = classifyWebsiteContent(
      fetchRes.body,
      fetchRes.statusCode,
      fetchRes.finalUrl,
      fetchRes.headers,
      cleanDomain
    );
  }

  // If HTTPS failed, returned 0 or 5xx, attempt plain HTTP fallback
  if (!fetchRes || fetchRes.statusCode >= 500 || fetchRes.statusCode === 0) {
    try {
      const httpRes = await fetchWithRedirects(`http://${cleanDomain}`, timeoutMs);
      if (httpRes && httpRes.statusCode > 0) {
        const httpClassification = classifyWebsiteContent(
          httpRes.body,
          httpRes.statusCode,
          httpRes.finalUrl,
          httpRes.headers,
          cleanDomain
        );
        fetchRes = httpRes;
        classification = httpClassification;
      }
    } catch (httpErr: any) {
      if (!fetchRes) {
        return {
          status: 'NO',
          available: false,
          reason: `Website unreachable on both HTTPS (${httpsError || 'failed'}) and HTTP (${httpErr?.message || 'failed'})`,
          statusCode: null,
          finalUrl: `http://${cleanDomain}`,
          title: '',
          redirects: [],
          loadTimeMs: Date.now() - startTime,
          detectedExclusionType: 'other',
          detectionMethod: 'http_error',
          checkedAt: new Date().toISOString()
        };
      }
    }
  }

  if (!fetchRes) {
    return {
      status: 'NO',
      available: false,
      reason: 'HTTP 0 - no response',
      statusCode: 0,
      finalUrl: `http://${cleanDomain}`,
      title: '',
      redirects: [],
      loadTimeMs: Date.now() - startTime,
      detectedExclusionType: 'other',
      detectionMethod: 'http_error',
      checkedAt: new Date().toISOString()
    };
  }

  const { statusCode, finalUrl, body, redirects, loadTimeMs, headers } = fetchRes;
  const title = extractTitle(body);

  if (!classification) {
    classification = classifyWebsiteContent(body, statusCode, finalUrl, headers, cleanDomain);
  }

  console.log(
    `[WebsiteChecker] [${cleanDomain}] Final URL: ${finalUrl} | Status: ${classification.status} | Method: ${classification.detectionMethod} | HTTP: ${statusCode} | Bytes: ${body.length}`
  );

  return {
    status: classification.status,
    available: classification.status === 'YES',
    reason: classification.reason,
    statusCode,
    finalUrl,
    title: title || (classification.status === 'YES' ? cleanDomain : ''),
    redirects,
    loadTimeMs,
    detectedExclusionType: classification.detectedExclusionType,
    detectionMethod: classification.detectionMethod,
    websiteScore: classification.score,
    websiteBodySnippet: classification.visibleTextSnippet,
    checkedAt: new Date().toISOString()
  };
}

/**
 * Follows HTTP/HTTPS redirects up to maxRedirects using native node:http / node:https.
 * Allows insecure TLS during website content check so that invalid certs don't hide working websites!
 */
async function fetchWithRedirects(
  initialUrl: string,
  timeoutMs: number,
  maxRedirects: number = 8
): Promise<FetchResult> {
  const redirects: string[] = [];
  let currentUrl = initialUrl;
  const startTime = Date.now();

  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await singleRequest(currentUrl, timeoutMs);
    const code = res.statusCode;

    // Follow 301, 302, 303, 307, 308 redirects
    if ([301, 302, 303, 307, 308].includes(code) && res.headers['location']) {
      redirects.push(currentUrl);
      const nextLocation = res.headers['location'];
      try {
        currentUrl = new URL(nextLocation, currentUrl).toString();
      } catch {
        // Invalid redirect URL, stop here
        return {
          statusCode: code,
          finalUrl: currentUrl,
          body: res.body,
          headers: res.headers,
          redirects,
          loadTimeMs: Date.now() - startTime
        };
      }
      continue;
    }

    return {
      statusCode: code,
      finalUrl: currentUrl,
      body: res.body,
      headers: res.headers,
      redirects,
      loadTimeMs: Date.now() - startTime
    };
  }

  throw new Error(`Exceeded maximum redirect limit of ${maxRedirects}`);
}

function singleRequest(
  urlStr: string,
  timeoutMs: number
): Promise<{ statusCode: number; headers: Record<string, string>; body: string }> {
  return new Promise((resolve, reject) => {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(urlStr);
    } catch (e: any) {
      return reject(new Error(`Invalid URL: ${urlStr}`));
    }

    const isHttps = parsedUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const req = client.request(
      parsedUrl,
      {
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache'
        },
        timeout: timeoutMs,
        // For website checker, accept unvalidated TLS so we can inspect if the website actually displays
        // Even if SSL was invalid, website check tests website presence independently!
        rejectUnauthorized: false
      },
      (res) => {
        const chunks: Buffer[] = [];
        let totalBytes = 0;
        const maxBytes = 1024 * 1024; // 1MB limit is plenty for detection

        res.on('data', (chunk) => {
          if (totalBytes < maxBytes) {
            chunks.push(chunk);
            totalBytes += chunk.length;
          }
        });

        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          const headers: Record<string, string> = {};
          for (const [k, v] of Object.entries(res.headers)) {
            if (typeof v === 'string') {
              headers[k.toLowerCase()] = v;
            } else if (Array.isArray(v)) {
              headers[k.toLowerCase()] = v.join(', ');
            }
          }
          resolve({
            statusCode: res.statusCode || 0,
            headers,
            body
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? match[1].replace(/<[^>]+>/g, '').trim() : '';
}

/**
 * Detects bot protection / Cloudflare challenge / CAPTCHA (retained exactly as before)
 */
function detectBotProtectionChallenge(
  bodyHtml: string,
  statusCode: number,
  title: string,
  headers: Record<string, string>
): boolean {
  const normHtml = bodyHtml.toLowerCase();
  const normTitle = title.toLowerCase();
  const serverHeader = (headers['server'] || '').toLowerCase();

  const isCloudflare =
    serverHeader.includes('cloudflare') ||
    normHtml.includes('cf-browser-verification') ||
    normHtml.includes('cloudflare ray id') ||
    normTitle.includes('just a moment...') ||
    normTitle.includes('attention required! | cloudflare');

  const isCaptcha =
    normHtml.includes('cf-turnstile') ||
    normHtml.includes('g-recaptcha') ||
    normHtml.includes('h-captcha') ||
    normHtml.includes('verify you are human') ||
    normHtml.includes('checking your browser before accessing');

  return (statusCode === 403 || statusCode === 503 || statusCode === 429) && (isCloudflare || isCaptcha);
}
