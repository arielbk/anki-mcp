import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * Register all media-related tools with the MCP server
 */
export function registerMediaTools(server: McpServer) {
  // Tool: Delete a media file
  server.tool(
    'delete_media_file',
    {
      filename: z.string().describe('Name of the media file to delete'),
    },
    async ({ filename }) => {
      try {
        await ankiClient.media.deleteMediaFile({ filename });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully deleted media file: ${filename}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to delete media file: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Get the media directory path
  server.tool(
    'get_media_dir_path',
    {},
    async () => {
      try {
        const path = await ankiClient.media.getMediaDirPath();
        return {
          content: [
            {
              type: 'text',
              text: `Media directory path: ${path}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get media directory path: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Get media file names matching a pattern
  server.tool(
    'get_media_files_names',
    {
      pattern: z.string().describe('Pattern to match media file names (e.g., "*.jpg", "*audio*")'),
    },
    async ({ pattern }) => {
      try {
        const filenames = await ankiClient.media.getMediaFilesNames({ pattern });
        return {
          content: [
            {
              type: 'text',
              text: `Media files matching pattern "${pattern}": ${JSON.stringify(filenames, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get media file names: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Retrieve a media file's content
  server.tool(
    'retrieve_media_file',
    {
      filename: z.string().describe('Name of the media file to retrieve'),
    },
    async ({ filename }) => {
      try {
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
              text: `Successfully retrieved media file "${filename}". Content length: ${content.length} characters`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to retrieve media file: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Store a media file
  server.tool(
    'store_media_file',
    {
      filename: z.string().describe('Name to save the media file as'),
      data: z.string().optional().describe('Base64-encoded data of the file'),
      path: z.string().optional().describe('Local file path to read from'),
      url: z.string().optional().describe('URL to download the file from'),
      deleteExisting: z.boolean().optional().describe('Whether to delete existing file with same name'),
    },
    async ({ filename, data, path, url, deleteExisting }) => {
      try {
        const params: any = { filename };
        if (data) params.data = data;
        if (path) params.path = path;
        if (url) params.url = url;
        if (deleteExisting !== undefined) params.deleteExisting = deleteExisting;

        if (!data && !path && !url) {
          throw new Error('Either data, path, or url must be provided');
        }

        const storedFilename = await ankiClient.media.storeMediaFile(params);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully stored media file as: ${storedFilename}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to store media file: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
