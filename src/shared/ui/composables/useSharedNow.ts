import { getCurrentScope, onScopeDispose, readonly, shallowRef, type DeepReadonly, type Ref } from 'vue';

export const SHARED_NOW_TICK_MS = 1000;

const now = shallowRef(Date.now());
let subscribers = 0;
let timer: ReturnType<typeof setInterval> | null = null;

function tick() {
  now.value = Date.now();
}

/**
 * The wall clock (epoch milliseconds) shared by every relative time on the
 * page. One timer drives all of them, so a table of timestamps advances in a
 * single render instead of one timer and one render per row. The timer runs
 * only while at least one effect scope is subscribed.
 */
export function useSharedNow(): DeepReadonly<Ref<number>> {
  if (!getCurrentScope()) throw new Error('useSharedNow must be called inside an effect scope');
  // A new subscriber starts from the present, not from the last shared tick.
  tick();
  subscribers += 1;
  timer ??= setInterval(tick, SHARED_NOW_TICK_MS);
  onScopeDispose(() => {
    subscribers -= 1;
    if (subscribers === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  });
  return readonly(now);
}
