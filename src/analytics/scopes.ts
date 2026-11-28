import { InputError } from '../utils/errors.js';
import {
  addDays,
  againByTag,
  correctByCardType,
  countByDay,
  dayKey,
  dayRange,
  daysBetween,
  formatDayCounts,
  fromTuple,
  intervalStats,
  projectRunOut,
  retention,
  stripHtml,
  studiedToday,
  summarizeAnswers,
  troubleByCard,
  type Review,
  type ReviewTuple,
} from './aggregate.js';
import {
  assertDeckExists,
  decksInScope,
  deckTerm,
  fetchRevlog,
  filteredDeckReviews,
  runMulti,
  scoped,
  type AnalyticsClient,
} from './anki.js';

/** Window used for correct % by card type in collection_stats. */
export const CARD_TYPE_WINDOW_DAYS = 30;
/** card_reviews lists at most this many rows before switching to a summary. */
export const CARD_REVIEWS_MAX_ROWS = 300;
/** Card IDs per getIntervals action. */
export const INTERVALS_CHUNK = 1000;

/**
 * Learning and relearning cards, buried ones included: `is:learn` only matches
 * the learning queues, so buried learning cards (type learning, queue buried)
 * are added by type. Pair with `is:review -is:learn` for review cards so every
 * unsuspended seen card is counted exactly once.
 */
export const LEARNING_SEARCH = '(is:learn OR (-is:new -is:review))';

const json = (value: unknown) => JSON.stringify(value);
const hourLabel = (hour: number, inferred: boolean) =>
  `${String(hour).padStart(2, '0')}:00${inferred ? '' : ' (assumed Anki default; could not infer)'}`;
const scopeLabel = (deckName: string | undefined) =>
  deckName ? `deck "${deckName}" (incl. subdecks)` : 'whole collection';

interface Common {
  now?: number;
}

/** Filters reviews to the last `days` Anki days. */
function inWindow(reviews: Review[], today: string, days: number, rolloverHour: number): Review[] {
  const first = addDays(today, -(days - 1));
  return reviews.filter((r) => {
    const key = dayKey(r.id, rolloverHour);
    return key >= first && key <= today;
  });
}

/** Treats a non-array AnkiConnect result (null, false) as empty. */
const list = <T>(value: unknown): T[] => (Array.isArray(value) ? (value as T[]) : []);
const ids = (value: unknown) => list<number>(value);

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// collection_stats
// ---------------------------------------------------------------------------

export async function collectionStats(
  client: AnalyticsClient,
  params: Common & { deckName?: string | undefined; days?: number | undefined }
): Promise<string> {
  const { deckName } = params;
  const now = params.now ?? Date.now();
  const days = params.days ?? 14;
  const q = (query: string) => ({
    action: 'findCards',
    params: { query: scoped(deckName, query) },
  });

  const countQueries = {
    new: 'is:new -is:suspended',
    learning: `${LEARNING_SEARCH} -is:suspended`,
    young: `is:review -is:learn -is:suspended prop:ivl<21`,
    mature: `is:review -is:learn -is:suspended prop:ivl>=21`,
    suspended: 'is:suspended',
  };
  const forecastQueries = Array.from({ length: days }, (_, i) =>
    i === 0 ? '-is:suspended prop:due<=0' : `-is:suspended prop:due=${i}`
  );
  const [allDecks, todayCount, ...found] = await runMulti(client, [
    { action: 'deckNames' },
    { action: 'getNumCardsReviewedToday' },
    ...Object.values(countQueries).map(q),
    ...forecastQueries.map(q),
  ]);
  const decks = list<string>(allDecks);
  if (deckName) assertDeckExists(decks, deckName);

  const [newIds, learnIds, youngIds, matureIds, suspendedIds] = found.slice(0, 5).map(ids);
  const forecastCounts = found.slice(5).map((r) => ids(r).length);
  const reviewCardIds = [...(youngIds ?? []), ...(matureIds ?? [])];

  const [revlog, intervalsResult] = await Promise.all([
    fetchRevlog(client, {
      allDecks: decks,
      scopeDecks: decksInScope(decks, deckName),
      deckName,
      days: CARD_TYPE_WINDOW_DAYS,
      todayCount: Number(todayCount) || 0,
      now,
    }),
    runMulti(
      client,
      chunk(reviewCardIds, INTERVALS_CHUNK).map((cards) => ({
        action: 'getIntervals',
        params: { cards, complete: false },
      }))
    ),
  ]);
  const { rolloverHour, rolloverInferred } = revlog;
  const today = dayKey(now, rolloverHour);
  const window = inWindow(revlog.reviews, today, CARD_TYPE_WINDOW_DAYS, rolloverHour);

  const forecast: Record<string, number> = {};
  forecastCounts.forEach((n, i) => {
    forecast[addDays(today, i)] = n;
  });

  const counts = {
    new: newIds?.length ?? 0,
    learning: learnIds?.length ?? 0,
    young: youngIds?.length ?? 0,
    mature: matureIds?.length ?? 0,
    suspended: suspendedIds?.length ?? 0,
  };

  return json({
    scope: scopeLabel(deckName),
    today,
    dayStartsAt: hourLabel(rolloverHour, rolloverInferred),
    studiedToday: studiedToday(window, today, rolloverHour),
    cardCounts: {
      ...counts,
      total: Object.values(counts).reduce((a, b) => a + b, 0),
      note: 'young/mature exclude suspended; mature = interval >= 21 days',
    },
    correctByCardType: {
      windowDays: CARD_TYPE_WINDOW_DAYS,
      ...correctByCardType(window),
    },
    forecastDue: {
      note: 'review cards due per day; the first day includes overdue cards',
      ...forecast,
    },
    intervals: intervalStats(intervalsResult.flatMap(ids)),
  });
}

