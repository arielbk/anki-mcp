import {
  QUEUE_LABELS,
  cardState,
  dueIsDayNumber,
  formatCardState,
  isSeen,
  queueLabel,
  type CardState,
  type SchedulingFields,
} from './cardState.js';
import { InputError } from './errors.js';

/**
 * manage_flashcards `find`: compact, projected listings and server-side
 * aggregation, so agents don't have to reduce large payloads themselves.
 */

export const INCLUDE_KEYS = ['fields', 'tags', 'deck', 'model', 'state', 'cards'] as const;
export type IncludeKey = (typeof INCLUDE_KEYS)[number];

export const GROUP_BY_KEYS = ['tag', 'deck', 'state', 'model'] as const;
export type GroupByKey = (typeof GROUP_BY_KEYS)[number];

/** What a listing carries when neither include nor includeDetails is given. */
export const DEFAULT_INCLUDE: readonly IncludeKey[] = ['fields'];
/** includeDetails: true is an alias for everything. */
export const DETAILS_INCLUDE: readonly IncludeKey[] = INCLUDE_KEYS;

export const DEFAULT_MAX_FIELD_CHARS = 120;
/** Listings stop adding notes once the text would pass this many characters. */
export const DEFAULT_MAX_OUTPUT_CHARS = 20_000;

const NOTES_CHUNK = 500;
const CARDS_CHUNK = 200;

interface NoteInfo {
  noteId: number;
  modelName: string;
  tags: string[];
  cards: number[];
  fields: Record<string, { order: number; value: string }>;
}

type CardInfo = SchedulingFields & { note: number; deckName: string };

/** The subset of YankiConnect used by find, so tests can stub it. */
export interface FindClient {
  note: {
    findNotes: (params: { query: string }) => Promise<number[]>;
    notesInfo: (params: { notes: number[] }) => Promise<NoteInfo[]>;
  };
  card: {
    findCards: (params: { query: string }) => Promise<number[]>;
    cardsInfo: (params: { cards: number[] }) => Promise<Array<Omit<CardInfo, 'factor'>>>;
  };
  deck: {
    getDecks: (params: { cards: number[] }) => Promise<Record<string, number[]>>;
  };
  miscellaneous: {
    multi: (params: {
      actions: Array<{ action: 'findCards'; params: { query: string } }>;
    }) => Promise<unknown[]>;
  };
}

export interface FindParams {
  query: string;
  include?: IncludeKey[] | undefined;
  includeDetails?: boolean | undefined;
  maxFieldChars?: number | undefined;
  groupBy?: GroupByKey | undefined;
  format?: 'lines' | 'json' | undefined;
  limit?: number | undefined;
  offset?: number | undefined;
  /** Size guard; mostly for tests. */
  maxOutputChars?: number | undefined;
  now?: Date | undefined;
}

export function resolveInclude(
  include: IncludeKey[] | undefined,
  includeDetails: boolean | undefined
): IncludeKey[] {
  const set = new Set<IncludeKey>(include ?? (includeDetails ? DETAILS_INCLUDE : DEFAULT_INCLUDE));
  if (includeDetails) DETAILS_INCLUDE.forEach((k) => set.add(k));
  return INCLUDE_KEYS.filter((k) => set.has(k));
}

const ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

