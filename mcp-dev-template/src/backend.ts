/**
 * Thin REST client for the NestJS backend's AI module. The MCP server talks to
 * the same endpoints the browser does (`/ai/*`), just with a service token.
 *
 * Config (env):
 *   OP_API_BASE_URL  Base URL of the backend (default http://127.0.0.1:3000).
 *   OP_API_TOKEN     Bearer JWT for an org user (required for AI calls).
 */

import type { SiteConfig } from "./site.js";

export interface AiStatus {
  configured: boolean;
  model: string;
  provider: string;
}

export interface GenerateTemplateParams {
  mode: "prompt" | "project" | "template" | "improve";
  prompt: string;
  templateName?: string;
  category?: string;
  projectId?: string;
  designStyle?: string;
  primaryColor?: string;
  accentColor?: string;
  typography?: string;
  targetAudience?: string;
  selectedSections?: string[];
  currentSite?: SiteConfig;
}

export interface RegenerateSectionParams {
  action:
    | "rewrite"
    | "improve-headline"
    | "shorten"
    | "change-tone"
    | "improve-cta"
    | "regenerate"
    | "suggest-styling";
  block: Record<string, unknown>;
  tone?: string;
  prompt?: string;
  siteContext?: { projectName?: string; location?: string; category?: string };
}

function baseUrl(): string {
  return (process.env.OP_API_BASE_URL?.trim() || "http://127.0.0.1:3000").replace(/\/+$/, "");
}

export function isBackendConfigured(): boolean {
  return Boolean(process.env.OP_API_TOKEN?.trim());
}

async function request<T>(pathName: string, init: RequestInit = {}): Promise<T> {
  const token = process.env.OP_API_TOKEN?.trim();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${baseUrl()}${pathName}`, { ...init, headers });
  const text = await res.text();
  const body = text ? safeJson(text) : null;

  if (!res.ok) {
    const message =
      (body && typeof body === "object" && ("message" in body || "error" in body)
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ((body as any).message ?? (body as any).error)
        : null) ?? `Request failed with status ${res.status}`;
    throw new Error(Array.isArray(message) ? message.join(", ") : String(message));
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const BackendClient = {
  isBackendConfigured,

  async getStatus(): Promise<AiStatus> {
    return request<AiStatus>("/ai/status");
  },

  async generateTemplate(params: GenerateTemplateParams): Promise<SiteConfig> {
    return request<SiteConfig>("/ai/generate-template", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },

  /** Token-only design edit of an existing document (mode: "improve"). */
  async improveDesign(currentSite: SiteConfig, instruction: string, params: Partial<GenerateTemplateParams> = {}): Promise<SiteConfig> {
    return request<SiteConfig>("/ai/generate-template", {
      method: "POST",
      body: JSON.stringify({
        mode: "improve",
        prompt: instruction,
        currentSite,
        ...params,
      }),
    });
  },

  async regenerateSection(params: RegenerateSectionParams): Promise<Record<string, unknown>> {
    return request<Record<string, unknown>>("/ai/regenerate-section", {
      method: "POST",
      body: JSON.stringify(params),
    });
  },
};
