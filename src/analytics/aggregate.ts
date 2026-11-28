/**
 * Pure aggregation helpers for get_analytics. Nothing here talks to Anki, so
 * every function is unit tested with plain data.
 *
 * Day handling: Anki's "day" starts at the collection's rollover hour (4am
 * local by default), not at midnight. A review belongs to the local calendar
 * date of `reviewTime - rolloverHour`, which is exactly how AnkiConnect's
 * getNumCardsReviewedByDay buckets reviews.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** Anki's default "next day starts at" hour. */
export const DEFAULT_ROLLOVER_HOUR = 4;

/** Interval (days) at which Anki counts a review card as mature. */
export const MATURE_IVL = 21;

/** One revlog entry. `id` is the review time in epoch milliseconds. */
export interface Review {
  id: number;
  cardId: number;
  /** Button pressed: 1=Again, 2=Hard, 3=Good, 4=Easy; 0 for manual reschedules. */
  ease: number;
  /** New interval: days if positive, seconds if negative (learning). */
  ivl: number;
  /** Previous interval, same units as ivl. */
  lastIvl: number;
  /** Time spent answering, in milliseconds. */
  time: number;
  /** 0=learn, 1=review, 2=relearn, 3=filtered (cram), 4=manual. */
  type: number;
}

/** AnkiConnect cardReviews 9-tuple. */
export type ReviewTuple = [
  reviewTime: number,
  cardID: number,
  usn: number,
  buttonPressed: number,
  newInterval: number,
  previousInterval: number,
  newFactor: number,
  reviewDuration: number,
  reviewType: number,
];

export function fromTuple(t: ReviewTuple): Review {
  return {
    id: t[0],
    cardId: t[1],
    ease: t[3],
    ivl: t[4],
    lastIvl: t[5],
    time: t[7],
    type: t[8],
  };
}

const pad = (n: number) => String(n).padStart(2, '0');

function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Anki day (YYYY-MM-DD, local time) that a timestamp falls on. */
export function dayKey(ts: number, rolloverHour: number): string {
  return localDateKey(new Date(ts - rolloverHour * HOUR_MS));
}

/** Adds n calendar days to a YYYY-MM-DD key. */
export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (both YYYY-MM-DD). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/** The `days` most recent day keys ending at `today`, newest first. */
export function dayRange(today: string, days: number): string[] {
  return Array.from({ length: Math.max(0, days) }, (_, i) => addDays(today, -i));
}

/** Start (epoch ms) of the Anki day containing `now`. */
export function dayStart(now: number, rolloverHour: number): number {
  const d = new Date(now);
  d.setHours(rolloverHour, 0, 0, 0);
  if (d.getTime() > now) d.setDate(d.getDate() - 1);
  return d.getTime();
}

/**
 * Works out the collection's rollover hour, which AnkiConnect doesn't expose.
 * `reviewIds` are recent review times (ideally every review of the last two
 * days, collection-wide) and `todayCount` is getNumCardsReviewedToday. The
 * hour whose day start splits off exactly `todayCount` reviews is the
 * rollover hour; when several hours fit, the default (4) or the closest to it
 * wins. With no fit (or no information), the default is assumed.
 */
export function inferRolloverHour(
  reviewIds: number[],
  todayCount: number,
  now: number
): { hour: number; inferred: boolean } {
  const matches: number[] = [];
  for (let h = 0; h < 24; h++) {
    const start = dayStart(now, h);
    const count = reviewIds.filter((id) => id >= start && id <= now).length;
    if (count === todayCount) matches.push(h);
  }
  if (matches.length === 0 || matches.length === 24) {
    return { hour: DEFAULT_ROLLOVER_HOUR, inferred: false };
  }
  const dist = (h: number) => {
    const d = Math.abs(h - DEFAULT_ROLLOVER_HOUR);
    return Math.min(d, 24 - d);
  };
  const hour = [...matches].sort((a, b) => dist(a) - dist(b) || a - b)[0] ?? DEFAULT_ROLLOVER_HOUR;
  return { hour, inferred: true };
}

