import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * Register all deck-related resources with the MCP server
 */
export function registerDeckResources(server: McpServer) {
  // Static resource: Get all deck names
  server.registerResource(
    'deck_names',
    'anki:///decks/names',
    {
      title: 'Deck names',
      description: 'Names of all decks in the collection.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const deckNames = await ankiClient.deck.deckNames();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(deckNames, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get deck names: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Static resource: Get all deck names and IDs
  server.registerResource(
    'deck_names_and_ids',
    'anki:///decks/names-and-ids',
    {
      title: 'Deck names and IDs',
      description: 'Map of every deck name to its deck ID.',
      mimeType: 'application/json',
    },
    async (uri) => {
      try {
        const deckNamesAndIds = await ankiClient.deck.deckNamesAndIds();
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(deckNamesAndIds, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get deck names and IDs: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get deck configuration for a specific deck
  server.registerResource(
    'deck_config',
    new ResourceTemplate('anki:///decks/{deckName}/config', { list: undefined }),
    {
      title: 'Deck options',
      description: 'Options group (daily limits, learning steps, etc.) applied to the named deck.',
      mimeType: 'application/json',
    },
    async (uri, { deckName }) => {
      const deckNameString = Array.isArray(deckName) ? deckName[0] : deckName;
      if (!deckNameString) {
        throw new Error('Deck name is required');
      }

      try {
        const config = await ankiClient.deck.getDeckConfig({ deck: deckNameString });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(config, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get deck config for "${deckNameString}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get deck statistics for specific decks
  server.registerResource(
    'deck_stats',
    new ResourceTemplate('anki:///decks/{deckNames}/stats', { list: undefined }),
    {
      title: 'Deck statistics',
      description: 'New, learning and review counts for one or more decks (comma-separated names).',
      mimeType: 'application/json',
    },
    async (uri, { deckNames }) => {
      const deckNamesString = Array.isArray(deckNames) ? deckNames[0] : deckNames;
      if (!deckNamesString) {
        throw new Error('Deck names are required');
      }

      const deckNamesArray = deckNamesString.split(',').map((name: string) => name.trim());
      if (deckNamesArray.length === 0) {
        throw new Error('At least one deck name is required');
      }

      try {
        const stats = await ankiClient.deck.getDeckStats({ decks: deckNamesArray });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get deck stats for "${deckNamesArray.join(', ')}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get decks containing specific cards
  server.registerResource(
    'decks_by_cards',
    new ResourceTemplate('anki:///decks/by-cards/{cardIds}', { list: undefined }),
    {
      title: 'Decks for cards',
      description: 'Which deck each of the given card IDs (comma-separated) belongs to.',
      mimeType: 'application/json',
    },
    async (uri, { cardIds }) => {
      const cardIdsString = Array.isArray(cardIds) ? cardIds[0] : cardIds;
      if (!cardIdsString) {
        throw new Error('Card IDs are required');
      }

      const cardIdArray = cardIdsString.split(',').map((id: string) => {
        const num = parseInt(id.trim(), 10);
        if (isNaN(num)) {
          throw new Error(`Invalid card ID: ${id}`);
        }
        return num;
      });

      if (cardIdArray.length === 0) {
        throw new Error('At least one card ID is required');
      }

      try {
        const decks = await ankiClient.deck.getDecks({ cards: cardIdArray });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(decks, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get decks for cards "${cardIdArray.join(', ')}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
