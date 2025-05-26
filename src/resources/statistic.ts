import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * Register all statistic-related resources with the MCP server
 */
export function registerStatisticResources(server: McpServer) {
  // Static resource: Get number of cards reviewed by day
  server.resource('cards_reviewed_by_day', 'anki:///statistics/cards-reviewed-by-day', async (uri) => {
    try {
      const reviewsByDay = await ankiClient.statistic.getNumCardsReviewedByDay();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
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

  // Static resource: Get number of cards reviewed today
  server.resource('cards_reviewed_today', 'anki:///statistics/cards-reviewed-today', async (uri) => {
    try {
      const reviewsToday = await ankiClient.statistic.getNumCardsReviewedToday();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify({ cardsReviewedToday: reviewsToday }, null, 2),
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to get cards reviewed today: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Resource template: Get card reviews for a deck
  server.resource(
    'card_reviews',
    new ResourceTemplate('anki:///statistics/decks/{deckName}/reviews/{startID}', { list: undefined }),
    async (uri, { deckName, startID }) => {
      const deckNameString = Array.isArray(deckName) ? deckName[0] : deckName;
      const startIDString = Array.isArray(startID) ? startID[0] : startID;
      
      if (!deckNameString) {
        throw new Error('Deck name is required');
      }
      
      if (!startIDString) {
        throw new Error('Start ID is required');
      }

      const startIDNumber = parseInt(startIDString, 10);
      if (isNaN(startIDNumber)) {
        throw new Error(`Invalid start ID: ${startIDString}`);
      }

      try {
        const reviews = await ankiClient.statistic.cardReviews({ 
          deck: deckNameString, 
          startID: startIDNumber 
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(reviews, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get card reviews for deck "${deckNameString}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get latest review ID for a deck
  server.resource(
    'latest_review_id',
    new ResourceTemplate('anki:///statistics/decks/{deckName}/latest-review-id', { list: undefined }),
    async (uri, { deckName }) => {
      const deckNameString = Array.isArray(deckName) ? deckName[0] : deckName;
      if (!deckNameString) {
        throw new Error('Deck name is required');
      }

      try {
        const reviewID = await ankiClient.statistic.getLatestReviewID({ deck: deckNameString });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify({ 
                deck: deckNameString, 
                latestReviewID: reviewID,
                hasReviews: reviewID > 0
              }, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get latest review ID for deck "${deckNameString}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get reviews for specific cards
  server.resource(
    'reviews_of_cards',
    new ResourceTemplate('anki:///statistics/cards/{cardIds}/reviews', { list: undefined }),
    async (uri, { cardIds }) => {
      const cardIdsString = Array.isArray(cardIds) ? cardIds[0] : cardIds;
      if (!cardIdsString) {
        throw new Error('Card IDs are required');
      }

      const cardIdArray = cardIdsString.split(',').map((id: string) => id.trim());
      if (cardIdArray.length === 0) {
        throw new Error('At least one card ID is required');
      }

      try {
        const reviews = await ankiClient.statistic.getReviewsOfCards({ cards: cardIdArray });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(reviews, null, 2),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get reviews for cards "${cardIdArray.join(', ')}": ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get collection statistics HTML
  server.resource(
    'collection_stats_html',
    new ResourceTemplate('anki:///statistics/collection/{wholeCollection}', { list: undefined }),
    async (uri, { wholeCollection }) => {
      const wholeCollectionString = Array.isArray(wholeCollection) ? wholeCollection[0] : wholeCollection;
      if (!wholeCollectionString) {
        throw new Error('wholeCollection parameter is required (true/false)');
      }

      const isWholeCollection = wholeCollectionString.toLowerCase() === 'true';

      try {
        const statsHTML = await ankiClient.statistic.getCollectionStatsHTML({ 
          wholeCollection: isWholeCollection 
        });
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/html',
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
}
