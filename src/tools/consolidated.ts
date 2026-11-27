import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ankiClient } from '../utils/ankiClient.js';
import {
  DEFAULT_CHUNK_SIZE,
  formatBatchReport,
  resolveNotes,
  runBatch,
  type NoteInput,
} from '../utils/batch.js';
import { formatDeckLimits, setDeckLimits } from '../utils/deckLimits.js';
import { InputError, errorMessage, explainWriteFailure } from '../utils/errors.js';
import { readNotesFile, resolveFilePath } from '../utils/notesFile.js';
import {
  DESCRIPTIONS,
  DESTRUCTIVE_WRITE,
  DESTRUCTIVE_WRITE_OPEN_WORLD,
  READ_ONLY,
} from './descriptions.js';

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
 * Builds the error thrown by a tool. For write operations it pings
 * AnkiConnect so the message says whether Anki is down or rejected the
 * request.
 */
async function toolError(tool: string, error: unknown, isWrite: boolean): Promise<Error> {
  const message = isWrite ? await explainWriteFailure(ankiClient, error) : errorMessage(error);
  return new Error(`${tool} failed: ${message}`);
}

const noteSchema = z.object({
  deckName: z.string().optional().describe('Overrides the top-level deckName for this note'),
  modelName: z.string().optional().describe('Overrides the top-level modelName for this note'),
  fields: z
    .record(z.string(), z.string())
    .describe('Field name -> value (HTML allowed), e.g. { "Front": "...", "Back": "..." }'),
  tags: z.array(z.string()).optional().describe('Added to the top-level tags'),
});

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
  server.registerTool(
    'manage_flashcards',
    {
      title: 'Manage flashcards',
      description: DESCRIPTIONS.manage_flashcards,
      annotations: DESTRUCTIVE_WRITE,
      inputSchema: {
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
          .describe('Which operation to run; see the tool description for required parameters'),

        // create / create_batch
        deckName: z
          .string()
          .optional()
          .describe(
            'create: target deck (required). create_batch: default deck for notes without their own deckName'
          ),
        modelName: z
          .string()
          .optional()
          .describe(
            'create: note type (required), e.g. "Basic". create_batch: default note type for notes without their own. Use manage_models list for field names'
          ),
        fields: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'create/update: field name -> value (HTML allowed). Names must match the note type, e.g. { "Front": "...", "Back": "..." }'
          ),
        tags: z
          .array(z.string())
          .optional()
          .describe(
            "create: tags for the note. create_batch: added to every note. update: replaces the note's tags. add_tags/remove_tags: tags to add/remove"
          ),

        // create_batch
        notes: z
          .array(noteSchema)
          .optional()
          .describe('create_batch: notes to add (or use filePath instead)'),
        filePath: z
          .string()
          .optional()
          .describe(
            'create_batch: absolute path to a .json (array of notes like `notes`), .csv or .tsv file. CSV/TSV: header row = field names, plus optional "tags" (space-separated), "deck" and "model" columns. Use instead of notes'
          ),
        dryRun: z
          .boolean()
          .optional()
          .describe(
            'create_batch: validate every note and report problems without writing anything'
          ),
        chunkSize: z
          .number()
          .int()
          .min(1)
          .max(50)
          .optional()
          .describe(`create_batch: notes per AnkiConnect request (default ${DEFAULT_CHUNK_SIZE})`),
        allowDuplicate: z
          .boolean()
          .optional()
          .describe(
            'create/create_batch: add notes even if the first field duplicates an existing note (default false)'
          ),
        duplicateScope: z
          .enum(['deck', 'collection'])
          .optional()
          .describe(
            'create/create_batch: where to look for duplicates: "collection" (default) or only the target "deck"'
          ),

        // update / delete / tags
        noteId: z.number().optional().describe('update: ID of the note to change'),
        noteIds: z
          .array(z.number())
          .optional()
          .describe('delete/add_tags/remove_tags: note IDs to act on'),

        // find
        query: z
          .string()
          .optional()
          .describe('find: Anki search query, e.g. "deck:Spanish tag:verbs added:7"'),
        includeDetails: z
          .boolean()
          .optional()
          .describe('find: include full note fields/tags instead of only IDs (larger output)'),
        limit: z.number().optional().describe('find: max results per page (default 50)'),
        offset: z.number().optional().describe('find: results to skip, for paging (default 0)'),

        // get_info
        cardIds: z.array(z.number()).optional().describe('get_info: card IDs (max 50)'),
      },
    },
    async (
      {
        operation,
        deckName,
        modelName,
        fields,
        tags,
        notes,
        filePath,
        dryRun,
        chunkSize,
        allowDuplicate,
        duplicateScope,
        noteId,
        noteIds,
        query,
        includeDetails,
        limit = 50,
        offset = 0,
        cardIds,
      },
      extra
    ) => {
      const isWrite = !['find', 'get_info'].includes(operation) && !dryRun;
      try {
        switch (operation) {
          case 'create': {
            if (!deckName || !modelName || !fields) {
              throw new InputError('create requires deckName, modelName, and fields');
            }
            const options: { allowDuplicate?: boolean; duplicateScope?: string } = {};
            if (allowDuplicate !== undefined) options.allowDuplicate = allowDuplicate;
            if (duplicateScope !== undefined) options.duplicateScope = duplicateScope;
            const note = {
              deckName,
              modelName,
              fields,
              tags: tags ?? [],
              ...(Object.keys(options).length > 0 ? { options } : {}),
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
            if (notes && filePath) {
              throw new InputError('create_batch takes either notes or filePath, not both');
            }
            let inputNotes: NoteInput[];
            let source: string | undefined;
            if (filePath) {
              inputNotes = await readNotesFile(filePath);
              source = resolveFilePath(filePath);
            } else if (notes) {
              inputNotes = notes.map((n) => {
                const note: NoteInput = { fields: n.fields };
                if (n.deckName) note.deckName = n.deckName;
                if (n.modelName) note.modelName = n.modelName;
                if (n.tags) note.tags = n.tags;
                return note;
              });
            } else {
              throw new InputError('create_batch requires notes or filePath');
            }
            if (inputNotes.length === 0) {
              throw new InputError(`create_batch: no notes found${source ? ` in ${source}` : ''}`);
            }

            const resolved = resolveNotes(inputNotes, { deckName, modelName, tags });
            const progressToken = extra._meta?.progressToken;
            const report = await runBatch(ankiClient, resolved, {
              chunkSize,
              dryRun,
              allowDuplicate,
              duplicateScope,
              onProgress:
                progressToken === undefined
                  ? undefined
                  : (done, total) =>
                      extra
                        .sendNotification({
                          method: 'notifications/progress',
                          params: {
                            progressToken,
                            progress: done,
                            total,
                            message: `Added ${done} of ${total} notes`,
                          },
                        })
                        .catch(() => {}),
            });
            return {
              content: [{ type: 'text', text: formatBatchReport(report, source) }],
              ...(report.abortedReason ? { isError: true } : {}),
            };
          }

          case 'update': {
            if (!noteId) {
              throw new InputError('update requires noteId');
            }
            if (!fields && !tags) {
              throw new InputError('update requires either fields or tags');
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
              throw new InputError('delete requires noteIds array');
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
              throw new InputError('find requires query parameter');
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
              throw new InputError('get_info requires cardIds array');
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
              throw new InputError('add_tags requires noteIds and tags');
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
              throw new InputError('remove_tags requires noteIds and tags');
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
            throw new InputError(`Unknown operation: ${operation}`);
        }
      } catch (error) {
        throw await toolError('manage_flashcards', error, isWrite);
      }
    }
  );

  /**
   * TOOL 2: study_session
   * Interactive quiz and review operations
   * Covers: finding cards to study, answering cards, reviewing
   */
  server.registerTool(
    'study_session',
    {
      title: 'Study session and scheduling',
      description: DESCRIPTIONS.study_session,
      annotations: DESTRUCTIVE_WRITE,
      inputSchema: {
        operation: z
          .enum(['find_due', 'answer', 'suspend', 'unsuspend', 'check_status', 'forget', 'relearn'])
          .describe('Which operation to run; see the tool description for required parameters'),

        query: z
          .string()
          .optional()
          .describe('find_due: Anki search query, e.g. "deck:Spanish" or "tag:verbs"'),

        cardIds: z
          .array(z.number())
          .optional()
          .describe('check_status/suspend/unsuspend/forget/relearn: card IDs (not note IDs)'),

        answers: z
          .array(
            z.object({
              cardId: z.number(),
              ease: z.number().min(1).max(4).describe('1=Again, 2=Hard, 3=Good, 4=Easy'),
            })
          )
          .optional()
          .describe('answer: one entry per reviewed card'),
      },
    },
    async ({ operation, query, cardIds, answers }) => {
      const isWrite = !['find_due', 'check_status'].includes(operation);
      try {
        switch (operation) {
          case 'find_due': {
            if (!query) {
              throw new InputError('find_due requires query parameter');
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
              throw new InputError('answer requires answers array');
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
              throw new InputError('suspend requires cardIds');
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
              throw new InputError('unsuspend requires cardIds');
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
              throw new InputError('check_status requires cardIds');
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
              throw new InputError('forget requires cardIds');
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
              throw new InputError('relearn requires cardIds');
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
            throw new InputError(`Unknown operation: ${operation}`);
        }
      } catch (error) {
        throw await toolError('study_session', error, isWrite);
      }
    }
  );

  /**
   * TOOL 3: manage_decks
   * Deck creation, configuration, and organization
   */
  server.registerTool(
    'manage_decks',
    {
      title: 'Manage decks',
      description: DESCRIPTIONS.manage_decks,
      annotations: DESTRUCTIVE_WRITE,
      inputSchema: {
        operation: z
          .enum([
            'create',
            'delete',
            'list',
            'get_stats',
            'move_cards',
            'get_config',
            'set_config',
            'set_limits',
          ])
          .describe('Which operation to run; see the tool description for required parameters'),

        deckName: z
          .string()
          .optional()
          .describe(
            'create/set_limits/get_stats/get_config: deck name; use "Parent::Child" for subdecks'
          ),
        deckNames: z
          .array(z.string())
          .optional()
          .describe('delete/set_config: deck names to act on'),
        deleteCards: z
          .boolean()
          .optional()
          .describe(
            'delete: must be true or omitted; AnkiConnect always deletes a deck together with its cards'
          ),

        newPerDay: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('create/set_limits: max new cards per day for this deck only'),
        reviewsPerDay: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('create/set_limits: max reviews per day for this deck only'),

        cardIds: z.array(z.number()).optional().describe('move_cards: card IDs to move'),
        targetDeck: z
          .string()
          .optional()
          .describe('move_cards: destination deck (created if missing)'),

        configId: z
          .number()
          .optional()
          .describe('set_config: ID of an existing options preset (see get_config)'),
      },
    },
    async ({
      operation,
      deckName,
      deckNames,
      deleteCards,
      newPerDay,
      reviewsPerDay,
      cardIds,
      targetDeck,
      configId,
    }) => {
      const isWrite = !['list', 'get_stats', 'get_config'].includes(operation);
      try {
        switch (operation) {
          case 'create': {
            if (!deckName) {
              throw new InputError('create requires deckName');
            }
            const result = await ankiClient.deck.createDeck({ deck: deckName });
            let text = `✓ Created deck "${deckName}" (ID: ${String(result)})`;
            if (newPerDay !== undefined || reviewsPerDay !== undefined) {
              try {
                const limits = await setDeckLimits(ankiClient, deckName, {
                  newPerDay,
                  reviewsPerDay,
                });
                text += `\n${formatDeckLimits(deckName, limits)}`;
              } catch (limitsError) {
                const reason = await explainWriteFailure(ankiClient, limitsError);
                return {
                  content: [
                    {
                      type: 'text',
                      text: `${text}, but its limits were not set: ${reason}\nRetry with manage_decks set_limits.`,
                    },
                  ],
                  isError: true,
                };
              }
            }
            return { content: [{ type: 'text', text }] };
          }

          case 'set_limits': {
            if (!deckName) {
              throw new InputError('set_limits requires deckName');
            }
            if (newPerDay === undefined && reviewsPerDay === undefined) {
              throw new InputError('set_limits requires newPerDay and/or reviewsPerDay');
            }
            const limits = await setDeckLimits(ankiClient, deckName, { newPerDay, reviewsPerDay });
            return { content: [{ type: 'text', text: formatDeckLimits(deckName, limits) }] };
          }

          case 'delete': {
            if (!deckNames || deckNames.length === 0) {
              throw new InputError('delete requires deckNames');
            }
            if (deleteCards === false) {
              throw new InputError(
                'AnkiConnect can only delete a deck together with its cards. Move the cards elsewhere first with move_cards, then delete.'
              );
            }
            await ankiClient.deck.deleteDecks({
              decks: deckNames,
              cardsToo: true,
            });
            return {
              content: [
                {
                  type: 'text',
                  text: `✓ Deleted deck(s) and their cards: ${deckNames.join(', ')}`,
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
              throw new InputError('get_stats requires deckName');
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
              throw new InputError('move_cards requires cardIds and targetDeck');
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
              throw new InputError('get_config requires deckName');
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
              throw new InputError('set_config requires deckNames and configId');
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
            throw new InputError(`Unknown operation: ${operation}`);
        }
      } catch (error) {
        throw await toolError('manage_decks', error, isWrite);
      }
    }
  );

  /**
   * TOOL 4: get_analytics
   * Statistics and learning insights
   */
  server.registerTool(
    'get_analytics',
    {
      title: 'Study analytics',
      description: DESCRIPTIONS.get_analytics,
      annotations: READ_ONLY,
      inputSchema: {
        scope: z
          .enum([
            'deck_stats',
            'collection_stats',
            'reviews_by_day',
            'reviews_today',
            'card_reviews',
            'card_details',
          ])
          .describe('Which statistics to read; see the tool description for required parameters'),

        deckName: z.string().optional().describe('deck_stats/card_reviews: deck name'),
        cardIds: z.array(z.number()).optional().describe('card_details: card IDs'),
        startTimestamp: z
          .number()
          .optional()
          .describe(
            'card_reviews: only reviews after this review ID (epoch milliseconds), e.g. Date.now() - 7 days'
          ),
        wholeCollection: z
          .boolean()
          .optional()
          .describe(
            'collection_stats: true (default) for all decks, false for the current deck only'
          ),
      },
    },
    async ({ scope, deckName, cardIds, startTimestamp, wholeCollection }) => {
      try {
        switch (scope) {
          case 'deck_stats': {
            if (!deckName) {
              throw new InputError('deck_stats requires deckName');
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
              throw new InputError('card_reviews requires deckName and startTimestamp');
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
              throw new InputError('card_details requires cardIds');
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
            throw new InputError(`Unknown scope: ${scope}`);
        }
      } catch (error) {
        throw await toolError('get_analytics', error, false);
      }
    }
  );

  /**
   * TOOL 5: manage_models
   * Note type (model) configuration
   */
  server.registerTool(
    'manage_models',
    {
      title: 'Manage note types',
      description: DESCRIPTIONS.manage_models,
      annotations: DESTRUCTIVE_WRITE,
      inputSchema: {
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
          .describe('Which operation to run; see the tool description for required parameters'),

        modelName: z
          .string()
          .optional()
          .describe('Note type name (all operations except list), e.g. "Basic"'),

        // For create
        fields: z.array(z.string()).optional().describe('create: field names in order'),
        templates: z
          .array(
            z.object({
              Front: z.string(),
              Back: z.string(),
            })
          )
          .optional()
          .describe(
            'create: card templates, e.g. [{ Front: "{{Front}}", Back: "{{FrontSide}}<hr id=answer>{{Back}}" }]'
          ),
        css: z.string().optional().describe('create/update_styling: CSS for the card templates'),
        isCloze: z.boolean().optional().describe('create: make a cloze deletion note type'),

        // For field operations
        fieldName: z
          .string()
          .optional()
          .describe('add_field/remove_field/rename_field: field name (current name for rename)'),
        newFieldName: z.string().optional().describe('rename_field: new field name'),
        fieldIndex: z.number().optional().describe('add_field: 0-based position for the new field'),

        // For template operations
        templateName: z
          .string()
          .optional()
          .describe('remove_template: template name, e.g. "Card 1"'),
        template: z
          .object({
            Front: z.string(),
            Back: z.string(),
          })
          .optional()
          .describe('add_template: template to add, { Front, Back } HTML'),
      },
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
      const isWrite = operation !== 'list';
      try {
        switch (operation) {
          case 'list': {
            const models = await ankiClient.model.modelNamesAndIds();
            const details = await ankiClient.model.findModelsById({
              modelIds: Object.values(models),
            });
            const modelList = details
              .map((model) => {
                const fieldNames = [...model.flds]
                  .sort((a, b) => a.ord - b.ord)
                  .map((f) => f.name)
                  .join(', ');
                const cloze = model.type === 1 ? ', cloze' : '';
                return `  • ${model.name} (ID: ${model.id}${cloze}) fields: ${fieldNames}`;
              })
              .join('\n');
            return {
              content: [
                {
                  type: 'text',
                  text: `Note Types (${details.length}):\n${modelList}`,
                },
              ],
            };
          }

          case 'create': {
            if (!modelName || !fields || !templates) {
              throw new InputError('create requires modelName, fields, and templates');
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
              throw new InputError('add_field requires modelName, fieldName, and fieldIndex');
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
              throw new InputError('remove_field requires modelName and fieldName');
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
              throw new InputError('rename_field requires modelName, fieldName, and newFieldName');
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
              throw new InputError('add_template requires modelName and template');
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
              throw new InputError('remove_template requires modelName and templateName');
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
              throw new InputError('update_styling requires modelName and css');
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
            throw new InputError(`Unknown operation: ${operation}`);
        }
      } catch (error) {
        throw await toolError('manage_models', error, isWrite);
      }
    }
  );

  /**
   * TOOL 6: anki_operations
   * Utility operations: sync, media, export/import, version
   */
  server.registerTool(
    'anki_operations',
    {
      title: 'Anki utilities: sync, packages, media',
      description: DESCRIPTIONS.anki_operations,
      annotations: DESTRUCTIVE_WRITE_OPEN_WORLD,
      inputSchema: {
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
          .describe('Which operation to run; see the tool description for required parameters'),

        // Export/import
        deckName: z.string().optional().describe('export_deck: deck to export'),
        filePath: z
          .string()
          .optional()
          .describe('export_deck: .apkg path to write. import_package: .apkg path to read'),
        includeSched: z
          .boolean()
          .optional()
          .describe('export_deck: include review history and scheduling (default false)'),

        // Media
        filename: z
          .string()
          .optional()
          .describe('store_media/retrieve_media/delete_media: media file name, e.g. "cat.png"'),
        mediaData: z
          .string()
          .optional()
          .describe('store_media: base64 file contents (or use mediaUrl)'),
        mediaUrl: z
          .string()
          .optional()
          .describe('store_media: URL Anki downloads the file from (or use mediaData)'),
        pattern: z.string().optional().describe('list_media: glob pattern, e.g. "*.png" or "*"'),
      },
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
      const isWrite = !['version', 'retrieve_media', 'list_media', 'get_profiles'].includes(
        operation
      );
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
              throw new InputError('export_deck requires deckName and filePath');
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
              throw new InputError('import_package requires filePath');
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
              throw new InputError('store_media requires filename');
            }
            if (!mediaData && !mediaUrl) {
              throw new InputError('store_media requires either mediaData or mediaUrl');
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
              throw new InputError('retrieve_media requires filename');
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
              throw new InputError('delete_media requires filename');
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
              throw new InputError('list_media requires pattern (e.g., "*.jpg", "*")');
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
            throw new InputError(`Unknown operation: ${operation}`);
        }
      } catch (error) {
        throw await toolError('anki_operations', error, isWrite);
      }
    }
  );

  /**
   * TOOL 7: get_media_file
   * Retrieve media files from Anki collection as base64-encoded data
   * This enables AI assistants to view and work with images/audio referenced in cards
   */
  server.registerTool(
    'get_media_file',
    {
      title: 'Get media file contents',
      description: DESCRIPTIONS.get_media_file,
      annotations: READ_ONLY,
      inputSchema: {
        filename: z
          .string()
          .describe('Bare media file name as referenced in a card, e.g. "image.png" (no paths)'),
      },
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
          throw new InputError(
            'Invalid filename: must be a simple filename without path traversal'
          );
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
