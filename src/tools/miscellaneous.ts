import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * Register all miscellaneous tools with the MCP server
 */
export function registerMiscellaneousTools(server: McpServer) {
  // Tool: Get API reflection information
  server.tool(
    'api_reflect',
    {
      actions: z
        .array(z.string())
        .nullable()
        .optional()
        .describe('List of action names to reflect, or null for all'),
      scopes: z.array(z.enum(['actions'])).describe('Scopes to reflect'),
    },
    async ({ actions = null, scopes }) => {
      try {
        const reflection = await ankiClient.miscellaneous.apiReflect({ actions, scopes });
        return {
          content: [
            {
              type: 'text',
              text: `API reflection: ${JSON.stringify(reflection, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get API reflection: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Export a deck package
  server.tool(
    'export_package',
    {
      deckName: z.string().describe('Name of the deck to export'),
      filePath: z.string().describe('Path where to save the exported package'),
      includeSched: z.boolean().optional().describe('Whether to include scheduling information'),
    },
    async ({ deckName, filePath, includeSched }) => {
      try {
        const params: any = { deck: deckName, path: filePath };
        if (includeSched !== undefined) params.includeSched = includeSched;

        const result = await ankiClient.miscellaneous.exportPackage(params);
        return {
          content: [
            {
              type: 'text',
              text: `Successfully exported deck "${deckName}" to ${filePath}. Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to export package: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Get the active profile name
  server.tool('get_active_profile', {}, async () => {
    try {
      const profileName = await ankiClient.miscellaneous.getActiveProfile();
      return {
        content: [
          {
            type: 'text',
            text: `Active profile: ${profileName}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to get active profile: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Tool: Get all available profiles
  server.tool('get_profiles', {}, async () => {
    try {
      const profiles = await ankiClient.miscellaneous.getProfiles();
      return {
        content: [
          {
            type: 'text',
            text: `Available profiles: ${JSON.stringify(profiles, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to get profiles: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Tool: Import a package
  server.tool(
    'import_package',
    {
      filePath: z.string().describe('Path to the package file to import'),
    },
    async ({ filePath }) => {
      try {
        const result = await ankiClient.miscellaneous.importPackage({ path: filePath });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully imported package from ${filePath}. Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to import package: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Load a specific profile
  server.tool(
    'load_profile',
    {
      profileName: z.string().describe('Name of the profile to load'),
    },
    async ({ profileName }) => {
      try {
        const result = await ankiClient.miscellaneous.loadProfile({ name: profileName });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully loaded profile "${profileName}". Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to load profile: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Execute multiple AnkiConnect actions in a single request
  // This is useful for performing batch operations efficiently
  server.tool(
    'multi',
    {
      actions: z
        .array(
          z.object({
            action: z
              .enum([
                // Card Actions
                'answerCards',
                'areDue',
                'areSuspended',
                'cardsInfo',
                'cardsModTime',
                'cardsToNotes',
                'findCards',
                'forgetCards',
                'getEaseFactors',
                'getIntervals',
                'relearnCards',
                'setDueDate',
                'setEaseFactors',
                'setSpecificValueOfCard',
                'suspend',
                'suspended',
                'unsuspend',
                // Deck Actions
                'changeDeck',
                'cloneDeckConfigId',
                'createDeck',
                'deckNames',
                'deckNamesAndIds',
                'deleteDecks',
                'getDeckConfig',
                'getDecks',
                'getDeckStats',
                'removeDeckConfigId',
                'saveDeckConfig',
                'setDeckConfigId',
                // Note Actions
                'addNote',
                'addNotes',
                'addTags',
                'canAddNotes',
                'canAddNotesWithErrorDetail',
                'clearUnusedTags',
                'deleteNotes',
                'findNotes',
                'getNoteTags',
                'getTags',
                'notesInfo',
                'notesModTime',
                'removeEmptyNotes',
                'removeTags',
                'replaceTags',
                'replaceTagsInAllNotes',
                'updateNote',
                'updateNoteFields',
                'updateNoteModel',
                'updateNoteTags',
                // Model Actions
                'createModel',
                'findAndReplaceInModels',
                'findModelsById',
                'findModelsByName',
                'modelFieldAdd',
                'modelFieldDescriptions',
                'modelFieldFonts',
                'modelFieldNames',
                'modelFieldRemove',
                'modelFieldRename',
                'modelFieldReposition',
                'modelFieldSetDescription',
                'modelFieldSetFont',
                'modelFieldSetFontSize',
                'modelFieldsOnTemplates',
                'modelNames',
                'modelNamesAndIds',
                'modelStyling',
                'modelTemplateAdd',
                'modelTemplateRemove',
                'modelTemplateRename',
                'modelTemplateReposition',
                'modelTemplates',
                'updateModelStyling',
                'updateModelTemplates',
                // Media Actions
                'deleteMediaFile',
                'getMediaDirPath',
                'getMediaFilesNames',
                'retrieveMediaFile',
                'storeMediaFile',
                // Statistics Actions
                'cardReviews',
                'getCollectionStatsHTML',
                'getLatestReviewID',
                'getNumCardsReviewedByDay',
                'getNumCardsReviewedToday',
                'getReviewsOfCards',
                'insertReviews',
                // Graphical Actions
                'guiAddCards',
                'guiAnswerCard',
                'guiBrowse',
                'guiCheckDatabase',
                'guiCurrentCard',
                'guiDeckBrowser',
                'guiDeckOverview',
                'guiDeckReview',
                'guiEditNote',
                'guiExitAnki',
                'guiImportFile',
                'guiSelectCard',
                'guiSelectedNotes',
                'guiSelectNote',
                'guiShowAnswer',
                'guiShowQuestion',
                'guiStartCardTimer',
                'guiUndo',
                // Miscellaneous Actions
                'apiReflect',
                'exportPackage',
                'getActiveProfile',
                'getProfiles',
                'importPackage',
                'loadProfile',
                'multi',
                'reloadCollection',
                'requestPermission',
                'sync',
                'version',
              ])
              .describe('Name of the AnkiConnect action to execute'),
            params: z
              .record(z.any())
              .optional()
              .describe(
                'Parameters object for the action (structure depends on the specific action)'
              ),
            version: z
              .number()
              .optional()
              .default(6)
              .describe('API version for the action (defaults to 6)'),
          })
        )
        .describe(
          'Array of AnkiConnect actions to execute in sequence. Example: [{"action": "createDeck", "params": {"deck": "My Deck"}}, {"action": "addNote", "params": {"note": {...}}}]'
        ),
    },
    async ({ actions }) => {
      try {
        // Type assertion needed due to yanki-connect's strict typing for action names
        const results = await ankiClient.miscellaneous.multi({
          actions: actions as Array<{
            action: any;
            params?: any;
            version?: number;
          }>,
        });
        return {
          content: [
            {
              type: 'text',
              text: `Multi-action results: ${JSON.stringify(results, null, 2)}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to execute multi-action: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Reload the collection
  server.tool('reload_collection', {}, async () => {
    try {
      await ankiClient.miscellaneous.reloadCollection();
      return {
        content: [
          {
            type: 'text',
            text: 'Successfully reloaded collection',
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to reload collection: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Tool: Request permission from AnkiConnect
  server.tool('request_permission', {}, async () => {
    try {
      const permission = await ankiClient.miscellaneous.requestPermission();
      return {
        content: [
          {
            type: 'text',
            text: `Permission request result: ${JSON.stringify(permission, null, 2)}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to request permission: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });

  // Tool: Sync the collection
  server.tool('sync', {}, async () => {
    try {
      await ankiClient.miscellaneous.sync();
      return {
        content: [
          {
            type: 'text',
            text: 'Successfully initiated sync',
          },
        ],
      };
    } catch (error) {
      throw new Error(`Failed to sync: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  // Tool: Get AnkiConnect version
  server.tool('get_version', {}, async () => {
    try {
      const version = await ankiClient.miscellaneous.version();
      return {
        content: [
          {
            type: 'text',
            text: `AnkiConnect version: ${version}`,
          },
        ],
      };
    } catch (error) {
      throw new Error(
        `Failed to get version: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  });
}
