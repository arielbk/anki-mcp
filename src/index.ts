import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerDeckResources, registerCardResources, registerNoteResources } from './resources/index.js';
import { registerDeckTools, registerCardTools, registerNoteTools } from './tools/index.js';

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

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
