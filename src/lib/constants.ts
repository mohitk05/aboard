/** How often the world advances, in minutes. Each Durable Object alarm runs one tick. */
export const WORLD_INTERVAL_MINUTES = 5;
export const WORLD_INTERVAL_MS = WORLD_INTERVAL_MINUTES * 60_000;

/**
 * Average speed (km/h) of a new train over a whole run, curves and slow sections included
 * (station stops are counted separately). Assumes railways a little ahead of today's: high-speed
 * lines cruise at 320–350 km/h now, and maglev expresses reach 450–500.
 */
export const DEFAULT_SPEED_KMH = 300;

/** Sensible bounds for a train's average speed. */
export const MIN_SPEED_KMH = 40;
export const MAX_SPEED_KMH = 600;

/** How long a train waits at a stop unless the stop says otherwise. */
export const DEFAULT_DWELL_MINUTES = 20;

/** Rails are never straight: great-circle distance times this is roughly the track distance. */
export const RAIL_DETOUR_FACTOR = 1.25;

export const COST_PER_KM = 0.01;

export const TRIP_STATES = ["MOVING", "STATIONARY", "IDLE"] as const;
export type TripState = (typeof TRIP_STATES)[number];

export const USER_STATES = ["ATSTATION", "READYTOGO", "ONBOARD"] as const;
export type UserState = (typeof USER_STATES)[number];

export const USER_ROLES = { ADMIN: 1, PLAYER: 2 } as const;
export type UserRole = (typeof USER_ROLES)[keyof typeof USER_ROLES];
export const ALL_USER_ROLES: UserRole[] = [USER_ROLES.ADMIN, USER_ROLES.PLAYER];

export const PROFILE_MODES = ["PUBLIC", "PRIVATE"] as const;
export type ProfileMode = (typeof PROFILE_MODES)[number];
