// Regenerate docs/StateMachines.md from the state machines in src/machines/. Usage: npm run machines
import { writeFileSync } from "node:fs";
import { renderMachinesDoc } from "../src/machines/index";

writeFileSync(new URL("../docs/StateMachines.md", import.meta.url), renderMachinesDoc() + "\n");
console.log("wrote docs/StateMachines.md");
