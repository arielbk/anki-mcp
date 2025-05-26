import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * Register all deck-related tools with the MCP server
 */
export function registerDeckTools(server: McpServer) {
  // Tool: Create a new deck
  server.tool(
    'create_deck',
    {
      deckName: z.string().describe('Name of the deck to create'),
    },
    async ({ deckName }) => {
      try {
        const result = await ankiClient.deck.createDeck({ deck: deckName });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully created deck "${deckName}". Result: ${JSON.stringify(result)}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to create deck "${deckName}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  // Tool: Delete decks
  server.tool(
    'delete_decks',
    {
      deckNames: z.array(z.string()).describe('Array of deck names to delete'),
      deleteCards: z.boolean().default(true).describe('Whether to delete the cards in the decks as well'),
    },
    async ({ deckNames, deleteCards }) => {
      try {
        await ankiClient.deck.deleteDecks({ 
          decks: deckNames,
          cardsToo: deleteCards as true // Type assertion needed due to yanki-connect's strict typing
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully deleted decks: ${deckNames.join(', ')}${deleteCards ? ' (including cards)' : ' (cards preserved)'}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to delete decks "${deckNames.join(', ')}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  // Tool: Move cards to a different deck
  server.tool(
    'change_deck',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to move'),
      targetDeck: z.string().describe('Name of the target deck to move cards to'),
    },
    async ({ cardIds, targetDeck }) => {
      try {
        await ankiClient.deck.changeDeck({ 
          cards: cardIds,
          deck: targetDeck
        });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully moved ${cardIds.length} cards to deck "${targetDeck}"`,
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to move cards to deck "${targetDeck}": ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  // Tool: Clone deck configuration
  server.tool(
    'clone_deck_config',
    {
      sourceConfigId: z.number().describe('ID of the deck configuration to clone from'),
      newConfigName: z.string().describe('Name for the new cloned configuration'),
    },
    async ({ sourceConfigId, newConfigName }) => {
      try {
        const result = await ankiClient.deck.cloneDeckConfigId({ 
          cloneFrom: sourceConfigId,
          name: newConfigName
        });
        
        if (result === false) {
          throw new Error('Failed to clone deck configuration - operation returned false');
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully cloned deck configuration. New config ID: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to clone deck configuration: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  // Tool: Remove deck configuration
  server.tool(
    'remove_deck_config',
    {
      configId: z.number().describe('ID of the deck configuration to remove'),
    },
    async ({ configId }) => {
      try {
        const result = await ankiClient.deck.removeDeckConfigId({ configId });
        
        if (!result) {
          throw new Error('Failed to remove deck configuration - operation returned false');
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully removed deck configuration with ID: ${configId}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to remove deck configuration: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  // Tool: Save deck configuration
  server.tool(
    'save_deck_config',
    {
      config: z.object({
        id: z.number(),
        name: z.string(),
        autoplay: z.boolean(),
        dyn: z.boolean(),
        maxTaken: z.number(),
        mod: z.number(),
        replayq: z.boolean(),
        timer: z.number(),
        usn: z.number(),
        lapse: z.object({
          delays: z.array(z.number()),
          leechAction: z.number(),
          leechFails: z.number(),
          minInt: z.number(),
          mult: z.number(),
        }),
        new: z.object({
          bury: z.boolean(),
          delays: z.array(z.number()),
          initialFactor: z.number(),
          ints: z.array(z.number()),
          order: z.number(),
          perDay: z.number(),
          separate: z.boolean(),
        }),
        rev: z.object({
          bury: z.boolean(),
          ease4: z.number(),
          fuzz: z.number(),
          ivlFct: z.number(),
          maxIvl: z.number(),
          minSpace: z.number(),
          perDay: z.number(),
        }),
      }).describe('Complete deck configuration object to save'),
    },
    async ({ config }) => {
      try {
        const result = await ankiClient.deck.saveDeckConfig({ config });
        
        if (!result) {
          throw new Error('Failed to save deck configuration - operation returned false');
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully saved deck configuration "${config.name}" (ID: ${config.id})`,
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to save deck configuration: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );

  // Tool: Apply configuration to decks
  server.tool(
    'set_deck_config',
    {
      configId: z.number().describe('ID of the configuration to apply'),
      deckNames: z.array(z.string()).describe('Array of deck names to apply the configuration to'),
    },
    async ({ configId, deckNames }) => {
      try {
        const result = await ankiClient.deck.setDeckConfigId({ 
          configId,
          decks: deckNames
        });
        
        if (!result) {
          throw new Error('Failed to set deck configuration - operation returned false');
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully applied configuration ${configId} to decks: ${deckNames.join(', ')}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(`Failed to set deck configuration: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  );
}
