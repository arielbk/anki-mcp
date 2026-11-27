import type { McpServer, CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { ankiClient } from '../utils/ankiClient.js';

const GUI_OPERATIONS = [
  'add_cards',
  'answer_card',
  'browse',
  'check_database',
  'current_card',
  'deck_browser',
  'deck_overview',
  'deck_review',
  'edit_note',
  'exit_anki',
  'import_file',
  'select_card',
  'select_note',
  'selected_notes',
  'show_answer',
  'show_question',
  'start_card_timer',
  'undo',
] as const;

type GuiOperation = (typeof GUI_OPERATIONS)[number];

const DESCRIPTION = `Drive the Anki desktop application's user interface: open windows and dialogs (Card Browser, Add Cards, Edit Note, deck overview, import), run an on-screen review session, and read what the user currently has selected or on screen. Use this when the user wants to see or act on something inside the Anki app itself; use \`manage_flashcards\` (and the other non-GUI tools) for headless reads and writes, which are faster and do not disturb the user's windows.

Side effects: every operation except \`current_card\` and \`selected_notes\` changes what is shown in Anki. \`answer_card\` records a review and reschedules the card. \`undo\` reverts the user's last action in Anki. \`exit_anki\` quits the Anki application (and AnkiConnect with it), so only use it when the user explicitly asks. \`add_cards\`, \`edit_note\` and \`import_file\` only open pre-filled dialogs; nothing is saved until the user confirms in Anki.

Operations and the parameters they use:
- add_cards: open Add Cards pre-filled (deckName, modelName, fields, tags?); returns the note ID it would create.
- browse: open the Card Browser with a search (query, reorderCards?); returns matching card IDs.
- select_card: select a card in an open Card Browser (cardId).
- select_note: legacy alias that also selects by card ID in the Card Browser (noteId, treated as a card ID by AnkiConnect).
- selected_notes: read-only; note IDs selected in the Card Browser.
- edit_note: open the Edit dialog for a note (noteId).
- deck_browser: show the main deck list.
- deck_overview: show a deck's overview screen (deckName).
- deck_review: start reviewing a deck (deckName).
- current_card: read-only; the card currently shown in the reviewer, or none.
- show_question / show_answer: flip the current review card.
- start_card_timer: restart the answer timer for the current card.
- answer_card: grade the current card (ease 1-4); the answer must be showing.
- undo: undo the last action in Anki.
- check_database: start Tools > Check Database (returns before it finishes).
- import_file: open the Import dialog for a file (filePath, forward slashes on Windows; Anki 2.1.52+).
- exit_anki: gracefully close Anki.

Requires Anki to be running with the AnkiConnect add-on.`;

function text(value: string): CallToolResult {
  return { content: [{ type: 'text', text: value }] };
}

function requireParam<T>(value: T | undefined, name: string, operation: GuiOperation): T {
  if (value === undefined) {
    throw new Error(`${operation} requires ${name}`);
  }
  return value;
}

/**
 * Register the `anki_gui` tool, which consolidates every AnkiConnect
 * graphical action behind a single `operation` parameter.
 */
export function registerGraphicalTools(server: McpServer) {
  server.registerTool(
    'anki_gui',
    {
      title: 'Control the Anki app UI',
      description: DESCRIPTION,
      inputSchema: z.object({
        operation: z
          .enum(GUI_OPERATIONS)
          .describe('The GUI action to perform. See the tool description for what each one does.'),
        deckName: z
          .string()
          .optional()
          .describe('Deck name. Required for add_cards, deck_overview and deck_review.'),
        modelName: z
          .string()
          .optional()
          .describe('Note type (model) name, e.g. "Basic". Required for add_cards.'),
        fields: z
          .record(z.string(), z.string())
          .optional()
          .describe(
            'Field name to value map used to pre-fill the note, e.g. {"Front": "...", "Back": "..."}. Required for add_cards.'
          ),
        tags: z.array(z.string()).optional().describe('Tags to pre-fill. Optional for add_cards.'),
        query: z
          .string()
          .optional()
          .describe(
            'Anki search query (https://docs.ankiweb.net/searching.html), e.g. "deck:Spanish is:due". Required for browse.'
          ),
        reorderCards: z
          .object({
            columnId: z
              .string()
              .describe(
                'Card Browser column to sort by, e.g. noteFld, cardDue, cardEase, cardIvl, deck, noteTags'
              ),
            order: z.enum(['ascending', 'descending']).describe('Sort direction'),
          })
          .optional()
          .describe('Optional sort order for the Card Browser. Used by browse.'),
        cardId: z.number().int().optional().describe('Card ID. Required for select_card.'),
        noteId: z
          .number()
          .int()
          .optional()
          .describe('Note ID. Required for edit_note; select_note passes it on as a card ID.'),
        ease: z
          .number()
          .int()
          .min(1)
          .max(4)
          .optional()
          .describe('Review grade: 1 Again, 2 Hard, 3 Good, 4 Easy. Required for answer_card.'),
        filePath: z
          .string()
          .optional()
          .describe(
            'Absolute path of the file to import (.apkg, .colpkg, .txt, .csv, ...). Required for import_file.'
          ),
      }),
      annotations: {
        title: 'Control the Anki app UI',
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (args): Promise<CallToolResult> => {
      const { operation } = args;
      try {
        switch (operation) {
          case 'add_cards': {
            const noteId = await ankiClient.graphical.guiAddCards({
              note: {
                deckName: requireParam(args.deckName, 'deckName', operation),
                modelName: requireParam(args.modelName, 'modelName', operation),
                fields: requireParam(args.fields, 'fields', operation),
                tags: args.tags ?? [],
              },
            });
            return text(
              `Opened the Add Cards dialog. If the user confirms it, the new note will have ID ${noteId}.`
            );
          }

          case 'answer_card': {
            const ease = requireParam(args.ease, 'ease', operation);
            const ok = await ankiClient.graphical.guiAnswerCard({ ease });
            return text(
              ok
                ? `Answered the current card with ease ${ease}.`
                : 'Could not answer: no card is being reviewed or its answer is not showing yet (use show_answer first).'
            );
          }

          case 'browse': {
            const query = requireParam(args.query, 'query', operation);
            const cardIds = await ankiClient.graphical.guiBrowse(
              args.reorderCards ? { query, reorderCards: args.reorderCards } : { query }
            );
            return text(
              `Opened the Card Browser for "${query}". ${cardIds.length} cards found: ${JSON.stringify(cardIds)}`
            );
          }

          case 'check_database': {
            await ankiClient.graphical.guiCheckDatabase();
            return text('Started Check Database in Anki (it runs in the background).');
          }

          case 'current_card': {
            const card = await ankiClient.graphical.guiCurrentCard();
            return text(
              card
                ? `Current card: ${JSON.stringify(card, null, 2)}`
                : 'No card is currently being reviewed.'
            );
          }

          case 'deck_browser': {
            await ankiClient.graphical.guiDeckBrowser();
            return text('Opened the deck browser.');
          }

          case 'deck_overview': {
            const name = requireParam(args.deckName, 'deckName', operation);
            const ok = await ankiClient.graphical.guiDeckOverview({ name });
            return text(
              ok ? `Opened the overview for deck "${name}".` : `Could not open deck "${name}".`
            );
          }

          case 'deck_review': {
            const name = requireParam(args.deckName, 'deckName', operation);
            const ok = await ankiClient.graphical.guiDeckReview({ name });
            return text(
              ok ? `Started reviewing deck "${name}".` : `Could not start review for "${name}".`
            );
          }

          case 'edit_note': {
            const note = requireParam(args.noteId, 'noteId', operation);
            await ankiClient.graphical.guiEditNote({ note });
            return text(`Opened the Edit dialog for note ${note}.`);
          }

          case 'exit_anki': {
            await ankiClient.graphical.guiExitAnki();
            return text('Asked Anki to close. AnkiConnect will be unavailable until it restarts.');
          }

          case 'import_file': {
            const path = requireParam(args.filePath, 'filePath', operation);
            await ankiClient.graphical.guiImportFile({ path });
            return text(`Opened the Import dialog for ${path}. The user must confirm the import.`);
          }

          case 'select_card': {
            const card = requireParam(args.cardId, 'cardId', operation);
            const ok = await ankiClient.graphical.guiSelectCard({ card });
            return text(
              ok ? `Selected card ${card} in the Card Browser.` : 'The Card Browser is not open.'
            );
          }

          case 'select_note': {
            const note = requireParam(args.noteId, 'noteId', operation);
            const ok = await ankiClient.graphical.guiSelectNote({ note });
            return text(
              ok ? `Selected ${note} in the Card Browser.` : 'The Card Browser is not open.'
            );
          }

          case 'selected_notes': {
            const noteIds = await ankiClient.graphical.guiSelectedNotes();
            return text(`Selected note IDs: ${JSON.stringify(noteIds)}`);
          }

          case 'show_answer': {
            const ok = await ankiClient.graphical.guiShowAnswer();
            return text(ok ? 'Showing the answer.' : 'Anki is not in review mode.');
          }

          case 'show_question': {
            const ok = await ankiClient.graphical.guiShowQuestion();
            return text(ok ? 'Showing the question.' : 'Anki is not in review mode.');
          }

          case 'start_card_timer': {
            await ankiClient.graphical.guiStartCardTimer();
            return text('Started the card timer.');
          }

          case 'undo': {
            const ok = await ankiClient.graphical.guiUndo();
            return text(ok ? 'Undid the last action.' : 'Nothing to undo.');
          }
        }
      } catch (error) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `anki_gui ${operation} failed: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
