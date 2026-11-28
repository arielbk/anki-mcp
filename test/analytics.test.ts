import { InMemoryTransport, McpServer } from '@modelcontextprotocol/server';
import { Client } from '@modelcontextprotocol/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDays,
  againByTag,
  correctByCardType,
  countByDay,
  dayKey,
  dayRange,
  formatDayCounts,
  inferRolloverHour,
  intervalStats,
  projectRunOut,
  retention,
  stripHtml,
  studiedToday,
  troubleByCard,
  type Review,
  type ReviewTuple,
} from '../src/analytics/aggregate.js';
import { deckTerm, runMulti, scoped } from '../src/analytics/anki.js';
import {
  cardReviews,
  collectionStats,
  deckOverview,
  reviewsByDay,
  troubleCards,
} from '../src/analytics/scopes.js';

// All times are built in local time so the tests don't depend on the TZ.
const at = (day: number, hour: number, minute = 0) =>
  new Date(2026, 10, day, hour, minute).getTime();
const NOW = at(28, 12);

const review = (over: Partial<Review>): Review => ({
  id: NOW,
  cardId: 1,
  ease: 3,
  ivl: 1,
  lastIvl: 0,
  time: 10_000,
  type: 1,
  ...over,
});

describe('day handling', () => {
  it('buckets by rollover hour, like Anki', () => {
    expect(dayKey(at(28, 3, 59), 4)).toBe('2026-11-27');
    expect(dayKey(at(28, 4), 4)).toBe('2026-11-28');
    expect(dayKey(at(28, 0, 30), 0)).toBe('2026-11-28');
  });

  it('builds day ranges across month boundaries', () => {
    expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
    expect(dayRange('2026-12-01', 3)).toEqual(['2026-12-01', '2026-11-30', '2026-11-29']);
  });

  it('infers the rollover hour from today’s review count', () => {
    // Reviews at 01:30 and 05:30 today; Anki says 1 reviewed today -> day
    // starts between 01:30 and 05:30; 4 (the default) fits.
    const ids = [at(28, 1, 30), at(28, 5, 30)];
    expect(inferRolloverHour(ids, 1, NOW)).toEqual({ hour: 4, inferred: true });
    // Anki says 2 -> the day started at or before 01:30, so not 4.
    expect(inferRolloverHour(ids, 2, NOW)).toEqual({ hour: 1, inferred: true });
    // Impossible count -> assume the default.
    expect(inferRolloverHour(ids, 5, NOW)).toEqual({ hour: 4, inferred: false });
  });

  it('formats one line per day with zero days and a total', () => {
    const reviews = [
      review({ id: at(28, 10) }),
      review({ id: at(28, 11) }),
      review({ id: at(26, 9) }),
    ];
    const text = formatDayCounts(dayRange('2026-11-28', 3), countByDay(reviews, 4));
    expect(text).toBe(
      '2026-11-28: 2\n2026-11-27: 0\n2026-11-26: 1\ntotal: 3 reviews over 3 days (2 with reviews)'
    );
  });
});

describe('answer aggregation', () => {
  const reviews = [
    review({ type: 0, ease: 1, lastIvl: 0 }),
    review({ type: 0, ease: 3, lastIvl: -60 }),
    review({ type: 1, ease: 3, lastIvl: 5 }),
    review({ type: 1, ease: 1, lastIvl: 30 }),
    review({ type: 1, ease: 4, lastIvl: 40 }),
    review({ type: 4, ease: 0 }), // manual reschedule: ignored
  ];

  it('splits correct % by card type', () => {
    expect(correctByCardType(reviews)).toEqual({
      learning: { reviews: 2, again: 1, correctPct: 50 },
      young: { reviews: 1, again: 0, correctPct: 100 },
      mature: { reviews: 2, again: 1, correctPct: 50 },
    });
  });

  it('computes retention from review cards only', () => {
    expect(retention(reviews)).toEqual({ reviews: 3, again: 1, correctPct: 66.7 });
  });

  it('summarizes today with minutes and distinct cards', () => {
    const today = [
      review({ id: at(28, 9), cardId: 1, ease: 1, time: 30_000 }),
      review({ id: at(28, 9, 5), cardId: 1, ease: 3, time: 30_000 }),
      review({ id: at(27, 22), cardId: 2, ease: 3 }),
    ];
    expect(studiedToday(today, '2026-11-28', 4)).toEqual({
      cards: 1,
      reviews: 2,
      minutes: 1,
      again: 1,
      correctPct: 50,
    });
  });

  it('computes interval stats ignoring learning intervals', () => {
    expect(intervalStats([-600, 3, 10, 30])).toEqual({ averageDays: 14.3, longestDays: 30 });
    expect(intervalStats([])).toEqual({ averageDays: null, longestDays: null });
  });
});

