import { serveStdio, type StdioServerHandle } from '@modelcontextprotocol/server/stdio';
import type { Server } from 'node:http';
import { createHttpApp } from './http.js';
import { createServer } from './server.js';

let stdioHandle: StdioServerHandle | undefined;
let httpServer: Server | undefined;
let closeHttpHandler: (() => Promise<void>) | undefined;

function shutdown(signal: string) {
  // stderr only: stdout carries the stdio protocol.
  console.error(`\nReceived ${signal}. Shutting down gracefully...`);
  void (async () => {
    try {
      await stdioHandle?.close();
    } catch {}
    try {
      await closeHttpHandler?.();
    } catch {}
    try {
      httpServer?.close();
    } catch {}
    process.exit(0);
  })();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Start server in either stdio (default) or HTTP mode
function main() {
  const args = process.argv.slice(2);
  if (!args.includes('--http')) {
    // Serves both 2025-era clients (initialize handshake) and 2026-07-28 clients.
    stdioHandle = serveStdio(createServer, {
      onerror: (error) => console.error('MCP stdio error:', error),
    });
    console.error('Anki MCP Server (stdio) started successfully');
    return;
  }

  const getFlagValue = (name: string): string | undefined => {
    const match = args.find((a) => a.startsWith(`--${name}=`));
    if (!match) return undefined;
    const value = match.split('=')[1];
    return value ?? undefined;
  };
  const port = Number(getFlagValue('port') ?? process.env.PORT ?? 3000);
  const host = getFlagValue('host') ?? process.env.HOST ?? '127.0.0.1';

  // Host header validation (DNS rebinding protection) is automatic on loopback binds;
  // set ALLOWED_HOSTS (comma-separated) to restrict hosts on other binds.
  const allowedHosts = process.env.ALLOWED_HOSTS?.split(',')
    .map((h) => h.trim())
    .filter(Boolean);
  const { app, handler } = createHttpApp({ host, allowedHosts });
  closeHttpHandler = handler.close;

  httpServer = app.listen(port, host, () => {
    console.error(`Anki MCP Server (http) listening on http://${host}:${port}/mcp`);
  });
}

try {
  main();
} catch (error) {
  console.error('Failed to start Anki MCP Server:', error);
  process.exit(1);
}
