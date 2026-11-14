import type { BlockConfig, SiteProperty } from "@/components/openpage/blocks/types";

export interface EvaluationContext {
  vars?: Record<string, string>;
  property?: SiteProperty;
  device?: string;
}

export function resolveContextValue(field: string, ctx: EvaluationContext): string | undefined {
  if (!field) return undefined;
  const cleanField = field.trim().replace(/^\{\{|\}\}$/g, "");

  // 1. Direct match in vars
  if (ctx.vars && ctx.vars[cleanField] !== undefined) {
    return ctx.vars[cleanField];
  }

  // 2. property.* lookup
  if (cleanField.startsWith("property.") && ctx.property) {
    const propKey = cleanField.replace("property.", "") as keyof SiteProperty;
    const val = ctx.property[propKey];
    if (val !== undefined && val !== null) {
      return typeof val === "string" ? val : JSON.stringify(val);
    }
  }

  // 3. Fallback to property direct key if available
  if (ctx.property) {
    const val = ctx.property[cleanField as keyof SiteProperty];
    if (val !== undefined && val !== null) {
      return typeof val === "string" ? val : JSON.stringify(val);
    }
  }

  // 4. Underscore / dot variants
  const altKey = cleanField.includes(".") ? cleanField.replace(/\./g, "_") : cleanField.replace(/_/g, ".");
  if (ctx.vars && ctx.vars[altKey] !== undefined) {
    return ctx.vars[altKey];
  }

  return undefined;
}

/**
 * Evaluates whether a block meets its display conditions (Builder.io style showIf/conditional).
 * Returns true if the block should be rendered, false if it should be hidden.
 */
export function shouldRenderBlock(block: BlockConfig, ctx: EvaluationContext = {}): boolean {
  if (!block) return true;

  // 1. Structured conditional rules win over the legacy showIf expression,
  //    so switching a block to the newer builder-style condition immediately
  //    takes effect even on documents that still carry an old showIf.
  if (block.conditional && block.conditional.field) {
    const { field, operator = "exists", value } = block.conditional;
    const actualVal = resolveContextValue(field, ctx) ?? "";

    switch (operator) {
      case "exists":
        return actualVal.trim().length > 0;
      case "notExists":
        return actualVal.trim().length === 0;
      case "equals":
        return actualVal.trim().toLowerCase() === (value || "").trim().toLowerCase();
      case "notEquals":
        return actualVal.trim().toLowerCase() !== (value || "").trim().toLowerCase();
      case "contains":
        return actualVal.toLowerCase().includes((value || "").toLowerCase());
      default:
        return true;
    }
  }

  // 2. Legacy showIf string expression (kept for documents saved before the
  //    structured rule UI existed).
  if (block.showIf) {
    const expr = block.showIf.trim();
    const isNegated = expr.startsWith("!");
    const field = isNegated ? expr.substring(1).trim() : expr;
    const val = resolveContextValue(field, ctx);
    const hasValue = val !== undefined && val !== "" && val !== "false" && val !== "0";
    return isNegated ? !hasValue : hasValue;
  }

  return true;
}