describe('projectRunOut', () => {
  it('uses up today’s remaining quota first', () => {
    expect(
      projectRunOut({ unseen: 126, perDay: 20, introducedToday: 20, today: '2026-11-28' })
    ).toEqual({
      date: '2026-12-05',
      daysFromToday: 7,
    });
    expect(
      projectRunOut({ unseen: 25, perDay: 20, introducedToday: 0, today: '2026-11-28' })
    ).toEqual({
      date: '2026-11-29',
      daysFromToday: 1,
    });
    expect(
      projectRunOut({ unseen: 5, perDay: 20, introducedToday: 10, today: '2026-11-28' })
    ).toEqual({
      date: '2026-11-28',
      daysFromToday: 0,
    });
  });

  it('returns null when new cards are disabled', () => {
    expect(
      projectRunOut({ unseen: 5, perDay: 0, introducedToday: 0, today: '2026-11-28' })
    ).toBeNull();
  });
});

describe('trouble aggregation', () => {
  it('ranks cards by Again and groups by tag', () => {
    const reviews = [
      review({ cardId: 1, ease: 1, type: 0 }),
      review({ cardId: 1, ease: 1, type: 1 }),
      review({ cardId: 2, ease: 1, type: 0 }),
      review({ cardId: 3, ease: 3 }),
    ];
    const trouble = troubleByCard(reviews);
    expect(trouble).toEqual([
      { cardId: 1, again: 2, lapsesInWindow: 1, reviews: 2 },
      { cardId: 2, again: 1, lapsesInWindow: 0, reviews: 1 },
    ]);
    const tags = againByTag(new Map(trouble.map((c) => [c.cardId, c.again])), [
      { tags: ['pg', 'idx'], cards: [1] },
      { tags: [], cards: [2, 3] },
    ]);
    expect(tags).toEqual([
      { tag: 'idx', cards: 1, again: 2 },
      { tag: 'pg', cards: 1, again: 2 },
      { tag: '(untagged)', cards: 1, again: 1 },
    ]);
  });

  it('strips HTML and truncates front text', () => {
    expect(stripHtml('<style>.card{}</style>Which <i>DB</i>&nbsp;&amp; why?<br>x')).toBe(
      'Which DB & why? x'
    );
    expect(stripHtml('a'.repeat(100), 10)).toBe(`${'a'.repeat(9)}…`);
  });
});

describe('anki helpers', () => {
  it('escapes deck names in searches', () => {
    expect(deckTerm('My "deck"_1*')).toBe('"deck:My \\"deck\\"\\_1\\*"');
    expect(scoped(undefined, 'is:new')).toBe('deck:* is:new');
  });

  it('unwraps multi results and throws on errors', async () => {
    const client = {
      miscellaneous: { multi: vi.fn(async () => [[1, 2], { result: 5, error: null }]) },
    };
    expect(await runMulti(client, [{ action: 'a' }, { action: 'b' }])).toEqual([[1, 2], 5]);
    client.miscellaneous.multi.mockResolvedValueOnce([{ result: null, error: 'bad search' }]);
    await expect(runMulti(client, [{ action: 'findCards' }])).rejects.toThrow(
      'findCards: bad search'
    );
  });
});

// ---------------------------------------------------------------------------
// Scope tests against an in-memory fake of AnkiConnect's multi.
// ---------------------------------------------------------------------------

