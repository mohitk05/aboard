import { camera } from "./camera";
import { factory } from "./factory";
import { invite } from "./invite";
import { live } from "./live";
import { mermaid, type Machine } from "./machine";
import { train } from "./train";
import { traveller } from "./traveller";

/** Every state machine in the app: the game's (server) first, then the web app's. */
export const MACHINES = [traveller, train, factory, invite, live, camera] as Machine<string, string>[];

/** docs/StateMachines.md, generated from the machines (npm run machines). */
export function renderMachinesDoc(): string {
  const out = [
    "# State machines",
    "",
    "<!-- Generated from src/machines/ by `npm run machines`. Don't edit by hand: a test fails if this drifts from the code. -->",
    "",
    "Every part of Aboard that moves through states is modelled as an explicit state machine in `src/machines/`: a typed table of states, the events each state accepts and where they lead, and the message for each event a state refuses. The server and the web app both use these tables, so a rule (and its wording) lives in one place.",
    "",
    "To change a rule: edit the machine, run `npm run machines` to regenerate this page, and run the tests (`test/machines.test.ts` checks every machine is well-formed).",
    "",
    "- **In code:** `machine.expect(state, event)` returns the next state or throws the refusal as a `GameError` (HTTP 409 unless the table says otherwise); `machine.can(state, event)` asks without throwing; `machine.accepts(state)` lists what a state allows.",
    "",
  ];
  for (const m of MACHINES) {
    const d = m.def;
    out.push(`## ${d.name}`, "", d.about, "", `**Stored in:** ${d.stored}`, "", "```mermaid", mermaid(m), "```", "");
    out.push("| State | Meaning | Accepts |", "| --- | --- | --- |");
    for (const [s, def] of Object.entries(d.states)) {
      const accepts = m.accepts(s);
      out.push(`| \`${s}\` | ${def.about} | ${accepts.length ? accepts.map((e) => `\`${e}\` → \`${m.next(s, e)}\``).join(", ") : "nothing (final)"} |`);
    }
    out.push("", "| Event | When |", "| --- | --- |");
    for (const [e, about] of Object.entries(d.events)) out.push(`| \`${e}\` | ${about} |`);
    const refusals = Object.entries(d.refusals ?? {});
    if (refusals.length) {
      out.push("", "Refusals (what the player is told):", "");
      for (const [e, r] of refusals) {
        if (typeof r === "string") out.push(`- \`${e}\`: "${r}"`);
        else
          for (const [s, msg] of Object.entries(r as Record<string, string | { status: number; message: string }>))
            out.push(`- \`${e}\` in \`${s}\`: "${typeof msg === "string" ? msg : `${msg.message}" (HTTP ${msg.status})`}${typeof msg === "string" ? '"' : ""}`);
      }
    }
    out.push("");
  }
  return out.join("\n").replace(/""\n/g, '"\n');
}
