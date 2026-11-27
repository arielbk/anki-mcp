import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * Helper function to parse card IDs from URI path
 */
function parseCardIds(uri: URL): number[] {
  const cardIdsParam = uri.pathname.split('/').slice(-2)[0];

  if (!cardIdsParam) {
    throw new Error('Card IDs parameter is missing from URI');
  }

  const cardIds = cardIdsParam.split(',').map((id: string) => parseInt(id.trim(), 10));

  if (cardIds.some((id: number) => isNaN(id))) {
    throw new Error('Invalid card IDs provided');
  }

  return cardIds;
}

/**
 * Register all card-related resources with the MCP server
 */
export function registerCardResources(server: McpServer) {
  // Resource template: Find cards by query
  server.registerResource(
    'find_cards',
    new ResourceTemplate('anki:///cards/search/{query}', { list: undefined }),
    {
      title: 'Find cards',
      description: 'Card IDs matching an Anki search query (URL-encoded).',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const query = decodeURIComponent(uri.pathname.split('/').pop() ?? '');
        if (!query) {
          throw new Error('Query parameter is required');
        }

        const cardIds = await ankiClient.card.findCards({ query });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(cardIds, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to find cards: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get detailed information for specific cards
  server.registerResource(
    'cards_info',
    new ResourceTemplate('anki:///cards/{cardIds}/info', { list: undefined }),
    {
      title: 'Card details',
      description: 'Full info (fields, deck, scheduling) for comma-separated card IDs.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const cardIds = parseCardIds(uri);

        const cardsInfo = await ankiClient.card.cardsInfo({ cards: cardIds });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(cardsInfo, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get cards info: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Check if cards are due
  server.registerResource(
    'cards_due_status',
    new ResourceTemplate('anki:///cards/{cardIds}/due', { list: undefined }),
    {
      title: 'Card due status',
      description: 'Whether each of the comma-separated card IDs is currently due.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const cardIds = parseCardIds(uri);

        const areDue = await ankiClient.card.areDue({ cards: cardIds });
        const result = cardIds.map((cardId: number, index: number) => ({
          cardId,
          isDue: areDue[index],
        }));

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to check if cards are due: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Check if cards are suspended
  server.registerResource(
    'cards_suspend_status',
    new ResourceTemplate('anki:///cards/{cardIds}/suspended', { list: undefined }),
    {
      title: 'Card suspended status',
      description: 'Whether each of the comma-separated card IDs is suspended.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const cardIds = parseCardIds(uri);

        const areSuspended = await ankiClient.card.areSuspended({ cards: cardIds });
        const result = cardIds.map((cardId: number, index: number) => ({
          cardId,
          isSuspended: areSuspended[index],
        }));

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to check if cards are suspended: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get modification time for cards
  server.registerResource(
    'cards_mod_time',
    new ResourceTemplate('anki:///cards/{cardIds}/mod-time', { list: undefined }),
    {
      title: 'Card modification times',
      description: 'Last modification time for comma-separated card IDs.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const cardIds = parseCardIds(uri);

        const modTimes = await ankiClient.card.cardsModTime({ cards: cardIds });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(modTimes, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get cards modification time: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get note IDs for cards
  server.registerResource(
    'cards_to_notes',
    new ResourceTemplate('anki:///cards/{cardIds}/notes', { list: undefined }),
    {
      title: 'Notes for cards',
      description: 'Note IDs that own the comma-separated card IDs.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const cardIds = parseCardIds(uri);

        const noteIds = await ankiClient.card.cardsToNotes({ cards: cardIds });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(noteIds, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get note IDs from cards: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get ease factors for cards
  server.registerResource(
    'cards_ease_factors',
    new ResourceTemplate('anki:///cards/{cardIds}/ease-factors', { list: undefined }),
    {
      title: 'Card ease factors',
      description: 'Ease factor of each of the comma-separated card IDs.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const cardIds = parseCardIds(uri);

        const easeFactors = await ankiClient.card.getEaseFactors({ cards: cardIds });
        const result = cardIds.map((cardId: number, index: number) => ({
          cardId,
          easeFactor: easeFactors[index],
        }));

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get ease factors: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get intervals for cards
  server.registerResource(
    'cards_intervals',
    new ResourceTemplate('anki:///cards/{cardIds}/intervals', { list: undefined }),
    {
      title: 'Card intervals',
      description:
        'Review interval of each of the comma-separated card IDs; add ?complete=true for the full interval history.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const cardIds = parseCardIds(uri);

        // Check for complete parameter in query string
        const url = new URL(uri.href);
        const complete = url.searchParams.get('complete') === 'true';

        const intervals = await ankiClient.card.getIntervals({ cards: cardIds, complete });
        const result = cardIds.map((cardId: number, index: number) => ({
          cardId,
          intervals: intervals[index],
        }));

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get intervals: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