const tuple = (id: number, cardId: number, ease: number, type = 1, lastIvl = 3): ReviewTuple => [
  id,
  cardId,
  0,
  ease,
  ease === 1 ? -600 : 5,
  lastIvl,
  2500,
  20_000,
  type,
];

interface Fake {
  decks: string[];
  todayCount: number;
  reviewsByDeck: Record<string, ReviewTuple[]>;
  findCards: (query: string) => number[];
  config?: unknown;
  notes?: Array<{ noteId: number; tags: string[]; cards: number[] }>;
  cards?: Array<{ cardId: number; question: string; lapses: number; deckName: string }>;
  byDay?: Array<[string, number]>;
}

function fakeClient(fake: Fake) {
  const calls: string[] = [];
  const multi = vi.fn(async ({ actions }: { actions: Array<{ action: string; params?: any }> }) =>
    actions.map(({ action, params }) => {
      calls.push(action);
      switch (action) {
        case 'deckNames':
          return fake.decks;
        case 'getNumCardsReviewedToday':
          return fake.todayCount;
        case 'getNumCardsReviewedByDay':
          return fake.byDay ?? [];
        case 'findCards':
          return fake.findCards(params.query);
        case 'cardReviews':
          return (fake.reviewsByDeck[params.deck] ?? []).filter((t) => t[0] > params.startID);
        case 'getDeckConfig':
          return fake.config ?? false;
        case 'getIntervals':
          return params.cards.map(() => 10);
        case 'notesInfo':
          return fake.notes ?? [];
        case 'cardsInfo':
          return (fake.cards ?? []).filter((c) => params.cards.includes(c.cardId));
        default:
          return { result: null, error: `unexpected action ${action}` };
      }
    })
  );
  return { client: { miscellaneous: { multi } }, multi, calls };
}

const baseFake = (): Fake => ({
  decks: ['Lang', 'Lang::Verbs', 'Other'],
  todayCount: 3,
  reviewsByDeck: {
    Lang: [
      tuple(at(28, 9), 1, 1, 0, 0),
      tuple(at(28, 9, 5), 1, 3, 0, -600),
      tuple(at(26, 20), 2, 1),
    ],
    'Lang::Verbs': [tuple(at(28, 10), 3, 1, 1, 30)],
    Other: [tuple(at(27, 23), 9, 3)],
  },
  findCards: () => [],
});

