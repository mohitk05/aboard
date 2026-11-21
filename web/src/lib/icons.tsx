// Aboard's icon set: thin outlines with rounded ends, one stroke weight, drawn on a 24-unit grid.
// Every icon in the app comes from here so they look like one family (docs/PRD.md §7).

const PATHS = {
  wheat: <><path d="M12 22V4" /><path d="M12 9 7.5 5M12 9l4.5-4" /><path d="M12 14 7.5 10M12 14l4.5-4" /><path d="M12 19l-4.5-4M12 19l4.5-4" /></>,
  salt: <><path d="M8 3h8v3H8z" /><path d="M7 6h10l-1 14a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1z" /><path d="M10 10h.01M14 10h.01M12 13h.01M10 16h.01M14 16h.01" /></>,
  yeast: <><rect x="6" y="9" width="12" height="12" rx="2" /><path d="M8 9V6h8v3" /><path d="M9 15c1-1 2 1 3 0s2 1 3 0" /></>,
  oven: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18" /><path d="M7 6.5h.01M10 6.5h.01" /><rect x="6" y="11.5" width="12" height="6" rx="1" /></>,
  loaf: <><path d="M4 14c0-4 3-7 8-7s8 3 8 7v3H4z" /><path d="M9 10l1.5 3M12 9.5l1.5 3.5M15 10l1.5 3" /></>,
  pin: <><path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>,
  train: <><rect x="5" y="3" width="14" height="14" rx="3" /><path d="M5 11h14" /><path d="M9 14h.01M15 14h.01" /><path d="M8 21l2-4M16 21l-2-4" /></>,
  coin: <><circle cx="12" cy="12" r="9" /><path d="M12 6.5v11M9.5 9.5c0-1 1-1.6 2.5-1.6s2.5.7 2.5 1.7c0 2.2-5 1.4-5 3.7 0 1 1 1.7 2.5 1.7s2.5-.7 2.5-1.7" /></>,
  people: <><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><circle cx="17" cy="9" r="2.4" /><path d="M17 14c2.5 0 4.5 2 4.5 4.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  drop: <path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" />,
  box: <><path d="M3 8l9-5 9 5v9l-9 5-9-5z" /><path d="M3 8l9 5 9-5M12 13v9" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
} as const;

export type IconName = keyof typeof PATHS;

/** Decorative by default (the words next to it say what it is). */
export function Icon({ name, large }: { name: IconName; large?: boolean }) {
  return (
    <svg className={`icon${large ? " icon-large" : ""}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
