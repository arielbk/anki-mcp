import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

/**
 * Main entry point for the MCP Server
 * This file sets up a basic MCP server with simple tools
 * to verify the setup works correctly
 */

// Create an MCP server
const server = new McpServer({
  name: 'Anki MCP Server',
  version: '0.1.0',
  description: 'MCP server for integrating with Anki flashcards',
});

// Add a ping tool - simple way to verify server is responding
server.tool('ping', {}, async () => ({
  content: [{ type: 'text', text: 'pong' }],
}));

// Add an echo tool - returns whatever is sent to it
server.tool('echo', { message: z.string() }, async ({ message }) => ({
  content: [{ type: 'text', text: message }],
}));

// Add a simple math tool
server.tool('calculate', { expression: z.string() }, async ({ expression }) => {
  try {
    // This is a simple example - in production, use safer evaluation methods
    const result = eval(expression);
    return {
      content: [{ type: 'text', text: `Result: ${result}` }],
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [{ type: 'text', text: `Error evaluating expression: ${errorMessage}` }],
    };
  }
});

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
