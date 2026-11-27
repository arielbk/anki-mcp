import { InputError } from './errors.js';
import type { YankiConnect } from 'yanki-connect';

type DeckConfig = Awaited<ReturnType<YankiConnect['deck']['getDeckConfig']>>;

/** The subset of YankiConnect used for per-deck limits, so tests can stub it. */
export interface DeckLimitsClient {
  deck: {
    getDeckConfig: (params: { deck: string }) => Promise<DeckConfig>;
    cloneDeckConfigId: (params: { cloneFrom: number; name: string }) => Promise<number | false>;
    setDeckConfigId: (params: { configId: number; decks: string[] }) => Promise<boolean>;
    saveDeckConfig: (params: { config: DeckConfig }) => Promise<boolean>;
    deckNames: () => Promise<string[]>;
  };
  miscellaneous: {
    multi: (params: {
      actions: Array<{ action: 'getDeckConfig'; params: { deck: string } }>;
    }) => Promise<unknown[]>;
  };
}

export interface DeckLimits {
  newPerDay?: number | undefined;
  reviewsPerDay?: number | undefined;
}

export interface DeckLimitsResult {
  configId: number;
  configName: string;
  /** True when a new preset was cloned for this deck. */
  cloned: boolean;
  previousConfigName: string;
  newPerDay: number;
  reviewsPerDay: number;
}

/** Name of the preset this server creates for a single deck. */
export function ownPresetName(deckName: string): string {
  return deckName;
}

function configIdOf(item: unknown): number | undefined {
  // multi returns { result, error } per action.
  const value =
    item !== null && typeof item === 'object' && 'result' in item
      ? (item as { result: unknown }).result
      : item;
  if (value !== null && typeof value === 'object' && 'id' in value) {
    const { id } = value as { id: unknown };
    return typeof id === 'number' ? id : undefined;
  }
  return undefined;
}

/** Number of decks whose options preset is `configId` (one multi request). */
export async function countDecksUsingConfig(
  client: DeckLimitsClient,
  configId: number
): Promise<number> {
  const decks = await client.deck.deckNames();
  if (decks.length === 0) return 0;
  const results = await client.miscellaneous.multi({
    actions: decks.map((deck) => ({ action: 'getDeckConfig' as const, params: { deck } })),
  });
  return results.filter((item) => configIdOf(item) === configId).length;
}

/**
 * Sets daily limits for one deck without touching presets shared with other
 * decks: if any other deck uses the same preset (or it is the built-in
 * Default preset), the preset is cloned, the clone is assigned to the deck,
 * and only the clone is changed.
 */
export async function setDeckLimits(
  client: DeckLimitsClient,
  deckName: string,
  limits: DeckLimits
): Promise<DeckLimitsResult> {
  if (limits.newPerDay === undefined && limits.reviewsPerDay === undefined) {
    throw new InputError('set at least one of newPerDay or reviewsPerDay');
  }
  // AnkiConnect returns `false` for an unknown deck, despite the typings.
  const current = (await client.deck.getDeckConfig({ deck: deckName })) as DeckConfig | false;
  if (current === false) {
    throw new InputError(`deck "${deckName}" was not found`);
  }

  let config = current;
  let cloned = false;
  const ownName = ownPresetName(deckName);
  // Preset 1 is Anki's built-in Default and is always treated as shared.
  const shared = current.id === 1 || (await countDecksUsingConfig(client, current.id)) > 1;
  if (shared) {
    const newId = await client.deck.cloneDeckConfigId({ cloneFrom: current.id, name: ownName });
    if (newId === false) throw new Error(`couldn't clone preset "${current.name}"`);
    await client.deck.setDeckConfigId({ configId: newId, decks: [deckName] });
    config = await client.deck.getDeckConfig({ deck: deckName });
    if (config.id !== newId) {
      throw new Error(`cloned preset ${newId} but deck "${deckName}" still uses ${config.id}`);
    }
    cloned = true;
  }

  const updated: DeckConfig = {
    ...config,
    new: { ...config.new, perDay: limits.newPerDay ?? config.new.perDay },
    rev: { ...config.rev, perDay: limits.reviewsPerDay ?? config.rev.perDay },
  };
  const saved = await client.deck.saveDeckConfig({ config: updated });
  if (!saved) throw new Error(`AnkiConnect didn't save preset ${updated.id}`);

  return {
    configId: updated.id,
    configName: updated.name,
    cloned,
    previousConfigName: current.name,
    newPerDay: updated.new.perDay,
    reviewsPerDay: updated.rev.perDay,
  };
}

export function formatDeckLimits(deckName: string, r: DeckLimitsResult): string {
  const how = r.cloned
    ? `cloned from shared preset "${r.previousConfigName}" into new preset "${r.configName}" (ID: ${r.configId}), used only by this deck`
    : `updated preset "${r.configName}" (ID: ${r.configId}), which no other deck uses`;
  return `✓ Limits for "${deckName}": ${r.newPerDay} new/day, ${r.reviewsPerDay} reviews/day (${how}). Other decks are unchanged.`;
}
