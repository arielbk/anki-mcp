import {
  AnkiConnectionError,
  InputError,
  errorMessage,
  isAnkiReachable,
  isConnectionError,
} from './errors.js';

/** A note as given by the caller; deck/model may come from batch defaults. */
export interface NoteInput {
  deckName?: string;
  modelName?: string;
  fields: Record<string, string>;
  tags?: string[];
}

export interface BatchDefaults {
  deckName?: string | undefined;
  modelName?: string | undefined;
  tags?: string[] | undefined;
}

export interface ResolvedNote {
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
  tags: string[];
}

export interface AddOptions {
  allowDuplicate?: boolean | undefined;
  duplicateScope?: 'deck' | 'collection' | undefined;
}

type AnkiNote = ResolvedNote & {
  options?: { allowDuplicate?: boolean; duplicateScope?: string };
};

/** The subset of YankiConnect used by batch creation, so tests can stub it. */
export interface BatchClient {
  note: {
    addNotes: (params: { notes: AnkiNote[] }) => Promise<Array<null | string | number> | null>;
    addNote: (params: { note: AnkiNote }) => Promise<null | number>;
    canAddNotesWithErrorDetail: (params: {
      notes: AnkiNote[];
    }) => Promise<Array<{ canAdd: true } | { canAdd: false; error: string }>>;
    findNotes: (params: { query: string }) => Promise<number[]>;
    notesInfo: (params: {
      notes: number[];
    }) => Promise<
      Array<{ noteId: number; fields: Record<string, { value: string; order: number }> }>
    >;
  };
  model: {
    modelNamesAndIds: () => Promise<Record<string, number>>;
    findModelsByName: (params: {
      modelNames: string[];
    }) => Promise<Array<{ name: string; flds: Array<{ name: string; ord: number }> }>>;
  };
  miscellaneous: { version: () => Promise<number> };
}

export type NoteStatus = 'added' | 'valid' | 'failed' | 'unknown' | 'not_attempted';

export interface NoteOutcome {
  /** 1-based position of the note in the batch. */
  index: number;
  /** First ~40 characters of the note's first field, for humans. */
  label: string;
  status: NoteStatus;
  noteId?: number;
  reason?: string;
}

export interface BatchReport {
  dryRun: boolean;
  chunkSize: number;
  outcomes: NoteOutcome[];
  /** Set when the run stopped early (e.g. Anki became unreachable). */
  abortedReason?: string;
}

export interface BatchRunOptions extends AddOptions {
  chunkSize?: number | undefined;
  pauseMs?: number | undefined;
  dryRun?: boolean | undefined;
  sleep?: ((ms: number) => Promise<void>) | undefined;
  onProgress?: ((done: number, total: number) => void | Promise<void>) | undefined;
  /** Clock override for tests. */
  now?: (() => number) | undefined;
}

export const DEFAULT_CHUNK_SIZE = 10;
export const DEFAULT_PAUSE_MS = 300;
const LABEL_LENGTH = 40;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function chunk<T>(items: T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1) throw new Error('chunk size must be a positive integer');
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

/** First ~40 chars of the first field, with HTML stripped. */
export function noteLabel(fields: Record<string, string>): string {
  const first = Object.values(fields)[0] ?? '';
  const text = first
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > LABEL_LENGTH ? `${text.slice(0, LABEL_LENGTH - 1)}…` : text;
}

/**
 * Applies batch-level defaults. Per-note deckName/modelName win over the
 * defaults; tags are combined (default tags + per-note tags, de-duplicated).
 * Throws listing every note that still has no deck or model.
 */
