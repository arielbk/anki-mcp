import { describe, expect, it } from 'vitest';
import {
  cardState,
  countByQueue,
  formatCardState,
  formatDue,
  isSeen,
  queueLabel,
  type SchedulingFields,
} from '../src/utils/cardState.js';

const base: SchedulingFields = {
  cardId: 1,
  queue: 0,
  type: 0,
  due: 12,
  interval: 0,
  reps: 0,
  lapses: 0,
  factor: 0,
};

describe('queueLabel', () => {
  it.each([
    [0, 0, 'new'],
    [1, 1, 'learning'],
    [3, 1, 'learning'],
    [1, 3, 'relearning'],
    [3, 3, 'relearning'],
    [2, 2, 'review'],
    [-1, 2, 'suspended'],
    [-2, 2, 'buried'],
    [-3, 0, 'buried'],
    [4, 1, 'learning'],
  ])('queue %i type %i -> %s', (queue, type, label) => {
    expect(queueLabel({ queue, type })).toBe(label);
  });

  it('treats only type 0 as unseen', () => {
    expect(isSeen({ type: 0 })).toBe(false);
    expect(isSeen({ type: 2 })).toBe(true);
  });
});

describe('formatDue', () => {
  const now = new Date(2026, 10, 28, 12);

  it('shows the new-queue position', () => {
    expect(formatDue(base)).toBe('#12');
    expect(formatDue({ ...base, queue: -1 })).toBe('#12');
  });

  it('turns review day numbers into dates when today is known', () => {
    const card = { ...base, queue: 2, type: 2, due: 2152 };
    expect(formatDue(card, { todayDayNumber: 2148, now })).toBe('2026-12-02');
    expect(formatDue(card, { todayDayNumber: 2160, now })).toBe('2026-11-20');
    expect(formatDue({ ...card, queue: -1 }, { todayDayNumber: 2152, now })).toBe('2026-11-28');
  });

  it('uses Anki’s day (rollover-aware) as today, not the calendar date', () => {
    const card = { ...base, queue: 2, type: 2, due: 2149 };
    // 01:00 on the 28th is still Anki's 27th with the default 4am rollover.
    const early = new Date(2026, 10, 28, 1);
    expect(formatDue(card, { todayDayNumber: 2148, now: early })).toBe('2026-11-28');
    expect(formatDue(card, { todayDayNumber: 2148, now: early, rolloverHour: 0 })).toBe(
      '2026-11-29'
    );
  });

  it('reports the due as unknown for cards in filtered decks', () => {
    const card = { ...base, queue: 2, type: 2, due: -100_000 };
    expect(formatDue(card, { todayDayNumber: 2148, now, inFilteredDeck: true })).toBe(
      'unknown (in filtered deck)'
    );
  });

  it('keeps the raw day number when today is unknown', () => {
    expect(formatDue({ ...base, queue: 2, type: 2, due: 2152 })).toBe('day 2152');
  });

  it('shows intraday learning due as a UTC datetime', () => {
    const due = Date.UTC(2026, 10, 28, 9, 30) / 1000;
    expect(formatDue({ ...base, queue: 1, type: 1, due })).toBe('2026-11-28T09:30Z');
  });
});

describe('cardState', () => {
  it('reports interval, reps, lapses and ease in percent', () => {
    const state = cardState(
      { ...base, queue: 2, type: 2, due: 2150, interval: 21, reps: 5, lapses: 1, factor: 2500 },
      { todayDayNumber: 2150, now: new Date(2026, 10, 28, 12) }
    );
    expect(state).toEqual({
      cardId: 1,
      queue: 'review',
      ivl: 21,
      due: '2026-11-28',
      reps: 5,
      lapses: 1,
      ease: 250,
    });
    expect(formatCardState(state)).toBe(
      '1 review ivl=21d due=2026-11-28 reps=5 lapses=1 ease=250%'
    );
  });

  it('omits ease for new cards and clamps negative (seconds) intervals', () => {
    const fresh = cardState(base);
    expect(fresh.ease).toBeUndefined();
    expect(formatCardState(fresh)).toBe('1 new due=#12');
    expect(cardState({ ...base, queue: 1, type: 1, interval: -600, due: 5 }).ivl).toBe(0);
  });

  it('counts cards per queue', () => {
    expect(countByQueue([{ queue: 'new' }, { queue: 'new' }, { queue: 'review' }])).toEqual({
      new: 2,
      review: 1,
    });
  });
});
