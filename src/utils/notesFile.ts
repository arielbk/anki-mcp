import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { extname, resolve } from 'node:path';
import { z } from 'zod';
import type { NoteInput } from './batch.js';

export type NotesFileFormat = 'json' | 'csv' | 'tsv';

const jsonNoteSchema = z.object({
  deckName: z.string().optional(),
  modelName: z.string().optional(),
  fields: z.record(z.string(), z.string()),
  tags: z.array(z.string()).optional(),
});

/** Column names (case-insensitive) that are not note fields. */
const TAGS_COLUMNS = new Set(['tags']);
const DECK_COLUMNS = new Set(['deck', 'deckname']);
const MODEL_COLUMNS = new Set(['model', 'modelname', 'notetype', 'note type']);

export function detectFormat(filePath: string): NotesFileFormat {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.json') return 'json';
  if (ext === '.csv') return 'csv';
  if (ext === '.tsv' || ext === '.tab' || ext === '.txt') return 'tsv';
  throw new Error(
    `Unsupported file type "${ext || '(none)'}" for ${filePath}. Use .json, .csv, or .tsv.`
  );
}

/**
 * Parses delimiter-separated text (RFC 4180 style): fields may be wrapped in
 * double quotes, quoted fields may contain the delimiter, newlines and `""`
 * for a literal quote. Handles CRLF and a leading BOM.
 */
export function parseDelimited(input: string, delimiter: ',' | '\t'): string[][] {
  const text = input.startsWith('﻿') ? input.slice(1) : input;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let fieldWasQuoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = '';
    fieldWasQuoted = false;
  };
  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"' && field === '' && !fieldWasQuoted) {
      inQuotes = true;
      fieldWasQuoted = true;
      i++;
      continue;
    }
    if (c === delimiter) {
      endField();
      i++;
      continue;
    }
    if (c === '\n' || c === '\r') {
      endRow();
      i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
      continue;
    }
    field += c;
    i++;
  }
  if (inQuotes) throw new Error('Unterminated quoted field (missing closing ")');
  if (field !== '' || fieldWasQuoted || row.length > 0) endRow();

  // Drop blank lines.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

function splitTags(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Turns rows (first row = header) into notes. */
export function rowsToNotes(rows: string[][]): NoteInput[] {
  const [header, ...data] = rows;
  if (!header) throw new Error('File is empty: expected a header row with field names');
  const columns = header.map((h) => h.trim());
  if (columns.some((c) => c === '')) throw new Error('Header row has an empty column name');

  const fieldColumns = columns.filter((c) => {
    const lower = c.toLowerCase();
    return !TAGS_COLUMNS.has(lower) && !DECK_COLUMNS.has(lower) && !MODEL_COLUMNS.has(lower);
  });
  if (fieldColumns.length === 0) {
    throw new Error('Header row has no note field columns (only tags/deck/model)');
  }

  return data.map((cells, rowIndex) => {
    if (cells.length > columns.length) {
      throw new Error(
        `Row ${rowIndex + 2} has ${cells.length} columns but the header has ${columns.length}`
      );
    }
    const note: NoteInput = { fields: {} };
    columns.forEach((column, col) => {
      const value = cells[col] ?? '';
      const lower = column.toLowerCase();
      if (TAGS_COLUMNS.has(lower)) {
        const tags = splitTags(value);
        if (tags.length > 0) note.tags = tags;
      } else if (DECK_COLUMNS.has(lower)) {
        if (value.trim()) note.deckName = value.trim();
      } else if (MODEL_COLUMNS.has(lower)) {
        if (value.trim()) note.modelName = value.trim();
      } else {
        note.fields[column] = value;
      }
    });
    return note;
  });
}

export function parseJsonNotes(text: string): NoteInput[] {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(data)) throw new Error('JSON file must contain an array of notes');
  return data.map((item, index) => {
    const parsed = jsonNoteSchema.safeParse(item);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const where = issue?.path.length ? ` at "${issue.path.join('.')}"` : '';
      throw new Error(`Note #${index + 1} in JSON file is invalid${where}: ${issue?.message}`);
    }
    const note: NoteInput = { fields: parsed.data.fields };
    if (parsed.data.deckName) note.deckName = parsed.data.deckName;
    if (parsed.data.modelName) note.modelName = parsed.data.modelName;
    if (parsed.data.tags) note.tags = parsed.data.tags;
    return note;
  });
}

export function parseNotesText(text: string, format: NotesFileFormat): NoteInput[] {
  if (format === 'json') return parseJsonNotes(text);
  return rowsToNotes(parseDelimited(text, format === 'csv' ? ',' : '\t'));
}

export function resolveFilePath(filePath: string): string {
  if (filePath === '~' || filePath.startsWith('~/')) {
    return resolve(homedir(), filePath.slice(2));
  }
  return resolve(filePath);
}

/** Reads and parses a JSON/CSV/TSV notes file. */
export async function readNotesFile(filePath: string): Promise<NoteInput[]> {
  const fullPath = resolveFilePath(filePath);
  const format = detectFormat(fullPath);
  let text: string;
  try {
    text = await readFile(fullPath, 'utf8');
  } catch (error) {
    throw new Error(
      `Couldn't read ${fullPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  try {
    return parseNotesText(text, format);
  } catch (error) {
    throw new Error(
      `Couldn't parse ${fullPath}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