// ---------------------------------------------------------------------------
// reviews_by_day
// ---------------------------------------------------------------------------

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function reviewsByDay(
  client: AnalyticsClient,
  params: Common & {
    deckName?: string | undefined;
    days?: number | undefined;
    since?: string | undefined;
  }
): Promise<string> {
  const { deckName, since } = params;
  const now = params.now ?? Date.now();
  if (since !== undefined && (!DATE_RE.test(since) || Number.isNaN(Date.parse(since)))) {
    throw new InputError(`since must be a date like 2026-11-01, got "${since}"`);
  }

  const [allDecks, todayCount, byDay] = await runMulti(client, [
    { action: 'deckNames' },
    { action: 'getNumCardsReviewedToday' },
    ...(deckName ? [] : [{ action: 'getNumCardsReviewedByDay' }]),
  ]);
  const decks = list<string>(allDecks);
  if (deckName) assertDeckExists(decks, deckName);

  // First pass with a provisional range just to learn the rollover hour and
  // the deck's revlog; the window is fixed once "today" is known.
  const provisionalDays = since ? daysBetween(since, dayKey(now, 0)) + 2 : (params.days ?? 30);
  if (provisionalDays > 3660) throw new InputError('reviews_by_day covers at most 10 years');
  const revlog = await fetchRevlog(client, {
    allDecks: decks,
    scopeDecks: deckName ? decksInScope(decks, deckName) : [],
    deckName,
    days: Math.max(1, provisionalDays),
    todayCount: Number(todayCount) || 0,
    now,
  });
  const today = dayKey(now, revlog.rolloverHour);
  const days = since ? daysBetween(since, today) + 1 : (params.days ?? 30);
  if (days < 1) throw new InputError(`since (${since}) is after today (${today})`);
  const keys = dayRange(today, days);

  const counts = deckName
    ? countByDay(revlog.reviews, revlog.rolloverHour)
    : new Map(list<[string, number]>(byDay));

  const header = `Reviews per day, ${scopeLabel(deckName)}, ${keys.at(-1)} to ${today} (newest first; day starts ${hourLabel(revlog.rolloverHour, revlog.rolloverInferred)}):`;
  return `${header}\n${formatDayCounts(keys, counts)}`;
}

// ---------------------------------------------------------------------------
// deck_overview
// ---------------------------------------------------------------------------

