import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { registerDeckResources } from './resources/index.js';
import { registerDeckTools } from './tools/index.js';

const server = new McpServer({
  name: 'Anki MCP Server',
  version: '0.1.0',
});

// Register all deck resources and tools
registerDeckResources(server);
registerDeckTools(server);

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
