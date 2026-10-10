/**
 * Base URL for the backend API used by server-side code.
 *
 * Deliberately a function (not a module-level `const`): Next.js can inline
 * `process.env.X` at build time, so capturing the value once at import would
 * bake in the build environment's URL. Reading it on every call reflects the
 * runtime environment (containers, previews, staging, prod).
 */
export function backendBaseUrl(): string {
  return (process.env.BACKEND_URL ?? "http://127.0.0.1:3000").replace(/\/+$/, "");
}
