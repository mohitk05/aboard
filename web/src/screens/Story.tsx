import { createPortal } from "react-dom";
import { useMe } from "../auth";
import { goodName, marketsFor, useCatalog, type Catalog } from "../game";
import { ButtonLink, Page } from "../ui";
import { useWorldFocus } from "../world3d/focus";
import { Shell } from "./Shell";

// How the world of Aboard came to be, told in eight chapters over old-master paintings. The
// paintings are public domain (via Wikimedia Commons); the files are in web/public/story.

interface Chapter {
  title: string;
  text: string;
  image: string;
  /** Width / height, so the page doesn't jump while images load. */
  ratio: number;
  alt: string;
  credit: { artist: string; work: string; year: string; place: string; source: string };
}

const commons = (file: string) => `https://commons.wikimedia.org/wiki/File:${file}`;

const CHAPTERS: Chapter[] = [
  {
    title: "Earth, 2190",
    text: "Twelve billion people. One tired planet. The cities had nowhere left to grow, and the summers nowhere left to go.",
    image: "/story/strip-1.webp",
    ratio: 1600 / 1171,
    alt: "A colossal spiralling tower crowded with builders rises over a packed harbour city.",
    credit: {
      artist: "Pieter Bruegel the Elder",
      work: "The Tower of Babel",
      year: "1563",
      place: "Kunsthistorisches Museum, Vienna",
      source: commons("Pieter_Bruegel_the_Elder_-_The_Tower_of_Babel_(Vienna)_-_Google_Art_Project.jpg"),
    },
  },
  {
    title: "The Exodus",
    text: "Those who could, left. Great arks carried part of humanity to new worlds among the stars, where there was still room to live. Billions stayed behind.",
    image: "/story/strip-2.webp",
    ratio: 1280 / 820,
    alt: "Radiant figures drift through a luminous valley of clouds, mountains and water: a new world in the sky.",
    credit: {
      artist: "John Martin",
      work: "The Plains of Heaven",
      year: "1851–53",
      place: "Tate Britain, London",
      source: commons("John_Martin_-_The_Plains_of_Heaven_-_Google_Art_Project.jpg"),
    },
  },
  {
    title: "The Accord of the Remaining",
    text: "Those who stayed swore to take the planet in hand: its climate, its economy, its every journey. No more waste. Flying and shipping, the most wasteful of all, were the first to go.",
    image: "/story/strip-3.webp",
    ratio: 1280 / 998,
    alt: "Three brothers raise their arms in an oath towards the swords their father holds up.",
    credit: {
      artist: "Jacques-Louis David",
      work: "The Oath of the Horatii",
      year: "1784",
      place: "Musée du Louvre, Paris",
      source: commons("Jacques-Louis_David_-_Oath_of_the_Horatii_-_Google_Art_Project.jpg"),
    },
  },
  {
    title: "The Thin Sky",
    text: "Then the sky itself turned. The great carbon scrubbers cooled the upper air until it thinned. Above three thousand metres, wings found nothing to hold, and the jet streams grew into walls of wind. Within a generation, nothing flew.",
    image: "/story/strip-4.webp",
    ratio: 960 / 1038,
    alt: "Icarus tumbles from the sky as his wax wings fail, while his father Daedalus looks on in horror.",
    credit: {
      artist: "Jacob Peter Gowy",
      work: "The Fall of Icarus",
      year: "c. 1636",
      place: "Museo del Prado, Madrid",
      source: commons("Gowy-icaro-prado.jpg"),
    },
  },
  {
    title: "The Wild Sea",
    text: "And the warmed oceans never calmed. Hundred-metre swells and storms without end swallowed the last ships, and one by one the harbours closed.",
    image: "/story/strip-5.webp",
    ratio: 1280 / 860,
    alt: "Shipwreck survivors cling to a broken mast as a towering wave rises in a glowing, stormy dawn.",
    credit: {
      artist: "Ivan Aivazovsky",
      work: "The Ninth Wave",
      year: "1850",
      place: "State Russian Museum, Saint Petersburg",
      source: commons("Hovhannes_Aivazovsky_-_The_Ninth_Wave_-_Google_Art_Project.jpg"),
    },
  },
  {
    title: "Steel across the World",
    text: "So humanity did what it does best: it built. Tunnels beneath the Atlantic and the Bering Strait, lines across the steppes and through the Andes. The Great Lines took two hundred years.",
    image: "/story/strip-6.webp",
    ratio: 1280 / 794,
    alt: "Workers haul a glowing iron bloom through the smoke and fire of a vast rolling mill.",
    credit: {
      artist: "Adolph Menzel",
      work: "The Iron Rolling Mill",
      year: "1875",
      place: "Alte Nationalgalerie, Berlin",
      source: commons("Adolph_Menzel_-_Eisenwalzwerk_-_Google_Art_Project.jpg"),
    },
  },
  {
    title: "Centuries Later",
    text: "Nobody remembers wings now. Trains cross continents in days, and the railway is simply how the world moves: its people, its goods, its fortunes.",
    image: "/story/strip-7.webp",
    ratio: 1280 / 956,
    alt: "A steam train rushes out of a blur of rain and golden light across a bridge.",
    credit: {
      artist: "J. M. W. Turner",
      work: "Rain, Steam and Speed",
      year: "1844",
      place: "National Gallery, London",
      source: commons("Turner_-_Rain,_Steam_and_Speed_-_National_Gallery_file.jpg"),
    },
  },
  {
    title: "Your Turn",
    text: "Berlin Hauptbahnhof is your home base. You have 5,000 credits and a ticket. Cocoa waits in Dakar, lithium in La Paz, polysilicon in Ürümqi. Build your industry, one train at a time.",
    image: "/story/strip-8.webp",
    ratio: 1250 / 1600,
    alt: "A traveller stands on a rocky summit, looking out over a sea of fog towards distant peaks.",
    credit: {
      artist: "Caspar David Friedrich",
      work: "Wanderer above the Sea of Fog",
      year: "c. 1818",
      place: "Hamburger Kunsthalle",
      source: commons("Caspar_David_Friedrich_-_Wanderer_above_the_sea_of_fog.jpg"),
    },
  },
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"];

export function Story() {
  const me = useMe().data;
  useWorldFocus({ label: "The Earth, seen from space", distance: 3.6 });
  const body = (
    <article className="story" aria-labelledby="story-title">
      <header className="story-head">
        <p className="eyebrow">The story so far</p>
        <h1 id="story-title">How the world came to ride the rails</h1>
      </header>
      {CHAPTERS.map((c, i) => (
        <section key={c.title} className={`chapter${i % 2 ? " is-flipped" : ""}`} aria-labelledby={`chapter-${i}`}>
          {/* As big as the column allows, but never taller than the screen: portraits stay whole. */}
          <figure className="chapter-art" style={{ aspectRatio: String(c.ratio), maxWidth: `calc(78vh * ${c.ratio})` }}>
            <img src={c.image} alt={c.alt} width={Math.round(c.ratio * 1000)} height={1000} loading={i < 2 ? "eager" : "lazy"} decoding="async" />
          </figure>
          <div className="chapter-text">
            <span className="chapter-n" aria-hidden="true">
              {ROMAN[i]}
            </span>
            <h2 id={`chapter-${i}`}>{c.title}</h2>
            <p>{c.text}</p>
            <p className="chapter-credit">
              <a href={c.credit.source} target="_blank" rel="noreferrer">
                {c.credit.artist}, <cite>{c.credit.work}</cite>, {c.credit.year}
              </a>
              . {c.credit.place}. Public domain.
            </p>
          </div>
        </section>
      ))}
      <Gameplay />
      {me ? (
        // Always within reach, so you can skip the story at any point (new players land here first).
        // Portalled to <body>: a blurred panel (backdrop-filter) would pin a fixed child to itself.
        createPortal(
          <div className="story-go">
            <ButtonLink to="/" kind="primary">
              Go to the game
            </ButtonLink>
          </div>,
          document.body,
        )
      ) : (
        <footer className="story-end">
          <ButtonLink to="/signup" kind="primary">
            I have an invite
          </ButtonLink>
        </footer>
      )}
    </article>
  );
  return me ? <Shell wide>{body}</Shell> : <Page wide>{body}</Page>;
}

const STEPS = ["Start in Berlin", "Ride out by train", "Buy raw materials", "Bring them home", "Build and produce", "Sell, and grow"];

/** How to play, in titles: the loop, then the three industries and where their materials are. */
function Gameplay() {
  const catalog = useCatalog().data;
  return (
    <section className="gameplay" aria-labelledby="gameplay-title">
      <header className="story-head">
        <p className="eyebrow">How to play</p>
        <h2 id="gameplay-title">Gameplay</h2>
      </header>

      <ol className="gameplay-steps">
        {STEPS.map((title, i) => (
          <li key={title}>
            <span className="step-n" aria-hidden="true">
              {i + 1}
            </span>
            <h3>{title}</h3>
          </li>
        ))}
      </ol>

      {catalog && <Industries catalog={catalog} />}
    </section>
  );
}

/** "Lusaka Central" → "Lusaka", "New York Central Terminal" → "New York": drop the generic words. */
const place = (station: string) => station.replace(/\s+(Central|Station|Terminal|Terminus|Railway)\b/g, "").trim();

function Industries({ catalog }: { catalog: Catalog }) {
  return (
    <div className="gameplay-industries">
      <h3>The three industries</h3>
      <div className="industry-grid">
        {catalog.industries.map((ind) => {
          return (
            <article key={ind.id} className="industry-card">
              <h4>{ind.name}</h4>
              <ul>
                {Object.keys(ind.recipe.inputs).map((good) => {
                  const where = marketsFor(catalog, good, "sells").map((m) => place(m.stop.name));
                  return (
                    <li key={good}>
                      <strong>{goodName(catalog.goods, good)}</strong>{" "}
                      <span className="muted">{where.length ? where.join(", ") : "not sold anywhere yet"}</span>
                    </li>
                  );
                })}
              </ul>
            </article>
          );
        })}
      </div>
    </div>
  );
}
