import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { api, type Interest, type Stop } from "../api";
import { useSignup } from "../auth";
import { Button, Card, Check, FormError, Page, TagPicker, TextField } from "../ui";

export function Signup() {
  const signup = useSignup();
  const stops = useQuery({ queryKey: ["stops"], queryFn: () => api<Stop[]>("GET", "/stop") });
  const interests = useQuery({ queryKey: ["interests"], queryFn: () => api<Interest[]>("GET", "/interest") });

  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [age, setAge] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [isPrivate, setPrivate] = useState(false);
  // Everyone starts at home, in Berlin: that's where your warehouse and factories will be.
  const home = useQuery({ queryKey: ["catalog"], queryFn: () => api<{ home: Stop | null }>("GET", "/game/catalog") }).data?.home;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    signup.mutate({
      username: username.trim(),
      email: email.trim(),
      password,
      age: Number(age),
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

          <div className="start-station" role="group" aria-label="Starting station">
            <span className="field-label">Your home base</span>
            <strong className="start-name">{home ? `${home.name}, ${home.country}` : "Berlin"}</strong>
            <span className="field-hint">
              Everyone starts here, with 5,000 credits. Ride out to buy materials, bring them home, build a factory and
              sell what you make.
            </span>
          </div>

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
