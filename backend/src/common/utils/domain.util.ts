import { randomBytes } from 'crypto';
import * as dns from 'dns/promises';
import * as tls from 'tls';

export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/.*$/, '')
    .replace(/:\d+$/, '');
}

export function isValidDomain(input: string): boolean {
  const host = normalizeDomain(input);
  if (!host || host.length > 253) return false;
  if (host.includes('localhost') || host.includes('127.0.0.1')) return false;
  return /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(
    host,
  );
}

// Normalises a requested subdomain label (single DNS hostname segment, no dots
// or protocol). Lowercases, strips trailing dots, and rejects anything that
// isn't a valid label. Returns the clean value or null when invalid.
export function normalizeSubdomain(input: string): string {
  return input.trim().toLowerCase().replace(/\.+$/, '').replace(/^\.+/, '');
}

export function isValidSubdomain(input: string): boolean {
  const label = normalizeSubdomain(input);
  if (!label || label.length < 2 || label.length > 63) return false;
  // Single DNS label: alphanumeric start/end, hyphens in the middle only.
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(label)) return false;
  // Reserved / dangerous values.
  if (
    [
      'www',
      'admin',
      'api',
      'mail',
      'ftp',
      'cdn',
      'app',
      'localhost',
      'db',
      'staging',
      'test',
    ].includes(label)
  ) {
    return false;
  }
  return true;
}

// The platform's wildcard base domain. Reads the env var at call time —
// PlatformConfigService patches process.env live from Super Admin config.
export function getSubdomainBaseDomain(): string {
  const base = (process.env.SUBDOMAIN_BASE_DOMAIN ?? 'ipixxel.ae')
    .trim()
    .toLowerCase()
    .replace(/^\.+/, '')
    .replace(/:\d+$/, '');
  return base;
}

export function getPlatformBaseDomains(): string[] {
  const extra = (process.env.SUBDOMAIN_BASE_ALIASES ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase().replace(/^\.+/, '').replace(/:\d+$/, ''))
    .filter(Boolean);
  return [...new Set([getSubdomainBaseDomain(), ...extra].filter(Boolean))];
}

// The fully-qualified host name for an organisation subdomain, based on the
// platform's wildcard base domain (e.g. "<sub>.ipixxel.ae"). In local dev
// (SUBDOMAIN_MODE=localhost) it renders "<sub>.localhost" which the OS resolves
// to 127.0.0.1 (works on mac/linux) so the whole flow works offline.
export function subdomainHost(subdomain: string): string {
  const label = normalizeSubdomain(subdomain);
  if (process.env.SUBDOMAIN_MODE === 'localhost') {
    return `${label}.localhost`;
  }
  return `${label}.${getSubdomainBaseDomain()}`;
}

// Given an incoming request host, return the organisation subdomain label if the
// host matches the configured wildcard base (dynamic via env) or ".localhost"
// during local dev. Returns null when the host is not an organisation subdomain.
export function extractSubdomainFromHost(host: string): string | null {
  if (!host) return null;
  const h = host.trim().toLowerCase().replace(/:\d+$/, '').replace(/\.$/, '');
  if (h.includes('/')) return null;

  // Local dev: "<sub>.localhost" maps to the local machine.
  if (h.endsWith('.localhost')) {
    const label = h.slice(0, -'.localhost'.length);
    return isValidSubdomain(label) ? label : null;
  }

  for (const base of getPlatformBaseDomains()) {
    if (!base) continue;
    if (!h.endsWith(`.${base}`) || h === base) continue;
    const label = h.slice(0, h.length - base.length - 1);
    // Exclude other first-level labels that share the base's parent domain.
    if (!label || label.includes('.') || !isValidSubdomain(label)) continue;
    return label;
  }
  return null;
}

export function generateVerificationToken(): string {
  return randomBytes(16).toString('hex');
}

