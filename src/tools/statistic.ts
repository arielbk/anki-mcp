import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * Register all statistic-related tools with the MCP server
 */
export function registerStatisticTools(server: McpServer) {
  // Tool: Get card reviews for a deck
  server.tool(
    'card_reviews',
    {
      deck: z.string().describe('Name of the deck to get reviews for'),
      startID: z.number().describe('Latest unix time not included in the result'),
    },
    async ({ deck, startID }) => {
      try {
        const reviews = await ankiClient.statistic.cardReviews({ deck, startID });
        return {
          content: [
            {
              type: 'text',
              text: `Found ${reviews.length} card reviews for deck "${deck}" after timestamp ${startID}`,
            },
            {
              type: 'text',
              text: JSON.stringify(reviews, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get card reviews for deck "${deck}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Get collection statistics HTML
  server.tool(
    'get_collection_stats_html',
    {
      wholeCollection: z.boolean().describe('Whether to get stats for the whole collection'),
    },
    async ({ wholeCollection }) => {
      try {
        const statsHTML = await ankiClient.statistic.getCollectionStatsHTML({ wholeCollection });
        return {
          content: [
            {
              type: 'text',
              text: `Collection statistics retrieved (${wholeCollection ? 'whole collection' : 'current deck'})`,
            },
            {
              type: 'text',
              text: statsHTML,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get collection statistics: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Get latest review ID for a deck
  server.tool(
    'get_latest_review_id',
    {
      deck: z.string().describe('Name of the deck to get latest review ID for'),
    },
    async ({ deck }) => {
      try {
        const reviewID = await ankiClient.statistic.getLatestReviewID({ deck });
        return {
          content: [
            {
              type: 'text',
              text: `Latest review ID for deck "${deck}": ${reviewID}${reviewID === 0 ? ' (no reviews found)' : ''}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get latest review ID for deck "${deck}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Get number of cards reviewed by day
  server.tool('get_num_cards_reviewed_by_day', {}, async () => {
    try {
      const reviewsByDay = await ankiClient.statistic.getNumCardsReviewedByDay();
      return {
        content: [
          {
            type: 'text',
            text: `Cards reviewed by day (${reviewsByDay.length} days):`,
          },
          {
            type: 'text',
            text: JSON.stringify(reviewsByDay, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to get cards reviewed by day: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Tool: Get number of cards reviewed today
  server.tool('get_num_cards_reviewed_today', {}, async () => {
    try {
      const reviewsToday = await ankiClient.statistic.getNumCardsReviewedToday();
      return {
        content: [
          {
            type: 'text',
            text: `Number of cards reviewed today: ${reviewsToday}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to get number of cards reviewed today: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Tool: Get reviews of specific cards
  server.tool(
    'get_reviews_of_cards',
    {
      cardIds: z.array(z.string()).describe('Array of card IDs to get reviews for'),
    },
    async ({ cardIds }) => {
      try {
        const reviews = await ankiClient.statistic.getReviewsOfCards({ cards: cardIds });
        return {
          content: [
            {
              type: 'text',
              text: `Reviews retrieved for ${cardIds.length} cards`,
            },
            {
              type: 'text',
              text: JSON.stringify(reviews, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get reviews for cards: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Insert reviews into database
  server.tool(
    'insert_reviews',
    {
      reviews: z
        .array(
          z.tuple([
            z.number().describe('Review time (unix timestamp)'),
            z.number().describe('Card ID'),
            z.number().describe('USN'),
            z.number().describe('Button pressed'),
            z.number().describe('New interval'),
            z.number().describe('Previous interval'),
            z.number().describe('New factor'),
            z.number().describe('Review duration'),
            z.number().describe('Review type'),
          ])
        )
        .describe('Array of review tuples to insert'),
    },
    async ({ reviews }) => {
      try {
        await ankiClient.statistic.insertReviews({ reviews });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully inserted ${reviews.length} reviews into the database`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to insert reviews: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
