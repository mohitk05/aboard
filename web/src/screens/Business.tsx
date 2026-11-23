import { useEffect, useState } from "react";
import { useLocation } from "react-router";
import {
  amount,
  credits,
  goodName,
  marketsFor,
  MARKET_HALF_LIFE_HOURS,
  total,
  tradeTotal,
  useCatalog,
  useGame,
  useGameAction,
  useContracts,
  useLeaderboard,
  useOrderAction,
  useOrders,
  usePrices,
  type Catalog,
  type Contract,
  type GameState,
  type Industry,
  type Leaderboard,
  type Order,
  type PriceKnown,
  type Prices,
} from "../game";
import { useMe } from "../auth";
import { canTrade } from "../../../src/machines/traveller";
import { factoryState } from "../../../src/machines/factory";
import { formatAgo, formatClock, formatIn } from "../lib/format";
import { useNow } from "../lib/useNow";
import { Avatar, Badge, Board, Button, Card, FormError, Notice, SelectField, TextField } from "../ui";
import { useWorldFocus } from "../world3d/focus";
import { Shell } from "./Shell";

/** Your business: money, factories, warehouse, cargo, and where to buy and sell. */
export function Business() {
  const game = useGame();
  const catalog = useCatalog();
  const prices = usePrices();
  const g = game.data;
  const c = catalog.data;
  const p = prices.data;
  useWorldFocus({
    label: `Map around ${g?.home?.name ?? "Berlin"}, your home base`,
    highlight: g?.home ? [g.home.id] : [],
    center: g?.home?.coordinates ?? null,
    distance: 2.4,
  });

  return (
    <Shell>
      <Board
        label="Your business"
        title={g ? credits(g.balance) : "…"}
        sub={g ? `Home: ${g.home?.name ?? "Berlin"} · ${g.atHome ? "You're home" : "You're away"}` : undefined}
      />
      <FormError message={game.error?.message ?? catalog.error?.message} />
      {g && c && (
        <>
          <Standings catalog={c} />
          <Contracts catalog={c} game={g} />
          {c.industries.map((i) => (
            <IndustryCard key={i.id} industry={i} game={g} catalog={c} prices={p} />
          ))}
          <Warehouse game={g} catalog={c} />
          {p && <Telegraph catalog={c} prices={p} />}
          <Card aria-labelledby="where-title" role="region">
            <h2 id="where-title">Markets</h2>
            <p className="muted small">
              You only see what's paid right now where you are, and at home. Elsewhere it's what you saw when you last
              passed through (with how long ago), or the usual price if you've never been. Prices drift through the week,
              and every trade moves them for everyone: buying makes materials dearer, selling makes products cheaper. A
              market gets back half of the way every {MARKET_HALF_LIFE_HOURS} hours.
            </p>
            <h3>Buy materials</h3>
            <MarketTable catalog={c} prices={p} side="sells" />
            <h3>Sell products</h3>
            <MarketTable catalog={c} prices={p} side="buys" />
          </Card>
          {!!g.ledger.length && (
            <Card aria-labelledby="ledger-title" role="region">
              <h2 id="ledger-title">Ledger</h2>
              <ul className="list">
                {g.ledger.map((l, n) => (
                  <li key={n}>
                    <span>{l.note}</span>
                    <span className={`ledger-amount${l.amount > 0 ? " is-in" : ""}`}>
                      {l.amount === 0 ? "" : `${l.amount > 0 ? "+" : "−"}${credits(Math.abs(l.amount))}`}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}
    </Shell>
  );
}

/**
 * What a factory needs, and how much of it you have: in the warehouse (what counts for building and
 * producing), and with you (on its way home: unload it in Berlin).
 */
function Need({
  catalog,
  prices,
  need,
  have,
  carrying,
}: {
  catalog: Catalog;
  prices: Prices | undefined;
  need: Record<string, number>;
  have: Record<string, number>;
  carrying: Record<string, number>;
}) {
  return (
    <ul className="needs">
      {Object.entries(need).map(([good, n]) => {
        const got = have[good] ?? 0;
        const along = carrying[good] ?? 0;
        const covered = got < n && got + along >= n; // enough once you unload
        const where = marketsFor(catalog, good, "sells", prices)[0];
        return (
          <li key={good} className={got >= n ? "is-met" : covered ? "is-coming" : ""}>
            <span>
              <span aria-hidden="true">{got >= n ? "✓ " : ""}</span>
              {amount(catalog.goods, good, n)}
            </span>
            <span className="muted small">
              {Math.min(got, n)}/{n}
              {along > 0 ? ` · ${along} with you` : ""}
              {got + along < n && where ? ` · ${where.stop.name}, ${priceLabel(where)}` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function IndustryCard({ industry, game, catalog, prices }: { industry: Industry; game: GameState; catalog: Catalog; prices: Prices | undefined }) {
  const factory = game.factories.find((f) => f.industry === industry.id);
  const build = useGameAction<{ industry: string }>("build");
  const produce = useGameAction<{ industry: string }>("produce");
  const now = useNow(30_000);
  const has = (need: Record<string, number>) => Object.entries(need).every(([g, n]) => (game.warehouse[g] ?? 0) >= n);
  const hasWithCargo = (need: Record<string, number>) =>
    Object.entries(need).every(([g, n]) => (game.warehouse[g] ?? 0) + (game.cargo[g] ?? 0) >= n);
  const titleId = `industry-${industry.id}`;
  const anchor = `factory-${industry.id}`;
  const { recipe } = industry;

  // A link to /business#factory-chocolate (e.g. from a notification) scrolls to this box. The box
  // only exists once the page's data has loaded, and the app navigates without a page load, so
  // this runs when the box appears and whenever the link's hash changes.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === `#${anchor}`) document.getElementById(anchor)?.scrollIntoView({ block: "start" });
  }, [hash, anchor]);

  return (
    <Card id={anchor} aria-labelledby={titleId} role="region">
      <h2 id={titleId}>{industry.name}</h2>
      <p className="muted small">{industry.blurb}</p>
      {!factory ? (
        <>
          <h3>To build it</h3>
          <p className="small">
            {credits(industry.build.credits)} and these materials in your warehouse in {game.home?.name ?? "Berlin"}:
          </p>
          <Need catalog={catalog} prices={prices} need={industry.build.materials} have={game.warehouse} carrying={game.cargo} />
          <FormError message={build.error?.message} />
          <Button
            kind="primary"
            onClick={() => build.mutate({ industry: industry.id })}
            disabled={build.isPending || !game.atHome || game.balance < industry.build.credits || !has(industry.build.materials)}
          >
            Build the {industry.name.toLowerCase()}
          </Button>
          {!game.atHome && (
            <p className="muted small">
              {hasWithCargo(industry.build.materials)
                ? "You're carrying the rest. Unload it at home, then build."
                : "You can build when you're home."}
            </p>
          )}
        </>
      ) : factory.batch ? (
        <div className="trip-progress">
          <div className="trip-ends">
            {/* The same rule as the server (src/machines/factory.ts), re-judged as time passes. */}
            {factoryState({ batch_ready_at: factory.batch.readyAt }, now) === "READY" ? (
              <span>Ready: arriving in your warehouse</span>
            ) : (
              <>
                <span>In production</span>
                <span>Ready {formatClock(factory.batch.readyAt, now)}</span>
              </>
            )}
          </div>
          <div
            className="bar"
            role="progressbar"
            aria-label={`${industry.name} batch`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(
              (100 * Math.min(1, (now - factory.batch.startedAt) / (factory.batch.readyAt - factory.batch.startedAt))),
            )}
          >
            <span
              style={{
                width: `${Math.min(100, (100 * (now - factory.batch.startedAt)) / (factory.batch.readyAt - factory.batch.startedAt))}%`,
              }}
            />
          </div>
          <span className="muted small">
            {amount(catalog.goods, recipe.output, recipe.quantity)}, {formatIn(Math.max(0, factory.batch.readyAt - now))}.
          </span>
        </div>
      ) : (
        <>
          <p className="small">
            Running · {factory.batches} {factory.batches === 1 ? "batch" : "batches"} made. Each batch turns these into{" "}
            {amount(catalog.goods, recipe.output, recipe.quantity)} in {recipe.hours} hours:
          </p>
          <Need catalog={catalog} prices={prices} need={recipe.inputs} have={game.warehouse} carrying={game.cargo} />
          <FormError message={produce.error?.message} />
          <Button kind="primary" onClick={() => produce.mutate({ industry: industry.id })} disabled={produce.isPending || !has(recipe.inputs)}>
            Start a batch
          </Button>
        </>
      )}
    </Card>
  );
}

function Warehouse({ game, catalog }: { game: GameState; catalog: Catalog }) {
  const unload = useGameAction("unload");
  const load = useGameAction<{ good: string; qty: number }>("load");
  const carried = total(game.cargo);
  const stored = Object.entries(game.warehouse);
  return (
    <Card aria-labelledby="goods-title" role="region">
      <h2 id="goods-title">Goods</h2>
      <h3>Warehouse in {game.home?.name ?? "Berlin"}</h3>
      {stored.length ? (
        <ul className="list">
          {stored.map(([good, qty]) => (
            <li key={good}>
              <span>{amount(catalog.goods, good, qty)}</span>
              {game.atHome && carried < game.cargoCapacity && (
                <LoadButton good={good} max={Math.min(qty, game.cargoCapacity - carried)} onLoad={(q) => load.mutate({ good, qty: q })} name={goodName(catalog.goods, good)} />
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">Empty. Buy materials on your travels and unload them here.</p>
      )}
      <FormError message={load.error?.message} />

      <h3>
        With you · {carried}/{game.cargoCapacity}
      </h3>
      {carried ? (
        <ul className="list">
          {Object.entries(game.cargo).map(([good, qty]) => (
            <li key={good}>{amount(catalog.goods, good, qty)}</li>
          ))}
        </ul>
      ) : (
        <p className="muted small">You're not carrying anything.</p>
      )}
      {game.atHome && carried > 0 && (
        <Button onClick={() => unload.mutate()} disabled={unload.isPending}>
          Unload into the warehouse
        </Button>
      )}
      <FormError message={unload.error?.message} />
    </Card>
  );
}

function LoadButton({ good, max, name, onLoad }: { good: string; max: number; name: string; onLoad: (qty: number) => void }) {
  return (
    <Button small kind="quiet" onClick={() => onLoad(max)} aria-label={`Take ${max} ${name} with you`} data-good={good}>
      Take {max}
    </Button>
  );
}

function MarketTable({ catalog, prices, side }: { catalog: Catalog; prices: Prices | undefined; side: "sells" | "buys" }) {
  const goods = catalog.goods.filter((g) => (side === "sells" ? g.kind === "raw" : g.kind === "product"));
  return (
    <ul className="list market-list">
      {goods.map((g) => {
        const places = marketsFor(catalog, g.id, side, prices);
        return (
          <li key={g.id}>
            <span>{g.name}</span>
            <span className="muted small">
              {places.length ? places.map((p) => `${p.stop.name} ${priceLabel(p)}`).join(" · ") : "Nowhere in this world yet"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** How far trading has moved a price: " ↑3", " ↓5", or nothing. */
const moved = (by: number) => (by > 0 ? ` ↑${by}` : by < 0 ? ` ↓${-by}` : "");

/** A price as you know it: "14 cr ↑2" (live), "14 cr, 3 h ago" (seen), "usually 15 cr" (never seen). */
function priceLabel(p: PriceKnown, now = Date.now()) {
  if (p.known === "live") return `${p.price} cr${moved(p.moved)}`;
  if (p.known === "seen") return `${p.price} cr, ${formatAgo(p.seenAt!, now)}`;
  return `usually ${p.usual} cr`;
}

const stopName = (catalog: Catalog, id: string) => catalog.markets.find((m) => m.stop.id === id)?.stop.name ?? "somewhere";

/** Orders at a premium, for whoever delivers first. */
function Contracts({ catalog, game }: { catalog: Catalog; game: GameState }) {
  const board = useContracts();
  const now = useNow(60_000);
  const b = board.data;
  return (
    <Card aria-labelledby="contracts-title" role="region">
      <h2 id="contracts-title">Contracts</h2>
      <h3>From stations</h3>
      <p className="muted small">
        Orders at a premium, paid in full to whoever delivers it all first, at that station, before the deadline.
        Starter orders are for businesses that haven't built a factory yet.
      </p>
      <FormError message={board.error?.message} />
      {b && !b.open.length && <p className="muted small">No open orders right now. New ones come up as these are taken.</p>}
      {b && b.open.length > 0 && (
        <ul className="list contracts">
          {b.open.map((c) => (
            <ContractRow key={c.id} contract={c} catalog={catalog} game={game} now={now} />
          ))}
        </ul>
      )}
      {b && b.closed.length > 0 && (
        <>
          <h3>Lately</h3>
          <ul className="list">
            {b.closed.map((c) => (
              <li key={c.id}>
                <span className="small">
                  {amount(catalog.goods, c.good, c.qty)} to {stopName(catalog, c.stop)}
                </span>
                <span className="muted small">
                  {c.winner
                    ? `${c.winner.you ? "You" : (c.winner.username ?? "A private player")}${c.winner.bot ? " (bot)" : ""} delivered, ${credits(c.qty * c.price)}`
                    : "Nobody delivered in time"}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <PlayerOrders catalog={catalog} game={game} now={now} />
    </Card>
  );
}

/**
 * Orders between players: buy what you're missing, or sell what you have. They settle between
 * Berlin warehouses, so they work from anywhere.
 */
function PlayerOrders({ catalog, game, now }: { catalog: Catalog; game: GameState; now: number }) {
  const board = useOrders();
  const b = board.data;
  const theirs = b?.open.filter((o) => !o.mine) ?? [];
  const mine = b?.open.filter((o) => o.mine) ?? [];
  return (
    <>
      <h3>Between players</h3>
      <p className="muted small">
        Buy what you're missing, or sell what you have, at your price. Orders settle between Berlin warehouses, so you
        can trade from anywhere: what you sell must be in your warehouse (or with you, when you're home), and what you
        buy arrives there. Posting holds the credits or the goods until the order is filled, taken down or expires.
      </p>
      <FormError message={board.error?.message} />
      {b && !b.open.length && <p className="muted small">No orders between players yet. Post the first.</p>}
      {theirs.length > 0 && (
        <ul className="list orders">
          {theirs.map((o) => (
            <OrderRow key={o.id} order={o} catalog={catalog} game={game} now={now} />
          ))}
        </ul>
      )}
      {mine.length > 0 && (
        <>
          <h3>Your orders</h3>
          <ul className="list orders">
            {mine.map((o) => (
              <OrderRow key={o.id} order={o} catalog={catalog} game={game} now={now} />
            ))}
          </ul>
        </>
      )}
      <PostOrder catalog={catalog} game={game} />
    </>
  );
}

function OrderRow({ order: o, catalog, game, now }: { order: Order; catalog: Catalog; game: GameState; now: number }) {
  const fill = useOrderAction<{ qty: number }>("POST", `orders/${o.id}/fill`);
  const cancel = useOrderAction("DELETE", `orders/${o.id}`);
  const name = goodName(catalog.goods, o.good).toLowerCase();
  // What you could put in: goods you have in Berlin (to sell into a buy order), or credits (to buy).
  const inBerlin = (game.warehouse[o.good] ?? 0) + (game.atHome ? (game.cargo[o.good] ?? 0) : 0);
  const most = o.side === "buy" ? Math.min(o.remaining, inBerlin) : Math.min(o.remaining, Math.floor(game.balance / o.price));
  const [qty, setQty] = useState("");
  const n = Math.max(1, Math.min(most, Math.floor(Number(qty || most)) || 1));
  const who = o.mine ? "You" : `${o.by.username ?? "A private player"}${o.by.bot ? " (bot)" : ""}`;
  return (
    <li>
      <span>
        <strong>
          {who} {o.mine ? (o.side === "buy" ? "are buying" : "are selling") : o.side === "buy" ? "buys" : "sells"} {amount(catalog.goods, o.good, o.remaining)}
        </strong>
        <span className="muted small contract-terms">
          {o.price} cr each{o.remaining < o.qty ? ` · ${o.qty - o.remaining} of ${o.qty} done` : ""} · ends {formatIn(Math.max(0, o.expiresAt - now))}
        </span>
      </span>
      {o.mine ? (
        <Button small kind="quiet" onClick={() => cancel.mutate()} disabled={cancel.isPending}>
          Take down
        </Button>
      ) : most > 0 ? (
        <span className="row">
          <input
            className="input input-small"
            type="number"
            min={1}
            max={most}
            inputMode="numeric"
            aria-label={`How many ${name} to ${o.side === "buy" ? "sell" : "buy"}`}
            value={qty}
            placeholder={String(most)}
            onChange={(e) => setQty(e.target.value)}
          />
          <Button small kind="primary" onClick={() => fill.mutate({ qty: n })} disabled={fill.isPending}>
            {o.side === "buy" ? "Sell" : "Buy"} {n} · {credits(n * o.price)}
          </Button>
        </span>
      ) : (
        <span className="muted small">{o.side === "buy" ? `You have no ${name} in Berlin` : "You can't afford one"}</span>
      )}
      <FormError message={fill.error?.message ?? cancel.error?.message} />
    </li>
  );
}

/** Post an order to buy or sell. */
function PostOrder({ catalog, game }: { catalog: Catalog; game: GameState }) {
  const post = useOrderAction<{ side: "buy" | "sell"; good: string; qty: number; price: number; days: number }>("POST", "orders");
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [good, setGood] = useState(catalog.goods[0]?.id ?? "");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [days, setDays] = useState("3");
  // A sensible starting price: the usual price at the cheapest market selling it, or the best buying it.
  const usual = marketsFor(catalog, good, catalog.goods.find((g) => g.id === good)?.kind === "raw" ? "sells" : "buys")[0]?.usual ?? 1;
  const n = Math.max(1, Math.floor(Number(qty)) || 1);
  const p = Math.max(1, Math.floor(Number(price || usual)) || 1);
  const have = (game.warehouse[good] ?? 0) + (game.atHome ? (game.cargo[good] ?? 0) : 0);
  return (
    <form
      className="post-order"
      aria-label="Post an order"
      onSubmit={(e) => {
        e.preventDefault();
        post.mutate({ side, good, qty: n, price: p, days: Number(days) }, { onSuccess: () => (setQty("1"), setPrice("")) });
      }}
    >
      <h3>Post an order</h3>
      <div className="row">
        <SelectField label="I want to" value={side} onValue={(v) => setSide(v as "buy" | "sell")}>
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </SelectField>
        <SelectField label="Goods" value={good} onValue={(v) => (setGood(v), setPrice(""))}>
          {catalog.goods.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="row">
        <TextField label="How many" type="number" min={1} max={500} inputmode="numeric" value={qty} onValue={setQty} />
        <TextField label="Price each (cr)" type="number" min={1} inputmode="numeric" value={price} placeholder={String(usual)} onValue={setPrice} hint={`Usually about ${usual} cr`} />
        <SelectField label="For" value={days} onValue={setDays}>
          <option value="1">1 day</option>
          <option value="3">3 days</option>
          <option value="7">7 days</option>
        </SelectField>
      </div>
      <p className="muted small">
        {side === "buy"
          ? `Holds ${credits(n * p)} until it's filled; you have ${credits(game.balance)}.`
          : `Holds ${n} from Berlin until it's sold; you have ${have} there${game.atHome ? "" : " (goods you carry count when you're home)"}.`}
      </p>
      <FormError message={post.error?.message} />
      <Button kind="primary" disabled={post.isPending || (side === "buy" ? n * p > game.balance : n > have)}>
        Post the order
      </Button>
    </form>
  );
}

function ContractRow({ contract: c, catalog, game, now }: { contract: Contract; catalog: Catalog; game: GameState; now: number }) {
  const me = useMe().data;
  const deliver = useGameAction(`contracts/${c.id}/deliver`);
  const here = !!me && canTrade(me.state) && me.currentStop === c.stop;
  const have = (game.cargo[c.good] ?? 0) + (here && game.atHome ? (game.warehouse[c.good] ?? 0) : 0);
  const starterClosed = c.tier === "starter" && game.factories.length > 0;
  return (
    <li>
      <span>
        <strong>{amount(catalog.goods, c.good, c.qty)}</strong> to {stopName(catalog, c.stop)}
        {c.tier === "starter" && <Badge>Starter</Badge>}
        <span className="muted small contract-terms">
          {c.price} cr each · {credits(c.qty * c.price)} · due {formatIn(Math.max(0, c.expiresAt - now))}
          {starterClosed ? " · for new businesses" : ""}
        </span>
      </span>
      {here && !starterClosed && (
        <Button small kind="primary" onClick={() => deliver.mutate()} disabled={deliver.isPending || have < c.qty}>
          {have < c.qty ? `You have ${have}` : "Deliver"}
        </Button>
      )}
      <FormError message={deliver.error?.message} />
    </li>
  );
}

/** The telegraph: big price moves, without the numbers. */
function Telegraph({ catalog, prices }: { catalog: Catalog; prices: Prices }) {
  const now = useNow(60_000);
  if (!prices.news.length) return null;
  const raw = (good: string) => catalog.goods.find((g) => g.id === good)?.kind === "raw";
  return (
    <Card aria-labelledby="telegraph-title" role="region">
      <h2 id="telegraph-title">Telegraph</h2>
      <p className="muted small">Word of big price moves, from wherever there's been trading. No numbers: go and see.</p>
      <ul className="list">
        {prices.news.map((n) => (
          <li key={`${n.stop}:${n.good}:${n.direction}`}>
            <span className="small">
              {goodName(catalog.goods, n.good)}{" "}
              {raw(n.good) ? (n.direction === "up" ? "getting dearer" : "getting cheaper") : n.direction === "up" ? "fetching more" : "fetching less"} at{" "}
              {stopName(catalog, n.stop)}
            </span>
            <span className="muted small">{formatAgo(n.at, now)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/** Who's winning: what everyone earned trading this week, or everything they're worth. */
function Standings({ catalog }: { catalog: Catalog }) {
  const board = useLeaderboard();
  const [by, setBy] = useState<"week" | "netWorth">("week");
  const now = useNow(60_000);
  const b: Leaderboard | undefined = board.data;
  const rows = b ? [...b.players].sort((x, y) => y[by] - x[by] || y.netWorth - x.netWorth) : [];
  const industry = (id: string) => catalog.industries.find((i) => i.id === id)?.name.toLowerCase() ?? id;
  return (
    <Card aria-labelledby="standings-title" role="region">
      <h2 id="standings-title">Standings</h2>
      <p className="muted small">
        {by === "week"
          ? `Earned trading this week: sales, less materials and fares. A new week starts ${b ? formatIn(Math.max(0, b.weekEnds - now)) : "on Monday"}.`
          : "Net worth: credits, factories at what they cost to build, and goods at what they're worth."}
      </p>
      <div className="row" role="group" aria-label="Rank by">
        <Button small kind={by === "week" ? "primary" : "quiet"} aria-pressed={by === "week"} onClick={() => setBy("week")}>
          This week
        </Button>
        <Button small kind={by === "netWorth" ? "primary" : "quiet"} aria-pressed={by === "netWorth"} onClick={() => setBy("netWorth")}>
          Net worth
        </Button>
      </div>
      <FormError message={board.error?.message} />
      {rows.length > 0 && (
        <ol className="list standings">
          {rows.map((p, n) => (
            <li key={p.id ?? `private-${n}`} className={p.you ? "is-you" : ""}>
              <span>
                <span className="standing-rank">{n + 1}</span> <Avatar image={p.image} name={p.username ?? "?"} small />
                {p.username ?? "A private player"}
                {p.you && <span className="muted small"> · you</span>}
                {p.bot && <Badge>Bot</Badge>}
                <span className="muted small standing-factories">
                  {p.factories.length ? p.factories.map(industry).join(", ") : "No factories yet"}
                </span>
              </span>
              <span className={`ledger-amount${by === "week" && p[by] > 0 ? " is-in" : ""}`}>
                {p[by] < 0 ? "−" : ""}
                {credits(Math.abs(p[by]))}
              </span>
            </li>
          ))}
        </ol>
      )}
      {b?.lastWeek && (
        <p className="muted small">
          Last week: {b.lastWeek.you ? "you" : (b.lastWeek.username ?? "a private player")} earned the most, {credits(b.lastWeek.earned)}.
        </p>
      )}
    </Card>
  );
}

/** The market at the station you're at: buy what it sells, sell what it buys. */
export function MarketCard({ stopId }: { stopId: string }) {
  const catalog = useCatalog();
  const game = useGame();
  const prices = usePrices();
  const buy = useGameAction<{ good: string; qty: number }>("buy");
  const sell = useGameAction<{ good: string; qty: number }>("sell");
  // Live prices: you're here.
  const market = prices.data?.markets.find((m) => m.stop === stopId && m.live);
  const g = game.data;
  const [qty, setQty] = useState<Record<string, string>>({});
  if (!market || !g || !catalog.data) return null;
  const space = g.cargoCapacity - total(g.cargo);
  const goods = catalog.data.goods;
  const depth = (good: string) => goods.find((x) => x.id === good)?.depth ?? 1;
  const want = (good: string) => Math.max(1, Math.floor(Number(qty[good] ?? "1") || 1));

  return (
    <Card aria-labelledby="market-title" role="region">
      <h2 id="market-title">Market</h2>
      <p className="muted small">
        {credits(g.balance)} · carrying {total(g.cargo)}/{g.cargoCapacity}
      </p>
      {market.sells.length > 0 && (
        <>
          <h3>For sale here</h3>
          <ul className="list market-rows">
            {market.sells.map((o) => {
              const n = want(o.good);
              const cost = tradeTotal(o.base, "sells", o.load, depth(o.good), n);
              return (
                <li key={o.good}>
                  <span>
                    <strong>{goodName(goods, o.good)}</strong>{" "}
                    <span className="muted small">
                      {o.price} cr each{moved(o.price - o.base)}
                    </span>
                  </span>
                  <span className="row">
                    <input
                      className="input input-small"
                      type="number"
                      min={1}
                      max={Math.max(1, space)}
                      inputMode="numeric"
                      aria-label={`How many ${goodName(goods, o.good)}`}
                      value={qty[o.good] ?? "1"}
                      onChange={(e) => setQty({ ...qty, [o.good]: e.target.value })}
                    />
                    <Button
                      small
                      onClick={() => buy.mutate({ good: o.good, qty: n })}
                      disabled={buy.isPending || n > space || cost > g.balance}
                    >
                      Buy · {cost} cr
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {market.buys.length > 0 && (
        <>
          <h3>Buying here</h3>
          <ul className="list market-rows">
            {market.buys.map((o) => {
              const have = (g.cargo[o.good] ?? 0) + (g.atHome ? (g.warehouse[o.good] ?? 0) : 0);
              const fetches = tradeTotal(o.base, "buys", o.load, depth(o.good), have);
              return (
                <li key={o.good}>
                  <span>
                    <strong>{goodName(goods, o.good)}</strong>{" "}
                    <span className="muted small">
                      {o.price} cr each{moved(o.price - o.base)} · you have {have}
                    </span>
                  </span>
                  <Button small onClick={() => sell.mutate({ good: o.good, qty: have })} disabled={sell.isPending || have === 0}>
                    {have ? `Sell ${have} · ${fetches} cr` : "Sell"}
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <FormError message={buy.error?.message ?? sell.error?.message} />
      <p className="muted small">Prices move as you trade: the more you buy or sell at once, the further they move.</p>
      {space === 0 && <Notice tone="warning">You can't carry any more. Head home and unload.</Notice>}
    </Card>
  );
}
