import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { ankiClient } from './utils/ankiClient.js';

const server = new McpServer({
  name: 'Anki MCP Server',
  version: '0.1.0',
});

// Define the "Get Decks" resource
server.resource('get_decks', 'anki:///deck/get_decks', async (uri) => {
  // Fetch the list of decks from Anki
  const decks = await ankiClient.deck.deckNames();
  return {
    contents: [
      {
        uri: uri.href,
        mimeType: 'text/plain',
        text: decks.join('\n'),
      },
    ],
  };
});

// Define the "Create Deck" tool
server.tool('create_deck', { deckName: z.string() }, async ({ deckName }) => {
  await ankiClient.deck.createDeck({ deck: deckName });
  return {
    content: [
      {
        type: 'text',
        text: `Deck "${deckName}" created successfully.`,
      },
    ],
  };
});

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