// Produces a short list of candidate subdomain labels based on a base label,
// used to suggest alternatives when the requested one is taken.
export function generateSubdomainSuggestions(base: string, max = 4): string[] {
  const label = normalizeSubdomain(base)
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-');
  if (!label) return [];
  const raw = [
    `${label}1`,
    `${label}2`,
    label.endsWith('realty')
      ? label.replace(/realty$/, 'homes')
      : `${label}realty`,
    label.endsWith('homes')
      ? label.replace(/homes$/, 'realty')
      : `${label}homes`,
    `${label}estate`,
    `${label}group`,
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of raw) {
    const clean = s.toLowerCase();
    if (isValidSubdomain(clean) && !seen.has(clean)) {
      seen.add(clean);
      out.push(clean);
    }
    if (out.length >= max) break;
  }
  return out;
}

export function generateDnsInstructions(
  domain: string,
  token: string,
  opts: {
    ip?: string;
    cname?: string;
    ns1?: string;
    ns2?: string;
    mode?: string;
    ipv6?: string | null;
  } = {},
) {
  const infraIp = opts.ip || process.env.INFRA_IP || '';
  const infraCname = opts.cname || process.env.INFRA_CNAME_TARGET || '';
  const infraNs1 = opts.ns1 || process.env.INFRA_NS1 || '';
  const infraNs2 = opts.ns2 || process.env.INFRA_NS2 || '';
  const infraMode = opts.mode || process.env.DNS_MODE || 'a'; // a | cname | ns
  const records: Array<{
    type: string;
    host: string;
    value: string;
    ttl: string;
    purpose: string;
  }> = [];
  if (infraMode === 'ns') {
    if (infraNs1) {
      records.push({
        type: 'NS',
        host: '@',
        value: infraNs1,
        ttl: 'Auto',
        purpose: 'Primary nameserver',
      });
    }
    if (infraNs2) {
      records.push({
        type: 'NS',
        host: '@',
        value: infraNs2,
        ttl: 'Auto',
        purpose: 'Secondary nameserver',
      });
    }
  } else if (infraMode === 'cname') {
    if (infraCname) {
      records.push({
        type: 'CNAME',
        host: 'www',
        value: infraCname,
        ttl: 'Auto',
        purpose: 'Website',
      });
    }
    records.push({
      type: 'TXT',
      host: '@',
      value: `ipixxel-verify=${token}`,
      ttl: 'Auto',
      purpose: 'Verification',
    });
    records.push({
      type: 'TXT',
      host: '_ipixxel-verify',
      value: `ipixxel-verify=${token}`,
      ttl: 'Auto',
      purpose: 'Verification',
    });
  } else {
    if (infraIp) {
      records.push({
        type: 'A',
        host: '@',
        value: infraIp,
        ttl: 'Auto',
        purpose: 'Website',
      });
    }
    if (opts.ipv6 || process.env.INFRA_IPV6) {
      records.push({
        type: 'AAAA',
        host: '@',
        value: opts.ipv6 || process.env.INFRA_IPV6 || '::',
        ttl: 'Auto',
        purpose: 'Website IPv6',
      });
    }
    records.push({
      type: 'TXT',
      host: '_ipixxel-verify',
      value: `ipixxel-verify=${token}`,
      ttl: 'Auto',
      purpose: 'Verification',
    });
    records.push({
      type: 'CNAME',
      host: 'www',
      value: domain,
      ttl: 'Auto',
      purpose: 'WWW redirect',
    });
  }
  return {
    domain: normalizeDomain(domain),
    token,
    mode: infraMode,
    infra: { ip: infraIp, cname: infraCname, ns1: infraNs1, ns2: infraNs2 },
    records,
  };
}

export function getInfraInfo(
  opts?: {
    ip?: string;
    cname?: string;
    ns1?: string;
    ns2?: string;
    mode?: string;
    ipv6?: string | null;
  },
) {
  return {
    ip: opts?.ip || process.env.INFRA_IP || '',
    ipv6: opts?.ipv6 !== undefined ? opts.ipv6 : (process.env.INFRA_IPV6 || null),
    cname: opts?.cname || process.env.INFRA_CNAME_TARGET || '',
    ns1: opts?.ns1 || process.env.INFRA_NS1 || '',
    ns2: opts?.ns2 || process.env.INFRA_NS2 || '',
    mode: opts?.mode || process.env.DNS_MODE || 'a',
  };
}

