import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ankiClient } from '../utils/ankiClient.js';

/**
 * Register all graphical/GUI-related tools with the MCP server
 */
export function registerGraphicalTools(server: McpServer) {
  // Tool: Open the Add Cards dialog
  server.tool(
    'gui_add_cards',
    {
      deckName: z.string().describe('Name of the deck to add the note to'),
      modelName: z.string().describe('Name of the note model/type'),
      fields: z.record(z.string()).describe('Object with field names as keys and field content as values'),
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

        const result = await ankiClient.graphical.guiAddCards({ note });
        return {
          content: [
            {
              type: 'text',
              text: `Opened Add Cards dialog and added note with ID: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to open Add Cards dialog: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Answer the current card in the reviewer
  server.tool(
    'gui_answer_card',
    {
      ease: z.number().min(1).max(4).describe('Ease rating: 1 (Again), 2 (Hard), 3 (Good), 4 (Easy)'),
    },
    async ({ ease }) => {
      try {
        const result = await ankiClient.graphical.guiAnswerCard({ ease });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully answered current card with ease ${ease}. Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to answer card: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Open the browser with a search query
  server.tool(
    'gui_browse',
    {
      query: z.string().describe('Search query to browse cards'),
      reorderCards: z.object({
        columnId: z.string().describe('Column to sort by'),
        order: z.enum(['ascending', 'descending']).describe('Sort order'),
      }).optional().describe('Optional reordering configuration'),
    },
    async ({ query, reorderCards }) => {
      try {
        const params: any = { query };
        if (reorderCards) {
          params.reorderCards = reorderCards;
        }

        const cardIds = await ankiClient.graphical.guiBrowse(params);
        return {
          content: [
            {
              type: 'text',
              text: `Opened browser with query "${query}". Found ${cardIds.length} cards: ${JSON.stringify(cardIds)}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to open browser: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Check database integrity
  server.tool(
    'gui_check_database',
    {},
    async () => {
      try {
        const result = await ankiClient.graphical.guiCheckDatabase();
        return {
          content: [
            {
              type: 'text',
              text: `Database check completed successfully. Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to check database: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Get information about the current card
  server.tool(
    'gui_current_card',
    {},
    async () => {
      try {
        const cardInfo = await ankiClient.graphical.guiCurrentCard();
        return {
          content: [
            {
              type: 'text',
              text: cardInfo 
                ? `Current card: ${JSON.stringify(cardInfo, null, 2)}`
                : 'No card is currently being reviewed',
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get current card: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Open the deck browser
  server.tool(
    'gui_deck_browser',
    {},
    async () => {
      try {
        await ankiClient.graphical.guiDeckBrowser();
        return {
          content: [
            {
              type: 'text',
              text: 'Successfully opened deck browser',
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to open deck browser: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Open deck overview
  server.tool(
    'gui_deck_overview',
    {
      deckName: z.string().describe('Name of the deck to view overview for'),
    },
    async ({ deckName }) => {
      try {
        const result = await ankiClient.graphical.guiDeckOverview({ name: deckName });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully opened deck overview for "${deckName}". Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to open deck overview: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Start deck review
  server.tool(
    'gui_deck_review',
    {
      deckName: z.string().describe('Name of the deck to start reviewing'),
    },
    async ({ deckName }) => {
      try {
        const result = await ankiClient.graphical.guiDeckReview({ name: deckName });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully started review for deck "${deckName}". Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to start deck review: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Edit a note
  server.tool(
    'gui_edit_note',
    {
      noteId: z.number().describe('ID of the note to edit'),
    },
    async ({ noteId }) => {
      try {
        await ankiClient.graphical.guiEditNote({ note: noteId });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully opened edit dialog for note ${noteId}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to edit note: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Exit Anki
  server.tool(
    'gui_exit_anki',
    {},
    async () => {
      try {
        await ankiClient.graphical.guiExitAnki();
        return {
          content: [
            {
              type: 'text',
              text: 'Successfully sent exit command to Anki',
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to exit Anki: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Import a file
  server.tool(
    'gui_import_file',
    {
      filePath: z.string().describe('Path to the file to import'),
    },
    async ({ filePath }) => {
      try {
        await ankiClient.graphical.guiImportFile({ path: filePath });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully imported file: ${filePath}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to import file: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Select a card in the browser
  server.tool(
    'gui_select_card',
    {
      cardId: z.number().describe('ID of the card to select'),
    },
    async ({ cardId }) => {
      try {
        const result = await ankiClient.graphical.guiSelectCard({ card: cardId });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully selected card ${cardId}. Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to select card: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Select a note in the browser
  server.tool(
    'gui_select_note',
    {
      noteId: z.number().describe('ID of the note to select'),
    },
    async ({ noteId }) => {
      try {
        const result = await ankiClient.graphical.guiSelectNote({ note: noteId });
        return {
          content: [
            {
              type: 'text',
              text: `Successfully selected note ${noteId}. Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to select note: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Get selected notes in the browser
  server.tool(
    'gui_selected_notes',
    {},
    async () => {
      try {
        const noteIds = await ankiClient.graphical.guiSelectedNotes();
        return {
          content: [
            {
              type: 'text',
              text: `Selected notes: ${JSON.stringify(noteIds)}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to get selected notes: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Show the answer for the current card
  server.tool(
    'gui_show_answer',
    {},
    async () => {
      try {
        const result = await ankiClient.graphical.guiShowAnswer();
        return {
          content: [
            {
              type: 'text',
              text: `Successfully showed answer. Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to show answer: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Show the question for the current card
  server.tool(
    'gui_show_question',
    {},
    async () => {
      try {
        const result = await ankiClient.graphical.guiShowQuestion();
        return {
          content: [
            {
              type: 'text',
              text: `Successfully showed question. Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to show question: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Start the card timer
  server.tool(
    'gui_start_card_timer',
    {},
    async () => {
      try {
        const result = await ankiClient.graphical.guiStartCardTimer();
        return {
          content: [
            {
              type: 'text',
              text: `Successfully started card timer. Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to start card timer: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );

  // Tool: Undo the last action
  server.tool(
    'gui_undo',
    {},
    async () => {
      try {
        const result = await ankiClient.graphical.guiUndo();
        return {
          content: [
            {
              type: 'text',
              text: `Successfully performed undo. Result: ${result}`,
            },
          ],
        };
      } catch (error) {
        throw new Error(
          `Failed to undo: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
  );
}
