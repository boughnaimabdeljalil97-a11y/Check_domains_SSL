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

/**
 * Checks website availability independently from SSL results.
 * Attempts HTTPS first, falls back to HTTP if HTTPS fails or has SSL errors.
 * Inspects rendered content for 404 custom pages, Namecheap expired pages,
 * Cloudflare/CAPTCHA challenges, and valid website structure.
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
        checkedAt: new Date().toISOString()
      };
    }
    // For other transient DNS issues, continue to fetch attempt
  }

  // Attempt HTTPS first; if it fails (certificate issue, connection refused, etc.), attempt HTTP
  let fetchRes: FetchResult | null = null;
  let httpsError: string | null = null;

  try {
    fetchRes = await fetchWithRedirects(`https://${cleanDomain}`, timeoutMs);
  } catch (err: any) {
    httpsError = err?.message || 'HTTPS connection failed';
  }

  // If HTTPS failed or returned non-responsive, attempt plain HTTP
  if (!fetchRes || fetchRes.statusCode >= 500 || fetchRes.statusCode === 0) {
    try {
      const httpRes = await fetchWithRedirects(`http://${cleanDomain}`, timeoutMs);
      if (httpRes && httpRes.statusCode > 0) {
        fetchRes = httpRes;
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
          checkedAt: new Date().toISOString()
        };
      }
    }
  }

  if (!fetchRes) {
    return {
      status: 'NO',
      available: false,
      reason: 'No response received from website server',
      statusCode: null,
      finalUrl: `http://${cleanDomain}`,
      title: '',
      redirects: [],
      loadTimeMs: Date.now() - startTime,
      detectedExclusionType: 'other',
      checkedAt: new Date().toISOString()
    };
  }

  const { statusCode, finalUrl, body, redirects, loadTimeMs, headers } = fetchRes;
  const title = extractTitle(body);
  const bodyText = stripHtmlToText(body);

  // CLASSIFICATION RULE EVALUATION:

  // CASE 1: 404 Error Page (explicit combination required by user brief):
  // "404" AND "Sorry! That page cannot be found…"
  const is404Exclusion = detect404NotFoundExclusion(body, bodyText, title);
  if (is404Exclusion) {
    return {
      status: 'NO',
      available: false,
      reason: "Detected 404 page: 'Sorry! That page cannot be found…' (Content indicates missing destination)",
      statusCode,
      finalUrl,
      title: title || '404 - Page Not Found',
      redirects,
      loadTimeMs,
      detectedExclusionType: '404_not_found',
      checkedAt: new Date().toISOString()
    };
  }

  // CASE 2: Namecheap Expired Domain Page
  const isNamecheapExpired = detectNamecheapExpiredDomain(body, bodyText, title, finalUrl);
  if (isNamecheapExpired) {
    return {
      status: 'NO',
      available: false,
      reason: 'Namecheap expired-domain landing page detected (Registration expired)',
      statusCode,
      finalUrl,
      title: title || 'Namecheap Expired Domain',
      redirects,
      loadTimeMs,
      detectedExclusionType: 'namecheap_expired',
      checkedAt: new Date().toISOString()
    };
  }

  // CASE 3: Bot Protection / Cloudflare Challenge / CAPTCHA (INCONCLUSIVE / UNKNOWN)
  const isBotChallenge = detectBotProtectionChallenge(body, statusCode, title, headers);
  if (isBotChallenge) {
    return {
      status: 'UNKNOWN',
      available: false,
      reason: `Bot verification / Cloudflare challenge encountered (${statusCode || 403}): Unable to verify website automatically`,
      statusCode,
      finalUrl,
      title: title || 'Security Challenge',
      redirects,
      loadTimeMs,
      detectedExclusionType: 'bot_challenge',
      checkedAt: new Date().toISOString()
    };
  }

  // Check generic 404 status code with empty or generic error body
  if (statusCode === 404) {
    return {
      status: 'NO',
      available: false,
      reason: 'HTTP 404 Not Found response',
      statusCode,
      finalUrl,
      title: title || 'Not Found',
      redirects,
      loadTimeMs,
      detectedExclusionType: '404_not_found',
      checkedAt: new Date().toISOString()
    };
  }

  // Check 503 / 502 temporary gateway errors (INCONCLUSIVE)
  if (statusCode === 503 || statusCode === 502) {
    return {
      status: 'UNKNOWN',
      available: false,
      reason: `Server returned HTTP ${statusCode} (Temporary Server Error / Retry required)`,
      statusCode,
      finalUrl,
      title,
      redirects,
      loadTimeMs,
      detectedExclusionType: 'other',
      checkedAt: new Date().toISOString()
    };
  }

  // CASE 4: Normal Website YES
  // Return Website = YES when:
  // - A normal homepage loads (HTTP 200, 201, 204, etc.)
  // - Visible real website content (headings, navigation, text, forms, React app, etc.)
  // - Login page loads
  // - Simple website with valid content
  if (statusCode >= 200 && statusCode < 400) {
    const hasMeaningfulContent = hasVisibleContent(body, bodyText);
    return {
      status: 'YES',
      available: true,
      reason: hasMeaningfulContent
        ? `Active website loaded successfully (HTTP ${statusCode}, ${loadTimeMs}ms)`
        : `Website responded with HTTP ${statusCode}`,
      statusCode,
      finalUrl,
      title: title || cleanDomain,
      redirects,
      loadTimeMs,
      detectedExclusionType: 'none',
      checkedAt: new Date().toISOString()
    };
  }

  // If HTTP 403 or other 4xx without challenge:
  if (statusCode === 403) {
    // 403 forbidden usually means active web server restricting access
    return {
      status: 'YES',
      available: true,
      reason: 'Active web server reached (HTTP 403 Forbidden)',
      statusCode,
      finalUrl,
      title: title || 'Access Forbidden',
      redirects,
      loadTimeMs,
      detectedExclusionType: 'none',
      checkedAt: new Date().toISOString()
    };
  }

  // Fallback for unexpected status codes
  return {
    status: 'UNKNOWN',
    available: false,
    reason: `Inconclusive response from server: HTTP ${statusCode}`,
    statusCode,
    finalUrl,
    title,
    redirects,
    loadTimeMs,
    detectedExclusionType: 'other',
    checkedAt: new Date().toISOString()
  };
}

/**
 * Detects the specific exclusion rule:
 * "404" AND "Sorry! That page cannot be found…"
 */
