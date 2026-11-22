// Top-level navigation state, shared across the app. Components read `nav.*`
// (reactive) and call the helpers to move around. It lives here rather than in
// App so any component can navigate — e.g. clicking a user's avatar opens their
// profile (Phase 10), or a roster entry opens a DM (Phase 12).

// "market" | "graveyard" | "leaderboards" are TOP-LEVEL sections since Aug
// 2026 (Josh's rail rework) — they used to live inside the casino hub.
export type View =
  | "chat" | "dms" | "rumble" | "market" | "graveyard" | "leaderboards" | "pandora" | "portal"
  | "backrooms" | "survivorz" | "feedback" | "howto" | "adminpanel" | "profile";
export type RumbleGame = "hub" | "wheel" | "slots" | "blackjack" | "roulette" | "craps" | "holdem" | "derby" | "chess" | "bonepit" | "lottery" | "lender";
export type MarketTab = "shop" | "trade" | "auction" | "forge" | "wallet";

export const nav = $state<{
  view: View;
  rumble: RumbleGame;
  /** Which counter of the Market is open (shop = the Trader/Emporium). */
  marketTab: MarketTab;
  /** Whose profile to show; null = your own. */
  profileUserId: number | null;
}>({
  view: "chat",
  rumble: "hub",
  marketTab: "shop",
  profileUserId: null,
});

export function go(view: View): void {
  nav.view = view;
}

/** Logout hygiene: the next login starts on Chat, not wherever (or on
 *  whomever's profile) the previous account was parked. */
export function resetNav(): void {
  nav.view = "chat";
  nav.rumble = "hub";
  nav.marketTab = "shop";
  nav.profileUserId = null;
}

/** Open the Emoji Casino section, on the hub by default or a specific game. */
export function openRumble(game: RumbleGame = "hub"): void {
  nav.rumble = game;
  nav.view = "rumble";
}

/** Open the Market on a specific counter (shop / trade / auction). */
export function openMarket(tab: MarketTab = "shop"): void {
  nav.marketTab = tab;
  nav.view = "market";
}

/** Open a profile page — pass a userId to view someone else, or null for your own. */
export function openProfile(userId: number | null = null): void {
  nav.profileUserId = userId;
  nav.view = "profile";
}
