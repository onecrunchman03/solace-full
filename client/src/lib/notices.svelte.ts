// HOUSE NOTICES — small, self-dismissing cards for things that happened TO
// you while you weren't looking at the right screen (the collectors' visit,
// a friend paying the goblins for you, your bail clearing). The achievement
// toast's shape, without the medal; App.svelte renders the stack next to it.
// A notice is never a dialog: nothing here blocks, nothing asks.

export interface Notice {
  key: number;
  title: string;
  body: string;
  /** Colours the card's edge: "grim" is the goblins taking, "kind" is
   *  somebody giving, "plain" is everything else. */
  tone: "grim" | "kind" | "plain";
  icon: string;
}

export const notices = $state<{ list: Notice[] }>({ list: [] });

let seq = 1;

export function pushNotice(n: Omit<Notice, "key">, ms = 9000): void {
  const key = seq++;
  notices.list = [...notices.list, { ...n, key }];
  setTimeout(() => {
    notices.list = notices.list.filter((x) => x.key !== key);
  }, ms);
}

export function dismissNotice(key: number): void {
  notices.list = notices.list.filter((x) => x.key !== key);
}
