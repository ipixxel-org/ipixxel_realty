// Hosts that serve the platform app itself (as opposed to an organisation's
// custom domain, which shows that org's public site). Shared by proxy.ts and
// by features that must only run on the app host (Team Chat).
//
// On the server every env var below is available; in the browser only the
// NEXT_PUBLIC_* ones are.

export function platformHosts(): Set<string> {
  return new Set(
    [
      "localhost",
      "127.0.0.1",
      "ipixxel.ae",
      "www.ipixxel.ae",
      process.env.NEXT_PUBLIC_APP_HOST,
      process.env.NEXT_PUBLIC_SUBDOMAIN_BASE_DOMAIN,
      process.env.SUBDOMAIN_BASE_DOMAIN,
    ]
      .filter((host): host is string => Boolean(host))
      .map((host) => host.toLowerCase()),
  );
}

export function hostname(host: string): string {
  return host.trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
}

export function isPlatformHost(host: string, hosts = platformHosts()): boolean {
  return hosts.has(hostname(host));
}
