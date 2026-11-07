import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type Interest, type Me } from "../api";
import { meKey, useLogout, useMe } from "../auth";
import { Button, Card, Check, FormError, Notice, TagPicker, TextField } from "../ui";
import { NotificationSettings } from "./Notify";
import { Shell } from "./Shell";

export function Profile() {
  const me = useMe().data as Me;
  return (
    <Shell>
      <section className="board" aria-label="Your profile">
        <div className="board-label">Traveller</div>
        <div className="board-title">{me.username}</div>
        <div className="board-sub">{me.email}</div>
      </section>
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