describe('scopes', () => {
  it('collection_stats returns compact structured JSON', async () => {
    const fake = baseFake();
    fake.findCards = (q) => {
      if (q.includes('is:new')) return [11, 12];
      if (q.includes('prop:ivl>=21')) return [3];
      if (q.includes('prop:ivl<21')) return [1, 2];
      if (q.includes('prop:due<=0')) return [2];
      if (q.includes('prop:due=1')) return [1, 3];
      return [];
    };
    const { client } = fakeClient(fake);
    const text = await collectionStats(client, { deckName: 'Lang', days: 3, now: NOW });
    expect(text).not.toContain('\n');
    const out = JSON.parse(text);
    expect(out.scope).toContain('Lang');
    expect(out.dayStartsAt).toBe('04:00');
    expect(out.studiedToday).toEqual({
      cards: 2,
      reviews: 3,
      minutes: 1,
      again: 2,
      correctPct: 33.3,
    });
    expect(out.cardCounts).toMatchObject({ new: 2, young: 2, mature: 1, total: 5 });
    expect(out.correctByCardType.windowDays).toBe(30);
    expect(out.correctByCardType.mature).toEqual({ reviews: 1, again: 1, correctPct: 0 });
    expect(out.forecastDue).toMatchObject({ '2026-11-28': 1, '2026-11-29': 2, '2026-11-30': 0 });
    expect(out.intervals).toEqual({ averageDays: 10, longestDays: 10 });
  });

  it('reviews_by_day for a deck includes subdecks and zero days', async () => {
    const { client } = fakeClient(baseFake());
    const text = await reviewsByDay(client, { deckName: 'Lang', days: 4, now: NOW });
    expect(text.split('\n').slice(1)).toEqual([
      '2026-11-28: 3',
      '2026-11-27: 0',
      '2026-11-26: 1',
      '2026-11-25: 0',
      'total: 4 reviews over 4 days (2 with reviews)',
    ]);
  });

  it('reviews_by_day for the collection uses Anki’s daily counts and since', async () => {
    const fake = baseFake();
    fake.byDay = [
      ['2026-11-28', 3],
      ['2026-11-27', 1],
      ['2025-01-01', 99],
    ];
    const { client } = fakeClient(fake);
    const text = await reviewsByDay(client, { since: '2026-11-26', now: NOW });
    expect(text).toContain('whole collection, 2026-11-26 to 2026-11-28');
    expect(text).toContain('2026-11-26: 0');
    expect(text).not.toContain('2025-01-01');
    expect(text).toContain('total: 4 reviews over 3 days');
  });

  it('rejects malformed since and unknown decks', async () => {
    const { client, calls } = fakeClient(baseFake());
    await expect(reviewsByDay(client, { since: '28/11/2026', now: NOW })).rejects.toThrow(
      /since must be a date/
    );
    await expect(reviewsByDay(client, { deckName: 'lang', now: NOW })).rejects.toThrow(
      /Did you mean: "Lang"/
    );
    // cardReviews would create the unknown deck, so it must not be called.
    expect(calls).not.toContain('cardReviews');
  });

  it('deck_overview answers "how am I doing" in one call', async () => {
    const fake = baseFake();
    fake.config = { name: 'Lang preset', new: { perDay: 10 }, rev: { perDay: 100 } };
    fake.findCards = (q) => {
      if (q.endsWith('is:new -is:suspended')) return Array.from({ length: 25 }, (_, i) => 100 + i);
      if (q.endsWith('is:new')) return Array.from({ length: 26 }, (_, i) => 100 + i);
      if (q.endsWith('is:review -is:learn -is:suspended')) return [1, 2, 3];
      if (q.endsWith('"deck:Lang" is:suspended')) return [126];
      if (q.endsWith('introduced:1')) return [1, 2, 3, 4];
      return [];
    };
    fake.notes = [
      { noteId: 1, tags: ['verbs'], cards: [1, 3] },
      { noteId: 2, tags: ['nouns'], cards: [2] },
    ];
    const { client, multi } = fakeClient(fake);
    const out = JSON.parse(await deckOverview(client, { deckName: 'Lang', now: NOW }));
    expect(out.counts).toEqual({
      new: 25,
      learning: 0,
      review: 3,
      suspended: 1,
      total: 29,
      seen: 3,
      unseen: 26,
      dueNow: 0,
    });
    expect(out.limits).toEqual({ preset: 'Lang preset', newPerDay: 10, reviewsPerDay: 100 });
    // 6 left today, then 19 at 10/day -> 2 more days.
    expect(out.unseenRunOut).toMatchObject({ date: '2026-11-30', daysFromToday: 2 });
    expect(out.lastDays).toMatchObject({ days: 30, reviews: 4, again: 3, retentionPct: 0 });
    expect(out.topTagsByAgain).toEqual([
      { tag: 'verbs', cards: 2, again: 2 },
      { tag: 'nouns', cards: 1, again: 1 },
    ]);
    expect(multi).toHaveBeenCalledTimes(4);
  });

  it('trouble_cards lists worst cards and respects limit', async () => {
    const fake = baseFake();
    fake.notes = [{ noteId: 1, tags: ['verbs'], cards: [1, 3] }];
    fake.cards = [
      { cardId: 1, question: '<style>x</style><b>ser</b> vs estar', lapses: 0, deckName: 'Lang' },
      { cardId: 3, question: 'tener', lapses: 4, deckName: 'Lang::Verbs' },
    ];
    const { client } = fakeClient(fake);
    const out = JSON.parse(
      await troubleCards(client, { deckName: 'Lang', days: 2, limit: 1, now: NOW })
    );
    // Card 2's Again was 2026-11-26, outside a 2-day window.
    expect(out).toMatchObject({
      from: '2026-11-27',
      to: '2026-11-28',
      cardsWithAgain: 2,
      againTotal: 2,
    });
    expect(out.worst).toHaveLength(1);
    expect(out.worst[0]).toMatchObject({
      cardId: 3,
      front: 'tener',
      again: 1,
      lapsesInWindow: 1,
      lapses: 4,
    });
    expect(out.worst[0].deck).toBe('Lang::Verbs');
    expect(out.more).toContain('rated:2:1');
    expect(out.byTag).toEqual([{ tag: 'verbs', cards: 2, again: 2 }]);
  });

  it('card_reviews summarizes instead of overflowing', async () => {
    const fake = baseFake();
    fake.reviewsByDeck.Lang = Array.from({ length: 50 }, (_, i) =>
      tuple(at(28, 5) + i * 1000, i, 3)
    );
    const { client } = fakeClient(fake);
    const small = await cardReviews(client, { deckName: 'Lang', startTimestamp: 0, limit: 100 });
    expect(small.split('\n')).toHaveLength(52);
    const summary = JSON.parse(
      await cardReviews(client, { deckName: 'Lang', startTimestamp: 0, limit: 10 })
    );
    expect(summary).toMatchObject({ reviews: 50, cards: 50, byEase: { good: 50 } });
    expect(summary.howToNarrow).toMatch(/startTimestamp/);
  });
});