export interface DnsRecordSpec {
  type: string;
  host: string;
  value: string;
  ttl: string;
  purpose: string;
}

// The DNS records a Super Admin must add at their registrar (Hostinger, etc.)
// for an organisation subdomain. Because every org sits under the same
// wildcard base, one wildcard record covers all subdomains. `skipHost` lets
// callers label the record against the platform base directly ("@") while
// still showing the concrete "<sub>.<base>" hostname elsewhere.
export function generateSubdomainDnsInstructions(
  host = '*',
  opts: {
    mode?: string;
    ip?: string;
    ipv6?: string | null;
    cname?: string;
    ns1?: string;
    ns2?: string;
  } = {},
): { mode: string; records: DnsRecordSpec[] } {
  const mode = opts.mode || process.env.DNS_MODE || 'a';
  const ip = opts.ip || process.env.INFRA_IP || '';
  const ipv6 =
    opts.ipv6 !== undefined ? opts.ipv6 : (process.env.INFRA_IPV6 || null);
  const cname = opts.cname || process.env.INFRA_CNAME_TARGET || '';
  const ns1 = opts.ns1 || process.env.INFRA_NS1 || '';
  const ns2 = opts.ns2 || process.env.INFRA_NS2 || '';
  const label = host === '*' ? '*' : normalizeSubdomain(host);
  const records: DnsRecordSpec[] = [];
  if (mode === 'ns') {
    if (ns1) records.push({ type: 'NS', host: '@', value: ns1, ttl: 'Auto', purpose: 'Primary nameserver' });
    if (ns2) records.push({ type: 'NS', host: '@', value: ns2, ttl: 'Auto', purpose: 'Secondary nameserver' });
  } else if (mode === 'cname') {
    if (cname) {
      records.push({
        type: 'CNAME',
        host: label,
        value: cname,
        ttl: 'Auto',
        purpose: 'Subdomain website',
      });
    }
  } else {
    if (ip) {
      records.push({
        type: 'A',
        host: label,
        value: ip,
        ttl: 'Auto',
        purpose: 'Subdomain website',
      });
    }
    if (ipv6) {
      records.push({
        type: 'AAAA',
        host: label,
        value: ipv6,
        ttl: 'Auto',
        purpose: 'Subdomain website (IPv6)',
      });
    }
  }
  return { mode, records };
}

// The concrete DNS records for ONE organisation subdomain, e.g. the A record
// "atomatci → <AWS IP>" shown next to each approved request in the admin UI.
export function generateSubdomainHostInstructions(
  subdomain: string,
  opts?: {
    mode?: string;
    ip?: string;
    ipv6?: string | null;
    cname?: string;
    ns1?: string;
    ns2?: string;
  },
): DnsRecordSpec[] {
  const label = normalizeSubdomain(subdomain);
  return generateSubdomainDnsInstructions(label, opts).records.map((r) =>
    r.host === '*' ? { ...r, host: label } : r,
  );
}

