import tls from 'node:tls';
import net from 'node:net';
import type { SSLResult } from './types.js';

interface SSLCheckOptions {
  timeoutMs?: number;
}

/**
 * Checks SSL/TLS certificate for a given domain using native Node.js TLS.
 * Enforces strict validation:
 * - Real HTTPS connection to port 443
 * - Proper SNI (Server Name Indication)
 * - Strict verification against system CA store (rejectUnauthorized: true)
 * - Valid dates (not expired, not yet valid)
 * - Hostname matching against Subject Alternative Names (SAN) / Common Name (CN)
 */
export async function checkDomainSSL(
  domain: string,
  options: SSLCheckOptions = {}
): Promise<SSLResult> {
  const timeoutMs = options.timeoutMs || 15000;
  const cleanDomain = domain.toLowerCase().trim();

  // Basic domain syntax check
  if (!cleanDomain || cleanDomain.includes('/') || cleanDomain.includes(' ')) {
    return {
      status: 'NO',
      valid: false,
      reason: 'Invalid domain syntax',
      checkedAt: new Date().toISOString()
    };
  }

  // Attempt 1: Strict connection (rejectUnauthorized: true)
  return new Promise<SSLResult>((resolve) => {
    let resolved = false;
    const finish = (result: SSLResult) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    const socket = tls.connect(
      {
        host: cleanDomain,
        port: 443,
        servername: cleanDomain,
        rejectUnauthorized: true,
        timeout: timeoutMs,
        minVersion: 'TLSv1.2'
      },
      () => {
        try {
          const cert = socket.getPeerCertificate(true);
          const authorized = socket.authorized;
          const authError = socket.authorizationError;
          const protocol = socket.getProtocol() || 'TLS';
          const cipher = socket.getCipher()?.name || 'Unknown';

          socket.end();

          if (!cert || Object.keys(cert).length === 0) {
            finish({
              status: 'NO',
              valid: false,
              reason: 'No certificate presented by server',
              protocol,
              cipher,
              checkedAt: new Date().toISOString()
            });
            return;
          }

          if (!authorized) {
            finish({
              status: 'NO',
              valid: false,
              reason: authError ? `Certificate validation failed: ${authError.message || authError}` : 'Untrusted certificate',
              issuer: formatIssuer(cert.issuer),
              subject: formatSubject(cert.subject),
              validFrom: cert.valid_from,
              validTo: cert.valid_to,
              protocol,
              cipher,
              checkedAt: new Date().toISOString()
            });
            return;
          }

          // Check hostname match
          const hostError = tls.checkServerIdentity(cleanDomain, cert);
          if (hostError) {
            finish({
              status: 'NO',
              valid: false,
              reason: `Hostname mismatch: certificate does not match ${cleanDomain}`,
              issuer: formatIssuer(cert.issuer),
              subject: formatSubject(cert.subject),
              validFrom: cert.valid_from,
              validTo: cert.valid_to,
              sans: parseSans(cert.subjectaltname),
              protocol,
              cipher,
              checkedAt: new Date().toISOString()
            });
            return;
          }

          // Check expiration dates
          const now = Date.now();
          const validFromMs = cert.valid_from ? new Date(cert.valid_from).getTime() : 0;
          const validToMs = cert.valid_to ? new Date(cert.valid_to).getTime() : 0;
          const daysRemaining = validToMs ? Math.round((validToMs - now) / (1000 * 60 * 60 * 24)) : 0;

          if (validToMs && now > validToMs) {
            finish({
              status: 'NO',
              valid: false,
              reason: `Certificate expired on ${cert.valid_to} (${Math.abs(daysRemaining)} days ago)`,
              issuer: formatIssuer(cert.issuer),
              subject: formatSubject(cert.subject),
              validFrom: cert.valid_from,
              validTo: cert.valid_to,
              daysRemaining,
              sans: parseSans(cert.subjectaltname),
              protocol,
              cipher,
              checkedAt: new Date().toISOString()
            });
            return;
          }

          if (validFromMs && now < validFromMs) {
            finish({
              status: 'NO',
              valid: false,
              reason: `Certificate not yet valid until ${cert.valid_from}`,
              issuer: formatIssuer(cert.issuer),
              subject: formatSubject(cert.subject),
              validFrom: cert.valid_from,
              validTo: cert.valid_to,
              protocol,
              cipher,
              checkedAt: new Date().toISOString()
            });
            return;
          }

          // Fully valid and trusted!
          finish({
            status: 'YES',
            valid: true,
            reason: 'Valid and trusted certificate issued to domain',
            issuer: formatIssuer(cert.issuer),
            subject: formatSubject(cert.subject),
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            daysRemaining,
            sans: parseSans(cert.subjectaltname),
            protocol,
            cipher,
            checkedAt: new Date().toISOString(),
            certDetails: {
              serialNumber: cert.serialNumber,
              fingerprint: cert.fingerprint256 || cert.fingerprint,
              selfSigned: false,
              expired: false,
              hostnameMismatch: false,
              untrusted: false
            }
          });
        } catch (err: any) {
          socket.destroy();
          finish({
            status: 'NO',
            valid: false,
            reason: `Error inspecting certificate: ${err?.message || 'Unknown error'}`,
            checkedAt: new Date().toISOString()
          });
        }
      }
    );

    socket.on('timeout', () => {
      socket.destroy();
      finish({
        status: 'NO',
        valid: false,
        reason: 'Connection timed out on port 443',
        checkedAt: new Date().toISOString()
      });
    });

    socket.on('error', async (err: any) => {
      socket.destroy();

      const code = err.code || '';
      const msg = err.message || '';

      if (code === 'ECONNREFUSED') {
        finish({
          status: 'NO',
          valid: false,
          reason: 'Connection refused (No HTTPS service on port 443)',
          checkedAt: new Date().toISOString()
        });
        return;
      }

      if (code === 'ENOTFOUND') {
        finish({
          status: 'NO',
          valid: false,
          reason: 'DNS lookup failed for HTTPS host',
          checkedAt: new Date().toISOString()
        });
        return;
      }

      if (code === 'ETIMEDOUT' || code === 'ECONNRESET') {
        finish({
          status: 'NO',
          valid: false,
          reason: `HTTPS connection failed: ${code}`,
          checkedAt: new Date().toISOString()
        });
        return;
      }

      // If it's a TLS certificate verification failure, connect with rejectUnauthorized: false
      // to retrieve detailed diagnostic info about why it was rejected.
      try {
        const diag = await inspectCertificateDiagnostic(cleanDomain, timeoutMs);
        finish(diag);
      } catch {
        finish({
          status: 'NO',
          valid: false,
          reason: `TLS handshake failed: ${msg}`,
          checkedAt: new Date().toISOString()
        });
      }
    });
  });
}

