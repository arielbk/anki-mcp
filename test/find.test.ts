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

/** Evaluates the is:/deck:filtered terms find uses against one card, like Anki. */
function matchesTerms(c: FakeCard, terms: string[]): boolean {
  return terms.every((raw) => {
    const neg = raw.startsWith('-');
    const term = neg ? raw.slice(1) : raw;
    const hit =
      term === 'is:new'
        ? c.type === 0
        : term === 'is:review'
          ? c.type === 2 || c.type === 3
          : term === 'is:learn'
            ? c.queue === 1 || c.queue === 3
            : term === 'is:suspended'
              ? c.queue === -1
              : term === 'is:buried'
                ? c.queue === -2 || c.queue === -3
                : term === 'deck:filtered'
                  ? c.deckName.startsWith('Filtered')
                  : true;
    return neg ? !hit : hit;
  });
}

/**
 * In-memory collection; never talks to Anki. Every note has one card per
 * entry in `cards`. Queries: "all" or "(all) <is: terms>", "cid:1,2 deck:filtered",
 * "prop:due=k -deck:filtered".
 */
function fakeCollection(
  count: number,
  opts: { today?: number; longText?: boolean; edit?: (c: FakeCard) => void } = {}
) {
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
      opts.edit?.(cards.at(-1)!);
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
  const search = (query: string): FakeCard[] => {
    const cid = /^cid:([\d,]+) (.*)$/.exec(query);
    if (cid) {
      const ids = new Set(cid[1]!.split(',').map(Number));
      return cards.filter((c) => ids.has(c.cardId) && matchesTerms(c, cid[2]!.split(' ')));
    }
    const due = /^prop:due=(-?\d+) -deck:filtered$/.exec(query);
    if (due) {
      if (opts.today === undefined) return [];
      return cards.filter(
        (c) =>
          c.queue === 2 &&
          c.due - opts.today! === Number(due[1]) &&
          matchesTerms(c, ['-deck:filtered'])
      );
    }
    const terms = query.replace(/^\(all\)\s*/, '').replace(/^all$/, '');
    return cards.filter((c) => matchesTerms(c, terms ? terms.split(' ') : []));
  };
  const client = {
    note: {
      findNotes: vi.fn(async () => notes.map((n) => n.noteId)),
      notesInfo: vi.fn(async ({ notes: ids }: { notes: number[] }) =>
        ids.map((id) => notes.find((n) => n.noteId === id)!)
      ),
    },
    card: {
      findCards: vi.fn(async ({ query }: { query: string }) => search(query).map((c) => c.cardId)),
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
      multi: vi.fn(
        async ({ actions }: { actions: Array<{ action: string; params: { query: string } }> }) =>
          actions.map(({ action, params }) => {
            const hit = search(params.query);
            const ids =
              action === 'findNotes'
                ? [...new Set(hit.map((c) => c.note))]
                : hit.map((c) => c.cardId);
            return { result: ids, error: null };
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
      now: new Date(2026, 10, 28, 12),
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

  it('counts per scheduling state with searches, not cardsInfo', async () => {
    const { client, mocks } = fakeCollection(6);
    const text = await runFind(client, { query: 'all', groupBy: 'state' });
    expect(text.split('\n').slice(1)).toEqual([
      'new: 5 cards, 4 notes',
      'review: 3 cards, 2 notes',
    ]);
    expect(mocks.card.cardsInfo).not.toHaveBeenCalled();
    expect(mocks.miscellaneous.multi).toHaveBeenCalledTimes(1);
  });

  it('splits learning, relearning, suspended and buried like queueLabel', async () => {
    // Note 1000: buried learning card; 1001: relearning; 1002: suspended new;
    // 1003: buried review; 1004: learning (day-learn queue).
    const edits: Record<number, Partial<FakeCard>> = {
      10000: { queue: -2, type: 1 },
      10001: { queue: 1, type: 3 },
      10010: { queue: 1, type: 3 },
      10020: { queue: -1, type: 0 },
      10030: { queue: -3, type: 2 },
      10040: { queue: 3, type: 1 },
    };
    const { client } = fakeCollection(5, {
      edit: (c) => Object.assign(c, edits[c.cardId] ?? {}),
    });
    const text = await runFind(client, { query: 'all', groupBy: 'state', format: 'json' });
    const out = JSON.parse(text);
    expect(out).toMatchObject({ notes: 5, cards: 6, new: 1, seen: 5 });
    expect(out.groups).toEqual({
      learning: { notes: 1, cards: 1, new: 0, seen: 1 },
      relearning: { notes: 2, cards: 2, new: 0, seen: 2 },
      suspended: { notes: 1, cards: 1, new: 1, seen: 0 },
      buried: { notes: 2, cards: 2, new: 0, seen: 2 },
    });
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

  it('never anchors on cards in filtered decks', async () => {
    const { client, mocks } = fakeCollection(1, { today: 2149 });
    await resolveToday(client);
    const { actions } = mocks.miscellaneous.multi.mock.calls[0]![0];
    expect(actions.every((a) => a.params.query.endsWith(' -deck:filtered'))).toBe(true);
  });

  it('shows the due of cards in filtered decks as unknown', async () => {
    const { client } = fakeCollection(4, {
      today: 2148,
      // Note 1003's card moved to a filtered deck; its due is a position.
      edit: (c) => {
        if (c.cardId === 10030) Object.assign(c, { deckName: 'Filtered Deck 1', due: -99_000 });
      },
    });
    const text = await runFind(client, {
      query: 'all',
      include: ['state'],
      now: new Date(2026, 10, 28, 12),
    });
    expect(text).toContain('10000 review ivl=3d due=2026-11-30');
    expect(text).toContain('10030 review ivl=3d due=unknown (in filtered deck)');
  });
});

describe('get_stats', () => {
  const ids: Record<string, number> = {
    Spanish: 105,
    French: 106,
    'Spanish::Verbs': 107,
    'French::Verbs': 108,
  };
  function statsClient(): DeckStatsClient & { deck: { getDeckStats: ReturnType<typeof vi.fn> } } {
    return {
      deck: {
        deckNamesAndIds: vi.fn(async () => ({ ...ids })),
        // Keyed by ID with leaf names only, like AnkiConnect.
        getDeckStats: vi.fn(async ({ decks }: { decks: string[] }) =>
          Object.fromEntries(
            decks.map((name) => [
              String(ids[name]),
              {
                deck_id: ids[name]!,
                name: name.split('::').pop()!,
                new_count: ids[name]! % 10,
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
      'French: 50 total | new 6, learning 1, review 9',
      'Not found: "Nope" (check names with manage_decks list)',
    ]);
    expect(client.deck.getDeckStats).toHaveBeenCalledWith({ decks: ['Spanish', 'French'] });
  });

  it('matches results by deck ID, not the (leaf) name', async () => {
    const client = statsClient();
    const text = await getDeckStatsText(client, undefined, ['French::Verbs', 'Spanish::Verbs']);
    expect(text.split('\n').slice(1)).toEqual([
      'French::Verbs: 50 total | new 8, learning 1, review 9',
      'Spanish::Verbs: 50 total | new 7, learning 1, review 9',
    ]);
  });

  it('accepts deckName and names both params when neither is given', async () => {
    const client = statsClient();
    expect(await getDeckStatsText(client, 'Spanish')).toContain('Spanish: 50 total');
    await expect(getDeckStatsText(client)).rejects.toThrow(/deckName .*or deckNames/);
  });
});
