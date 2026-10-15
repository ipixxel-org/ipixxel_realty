import { apiFetch } from "@/lib/api";
import type { SiteConfig, BlockConfig } from "@/components/openpage/blocks/types";

export interface GenerateAiTemplateParams {
  mode: "prompt" | "project" | "template" | "improve";
  prompt: string;
  templateName?: string;
  pageType?: string;
  category?: string;
  projectId?: string;
  designStyle?: string;
  primaryColor?: string;
  accentColor?: string;
  typography?: string;
  targetAudience?: string;
  selectedSections?: string[];
  imageStyle?: string;
  currentSite?: Partial<SiteConfig>;
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
  block: BlockConfig;
  tone?: string;
  prompt?: string;
  siteContext?: {
    projectName?: string;
    location?: string;
    category?: string;
  };
}

export interface AiStatusResponse {
  configured: boolean;
  model: string;
  provider: string;
}

export async function getAiStatus(): Promise<AiStatusResponse> {
  try {
    return await apiFetch<AiStatusResponse>("/ai/status");
  } catch {
    return {
      configured: false,
      model: "gemini-3.8-flash",
      provider: "gemini",
    };
  }
}

export async function generateAiTemplate(
  params: GenerateAiTemplateParams,
): Promise<SiteConfig> {
  const result = await apiFetch<SiteConfig>("/ai/generate-template", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return result;
}

export async function regenerateAiSection(
  params: RegenerateSectionParams,
): Promise<BlockConfig> {
  const result = await apiFetch<BlockConfig>("/ai/regenerate-section", {
    method: "POST",
    body: JSON.stringify(params),
  });
  return result;
}