/** Review counts per day key. */
export function countByDay(reviews: Review[], rolloverHour: number): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of reviews) {
    const key = dayKey(r.id, rolloverHour);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

/**
 * Compact "YYYY-MM-DD: n" lines for every day in `keys` (zero days included)
 * plus a total line.
 */
export function formatDayCounts(keys: string[], counts: Map<string, number>): string {
  let total = 0;
  let active = 0;
  const lines = keys.map((key) => {
    const n = counts.get(key) ?? 0;
    total += n;
    if (n > 0) active++;
    return `${key}: ${n}`;
  });
  lines.push(`total: ${total} reviews over ${keys.length} days (${active} with reviews)`);
  return lines.join('\n');
}

const pct = (part: number, whole: number) =>
  whole === 0 ? null : Math.round((part / whole) * 1000) / 10;

/** Graded answers only: manual reschedules (ease 0 / type 4) are not answers. */
export const isAnswer = (r: Review) => r.ease > 0 && r.type !== 4;

export interface AnswerSummary {
  reviews: number;
  again: number;
  /** Percent of answers that were not Again; null when there were none. */
  correctPct: number | null;
}

export function summarizeAnswers(reviews: Review[]): AnswerSummary {
  const answers = reviews.filter(isAnswer);
  const again = answers.filter((r) => r.ease === 1).length;
  return {
    reviews: answers.length,
    again,
    correctPct: pct(answers.length - again, answers.length),
  };
}

export type CardKind = 'learning' | 'young' | 'mature';

/**
 * Card type at the time of a review, as Anki's "Answer buttons" graph splits
 * it: learning/relearning steps, then young vs mature by previous interval.
 */
export function cardKindOf(r: Review): CardKind {
  if (r.type === 0 || r.type === 2) return 'learning';
  return r.lastIvl >= MATURE_IVL ? 'mature' : 'young';
}

export function correctByCardType(reviews: Review[]): Record<CardKind, AnswerSummary> {
  const groups: Record<CardKind, Review[]> = { learning: [], young: [], mature: [] };
  for (const r of reviews.filter(isAnswer)) groups[cardKindOf(r)].push(r);
  return {
    learning: summarizeAnswers(groups.learning),
    young: summarizeAnswers(groups.young),
    mature: summarizeAnswers(groups.mature),
  };
}

/**
 * True retention: share of review-type answers (cards already graduated)
 * that were not Again. Learning steps are excluded.
 */
export function retention(reviews: Review[]): AnswerSummary {
  return summarizeAnswers(reviews.filter((r) => r.type === 1));
}

export interface StudiedToday {
  cards: number;
  reviews: number;
  minutes: number;
  again: number;
  correctPct: number | null;
}

export function studiedToday(reviews: Review[], today: string, rolloverHour: number): StudiedToday {
  const todays = reviews.filter((r) => isAnswer(r) && dayKey(r.id, rolloverHour) === today);
  const summary = summarizeAnswers(todays);
  const ms = todays.reduce((sum, r) => sum + r.time, 0);
  return {
    cards: new Set(todays.map((r) => r.cardId)).size,
    reviews: summary.reviews,
    minutes: Math.round(ms / 6000) / 10,
    again: summary.again,
    correctPct: summary.correctPct,
  };
}

/** Average and longest interval in days, ignoring learning intervals (<= 0). */
export function intervalStats(intervals: number[]): {
  averageDays: number | null;
  longestDays: number | null;
} {
  const days = intervals.filter((i) => i > 0);
  if (days.length === 0) return { averageDays: null, longestDays: null };
  // A loop, not Math.max(...days): spreading a huge array overflows the stack.
  let sum = 0;
  let longest = 0;
  for (const d of days) {
    sum += d;
    if (d > longest) longest = d;
  }
  return {
    averageDays: Math.round((sum / days.length) * 10) / 10,
    longestDays: longest,
  };
}

/**
 * When the unseen cards run out at the deck's new/day limit. Today's
 * remaining quota (perDay minus cards already introduced today) is used up
 * first; the returned date is the day the last unseen card is introduced.
 */
export function projectRunOut(params: {
  unseen: number;
  perDay: number;
  introducedToday: number;
  today: string;
}): { date: string; daysFromToday: number } | null {
  const { unseen, perDay, introducedToday, today } = params;
  if (unseen <= 0) return { date: today, daysFromToday: 0 };
  if (perDay <= 0) return null;
  const leftToday = Math.max(0, perDay - introducedToday);
  if (unseen <= leftToday) return { date: today, daysFromToday: 0 };
  const days = Math.ceil((unseen - leftToday) / perDay);
  return { date: addDays(today, days), daysFromToday: days };
}

/** Plain text from card HTML, whitespace collapsed, cut to `max` chars. */
export function stripHtml(html: string, max = 60): string {
  const text = html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(div|p|li)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export interface CardTrouble {
  cardId: number;
  /** Again presses in the window (any card type). */
  again: number;
  /** Again presses on graduated cards in the window (lapses). */
  lapsesInWindow: number;
  reviews: number;
}

/** Per-card Again counts, worst first; cards without an Again are dropped. */
export function troubleByCard(reviews: Review[]): CardTrouble[] {
  const byCard = new Map<number, CardTrouble>();
  for (const r of reviews.filter(isAnswer)) {
    const entry = byCard.get(r.cardId) ?? {
      cardId: r.cardId,
      again: 0,
      lapsesInWindow: 0,
      reviews: 0,
    };
    entry.reviews++;
    if (r.ease === 1) {
      entry.again++;
      if (r.type === 1) entry.lapsesInWindow++;
    }
    byCard.set(r.cardId, entry);
  }
  return [...byCard.values()]
    .filter((c) => c.again > 0)
    .sort(
      (a, b) => b.again - a.again || b.lapsesInWindow - a.lapsesInWindow || a.cardId - b.cardId
    );
}

export interface TagCount {
  tag: string;
  /** Distinct cards with an Again carrying this tag. */
  cards: number;
  again: number;
}

export const UNTAGGED = '(untagged)';

/**
 * Again counts grouped by tag. `againByCard` maps cardId -> Again presses;
 * `notes` supplies each note's tags and card IDs. A card counts toward each
 * of its tags.
 */
export function againByTag(
  againByCard: Map<number, number>,
  notes: Array<{ tags: string[]; cards: number[] }>
): TagCount[] {
  const byTag = new Map<string, TagCount>();
  for (const note of notes) {
    const tags = note.tags.length > 0 ? note.tags : [UNTAGGED];
    for (const cardId of note.cards) {
      const again = againByCard.get(cardId);
      if (!again) continue;
      for (const tag of tags) {
        const entry = byTag.get(tag) ?? { tag, cards: 0, again: 0 };
        entry.cards++;
        entry.again += again;
        byTag.set(tag, entry);
      }
    }
  }
  return [...byTag.values()].sort(
    (a, b) => b.again - a.again || b.cards - a.cards || a.tag.localeCompare(b.tag)
  );
}
