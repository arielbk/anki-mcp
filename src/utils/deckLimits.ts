import type { YankiConnect } from 'yanki-connect';

type DeckConfig = Awaited<ReturnType<YankiConnect['deck']['getDeckConfig']>>;

/** The subset of YankiConnect used for per-deck limits, so tests can stub it. */
export interface DeckLimitsClient {
  deck: {
    getDeckConfig: (params: { deck: string }) => Promise<DeckConfig>;
    cloneDeckConfigId: (params: { cloneFrom: number; name: string }) => Promise<number | false>;
    setDeckConfigId: (params: { configId: number; decks: string[] }) => Promise<boolean>;
    saveDeckConfig: (params: { config: DeckConfig }) => Promise<boolean>;
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

/**
 * Sets daily limits for one deck without touching presets shared with other
 * decks: unless the deck already uses its own preset (named after the deck),
 * the current preset is cloned, the clone is assigned to the deck, and only
 * the clone is changed.
 */
export async function setDeckLimits(
  client: DeckLimitsClient,
  deckName: string,
  limits: DeckLimits
): Promise<DeckLimitsResult> {
  if (limits.newPerDay === undefined && limits.reviewsPerDay === undefined) {
    throw new Error('set at least one of newPerDay or reviewsPerDay');
  }
  // AnkiConnect returns `false` for an unknown deck, despite the typings.
  const current = (await client.deck.getDeckConfig({ deck: deckName })) as DeckConfig | false;
  if (current === false) {
    throw new Error(`deck "${deckName}" was not found`);
  }

  let config = current;
  let cloned = false;
  const ownName = ownPresetName(deckName);
  // Preset 1 is Anki's built-in Default and is always treated as shared.
  if (current.name !== ownName || current.id === 1) {
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
    : `updated the deck's own preset "${r.configName}" (ID: ${r.configId})`;
  return `✓ Limits for "${deckName}": ${r.newPerDay} new/day, ${r.reviewsPerDay} reviews/day (${how}). Other decks are unchanged.`;
}
