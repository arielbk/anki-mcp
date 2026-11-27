import { AnkiConnectionError, errorMessage, isAnkiReachable, isConnectionError } from './errors.js';

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
    throw new Error(
      `Some notes have no deck or note type. Set top-level deckName/modelName as defaults or give them per note:\n${problems.join('\n')}`
    );
  }
  return resolved;
}

/**
 * Checks model names and field names locally (one request for the model
 * list, one for the models' fields). Returns a reason per failing note index.
 */
export async function checkModelsAndFields(
  client: BatchClient,
  notes: ResolvedNote[]
): Promise<Map<number, string>> {
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

  notes.forEach((note, i) => {
    const modelFields = fieldsByModel.get(note.modelName);
    if (!Object.hasOwn(known, note.modelName) || !modelFields) {
      failures.set(i, `note type "${note.modelName}" does not exist`);
      return;
    }
    const unknown = Object.keys(note.fields).filter((f) => !modelFields.includes(f));
    if (unknown.length > 0) {
      failures.set(
        i,
        `unknown field(s) ${unknown.map((f) => `"${f}"`).join(', ')} for note type "${note.modelName}" (fields: ${modelFields.join(', ')})`
      );
      return;
    }
    const firstField = modelFields[0];
    if (firstField && !note.fields[firstField]?.trim()) {
      failures.set(i, `first field "${firstField}" is empty`);
    }
  });
  return failures;
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
  notes: ResolvedNote[],
  options: BatchRunOptions = {}
): Promise<BatchReport> {
  const chunkSize = options.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const pauseMs = options.pauseMs ?? DEFAULT_PAUSE_MS;
  const sleep = options.sleep ?? defaultSleep;
  const dryRun = options.dryRun ?? false;

  const outcomes: NoteOutcome[] = notes.map((note, i) => ({
    index: i + 1,
    label: noteLabel(note.fields),
    status: 'not_attempted',
  }));
  const fail = (i: number, reason: string) => {
    const outcome = outcomes[i];
    if (outcome) Object.assign(outcome, { status: 'failed', reason });
  };

  // 1. Local model/field checks (read-only).
  const localFailures = await checkModelsAndFields(client, notes);
  localFailures.forEach((reason, i) => fail(i, reason));

  // 2. Ask AnkiConnect why notes can't be added (read-only).
  let candidates = notes.map((_, i) => i).filter((i) => !localFailures.has(i));
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
      const abort = await handleChunkError(client, error, group, ankiNotes, outcomes, options);
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
  ankiNotes: AnkiNote[],
  outcomes: NoteOutcome[],
  options: AddOptions
): Promise<string | undefined> {
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
      Object.assign(outcome, { status: 'failed', reason: errorMessage(noteError) });
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