/**
 * Diagnostic fallback to inspect an invalid certificate's details without accepting it as valid.
 * ALWAYS returns status = 'NO'.
 */
async function inspectCertificateDiagnostic(domain: string, timeoutMs: number): Promise<SSLResult> {
  return new Promise<SSLResult>((resolve) => {
    let done = false;
    const socket = tls.connect(
      {
        host: domain,
        port: 443,
        servername: domain,
        rejectUnauthorized: false,
        timeout: Math.min(timeoutMs, 8000)
      },
      () => {
        if (done) return;
        done = true;

        try {
          const cert = socket.getPeerCertificate(true);
          const authError = socket.authorizationError;
          const protocol = socket.getProtocol() || 'TLS';
          const cipher = socket.getCipher()?.name || 'Unknown';
          socket.end();

          if (!cert || Object.keys(cert).length === 0) {
            resolve({
              status: 'NO',
              valid: false,
              reason: 'TLS handshake failed or no certificate provided',
              protocol,
              cipher,
              checkedAt: new Date().toISOString()
            });
            return;
          }

          const now = Date.now();
          const validToMs = cert.valid_to ? new Date(cert.valid_to).getTime() : 0;
          const isExpired = validToMs ? now > validToMs : false;
          const daysRemaining = validToMs ? Math.round((validToMs - now) / (1000 * 60 * 60 * 24)) : 0;
          const hostError = tls.checkServerIdentity(domain, cert);
          const isSelfSigned = isCertificateSelfSigned(cert);

          let specificReason = 'Invalid SSL Certificate';
          if (isExpired) {
            specificReason = `Certificate expired on ${cert.valid_to} (${Math.abs(daysRemaining)} days ago)`;
          } else if (hostError) {
            specificReason = `Hostname mismatch: certificate is for ${cert.subject?.CN || 'different host'}, not ${domain}`;
          } else if (isSelfSigned) {
            specificReason = 'Self-signed certificate (Untrusted CA)';
          } else if (authError) {
            const authMsg = typeof authError === 'string' ? authError : authError.message || String(authError);
            specificReason = `Certificate untrusted: ${authMsg}`;
          }

          resolve({
            status: 'NO',
            valid: false,
            reason: specificReason,
            issuer: formatIssuer(cert.issuer),
            subject: formatSubject(cert.subject),
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            daysRemaining,
            sans: parseSans(cert.subjectaltname),
            protocol,
            cipher,
            checkedAt: new Date().toISOString(),
            certDetails: {
              serialNumber: cert.serialNumber,
              fingerprint: cert.fingerprint256 || cert.fingerprint,
              selfSigned: isSelfSigned,
              expired: isExpired,
              hostnameMismatch: Boolean(hostError),
              untrusted: true
            }
          });
        } catch {
          socket.destroy();
          resolve({
            status: 'NO',
            valid: false,
            reason: 'TLS certificate verification rejected',
            checkedAt: new Date().toISOString()
          });
        }
      }
    );

    socket.on('error', (err) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({
        status: 'NO',
        valid: false,
        reason: `TLS connection failed: ${err.message}`,
        checkedAt: new Date().toISOString()
      });
    });

    socket.on('timeout', () => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve({
        status: 'NO',
        valid: false,
        reason: 'TLS connection timed out during verification',
        checkedAt: new Date().toISOString()
      });
    });
  });
}

function isCertificateSelfSigned(cert: tls.PeerCertificate): boolean {
  if (!cert.issuer || !cert.subject) return false;
  // If issuer and subject have identical CN and organization, or fingerprint matches issuer
  const issuerCN = cert.issuer.CN;
  const subjectCN = cert.subject.CN;
  const issuerO = cert.issuer.O;
  const subjectO = cert.subject.O;
  return Boolean(issuerCN && subjectCN && issuerCN === subjectCN && issuerO === subjectO);
}

function formatIssuer(issuer: any): string {
  if (!issuer) return 'Unknown Issuer';
  if (issuer.O && issuer.CN) return `${issuer.O} (${issuer.CN})`;
  if (issuer.O) return issuer.O;
  if (issuer.CN) return issuer.CN;
  return Object.values(issuer).join(', ') || 'Unknown Issuer';
}

function formatSubject(subject: any): string {
  if (!subject) return 'Unknown Subject';
  if (subject.CN) return subject.CN;
  if (subject.O) return subject.O;
  return Object.values(subject).join(', ') || 'Unknown Subject';
}

function parseSans(subjectaltname?: string): string[] {
  if (!subjectaltname) return [];
  return subjectaltname
    .split(',')
    .map((s) => s.trim().replace(/^DNS:/i, ''))
    .filter(Boolean);
}
