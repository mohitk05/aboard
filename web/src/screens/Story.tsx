import type { ReactNode } from "react";
import { useMe } from "../auth";
import { ButtonLink, Page } from "../ui";
import { useWorldFocus } from "../world3d/focus";
import { Shell } from "./Shell";
import { ComicDefs } from "./story/art";
import {
  Strip1,
  Strip2,
  Strip3,
  Strip4,
  Strip5,
  Strip6,
  Strip7,
  Strip8,
} from "./story/strips";

/** One horizontal strip of the comic: a numbered title and its panels. */
function Strip({ n, title, cols, children }: { n: number; title: string; cols: number; children: ReactNode }) {
  return (
    <section className="strip" aria-labelledby={`strip-${n}`}>
      <h2 id={`strip-${n}`} className="strip-title">
        <span className="strip-n">{n}</span> {title}
      </h2>
      <div className="strip-panels" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
        {children}
      </div>
    </section>
  );
}

/** How the world of Aboard came to be: an action comic in eight strips. */
export function Story() {
  const me = useMe().data;
  useWorldFocus({ label: "The Earth, seen from space", distance: 3.6 });
  const body = (
    <article className="story" aria-labelledby="story-title">
      <ComicDefs />
      <header className="story-head">
        <p className="eyebrow">The story so far</p>
        <h1 id="story-title">How the world came to ride the rails</h1>
      </header>
      <Strip n={1} title="Earth, 2190" cols={3}>
        <Strip1 />
      </Strip>
      <Strip n={2} title="The Exodus" cols={3}>
        <Strip2 />
      </Strip>
      <Strip n={3} title="The Accord of the Remaining" cols={3}>
        <Strip3 />
      </Strip>
      <Strip n={4} title="The Thin Sky" cols={3}>
        <Strip4 />
      </Strip>
      <Strip n={5} title="The Wild Sea" cols={3}>
        <Strip5 />
      </Strip>
      <Strip n={6} title="Steel across the world" cols={3}>
        <Strip6 />
      </Strip>
      <Strip n={7} title="Centuries later" cols={3}>
        <Strip7 />
      </Strip>
      <Strip n={8} title="Your turn" cols={3}>
        <Strip8 />
      </Strip>
      <footer className="story-end">
        {me ? (
          <ButtonLink to="/business" kind="primary">
            Build your business
          </ButtonLink>
        ) : (
          <ButtonLink to="/signup" kind="primary">
            Get a ticket
          </ButtonLink>
        )}
      </footer>
    </article>
  );
  return me ? <Shell wide>{body}</Shell> : <Page wide>{body}</Page>;
}
