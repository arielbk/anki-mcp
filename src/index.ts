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
  version: '0.3.0',
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

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT. Shutting down gracefully...');
  await server.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\nReceived SIGTERM. Shutting down gracefully...');
  await server.close();
  process.exit(0);
});

// Start receiving messages on stdin and sending messages on stdout
async function main() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    // Log successful startup to stderr (so it doesn't interfere with MCP protocol)
    console.error('Anki MCP Server started successfully');
  } catch (error) {
    console.error('Failed to start Anki MCP Server:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});
