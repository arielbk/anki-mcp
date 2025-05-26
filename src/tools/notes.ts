import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * Register all note-related tools with the MCP server
 */
export function registerNoteTools(server: McpServer) {
  // Tool: Add a new note
  server.tool(
    'add_note',
    {
      deckName: z.string().describe('Name of the deck to add the note to'),
      modelName: z.string().describe('Name of the note model/type (e.g., "Basic", "Cloze")'),
      fields: z
        .record(z.string())
        .describe('Object with field names as keys and field content as values'),
      tags: z.array(z.string()).optional().describe('Array of tags to add to the note'),
    },
    async ({ deckName, modelName, fields, tags }) => {
      try {
        const note = {
          deckName,
          modelName,
          fields,
          tags: tags || [],
        };

        const noteId = await ankiClient.note.addNote({ note });

        if (noteId === null) {
          throw new Error('Failed to add note - possibly a duplicate or invalid fields');
        }

        return {
          content: [
            {
              type: 'text',
              text: `Successfully added note with ID: ${noteId}. Deck: "${deckName}", Model: "${modelName}", Tags: [${tags?.join(', ') || 'none'}]`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to add note: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Add multiple notes
  server.tool(
    'add_notes',
    {
      notes: z
        .array(
          z.object({
            deckName: z.string().describe('Name of the deck to add the note to'),
            modelName: z.string().describe('Name of the note model/type'),
            fields: z
              .record(z.string())
              .describe('Object with field names as keys and field content as values'),
            tags: z.array(z.string()).optional().describe('Array of tags to add to the note'),
          })
        )
        .describe('Array of notes to add'),
    },
    async ({ notes }) => {
      try {
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
              text: `Batch note addition completed. Successfully added: ${successCount} notes, Failed: ${failureCount} notes. Results: ${JSON.stringify(results)}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to add notes: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Update an existing note
  server.tool(
    'update_note',
    {
      noteId: z.number().describe('ID of the note to update'),
      fields: z
        .record(z.string())
        .optional()
        .describe('Object with field names as keys and new field content as values'),
      tags: z.array(z.string()).optional().describe('Array of tags to set for the note'),
    },
    async ({ noteId, fields, tags }) => {
      try {
        if (!fields && !tags) {
          throw new Error('Either fields or tags must be provided for update');
        }

        const updateData: any = { id: noteId };
        if (fields) updateData.fields = fields;
        if (tags) updateData.tags = tags;

        await ankiClient.note.updateNote({ note: updateData });

        return {
          content: [
            {
              type: 'text',
              text: `Successfully updated note ${noteId}. ${fields ? 'Updated fields. ' : ''}${tags ? `Updated tags: [${tags.join(', ')}]` : ''}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to update note ${noteId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Delete notes
  server.tool(
    'delete_notes',
    {
      noteIds: z.array(z.number()).describe('Array of note IDs to delete'),
    },
    async ({ noteIds }) => {
      try {
        await ankiClient.note.deleteNotes({ notes: noteIds });

        return {
          content: [
            {
              type: 'text',
              text: `Successfully deleted ${noteIds.length} notes: [${noteIds.join(', ')}]`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to delete notes: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Add tags to notes
  server.tool(
    'add_tags_to_notes',
    {
      noteIds: z.array(z.number()).describe('Array of note IDs to add tags to'),
      tags: z.string().describe('Space-separated string of tags to add'),
    },
    async ({ noteIds, tags }) => {
      try {
        await ankiClient.note.addTags({ notes: noteIds, tags });

        return {
          content: [
            {
              type: 'text',
              text: `Successfully added tags "${tags}" to ${noteIds.length} notes: [${noteIds.join(', ')}]`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to add tags to notes: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Remove tags from notes
  server.tool(
    'remove_tags_from_notes',
    {
      noteIds: z.array(z.number()).describe('Array of note IDs to remove tags from'),
      tags: z.string().describe('Space-separated string of tags to remove'),
    },
    async ({ noteIds, tags }) => {
      try {
        await ankiClient.note.removeTags({ notes: noteIds, tags });

        return {
          content: [
            {
              type: 'text',
              text: `Successfully removed tags "${tags}" from ${noteIds.length} notes: [${noteIds.join(', ')}]`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to remove tags from notes: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Replace tags in notes
  server.tool(
    'replace_tags_in_notes',
    {
      noteIds: z.array(z.number()).describe('Array of note IDs to replace tags in'),
      tagToReplace: z.string().describe('Tag to replace'),
      replaceWithTag: z.string().describe('Tag to replace with'),
    },
    async ({ noteIds, tagToReplace, replaceWithTag }) => {
      try {
        await ankiClient.note.replaceTags({
          notes: noteIds,
          tag_to_replace: tagToReplace,
          replace_with_tag: replaceWithTag,
        });

        return {
          content: [
            {
              type: 'text',
              text: `Successfully replaced tag "${tagToReplace}" with "${replaceWithTag}" in ${noteIds.length} notes: [${noteIds.join(', ')}]`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to replace tags in notes: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Find notes by query
  server.tool(
    'find_notes',
    {
      query: z.string().describe('Anki search query to find notes'),
      includeInfo: z
        .boolean()
        .default(false)
        .describe('Whether to include detailed note information'),
      limit: z.number().default(50).describe('Maximum number of notes to return detailed info for'),
    },
    async ({ query, includeInfo, limit }) => {
      try {
        const noteIds = await ankiClient.note.findNotes({ query });

        let result = `Found ${noteIds.length} notes matching query: "${query}"`;

        if (includeInfo && noteIds.length > 0) {
          const limitedIds = noteIds.slice(0, limit);
          const notesInfo = await ankiClient.note.notesInfo({ notes: limitedIds });

          result += `\n\nDetailed information for first ${limitedIds.length} notes:\n${JSON.stringify(notesInfo, null, 2)}`;
        } else {
          result += `\n\nNote IDs: [${noteIds.join(', ')}]`;
        }

        return {
          content: [
            {
              type: 'text',
              text: result,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to find notes: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Check if notes can be added (validation)
  server.tool(
    'can_add_notes',
    {
      notes: z
        .array(
          z.object({
            deckName: z.string().describe('Name of the deck to add the note to'),
            modelName: z.string().describe('Name of the note model/type'),
            fields: z
              .record(z.string())
              .describe('Object with field names as keys and field content as values'),
            tags: z.array(z.string()).optional().describe('Array of tags to add to the note'),
          })
        )
        .describe('Array of notes to validate'),
    },
    async ({ notes }) => {
      try {
        const formattedNotes = notes.map((note) => ({
          ...note,
          tags: note.tags || [],
        }));

        const canAddResults = await ankiClient.note.canAddNotes({ notes: formattedNotes });

        const validCount = canAddResults.filter((result) => result).length;
        const invalidCount = canAddResults.length - validCount;

        return {
          content: [
            {
              type: 'text',
              text: `Note validation completed. Valid: ${validCount}, Invalid: ${invalidCount}. Results: ${JSON.stringify(canAddResults)}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to validate notes: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Clear unused tags
  server.tool('clear_unused_tags', {}, async () => {
    try {
      const removedTags = await ankiClient.note.clearUnusedTags();

      return {
        content: [
          {
            type: 'text',
            text: `Successfully cleared ${removedTags.length} unused tags: [${removedTags.join(', ')}]`,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to clear unused tags: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Tool: Remove empty notes
  server.tool('remove_empty_notes', {}, async () => {
    try {
      await ankiClient.note.removeEmptyNotes();

      return {
        content: [
          {
            type: 'text',
            text: 'Successfully removed all empty notes from the collection',
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to remove empty notes: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}
