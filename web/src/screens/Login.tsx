import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { useLogin } from "../auth";
import { Button, Card, FormError, Page, TextField } from "../ui";

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
      <Card className="form-card">
        <form className="form" onSubmit={submit}>
          <h1>Welcome back</h1>
          <TextField label="Email" type="email" autocomplete="email" required value={email} onValue={setEmail} />
          <TextField label="Password" type="password" autocomplete="current-password" required value={password} onValue={setPassword} />
          <FormError message={login.error?.message} />
          <Button kind="primary" type="submit" disabled={login.isPending}>
            {login.isPending ? "Checking…" : "Log in"}
          </Button>
          <p className="muted small">
            New here? <Link to="/signup">Get a ticket</Link>
          </p>
        </form>
      </Card>
    </Page>
  );
}
