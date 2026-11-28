import { describe, expect, it, vi } from 'vitest';
import {
  resolveInclude,
  resolveToday,
  runFind,
  stripHtml,
  truncate,
  type FindClient,
} from '../src/utils/find.js';
import { getDeckStatsText, type DeckStatsClient } from '../src/utils/deckStats.js';

interface FakeCard {
  cardId: number;
  note: number;
  deckName: string;
  queue: number;
  type: number;
  due: number;
  interval: number;
  reps: number;
  lapses: number;
  factor: number;
}

/**
 * In-memory collection; never talks to Anki. Every note has one card per
 * entry in `cards`. Queries: "all", "(all) is:new", "prop:due=k".
 */
function fakeCollection(count: number, opts: { today?: number; longText?: boolean } = {}) {
  const notes = [];
  const cards: FakeCard[] = [];
  for (let i = 0; i < count; i++) {
    const noteId = 1000 + i;
    const seen = i % 3 === 0;
    const cardIds = [noteId * 10, ...(i % 5 === 0 ? [noteId * 10 + 1] : [])];
    cardIds.forEach((cardId, j) => {
      cards.push({
        cardId,
        note: noteId,
        deckName: j === 0 ? 'Interview prep' : 'Interview prep::Extra',
        queue: seen ? 2 : 0,
        type: seen ? 2 : 0,
        due: seen ? 2150 + i : i,
        interval: seen ? 3 : 0,
        reps: seen ? 4 : 0,
        lapses: 0,
        factor: seen ? 2500 : 0,
      });
    });
    notes.push({
      noteId,
      modelName: i % 2 ? 'Basic' : 'Cloze',
      tags: i % 4 === 0 ? [] : ['infra', ...(i % 2 ? ['postgres'] : [])],
      cards: cardIds,
      fields: {
        Back: { order: 1, value: opts.longText ? 'x'.repeat(500) : `answer&nbsp;${i}` },
        Front: { order: 0, value: `<b>Question</b><br>number ${i}` },
      },
    });
  }
  const isNew = (c: FakeCard) => c.type === 0;
  const client = {
    note: {
      findNotes: vi.fn(async () => notes.map((n) => n.noteId)),
      notesInfo: vi.fn(async ({ notes: ids }: { notes: number[] }) =>
        ids.map((id) => notes.find((n) => n.noteId === id)!)
      ),
    },
    card: {
      findCards: vi.fn(async ({ query }: { query: string }) =>
        cards.filter((c) => (query.endsWith('is:new') ? isNew(c) : true)).map((c) => c.cardId)
      ),
      cardsInfo: vi.fn(async ({ cards: ids }: { cards: number[] }) =>
        ids.map((id) => cards.find((c) => c.cardId === id)!)
      ),
    },
    deck: {
      getDecks: vi.fn(async ({ cards: ids }: { cards: number[] }) => {
        const out: Record<string, number[]> = {};
        for (const id of ids) {
          const c = cards.find((x) => x.cardId === id)!;
          (out[c.deckName] ??= []).push(id);
        }
        return out;
      }),
    },
    miscellaneous: {
      multi: vi.fn(async ({ actions }: { actions: Array<{ params: { query: string } }> }) =>
        actions.map(({ params }) => {
          const k = Number(params.query.replace('prop:due=', ''));
          if (opts.today === undefined) return { result: [], error: null };
          const hit = cards.filter((c) => c.queue === 2 && c.due - opts.today! === k);
          return { result: hit.map((c) => c.cardId), error: null };
        })
      ),
    },
  };
  return { client: client as unknown as FindClient, mocks: client, notes, cards };
}

describe('find helpers', () => {
  it('strips HTML and entities to one line', () => {
    expect(stripHtml('<div>a&nbsp;&amp;<br/>b</div>\n<i>c</i> &#65;&#x42;')).toBe('a & b c AB');
  });

  it('truncates with an ellipsis; 0 means no limit', () => {
    expect(truncate('abcdef', 4)).toBe('abc…');
    expect(truncate('abcdef', 0)).toBe('abcdef');
  });

  it('resolves include defaults and the includeDetails alias', () => {
    expect(resolveInclude(undefined, undefined)).toEqual(['fields']);
    expect(resolveInclude([], undefined)).toEqual([]);
    expect(resolveInclude(undefined, true)).toEqual([
      'fields',
      'tags',
      'deck',
      'model',
      'state',
      'cards',
    ]);
    expect(resolveInclude(['state', 'tags'], undefined)).toEqual(['tags', 'state']);
  });
});

