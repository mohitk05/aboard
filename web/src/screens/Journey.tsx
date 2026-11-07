import type { Journey as JourneyData } from "../api";
import { Board } from "../ui";

export function Journey({ journey }: { journey: JourneyData }) {
  return <Board label="On board" title={`${journey.from.name} → ${journey.to.name}`} sub={journey.line} />;
}
