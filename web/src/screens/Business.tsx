import { useState } from "react";
import {
  amount,
  credits,
  goodName,
  marketsFor,
  total,
  useCatalog,
  useGame,
  useGameAction,
  type Catalog,
  type GameState,
  type Industry,
} from "../game";
import { factoryState } from "../../../src/machines/factory";
import { formatClock, formatIn } from "../lib/format";
import { useNow } from "../lib/useNow";
import { Board, Button, Card, FormError, Notice } from "../ui";
import { useWorldFocus } from "../world3d/focus";
import { Shell } from "./Shell";

/** Your business: money, factories, warehouse, cargo, and where to buy and sell. */
export function Business() {
  const game = useGame();
  const catalog = useCatalog();
  const g = game.data;
  const c = catalog.data;
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
          {c.industries.map((i) => (
            <IndustryCard key={i.id} industry={i} game={g} catalog={c} />
          ))}
          <Warehouse game={g} catalog={c} />
          <Card aria-labelledby="where-title" role="region">
            <h2 id="where-title">Markets</h2>
            <p className="muted small">Today's prices. They drift from day to day, so check before you set off.</p>
            <h3>Buy materials</h3>
            <MarketTable catalog={c} side="sells" />
            <h3>Sell products</h3>
            <MarketTable catalog={c} side="buys" />
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

function Need({ catalog, need, have }: { catalog: Catalog; need: Record<string, number>; have: Record<string, number> }) {
  return (
    <ul className="needs">
      {Object.entries(need).map(([good, n]) => {
        const got = have[good] ?? 0;
        const where = marketsFor(catalog, good, "sells")[0];
        return (
          <li key={good} className={got >= n ? "is-met" : ""}>
            <span>
              <span aria-hidden="true">{got >= n ? "✓ " : ""}</span>
              {amount(catalog.goods, good, n)}
            </span>
            <span className="muted small">
              {Math.min(got, n)}/{n}
              {got < n && where ? ` · ${where.stop.name}, ${where.price} cr` : ""}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function IndustryCard({ industry, game, catalog }: { industry: Industry; game: GameState; catalog: Catalog }) {
  const factory = game.factories.find((f) => f.industry === industry.id);
  const build = useGameAction<{ industry: string }>("build");
  const produce = useGameAction<{ industry: string }>("produce");
  const now = useNow(30_000);
  const has = (need: Record<string, number>) => Object.entries(need).every(([g, n]) => (game.warehouse[g] ?? 0) >= n);
  const titleId = `industry-${industry.id}`;
  const { recipe } = industry;

  return (
    <Card aria-labelledby={titleId} role="region">
      <h2 id={titleId}>{industry.name}</h2>
      <p className="muted small">{industry.blurb}</p>
      {!factory ? (
        <>
          <h3>To build it</h3>
          <p className="small">
            {credits(industry.build.credits)} and these materials in your warehouse in {game.home?.name ?? "Berlin"}:
          </p>
          <Need catalog={catalog} need={industry.build.materials} have={game.warehouse} />
          <FormError message={build.error?.message} />
          <Button
            kind="primary"
            onClick={() => build.mutate({ industry: industry.id })}
            disabled={build.isPending || !game.atHome || game.balance < industry.build.credits || !has(industry.build.materials)}
          >
            Build the {industry.name.toLowerCase()}
          </Button>
          {!game.atHome && <p className="muted small">You can build when you're home.</p>}
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
          <Need catalog={catalog} need={recipe.inputs} have={game.warehouse} />
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

function MarketTable({ catalog, side }: { catalog: Catalog; side: "sells" | "buys" }) {
  const goods = catalog.goods.filter((g) => (side === "sells" ? g.kind === "raw" : g.kind === "product"));
  return (
    <ul className="list market-list">
      {goods.map((g) => {
        const places = marketsFor(catalog, g.id, side);
        return (
          <li key={g.id}>
            <span>{g.name}</span>
            <span className="muted small">
              {places.length ? places.map((p) => `${p.stop.name} ${p.price}`).join(" · ") : "Nowhere in this world yet"}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** The market at the station you're at: buy what it sells, sell what it buys. */
export function MarketCard({ stopId }: { stopId: string }) {
  const catalog = useCatalog();
  const game = useGame();
  const buy = useGameAction<{ good: string; qty: number }>("buy");
  const sell = useGameAction<{ good: string; qty: number }>("sell");
  const market = catalog.data?.markets.find((m) => m.stop.id === stopId);
  const g = game.data;
  const [qty, setQty] = useState<Record<string, string>>({});
  if (!market || !g || !catalog.data) return null;
  const space = g.cargoCapacity - total(g.cargo);
  const goods = catalog.data.goods;
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
              return (
                <li key={o.good}>
                  <span>
                    <strong>{goodName(goods, o.good)}</strong> <span className="muted small">{o.price} cr each</span>
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
                      disabled={buy.isPending || n > space || n * o.price > g.balance}
                    >
                      Buy · {n * o.price} cr
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
              return (
                <li key={o.good}>
                  <span>
                    <strong>{goodName(goods, o.good)}</strong> <span className="muted small">{o.price} cr each · you have {have}</span>
                  </span>
                  <Button small onClick={() => sell.mutate({ good: o.good, qty: have })} disabled={sell.isPending || have === 0}>
                    Sell {have || ""}
                  </Button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <FormError message={buy.error?.message ?? sell.error?.message} />
      {space === 0 && <Notice tone="warning">You can't carry any more. Head home and unload.</Notice>}
    </Card>
  );
}
