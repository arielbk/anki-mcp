import { describe, expect, it, vi } from 'vitest';
import {
  chunk,
  formatBatchReport,
  noteLabel,
  resolveNotes,
  runBatch,
  summarizeReport,
  type BatchClient,
  type ResolvedNote,
} from '../src/utils/batch.js';
import { AnkiConnectionError } from '../src/utils/errors.js';

const URL = 'http://127.0.0.1:8765';

const NOW = 1_800_000_000_000;

interface StoredNote {
  id: number;
  deckName: string;
  modelName: string;
  fields: Record<string, string>;
}

type SentNote = ResolvedNote & { options?: { allowDuplicate?: boolean; duplicateScope?: string } };

/**
 * In-memory stand-in for AnkiConnect. Never talks to a real Anki.
 * Mirrors real AnkiConnect behaviour: field names match case-insensitively,
 * duplicates are checked per note type on the first field, and addNotes adds
 * every note it can and then throws the aggregated error list (no rollback).
 */
function mockClient(opts: { failAddNotesCall?: number } = {}) {
  let nextId = NOW;
  let addNotesCalls = 0;
  let up = true;
  const models: Record<string, string[]> = { Basic: ['Front', 'Back'], Cloze: ['Text', 'Extra'] };
  const store: StoredNote[] = [
    { id: 1, deckName: 'Deck', modelName: 'Basic', fields: { Front: 'already here', Back: '' } },
  ];

  const firstValue = (note: { modelName: string; fields: Record<string, string> }) => {
    const first = models[note.modelName]?.[0]?.toLowerCase();
    return Object.entries(note.fields).find(([k]) => k.toLowerCase() === first)?.[1] ?? '';
  };
  const problem = (note: SentNote): string | undefined => {
    if (note.deckName === 'Missing') return 'deck was not found: Missing';
    if (note.options?.allowDuplicate) return undefined;
    const value = firstValue(note);
    const dup = store.some(
      (s) =>
        s.modelName === note.modelName &&
        firstValue(s) === value &&
        (note.options?.duplicateScope !== 'deck' || s.deckName === note.deckName)
    );
    return dup ? 'cannot create note because it is a duplicate' : undefined;
  };
  const addOne = (note: SentNote) => {
    const error = problem(note);
    if (error) throw new Error(error);
    const id = nextId++;
    store.push({ id, deckName: note.deckName, modelName: note.modelName, fields: note.fields });
    return id;
  };

  const client = {
    note: {
      addNotes: vi.fn(async ({ notes }: { notes: SentNote[] }) => {
        addNotesCalls++;
        if (addNotesCalls === opts.failAddNotesCall) {
          up = false; // Anki "quits" mid-request
          throw new AnkiConnectionError(URL);
        }
        const ids: number[] = [];
        const errors: string[] = [];
        for (const note of notes) {
          try {
            ids.push(addOne(note));
          } catch (e) {
            errors.push((e as Error).message);
          }
        }
        if (errors.length > 0) throw new Error(JSON.stringify(errors));
        return ids;
      }),
      addNote: vi.fn(async ({ note }: { note: SentNote }) => addOne(note)),
      canAddNotesWithErrorDetail: vi.fn(async ({ notes }: { notes: SentNote[] }) =>
        notes.map((n) => {
          const error = problem(n);
          return error ? { canAdd: false as const, error } : { canAdd: true as const };
        })
      ),
      findNotes: vi.fn(async ({ query }: { query: string }) => {
        const terms = [...query.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) =>
          (m[1] ?? '').replace(/\\(.)/g, '$1')
        );
        return store
          .filter((s) =>
            terms.every((t) => {
              const [key = '', ...rest] = t.split(':');
              const value = rest.join(':');
              if (key === 'deck') return s.deckName === value;
              if (key === 'note') return s.modelName === value;
              return s.fields[key] === value;
            })
          )
          .map((s) => s.id);
      }),
      notesInfo: vi.fn(async ({ notes }: { notes: number[] }) =>
        store
          .filter((s) => notes.includes(s.id))
          .map((s) => ({
            noteId: s.id,
            fields: Object.fromEntries(
              Object.entries(s.fields).map(([k, value], order) => [k, { value, order }])
            ),
          }))
      ),
    },
    model: {
      modelNamesAndIds: vi.fn(async () =>
        Object.fromEntries(Object.keys(models).map((m, i) => [m, i + 1]))
      ),
      findModelsByName: vi.fn(async ({ modelNames }: { modelNames: string[] }) =>
        modelNames.map((name) => ({
          name,
          flds: (models[name] ?? []).map((f, ord) => ({ name: f, ord })),
        }))
      ),
    },
    miscellaneous: {
      version: vi.fn(async () => {
        if (!up) throw new AnkiConnectionError(URL);
        return 6;
      }),
    },
  };
  return Object.assign(client satisfies BatchClient, { store });
}

