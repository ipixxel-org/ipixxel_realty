import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  typescript: { ignoreBuildErrors: true },
  experimental: {
    webpackMemoryOptimizations: true,
    // Long-running backend routes proxied via rewrites (the AI builder's
    // /ai/generate-template can take a minute or more) exceed the 30s default,
    // which Next aborts with "Failed to proxy ... socket hang up".
    proxyTimeout: 300000,
  },
  async redirects() {
    return [
      { source: "/superadmin", destination: "/admin-console", permanent: false },
      { source: "/superadmin/:path*", destination: "/admin-console/:path*", permanent: false },
      { source: "/admin-console/login", destination: "/admin-login", permanent: false },
      { source: "/admin-console/onboarding", destination: "/admin-console/organisations", permanent: false },
      { source: "/admin-console/onboarding/:path*", destination: "/admin-console/organisations", permanent: false },
      { source: "/admin-console/approvals", destination: "/admin-console/organisations", permanent: false },
      { source: "/admin-console/approvals/:path*", destination: "/admin-console/organisations", permanent: false },
      { source: "/auth/login", destination: "/login", permanent: false },
      { source: "/auth/forgot-password", destination: "/forgot-password", permanent: false },
      { source: "/auth/reset-password", destination: "/reset-password", permanent: false },
      { source: "/auth/register", destination: "/register", permanent: false },
      // The standalone /verify-email page was removed — it was an orphaned
      // duplicate of the verification screen the /register wizard already
      // shows inline (see AuthService.signupStep1's email_verification_required).
      { source: "/auth/verify-email", destination: "/register", permanent: false },
      { source: "/verify-email", destination: "/register", permanent: false },
    ];
  },
  async rewrites() {
    const backendUrl = process.env.BACKEND_URL ?? "http://127.0.0.1:3000";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;