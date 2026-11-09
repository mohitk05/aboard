import { machine } from "./machine";

/**
 * A signup invite. Not stored as a column: derived from the invites row (used_by / used_at,
 * revoked_at, expires_at) by inviteState().
 */
export const INVITE_STATES = ["OPEN", "USED", "REVOKED", "EXPIRED"] as const;
export type InviteState = (typeof INVITE_STATES)[number];
export type InviteEvent = "claim" | "revoke" | "expire";

export const invite = machine<InviteState, InviteEvent>({
  name: "Invite",
  about: "A one-time signup code an admin shares as a link. Aboard is invite-only.",
  stored: "derived from invites (used_by/used_at = USED, revoked_at = REVOKED, expires_at in the past = EXPIRED)",
  initial: "OPEN",
  states: {
    OPEN: { about: "Can be used to sign up, once.", on: { claim: "USED", revoke: "REVOKED", expire: "EXPIRED" } },
    USED: { about: "Someone signed up with it (shown to admins with their username)." },
    REVOKED: { about: "An admin withdrew it.", on: { revoke: "REVOKED" } },
    EXPIRED: { about: "Its time ran out unused.", on: { revoke: "REVOKED" } },
  },
  events: {
    claim: "Sign up with it",
    revoke: "An admin withdraws it",
    expire: "Its expiry passes",
  },
  refusals: {
    claim: { USED: "That invite has already been used.", REVOKED: "That invite has been withdrawn.", EXPIRED: "That invite has expired." },
    revoke: { USED: "That invite has already been used." },
  },
});

export interface InviteRow {
  used_by: string | null;
  used_at: number | null;
  revoked_at: number | null;
  expires_at: number | null;
}
/** The state of an invite row at time `now`. (Used beats revoked beats expired.) */
export function inviteState(r: InviteRow, now: number): InviteState {
  if (r.used_by || r.used_at) return "USED";
  if (r.revoked_at) return "REVOKED";
  if (r.expires_at && r.expires_at < now) return "EXPIRED";
  return "OPEN";
}
