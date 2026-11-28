/**
 * Maps AnkiConnect `cardsInfo` scheduling fields to readable state.
 *
 * Anki card fields used here:
 * - queue: -3 user-buried, -2 sched-buried, -1 suspended, 0 new, 1 learning
 *   (due = epoch seconds), 2 review (due = day number), 3 day-learn (due = day
 *   number), 4 preview.
 * - type: 0 new, 1 learning, 2 review, 3 relearning.
 * - factor: ease in permille (2500 = 250%), 0 for new cards.
 */

export type QueueLabel = 'new' | 'learning' | 'review' | 'relearning' | 'suspended' | 'buried';

export const QUEUE_LABELS: readonly QueueLabel[] = [
  'new',
  'learning',
  'review',
  'relearning',
  'suspended',
  'buried',
];

/** The cardsInfo fields this module reads. `factor` is returned by AnkiConnect but missing from yanki-connect's type. */
export interface SchedulingFields {
  cardId: number;
  queue: number;
  type: number;
  due: number;
  interval: number;
  reps: number;
  lapses: number;
  factor?: number;
}

export interface CardState {
  cardId: number;
  queue: QueueLabel;
  /** Current interval in days (0 for new/learning). */
  ivl: number;
  /** ISO date (review/day-learn when today's day number is known), ISO datetime (learning), `#n` new-queue position, or `day n` raw day number. */
  due: string;
  reps: number;
  lapses: number;
  /** Ease in percent, e.g. 250; undefined for new cards. */
  ease?: number;
}

export function queueLabel(card: Pick<SchedulingFields, 'queue' | 'type'>): QueueLabel {
  switch (card.queue) {
    case -1:
      return 'suspended';
    case -2:
    case -3:
      return 'buried';
    case 0:
      return 'new';
    case 2:
      return 'review';
    case 1:
    case 3:
    case 4:
      return card.type === 3 ? 'relearning' : 'learning';
    default:
      return card.type === 0 ? 'new' : card.type === 2 ? 'review' : 'learning';
  }
}

/** A card counts as seen once it has left the new type (it has been studied at least once). */
export function isSeen(card: Pick<SchedulingFields, 'type'>): boolean {
  return card.type !== 0;
}

/** True when `due` is an Anki day number (review or day-learn queue, including suspended/buried review cards). */
export function dueIsDayNumber(card: Pick<SchedulingFields, 'queue' | 'type'>): boolean {
  if (card.queue === 2 || card.queue === 3) return true;
  // Suspended/buried cards keep their review due.
  return card.queue < 0 && card.type === 2;
}

function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export interface DueContext {
  /** Anki's day number for today, if known (see find's resolveToday). */
  todayDayNumber?: number | undefined;
  /** Current time, injectable for tests. */
  now?: Date | undefined;
}

export function formatDue(card: SchedulingFields, ctx: DueContext = {}): string {
  const now = ctx.now ?? new Date();
  if (card.queue === 0 || (card.queue < 0 && card.type === 0)) return `#${card.due}`;
  if (dueIsDayNumber(card)) {
    if (ctx.todayDayNumber === undefined) return `day ${card.due}`;
    const date = new Date(now);
    date.setDate(date.getDate() + (card.due - ctx.todayDayNumber));
    return isoDate(date);
  }
  if (card.queue === 1 || card.queue === 4 || card.type === 1 || card.type === 3) {
    // Intraday learning: due is epoch seconds.
    return card.due > 1e9
      ? new Date(card.due * 1000).toISOString().slice(0, 16) + 'Z'
      : `${card.due}`;
  }
  return `${card.due}`;
}

export function cardState(card: SchedulingFields, ctx: DueContext = {}): CardState {
  const state: CardState = {
    cardId: card.cardId,
    queue: queueLabel(card),
    ivl: Math.max(0, card.interval),
    due: formatDue(card, ctx),
    reps: card.reps,
    lapses: card.lapses,
  };
  if (card.factor) state.ease = Math.round(card.factor / 10);
  return state;
}

/** One compact token per card, e.g. `123 review ivl=21d due=2026-12-01 reps=5 lapses=1 ease=250%`. */
export function formatCardState(state: CardState): string {
  if (state.queue === 'new') return `${state.cardId} new due=${state.due}`;
  let text = `${state.cardId} ${state.queue} ivl=${state.ivl}d due=${state.due} reps=${state.reps} lapses=${state.lapses}`;
  if (state.ease !== undefined) text += ` ease=${state.ease}%`;
  return text;
}

/** Counts of cards per queue label, omitting zeros. */
export function countByQueue(
  states: Array<Pick<CardState, 'queue'>>
): Partial<Record<QueueLabel, number>> {
  const counts: Partial<Record<QueueLabel, number>> = {};
  for (const s of states) counts[s.queue] = (counts[s.queue] ?? 0) + 1;
  return counts;
}
