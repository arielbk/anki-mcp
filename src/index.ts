import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response } from 'express';
import express from 'express';
import { randomUUID } from 'node:crypto';
import {
  registerCardResources,
  registerDeckResources,
  registerModelResources,
  registerNoteResources,
  registerStatisticResources,
} from './resources/index.js';
import { registerConsolidatedTools } from './tools/index.js';

function createServer(): McpServer {
  const server = new McpServer({
    name: 'Anki MCP Server',
    version: '0.4.2',
  });

  // Register resources (for context)
  registerDeckResources(server);
  registerCardResources(server);
  registerNoteResources(server);
  registerModelResources(server);
  registerStatisticResources(server);

  // Register consolidated tools (6 high-level tools following MCP best practices)
  registerConsolidatedTools(server);

  return server;
}

// Handle graceful shutdown
let stdioServer: McpServer | undefined;
let httpServer: import('http').Server | undefined;

process.on('SIGINT', () => {
  console.log('\nReceived SIGINT. Shutting down gracefully...');
  void (async () => {
    try {
      if (stdioServer) await stdioServer.close();
    } catch {}
    try {
      if (httpServer) httpServer.close();
    } catch {}
    process.exit(0);
  })();
});

process.on('SIGTERM', () => {
  console.log('\nReceived SIGTERM. Shutting down gracefully...');
  void (async () => {
    try {
      if (stdioServer) await stdioServer.close();
    } catch {}
    try {
      if (httpServer) httpServer.close();
    } catch {}
    process.exit(0);
  })();
});

// Start server in either stdio (default) or HTTP mode
async function main() {
  const args = process.argv.slice(2);
  const isHttp = args.includes('--http');
  if (!isHttp) {
    try {
      const server = createServer();
      stdioServer = server;
      const transport = new StdioServerTransport();
      await server.connect(transport);
      console.error('Anki MCP Server (stdio) started successfully');
    } catch (error) {
      console.error('Failed to start Anki MCP Server (stdio):', error);
      process.exit(1);
    }
    return;
  }

  // HTTP mode (Streamable HTTP transport)
  const getFlagValue = (name: string): string | undefined => {
    const match = args.find((a) => a.startsWith(`--${name}=`));
    if (!match) return undefined;
    const value = match.split('=')[1];
    return value ?? undefined;
  };
  const port = Number(getFlagValue('port') ?? process.env.PORT ?? 3000);
  const host = (getFlagValue('host') ?? process.env.HOST ?? '127.0.0.1') as string;

  const app = express();
  app.use(express.json());

  type Session = {
    transport: StreamableHTTPServerTransport;
    server: McpServer;
  };

  const sessions: Record<string, Session> = {};

  app.post('/mcp', async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let session: Session | undefined;

    if (typeof sessionId === 'string') {
      const existing = sessions[sessionId];
      if (existing) {
        session = existing;
      }
    } else if (!sessionId && isInitializeRequest(req.body)) {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        // Recommend enabling DNS rebinding protection for local servers
        // enableDnsRebindingProtection: true,
        // allowedHosts: ['127.0.0.1', 'localhost'],
      });

      const server = createServer();

      transport.onclose = () => {
        if (transport.sessionId && sessions[transport.sessionId]) {
          delete sessions[transport.sessionId];
        }
        server.close().catch(() => {});
      };

      await server.connect(transport);

      if (!transport.sessionId) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Failed to initialize session' },
          id: null,
        });
        return;
      }

      sessions[transport.sessionId] = { transport, server };
      session = sessions[transport.sessionId];
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      });
      return;
    }

    if (!session) {
      // Should be unreachable due to prior guards
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Session unavailable' },
        id: null,
      });
      return;
    }
    await session.transport.handleRequest(req, res, req.body);
  });

  const handleSessionRequest = async (req: Request, res: Response) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    if (typeof sessionId !== 'string' || !sessions[sessionId]) {
      res.status(400).send('Invalid or missing session ID');
      return;
    }
    const session = sessions[sessionId];
    await session.transport.handleRequest(req, res);
  };

  // Notifications via SSE and session termination
  app.get('/mcp', handleSessionRequest);
  app.delete('/mcp', handleSessionRequest);

  httpServer = app.listen(port, host, () => {
    console.error(`Anki MCP Server (http) listening on http://${host}:${port}/mcp`);
  });
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
