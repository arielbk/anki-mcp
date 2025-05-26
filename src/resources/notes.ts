import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * Register all note-related resources with the MCP server
 */
export function registerNoteResources(server: McpServer) {
  // Static resource: Get all available note tags
  server.resource('note_tags', 'anki:///notes/tags', async (uri) => {
    try {
      const tags = await ankiClient.note.getTags();

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'application/json',
            text: JSON.stringify(
              {
                tags: tags.sort(),
                count: tags.length,
                description: 'All available tags in the Anki collection',
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to get tags: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Resource template: Get note information by IDs
  server.resource(
    'notes_info',
    new ResourceTemplate('anki:///notes/{noteIds}/info', { list: undefined }),
    async (uri) => {
      try {
        const noteIdsParam = uri.pathname.split('/').slice(-2)[0]; // Get noteIds from path
        const noteIds = noteIdsParam.split(',').map((id: string) => parseInt(id.trim(), 10));

        if (noteIds.some((id: number) => isNaN(id))) {
          throw new Error('Invalid note IDs provided');
        }

        const notesInfo = await ankiClient.note.notesInfo({ notes: noteIds });

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  notes: notesInfo,
                  count: notesInfo.length,
                  description: 'Detailed information about the requested notes',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get notes info: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get notes by search query
  server.resource(
    'notes_search',
    new ResourceTemplate('anki:///notes/search/{query}', { list: undefined }),
    async (uri) => {
      try {
        const query = decodeURIComponent(uri.pathname.split('/').pop() || '');
        if (!query) {
          throw new Error('Search query is required');
        }

        const noteIds = await ankiClient.note.findNotes({ query });

        // Get detailed info for the found notes (limit to first 50 for performance)
        const limitedIds = noteIds.slice(0, 50);
        const notesInfo =
          limitedIds.length > 0 ? await ankiClient.note.notesInfo({ notes: limitedIds }) : [];

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  query,
                  totalFound: noteIds.length,
                  displayedCount: limitedIds.length,
                  noteIds,
                  notes: notesInfo,
                  description: `Search results for query: "${query}". Showing detailed info for first 50 notes.`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to search notes: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get notes by tag
  server.resource(
    'notes_by_tag',
    new ResourceTemplate('anki:///notes/tag/{tag}', { list: undefined }),
    async (uri) => {
      try {
        const tag = decodeURIComponent(uri.pathname.split('/').pop() || '');
        if (!tag) {
          throw new Error('Tag is required');
        }

        const query = `tag:${tag}`;
        const noteIds = await ankiClient.note.findNotes({ query });

        // Get detailed info for the found notes (limit to first 50 for performance)
        const limitedIds = noteIds.slice(0, 50);
        const notesInfo =
          limitedIds.length > 0 ? await ankiClient.note.notesInfo({ notes: limitedIds }) : [];

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  tag,
                  totalFound: noteIds.length,
                  displayedCount: limitedIds.length,
                  noteIds,
                  notes: notesInfo,
                  description: `Notes tagged with "${tag}". Showing detailed info for first 50 notes.`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get notes by tag: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get recently modified notes
  server.resource(
    'notes_recent',
    new ResourceTemplate('anki:///notes/recent/{days}', { list: undefined }),
    async (uri) => {
      try {
        const daysParam = uri.pathname.split('/').pop() || '7';
        const days = parseInt(daysParam, 10);

        if (isNaN(days) || days <= 0) {
          throw new Error('Days must be a positive number');
        }

        // Find notes modified in the last N days
        const query = `edited:${days}`;
        const noteIds = await ankiClient.note.findNotes({ query });

        // Get detailed info for the found notes (limit to first 50 for performance)
        const limitedIds = noteIds.slice(0, 50);
        const notesInfo =
          limitedIds.length > 0 ? await ankiClient.note.notesInfo({ notes: limitedIds }) : [];

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  days,
                  totalFound: noteIds.length,
                  displayedCount: limitedIds.length,
                  noteIds,
                  notes: notesInfo,
                  description: `Notes modified in the last ${days} days. Showing detailed info for first 50 notes.`,
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get recent notes: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Resource template: Get note modification times
  server.resource(
    'notes_mod_times',
    new ResourceTemplate('anki:///notes/{noteIds}/mod-times', { list: undefined }),
    async (uri) => {
      try {
        const noteIdsParam = uri.pathname.split('/').slice(-2)[0]; // Get noteIds from path
        const noteIds = noteIdsParam.split(',').map((id: string) => parseInt(id.trim(), 10));

        if (noteIds.some((id: number) => isNaN(id))) {
          throw new Error('Invalid note IDs provided');
        }

        const modTimes = await ankiClient.note.notesModTime({ notes: noteIds });

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'application/json',
              text: JSON.stringify(
                {
                  modificationTimes: modTimes,
                  count: modTimes.length,
                  description: 'Modification timestamps for the requested notes',
                },
                null,
                2
              ),
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get note modification times: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
