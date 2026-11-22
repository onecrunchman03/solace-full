// THE PAPERWORK (Josh, Sep 2026: "i want to make sure there user agreements
// and liability protection for me").
//
// Solace has Terms of Service, Community Guidelines, a Privacy Policy, a
// Satellite Host Agreement and a Copyright policy. They live as static pages
// under client/public/legal/ (served at /legal/*.html, linked from the login
// screen, Settings, the guide and the satellite installers). This file holds
// the two VERSION NUMBERS the service enforces:
//
//  · TERMS_VERSION — every account must have accepted this version. THE
//    SERVER ENFORCES IT (Josh, Sep 2026: "make sure there are no ways around
//    it"): the router refuses every ordinary route with 403 `terms_required`
//    until the current version is on the account, and the four WebSocket
//    doors refuse the upgrade — so a curl session, a modified client or an
//    old bundle can't use the service without agreeing any more than the
//    real client can. The client's TermsGate is the way to say yes, not the
//    thing standing in the way. Registration records acceptance when the
//    sign-up form's box is ticked; an account registered without it exists
//    but can do nothing except read itself, accept, sign out, or delete.
//    Bump it when the Terms/Guidelines/Privacy change MATERIALLY (a typo fix
//    is not a new version; a new rule is) — every account is re-prompted,
//    and every open session is refused until it agrees.
//  · HOSTING_VERSION — the agreement a satellite host accepts when they
//    redeem a provisioning key. The hub refuses to register a satellite
//    whose key has no acceptance on file and whose register call doesn't
//    carry one (`hosting_agreement_required`), AND refuses the rendezvous
//    handshake of any satellite row without the current version on it (a
//    pre-agreement row, or a bump). A host whose row is behind re-accepts by
//    redeeming a ROTATION key in the ordinary setup form — same satellite
//    id, fresh acceptance — so bumping this needs no new machinery.
//
// Acceptance is EVIDENCE, so it is a ledger row (who, which version, when,
// from where), not just a flag — see migration 86.

import type { User } from "./types";

export const TERMS_VERSION = 2;
export const HOSTING_VERSION = 1;

/** True when this account may not use the service until it accepts the
 *  current Terms. Sterling never signs anything, and the house doesn't sign
 *  its own paper: the Terms are a contract between a member and the
 *  Operator, so the admin account (the Operator) is not a party to it. */
export function termsOutstanding(user: Pick<User, "isBot" | "isAdmin" | "termsVersion">): boolean {
  return !user.isBot && !user.isAdmin && user.termsVersion !== TERMS_VERSION;
}

/** The routes an account may reach BEFORE accepting: read itself (so the
 *  gate knows what to show), accept, sign out, the shell's exit beacon, and
 *  the account deletion the Terms name as the alternative to agreeing.
 *  Keyed "METHOD /path" on the route's registered pattern. */
export const TERMS_EXEMPT_ROUTES = new Set([
  "GET /api/me",
  "POST /api/me/accept-terms",
  "POST /api/logout",
  "POST /api/presence/exit",
  "POST /api/me/delete",
]);

/** Where the documents live, relative to the site root. */
export const LEGAL_URLS = {
  index: "/legal/index.html",
  terms: "/legal/terms.html",
  guidelines: "/legal/guidelines.html",
  privacy: "/legal/privacy.html",
  hosting: "/legal/hosting.html",
  copyright: "/legal/copyright.html",
} as const;