function detect404NotFoundExclusion(bodyHtml: string, bodyText: string, title: string): boolean {
  const normalizedHtml = bodyHtml.toLowerCase();
  const normalizedText = bodyText.toLowerCase();
  const normalizedTitle = title.toLowerCase();

  const has404 = normalizedHtml.includes('404') || normalizedTitle.includes('404');
  
  // Specific required phrase: "Sorry! That page cannot be found…" (and slight punctuation variations)
  const hasSorryPhrase =
    normalizedHtml.includes('sorry! that page cannot be found') ||
    normalizedHtml.includes('sorry, that page cannot be found') ||
    normalizedHtml.includes('sorry that page cannot be found') ||
    normalizedText.includes('sorry! that page cannot be found') ||
    normalizedText.includes('sorry, that page cannot be found');

  return has404 && hasSorryPhrase;
}

/**
 * Detects Namecheap expired-domain landing page.
 * Indicators:
 * - Namecheap branding
 * - Domain registration has expired / renew instructions / parked
 */
function detectNamecheapExpiredDomain(
  bodyHtml: string,
  bodyText: string,
  title: string,
  finalUrl: string
): boolean {
  const normHtml = bodyHtml.toLowerCase();
  const normText = bodyText.toLowerCase();
  const normUrl = finalUrl.toLowerCase();
  const normTitle = title.toLowerCase();

  const hasNamecheapBrand =
    normHtml.includes('namecheap') ||
    normUrl.includes('namecheap.com') ||
    normTitle.includes('namecheap');

  const hasExpiredIndicator =
    normHtml.includes('this domain has expired') ||
    normHtml.includes('domain registration has expired') ||
    normHtml.includes('renew this domain') ||
    normHtml.includes('renewal instructions') ||
    normHtml.includes('domain is expired') ||
    normHtml.includes('parked for free by namecheap') ||
    normHtml.includes('parkingpage.namecheap.com') ||
    normText.includes('this domain has expired') ||
    normText.includes('domain registration has expired');

  return hasNamecheapBrand && hasExpiredIndicator;
}

/**
 * Detects bot protection / Cloudflare challenge / CAPTCHA
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

function hasVisibleContent(bodyHtml: string, bodyText: string): boolean {
  if (bodyText.length > 30) return true;
  // Look for interactive elements, React mount point, images, SVG, or navigation
  const normHtml = bodyHtml.toLowerCase();
  return (
    normHtml.includes('<nav') ||
    normHtml.includes('<header') ||
    normHtml.includes('<form') ||
    normHtml.includes('<button') ||
    normHtml.includes('<main') ||
    normHtml.includes('id="root"') ||
    normHtml.includes('id="__next"') ||
    normHtml.includes('<input') ||
    normHtml.includes('<img')
  );
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  return match ? match[1].trim() : '';
}

function stripHtmlToText(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
