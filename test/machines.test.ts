import { describe, expect, it } from "vitest";
import doc from "../docs/StateMachines.md?raw";
import { MACHINES, renderMachinesDoc } from "../src/machines";
import { GameError } from "../src/lib/result";
import { factory, factoryState } from "../src/machines/factory";
import { invite, inviteState } from "../src/machines/invite";
import { dueAt, kmIntoSegment, minutesWaited, positionStatus, stationStatus, train } from "../src/machines/train";
import { canTrade, traveller } from "../src/machines/traveller";

const ALL = MACHINES;

const refusal = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    if (e instanceof GameError) return { status: e.status, message: e.message };
    throw e;
  }
  throw new Error("expected a refusal");
};

describe("every machine", () => {
  it.each(ALL.map((m) => [m.def.name, m] as const))("%s: transitions only lead to real states, and every event is described", (_, m) => {
    const states = Object.keys(m.def.states);
    expect(states).toContain(m.def.initial);
    for (const s of states) {
      for (const [event, to] of Object.entries(m.def.states[s]!.on ?? {})) {
        expect(states, `${s} --${event}--> ${to}`).toContain(to);
        expect(m.def.events[event], `event ${event} has a description`).toBeTruthy();
      }
    }
    // Every state can be reached from the initial one.
    const seen = new Set([m.def.initial]);
    for (let grew = true; grew; ) {
      grew = false;
      for (const s of [...seen]) for (const to of Object.values(m.def.states[s]!.on ?? {})) if (!seen.has(to!)) (seen.add(to!), (grew = true));
    }
    expect([...seen].sort()).toEqual([...states].sort());
  });
});

describe("traveller", () => {
  it("follows a journey: buy, board, ride, arrive", () => {
    let s = traveller.expect("ATSTATION", "buy_ticket");
    expect(s).toBe("READYTOGO");
    s = traveller.expect(s, "board");
    s = traveller.expect(s, "pass_station");
    expect(traveller.expect(s, "arrive")).toBe("ATSTATION");
  });

  it("refuses with the same words the API has always used", () => {
    expect(refusal(() => traveller.expect("READYTOGO", "buy_ticket"))).toEqual({ status: 409, message: "You already have a ticket." });
    expect(refusal(() => traveller.expect("ATSTATION", "cancel_ticket"))).toEqual({ status: 404, message: "Ticket not found." });
    expect(refusal(() => traveller.expect("ONBOARD", "cancel_ticket")).message).toBe("You can only cancel before boarding.");
    expect(refusal(() => traveller.expect("ONBOARD", "trade")).message).toBe("You can only trade at a station, not on the train.");
    expect(refusal(() => traveller.expect("READYTOGO", "move")).message).toBe("They have a ticket; they can't be moved now.");
  });

  it("lets you trade anywhere but on a train", () => {
    expect([canTrade("ATSTATION"), canTrade("READYTOGO"), canTrade("ONBOARD")]).toEqual([true, true, false]);
  });
});

describe("train", () => {
  const at = (stop_index: number, state: "IDLE" | "STATIONARY" | "MOVING", active = 1) => ({ stop_index, state, active, progress: 7 });

  it("knows where it is relative to a station", () => {
    expect(stationStatus(at(1, "MOVING"), 3)).toBe("approaching");
    expect(stationStatus(at(3, "STATIONARY"), 3)).toBe("at-platform");
    expect(stationStatus(at(3, "MOVING"), 3)).toBe("departed");
    expect(stationStatus(at(4, "STATIONARY"), 3)).toBe("departed");
    expect(stationStatus(at(3, "IDLE", 0), 3)).toBe("not-running");
    // By position alone, a stopped train standing at the station is there, not gone.
    expect(positionStatus(at(3, "IDLE", 0), 3)).toBe("at-platform");
    expect([dueAt(at(1, "MOVING"), 3), dueAt(at(3, "STATIONARY"), 3), dueAt(at(3, "MOVING"), 3)]).toEqual([true, true, false]);
  });

  it("reads progress by state: km while moving, minutes while standing", () => {
    expect([kmIntoSegment(at(0, "MOVING")), minutesWaited(at(0, "MOVING"))]).toEqual([7, 0]);
    expect([kmIntoSegment(at(0, "STATIONARY")), minutesWaited(at(0, "STATIONARY"))]).toEqual([0, 7]);
  });

  it("refuses to start twice, or to be placed before it's running", () => {
    expect(refusal(() => train.expect("MOVING", "start")).message).toBe("Trip is already running.");
    expect(refusal(() => train.expect("IDLE", "place_between")).message).toBe("Start the trip first.");
    expect(train.expect("STATIONARY", "turn_around")).toBe("STATIONARY");
  });
});

describe("factory", () => {
  it("derives its state from the row and the time", () => {
    expect(factoryState(undefined, 100)).toBe("UNBUILT");
    expect(factoryState({ batch_ready_at: null }, 100)).toBe("IDLE");
    expect(factoryState({ batch_ready_at: 200 }, 100)).toBe("PRODUCING");
    expect(factoryState({ batch_ready_at: 100 }, 100)).toBe("READY");
  });

  it("runs one batch at a time, naming the industry when it says no", () => {
    expect(refusal(() => factory.expect("PRODUCING", "start_batch")).message).toBe("A batch is already in production.");
    expect(refusal(() => factory.expect("UNBUILT", "start_batch", { UNBUILT: "Build a chocolate factory first." })).message).toBe(
      "Build a chocolate factory first.",
    );
  });
});

describe("invite", () => {
  const row = { used_by: null, used_at: null, revoked_at: null, expires_at: null };
  it("derives its state: used beats revoked beats expired", () => {
    expect(inviteState(row, 10)).toBe("OPEN");
    expect(inviteState({ ...row, expires_at: 5 }, 10)).toBe("EXPIRED");
    expect(inviteState({ ...row, expires_at: 5, revoked_at: 3 }, 10)).toBe("REVOKED");
    expect(inviteState({ ...row, revoked_at: 3, used_by: "u", used_at: 2 }, 10)).toBe("USED");
  });

  it("can be claimed once", () => {
    expect(invite.expect("OPEN", "claim")).toBe("USED");
    expect(refusal(() => invite.expect("USED", "claim")).message).toBe("That invite has already been used.");
    expect(refusal(() => invite.expect("EXPIRED", "claim")).message).toBe("That invite has expired.");
  });
});

describe("docs/StateMachines.md", () => {
  it("matches the machines (run `npm run machines` after changing one)", () => {
    expect(doc).toBe(renderMachinesDoc() + "\n");
  });
});
