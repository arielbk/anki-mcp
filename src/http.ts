import { createMcpExpressApp } from '@modelcontextprotocol/express';
import { toNodeHandler } from '@modelcontextprotocol/node';
import { createMcpHandler, type McpHttpHandler } from '@modelcontextprotocol/server';
import type { Express } from 'express';
import { createServer } from './server.js';

export interface HttpAppOptions {
  /** Interface the server binds to; loopback binds get Host/Origin validation automatically. */
  host: string;
  /** Hostnames accepted in the Host header (DNS rebinding protection) on any bind. */
  allowedHosts?: string[] | undefined;
}

/**
 * Express app serving MCP at /mcp. Stateless: every request gets a fresh server from
 * the same factory. 2026-07-28 clients use the per-request envelope; 2025-era clients
 * (initialize handshake) are served by the SDK's stateless legacy fallback.
 * GET/DELETE /mcp (2025 session operations) are answered with 405.
 */
export function createHttpApp(options: HttpAppOptions): { app: Express; handler: McpHttpHandler } {
  // Validates the Host header (DNS rebinding protection) and any Origin header when bound
  // to loopback; requests without an Origin header (non-browser clients) still pass.
  const app = createMcpExpressApp(
    options.allowedHosts?.length
      ? { host: options.host, allowedHosts: options.allowedHosts }
      : { host: options.host }
  );

  const handler = createMcpHandler(createServer, {
    onerror: (error) => console.error('MCP HTTP error:', error),
  });
  const nodeHandler = toNodeHandler(handler);

  // express.json() inside createMcpExpressApp has already drained the request stream,
  // so hand the parsed body through.
  app.all('/mcp', (req, res) => nodeHandler(req, res, req.body));

  return { app, handler };
}
