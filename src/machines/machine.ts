import { GameError } from "../lib/result";

// A tiny state-machine kit: a machine is a typed table of states, the events each state accepts
// and where they lead, and, for every event a state refuses, the message to show. No runtime
// dependencies, so the Worker, the World and the web app all share the same definitions.
//
// Why tables: the rules of the game live in one readable place (here), every guard in the code
// asks the table instead of re-deriving conditions, refusals always carry the same wording, and
// docs/StateMachines.md is generated from these tables (`npm run machines`), so the diagrams
// can't drift from the code.

export interface MachineDef<S extends string, E extends string> {
  /** Short name, used as the heading in the generated docs. */
  name: string;
  /** What this machine is, in a sentence or two (for the docs). */
  about: string;
  /** Where its state lives (for the docs), e.g. "users.state". */
  stored: string;
  initial: S;
  states: Record<S, { about: string; on?: Partial<Record<E, S>> }>;
  events: Record<E, string>;
  /**
   * Why an event isn't allowed: per state, or one message for every state that refuses it.
   * `status` defaults to 409 (Conflict).
   */
  refusals?: Partial<Record<E, string | Partial<Record<S, string | { status: 400 | 403 | 404 | 409; message: string }>>>>;
}

export interface Machine<S extends string, E extends string> {
  def: MachineDef<S, E>;
  /** The state `event` leads to from `state`, or null if it isn't allowed. */
  next(state: S, event: E): S | null;
  can(state: S, event: E): boolean;
  /**
   * Like next(), but throws the machine's refusal (a GameError) if the event isn't allowed.
   * `say` overrides the refusal message for particular states (e.g. to name the thing refused).
   */
  expect(state: S, event: E, say?: Partial<Record<S, string>>): S;
  /** Every event `state` accepts. */
  accepts(state: S): E[];
}

export function machine<S extends string, E extends string>(def: MachineDef<S, E>): Machine<S, E> {
  const next = (state: S, event: E): S | null => def.states[state]?.on?.[event] ?? null;
  const refuse = (state: S, event: E): GameError => {
    const r = def.refusals?.[event];
    const specific = typeof r === "string" ? r : r?.[state];
    if (specific && typeof specific === "object") return new GameError(specific.status, specific.message);
    return new GameError(409, specific ?? `Can't ${def.events[event]?.toLowerCase() ?? event} now.`);
  };
  return {
    def,
    next,
    can: (state, event) => next(state, event) !== null,
    expect(state, event, say) {
      const to = next(state, event);
      if (to !== null) return to;
      const err = refuse(state, event);
      throw say?.[state] ? new GameError(err.status, say[state]!) : err;
    },
    accepts: (state) => Object.keys(def.states[state]?.on ?? {}) as E[],
  };
}

/** The machine as a Mermaid state diagram (for docs/StateMachines.md). */
export function mermaid<S extends string, E extends string>(m: Machine<S, E>): string {
  const lines = ["stateDiagram-v2", `  [*] --> ${m.def.initial}`];
  for (const [from, s] of Object.entries(m.def.states) as [S, { on?: Partial<Record<E, S>> }][]) {
    for (const [event, to] of Object.entries(s.on ?? {}) as [E, S][]) lines.push(`  ${from} --> ${to}: ${event}`);
  }
  return lines.join("\n");
}
