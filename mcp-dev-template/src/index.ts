#!/usr/bin/env node
/**
 * OpenPage MCP server.
 *
 * Exposes the builder's design-token system over the Model Context Protocol so
 * an agent (Claude, etc.) can read, generate and re-theme OpenPage templates —
 * the OpenPage equivalent of driving WordPress + Elementor through an MCP.
 *
 * Transports:
 *   stdio (default) — for Claude Desktop / CLI clients.
 *   HTTP            — set OP_MCP_TRANSPORT=http (Streamable HTTP, POST /mcp).
 */

import "dotenv/config";
import type { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerDesignTools } from "./tools.js";

const SERVER_NAME = "openpage-mcp";
const SERVER_VERSION = "1.0.0";

function createServer(): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });
  registerDesignTools(server);
  return server;
}

async function runStdio(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdout is reserved for the MCP protocol — log to stderr only.
  console.error(`[${SERVER_NAME}] ready on stdio (v${SERVER_VERSION})`);
}

async function runHttp(): Promise<void> {
  const { default: express } = await import("express");
  const { StreamableHTTPServerTransport } = await import(
    "@modelcontextprotocol/sdk/server/streamableHttp.js"
  );

  const port = Number(process.env.OP_MCP_PORT) || 7801;
  const app = express();
  app.use(express.json({ limit: "25mb" }));

  app.post("/mcp", async (req: Request, res: Response) => {
    // Stateless mode: a fresh server + transport per request keeps the demo
    // simple and avoids session bookkeeping.
    try {
      const server = createServer();
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
      res.on("close", () => {
        void transport.close();
        void server.close();
      });
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      console.error(`[${SERVER_NAME}] HTTP request failed`, err);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal error" }, id: null });
      }
    }
  });

  const getHandler = (_req: Request, res: Response) => {
    res.status(405).end();
  };
  app.get("/mcp", getHandler);
  app.delete("/mcp", getHandler);

  app.get("/health", (_req: Request, res: Response) => res.json({ ok: true, server: SERVER_NAME, version: SERVER_VERSION }));

  app.listen(port, () => {
    console.error(`[${SERVER_NAME}] ready on http://127.0.0.1:${port}/mcp (v${SERVER_VERSION})`);
  });
}

const transport = (process.env.OP_MCP_TRANSPORT ?? "stdio").toLowerCase();
const entry = transport === "http" ? runHttp : runStdio;

entry().catch((err) => {
  console.error(`[${SERVER_NAME}] fatal:`, err);
  process.exit(1);
});
