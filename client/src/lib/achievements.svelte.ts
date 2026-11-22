// Achievement toasts — the earner's own unlock moment. The server sends
// one targeted frame per fresh badge (chat.svelte.ts dispatches here);
// App.svelte renders the stack bottom-right and each card self-dismisses.

export interface AchToast {
  key: number;
  id: string;
  name: string;
  desc: string;
  tier: "bronze" | "silver" | "gold" | "mythic";
  rewardItem: string | null;
}

export const achToasts = $state<{ list: AchToast[] }>({ list: [] });

let seq = 1;

// NO SPOILERS WHILE THE WHEEL IS TURNING (Josh, Aug 2026: the spin-count
// badge popped before the disc came to rest — the server checks stat badges
// ~4s after the spin resolves, a full second before the 5.2s animation ends).
// While a gate is held, fresh toasts queue; release flushes them in order.
// Same rule the wheel feed and leaderboards already play by.
let gated = false;
let held: Omit<AchToast, "key">[] = [];

export function holdAchievementToasts(): void {
  gated = true;
}

/** Release the gate; `discard` drops anything held (logout teardown). */
export function releaseAchievementToasts(discard = false): void {
  gated = false;
  const queued = held;
  held = [];
  if (discard) return;
  for (const t of queued) pushAchievementToast(t);
}

export function pushAchievementToast(t: Omit<AchToast, "key">): void {
  if (gated) {
    held.push(t);
    return;
  }
  const key = seq++;
  achToasts.list = [...achToasts.list, { ...t, key }];
  setTimeout(() => {
    achToasts.list = achToasts.list.filter((x) => x.key !== key);
  }, 7000);
}
