import { describe, expect, it, vi } from 'vitest';
import { setDeckLimits, type DeckLimitsClient } from '../src/utils/deckLimits.js';

type Config = Awaited<ReturnType<DeckLimitsClient['deck']['getDeckConfig']>>;

function makeConfig(id: number, name: string): Config {
  return {
    id,
    name,
    new: { perDay: 20 },
    rev: { perDay: 200 },
  } as unknown as Config;
}

/** In-memory presets; never talks to a real Anki. */
function mockClient(initial: { deck: string; config: Config; sharedWith?: string[] }) {
  const configs = new Map<number, Config>([[initial.config.id, initial.config]]);
  const deckToConfig = new Map<string, number>([[initial.deck, initial.config.id]]);
  for (const other of initial.sharedWith ?? []) deckToConfig.set(other, initial.config.id);
  const configFor = (deck: string) => {
    const id = deckToConfig.get(deck);
    return id === undefined ? false : configs.get(id);
  };
  let nextId = 100;
  const client = {
    deck: {
      getDeckConfig: vi.fn(async ({ deck }: { deck: string }) => configFor(deck) as Config),
      deckNames: vi.fn(async () => [...deckToConfig.keys()]),
      cloneDeckConfigId: vi.fn(async ({ cloneFrom, name }: { cloneFrom: number; name: string }) => {
        const source = configs.get(cloneFrom);
        if (!source) return false as const;
        const id = nextId++;
        configs.set(id, { ...structuredClone(source), id, name });
        return id;
      }),
      setDeckConfigId: vi.fn(async ({ configId, decks }: { configId: number; decks: string[] }) => {
        decks.forEach((d) => deckToConfig.set(d, configId));
        return true;
      }),
      saveDeckConfig: vi.fn(async ({ config }: { config: Config }) => {
        configs.set(config.id, config);
        return true;
      }),
    },
    miscellaneous: {
      multi: vi.fn(async ({ actions }: { actions: Array<{ params: { deck: string } }> }) =>
        actions.map((a) => ({ result: configFor(a.params.deck), error: null }))
      ),
    },
  } satisfies DeckLimitsClient;
  return { client, configs };
}

describe('setDeckLimits', () => {
  it('clones a shared preset instead of changing it', async () => {
    const { client, configs } = mockClient({
      deck: 'Interview prep',
      config: makeConfig(1, 'Default'),
    });
    const result = await setDeckLimits(client, 'Interview prep', { newPerDay: 15 });

    expect(client.deck.cloneDeckConfigId).toHaveBeenCalledWith({
      cloneFrom: 1,
      name: 'Interview prep',
    });
    expect(client.deck.setDeckConfigId).toHaveBeenCalledWith({
      configId: 100,
      decks: ['Interview prep'],
    });
    expect(result).toMatchObject({
      cloned: true,
      configId: 100,
      newPerDay: 15,
      reviewsPerDay: 200,
    });
    // The shared Default preset is untouched.
    expect(configs.get(1)?.new.perDay).toBe(20);
    expect(configs.get(100)?.new.perDay).toBe(15);
  });

  it('clones a preset named after the deck when another deck also uses it', async () => {
    const { client, configs } = mockClient({
      deck: 'Japanese',
      config: makeConfig(5, 'Japanese'),
      sharedWith: ['Japanese::Kanji'],
    });
    const result = await setDeckLimits(client, 'Japanese', { newPerDay: 5 });
    expect(result.cloned).toBe(true);
    expect(configs.get(5)?.new.perDay).toBe(20); // Kanji's preset untouched
    expect(client.deck.saveDeckConfig).toHaveBeenCalledWith({
      config: expect.objectContaining({ id: 100 }),
    });
  });

  it('updates a preset in place when only this deck uses it, whatever its name', async () => {
    const { client } = mockClient({ deck: 'Spanish', config: makeConfig(8, 'My preset') });
    const result = await setDeckLimits(client, 'Spanish', { newPerDay: 3 });
    expect(client.deck.cloneDeckConfigId).not.toHaveBeenCalled();
    expect(result).toMatchObject({ cloned: false, configId: 8, newPerDay: 3 });
  });

  it("updates the deck's own preset in place", async () => {
    const { client } = mockClient({ deck: 'Spanish', config: makeConfig(7, 'Spanish') });
    const result = await setDeckLimits(client, 'Spanish', { reviewsPerDay: 50 });
    expect(client.deck.cloneDeckConfigId).not.toHaveBeenCalled();
    expect(result).toMatchObject({ cloned: false, configId: 7, newPerDay: 20, reviewsPerDay: 50 });
  });

  it('rejects missing limits and unknown decks', async () => {
    const { client } = mockClient({ deck: 'A', config: makeConfig(1, 'Default') });
    await expect(setDeckLimits(client, 'A', {})).rejects.toThrow(/at least one/);
    await expect(setDeckLimits(client, 'Missing', { newPerDay: 1 })).rejects.toThrow(/not found/);
  });
});
