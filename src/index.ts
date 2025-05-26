import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { ankiClient } from './utils/ankiClient.js';

const server = new Server(
  {
    name: 'Anki MCP Server',
    version: '0.1.0',
    description: 'MCP server for integrating with Anki flashcards',
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  }
);

// List available resources
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  return {
    resources: [{ uri: 'anki:///deck/get_decks', name: 'Get Decks' }],
  };
});

// Read resource contents
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const uri = request.params.uri;

  if (uri === 'anki:///deck/get_decks') {
    // Fetch the list of decks from Anki
    const decks = await ankiClient.deck.deckNames();
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: decks.join('\n'),
        },
      ],
    };
  }

  throw new Error('Resource not found');
});

// Define available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'create_deck',
        description: 'Create a new Anki deck',
        inputSchema: {
          type: 'object',
          properties: {
            deckName: { type: 'string' },
          },
          required: ['deckName'],
        },
      },
    ],
  };
});

// Handle tool execution
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'create_deck') {
    const { deckName } = request.params.arguments as { deckName: string };
    await ankiClient.deck.createDeck({ deck: deckName });
    return {
      content: [
        {
          type: 'text',
          text: `Deck "${deckName}" created successfully.`,
        },
      ],
    };
  }
  throw new Error('Tool not found');
});

// Start receiving messages on stdin and sending messages on stdout
const transport = new StdioServerTransport();
await server.connect(transport);
