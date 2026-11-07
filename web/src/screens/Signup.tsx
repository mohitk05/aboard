import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { haversineKm } from "../../../src/lib/geo";
import { api, type Interest, type Stop } from "../api";
import { useSignup } from "../auth";
import { Field, FormError, Page } from "../ui";

export function Signup() {
  const signup = useSignup();
  const stops = useQuery({ queryKey: ["stops"], queryFn: () => api<Stop[]>("GET", "/stop") });
  const interests = useQuery({ queryKey: ["interests"], queryFn: () => api<Interest[]>("GET", "/interest") });

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [age, setAge] = useState("");
  const [stop, setStop] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [isPrivate, setPrivate] = useState(false);
  const [locating, setLocating] = useState<"idle" | "busy" | "denied">("idle");

  const findNearest = () => {
    if (!stops.data?.length || !navigator.geolocation) return setLocating("denied");
    setLocating("busy");
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        const here = { lat: coords.latitude, lng: coords.longitude };
        const nearest = [...stops.data].sort(
          (a, b) => haversineKm(here, a.coordinates) - haversineKm(here, b.coordinates),
        )[0];
        if (nearest) setStop(nearest.id);
        setLocating("idle");
      },
      () => setLocating("denied"),
      { timeout: 10_000, maximumAge: 600_000 },
    );
  };

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  const submit = (e: FormEvent) => {
    e.preventDefault();
    signup.mutate({
      username: username.trim(),
      email: email.trim(),
      password,
      age: Number(age),
      currentStop: stop,
      interests: picked,
      profileMode: isPrivate ? "PRIVATE" : "PUBLIC",
    });
  };

  if (stops.data && stops.data.length === 0) {
    return (
      <Page>
        <div className="card">
          <h1>The line is still being laid</h1>
          <p className="muted">There are no stations yet. Check back soon.</p>
        </div>
      </Page>
    );
  }

  return (
    <Page>
      <form className="card form" onSubmit={submit}>
        <h1>Get a ticket</h1>

        <Field label="Where are you starting?" hint="You can travel anywhere from here.">
          <div className="row">
            <select required value={stop} onChange={(e) => setStop(e.target.value)} disabled={!stops.data}>
              <option value="" disabled>
                {stops.isPending ? "Loading stations…" : "Choose a station"}
              </option>
              {stops.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}, {s.country}
                </option>
              ))}
            </select>
            <button type="button" className="btn btn-quiet" onClick={findNearest} disabled={locating === "busy"}>
              {locating === "busy" ? "Locating…" : "Nearest to me"}
            </button>
          </div>
        </Field>
        {locating === "denied" && <p className="muted small">Couldn't get your location. Pick a station instead.</p>}

        <Field label="Username" hint="The only thing other travellers see. Letters, numbers, dots, dashes and underscores.">
          <input
            required
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9_.\-]+"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label="Email" hint="Never shown to other travellers.">
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password" hint="At least 8 characters.">
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Field label="Age" hint="Travellers under 18 are only matched with each other.">
          <input
            type="number"
            required
            min={13}
            max={120}
            inputMode="numeric"
            value={age}
            onChange={(e) => setAge(e.target.value)}
          />
        </Field>

        {!!interests.data?.length && (
          <fieldset className="field">
            <legend className="field-label">What do you like to talk about?</legend>
            <div className="chips">
              {interests.data.map((i) => (
                <button
                  type="button"
                  key={i.id}
                  className="chip"
                  aria-pressed={picked.includes(i.id)}
                  onClick={() => toggle(i.id)}
                >
                  {i.name}
                </button>
              ))}
            </div>
            <span className="field-hint">You'll meet travellers who share at least one.</span>
          </fieldset>
        )}

        <label className="check">
          <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} />
          <span>Travel privately (other travellers won't see you or where you are)</span>
        </label>

        <FormError message={signup.error?.message ?? stops.error?.message} />
        <button className="btn btn-primary" disabled={signup.isPending || !stops.data}>
          {signup.isPending ? "Printing your ticket…" : "Start travelling"}
        </button>
        <p className="muted small">
          Already aboard? <Link to="/login">Log in</Link>
        </p>
      </form>
    </Page>
  );
}
