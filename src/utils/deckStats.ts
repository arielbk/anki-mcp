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
    deckNamesAndIds: () => Promise<Record<string, number>>;
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
 * filtered out first and reported instead. Results are keyed by deck ID and
 * carry only the leaf name (Spanish::Verbs and French::Verbs are both
 * "Verbs"), so they are matched by ID.
 */
export async function getDeckStatsText(
  client: DeckStatsClient,
  deckName?: string,
  deckNames?: string[]
): Promise<string> {
  const names = resolveDeckNames(deckName, deckNames);
  const idsByName = await client.deck.deckNamesAndIds();
  const known = names.filter((n) => idsByName[n] !== undefined);
  const missing = names.filter((n) => idsByName[n] === undefined);
  const stats = known.length > 0 ? await client.deck.getDeckStats({ decks: known }) : {};
  const lines = ['deck: cards total | due today: new, learning, review'];
  for (const name of known) {
    const id = idsByName[name];
    const s = stats[String(id)] ?? Object.values(stats).find((x) => x.deck_id === id);
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