export async function deckOverview(
  client: AnalyticsClient,
  params: Common & {
    deckName?: string | undefined;
    days?: number | undefined;
    limit?: number | undefined;
  }
): Promise<string> {
  const { deckName } = params;
  if (!deckName) throw new InputError('deck_overview requires deckName');
  const now = params.now ?? Date.now();
  const days = params.days ?? 30;
  const topTags = params.limit ?? 10;
  const q = (query: string) => ({
    action: 'findCards',
    params: { query: scoped(deckName, query) },
  });

  // Validate the name before anything deck-specific: some AnkiConnect
  // actions (getDeckStats, cardReviews) create decks they don't know.
  const [allDecks, todayCount, ...found] = await runMulti(client, [
    { action: 'deckNames' },
    { action: 'getNumCardsReviewedToday' },
    q('is:new -is:suspended'),
    q(`${LEARNING_SEARCH} -is:suspended`),
    q('is:review -is:learn -is:suspended'),
    q('is:suspended'),
    q('is:new'),
    q('introduced:1'),
    q('is:due -is:suspended'),
  ]);
  const decks = list<string>(allDecks);
  assertDeckExists(decks, deckName);
  const [newC, learnC, reviewC, suspendedC, unseenC, introducedC, dueC] = found.map(
    (r) => ids(r).length
  );

  const [revlog, [config]] = await Promise.all([
    fetchRevlog(client, {
      allDecks: decks,
      scopeDecks: decksInScope(decks, deckName),
      deckName,
      days,
      todayCount: Number(todayCount) || 0,
      now,
    }),
    runMulti(client, [{ action: 'getDeckConfig', params: { deck: deckName } }]),
  ]);
  const { rolloverHour, rolloverInferred } = revlog;
  const today = dayKey(now, rolloverHour);
  const window = inWindow(revlog.reviews, today, days, rolloverHour);

  const againByCard = new Map(troubleByCard(window).map((c) => [c.cardId, c.again]));
  let tags: ReturnType<typeof againByTag> = [];
  if (againByCard.size > 0) {
    const [notes] = await runMulti(client, [
      { action: 'notesInfo', params: { query: `cid:${[...againByCard.keys()].join(',')}` } },
    ]);
    tags = againByTag(againByCard, list<{ tags: string[]; cards: number[] }>(notes));
  }

  const cfg = (config ?? {}) as {
    name?: string;
    new?: { perDay?: number };
    rev?: { perDay?: number };
  };
  const newPerDay = cfg.new?.perDay;
  const unseen = unseenC ?? 0;
  const unseenActive = newC ?? 0;
  const runOut =
    newPerDay === undefined
      ? null
      : projectRunOut({
          unseen: unseenActive,
          perDay: newPerDay,
          introducedToday: introducedC ?? 0,
          today,
        });
  const total = (newC ?? 0) + (learnC ?? 0) + (reviewC ?? 0) + (suspendedC ?? 0);
  const answers = summarizeAnswers(window);

  return json({
    deck: deckName,
    today,
    dayStartsAt: hourLabel(rolloverHour, rolloverInferred),
    counts: {
      new: newC,
      learning: learnC,
      review: reviewC,
      suspended: suspendedC,
      total,
      seen: total - unseen,
      unseen,
      dueNow: dueC,
    },
    limits: {
      preset: cfg.name ?? null,
      newPerDay: newPerDay ?? null,
      reviewsPerDay: cfg.rev?.perDay ?? null,
    },
    introducedToday: introducedC,
    unseenRunOut: runOut
      ? {
          ...runOut,
          note: `last of ${unseenActive} unsuspended new cards introduced at ${newPerDay}/day (preset limit; ignores parent-deck caps)`,
        }
      : null,
    lastDays: {
      days,
      from: addDays(today, -(days - 1)),
      reviews: answers.reviews,
      again: answers.again,
      correctPct: answers.correctPct,
      retentionPct: retention(window).correctPct,
      note: 'retentionPct = review cards (not learning steps) answered Hard/Good/Easy',
    },
    topTagsByAgain: tags.slice(0, topTags),
  });
}

// ---------------------------------------------------------------------------
// trouble_cards
// ---------------------------------------------------------------------------

interface CardInfoLite {
  cardId: number;
  question?: string;
  lapses?: number;
  deckName?: string;
}

export async function troubleCards(
  client: AnalyticsClient,
  params: Common & {
    deckName?: string | undefined;
    days?: number | undefined;
    limit?: number | undefined;
  }
): Promise<string> {
  const { deckName } = params;
  const now = params.now ?? Date.now();
  const days = params.days ?? 7;
  const limit = params.limit ?? 10;

  const [allDecks, todayCount] = await runMulti(client, [
    { action: 'deckNames' },
    { action: 'getNumCardsReviewedToday' },
  ]);
  const decks = list<string>(allDecks);
  if (deckName) assertDeckExists(decks, deckName);

  const revlog = await fetchRevlog(client, {
    allDecks: decks,
    scopeDecks: decksInScope(decks, deckName),
    deckName,
    days,
    todayCount: Number(todayCount) || 0,
    now,
  });
  const today = dayKey(now, revlog.rolloverHour);
  const from = addDays(today, -(days - 1));
  const window = inWindow(revlog.reviews, today, days, revlog.rolloverHour);
  const trouble = troubleByCard(window);
  const findQuery = `${deckName ? `${deckTerm(deckName)} ` : ''}rated:${days}:1`;

  const base = {
    scope: scopeLabel(deckName),
    days,
    from,
    to: today,
    cardsWithAgain: trouble.length,
    againTotal: trouble.reduce((sum, c) => sum + c.again, 0),
  };
  if (trouble.length === 0) return json({ ...base, byTag: [], worst: [] });

  const worst = trouble.slice(0, limit);
  const [notes, infos] = await runMulti(client, [
    { action: 'notesInfo', params: { query: `cid:${trouble.map((c) => c.cardId).join(',')}` } },
    { action: 'cardsInfo', params: { cards: worst.map((c) => c.cardId) } },
  ]);
  const infoById = new Map(list<CardInfoLite>(infos).map((c) => [c.cardId, c]));
  const byTag = againByTag(
    new Map(trouble.map((c) => [c.cardId, c.again])),
    list<{ tags: string[]; cards: number[] }>(notes)
  );

  return json({
    ...base,
    byTag: byTag.slice(0, 20),
    worst: worst.map((c) => {
      const info = infoById.get(c.cardId);
      return {
        cardId: c.cardId,
        front: stripHtml(info?.question ?? ''),
        again: c.again,
        lapsesInWindow: c.lapsesInWindow,
        lapses: info?.lapses ?? null,
        ...(deckName && info?.deckName !== deckName ? { deck: info?.deckName } : {}),
      };
    }),
    more:
      trouble.length > worst.length
        ? `${trouble.length - worst.length} more; raise limit or use manage_flashcards find with query '${findQuery}'`
        : undefined,
  });
}

