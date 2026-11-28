import type { ToolAnnotations } from '@modelcontextprotocol/server';
import { FLASHCARD_PROMPT_NAME } from '../prompts/index.js';

/**
 * Annotations for the consolidated tools. Each tool bundles several
 * operations, so hints describe the most impactful operation it exposes
 * (e.g. a tool that can delete is marked destructive even though its list
 * operation is read-only). All tools talk only to the local Anki app unless
 * noted.
 */
export const READ_ONLY: ToolAnnotations = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

export const DESTRUCTIVE_WRITE: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
};

/** anki_operations can sync with AnkiWeb and download media from URLs. */
export const DESTRUCTIVE_WRITE_OPEN_WORLD: ToolAnnotations = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: true,
};

export const DESCRIPTIONS = {
  manage_flashcards: `Create, search, inspect, edit, tag and delete Anki notes (flashcards) in the local collection via AnkiConnect. Use this for card content; use manage_decks for deck structure/limits, manage_models for note-type fields and templates, and study_session for review state. For guidance on writing effective cards, use the "${FLASHCARD_PROMPT_NAME}" prompt.

Operations (set \`operation\`, then the listed parameters):
- create: add one note. Needs deckName, modelName, fields; optional tags, allowDuplicate, duplicateScope. Writes immediately.
- create_batch: add many notes. Give \`notes\` inline OR \`filePath\` to a .json (array of notes), .csv or .tsv file (header row = field names; optional tags, deck, model columns). Top-level deckName/modelName act as defaults that each note can override; top-level tags are added to every note. Notes are validated first (note type exists, field names match, duplicates, empty first field: each failure gets a reason), then sent sequentially in chunks of chunkSize (default 10). The result maps every note (#n plus the first ~40 chars of its first field) to its new note ID or failure reason. If Anki stops responding partway, it stops and lists which notes were saved and which to resend. Use dryRun: true to validate without writing. Prefer filePath for large imports: it keeps card text out of the conversation.
- update: change fields and/or replace tags of one note. Needs noteId plus fields and/or tags.
- delete: permanently delete notes and all their cards. Needs noteIds. Cannot be undone.
- find: read-only search with Anki query syntax (e.g. "deck:Spanish tag:verbs"). Needs query; optional limit (default 50), offset, includeDetails.
- get_info: read-only card details. Needs cardIds (max 50).
- add_tags / remove_tags: needs noteIds and tags.
- clear_empty: deletes every note with empty cards in the whole collection.

Fails with a clear message if Anki isn't running.`,

  study_session: `Find due cards and change review state (answer, suspend, unsuspend, reset, relearn) in the local Anki collection. Use this to run a quiz or adjust scheduling; use manage_flashcards to edit card content and get_analytics for history and statistics.

Operations:
- find_due: read-only. Needs query (Anki search syntax, e.g. "deck:Spanish"); returns which matching cards are due now.
- check_status: read-only. Needs cardIds; returns due/suspended flags per card.
- answer: records reviews, as if answered in Anki. Needs answers: [{ cardId, ease }] where ease 1=Again, 2=Hard, 3=Good, 4=Easy. Affects future scheduling.
- suspend / unsuspend: needs cardIds. Suspended cards are excluded from reviews until unsuspended.
- forget: needs cardIds. Resets cards to new, discarding their review progress (destructive).
- relearn: needs cardIds. Puts cards back into relearning.

All writes apply immediately and are not undoable through this tool.`,

  manage_decks: `Create, list, inspect, configure and delete Anki decks, and move cards between them. Use this for deck organization and per-deck daily limits; use manage_flashcards for card content.

Operations:
- list: read-only; all deck names and IDs.
- create: needs deckName (use "Parent::Child" for subdecks). Optional newPerDay and/or reviewsPerDay give the new deck its own daily limits (see set_limits). Does nothing if the deck already exists.
- set_limits: needs deckName plus newPerDay and/or reviewsPerDay. Changes daily limits for this deck only: if the deck uses a shared options preset (e.g. "Default"), the preset is cloned into a new preset named after the deck, assigned to the deck, and only the clone is changed. Other decks are never affected.
- get_stats: read-only; needs deckName.
- get_config: read-only; needs deckName; returns the deck's options preset.
- set_config: needs deckNames and configId; assigns an existing options preset to the decks.
- move_cards: needs cardIds and targetDeck.
- delete: needs deckNames. Permanently deletes the decks AND all their cards (deleteCards must not be false; AnkiConnect always deletes cards). Cannot be undone.`,

  get_analytics: `Read-only study statistics and review history from the local Anki collection, aggregated server-side into compact JSON or one line per row. Use this for reporting and diagnosing progress; it never changes data. To act on the findings, use study_session or manage_flashcards.

Scopes (set \`scope\`, then the listed parameters). deckName always includes subdecks; where optional, omitting it means the whole collection:
- deck_overview: needs deckName; optional days (default 30), limit (top tags, default 10). One-call answer to "how am I doing on this deck": new/learning/review/suspended and seen/unseen counts, the preset's new/day and reviews/day limits, the date the unseen cards run out at the new/day limit, reviews, correct % and retention over the window, and top tags by Again count.
- collection_stats: optional deckName, days (forecast length, default 14). Studied today (cards, minutes, again, correct %), card counts (new/learning/young/mature/suspended; mature = interval >= 21d), correct % by card type over the last 30 days, due-review forecast per day, average/longest interval.
- reviews_by_day: optional deckName, days (default 30) or since (YYYY-MM-DD). One "YYYY-MM-DD: n" line per day (zero days included) plus a total.
- trouble_cards: optional deckName, days (default 7), limit (default 10). Cards answered Again in the window, grouped by tag, plus the worst cards (cardId, front text, again count, lapses).
- deck_stats: needs deckName; Anki's new/learning/review counts for the deck.
- reviews_today: number of reviews today across all decks.
- card_reviews: needs deckName and startTimestamp (epoch ms); raw review log for that deck (not subdecks), one line per review. Over limit (default 300) rows it returns a summary and how to narrow.
- card_details: needs cardIds; ease factor and current interval per card.

For "what am I failing", trouble_cards gives the aggregate; to get the cards themselves use manage_flashcards find with Anki search syntax, e.g. "rated:2:1" (answered Again in the last 2 days), "deck:Spanish rated:7:1", "prop:lapses>3" or "is:due".`,

  manage_models: `List and modify Anki note types (models): fields, card templates and CSS. Use list before creating notes to find a note type's exact field names (e.g. "Front"/"Back"); use manage_flashcards for note content.

Operations:
- list: read-only; every note type with its ID and ordered field names.
- create: needs modelName, fields (ordered names) and templates ([{ Front, Back }]); optional css, isCloze.
- add_field: needs modelName, fieldName, fieldIndex.
- remove_field: needs modelName, fieldName. Deletes that field's content from every note of this type (destructive).
- rename_field: needs modelName, fieldName, newFieldName.
- add_template: needs modelName, template ({ Front, Back }). Generates new cards for existing notes.
- remove_template: needs modelName, templateName. Deletes the cards generated by that template (destructive).
- update_styling: needs modelName, css. Replaces the note type's CSS.

All operations except list change the collection immediately and affect every note of that type.`,

  anki_operations: `Utility operations for the Anki app: AnkiWeb sync, version check, .apkg import/export, profiles, and media files. Use this for maintenance tasks that are not about card content, decks, note types or reviews. To read a media file's contents (e.g. view an image), use get_media_file.

Operations:
- version: read-only; AnkiConnect version (also a quick "is Anki running?" check).
- get_profiles: read-only; profile names.
- sync: syncs the collection with AnkiWeb (network; may upload or download changes).
- export_deck: needs deckName and filePath (.apkg path to write); optional includeSched. Writes a file on disk.
- import_package: needs filePath to an .apkg; adds its contents to the collection.
- list_media: read-only; needs pattern (e.g. "*.png", "*").
- retrieve_media: read-only; needs filename; reports whether it exists and its size.
- store_media: needs filename plus mediaData (base64) or mediaUrl (downloaded by Anki). Overwrites a file with the same name.
- delete_media: needs filename. Deletes the file from the media folder.`,

  get_media_file: `Read one file from Anki's media folder and return it as base64; images are also returned as image content the model can look at. Read-only. Use this when you need a referenced image/audio file's actual contents; use anki_operations list_media to find file names and store_media/delete_media to change files. Pass the bare filename as it appears in the card (e.g. "diagram.png"); paths and ".." are rejected. Returns an error object if the file doesn't exist.`,
} as const;