describe('find listing', () => {
  it('defaults to one compact line per note with truncated plain-text fields', async () => {
    const { client, mocks } = fakeCollection(3);
    const text = await runFind(client, { query: 'all' });
    expect(text.split('\n')).toEqual([
      '3 notes match "all"; showing 1-3; end of results',
      '1000 | Front: Question number 0 | Back: answer 0',
      '1001 | Front: Question number 1 | Back: answer 1',
      '1002 | Front: Question number 2 | Back: answer 2',
    ]);
    expect(mocks.card.cardsInfo).not.toHaveBeenCalled();
  });

  it('returns IDs only for include: [] and reports the next offset', async () => {
    const { client, mocks } = fakeCollection(10);
    const text = await runFind(client, { query: 'all', include: [], limit: 4, offset: 2 });
    expect(text).toBe('10 notes match "all"; showing 3-6; next offset 6\nids: 1002,1003,1004,1005');
    expect(mocks.note.notesInfo).not.toHaveBeenCalled();
  });

  it('projects tags, deck, model and per-card state with due dates', async () => {
    const { client } = fakeCollection(1, { today: 2148 });
    const text = await runFind(client, {
      query: 'all',
      include: ['tags', 'deck', 'model', 'state'],
      now: new Date(2026, 10, 28),
    });
    expect(text.split('\n')[1]).toBe(
      '1000 | tags: - | deck: Interview prep, Interview prep::Extra | model: Cloze | cards: 10000 review ivl=3d due=2026-11-30 reps=4 lapses=0 ease=250%; 10001 review ivl=3d due=2026-11-30 reps=4 lapses=0 ease=250%'
    );
  });

  it('falls back to raw day numbers when today cannot be anchored', async () => {
    const { client } = fakeCollection(1);
    const text = await runFind(client, { query: 'all', include: ['state'] });
    expect(text).toContain('due=day 2150');
  });

  it('keeps includeDetails working as the full set', async () => {
    const { client } = fakeCollection(2, { today: 2150 });
    const text = await runFind(client, { query: 'all', includeDetails: true });
    expect(text).toContain('Front: Question number 1');
    expect(text).toContain('tags: infra postgres');
    expect(text).toContain('model: Basic');
    expect(text).toContain('10010 new due=#1');
  });

  it('emits minified JSON with totals and next offset', async () => {
    const { client } = fakeCollection(5);
    const text = await runFind(client, {
      query: 'all',
      include: ['tags', 'cards'],
      limit: 2,
      format: 'json',
    });
    expect(text).not.toContain('\n');
    expect(JSON.parse(text)).toEqual({
      query: 'all',
      total: 5,
      offset: 0,
      shown: 2,
      nextOffset: 2,
      notes: [
        { id: 1000, tags: [], cards: [10000, 10001] },
        { id: 1001, tags: ['infra', 'postgres'], cards: [10010] },
      ],
    });
  });

  it('caps output size and says how to narrow it', async () => {
    const { client } = fakeCollection(200, { longText: true });
    const text = await runFind(client, {
      query: 'all',
      limit: 200,
      maxFieldChars: 0,
    });
    expect(text.length).toBeLessThan(21_000);
    const [header, hint] = text.split('\n');
    expect(header).toMatch(/^200 notes match "all"; showing 1-(\d+); next offset \1$/);
    expect(hint).toContain('200 notes; pass groupBy, include, or a narrower query/limit');
  });

  it('caps JSON output too and still parses', async () => {
    const { client } = fakeCollection(200, { longText: true });
    const text = await runFind(client, {
      query: 'all',
      limit: 200,
      maxFieldChars: 0,
      format: 'json',
    });
    const parsed = JSON.parse(text);
    expect(parsed.total).toBe(200);
    expect(parsed.shown).toBeLessThan(200);
    expect(parsed.nextOffset).toBe(parsed.shown);
    expect(parsed.hint).toContain('pass groupBy');
  });

  it('batches notesInfo and cardsInfo in chunks', async () => {
    const { client, mocks } = fakeCollection(1200);
    await runFind(client, { query: 'all', include: ['state'], limit: 1200 });
    expect(mocks.note.notesInfo).toHaveBeenCalledTimes(3);
    // 1440 cards in chunks of 200.
    expect(mocks.card.cardsInfo).toHaveBeenCalledTimes(8);
  });
});

