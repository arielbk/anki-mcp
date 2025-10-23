import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * MIME type mapping for common media file extensions
 */
const MIME_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
  bmp: 'image/bmp',
  ico: 'image/x-icon',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  webm: 'video/webm',
  pdf: 'application/pdf',
};

/**
 * Register consolidated, high-level tools with the MCP server
 * Following MCP best practices: domain-aware, intentional tool design
 * instead of exposing every low-level API endpoint
 */
export function registerConsolidatedTools(server: McpServer) {
  /**
   * TOOL 1: manage_flashcards
   * High-level flashcard (note/card) management
   * Covers: create, update, delete, find, tag operations
   */
  server.tool(
    'manage_flashcards',
    {
      operation: z
        .enum([
          'create',
          'create_batch',
          'update',
          'delete',
          'find',
          'get_info',
          'add_tags',
          'remove_tags',
          'clear_empty',
        ])
        .describe('The flashcard operation to perform'),

      // For create operations
      deckName: z.string().optional().describe('Deck name (for create operations)'),
      modelName: z.string().optional().describe('Note type/model name (for create operations)'),
      fields: z
        .record(z.string())
        .optional()
        .describe('Field name-value pairs (for create/update)'),
      tags: z.array(z.string()).optional().describe('Tags to add/remove or set'),

      // For batch create
      notes: z
        .array(
          z.object({
            deckName: z.string(),
            modelName: z.string(),
            fields: z.record(z.string()),
            tags: z.array(z.string()).optional(),
          })
        )
        .optional()
        .describe('Array of notes to create (for create_batch)'),

      // For update/delete operations
      noteId: z.number().optional().describe('Note ID (for update/delete single note)'),
      noteIds: z.array(z.number()).optional().describe('Note IDs (for delete multiple)'),

      // For find operations
      query: z.string().optional().describe('Anki search query (for find operation)'),
      includeDetails: z.boolean().optional().describe('Include detailed note info (for find)'),
      limit: z
        .number()
        .optional()
        .describe('Max results to return (default: 50, recommended to prevent context overflow)'),
      offset: z
        .number()
        .optional()
        .describe('Number of results to skip for pagination (default: 0)'),

      // For get_info
      cardIds: z.array(z.number()).optional().describe('Card IDs to get info for'),
    },
    async ({
      operation,
      deckName,
      modelName,
      fields,
      tags,
      notes,
      noteId,
      noteIds,
      query,
      includeDetails,
      limit = 50,
      offset = 0,
      cardIds,
    }) => {
      try {
        switch (operation) {
          case 'create': {
            if (!deckName || !modelName || !fields) {
              throw new Error('create requires deckName, modelName, and fields');
            }
            const note = {
              deckName,
              modelName,
              fields,
              tags: tags || [],
            };
            const newNoteId = await ankiClient.note.addNote({ note });
            if (newNoteId === null) {
              throw new Error('Failed to add note - possibly duplicate or invalid fields');
            }
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Created flashcard with ID: ${newNoteId} in deck "${deckName}"`,
                },
              ],
            };
          }

          case 'create_batch': {
            if (!notes || notes.length === 0) {
              throw new Error('create_batch requires notes array');
            }
            const formattedNotes = notes.map((note) => ({
              ...note,
              tags: note.tags || [],
            }));
            const results = await ankiClient.note.addNotes({ notes: formattedNotes });
            const successCount = results?.filter((result) => result !== null).length || 0;
            const failureCount = (results?.length || 0) - successCount;
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Batch create: ${successCount} succeeded, ${failureCount} failed\nResults: ${JSON.stringify(results)}`,
                },
              ],
            };
          }

          case 'update': {
            if (!noteId) {
              throw new Error('update requires noteId');
            }
            if (!fields && !tags) {
              throw new Error('update requires either fields or tags');
            }
            const updateData: any = { id: noteId };
            if (fields) updateData.fields = fields;
            if (tags) updateData.tags = tags;
            await ankiClient.note.updateNote({ note: updateData });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Updated flashcard ${noteId}${fields ? ' (fields updated)' : ''}${tags ? ` (tags: ${tags.join(', ')})` : ''}`,
                },
              ],
            };
          }

          case 'delete': {
            if (!noteIds || noteIds.length === 0) {
              throw new Error('delete requires noteIds array');
            }
            await ankiClient.note.deleteNotes({ notes: noteIds });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Deleted ${noteIds.length} flashcard(s): [${noteIds.join(', ')}]`,
                },
              ],
            };
          }

          case 'find': {
            if (!query) {
              throw new Error('find requires query parameter');
            }
            const foundNoteIds = await ankiClient.note.findNotes({ query });
            const totalResults = foundNoteIds.length;

            // Apply pagination
            const paginatedIds = foundNoteIds.slice(offset, offset + limit);
            const hasMore = offset + limit < totalResults;

            let result = `Found ${totalResults} total flashcard(s) matching "${query}"`;
            result += `\nShowing results ${offset + 1}-${offset + paginatedIds.length} of ${totalResults}`;

            if (hasMore) {
              result += `\n⚠️  More results available. Use offset=${offset + limit} to see next page.`;
            }

            if (includeDetails && paginatedIds.length > 0) {
              const notesInfo = await ankiClient.note.notesInfo({ notes: paginatedIds });
              result += `\n\nDetails:\n${JSON.stringify(notesInfo, null, 2)}`;
            } else if (paginatedIds.length > 0) {
              result += `\n\nIDs: [${paginatedIds.join(', ')}]`;
            }

            return {
              content: [
                {
                  type: 'text',
                  text: result,
                },
              ],
            };
          }

          case 'get_info': {
            if (!cardIds || cardIds.length === 0) {
              throw new Error('get_info requires cardIds array');
            }

            // Warn if requesting too many cards at once
            if (cardIds.length > 50) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `⚠️  Requesting ${cardIds.length} cards may use excessive context.\nRecommendation: Request fewer cards (≤50) or use 'find' with pagination instead.`,
                  },
                ],
              };
            }

            const cardsInfo = await ankiClient.card.cardsInfo({ cards: cardIds });
            return {
              content: [
                {
                  type: 'text',
                  text: `Card information (${cardsInfo.length} cards):\n${JSON.stringify(cardsInfo, null, 2)}`,
                },
              ],
            };
          }

          case 'add_tags': {
            if (!noteIds || !tags) {
              throw new Error('add_tags requires noteIds and tags');
            }
            await ankiClient.note.addTags({ notes: noteIds, tags: tags.join(' ') });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Added tags [${tags.join(', ')}] to ${noteIds.length} flashcard(s)`,
                },
              ],
            };
          }

          case 'remove_tags': {
            if (!noteIds || !tags) {
              throw new Error('remove_tags requires noteIds and tags');
            }
            await ankiClient.note.removeTags({ notes: noteIds, tags: tags.join(' ') });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Removed tags [${tags.join(', ')}] from ${noteIds.length} flashcard(s)`,
                },
              ],
            };
          }

          case 'clear_empty': {
            await ankiClient.note.removeEmptyNotes();
            return {
              content: [
                {
                  type: 'text',
                  text: '✓ Cleared all empty flashcards from collection',
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      } catch (error) {
        throw new Error(
          `manage_flashcards failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  /**
   * TOOL 2: study_session
   * Interactive quiz and review operations
   * Covers: finding cards to study, answering cards, reviewing
   */
  server.tool(
    'study_session',
    {
      operation: z
        .enum(['find_due', 'answer', 'suspend', 'unsuspend', 'check_status', 'forget', 'relearn'])
        .describe('Study session operation'),

      query: z.string().optional().describe('Search query to find cards (for find_due)'),

      cardIds: z.array(z.number()).optional().describe('Card IDs to operate on'),

      answers: z
        .array(
          z.object({
            cardId: z.number(),
            ease: z.number().min(1).max(4).describe('1=Again, 2=Hard, 3=Good, 4=Easy'),
          })
        )
        .optional()
        .describe('Card answers (for answer operation)'),

      days: z.string().optional().describe('Days from today for due date (for reschedule)'),
    },
    async ({ operation, query, cardIds, answers }) => {
      try {
        switch (operation) {
          case 'find_due': {
            if (!query) {
              throw new Error('find_due requires query parameter');
            }
            const foundCardIds = await ankiClient.card.findCards({ query });

            if (foundCardIds.length > 0) {
              const dueStatus = await ankiClient.card.areDue({ cards: foundCardIds });
              const dueCards = foundCardIds.filter((_, idx) => dueStatus[idx]);
              return {
                content: [
                  {
                    type: 'text',
                    text: `Found ${foundCardIds.length} cards matching "${query}"\n${dueCards.length} are due for review now\nDue card IDs: [${dueCards.join(', ')}]`,
                  },
                ],
              };
            }

            return {
              content: [
                {
                  type: 'text',
                  text: `No cards found matching "${query}"`,
                },
              ],
            };
          }

          case 'answer': {
            if (!answers || answers.length === 0) {
              throw new Error('answer requires answers array');
            }
            const results = await ankiClient.card.answerCards({ answers });
            const successCount = results.filter(Boolean).length;
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Answered ${successCount}/${answers.length} cards successfully`,
                },
              ],
            };
          }

          case 'suspend': {
            if (!cardIds || cardIds.length === 0) {
              throw new Error('suspend requires cardIds');
            }
            await ankiClient.card.suspend({ cards: cardIds });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Suspended ${cardIds.length} card(s)`,
                },
              ],
            };
          }

          case 'unsuspend': {
            if (!cardIds || cardIds.length === 0) {
              throw new Error('unsuspend requires cardIds');
            }
            await ankiClient.card.unsuspend({ cards: cardIds });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Unsuspended ${cardIds.length} card(s)`,
                },
              ],
            };
          }

          case 'check_status': {
            if (!cardIds || cardIds.length === 0) {
              throw new Error('check_status requires cardIds');
            }
            const [dueStatus, suspendedStatus] = await Promise.all([
              ankiClient.card.areDue({ cards: cardIds }),
              ankiClient.card.areSuspended({ cards: cardIds }),
            ]);

            const statusInfo = cardIds.map((id, idx) => ({
              cardId: id,
              isDue: dueStatus[idx],
              isSuspended: suspendedStatus[idx],
            }));

            return {
              content: [
                {
                  type: 'text',
                  text: `Card status:\n${JSON.stringify(statusInfo, null, 2)}`,
                },
              ],
            };
          }

          case 'forget': {
            if (!cardIds || cardIds.length === 0) {
              throw new Error('forget requires cardIds');
            }
            await ankiClient.card.forgetCards({ cards: cardIds });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Reset ${cardIds.length} card(s) to new status`,
                },
              ],
            };
          }

          case 'relearn': {
            if (!cardIds || cardIds.length === 0) {
              throw new Error('relearn requires cardIds');
            }
            await ankiClient.card.relearnCards({ cards: cardIds });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Set ${cardIds.length} card(s) to relearn`,
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      } catch (error) {
        throw new Error(
          `study_session failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  /**
   * TOOL 3: manage_decks
   * Deck creation, configuration, and organization
   */
  server.tool(
    'manage_decks',
    {
      operation: z
        .enum(['create', 'delete', 'list', 'get_stats', 'move_cards', 'get_config', 'set_config'])
        .describe('Deck management operation'),

      deckName: z.string().optional().describe('Deck name'),
      deckNames: z.array(z.string()).optional().describe('Deck names (for batch operations)'),
      deleteCards: z.boolean().optional().describe('Delete cards when deleting deck'),

      cardIds: z.array(z.number()).optional().describe('Card IDs to move'),
      targetDeck: z.string().optional().describe('Target deck for moving cards'),

      configId: z.number().optional().describe('Config ID to apply'),
    },
    async ({ operation, deckName, deckNames, deleteCards, cardIds, targetDeck, configId }) => {
      try {
        switch (operation) {
          case 'create': {
            if (!deckName) {
              throw new Error('create requires deckName');
            }
            const result = await ankiClient.deck.createDeck({ deck: deckName });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Created deck "${deckName}" (ID: ${result})`,
                },
              ],
            };
          }

          case 'delete': {
            if (!deckNames || deckNames.length === 0) {
              throw new Error('delete requires deckNames');
            }
            await ankiClient.deck.deleteDecks({
              decks: deckNames,
              cardsToo: (deleteCards ?? true) as true,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Deleted deck(s): ${deckNames.join(', ')}${deleteCards !== false ? ' (including cards)' : ''}`,
                },
              ],
            };
          }

          case 'list': {
            const decks = await ankiClient.deck.deckNamesAndIds();
            const deckList = Object.entries(decks)
              .map(([name, id]) => `  • ${name} (ID: ${id})`)
              .join('\n');
            return {
              content: [
                {
                  type: 'text',
                  text: `Decks (${Object.keys(decks).length}):\n${deckList}`,
                },
              ],
            };
          }

          case 'get_stats': {
            if (!deckName) {
              throw new Error('get_stats requires deckName');
            }
            const stats = await ankiClient.deck.getDeckStats({ decks: [deckName] });
            return {
              content: [
                {
                  type: 'text',
                  text: `Statistics for "${deckName}":\n${JSON.stringify(stats, null, 2)}`,
                },
              ],
            };
          }

          case 'move_cards': {
            if (!cardIds || !targetDeck) {
              throw new Error('move_cards requires cardIds and targetDeck');
            }
            await ankiClient.deck.changeDeck({ cards: cardIds, deck: targetDeck });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Moved ${cardIds.length} card(s) to "${targetDeck}"`,
                },
              ],
            };
          }

          case 'get_config': {
            if (!deckName) {
              throw new Error('get_config requires deckName');
            }
            const config = await ankiClient.deck.getDeckConfig({ deck: deckName });
            return {
              content: [
                {
                  type: 'text',
                  text: `Config for "${deckName}":\n${JSON.stringify(config, null, 2)}`,
                },
              ],
            };
          }

          case 'set_config': {
            if (!deckNames || !configId) {
              throw new Error('set_config requires deckNames and configId');
            }
            await ankiClient.deck.setDeckConfigId({ configId, decks: deckNames });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Applied config ${configId} to: ${deckNames.join(', ')}`,
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      } catch (error) {
        throw new Error(
          `manage_decks failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  /**
   * TOOL 4: get_analytics
   * Statistics and learning insights
   */
  server.tool(
    'get_analytics',
    {
      scope: z
        .enum([
          'deck_stats',
          'collection_stats',
          'reviews_by_day',
          'reviews_today',
          'card_reviews',
          'card_details',
        ])
        .describe('Analytics scope'),

      deckName: z.string().optional().describe('Deck name for deck-specific stats'),
      cardIds: z.array(z.number()).optional().describe('Card IDs for detailed analysis'),
      startTimestamp: z.number().optional().describe('Start timestamp for review history'),
      wholeCollection: z
        .boolean()
        .optional()
        .describe('Get whole collection stats vs current deck'),
    },
    async ({ scope, deckName, cardIds, startTimestamp, wholeCollection }) => {
      try {
        switch (scope) {
          case 'deck_stats': {
            if (!deckName) {
              throw new Error('deck_stats requires deckName');
            }
            const stats = await ankiClient.deck.getDeckStats({ decks: [deckName] });
            return {
              content: [
                {
                  type: 'text',
                  text: `📊 Statistics for "${deckName}":\n${JSON.stringify(stats, null, 2)}`,
                },
              ],
            };
          }

          case 'collection_stats': {
            const statsHTML = await ankiClient.statistic.getCollectionStatsHTML({
              wholeCollection: wholeCollection ?? true,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: `📊 Collection Statistics (${wholeCollection ? 'all decks' : 'current deck'}):\n${statsHTML}`,
                },
              ],
            };
          }

          case 'reviews_by_day': {
            const reviewsByDay = await ankiClient.statistic.getNumCardsReviewedByDay();
            return {
              content: [
                {
                  type: 'text',
                  text: `📊 Reviews by day (${reviewsByDay.length} days):\n${JSON.stringify(reviewsByDay, null, 2)}`,
                },
              ],
            };
          }

          case 'reviews_today': {
            const count = await ankiClient.statistic.getNumCardsReviewedToday();
            return {
              content: [
                {
                  type: 'text',
                  text: `📊 Cards reviewed today: ${count}`,
                },
              ],
            };
          }

          case 'card_reviews': {
            if (!deckName || startTimestamp === undefined) {
              throw new Error('card_reviews requires deckName and startTimestamp');
            }
            const reviews = await ankiClient.statistic.cardReviews({
              deck: deckName,
              startID: startTimestamp,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: `📊 Found ${reviews.length} reviews for "${deckName}" after ${startTimestamp}:\n${JSON.stringify(reviews, null, 2)}`,
                },
              ],
            };
          }

          case 'card_details': {
            if (!cardIds || cardIds.length === 0) {
              throw new Error('card_details requires cardIds');
            }
            const [easeFactors, intervals] = await Promise.all([
              ankiClient.card.getEaseFactors({ cards: cardIds }),
              ankiClient.card.getIntervals({ cards: cardIds, complete: false }),
            ]);

            const details = cardIds.map((id, idx) => ({
              cardId: id,
              easeFactor: easeFactors[idx],
              currentInterval: intervals[idx],
            }));

            return {
              content: [
                {
                  type: 'text',
                  text: `📊 Card details:\n${JSON.stringify(details, null, 2)}`,
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown scope: ${scope}`);
        }
      } catch (error) {
        throw new Error(
          `get_analytics failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  /**
   * TOOL 5: manage_models
   * Note type (model) configuration
   */
  server.tool(
    'manage_models',
    {
      operation: z
        .enum([
          'list',
          'create',
          'add_field',
          'remove_field',
          'rename_field',
          'add_template',
          'remove_template',
          'update_styling',
        ])
        .describe('Model management operation'),

      modelName: z.string().optional().describe('Model/note type name'),

      // For create
      fields: z.array(z.string()).optional().describe('Field names in order (for create)'),
      templates: z
        .array(
          z.object({
            Front: z.string(),
            Back: z.string(),
          })
        )
        .optional()
        .describe('Card templates (for create)'),
      css: z.string().optional().describe('CSS styling'),
      isCloze: z.boolean().optional().describe('Is cloze deletion type'),

      // For field operations
      fieldName: z.string().optional().describe('Field name'),
      newFieldName: z.string().optional().describe('New field name (for rename)'),
      fieldIndex: z.number().optional().describe('Field index position'),

      // For template operations
      templateName: z.string().optional().describe('Template name'),
      template: z
        .object({
          Front: z.string(),
          Back: z.string(),
        })
        .optional()
        .describe('Template content'),
    },
    async ({
      operation,
      modelName,
      fields,
      templates,
      css,
      isCloze,
      fieldName,
      newFieldName,
      fieldIndex,
      templateName,
      template,
    }) => {
      try {
        switch (operation) {
          case 'list': {
            const models = await ankiClient.model.modelNamesAndIds();
            const modelList = Object.entries(models)
              .map(([name, id]) => `  • ${name} (ID: ${id})`)
              .join('\n');
            return {
              content: [
                {
                  type: 'text',
                  text: `Note Types (${Object.keys(models).length}):\n${modelList}`,
                },
              ],
            };
          }

          case 'create': {
            if (!modelName || !fields || !templates) {
              throw new Error('create requires modelName, fields, and templates');
            }
            const modelParams: any = {
              modelName,
              inOrderFields: fields,
              cardTemplates: templates,
            };
            if (css) modelParams.css = css;
            if (isCloze !== undefined) modelParams.isCloze = isCloze;

            const result = await ankiClient.model.createModel(modelParams);
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Created note type "${modelName}" (ID: ${result.id})`,
                },
              ],
            };
          }

          case 'add_field': {
            if (!modelName || !fieldName || fieldIndex === undefined) {
              throw new Error('add_field requires modelName, fieldName, and fieldIndex');
            }
            await ankiClient.model.modelFieldAdd({ modelName, fieldName, index: fieldIndex });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Added field "${fieldName}" to "${modelName}" at position ${fieldIndex}`,
                },
              ],
            };
          }

          case 'remove_field': {
            if (!modelName || !fieldName) {
              throw new Error('remove_field requires modelName and fieldName');
            }
            await ankiClient.model.modelFieldRemove({ modelName, fieldName });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Removed field "${fieldName}" from "${modelName}"`,
                },
              ],
            };
          }

          case 'rename_field': {
            if (!modelName || !fieldName || !newFieldName) {
              throw new Error('rename_field requires modelName, fieldName, and newFieldName');
            }
            await ankiClient.model.modelFieldRename({
              modelName,
              oldFieldName: fieldName,
              newFieldName,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Renamed field "${fieldName}" to "${newFieldName}" in "${modelName}"`,
                },
              ],
            };
          }

          case 'add_template': {
            if (!modelName || !template) {
              throw new Error('add_template requires modelName and template');
            }
            await ankiClient.model.modelTemplateAdd({ modelName, template });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Added template to "${modelName}"`,
                },
              ],
            };
          }

          case 'remove_template': {
            if (!modelName || !templateName) {
              throw new Error('remove_template requires modelName and templateName');
            }
            await ankiClient.model.modelTemplateRemove({ modelName, templateName });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Removed template "${templateName}" from "${modelName}"`,
                },
              ],
            };
          }

          case 'update_styling': {
            if (!modelName || !css) {
              throw new Error('update_styling requires modelName and css');
            }
            await ankiClient.model.updateModelStyling({ model: { name: modelName, css } });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Updated styling for "${modelName}"`,
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      } catch (error) {
        throw new Error(
          `manage_models failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  /**
   * TOOL 6: anki_operations
   * Utility operations: sync, media, export/import, version
   */
  server.tool(
    'anki_operations',
    {
      operation: z
        .enum([
          'sync',
          'version',
          'export_deck',
          'import_package',
          'store_media',
          'retrieve_media',
          'delete_media',
          'list_media',
          'get_profiles',
        ])
        .describe('Anki utility operation'),

      // Export/import
      deckName: z.string().optional().describe('Deck name to export'),
      filePath: z.string().optional().describe('File path for export/import'),
      includeSched: z.boolean().optional().describe('Include scheduling in export'),

      // Media
      filename: z.string().optional().describe('Media filename'),
      mediaData: z.string().optional().describe('Base64 encoded media data'),
      mediaUrl: z.string().optional().describe('URL to download media from'),
      pattern: z.string().optional().describe('Pattern to match media files'),
    },
    async ({
      operation,
      deckName,
      filePath,
      includeSched,
      filename,
      mediaData,
      mediaUrl,
      pattern,
    }) => {
      try {
        switch (operation) {
          case 'sync': {
            await ankiClient.miscellaneous.sync();
            return {
              content: [
                {
                  type: 'text',
                  text: '✓ Sync initiated successfully',
                },
              ],
            };
          }

          case 'version': {
            const version = await ankiClient.miscellaneous.version();
            return {
              content: [
                {
                  type: 'text',
                  text: `AnkiConnect version: ${version}`,
                },
              ],
            };
          }

          case 'export_deck': {
            if (!deckName || !filePath) {
              throw new Error('export_deck requires deckName and filePath');
            }
            const params: any = { deck: deckName, path: filePath };
            if (includeSched !== undefined) params.includeSched = includeSched;
            await ankiClient.miscellaneous.exportPackage(params);
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Exported deck "${deckName}" to ${filePath}`,
                },
              ],
            };
          }

          case 'import_package': {
            if (!filePath) {
              throw new Error('import_package requires filePath');
            }
            await ankiClient.miscellaneous.importPackage({ path: filePath });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Imported package from ${filePath}`,
                },
              ],
            };
          }

          case 'store_media': {
            if (!filename) {
              throw new Error('store_media requires filename');
            }
            if (!mediaData && !mediaUrl) {
              throw new Error('store_media requires either mediaData or mediaUrl');
            }
            const params: any = { filename };
            if (mediaData) params.data = mediaData;
            if (mediaUrl) params.url = mediaUrl;

            const storedName = await ankiClient.media.storeMediaFile(params);
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Stored media file as: ${storedName}`,
                },
              ],
            };
          }

          case 'retrieve_media': {
            if (!filename) {
              throw new Error('retrieve_media requires filename');
            }
            const content = await ankiClient.media.retrieveMediaFile({ filename });
            if (content === false) {
              return {
                content: [
                  {
                    type: 'text',
                    text: `Media file "${filename}" not found`,
                  },
                ],
              };
            }
            return {
              content: [
                {
                  type: 'text',
                  text: `Retrieved "${filename}" (${content.length} chars)`,
                },
              ],
            };
          }

          case 'delete_media': {
            if (!filename) {
              throw new Error('delete_media requires filename');
            }
            await ankiClient.media.deleteMediaFile({ filename });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Deleted media file: ${filename}`,
                },
              ],
            };
          }

          case 'list_media': {
            if (!pattern) {
              throw new Error('list_media requires pattern (e.g., "*.jpg", "*")');
            }
            const files = await ankiClient.media.getMediaFilesNames({ pattern });
            return {
              content: [
                {
                  type: 'text',
                  text: `Media files matching "${pattern}" (${files.length}):\n${JSON.stringify(files, null, 2)}`,
                },
              ],
            };
          }

          case 'get_profiles': {
            const profiles = await ankiClient.miscellaneous.getProfiles();
            return {
              content: [
                {
                  type: 'text',
                  text: `Available profiles:\n${JSON.stringify(profiles, null, 2)}`,
                },
              ],
            };
          }

          default:
            throw new Error(`Unknown operation: ${operation}`);
        }
      } catch (error) {
        throw new Error(
          `anki_operations failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  /**
   * TOOL 7: get_media_file
   * Retrieve media files from Anki collection as base64-encoded data
   * This enables AI assistants to view and work with images/audio referenced in cards
   */
  server.tool(
    'get_media_file',
    {
      filename: z.string().describe('Media filename referenced in Anki cards (e.g., "image.png")'),
    },
    async ({ filename }) => {
      try {
        // Validate filename (basic security check)
        if (
          !filename ||
          filename.includes('..') ||
          filename.includes('/') ||
          filename.includes('\\')
        ) {
          throw new Error('Invalid filename: must be a simple filename without path traversal');
        }

        // Retrieve the media file from AnkiConnect
        const base64Content = await ankiClient.media.retrieveMediaFile({ filename });

        if (base64Content === false) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  error: `File not found: ${filename}`,
                  filename,
                }),
              },
            ],
          };
        }

        // Detect MIME type from file extension
        const extension = filename.split('.').pop()?.toLowerCase() || '';
        const mimeType = MIME_TYPES[extension] || 'application/octet-stream';

        // Calculate size (approximate from base64 length)
        const size = Math.floor((base64Content.length * 3) / 4);

        // Return the file data with metadata
        const response = {
          filename,
          mimeType,
          base64Data: base64Content,
          size,
        };

        // For images, return as image content that Claude can analyze
        // Note: Claude can see the image but it won't display to the user
        if (mimeType.startsWith('image/')) {
          return {
            content: [
              {
                type: 'image',
                data: base64Content,
                mimeType,
              },
              {
                type: 'text',
                text: `📷 Image: ${filename}
Format: ${mimeType}
Size: ${(size / 1024).toFixed(1)} KB

Note: I can see and analyze this image, but it won't display in the UI. I can describe what I see or answer questions about it.`,
              },
            ],
          };
        }

        // For non-images, return as text with metadata
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: `Failed to retrieve media file: ${error instanceof Error ? error.message : String(error)}`,
                filename,
              }),
            },
          ],
        };
      }
    }
  );
}