const basic = (front: string, extra: Partial<ResolvedNote> = {}): ResolvedNote => ({
  deckName: 'Deck',
  modelName: 'Basic',
  fields: { Front: front, Back: `answer to ${front}` },
  tags: [],
  ...extra,
});

const noSleep = { sleep: async () => {}, now: () => NOW };

describe('chunk', () => {
  it('splits into fixed-size chunks', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunk([], 10)).toEqual([]);
    expect(() => chunk([1], 0)).toThrow();
  });
});

describe('noteLabel', () => {
  it('uses the first field, strips HTML and truncates to ~40 chars', () => {
    expect(noteLabel({ Front: '<b>What</b> is <code>map</code>?', Back: 'x' })).toBe(
      'What is map ?'
    );
    const label = noteLabel({ Front: 'a'.repeat(100) });
    expect(label).toHaveLength(40);
    expect(label.endsWith('…')).toBe(true);
  });
});

describe('resolveNotes', () => {
  it('applies top-level defaults, lets notes override them, and merges tags', () => {
    const resolved = resolveNotes(
      [
        { fields: { Front: 'a' } },
        { fields: { Front: 'b' }, deckName: 'Other', modelName: 'Cloze', tags: ['x', 'shared'] },
      ],
      { deckName: 'Default Deck', modelName: 'Basic', tags: ['shared', 'import'] }
    );
    expect(resolved).toEqual([
      {
        deckName: 'Default Deck',
        modelName: 'Basic',
        fields: { Front: 'a' },
        tags: ['shared', 'import'],
      },
      {
        deckName: 'Other',
        modelName: 'Cloze',
        fields: { Front: 'b' },
        tags: ['shared', 'import', 'x'],
      },
    ]);
  });

  it('lists every note missing a deck or model', () => {
    expect(() =>
      resolveNotes([{ fields: { Front: 'a' } }, { fields: { Front: 'b' }, deckName: 'D' }], {})
    ).toThrow(/#1 "a" has no deckName or modelName\n#2 "b" has no modelName/);
  });
});

describe('runBatch', () => {
  it('adds notes in sequential chunks and maps IDs back to notes', async () => {
    const client = mockClient();
    const notes = Array.from({ length: 25 }, (_, i) => basic(`q${i + 1}`));
    const sleep = vi.fn(async () => {});
    const onProgress = vi.fn();
    const report = await runBatch(client, notes, {
      chunkSize: 10,
      sleep,
      onProgress,
      now: () => NOW,
    });

    expect(client.note.addNotes).toHaveBeenCalledTimes(3);
    expect(client.note.addNotes.mock.calls.map(([arg]) => arg.notes.length)).toEqual([10, 10, 5]);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(onProgress.mock.calls).toEqual([
      [10, 25],
      [20, 25],
      [25, 25],
    ]);
    expect(summarizeReport(report)).toMatchObject({ total: 25, added: 25, failed: 0 });
    expect(report.outcomes[0]).toEqual({ index: 1, label: 'q1', status: 'added', noteId: NOW });
    expect(report.outcomes[24]).toMatchObject({ index: 25, label: 'q25', noteId: NOW + 24 });
  });

  it('defaults to chunks of 10', async () => {
    const client = mockClient();
    await runBatch(
      client,
      Array.from({ length: 43 }, (_, i) => basic(`q${i}`)),
      noSleep
    );
    expect(client.note.addNotes).toHaveBeenCalledTimes(5);
  });

  it('reports per-note reasons and skips invalid notes', async () => {
    const client = mockClient();
    const report = await runBatch(
      client,
      [
        basic('ok'),
        basic('already here'),
        basic('typo', { fields: { Frnt: 'typo' } }),
        basic('nomodel', { modelName: 'Nope' }),
        basic(''),
      ],
      noSleep
    );
    const byIndex = report.outcomes.map((o) => [o.status, o.reason]);
    expect(byIndex[0]).toEqual(['added', undefined]);
    expect(byIndex[1]).toEqual(['failed', 'cannot create note because it is a duplicate']);
    expect(byIndex[2]?.[1]).toMatch(
      /unknown field\(s\) "Frnt" for note type "Basic" \(fields: Front, Back\)/
    );
    expect(byIndex[3]?.[1]).toBe('note type "Nope" does not exist');
    expect(byIndex[4]?.[1]).toBe('first field "Front" is empty');
    // Only the valid note was sent.
    expect(client.note.addNotes.mock.calls[0]?.[0].notes).toHaveLength(1);
  });

  it('passes allowDuplicate / duplicateScope through to AnkiConnect', async () => {
    const client = mockClient();
    await runBatch(client, [basic('a')], {
      ...noSleep,
      allowDuplicate: true,
      duplicateScope: 'deck',
    });
    const sent = client.note.addNotes.mock.calls[0]?.[0].notes[0] as unknown as {
      options: unknown;
    };
    expect(sent.options).toEqual({ allowDuplicate: true, duplicateScope: 'deck' });
  });

  it('dryRun validates without writing', async () => {
    const client = mockClient();
    const report = await runBatch(client, [basic('ok'), basic('already here')], {
      ...noSleep,
      dryRun: true,
    });
    expect(client.note.addNotes).not.toHaveBeenCalled();
    expect(client.note.addNote).not.toHaveBeenCalled();
    expect(report.outcomes.map((o) => o.status)).toEqual(['valid', 'failed']);
    expect(formatBatchReport(report)).toMatch(
      /^Dry run: 1 of 2 note\(s\) can be added, 1 would fail/
    );
  });

  it('stops when Anki quits mid-batch and reports what was saved', async () => {
    const client = mockClient({ failAddNotesCall: 3 });
    const notes = Array.from({ length: 45 }, (_, i) => basic(`q${i + 1}`));
    const report = await runBatch(client, notes, { ...noSleep, chunkSize: 10 });

    expect(client.note.addNotes).toHaveBeenCalledTimes(3);
    expect(summarizeReport(report)).toEqual({
      total: 45,
      added: 20,
      valid: 0,
      failed: 0,
      unknown: 10,
      notAttempted: 15,
    });
    expect(report.abortedReason).toMatch(/Couldn't reach AnkiConnect/);
    expect(report.outcomes[19]).toMatchObject({ status: 'added', noteId: NOW + 19 });
    expect(report.outcomes[20]?.status).toBe('unknown');
    expect(report.outcomes[30]?.status).toBe('not_attempted');

    const text = formatBatchReport(report);
    expect(text).toMatch(/20 added, 0 failed, 10 unknown, 15 not attempted/);
    expect(text).toContain(`#20 id ${NOW + 19} "q20"`);
    expect(text).toMatch(/To resume: .*re-send only notes #21, #22/);
  });

  it('fails duplicates within the batch up front (a,b,c,a,e)', async () => {
    const client = mockClient();
    const report = await runBatch(
      client,
      ['a', 'b', 'c', 'a', 'e'].map((f) => basic(f)),
      noSleep
    );
    expect(client.note.addNotes).toHaveBeenCalledTimes(1);
    expect(client.note.addNotes.mock.calls[0]?.[0].notes).toHaveLength(4);
    expect(report.outcomes.map((o) => o.status)).toEqual([
      'added',
      'added',
      'added',
      'failed',
      'added',
    ]);
    expect(report.outcomes[3]?.reason).toBe('duplicate of note #1 in this batch');
    expect(client.store).toHaveLength(5); // 1 pre-existing + 4 new
    expect(formatBatchReport(report)).toMatch(/4 added, 1 failed/);
  });

  it('respects duplicateScope and allowDuplicate for in-batch duplicates', async () => {
    const twoDecks = [basic('same'), basic('same', { deckName: 'Other' })];
    const scoped = await runBatch(mockClient(), twoDecks, { ...noSleep, duplicateScope: 'deck' });
    expect(scoped.outcomes.map((o) => o.status)).toEqual(['added', 'added']);

    const collection = await runBatch(mockClient(), twoDecks, noSleep);
    expect(collection.outcomes.map((o) => o.status)).toEqual(['added', 'failed']);

    const allowed = await runBatch(mockClient(), [basic('x'), basic('x')], {
      ...noSleep,
      allowDuplicate: true,
    });
    expect(allowed.outcomes.map((o) => o.status)).toEqual(['added', 'added']);
  });

  it('reports notes saved by a partly rejected chunk as added, not failed', async () => {
    const client = mockClient();
    // Pre-check misses the problems (e.g. changed in Anki meanwhile).
    client.note.canAddNotesWithErrorDetail.mockImplementationOnce(async ({ notes }) =>
      notes.map(() => ({ canAdd: true as const }))
    );
    const report = await runBatch(
      client,
      [basic('a'), basic('bad', { deckName: 'Missing' }), basic('c'), basic('already here')],
      noSleep
    );
    // addNotes saved a and c, then threw; the retry recognises them via findNotes.
    expect(client.note.addNotes).toHaveBeenCalledTimes(1);
    expect(report.outcomes.map((o) => o.status)).toEqual(['added', 'failed', 'added', 'unknown']);
    expect(report.outcomes[0]?.noteId).toBe(NOW);
    expect(report.outcomes[2]?.noteId).toBe(NOW + 1);
    expect(report.outcomes[1]?.reason).toMatch(/deck was not found/);
    expect(report.outcomes[3]?.reason).toMatch(/duplicate.*Check with find/);
    expect(client.store).toHaveLength(3); // nothing added twice
    expect(report.abortedReason).toBeUndefined();
  });

  it('does not retry note by note when duplicates are allowed', async () => {
    const client = mockClient();
    client.note.canAddNotesWithErrorDetail.mockImplementationOnce(async ({ notes }) =>
      notes.map(() => ({ canAdd: true as const }))
    );
    const report = await runBatch(client, [basic('a'), basic('b', { deckName: 'Missing' })], {
      ...noSleep,
      allowDuplicate: true,
    });
    expect(client.note.addNote).not.toHaveBeenCalled();
    expect(report.outcomes.map((o) => o.status)).toEqual(['unknown', 'unknown']);
  });

  it('matches field names case-insensitively and sends the note type casing', async () => {
    const client = mockClient();
    const report = await runBatch(
      client,
      [
        basic('x', { fields: { front: 'lower', BACK: 'upper' } }),
        basic('y', { fields: { front: '  ', back: 'b' } }),
        basic('z', { fields: { Front: 'one', front: 'two' } }),
      ],
      noSleep
    );
    expect(report.outcomes.map((o) => o.status)).toEqual(['added', 'failed', 'failed']);
    expect(report.outcomes[1]?.reason).toBe('first field "Front" is empty');
    expect(report.outcomes[2]?.reason).toMatch(/given more than once/);
    expect(client.note.addNotes.mock.calls[0]?.[0].notes[0]?.fields).toEqual({
      Front: 'lower',
      Back: 'upper',
    });
  });

  it('falls back when canAddNotesWithErrorDetail is unsupported', async () => {
    const client = mockClient();
    client.note.canAddNotesWithErrorDetail.mockRejectedValueOnce(new Error('unsupported action'));
    const report = await runBatch(client, [basic('a')], noSleep);
    expect(report.outcomes[0]?.status).toBe('added');
  });

  it('propagates a connection error before anything is written', async () => {
    const client = mockClient();
    client.model.modelNamesAndIds.mockRejectedValueOnce(new AnkiConnectionError(URL));
    await expect(runBatch(client, [basic('a')], noSleep)).rejects.toThrow(/Is Anki running/);
    expect(client.note.addNotes).not.toHaveBeenCalled();
  });
});