export function resolveNotes(notes: NoteInput[], defaults: BatchDefaults = {}): ResolvedNote[] {
  const problems: string[] = [];
  const resolved = notes.map((note, i) => {
    const deckName = note.deckName ?? defaults.deckName;
    const modelName = note.modelName ?? defaults.modelName;
    const missing = [!deckName && 'deckName', !modelName && 'modelName'].filter(Boolean);
    if (missing.length > 0) {
      problems.push(`#${i + 1} "${noteLabel(note.fields)}" has no ${missing.join(' or ')}`);
    }
    const tags = [...new Set([...(defaults.tags ?? []), ...(note.tags ?? [])])];
    return { deckName: deckName ?? '', modelName: modelName ?? '', fields: note.fields, tags };
  });
  if (problems.length > 0) {
    throw new InputError(
      `Some notes have no deck or note type. Set top-level deckName/modelName as defaults or give them per note:\n${problems.join('\n')}`
    );
  }
  return resolved;
}

interface ModelCheck {
  /** Reason per failing note index. */
  failures: Map<number, string>;
  /** Notes with field names rewritten to the note type's casing. */
  notes: ResolvedNote[];
  /** Ordered field names per note type. */
  fieldsByModel: Map<string, string[]>;
}

/**
 * Checks note types and field names locally (one request for the model list,
 * one for the models' fields). Field names match case-insensitively, like
 * AnkiConnect does, and are rewritten to the note type's own casing.
 */
export async function checkModelsAndFields(
  client: BatchClient,
  notes: ResolvedNote[]
): Promise<ModelCheck> {
  const failures = new Map<number, string>();
  const known = await client.model.modelNamesAndIds();
  const wanted = [...new Set(notes.map((n) => n.modelName))].filter((m) => Object.hasOwn(known, m));
  const fieldsByModel = new Map<string, string[]>();
  if (wanted.length > 0) {
    const models = await client.model.findModelsByName({ modelNames: wanted });
    for (const model of models) {
      fieldsByModel.set(
        model.name,
        [...model.flds].sort((a, b) => a.ord - b.ord).map((f) => f.name)
      );
    }
  }

  const normalized = notes.map((note, i) => {
    const modelFields = fieldsByModel.get(note.modelName);
    if (!Object.hasOwn(known, note.modelName) || !modelFields) {
      failures.set(i, `note type "${note.modelName}" does not exist`);
      return note;
    }
    const byLower = new Map(modelFields.map((f) => [f.toLowerCase(), f]));
    const fields: Record<string, string> = {};
    const unknown: string[] = [];
    const repeated: string[] = [];
    for (const [key, value] of Object.entries(note.fields)) {
      const canonical = byLower.get(key.toLowerCase());
      if (!canonical) unknown.push(key);
      else if (Object.hasOwn(fields, canonical)) repeated.push(key);
      else fields[canonical] = value;
    }
    if (unknown.length > 0) {
      failures.set(
        i,
        `unknown field(s) ${unknown.map((f) => `"${f}"`).join(', ')} for note type "${note.modelName}" (fields: ${modelFields.join(', ')})`
      );
    } else if (repeated.length > 0) {
      failures.set(
        i,
        `field(s) ${repeated.map((f) => `"${f}"`).join(', ')} given more than once (names are case-insensitive)`
      );
    } else {
      const firstField = modelFields[0];
      if (firstField && !fields[firstField]?.trim()) {
        failures.set(i, `first field "${firstField}" is empty`);
      }
    }
    return { ...note, fields };
  });
  return { failures, notes: normalized, fieldsByModel };
}

/**
 * Finds notes that duplicate an earlier note in the same batch (same note
 * type and first field, and same deck when duplicateScope is "deck"), which
 * AnkiConnect's pre-check can't see. Returns a reason per duplicate index.
 */
export function findInBatchDuplicates(
  notes: ResolvedNote[],
  fieldsByModel: Map<string, string[]>,
  candidates: number[],
  options: AddOptions
): Map<number, string> {
  const duplicates = new Map<number, string>();
  if (options.allowDuplicate) return duplicates;
  const seen = new Map<string, number>();
  for (const i of candidates) {
    const note = notes[i];
    if (!note) continue;
    const firstField = fieldsByModel.get(note.modelName)?.[0];
    if (!firstField) continue;
    const value = (note.fields[firstField] ?? '').trim();
    const scope = options.duplicateScope === 'deck' ? note.deckName : '';
    const key = JSON.stringify([note.modelName, scope, value]);
    const first = seen.get(key);
    if (first === undefined) seen.set(key, i);
    else duplicates.set(i, `duplicate of note #${first + 1} in this batch`);
  }
  return duplicates;
}