describe('find groupBy', () => {
  it('counts notes, cards, new and seen per tag over all matches', async () => {
    const { client, mocks } = fakeCollection(12);
    const text = await runFind(client, { query: 'all', groupBy: 'tag', limit: 1 });
    expect(text.split('\n')).toEqual([
      '12 notes, 15 cards (10 new, 5 seen) match "all"; 3 tag groups',
      'A note with several tags counts under each.',
      'infra: 9 notes, 11 cards, 8 new, 3 seen',
      'postgres: 6 notes, 7 cards, 5 new, 2 seen',
      '(untagged): 3 notes, 4 cards, 2 new, 2 seen',
    ]);
    // No per-tag queries and no heavy cardsInfo for tag counts.
    expect(mocks.card.findCards).toHaveBeenCalledTimes(2);
    expect(mocks.card.cardsInfo).not.toHaveBeenCalled();
  });

  it('counts per scheduling state', async () => {
    const { client } = fakeCollection(6);
    const text = await runFind(client, { query: 'all', groupBy: 'state' });
    expect(text.split('\n').slice(1)).toEqual([
      'new: 5 cards, 4 notes',
      'review: 3 cards, 2 notes',
    ]);
  });

  it('counts per deck and model', async () => {
    const { client } = fakeCollection(6);
    expect(await runFind(client, { query: 'all', groupBy: 'deck' })).toContain(
      'Interview prep::Extra: 2 notes, 2 cards, 1 new, 1 seen'
    );
    expect(await runFind(client, { query: 'all', groupBy: 'model', format: 'json' })).toBe(
      '{"query":"all","groupBy":"model","notes":6,"cards":8,"new":5,"seen":3,"groupCount":2,"omittedGroups":0,"groups":{"Basic":{"notes":3,"cards":4,"new":3,"seen":1},"Cloze":{"notes":3,"cards":4,"new":2,"seen":2}}}'
    );
  });

  it('requires a query', async () => {
    const { client } = fakeCollection(1);
    await expect(runFind(client, { query: '  ' })).rejects.toThrow(/requires query/);
  });
});

describe('resolveToday', () => {
  it('anchors the day number from a prop:due match', async () => {
    const { client, mocks } = fakeCollection(4, { today: 2149 });
    expect(await resolveToday(client)).toBe(2149);
    expect(mocks.miscellaneous.multi).toHaveBeenCalledTimes(1);
  });
});

describe('get_stats', () => {
  function statsClient(): DeckStatsClient & { deck: { getDeckStats: ReturnType<typeof vi.fn> } } {
    return {
      deck: {
        deckNames: vi.fn(async () => ['Spanish', 'French']),
        getDeckStats: vi.fn(async ({ decks }: { decks: string[] }) =>
          Object.fromEntries(
            decks.map((name, i) => [
              String(100 + i),
              {
                deck_id: 100 + i,
                name,
                new_count: 5,
                learn_count: 1,
                review_count: 9,
                total_in_deck: 50,
              },
            ])
          )
        ),
      },
    };
  }

  it('accepts deckNames and never passes unknown names to getDeckStats', async () => {
    const client = statsClient();
    const text = await getDeckStatsText(client, undefined, ['Spanish', 'French', 'Nope']);
    expect(text.split('\n')).toEqual([
      'deck: cards total | due today: new, learning, review',
      'Spanish: 50 total | new 5, learning 1, review 9',
      'French: 50 total | new 5, learning 1, review 9',
      'Not found: "Nope" (check names with manage_decks list)',
    ]);
    expect(client.deck.getDeckStats).toHaveBeenCalledWith({ decks: ['Spanish', 'French'] });
  });

  it('accepts deckName and names both params when neither is given', async () => {
    const client = statsClient();
    expect(await getDeckStatsText(client, 'Spanish')).toContain('Spanish: 50 total');
    await expect(getDeckStatsText(client)).rejects.toThrow(/deckName .*or deckNames/);
  });
});
