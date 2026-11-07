# Aboard design: mission control

Aboard's interface borrows the language of aerospace mission control: austere, engineered and black. It started from an analysis of SpaceX's site in [awesome-design-md](https://github.com/VoltAgent/awesome-design-md/tree/main/design-md/spacex), adapted for an app. The planet is the hero, the way rocket photography is on that site. The chrome stays out of its way.

The tokens live in `web/src/styles.css` and the components in `web/src/ui.tsx`.

## Principles

- **One canvas: black.** The Earth imagery supplies every colour. The chrome has no brand accent, no gradients and no drop shadows. Every panel frosts the world behind it (a 24px blur under 55% black), so text reads over lines, labels and city lights.
- **Hairlines, not shadows.** Panels are frosted black (`rgb(0 0 0 / .55)` with a backdrop blur) over the globe with a 1px `#3a3a3f` border and a 4px radius. Rows inside them are split by `#26262a` rules.
- **Type does the work.**
  - **Titles** use Redaction 35 in normal case, with slightly tight tracking and leading. Its bitmap-cut edges give the techno feel.
  - **Everything else** uses Barlow, a DIN-style engineering grotesk.
  - **Small labels, eyebrows, buttons and navigation** use Barlow capitals at 11–13px, tracked at `0.09em`.
- **Interactive means white.**
  - **Buttons** are ghost pills (32px radius, 1px white outline) that fill white on hover.
  - **Secondary buttons** have a hairline outline.
  - **Quiet buttons** are bare caps that underline on hover.
  - **Links** are underlined white.
- **Navigation floats over the world.** The Redaction wordmark and the caps nav sit directly on the imagery, with no bar behind them. On phones the nav becomes a black tab bar with a hairline above and an indicator over the active tab.
- **Status colour only carries meaning,** and always alongside text:
  - `--green` for boarding and success;
  - `--red` for errors and destructive actions;
  - `--orange` for warnings;
  - `--blue` for information.
- **One bit of motion.** A pulsing dot marks the live board label, and it stops when the user prefers reduced motion.

## In the 3D world

- **Rail lines** are cool white (`#c8ccd6`). Hovering or selecting a line turns it pure white and thicker.
- **Station labels** are tracked white caps with a dark halo, so they read on any terrain.
- **Trains** keep their realistic livery: a red locomotive and silver carriages. They are objects in the world, not chrome.

## Accessibility

- **Increase Contrast** (`prefers-contrast: more`) brightens secondary text and hairlines and makes panels fully opaque.
- **Contrast:** text is white or at least 66% white on black, well above 4.5:1.
- **Touch targets:** buttons are 46px tall (small ones 34px) and tabs 48px or more.
- **Uppercase is CSS only** (`text-transform`). The underlying text stays in sentence case, so screen readers don't spell words out.
