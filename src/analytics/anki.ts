import { InputError } from '../utils/errors.js';
import { fromTuple, inferRolloverHour, type Review, type ReviewTuple } from './aggregate.js';

/**
 * The only AnkiConnect entry point the analytics scopes use: `multi`, so each
 * scope needs just two or three round trips and tests stub one function.
 * Declared with method syntax so the real YankiConnect client is assignable.
 */
export interface AnalyticsClient {
  miscellaneous: {
    multi(params: { actions: Array<{ action: string; params?: unknown }> }): Promise<unknown[]>;
  };
}

export interface Action {
  action: string;
  params?: unknown;
}

/**
 * Runs actions in one `multi` request. AnkiConnect returns successful results
 * raw and failures as `{ result: null, error }`; any failure throws.
 */
export async function runMulti(client: AnalyticsClient, actions: Action[]): Promise<unknown[]> {
  if (actions.length === 0) return [];
  const results = await client.miscellaneous.multi({ actions });
  return results.map((item, i) => {
    if (item !== null && typeof item === 'object' && 'error' in item && 'result' in item) {
      const { error, result } = item as { error: unknown; result: unknown };
      if (error) throw new Error(`${actions[i]?.action}: ${String(error)}`);
      return result;
    }
    return item;
  });
}

/** Search term matching a deck and its subdecks. */
export function deckTerm(deckName: string): string {
  return `"deck:${deckName.replace(/[\\"*_]/g, (c) => `\\${c}`)}"`;
}

/** Prefixes a search with the deck filter, or matches every card when no deck is given. */
export function scoped(deckName: string | undefined, query: string): string {
  return `${deckName ? deckTerm(deckName) : 'deck:*'} ${query}`.trim();
}

/** The deck plus its subdecks, from the full deck list. */
export function decksInScope(allDecks: string[], deckName: string | undefined): string[] {
  if (!deckName) return allDecks;
  return allDecks.filter((d) => d === deckName || d.startsWith(`${deckName}::`));
}

/**
 * Throws an actionable error for an unknown deck. Also protects against
 * AnkiConnect's cardReviews, which creates a deck it doesn't know.
 */
export function assertDeckExists(allDecks: string[], deckName: string): void {
  if (allDecks.includes(deckName)) return;
  const lower = deckName.toLowerCase();
  const similar = allDecks.filter((d) => d.toLowerCase().includes(lower)).slice(0, 5);
  throw new InputError(
    `Deck "${deckName}" not found.${similar.length ? ` Did you mean: ${similar.map((d) => `"${d}"`).join(', ')}?` : ' Use manage_decks list for exact names.'}`
  );
}

const DAY_MS = 86_400_000;

export interface RevlogWindow {
  /** Reviews in the scope decks since roughly `days + 1` days ago. */
  reviews: Review[];
  rolloverHour: number;
  rolloverInferred: boolean;
}

/**
 * Fetches revlog entries for the scope decks covering the last `days` Anki
 * days (over-fetching one extra day; callers filter by day key), plus the
 * collection's last two days to infer the rollover hour. One multi request.
 */
export async function fetchRevlog(
  client: AnalyticsClient,
  params: {
    allDecks: string[];
    scopeDecks: string[];
    days: number;
    todayCount: number;
    now: number;
  }
): Promise<RevlogWindow> {
  const { allDecks, scopeDecks, days, todayCount, now } = params;
  const windowStart = now - (days + 1) * DAY_MS;
  const recentStart = now - 2 * DAY_MS;
  const inScope = new Set(scopeDecks);
  const others = allDecks.filter((d) => !inScope.has(d));
  const actions: Action[] = [
    ...scopeDecks.map((deck) => ({
      action: 'cardReviews',
      params: { deck, startID: windowStart },
    })),
    ...others.map((deck) => ({ action: 'cardReviews', params: { deck, startID: recentStart } })),
  ];
  const results = (await runMulti(client, actions)) as ReviewTuple[][];
  const reviews = results
    .slice(0, scopeDecks.length)
    .flat()
    .map(fromTuple)
    .sort((a, b) => a.id - b.id);
  const recentIds = results
    .flat()
    .map((t) => t[0])
    .filter((id) => id >= recentStart);
  const { hour, inferred } = inferRolloverHour(recentIds, todayCount, now);
  return { reviews, rolloverHour: hour, rolloverInferred: inferred };
}
