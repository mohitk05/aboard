import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type Interest, type Me } from "../api";
import { meKey, useLogout, useMe } from "../auth";
import { useTravels, type Travels } from "../people";
import { Badge, Button, Card, Check, FormError, Notice, TagPicker, TextField } from "../ui";
import { NotificationSettings } from "./Notify";
import { Shell } from "./Shell";

export function Profile() {
  const me = useMe().data as Me;
  const travels = useTravels(me.id, true);
  return (
    <Shell>
      <section className="board" aria-label="Your profile">
        <div className="board-label">{travels.data?.level.name ?? "Traveller"}</div>
        <div className="board-title">{me.username}</div>
        <div className="board-sub">{me.email}</div>
      </section>
      <FormError message={travels.error?.message} />
      {travels.data && <TravelsCard t={travels.data} />}
      <ProfileForm me={me} />
      <NotificationSettings />
      <PasswordForm />
      <LogOut />
    </Shell>
  );
}

function ProfileForm({ me }: { me: Me }) {
  const qc = useQueryClient();
  const all = useQuery({ queryKey: ["interests"], queryFn: () => api<Interest[]>("GET", "/interest") });
  const [picked, setPicked] = useState(me.interests.map((i) => i.id));
  const [isPrivate, setPrivate] = useState(me.profileMode === "PRIVATE");
  const save = useMutation({
    mutationFn: () => api<Me>("PATCH", "/user/me", { user: { interests: picked, profileMode: isPrivate ? "PRIVATE" : "PUBLIC" } }),
    onSuccess: (m) => {
      qc.setQueryData(meKey, m);
      qc.invalidateQueries({ queryKey: ["fellow"] });
    },
  });

  return (
    <Card>
      <form
        className="form-wide"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <h2>About you</h2>
        <TagPicker legend="What you like to talk about" options={all.data ?? []} picked={picked} onChange={setPicked} />
        <Check checked={isPrivate} onValue={setPrivate}>
          Travel privately (other travellers won't see you or where you are)
        </Check>
        <FormError message={save.error?.message} />
        {save.isSuccess && <Notice tone="successful">Saved.</Notice>}
        <Button kind="primary" type="submit" disabled={save.isPending}>
          Save
        </Button>
      </form>
    </Card>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const change = useMutation({
    mutationFn: () => api("POST", "/user/password", { current, next }),
    onSuccess: () => (setCurrent(""), setNext("")),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    change.mutate();
  };
  return (
    <Card>
      <form className="form-wide" onSubmit={submit}>
        <h2>Change password</h2>
        <TextField label="Current password" type="password" required autocomplete="current-password" value={current} onValue={setCurrent} />
        <TextField
          label="New password"
          hint="At least 8 characters."
          type="password"
          required
          minLength={8}
          autocomplete="new-password"
          value={next}
          onValue={setNext}
        />
        <FormError message={change.error?.message} />
        {change.isSuccess && <Notice tone="successful">Password changed.</Notice>}
        <Button type="submit" disabled={change.isPending}>
          Change password
        </Button>
      </form>
    </Card>
  );
}

function LogOut() {
  const logout = useLogout();
  return (
    <Card>
      <Button onClick={() => logout.mutate()} disabled={logout.isPending}>
        Log out
      </Button>
    </Card>
  );
}

const n = new Intl.NumberFormat("en");

/** Where you've been: your traveller level, places, lines, km, regions and badges. */
function TravelsCard({ t }: { t: Travels }) {
  const { level } = t;
  const from = level.next ? t.places : 1;
  const pct = level.next ? Math.min(100, Math.round((100 * from) / level.next.places)) : 100;
  // A region's badge is its chip under Regions; the grid has the rest.
  const grid = t.badges.filter((b) => b.kind !== "area" || b.id === "region-all");
  const earned = grid.filter((b) => b.earned);
  const ahead = grid.filter((b) => !b.earned);
  const regions = t.regions.filter((r) => r.places > 0).length;
  return (
    <Card aria-labelledby="travels-title" role="region">
      <h2 id="travels-title">Travels</h2>
      <p className="travel-level">
        <strong>{level.name}</strong> <span className="muted small">· level {level.rank} of 6</span>
      </p>
      <div className="bar" role="progressbar" aria-label="Towards the next level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <p className="muted small">
        {level.next
          ? `${level.next.places - t.places} more ${level.next.places - t.places === 1 ? "place" : "places"} to ${level.next.name}. A place counts when you get off a train there, not when you pass through.`
          : "The highest level. Every station is still out there."}
      </p>
      <dl className="travel-stats">
        <div>
          <dt>Places</dt>
          <dd>{n.format(t.places)}</dd>
        </div>
        <div>
          <dt>Lines</dt>
          <dd>{n.format(t.lines)}</dd>
        </div>
        <div>
          <dt>Km ridden</dt>
          <dd>{n.format(t.km)}</dd>
        </div>
      </dl>
      <h3>
        Regions · {regions} of {t.regions.length}
      </h3>
      <ul className="chips travel-regions" aria-label="Regions">
        {t.regions.map((r) => (
          <li key={r.region} className={r.places ? "tag tag-shared" : "tag tag-dim"}>
            {r.region}
            {r.places ? ` · ${r.places}` : ""}
          </li>
        ))}
      </ul>
      <h3>
        Badges · {earned.length} of {grid.length}
      </h3>
      <ul className="travel-badges">
        {[...earned, ...ahead].map((b) => (
          <li key={b.id} className={b.earned ? "is-earned" : ""}>
            <strong>
              {b.earned && <span aria-hidden="true">✓ </span>}
              {b.name}
            </strong>
            {b.earned && <Badge>Earned</Badge>}
            <span className="muted small">{b.about}</span>
            {!b.earned && b.progress.need > 1 && (
              <span className="muted small">
                {n.format(b.progress.have)} / {n.format(b.progress.need)}
              </span>
            )}
          </li>
        ))}
      </ul>
      {t.placesList.length > 0 && (
        <details>
          <summary>Places you've been ({t.placesList.length})</summary>
          <ul className="list">
            {t.placesList.map((p) => (
              <li key={p.stop.id}>
                <span>{p.stop.name}</span>
                <span className="muted small">{p.stop.country}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
      {t.linesList.length > 0 && (
        <details>
          <summary>Lines you've ridden ({t.linesList.length})</summary>
          <ul className="list">
            {t.linesList.map((l) => (
              <li key={l.id}>
                <span>{l.name}</span>
                <span className="muted small">
                  {l.times} {l.times === 1 ? "journey" : "journeys"}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}
