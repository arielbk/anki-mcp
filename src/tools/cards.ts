import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * Register all card-related tools with the MCP server
 */
export function registerCardTools(server: McpServer) {
  // Tool: Answer cards
  server.tool(
    'answer_cards',
    {
      answers: z
        .array(
          z.object({
            cardId: z.number().describe('ID of the card to answer'),
            ease: z
              .number()
              .min(1)
              .max(4)
              .describe('Ease rating: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)'),
          })
        )
        .describe('Array of card answers'),
    },
    async ({ answers }) => {
      try {
        const results = await ankiClient.card.answerCards({ answers });
        const successCount = results.filter(Boolean).length;
        const failureCount = results.length - successCount;

        return {
          content: [
            {
              type: 'text',
              text: `Answered ${successCount} cards successfully, ${failureCount} failed. Results: ${JSON.stringify(results)}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to answer cards: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Find cards by query
  server.tool(
    'find_cards',
    {
      query: z.string().describe('Anki search query to find cards'),
    },
    async ({ query }) => {
      try {
        const cardIds = await ankiClient.card.findCards({ query });
        return {
          content: [
            {
              type: 'text',
              text: `Found ${cardIds.length} cards matching query "${query}": ${JSON.stringify(cardIds)}`,
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

  // Tool: Get detailed card information
  server.tool(
    'get_cards_info',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to get information for'),
    },
    async ({ cardIds }) => {
      try {
        const cardsInfo = await ankiClient.card.cardsInfo({ cards: cardIds });
        return {
          content: [
            {
              type: 'text',
              text: `Card information: ${JSON.stringify(cardsInfo, null, 2)}`,
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

  // Tool: Check if cards are due
  server.tool(
    'check_cards_due',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to check'),
    },
    async ({ cardIds }) => {
      try {
        const areDue = await ankiClient.card.areDue({ cards: cardIds });
        const result = cardIds.map((cardId, index) => ({
          cardId,
          isDue: areDue[index],
        }));

        const dueCount = areDue.filter(Boolean).length;
        return {
          content: [
            {
              type: 'text',
              text: `${dueCount} out of ${cardIds.length} cards are due. Details: ${JSON.stringify(result)}`,
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

  // Tool: Check if cards are suspended
  server.tool(
    'check_cards_suspended',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to check'),
    },
    async ({ cardIds }) => {
      try {
        const areSuspended = await ankiClient.card.areSuspended({ cards: cardIds });
        const result = cardIds.map((cardId, index) => ({
          cardId,
          isSuspended: areSuspended[index],
        }));

        const suspendedCount = areSuspended.filter((status) => status === true).length;
        return {
          content: [
            {
              type: 'text',
              text: `${suspendedCount} out of ${cardIds.length} cards are suspended. Details: ${JSON.stringify(result)}`,
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

  // Tool: Suspend cards
  server.tool(
    'suspend_cards',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to suspend'),
    },
    async ({ cardIds }) => {
      try {
        const result = await ankiClient.card.suspend({ cards: cardIds });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully suspended ${cardIds.length} cards. Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to suspend cards: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Unsuspend cards
  server.tool(
    'unsuspend_cards',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to unsuspend'),
    },
    async ({ cardIds }) => {
      try {
        const result = await ankiClient.card.unsuspend({ cards: cardIds });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully unsuspended ${cardIds.length} cards. Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to unsuspend cards: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Check if a single card is suspended
  server.tool(
    'check_card_suspended',
    {
      cardId: z.number().describe('Card ID to check'),
    },
    async ({ cardId }) => {
      try {
        const isSuspended = await ankiClient.card.suspended({ card: cardId });
        return {
          content: [
            {
              type: 'text',
              text: `Card ${cardId} is ${isSuspended ? 'suspended' : 'not suspended'}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to check if card is suspended: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Forget cards (make them new again)
  server.tool(
    'forget_cards',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to forget'),
    },
    async ({ cardIds }) => {
      try {
        await ankiClient.card.forgetCards({ cards: cardIds });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully forgot ${cardIds.length} cards, making them new again`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to forget cards: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Relearn cards
  server.tool(
    'relearn_cards',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to relearn'),
    },
    async ({ cardIds }) => {
      try {
        await ankiClient.card.relearnCards({ cards: cardIds });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully set ${cardIds.length} cards to relearn`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to relearn cards: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Set due date for cards
  server.tool(
    'set_cards_due_date',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to set due date for'),
      days: z.string().describe('Number of days from today (can be negative for past dates)'),
    },
    async ({ cardIds, days }) => {
      try {
        const result = await ankiClient.card.setDueDate({ cards: cardIds, days });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully set due date for cards. Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to set due date for cards: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Get ease factors for cards
  server.tool(
    'get_cards_ease_factors',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to get ease factors for'),
    },
    async ({ cardIds }) => {
      try {
        const easeFactors = await ankiClient.card.getEaseFactors({ cards: cardIds });
        const result = cardIds.map((cardId, index) => ({
          cardId,
          easeFactor: easeFactors[index],
        }));

        return {
          content: [
            {
              type: 'text',
              text: `Ease factors: ${JSON.stringify(result, null, 2)}`,
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

  // Tool: Set ease factors for cards
  server.tool(
    'set_cards_ease_factors',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to set ease factors for'),
      easeFactors: z
        .array(z.number())
        .describe('Array of ease factors (must match the length of cardIds)'),
    },
    async ({ cardIds, easeFactors }) => {
      try {
        if (cardIds.length !== easeFactors.length) {
          throw new Error('Number of card IDs must match number of ease factors');
        }

        const results = await ankiClient.card.setEaseFactors({
          cards: cardIds,
          easeFactors,
        });

        const successCount = results.filter(Boolean).length;
        return {
          content: [
            {
              type: 'text',
              text: `Successfully set ease factors for ${successCount} out of ${cardIds.length} cards`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to set ease factors: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Get intervals for cards
  server.tool(
    'get_cards_intervals',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to get intervals for'),
      complete: z
        .boolean()
        .optional()
        .describe('If true, returns all intervals; if false, returns only the most recent'),
    },
    async ({ cardIds, complete = false }) => {
      try {
        const intervals = await ankiClient.card.getIntervals({ cards: cardIds, complete });
        const result = cardIds.map((cardId, index) => ({
          cardId,
          intervals: intervals[index],
        }));

        return {
          content: [
            {
              type: 'text',
              text: `Intervals (${complete ? 'complete history' : 'most recent'}): ${JSON.stringify(result, null, 2)}`,
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

  // Tool: Get modification time for cards
  server.tool(
    'get_cards_mod_time',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to get modification time for'),
    },
    async ({ cardIds }) => {
      try {
        const modTimes = await ankiClient.card.cardsModTime({ cards: cardIds });
        return {
          content: [
            {
              type: 'text',
              text: `Modification times: ${JSON.stringify(modTimes, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get modification times: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Convert cards to notes
  server.tool(
    'cards_to_notes',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to get note IDs for'),
    },
    async ({ cardIds }) => {
      try {
        const noteIds = await ankiClient.card.cardsToNotes({ cards: cardIds });
        return {
          content: [
            {
              type: 'text',
              text: `Note IDs: ${JSON.stringify(noteIds)}`,
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

  // Tool: Set specific values of a card
  server.tool(
    'set_card_specific_values',
    {
      cardId: z.number().describe('Card ID to modify'),
      keys: z
        .array(
          z.enum([
            'data',
            'did',
            'due',
            'factor',
            'flags',
            'id',
            'ivl',
            'lapses',
            'left',
            'mod',
            'odid',
            'odue',
            'ord',
            'queue',
            'reps',
            'type',
            'usn',
          ])
        )
        .describe('Array of card property keys to modify'),
      newValues: z
        .array(z.string())
        .describe('Array of new values (must match the length of keys)'),
    },
    async ({ cardId, keys, newValues }) => {
      try {
        if (keys.length !== newValues.length) {
          throw new Error('Number of keys must match number of new values');
        }

        const results = await ankiClient.card.setSpecificValueOfCard({
          card: cardId,
          keys,
          newValues,
        });

        const successCount = results.filter(Boolean).length;
        return {
          content: [
            {
              type: 'text',
              text: `Successfully updated ${successCount} out of ${keys.length} values for card ${cardId}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to set card values: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
