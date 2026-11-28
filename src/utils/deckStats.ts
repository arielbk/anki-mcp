import { InputError } from './errors.js';

interface DeckStats {
  deck_id: number;
  name: string;
  new_count: number;
  learn_count: number;
  review_count: number;
  total_in_deck: number;
}

/** The subset of YankiConnect used by get_stats, so tests can stub it. */
export interface DeckStatsClient {
  deck: {
    getDeckStats: (params: { decks: string[] }) => Promise<Record<string, DeckStats>>;
    deckNames: () => Promise<string[]>;
  };
}

/** Merges get_stats' deckName/deckNames into one list. */
export function resolveDeckNames(deckName?: string, deckNames?: string[]): string[] {
  const names = [...(deckName ? [deckName] : []), ...(deckNames ?? [])];
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (unique.length === 0) {
    throw new InputError(
      'get_stats requires deckName (one deck, e.g. "Spanish") or deckNames (array, e.g. ["Spanish", "French"])'
    );
  }
  return unique;
}

/**
 * One line per deck. AnkiConnect's getDeckStats CREATES any deck name it
 * doesn't know (it resolves names with create=true), so unknown names are
 * filtered out first and reported instead. Results are keyed by deck ID.
 */
export async function getDeckStatsText(
  client: DeckStatsClient,
  deckName?: string,
  deckNames?: string[]
): Promise<string> {
  const names = resolveDeckNames(deckName, deckNames);
  const existing = new Set(await client.deck.deckNames());
  const known = names.filter((n) => existing.has(n));
  const missing = names.filter((n) => !existing.has(n));
  const stats = known.length > 0 ? await client.deck.getDeckStats({ decks: known }) : {};
  const byId = Object.values(stats);
  const lines = ['deck: cards total | due today: new, learning, review'];
  for (const name of known) {
    // Results are keyed by deck ID, so match by name (or the leaf name, in case
    // AnkiConnect shortens subdecks); with one deck there is no ambiguity.
    const leaf = name.split('::').pop();
    const s =
      byId.find((x) => x.name === name) ??
      byId.find((x) => x.name === leaf) ??
      (known.length === 1 ? byId[0] : undefined);
    if (!s) {
      missing.push(name);
      continue;
    }
    lines.push(
      `${name}: ${s.total_in_deck} total | new ${s.new_count}, learning ${s.learn_count}, review ${s.review_count}`
    );
  }
  if (missing.length > 0) {
    lines.push(
      `Not found: ${missing.map((m) => JSON.stringify(m)).join(', ')} (check names with manage_decks list)`
    );
  }
  return lines.join('\n');
}
