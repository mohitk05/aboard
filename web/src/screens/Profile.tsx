import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api, type Interest, type Me } from "../api";
import { meKey, useLogout, useMe } from "../auth";
import { Field, FormError } from "../ui";
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
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <form
      className="card form-wide"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <h2>What you like to talk about</h2>
      <div className="chips">
        {all.data?.map((i) => (
          <button type="button" key={i.id} className="chip" aria-pressed={picked.includes(i.id)} onClick={() => toggle(i.id)}>
            {i.name}
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setPrivate(e.target.checked)} />
        <span>Travel privately (other travellers won't see you or where you are)</span>
      </label>
      <FormError message={save.error?.message} />
      {save.isSuccess && <p className="muted small" role="status">Saved.</p>}
      <button className="btn btn-primary" disabled={save.isPending}>
        Save
      </button>
    </form>
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
    <form className="card form-wide" onSubmit={submit}>
      <h2>Change password</h2>
      <Field label="Current password">
        <input type="password" required autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </Field>
      <Field label="New password" hint="At least 8 characters.">
        <input type="password" required minLength={8} autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
      </Field>
      <FormError message={change.error?.message} />
      {change.isSuccess && <p className="muted small" role="status">Password changed.</p>}
      <button className="btn" disabled={change.isPending}>
        Change password
      </button>
    </form>
  );
}

function LogOut() {
  const logout = useLogout();
  return (
    <section className="card">
      <button className="btn" onClick={() => logout.mutate()} disabled={logout.isPending}>
        Log out
      </button>
    </section>
  );
}