/** Field HTML to one line of plain text. */
export function stripHtml(html: string): string {
  return html
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/div|\/p|\/li|\/tr|hr)[^>]*>/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
      if (entity[0] === '#') {
        const code =
          entity[1] === 'x' || entity[1] === 'X'
            ? parseInt(entity.slice(2), 16)
            : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/** Truncates to `max` characters with an ellipsis; 0 means no limit. */
export function truncate(text: string, max: number): string {
  if (max <= 0 || text.length <= max) return text;
  return `${text.slice(0, Math.max(1, max - 1)).trimEnd()}…`;
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

async function notesInfoChunked(client: FindClient, ids: number[]): Promise<NoteInfo[]> {
  const out: NoteInfo[] = [];
  for (const chunk of chunks(ids, NOTES_CHUNK)) {
    out.push(...(await client.note.notesInfo({ notes: chunk })));
  }
  return out;
}

async function cardsInfoChunked(client: FindClient, ids: number[]): Promise<CardInfo[]> {
  const out: CardInfo[] = [];
  for (const chunk of chunks(ids, CARDS_CHUNK)) {
    out.push(...((await client.card.cardsInfo({ cards: chunk })) as CardInfo[]));
  }
  return out;
}

function multiResult(item: unknown): unknown {
  return item !== null && typeof item === 'object' && 'result' in item
    ? (item as { result: unknown }).result
    : item;
}

/** Offsets tried, nearest first, to anchor Anki's day numbers to today. */
const ANCHOR_OFFSETS = [0, 1, -1, 2, -2, 3, -3, 4, 5, 6, 7, 10, 14, 21, 30, -7, -14, -30];

/**
 * Anki stores review due dates as day numbers since the collection was
 * created. AnkiConnect doesn't expose that origin, so find a card whose due is
 * a known number of days from today (`prop:due=k`) and read its day number.
 * One multi request plus one small cardsInfo; undefined if nothing matches.
 */
export async function resolveToday(client: FindClient): Promise<number | undefined> {
  const results = await client.miscellaneous.multi({
    actions: ANCHOR_OFFSETS.map((k) => ({
      action: 'findCards' as const,
      params: { query: `prop:due=${k}` },
    })),
  });
  const candidates: Array<{ cardId: number; offset: number }> = [];
  results.forEach((item, i) => {
    const ids = multiResult(item);
    if (Array.isArray(ids) && typeof ids[0] === 'number' && candidates.length < 5) {
      candidates.push({ cardId: ids[0], offset: ANCHOR_OFFSETS[i] as number });
    }
  });
  if (candidates.length === 0) return undefined;
  const infos = await cardsInfoChunked(
    client,
    candidates.map((c) => c.cardId)
  );
  for (const candidate of candidates) {
    const card = infos.find((c) => c.cardId === candidate.cardId);
    if (card && dueIsDayNumber(card)) return card.due - candidate.offset;
  }
  return undefined;
}

interface NoteRecord {
  id: number;
  fields?: Record<string, string>;
  tags?: string[];
  deck?: string | string[];
  model?: string;
  cards?: Array<number | CardState>;
}

function renderLine(note: NoteRecord): string {
  const parts = [String(note.id)];
  if (note.fields) {
    for (const [name, value] of Object.entries(note.fields)) parts.push(`${name}: ${value}`);
  }
  if (note.tags) parts.push(`tags: ${note.tags.join(' ') || '-'}`);
  if (note.deck !== undefined) {
    parts.push(`deck: ${Array.isArray(note.deck) ? note.deck.join(', ') : note.deck}`);
  }
  if (note.model) parts.push(`model: ${note.model}`);
  if (note.cards) {
    parts.push(
      `cards: ${note.cards.map((c) => (typeof c === 'number' ? String(c) : formatCardState(c))).join('; ')}`
    );
  }
  return parts.join(' | ');
}

function sizeHint(total: number, noun: string): string {
  return `${total} ${noun}; pass groupBy, include, or a narrower query/limit`;
}

/** Runs find and returns the tool's text output. */
export async function runFind(client: FindClient, params: FindParams): Promise<string> {
  const query = params.query.trim();
  if (!query) throw new InputError('find requires query (Anki search syntax, e.g. deck:"Spanish")');
  if (params.groupBy) return runGroupBy(client, query, params.groupBy, params);
  return runListing(client, query, params);
}

async function runListing(client: FindClient, query: string, params: FindParams): Promise<string> {
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  const maxFieldChars = params.maxFieldChars ?? DEFAULT_MAX_FIELD_CHARS;
  const budget = params.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
  const json = params.format === 'json';
  const include = new Set(resolveInclude(params.include, params.includeDetails));

  const noteIds = await client.note.findNotes({ query });
  const total = noteIds.length;
  const pageIds = noteIds.slice(offset, offset + limit);

  let records: NoteRecord[] = pageIds.map((id) => ({ id }));
  if (include.size > 0 && pageIds.length > 0) {
    const notes = await notesInfoChunked(client, pageIds);
    const byId = new Map(notes.map((n) => [n.noteId, n]));
    const needCards = include.has('deck') || include.has('state');
    const cardsById = new Map<number, CardInfo>();
    let todayDayNumber: number | undefined;
    if (needCards) {
      const cards = await cardsInfoChunked(
        client,
        notes.flatMap((n) => n.cards)
      );
      cards.forEach((c) => cardsById.set(c.cardId, c));
      if (include.has('state') && cards.some(dueIsDayNumber)) {
        todayDayNumber = await resolveToday(client).catch(() => undefined);
      }
    }
    records = pageIds.map((id) => {
      const note = byId.get(id);
      const record: NoteRecord = { id };
      if (!note) return record;
      if (include.has('fields')) {
        record.fields = Object.fromEntries(
          Object.entries(note.fields)
            .sort(([, a], [, b]) => a.order - b.order)
            .map(([name, f]) => [name, truncate(stripHtml(f.value), maxFieldChars)])
        );
      }
      if (include.has('tags')) record.tags = note.tags;
      const cards = note.cards
        .map((cid) => cardsById.get(cid))
        .filter((c): c is CardInfo => c !== undefined);
      if (include.has('deck')) {
        const decks = [...new Set(cards.map((c) => c.deckName))];
        record.deck = decks.length === 1 ? (decks[0] as string) : decks;
      }
      if (include.has('model')) record.model = note.modelName;
      if (include.has('state')) {
        record.cards = cards.map((c) => cardState(c, { todayDayNumber, now: params.now }));
      } else if (include.has('cards')) {
        record.cards = note.cards;
      }
      return record;
    });
  }

  // Render under the size guard; always show at least one note.
  const rendered: string[] = [];
  let used = 0;
  let cut = false;
  for (const record of records) {
    let piece = json
      ? JSON.stringify(record)
      : include.size === 0
        ? String(record.id)
        : renderLine(record);
    if (used + piece.length + 1 > budget) {
      if (rendered.length > 0) {
        cut = true;
        break;
      }
      piece = truncate(piece, budget);
      cut = records.length > 1;
    }
    rendered.push(piece);
    used += piece.length + 1;
  }

  const shown = rendered.length;
  const end = offset + shown;
  const nextOffset = end < total ? end : null;

  if (json) {
    const meta = { query, total, offset, shown, nextOffset };
    const hint = cut ? `,"hint":${JSON.stringify(sizeHint(total, 'notes'))}` : '';
    const body = JSON.stringify(meta).slice(0, -1);
    return `${body}${hint},"notes":[${rendered.join(',')}]}`;
  }

  const lines = [
    total === 0
      ? `0 notes match ${JSON.stringify(query)}`
      : `${total} notes match ${JSON.stringify(query)}; showing ${shown === 0 ? 0 : offset + 1}-${end}; ${
          nextOffset === null ? 'end of results' : `next offset ${nextOffset}`
        }`,
  ];
  if (cut) lines.push(`Output capped at ~${budget} chars: ${sizeHint(total, 'notes')}.`);
  if (shown > 0) {
    if (include.size === 0) lines.push(`ids: ${rendered.join(',')}`);
    else lines.push(...rendered);
  }
  return lines.join('\n');
}

interface GroupCounts {
  notes: number;
  cards: number;
  new: number;
  seen: number;
}

async function runGroupBy(
  client: FindClient,
  query: string,
  groupBy: GroupByKey,
  params: FindParams
): Promise<string> {
  const budget = params.maxOutputChars ?? DEFAULT_MAX_OUTPUT_CHARS;
  const json = params.format === 'json';
  const [noteIds, cardIds] = await Promise.all([
    client.note.findNotes({ query }),
    client.card.findCards({ query }),
  ]);
  const matched = new Set(cardIds);
  const groups = new Map<string, GroupCounts>();
  const bump = (key: string, notes: number, cards: number, fresh: number) => {
    const g = groups.get(key) ?? { notes: 0, cards: 0, new: 0, seen: 0 };
    g.notes += notes;
    g.cards += cards;
    g.new += fresh;
    g.seen += cards - fresh;
    groups.set(key, g);
  };
  let newTotal = 0;

  if (cardIds.length > 0) {
    if (groupBy === 'state') {
      const cards = await cardsInfoChunked(client, cardIds);
      const notesByLabel = new Map<string, Set<number>>();
      for (const card of cards) {
        const label = queueLabel(card);
        const fresh = isSeen(card) ? 0 : 1;
        newTotal += fresh;
        bump(label, 0, 1, fresh);
        const set = notesByLabel.get(label) ?? new Set<number>();
        set.add(card.note);
        notesByLabel.set(label, set);
      }
      for (const [label, set] of notesByLabel) (groups.get(label) as GroupCounts).notes = set.size;
    } else {
      const newIds = new Set(await client.card.findCards({ query: `(${query}) is:new` }));
      newTotal = cardIds.filter((id) => newIds.has(id)).length;
      const notes = await notesInfoChunked(client, noteIds);
      if (groupBy === 'deck') {
        const noteOf = new Map<number, number>();
        notes.forEach((n) => n.cards.forEach((c) => noteOf.set(c, n.noteId)));
        const decks = await client.deck.getDecks({ cards: cardIds });
        for (const [deck, ids] of Object.entries(decks)) {
          const inDeck = ids.filter((id) => matched.has(id));
          const noteSet = new Set(inDeck.map((id) => noteOf.get(id) ?? -id));
          bump(deck, noteSet.size, inDeck.length, inDeck.filter((id) => newIds.has(id)).length);
        }
      } else {
        for (const note of notes) {
          const cards = note.cards.filter((id) => matched.has(id));
          const fresh = cards.filter((id) => newIds.has(id)).length;
          const keys =
            groupBy === 'model'
              ? [note.modelName]
              : note.tags.length > 0
                ? note.tags
                : ['(untagged)'];
          for (const key of keys) bump(key, 1, cards.length, fresh);
        }
      }
    }
  }

  const order =
    groupBy === 'state'
      ? [...groups.keys()].sort(
          (a, b) =>
            QUEUE_LABELS.indexOf(a as (typeof QUEUE_LABELS)[number]) -
            QUEUE_LABELS.indexOf(b as (typeof QUEUE_LABELS)[number])
        )
      : [...groups.entries()]
          .sort(
            ([ka, a], [kb, b]) => b.cards - a.cards || b.notes - a.notes || ka.localeCompare(kb)
          )
          .map(([k]) => k);

  const rendered: string[] = [];
  let used = 0;
  for (const key of order) {
    const g = groups.get(key) as GroupCounts;
    const piece = json
      ? `${JSON.stringify(key)}:${JSON.stringify(g)}`
      : groupBy === 'state'
        ? `${key}: ${g.cards} cards, ${g.notes} notes`
        : `${key}: ${g.notes} notes, ${g.cards} cards, ${g.new} new, ${g.seen} seen`;
    if (used + piece.length + 1 > budget && rendered.length > 0) break;
    rendered.push(piece);
    used += piece.length + 1;
  }
  const omitted = order.length - rendered.length;
  const totals = {
    notes: noteIds.length,
    cards: cardIds.length,
    new: newTotal,
    seen: cardIds.length - newTotal,
  };

  if (json) {
    const meta = { query, groupBy, ...totals, groupCount: order.length, omittedGroups: omitted };
    return `${JSON.stringify(meta).slice(0, -1)},"groups":{${rendered.join(',')}}}`;
  }
  const lines = [
    `${totals.notes} notes, ${totals.cards} cards (${totals.new} new, ${totals.seen} seen) match ${JSON.stringify(query)}; ${order.length} ${groupBy} groups`,
  ];
  if (groupBy === 'tag' && order.length > 1) {
    lines.push('A note with several tags counts under each.');
  }
  lines.push(...rendered);
  if (omitted > 0) {
    lines.push(
      `… ${omitted} more groups omitted (output capped at ~${budget} chars); narrow the query.`
    );
  }
  return lines.join('\n');
}
