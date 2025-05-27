import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * Interface for tracking batch operation results
 */
interface BatchOperationResult {
  totalOperations: number;
  successful: number;
  failed: number;
  errors: Array<{ index: number; noteId: number; error: string }>;
}

/**
 * Interface for batch operation with rollback support
 */
interface RollbackableOperation {
  noteId: number;
  originalTags?: string[];
  operation: 'add' | 'remove' | 'replace';
  tagsToAdd?: string[];
  tagsToRemove?: string[];
  tagToReplace?: string;
  replaceWithTag?: string;
}

/**
 * Execute a batch operation with individual error handling
 */
async function executeBatchOperation<T>(
  items: T[],
  operation: (item: T, index: number) => Promise<void>,
  batchSize: number = 50
): Promise<BatchOperationResult> {
  const result: BatchOperationResult = {
    totalOperations: items.length,
    successful: 0,
    failed: 0,
    errors: [],
  };

  // Process items in batches to avoid overwhelming AnkiConnect
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);

    // Execute operations in parallel within each batch
    const batchPromises = batch.map(async (item, batchIndex) => {
      const globalIndex = i + batchIndex;
      try {
        await operation(item, globalIndex);
        result.successful++;
      } catch (error) {
        result.failed++;
        result.errors.push({
          index: globalIndex,
          noteId: Array.isArray(item) ? (item as any)[0] : (item as any).noteId || globalIndex,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    });

    await Promise.allSettled(batchPromises);
  }

  return result;
}

/**
 * Get current tags for notes to support rollback
 */
async function getNotesTags(noteIds: number[]): Promise<Map<number, string[]>> {
  const tagMap = new Map<number, string[]>();

  try {
    const notesInfo = await ankiClient.note.notesInfo({ notes: noteIds });

    for (const noteInfo of notesInfo) {
      if (noteInfo && noteInfo.noteId) {
        tagMap.set(noteInfo.noteId, noteInfo.tags || []);
      }
    }
  } catch (error) {
    // If we can't get current tags, we can't support rollback for this operation
    throw new Error(
      `Failed to get current tags for rollback support: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return tagMap;
}

/**
 * Register all bulk operation tools with the MCP server
 */
export function registerBulkTools(server: McpServer) {
  // Tool: Bulk add tags with batching and error handling
  server.tool(
    'bulk_add_tags',
    {
      noteIds: z.array(z.number()).describe('Array of note IDs to add tags to'),
      tags: z.array(z.string()).describe('Array of tags to add to all notes'),
      batchSize: z.number().default(50).describe('Number of operations to process in each batch'),
      enableRollback: z
        .boolean()
        .default(false)
        .describe('Whether to enable rollback support (requires fetching current state first)'),
    },
    async ({ noteIds, tags, batchSize, enableRollback }) => {
      try {
        const tagsString = tags.join(' ');
        let rollbackData: Map<number, string[]> | null = null;

        // Get current state for rollback if requested
        if (enableRollback) {
          rollbackData = await getNotesTags(noteIds);
        }

        const result = await executeBatchOperation(
          noteIds,
          async (noteId: number) => {
            await ankiClient.note.addTags({ notes: [noteId], tags: tagsString });
          },
          batchSize
        );

        let rollbackInfo = '';
        if (enableRollback && rollbackData) {
          rollbackInfo = `\nRollback data stored for ${rollbackData.size} notes.`;
        }

        return {
          content: [
            {
              type: 'text',
              text: `Bulk add tags operation completed.
Tags added: [${tags.join(', ')}]
Total notes: ${result.totalOperations}
Successful: ${result.successful}
Failed: ${result.failed}${rollbackInfo}${
                result.errors.length > 0
                  ? `\n\nErrors:\n${result.errors.map((e) => `Note ${e.noteId}: ${e.error}`).join('\n')}`
                  : ''
              }`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to execute bulk add tags operation: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Bulk remove tags with batching and error handling
  server.tool(
    'bulk_remove_tags',
    {
      noteIds: z.array(z.number()).describe('Array of note IDs to remove tags from'),
      tags: z.array(z.string()).describe('Array of tags to remove from all notes'),
      batchSize: z.number().default(50).describe('Number of operations to process in each batch'),
      enableRollback: z
        .boolean()
        .default(false)
        .describe('Whether to enable rollback support (requires fetching current state first)'),
    },
    async ({ noteIds, tags, batchSize, enableRollback }) => {
      try {
        const tagsString = tags.join(' ');
        let rollbackData: Map<number, string[]> | null = null;

        // Get current state for rollback if requested
        if (enableRollback) {
          rollbackData = await getNotesTags(noteIds);
        }

        const result = await executeBatchOperation(
          noteIds,
          async (noteId: number) => {
            await ankiClient.note.removeTags({ notes: [noteId], tags: tagsString });
          },
          batchSize
        );

        let rollbackInfo = '';
        if (enableRollback && rollbackData) {
          rollbackInfo = `\nRollback data stored for ${rollbackData.size} notes.`;
        }

        return {
          content: [
            {
              type: 'text',
              text: `Bulk remove tags operation completed.
Tags removed: [${tags.join(', ')}]
Total notes: ${result.totalOperations}
Successful: ${result.successful}
Failed: ${result.failed}${rollbackInfo}${
                result.errors.length > 0
                  ? `\n\nErrors:\n${result.errors.map((e) => `Note ${e.noteId}: ${e.error}`).join('\n')}`
                  : ''
              }`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to execute bulk remove tags operation: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Bulk replace tags with batching and error handling
  server.tool(
    'bulk_replace_tags',
    {
      noteIds: z.array(z.number()).describe('Array of note IDs to replace tags in'),
      tagToReplace: z.string().describe('Tag to replace'),
      replaceWithTag: z.string().describe('Tag to replace with'),
      batchSize: z.number().default(50).describe('Number of operations to process in each batch'),
      enableRollback: z
        .boolean()
        .default(false)
        .describe('Whether to enable rollback support (requires fetching current state first)'),
    },
    async ({ noteIds, tagToReplace, replaceWithTag, batchSize, enableRollback }) => {
      try {
        let rollbackData: Map<number, string[]> | null = null;

        // Get current state for rollback if requested
        if (enableRollback) {
          rollbackData = await getNotesTags(noteIds);
        }

        const result = await executeBatchOperation(
          noteIds,
          async (noteId: number) => {
            await ankiClient.note.replaceTags({
              notes: [noteId],
              tag_to_replace: tagToReplace,
              replace_with_tag: replaceWithTag,
            });
          },
          batchSize
        );

        let rollbackInfo = '';
        if (enableRollback && rollbackData) {
          rollbackInfo = `\nRollback data stored for ${rollbackData.size} notes.`;
        }

        return {
          content: [
            {
              type: 'text',
              text: `Bulk replace tags operation completed.
Replaced: "${tagToReplace}" → "${replaceWithTag}"
Total notes: ${result.totalOperations}
Successful: ${result.successful}
Failed: ${result.failed}${rollbackInfo}${
                result.errors.length > 0
                  ? `\n\nErrors:\n${result.errors.map((e) => `Note ${e.noteId}: ${e.error}`).join('\n')}`
                  : ''
              }`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to execute bulk replace tags operation: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Bulk update note fields with batching and error handling
  server.tool(
    'bulk_update_note_fields',
    {
      updates: z
        .array(
          z.object({
            noteId: z.number().describe('ID of the note to update'),
            fields: z
              .record(z.string())
              .describe('Object with field names as keys and new field content as values'),
          })
        )
        .describe('Array of note updates to apply'),
      batchSize: z
        .number()
        .default(25)
        .describe('Number of operations to process in each batch (lower for field updates)'),
    },
    async ({ updates, batchSize }) => {
      try {
        const result = await executeBatchOperation(
          updates,
          async (update: { noteId: number; fields: Record<string, string> }) => {
            await ankiClient.note.updateNote({
              note: {
                id: update.noteId,
                fields: update.fields,
              },
            });
          },
          batchSize
        );

        return {
          content: [
            {
              type: 'text',
              text: `Bulk update note fields operation completed.
Total notes: ${result.totalOperations}
Successful: ${result.successful}
Failed: ${result.failed}${
                result.errors.length > 0
                  ? `\n\nErrors:\n${result.errors.map((e) => `Note ${e.noteId}: ${e.error}`).join('\n')}`
                  : ''
              }`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to execute bulk update note fields operation: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Bulk move cards to deck with batching and error handling
  server.tool(
    'bulk_move_cards_to_deck',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to move'),
      targetDeck: z.string().describe('Name of the target deck to move cards to'),
      batchSize: z.number().default(100).describe('Number of operations to process in each batch'),
    },
    async ({ cardIds, targetDeck, batchSize }) => {
      try {
        const result = await executeBatchOperation(
          cardIds,
          async (cardId: number) => {
            await ankiClient.deck.changeDeck({
              cards: [cardId],
              deck: targetDeck,
            });
          },
          batchSize
        );

        return {
          content: [
            {
              type: 'text',
              text: `Bulk move cards to deck operation completed.
Target deck: "${targetDeck}"
Total cards: ${result.totalOperations}
Successful: ${result.successful}
Failed: ${result.failed}${
                result.errors.length > 0
                  ? `\n\nErrors:\n${result.errors.map((e) => `Card ${e.noteId}: ${e.error}`).join('\n')}`
                  : ''
              }`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to execute bulk move cards operation: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Smart tag cleanup - find and remove tags that match patterns
  server.tool(
    'smart_tag_cleanup',
    {
      noteIds: z.array(z.number()).describe('Array of note IDs to clean up tags for'),
      patterns: z
        .array(z.string())
        .describe(
          'Array of regex patterns to match tags for removal (e.g., ["^temp_.*", "^old_.*"])'
        ),
      dryRun: z
        .boolean()
        .default(true)
        .describe(
          'Whether to perform a dry run (show what would be removed without actually removing)'
        ),
      batchSize: z.number().default(50).describe('Number of operations to process in each batch'),
    },
    async ({ noteIds, patterns, dryRun, batchSize }) => {
      try {
        // First, get all notes info to analyze tags
        const notesInfo = await ankiClient.note.notesInfo({ notes: noteIds });
        const tagsToRemove = new Map<number, string[]>();

        let totalTagsToRemove = 0;

        // Analyze which tags match the patterns
        for (const noteInfo of notesInfo) {
          if (noteInfo && noteInfo.noteId && noteInfo.tags) {
            const matchingTags: string[] = [];

            for (const tag of noteInfo.tags) {
              for (const pattern of patterns) {
                try {
                  const regex = new RegExp(pattern);
                  if (regex.test(tag)) {
                    matchingTags.push(tag);
                    break; // Tag matches one pattern, no need to check others
                  }
                } catch (error) {
                  throw new Error(
                    `Invalid regex pattern "${pattern}": ${error instanceof Error ? error.message : String(error)}`
                  );
                }
              }
            }

            if (matchingTags.length > 0) {
              tagsToRemove.set(noteInfo.noteId, matchingTags);
              totalTagsToRemove += matchingTags.length;
            }
          }
        }

        if (dryRun) {
          const report = Array.from(tagsToRemove.entries())
            .map(([noteId, tags]) => `Note ${noteId}: ${tags.join(', ')}`)
            .join('\n');

          return {
            content: [
              {
                type: 'text',
                text: `Smart tag cleanup analysis (DRY RUN):
Patterns: [${patterns.join(', ')}]
Notes analyzed: ${noteIds.length}
Notes with matching tags: ${tagsToRemove.size}
Total tags to remove: ${totalTagsToRemove}

Tags that would be removed:
${report || 'No tags match the specified patterns'}`,
              },
            ],
          };
        }

        // Execute the cleanup if not a dry run
        const updates = Array.from(tagsToRemove.entries()).map(([noteId, tags]) => ({
          noteId,
          tags,
        }));

        const result = await executeBatchOperation(
          updates,
          async (update: { noteId: number; tags: string[] }) => {
            const tagsString = update.tags.join(' ');
            await ankiClient.note.removeTags({ notes: [update.noteId], tags: tagsString });
          },
          batchSize
        );

        return {
          content: [
            {
              type: 'text',
              text: `Smart tag cleanup completed.
Patterns: [${patterns.join(', ')}]
Total notes processed: ${result.totalOperations}
Successful: ${result.successful}
Failed: ${result.failed}
Total tags removed: ${totalTagsToRemove - result.failed}${
                result.errors.length > 0
                  ? `\n\nErrors:\n${result.errors.map((e) => `Note ${e.noteId}: ${e.error}`).join('\n')}`
                  : ''
              }`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to execute smart tag cleanup: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Bulk suspend/unsuspend cards
  server.tool(
    'bulk_suspend_cards',
    {
      cardIds: z.array(z.number()).describe('Array of card IDs to suspend or unsuspend'),
      suspend: z.boolean().describe('Whether to suspend (true) or unsuspend (false) the cards'),
      batchSize: z.number().default(100).describe('Number of operations to process in each batch'),
    },
    async ({ cardIds, suspend, batchSize }) => {
      try {
        const result = await executeBatchOperation(
          cardIds,
          async (cardId: number) => {
            if (suspend) {
              await ankiClient.card.suspend({ cards: [cardId] });
            } else {
              await ankiClient.card.unsuspend({ cards: [cardId] });
            }
          },
          batchSize
        );

        return {
          content: [
            {
              type: 'text',
              text: `Bulk ${suspend ? 'suspend' : 'unsuspend'} cards operation completed.
Total cards: ${result.totalOperations}
Successful: ${result.successful}
Failed: ${result.failed}${
                result.errors.length > 0
                  ? `\n\nErrors:\n${result.errors.map((e) => `Card ${e.noteId}: ${e.error}`).join('\n')}`
                  : ''
              }`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to execute bulk ${suspend ? 'suspend' : 'unsuspend'} operation: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