/** Quotes a value for Anki's search syntax (exact match, no wildcards). */
export function ankiSearchTerm(term: string): string {
  const escaped = term.replace(/[\\"*_]/g, (c) => `\\${c}`);
  return `"${escaped}"`;
}

/**
 * After a retry is rejected as a duplicate, checks whether the note was in
 * fact saved by the chunk request that was rejected (AnkiConnect adds what it
 * can before reporting errors). Returns the note ID if a note with the same
 * first field in the target deck/note type was created during this run.
 */
async function findSavedDuplicate(
  client: BatchClient,
  note: ResolvedNote,
  firstField: string,
  startedAt: number
): Promise<number | undefined> {
  const value = note.fields[firstField] ?? '';
  const query = [
    ankiSearchTerm(`deck:${note.deckName}`),
    ankiSearchTerm(`note:${note.modelName}`),
    ankiSearchTerm(`${firstField}:${value}`),
  ].join(' ');
  const ids = await client.note.findNotes({ query });
  if (ids.length === 0) return undefined;
  const infos = await client.note.notesInfo({ notes: ids });
  const matches = infos
    .filter((n) => n.fields[firstField]?.value === value && n.noteId >= startedAt)
    .map((n) => n.noteId)
    .sort((a, b) => b - a);
  return matches[0];
}

function toAnkiNote(note: ResolvedNote, options: AddOptions): AnkiNote {
  const ankiOptions: { allowDuplicate?: boolean; duplicateScope?: string } = {};
  if (options.allowDuplicate !== undefined) ankiOptions.allowDuplicate = options.allowDuplicate;
  if (options.duplicateScope !== undefined) ankiOptions.duplicateScope = options.duplicateScope;
  return Object.keys(ankiOptions).length > 0 ? { ...note, options: ankiOptions } : { ...note };
}

function isUnsupportedAction(error: unknown): boolean {
  return /unsupported action/i.test(errorMessage(error));
}

/**
 * Validates and (unless dryRun) adds notes in sequential chunks.
 *
 * - Model/field problems and AnkiConnect's canAddNotesWithErrorDetail
 *   reasons (duplicate, empty, missing deck...) are reported per note and
 *   those notes are skipped.
 * - Each chunk is one addNotes request, with a short pause between chunks.
 * - If AnkiConnect rejects a chunk while still running, its notes are retried
 *   one by one so each gets its own result (only when duplicates are not
 *   allowed, so a retry can never double-add).
 * - If Anki becomes unreachable, the run stops: notes from completed chunks
 *   are reported as added, the in-flight chunk as unknown, the rest as
 *   not attempted.
 */
export async function runBatch(
  client: BatchClient,
  inputNotes: ResolvedNote[],
  options: BatchRunOptions = {}
): Promise<BatchReport> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const pauseMs = options.pauseMs ?? DEFAULT_PAUSE_MS;
  const sleep = options.sleep ?? defaultSleep;
  const dryRun = options.dryRun ?? false;
  // Note IDs are creation timestamps (ms); used to recognise notes saved by this run.
  const startedAt = (options.now ?? Date.now)() - 1000;

  const outcomes: NoteOutcome[] = inputNotes.map((note, i) => ({
    index: i + 1,
    label: noteLabel(note.fields),
    status: 'not_attempted',
  }));
  const fail = (i: number, reason: string) => {
    const outcome = outcomes[i];
    if (outcome) Object.assign(outcome, { status: 'failed', reason });
  };

  // 1. Local model/field checks (read-only), then duplicates within the batch.
  const checked = await checkModelsAndFields(client, inputNotes);
  const notes = checked.notes;
  checked.failures.forEach((reason, i) => fail(i, reason));
  let candidates = notes.map((_, i) => i).filter((i) => !checked.failures.has(i));
  const inBatch = findInBatchDuplicates(notes, checked.fieldsByModel, candidates, options);
  inBatch.forEach((reason, i) => fail(i, reason));
  candidates = candidates.filter((i) => !inBatch.has(i));

  // 2. Ask AnkiConnect why notes can't be added (read-only).
  const ankiNotes = notes.map((n) => toAnkiNote(n, options));
  try {
    for (const group of chunk(candidates, Math.max(chunkSize, 50))) {
      const checks = await client.note.canAddNotesWithErrorDetail({
        notes: group.map((i) => ankiNotes[i] as AnkiNote),
      });
      group.forEach((noteIndex, j) => {
        const check = checks[j];
        if (check && !check.canAdd) fail(noteIndex, check.error);
      });
    }
  } catch (error) {
    if (isConnectionError(error)) throw error;
    if (!isUnsupportedAction(error)) throw error;
    // Older AnkiConnect without canAddNotesWithErrorDetail: rely on addNotes.
  }
  candidates = candidates.filter((i) => outcomes[i]?.status === 'not_attempted');

  if (dryRun) {
    candidates.forEach((i) => {
      const outcome = outcomes[i];
      if (outcome) outcome.status = 'valid';
    });
    return { dryRun, chunkSize, outcomes };
  }

  // 3. Write, one chunk at a time.
  const chunks = chunk(candidates, chunkSize);
  let done = 0;
  for (const [c, group] of chunks.entries()) {
    if (c > 0 && pauseMs > 0) await sleep(pauseMs);
    try {
      const ids = await client.note.addNotes({ notes: group.map((i) => ankiNotes[i] as AnkiNote) });
      group.forEach((noteIndex, j) => {
        const id = ids?.[j];
        const outcome = outcomes[noteIndex];
        if (!outcome) return;
        if (id === null || id === undefined) {
          Object.assign(outcome, {
            status: 'failed',
            reason: 'rejected by Anki without a reason (possibly a duplicate within this batch)',
          });
        } else {
          Object.assign(outcome, { status: 'added', noteId: Number(id) });
        }
      });
    } catch (error) {
      const abort = await handleChunkError(client, error, group, {
        notes,
        ankiNotes,
        outcomes,
        options,
        fieldsByModel: checked.fieldsByModel,
        startedAt,
      });
      if (abort) {
        return { dryRun, chunkSize, outcomes, abortedReason: abort };
      }
    }
    done += group.length;
    await options.onProgress?.(done, candidates.length);
  }
  return { dryRun, chunkSize, outcomes };
}

/** Returns an abort reason if the run must stop, otherwise undefined. */
async function handleChunkError(
  client: BatchClient,
  error: unknown,
  group: number[],
  ctx: {
    notes: ResolvedNote[];
    ankiNotes: AnkiNote[];
    outcomes: NoteOutcome[];
    options: AddOptions;
    fieldsByModel: Map<string, string[]>;
    startedAt: number;
  }
): Promise<string | undefined> {
  const { notes, ankiNotes, outcomes, options, fieldsByModel, startedAt } = ctx;
  const markUnknown = (indexes: number[], reason: string) =>
    indexes.forEach((i) => {
      const outcome = outcomes[i];
      if (outcome) Object.assign(outcome, { status: 'unknown', reason });
    });

  const reachable = !isConnectionError(error) && (await isAnkiReachable(client));
  if (!reachable) {
    markUnknown(
      group,
      'Anki stopped responding while this chunk was being sent; it may or may not have been saved. Check with find before re-adding.'
    );
    return error instanceof AnkiConnectionError
      ? error.message
      : `${errorMessage(error)} (AnkiConnect is not responding; Anki may have quit)`;
  }

  if (options.allowDuplicate) {
    markUnknown(
      group,
      `AnkiConnect rejected this chunk (${errorMessage(error)}). With allowDuplicate on, it is not retried note by note; check with find before re-adding.`
    );
    return undefined;
  }

  // Anki is up and rejected the chunk: add one by one to get per-note results.
  for (const [k, noteIndex] of group.entries()) {
    const outcome = outcomes[noteIndex];
    if (!outcome) continue;
    try {
      const id = await client.note.addNote({ note: ankiNotes[noteIndex] as AnkiNote });
      if (id === null) {
        Object.assign(outcome, { status: 'failed', reason: 'rejected by Anki without a reason' });
      } else {
        Object.assign(outcome, { status: 'added', noteId: id });
      }
    } catch (noteError) {
      if (isConnectionError(noteError) || !(await isAnkiReachable(client))) {
        markUnknown(
          group.slice(k, k + 1),
          'Anki stopped responding while this note was being sent; check with find before re-adding.'
        );
        return errorMessage(noteError);
      }
      const reason = errorMessage(noteError);
      const note = notes[noteIndex];
      const firstField = note ? fieldsByModel.get(note.modelName)?.[0] : undefined;
      if (/duplicate/i.test(reason) && note && firstField) {
        // AnkiConnect saves what it can before rejecting a chunk, so this
        // "duplicate" is most likely the copy saved by that chunk request.
        try {
          const savedId = await findSavedDuplicate(client, note, firstField, startedAt);
          if (savedId !== undefined) {
            Object.assign(outcome, { status: 'added', noteId: savedId });
          } else {
            Object.assign(outcome, {
              status: 'unknown',
              reason: `${reason}; it may have been saved by the rejected chunk request. Check with find before re-adding.`,
            });
          }
        } catch (lookupError) {
          Object.assign(outcome, {
            status: 'unknown',
            reason: `${reason}; couldn't check whether it was saved (${errorMessage(lookupError)}). Check with find before re-adding.`,
          });
        }
        continue;
      }
      Object.assign(outcome, { status: 'failed', reason });
    }
  }
  return undefined;
}

export function summarizeReport(report: BatchReport) {
  const count = (status: NoteStatus) => report.outcomes.filter((o) => o.status === status).length;
  return {
    total: report.outcomes.length,
    added: count('added'),
    valid: count('valid'),
    failed: count('failed'),
    unknown: count('unknown'),
    notAttempted: count('not_attempted'),
  };
}

/** Human/agent-readable report, mapping every note to its result. */
export function formatBatchReport(report: BatchReport, source?: string): string {
  const s = summarizeReport(report);
  const lines: string[] = [];
  const from = source ? ` from ${source}` : '';

  if (report.dryRun) {
    lines.push(
      `Dry run${from}: ${s.valid} of ${s.total} note(s) can be added, ${s.failed} would fail. Nothing was written.`
    );
  } else {
    const parts = [`${s.added} added`, `${s.failed} failed`];
    if (s.unknown > 0) parts.push(`${s.unknown} unknown`);
    if (s.notAttempted > 0) parts.push(`${s.notAttempted} not attempted`);
    lines.push(
      `Batch create${from}: ${parts.join(', ')} (${s.total} total, sent in chunks of ${report.chunkSize}).`
    );
  }
  if (report.abortedReason) lines.push(`Stopped early: ${report.abortedReason}`);

  const section = (title: string, status: NoteStatus, show: (o: NoteOutcome) => string) => {
    const items = report.outcomes.filter((o) => o.status === status);
    if (items.length === 0) return;
    lines.push('', `${title} (${items.length}):`);
    for (const o of items) lines.push(`  #${o.index} ${show(o)}`);
  };
  const label = (o: NoteOutcome) => `"${o.label}"`;

  section('Added', 'added', (o) => `id ${o.noteId} ${label(o)}`);
  section('Valid', 'valid', label);
  section('Failed', 'failed', (o) => `${label(o)}: ${o.reason}`);
  section('Unknown', 'unknown', (o) => `${label(o)}: ${o.reason}`);
  section('Not attempted', 'not_attempted', label);

  const retry = report.outcomes
    .filter((o) => o.status === 'not_attempted' || o.status === 'unknown')
    .map((o) => o.index);
  if (!report.dryRun && retry.length > 0) {
    lines.push(
      '',
      `To resume: once Anki is running, re-send only notes #${retry.join(', #')} (check "unknown" ones with find first). Added notes are already saved.`
    );
  }
  return lines.join('\n');
}
