import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref } from 'vue';
import { SHARED_NOW_TICK_MS, useSharedNow } from './useSharedNow';
import { useTimeAgo } from './useTimeAgo';

const scopes: ReturnType<typeof effectScope>[] = [];

function subscribe<T>(factory: () => T): T {
  const scope = effectScope();
  scopes.push(scope);
  return scope.run(factory) as T;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-24T08:00:00Z'));
});

afterEach(() => {
  while (scopes.length) scopes.pop()?.stop();
  vi.useRealTimers();
});

describe('useSharedNow', () => {
  it('drives every subscriber from one timer', () => {
    const first = subscribe(useSharedNow);
    const second = subscribe(useSharedNow);
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(SHARED_NOW_TICK_MS);
    expect(first.value).toBe(Date.now());
    expect(second.value).toBe(first.value);
  });

  it('starts each subscriber from the present rather than the last tick', () => {
    subscribe(useSharedNow);
    vi.setSystemTime(Date.now() + 600);
    const late = subscribe(useSharedNow);
    expect(late.value).toBe(Date.now());
  });

  it('stops its timer once the last subscriber is disposed and restarts on demand', () => {
    subscribe(useSharedNow);
    subscribe(useSharedNow);
    scopes.shift()?.stop();
    expect(vi.getTimerCount()).toBe(1);
    scopes.shift()?.stop();
    expect(vi.getTimerCount()).toBe(0);

    const revived = subscribe(useSharedNow);
    vi.advanceTimersByTime(SHARED_NOW_TICK_MS * 2);
    expect(revived.value).toBe(Date.now());
    expect(vi.getTimerCount()).toBe(1);
  });

  it('refuses to subscribe without a scope that could release the timer', () => {
    expect(() => useSharedNow()).toThrow('useSharedNow must be called inside an effect scope');
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('useTimeAgo', () => {
  it('advances through seconds, minutes and hours on the shared clock', async () => {
    const result = subscribe(() => useTimeAgo(new Date(Date.now() - 58_000)));
    expect(result).toEqual({ precision: 'seconds', value: 58 });

    vi.advanceTimersByTime(2000);
    await nextTick();
    expect(result).toEqual({ precision: 'minutes', value: 1 });

    vi.advanceTimersByTime(59 * 60_000);
    await nextTick();
    expect(result).toEqual({ precision: 'hours', value: 1 });
  });

  it('follows a changed date without waiting for the next tick', async () => {
    const date = ref(new Date(Date.now() - 3 * 60 * 60_000));
    const result = subscribe(() => useTimeAgo(date));
    expect(result).toEqual({ precision: 'hours', value: 3 });

    date.value = new Date(Date.now() - 5000);
    await nextTick();
    expect(result).toEqual({ precision: 'seconds', value: 5 });
  });

  it('shares one timer across many timestamps', () => {
    for (let row = 0; row < 25; row += 1) subscribe(() => useTimeAgo(new Date(Date.now() - row * 1000)));
    expect(vi.getTimerCount()).toBe(1);
  });
});
