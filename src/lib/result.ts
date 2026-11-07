/**
 * World methods are called over Durable Object RPC. Custom error classes don't survive
 * RPC, so methods return a Result and the Worker turns it into an HTTP response.
 */
export type Result<T> = { ok: true; data: T } | { ok: false; status: 400 | 403 | 404 | 409; error: string };

export class GameError extends Error {
  constructor(
    public status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new GameError(404, `${what} not found.`);
export const badRequest = (msg: string) => new GameError(400, msg);
export const forbidden = (msg = "Not allowed.") => new GameError(403, msg);
export const conflict = (msg: string) => new GameError(409, msg);

/** Run fn; turn GameErrors into a failed Result. Anything else is a real bug and is rethrown. */
export function guard<T>(fn: () => T): Result<T> {
  try {
    return { ok: true, data: fn() };
  } catch (e) {
    if (e instanceof GameError) return { ok: false, status: e.status, error: e.message };
    throw e;
  }
}
