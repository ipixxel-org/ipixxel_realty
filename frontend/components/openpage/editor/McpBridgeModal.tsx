"use client";

import { useState } from "react";
import { Bot, Copy, Check, Terminal, X, Sparkles, Cpu, Layers } from "lucide-react";
import { toast } from "sonner";

export function McpBridgeModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [copiedHttp, setCopiedHttp] = useState(false);

  if (!open) return null;

  const stdioConfig = {
    mcpServers: {
      openpage: {
        command: "node",
        args: [
          "C:/laragon/www/ipixxel_realty/backend/node_modules/tsx/dist/cli.mjs",
          "C:/laragon/www/ipixxel_realty/backend/mcp-dev-template/src/index.ts",
        ],
        env: {
          OP_API_BASE_URL: "http://127.0.0.1:3000",
          OP_API_TOKEN: "<YOUR_ORG_USER_JWT>",
        },
      },
    },
  };

  const copyConfig = (text: string, isHttp = false) => {
    navigator.clipboard.writeText(text);
    if (isHttp) setCopiedHttp(true);
    else setCopied(true);
    toast.success("MCP configuration copied to clipboard");
    setTimeout(() => {
      setCopied(false);
      setCopiedHttp(false);
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="w-full max-w-xl bg-bg-1 border border-border-default rounded-xl shadow-2xl flex flex-col overflow-hidden text-text-0">
        {/* Header */}
        <div className="px-5 py-4 border-b border-border-default flex items-center justify-between bg-bg-2/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-[#6d5dfc] to-[#38bdf8] text-white flex items-center justify-center shadow-xs">
              <Bot size={18} />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-text-0">
                Model Context Protocol (MCP) Bridge
              </h3>
              <p className="text-[11px] text-text-3">
                Drive BigEstate OpenPage with external AI agents (Claude, Cursor, Antigravity)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded flex items-center justify-center text-text-3 hover:text-text-0 hover:bg-bg-3"
          >
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 text-xs overflow-y-auto max-h-[75vh]">
          <div className="p-3 rounded-lg bg-[#6d5dfc]/10 border border-[#6d5dfc]/20 flex items-start gap-2.5">
            <Sparkles size={16} className="text-[#6d5dfc] shrink-0 mt-0.5" />
            <div className="text-[11.5px] leading-relaxed text-text-1">
              Builder.io-style headless AI management: your external coding & design agents can inspect the
              live page tree, modify tokens, regenerate copy, insert ready-made sections, and update SEO directly via MCP.
            </div>
          </div>

          {/* Stdio Setup */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-text-0">
                <Terminal size={14} className="text-green" />
                <span>Claude Desktop / CLI (stdio)</span>
              </div>
              <button
                type="button"
                onClick={() => copyConfig(JSON.stringify(stdioConfig, null, 2))}
                className="flex items-center gap-1 text-[11px] text-[#6d5dfc] hover:underline"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />}
                {copied ? "Copied" : "Copy JSON"}
              </button>
            </div>
            <pre className="p-3 rounded-lg bg-bg-3 border border-border-default font-mono text-[10.5px] text-text-1 overflow-x-auto select-all">
              {JSON.stringify(stdioConfig, null, 2)}
            </pre>
          </div>

          {/* HTTP Setup */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 font-semibold text-text-0">
                <Cpu size={14} className="text-amber-400" />
                <span>Streaming HTTP Transport (Port 7801)</span>
              </div>
              <button
                type="button"
                onClick={() =>
                  copyConfig("cd backend && OP_MCP_TRANSPORT=http OP_MCP_PORT=7801 npm run mcp", true)
                }
                className="flex items-center gap-1 text-[11px] text-[#6d5dfc] hover:underline"
              >
                {copiedHttp ? <Check size={12} /> : <Copy size={12} />}
                {copiedHttp ? "Copied" : "Copy command"}
              </button>
            </div>
            <div className="p-2.5 rounded-lg bg-bg-2 border border-border-default font-mono text-[11px] text-text-2">
              <code>OP_MCP_TRANSPORT=http OP_MCP_PORT=7801 npm run mcp</code>
              <div className="text-[10px] text-text-3 mt-1 font-sans">
                MCP Endpoint: <code className="text-text-1 font-mono">http://127.0.0.1:7801/mcp</code> · Health: <code className="text-text-1 font-mono">/health</code>
              </div>
            </div>
          </div>

          {/* Available MCP Capabilities */}
          <div className="space-y-2">
            <div className="font-semibold text-text-0 flex items-center gap-1.5">
              <Layers size={14} className="text-[#38bdf8]" />
              <span>Available MCP Tools</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              {[
                { name: "get_design_tokens", desc: "Read colors, typography & block tokens" },
                { name: "set_block_style_tokens", desc: "Patch styles, layout & box-model" },
                { name: "generate_ai_section", desc: "Synthesize new sections via prompt" },
                { name: "edit_ai_component", desc: "Conversational component copy & style" },
                { name: "insert_section", desc: "Insert catalog sections by ID" },
                { name: "set_page_seo", desc: "Update meta title, description & OpenGraph" },
              ].map((t) => (
                <div key={t.name} className="p-2 rounded-lg bg-bg-2/50 border border-border-subtle">
                  <div className="font-mono text-[10.5px] font-semibold text-[#6d5dfc]">{t.name}</div>
                  <div className="text-[9.5px] text-text-3 mt-0.5">{t.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-border-default bg-bg-2/40 flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-medium bg-bg-3 hover:bg-bg-4 text-text-1 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

