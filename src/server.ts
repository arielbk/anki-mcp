import { McpServer } from '@modelcontextprotocol/server';
import { registerPrompts } from './prompts/index.js';
import {
  registerCardResources,
  registerDeckResources,
  registerModelResources,
  registerNoteResources,
  registerStatisticResources,
} from './resources/index.js';
import { registerConsolidatedTools, registerGraphicalTools } from './tools/index.js';

// Injected from package.json by tsup (see tsup.config.ts) so it cannot drift.
declare const __PACKAGE_VERSION__: string | undefined;
export const SERVER_VERSION =
  typeof __PACKAGE_VERSION__ === 'string' ? __PACKAGE_VERSION__ : '0.0.0-dev';

/**
 * Builds a fully registered server instance. The SDK calls this factory once per stdio
 * connection and once per HTTP request, for both 2025-era and 2026-07-28 clients.
 */
export function createServer(): McpServer {
  const server = new McpServer({
    name: 'Anki MCP Server',
    version: SERVER_VERSION,
  });

  registerDeckResources(server);
  registerCardResources(server);
  registerNoteResources(server);
  registerModelResources(server);
  registerStatisticResources(server);

  registerConsolidatedTools(server);
  registerGraphicalTools(server);

  registerPrompts(server);

  return server;
}