export function generateCustomDomainDnsInstructions(
  domain: string,
  opts: {
    mode?: string;
    ip?: string;
    ipv6?: string | null;
    cname?: string;
    ns1?: string;
    ns2?: string;
    verificationToken?: string;
  } = {},
): DnsRecordSpec[] {
  const norm = normalizeDomain(domain);
  const cleanDomain = norm.replace(/^www\./, '');
  const parts = cleanDomain.split('.');
  // Two-level ccTLD check (e.g., domain.co.in, domain.co.uk)
  const isMultiPartTld = ['co.uk', 'co.in', 'org.in', 'net.in', 'com.au', 'co.za'].includes(parts.slice(-2).join('.'));
  const isSubdomain = isMultiPartTld ? parts.length > 3 : parts.length > 2;

  const mode = opts.mode || process.env.DNS_MODE || 'a';
  const ip = opts.ip || process.env.INFRA_IP || '';
  const ipv6 = opts.ipv6 !== undefined ? opts.ipv6 : (process.env.INFRA_IPV6 || null);
  const cname = opts.cname || process.env.INFRA_CNAME_TARGET || '';
  const ns1 = opts.ns1 || process.env.INFRA_NS1 || '';
  const ns2 = opts.ns2 || process.env.INFRA_NS2 || '';
  const token = opts.verificationToken;
  const records: DnsRecordSpec[] = [];

  if (mode === 'ns') {
    if (ns1) records.push({ type: 'NS', host: '@', value: ns1, ttl: 'Auto', purpose: 'Primary nameserver' });
    if (ns2) records.push({ type: 'NS', host: '@', value: ns2, ttl: 'Auto', purpose: 'Secondary nameserver' });
  } else if (isSubdomain) {
    // For custom subdomains (e.g. promo.example.com), CNAME is valid:
    const subLabel = isMultiPartTld
      ? parts.slice(0, parts.length - 3).join('.')
      : parts.slice(0, parts.length - 2).join('.');
    records.push({
      type: mode === 'a' ? 'A' : 'CNAME',
      host: subLabel,
      value: mode === 'a' ? ip : (cname || ip),
      ttl: 'Auto',
      purpose: 'Subdomain origin',
    });
  } else {
    // Apex / Root domain (e.g. ipixxelrealty.com):
    // RFC 1034 prohibits CNAME at zone apex (@). Root MUST use an A record!
    if (ip) {
      records.push({
        type: 'A',
        host: '@',
        value: ip,
        ttl: 'Auto',
        purpose: 'Website origin (Apex)',
      });
    }
    if (ipv6) {
      records.push({
        type: 'AAAA',
        host: '@',
        value: ipv6,
        ttl: 'Auto',
        purpose: 'Website origin (IPv6)',
      });
    }
    records.push({
      type: 'CNAME',
      host: 'www',
      value: cleanDomain,
      ttl: 'Auto',
      purpose: 'WWW canonical / redirect',
    });
  }

  if (token) {
    records.push({
      type: 'TXT',
      host: `_ipixxel-challenge`,
      value: token,
      ttl: 'Auto',
      purpose: 'Domain ownership verification token',
    });
  }

  return records;
}

export interface DomainDnsVerificationResult {
  allPassed: boolean;
  ownershipVerified: boolean;
  routingVerified: boolean;
  detectedIps: string[];
  detectedTxt: string[];
  detectedCnames: string[];
  expectedIp: string | null;
  expectedToken: string | null;
  errors: string[];
  checkedAt: string;
}

export async function verifyDomainDns(
  domain: string,
  verificationToken?: string | null,
  expectedIp?: string | null,
): Promise<DomainDnsVerificationResult> {
  const norm = normalizeDomain(domain);
  const cleanDomain = norm.replace(/^www\./, '');
  const errors: string[] = [];
  let detectedIps: string[] = [];
  let detectedTxt: string[] = [];
  let detectedCnames: string[] = [];

  // 1. Resolve A records
  try {
    detectedIps = await dns.resolve4(cleanDomain);
  } catch (err: any) {
    errors.push(`A record lookup failed: ${err.code || err.message}`);
  }

  // 2. Resolve TXT records for verification token
  try {
    const rawTxt = await dns.resolveTxt(`_ipixxel-challenge.${cleanDomain}`);
    detectedTxt = rawTxt.map((parts) => parts.join(''));
  } catch {
    try {
      const rootTxt = await dns.resolveTxt(cleanDomain);
      detectedTxt.push(...rootTxt.map((parts) => parts.join('')));
    } catch {
      // not found yet
    }
  }

  // 3. Resolve www
  try {
    const cnames = await dns.resolveCname(`www.${cleanDomain}`);
    detectedCnames = cnames;
  } catch {
    try {
      const wwwIps = await dns.resolve4(`www.${cleanDomain}`);
      detectedIps = Array.from(new Set([...detectedIps, ...wwwIps]));
    } catch {
      // ignore
    }
  }

  const tokenToMatch = verificationToken?.trim();
  const ownershipVerified = tokenToMatch
    ? detectedTxt.some((t) => t.includes(tokenToMatch))
    : true;

  const routingVerified = expectedIp
    ? detectedIps.includes(expectedIp)
    : detectedIps.length > 0;

  const allPassed = ownershipVerified && routingVerified;

  return {
    allPassed,
    ownershipVerified,
    routingVerified,
    detectedIps,
    detectedTxt,
    detectedCnames,
    expectedIp: expectedIp || null,
    expectedToken: tokenToMatch || null,
    errors,
    checkedAt: new Date().toISOString(),
  };
}

