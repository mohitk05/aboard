import type { ReactNode } from "react";
import { Link } from "react-router";

/** Page frame: brand bar, then content in a readable column. */
export function Page({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Aboard home">
          <img src="/favicon.svg" alt="" width={28} height={28} />
          <span>Aboard</span>
        </Link>
        <div className="topbar-actions">{actions}</div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

/** A departure-board panel: dark slab with amber lettering. */
export function Board({ label, title, sub }: { label: string; title: string; sub?: string }) {
  return (
    <section className="board" aria-label={label}>
      <div className="board-label">{label}</div>
      <div className="board-title">{title}</div>
      {sub && <div className="board-sub">{sub}</div>}
    </section>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  );
}

export function Splash({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return (
    <div className="splash">
      <img src="/favicon.svg" alt="" width={48} height={48} className={error ? undefined : "pulse"} />
      {error ? (
        <>
          <p>{error}</p>
          {onRetry && (
            <button className="btn" onClick={onRetry}>
              Try again
            </button>
          )}
        </>
      ) : (
        <p className="muted">Checking the timetable…</p>
      )}
    </div>
  );
}
