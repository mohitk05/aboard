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

## Onboarding and tutorial screens

Rules for the new-player tutorial (`web/src/screens/Onboarding.tsx`, styles under `.onb-*` in `web/src/styles.css`; the product side is in [PRD.md](PRD.md) §7). Screens 1 to 6 are built and approved: [onboarding/screens-1-6.png](onboarding/screens-1-6.png). Screens 7 to 12 are a draft: [onboarding/screens-7-12-draft.png](onboarding/screens-7-12-draft.png). Most of these rules came from review of the screens, one fix at a time, so treat them as agreed.

### The frame (the same on every screen)

- **Header:** the wordmark on the left and "Step n of N" on the right, with a strip of N segments underneath. They are always in the same place.
- **One step per screen,** and the label and the strip must agree. The strip fills one segment per screen, so the last screen shows every segment filled. (A fault found in review: four screens said "Step 1 of 6". Check every screen's label before showing a set.)
- **No tab bar** during the tutorial. It is a guided flow, not the main app.
- **The world stays behind the panel** on every screen after the story. The camera points at what the screen is about (home, or the line to a town), the line is lit as when hovered, and the stations are named. Keep the stations in the open map above the panel, clear of the header and strip.

### Panels and actions

- **One panel height across a run of screens** (screens 4 to 6 today, and 7 to 12 in the draft). The panel top, the first line of text and the headline sit at the same height from screen to screen, so the eye doesn't have to search. The height is that of the tallest screen. Content is top-aligned, and any extra space falls above the action. Where a screen has little to show, fill the space with something useful (screen 5 lists all three towns), not blank.
- **The action lives inside the panel,** bottom right, under a hairline: one filled white pill, 176 × 44 on every screen whatever the label says. A quiet caps link sits at the bottom left ("Skip tutorial", "Wait"). The story screens have no panel, so their action bar sits at the bottom of the screen in the same place.
- **The tutorial button is always filled.** Elsewhere in the app, primary buttons are ghost pills that fill on hover (see Principles); the tutorial's one action is filled so it is never mistaken for a secondary one.
- **Never style a card as selected unless it is.** A white border on the bakery box made it look chosen, and nothing about it was interactive. Emphasis is reserved for things that are interactive or current.

### Icons

- **One set, one style:** thin outlines, round caps and joins, a 24-unit grid and a 1.6 stroke, in `web/src/lib/icons.tsx`. Every icon in the app comes from there so they look like one family.
- **Outline only.** Shapes that read as filled at small sizes (the first grain icon) are redrawn as open lines.
- **Today's set:** wheat, salt, yeast, oven, loaf, pin, train, coin, people, clock, drop, box, check. Icons are decorative; the words beside them say what they are.

### Colour and emphasis

- **Red means urgency,** such as a town's countdown and the live dot beside it. It is used on the mission and need screens and nowhere else. The lit route stays white.
- **White carries everything else.** Green is only for "done".

### Copy

- **Say why before asking.** A screen that asks the player to do something must give the reason on the same screen: the first train goes to Warsaw because Berlin has no grain and Warsaw sells it. (A fault found in review: the first version sent the player to the town in need with nothing to take.)
- **One idea per screen.** Headline, one line of support, then the thing to do.
- **Real data over invented where possible,** and flag what is a stand-in. The towns and their figures are the tutorial's own until the game has towns that run out of things.
- **Credit the paintings.** The story screens carry a small credit line under the text. They are public domain, but the credit stays.

### Checks before showing a set of screens

1. Step labels and strips agree on every screen.
2. Panel tops, headlines and actions line up across the run.
3. Every action is the same size and in the same place.
4. Nothing looks selected that isn't.
5. Every icon is from the shared set and is an outline.
6. Each screen says why it asks what it asks.
7. Screenshots are taken from the real app at phone size (`SHOTS=<dir> npm run e2e -- onboarding` saves one per screen), not from a mockup, and checked against the mockup.

## Accessibility

- **Increase Contrast** (`prefers-contrast: more`) brightens secondary text and hairlines and makes panels fully opaque.
- **Contrast:** text is white or at least 66% white on black, well above 4.5:1.
- **Touch targets:** buttons are 46px tall (small ones 34px) and tabs 48px or more.
- **Uppercase is CSS only** (`text-transform`). The underlying text stays in sentence case, so screen readers don't spell words out.