export interface DomainSslVerificationResult {
  sslActive: boolean;
  status: 'active' | 'provisioning' | 'failed';
  issuer: string | null;
  validFrom: string | null;
  validTo: string | null;
  daysRemaining: number | null;
  error: string | null;
  checkedAt: string;
}

export async function verifyDomainSsl(
  domain: string,
): Promise<DomainSslVerificationResult> {
  const clean = normalizeDomain(domain);
  return new Promise((resolve) => {
    let resolved = false;
    const finish = (result: DomainSslVerificationResult) => {
      if (!resolved) {
        resolved = true;
        resolve(result);
      }
    };

    const socket = tls.connect(
      {
        host: clean,
        port: 443,
        servername: clean,
        rejectUnauthorized: false,
        timeout: 6000,
      },
      () => {
        try {
          const cert = socket.getPeerCertificate();
          socket.end();

          if (cert && cert.valid_to) {
            const validTo = new Date(cert.valid_to);
            const validFrom = new Date(cert.valid_from);
            const now = new Date();
            const daysRemaining = Math.max(
              0,
              Math.round((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
            );
            const isCertValid = now >= validFrom && now <= validTo;

            const rawIssuer = cert.issuer?.O || cert.issuer?.CN;
            const issuerStr = Array.isArray(rawIssuer)
              ? rawIssuer.join(', ')
              : typeof rawIssuer === 'string'
              ? rawIssuer
              : 'Unknown Certificate Authority';

            finish({
              sslActive: isCertValid,
              status: isCertValid ? 'active' : 'failed',
              issuer: issuerStr,
              validFrom: validFrom.toISOString(),
              validTo: validTo.toISOString(),
              daysRemaining,
              error: isCertValid ? null : 'Certificate expired or not yet valid',
              checkedAt: new Date().toISOString(),
            });
          } else {
            finish({
              sslActive: false,
              status: 'provisioning',
              issuer: null,
              validFrom: null,
              validTo: null,
              daysRemaining: null,
              error: 'TLS handshake succeeded but no valid certificate returned',
              checkedAt: new Date().toISOString(),
            });
          }
        } catch (err: any) {
          socket.destroy();
          finish({
            sslActive: false,
            status: 'failed',
            issuer: null,
            validFrom: null,
            validTo: null,
            daysRemaining: null,
            error: err.message || 'SSL verification failed',
            checkedAt: new Date().toISOString(),
          });
        }
      },
    );

    socket.on('error', (err) => {
      finish({
        sslActive: false,
        status: 'provisioning',
        issuer: null,
        validFrom: null,
        validTo: null,
        daysRemaining: null,
        error: `Port 443 unreachable or certificate still provisioning: ${err.message}`,
        checkedAt: new Date().toISOString(),
      });
    });

    socket.on('timeout', () => {
      socket.destroy();
      finish({
        sslActive: false,
        status: 'provisioning',
        issuer: null,
        validFrom: null,
        validTo: null,
        daysRemaining: null,
        error: 'Connection timeout on port 443 (certificate setup may still be propagating)',
        checkedAt: new Date().toISOString(),
      });
    });
  });
}

