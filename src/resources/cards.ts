import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * Register all card-related resources with the MCP server
 */
export function registerCardResources(server: McpServer) {
  // Resource template: Find cards by query
  server.resource(
    'find_cards',
    new ResourceTemplate('anki:///cards/search/{query}', { list: undefined }),
    async (uri) => {
      try {
        const query = decodeURIComponent(uri.pathname.split('/').pop() || '');
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
  server.resource(
    'cards_info',
    new ResourceTemplate('anki:///cards/{cardIds}/info', { list: undefined }),
    async (uri) => {
      try {
        const cardIdsParam = uri.pathname.split('/').slice(-2)[0]; // Get cardIds from path
        const cardIds = cardIdsParam.split(',').map((id: string) => parseInt(id.trim(), 10));
        
        if (cardIds.some((id: number) => isNaN(id))) {
          throw new Error('Invalid card IDs provided');
        }

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
  server.resource(
    'cards_due_status',
    new ResourceTemplate('anki:///cards/{cardIds}/due', { list: undefined }),
    async (uri) => {
      try {
        const cardIdsParam = uri.pathname.split('/').slice(-2)[0]; // Get cardIds from path
        const cardIds = cardIdsParam.split(',').map((id: string) => parseInt(id.trim(), 10));
        
        if (cardIds.some((id: number) => isNaN(id))) {
          throw new Error('Invalid card IDs provided');
        }

        const areDue = await ankiClient.card.areDue({ cards: cardIds });
        const result = cardIds.map((cardId: number, index: number) => ({
          cardId,
          isDue: areDue[index]
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
  server.resource(
    'cards_suspend_status',
    new ResourceTemplate('anki:///cards/{cardIds}/suspended', { list: undefined }),
    async (uri) => {
      try {
        const cardIdsParam = uri.pathname.split('/').slice(-2)[0]; // Get cardIds from path
        const cardIds = cardIdsParam.split(',').map((id: string) => parseInt(id.trim(), 10));
        
        if (cardIds.some((id: number) => isNaN(id))) {
          throw new Error('Invalid card IDs provided');
        }

        const areSuspended = await ankiClient.card.areSuspended({ cards: cardIds });
        const result = cardIds.map((cardId: number, index: number) => ({
          cardId,
          isSuspended: areSuspended[index]
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
  server.resource(
    'cards_mod_time',
    new ResourceTemplate('anki:///cards/{cardIds}/mod-time', { list: undefined }),
    async (uri) => {
      try {
        const cardIdsParam = uri.pathname.split('/').slice(-2)[0]; // Get cardIds from path
        const cardIds = cardIdsParam.split(',').map((id: string) => parseInt(id.trim(), 10));
        
        if (cardIds.some((id: number) => isNaN(id))) {
          throw new Error('Invalid card IDs provided');
        }

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
  server.resource(
    'cards_to_notes',
    new ResourceTemplate('anki:///cards/{cardIds}/notes', { list: undefined }),
    async (uri) => {
      try {
        const cardIdsParam = uri.pathname.split('/').slice(-2)[0]; // Get cardIds from path
        const cardIds = cardIdsParam.split(',').map((id: string) => parseInt(id.trim(), 10));
        
        if (cardIds.some((id: number) => isNaN(id))) {
          throw new Error('Invalid card IDs provided');
        }

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
  server.resource(
    'cards_ease_factors',
    new ResourceTemplate('anki:///cards/{cardIds}/ease-factors', { list: undefined }),
    async (uri) => {
      try {
        const cardIdsParam = uri.pathname.split('/').slice(-2)[0]; // Get cardIds from path
        const cardIds = cardIdsParam.split(',').map((id: string) => parseInt(id.trim(), 10));
        
        if (cardIds.some((id: number) => isNaN(id))) {
          throw new Error('Invalid card IDs provided');
        }

        const easeFactors = await ankiClient.card.getEaseFactors({ cards: cardIds });
        const result = cardIds.map((cardId: number, index: number) => ({
          cardId,
          easeFactor: easeFactors[index]
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
  server.resource(
    'cards_intervals',
    new ResourceTemplate('anki:///cards/{cardIds}/intervals', { list: undefined }),
    async (uri) => {
      try {
        const cardIdsParam = uri.pathname.split('/').slice(-2)[0]; // Get cardIds from path
        const cardIds = cardIdsParam.split(',').map((id: string) => parseInt(id.trim(), 10));
        
        if (cardIds.some((id: number) => isNaN(id))) {
          throw new Error('Invalid card IDs provided');
        }

        // Check for complete parameter in query string
        const url = new URL(uri.href);
        const complete = url.searchParams.get('complete') === 'true';

        const intervals = await ankiClient.card.getIntervals({ cards: cardIds, complete });
        const result = cardIds.map((cardId: number, index: number) => ({
          cardId,
          intervals: intervals[index]
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