// ---------------------------------------------------------------------------
// Through the MCP tool, with the shared client mocked.
// ---------------------------------------------------------------------------

const mocks = vi.hoisted(() => ({
  multi: vi.fn(),
  deckNames: vi.fn(),
  getDeckStats: vi.fn(),
}));
vi.mock('../src/utils/ankiClient.js', () => ({
  ANKI_CONNECT_URL: 'http://127.0.0.1:8765',
  ankiClient: {
    miscellaneous: { multi: mocks.multi, version: vi.fn() },
    deck: { deckNames: mocks.deckNames, getDeckStats: mocks.getDeckStats },
  },
}));

describe('get_analytics tool', () => {
  beforeEach(() => vi.resetAllMocks());

  it('routes new scopes and requires deckName for deck_overview', async () => {
    const { registerConsolidatedTools } = await import('../src/tools/consolidated.js');
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerConsolidatedTools(server);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);

    const { multi } = fakeClient(baseFake());
    mocks.multi.mockImplementation(multi);
    const result = await client.callTool({
      name: 'get_analytics',
      arguments: { scope: 'reviews_by_day', deckName: 'Lang', days: 2 },
    });
    const text = (result.content as Array<{ text: string }>)[0]!.text;
    expect(text).toMatch(/total: \d+ reviews over 2 days/);

    const missing = await client.callTool({
      name: 'get_analytics',
      arguments: { scope: 'deck_overview' },
    });
    expect(missing.isError).toBe(true);
    expect((missing.content as Array<{ text: string }>)[0]!.text).toMatch(/requires deckName/);
  });

  it('rejects unknown deck names before any deck-specific call', async () => {
    const { registerConsolidatedTools } = await import('../src/tools/consolidated.js');
    const server = new McpServer({ name: 'test', version: '0.0.0' });
    registerConsolidatedTools(server);
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [ct, st] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(st), client.connect(ct)]);

    const { multi, calls } = fakeClient(baseFake());
    mocks.multi.mockImplementation(multi);
    mocks.deckNames.mockResolvedValue(baseFake().decks);
    const scopes = [
      { scope: 'deck_stats' },
      { scope: 'deck_overview' },
      { scope: 'collection_stats' },
      { scope: 'reviews_by_day' },
      { scope: 'trouble_cards' },
      { scope: 'card_reviews', startTimestamp: 0 },
    ];
    for (const args of scopes) {
      const result = await client.callTool({
        name: 'get_analytics',
        arguments: { ...args, deckName: 'lang' },
      });
      expect(result.isError, args.scope).toBe(true);
      expect((result.content as Array<{ text: string }>)[0]!.text).toMatch(
        /Deck "lang" not found\. Did you mean: "Lang"/
      );
    }
    expect(mocks.getDeckStats).not.toHaveBeenCalled();
    expect(calls).not.toContain('getDeckConfig');
    expect(calls).not.toContain('cardReviews');
    expect(calls).not.toContain('getDeckStats');
  });
});
