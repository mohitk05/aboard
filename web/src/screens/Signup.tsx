import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { haversineKm } from "../../../src/lib/geo";
import { api, type Interest, type Stop } from "../api";
import { useSignup } from "../auth";
import { Button, Card, Check, FormError, Notice, Page, SelectField, TagPicker, TextField } from "../ui";

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
        const nearest = [...stops.data].sort((a, b) => haversineKm(here, a.coordinates) - haversineKm(here, b.coordinates))[0];
        if (nearest) setStop(nearest.id);
        setLocating("idle");
      },
      () => setLocating("denied"),
      { timeout: 10_000, maximumAge: 600_000 },
    );
  };

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
        <Card>
          <h1>The line is still being laid</h1>
          <p className="muted">There are no stations yet. Check back soon.</p>
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      <Card className="form-card">
        <form className="form" onSubmit={submit}>
          <h1>Get a ticket</h1>

          <div className="row row-end">
            <SelectField
              label="Where are you starting?"
              hint="You can travel anywhere from here."
              required
              value={stop}
              onValue={setStop}
              disabled={!stops.data}
            >
              <option value="" disabled>
                {stops.isPending ? "Loading stations…" : "Choose a station"}
              </option>
              {stops.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}, {s.country}
                </option>
              ))}
            </SelectField>
            <Button onClick={findNearest} disabled={locating === "busy"}>
              {locating === "busy" ? "Locating…" : "Nearest to me"}
            </Button>
          </div>
          {locating === "denied" && <Notice tone="warning">Couldn't get your location. Pick a station instead.</Notice>}

          <TextField
            label="Username"
            hint="The only thing other travellers see. Letters, numbers, dots, dashes and underscores."
            required
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9_.\-]+"
            autocomplete="username"
            value={username}
            onValue={setUsername}
          />
          <TextField label="Email" hint="Never shown to other travellers." type="email" required autocomplete="email" value={email} onValue={setEmail} />
          <TextField
            label="Password"
            hint="At least 8 characters."
            type="password"
            required
            minLength={8}
            autocomplete="new-password"
            value={password}
            onValue={setPassword}
          />
          <TextField
            label="Age"
            hint="Travellers under 18 are only matched with each other."
            type="number"
            required
            min={13}
            max={120}
            inputmode="numeric"
            value={age}
            onValue={setAge}
          />

          {!!interests.data?.length && (
            <TagPicker
              legend="What do you like to talk about?"
              hint="You'll meet travellers who share at least one."
              options={interests.data}
              picked={picked}
              onChange={setPicked}
            />
          )}

          <Check checked={isPrivate} onValue={setPrivate}>
            Travel privately (other travellers won't see you or where you are)
          </Check>

          <FormError message={signup.error?.message ?? stops.error?.message} />
          <Button kind="primary" type="submit" disabled={signup.isPending || !stops.data}>
            {signup.isPending ? "Printing your ticket…" : "Start travelling"}
          </Button>
          <p className="muted small">
            Already aboard? <Link to="/login">Log in</Link>
          </p>
        </form>
      </Card>
    </Page>
  );
}
