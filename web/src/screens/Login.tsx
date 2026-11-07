import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useLogin } from "../auth";
import { Field, FormError, Page } from "../ui";

export function Login() {
  const login = useLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    login.mutate({ email: email.trim(), password });
  };

  return (
    <Page>
      <form className="card form" onSubmit={submit} noValidate={false}>
        <h1>Welcome back</h1>
        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            required
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label="Password">
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <FormError message={login.error?.message} />
        <button className="btn btn-primary" disabled={login.isPending}>
          {login.isPending ? "Checking…" : "Log in"}
        </button>
        <p className="muted small">
          New here? <Link to="/signup">Get a ticket</Link>
        </p>
      </form>
    </Page>
  );
}