// ---------------------------------------------------------------------------
// card_reviews
// ---------------------------------------------------------------------------

const EASE_NAMES = ['manual', 'again', 'hard', 'good', 'easy'] as const;

export async function cardReviews(
  client: AnalyticsClient,
  params: Common & {
    deckName?: string | undefined;
    startTimestamp?: number | undefined;
    limit?: number | undefined;
  }
): Promise<string> {
  const { deckName, startTimestamp } = params;
  if (!deckName || startTimestamp === undefined) {
    throw new InputError('card_reviews requires deckName and startTimestamp');
  }
  const maxRows = params.limit ?? CARD_REVIEWS_MAX_ROWS;
  const [allDecks] = await runMulti(client, [{ action: 'deckNames' }]);
  const decks = list<string>(allDecks);
  // cardReviews silently creates unknown decks, so check first.
  assertDeckExists(decks, deckName);
  // cardReviews reads one deck (no subdecks), so read each deck in scope, plus
  // the deck's cards that sit in filtered decks right now.
  const scopeDecks = decksInScope(decks, deckName);
  const [perDeck, extra] = await Promise.all([
    runMulti(
      client,
      scopeDecks.map((deck) => ({
        action: 'cardReviews',
        params: { deck, startID: startTimestamp },
      }))
    ),
    filteredDeckReviews(client, { deckName, fetched: scopeDecks, startID: startTimestamp }),
  ]);
  const reviews = [...perDeck.flatMap((r) => list<ReviewTuple>(r)), ...extra]
    .map(fromTuple)
    .sort((a, b) => a.id - b.id);
  const label = `"${deckName}" (incl. subdecks) after ${new Date(startTimestamp).toISOString()}`;

  if (reviews.length === 0) return `No reviews for ${label}.`;

  if (reviews.length > maxRows) {
    const byEase: Record<string, number> = {};
    for (const r of reviews) {
      const name = EASE_NAMES[r.ease] ?? `ease${r.ease}`;
      byEase[name] = (byEase[name] ?? 0) + 1;
    }
    return json({
      summary: `${reviews.length} reviews for ${label}; too many to list (limit ${maxRows})`,
      reviews: reviews.length,
      cards: new Set(reviews.map((r) => r.cardId)).size,
      first: new Date(reviews[0]?.id ?? 0).toISOString(),
      last: new Date(reviews.at(-1)?.id ?? 0).toISOString(),
      byEase,
      minutes: Math.round(reviews.reduce((s, r) => s + r.time, 0) / 6000) / 10,
      howToNarrow:
        'Pass a later startTimestamp (e.g. Date.now() - 86400000 for the last day), raise limit, or use reviews_by_day / trouble_cards / deck_overview for aggregates.',
    });
  }

  const rows = reviews.map(
    (r) =>
      `${new Date(r.id).toISOString().slice(0, 16)} ${r.cardId} ${r.ease} ${r.ivl} ${r.lastIvl} ${r.time} ${r.type}`
  );
  return [
    `${reviews.length} reviews for ${label}.`,
    'cols: time(UTC) cardId ease(1=again..4=easy) ivl lastIvl(days; negative=seconds) ms type(0=learn 1=review 2=relearn 3=filtered 4=manual)',
    ...rows,
  ].join('\n');
}
