import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  registerDeckResources,
  registerCardResources,
  registerNoteResources,
  registerModelResources,
  registerStatisticResources,
} from './resources/index.js';
import {
  registerDeckTools,
  registerCardTools,
  registerNoteTools,
  registerGraphicalTools,
  registerMediaTools,
  registerMiscellaneousTools,
  registerModelTools,
  registerStatisticTools,
} from './tools/index.js';

const server = new McpServer({
  name: 'Anki MCP Server',
  version: '0.1.0',
});

// Register all deck resources and tools
registerDeckResources(server);
registerDeckTools(server);

// Register all card resources and tools
registerCardResources(server);
registerCardTools(server);

// Register all note resources and tools
registerNoteResources(server);
registerNoteTools(server);

// Register all model resources and tools
registerModelResources(server);
registerModelTools(server);

// Register all statistic resources and tools
registerStatisticResources(server);
registerStatisticTools(server);

// Register all other tools (no resources needed for these)
registerGraphicalTools(server);
registerMediaTools(server);
registerMiscellaneousTools(server);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
