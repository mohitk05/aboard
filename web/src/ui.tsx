import { useId, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router";

// Aboard's UI kit: native HTML elements with Aboard's own styling (web/src/styles.css, described in
// docs/Design.md). Screens use only these.

/** Page frame: brand bar, then panels floating over the 3D world. */
export function Page({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page">
      <header className="topbar">
        <Link to="/" className="brand" aria-label="Aboard home">
          Aboard
        </Link>
        <div className="topbar-actions">{actions}</div>
      </header>
      <main className="content">{children}</main>
    </div>
  );
}

/** The headline band: a live caps label, a big Redaction title, and a caps subline. */
export function Board({ label, title, sub }: { label: string; title: string; sub?: string }) {
  return (
    <section className="board" aria-label={label}>
      <div className="board-label">{label}</div>
      <div className="board-title">{title}</div>
      {sub && <div className="board-sub">{sub}</div>}
    </section>
  );
}

export function Card({ children, className, ...rest }: HTMLAttributes<HTMLElement>) {
  return (
    <section className={`card ${className ?? ""}`} {...rest}>
      {children}
    </section>
  );
}

type ButtonKind = "primary" | "secondary" | "quiet" | "danger";

export function Button({
  kind = "secondary",
  small,
  className,
  type,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: ButtonKind; small?: boolean }) {
  return (
    <button
      type={type ?? (rest.onClick ? "button" : "submit")}
      className={`btn btn-${kind} ${small ? "btn-small" : ""} ${className ?? ""}`}
      {...rest}
    />
  );
}

/** A router link that looks like a button. */
export function ButtonLink({ to, kind = "secondary", children }: { to: string; kind?: ButtonKind; children: ReactNode }) {
  return (
    <Link to={to} className={`btn btn-${kind}`}>
      {children}
    </Link>
  );
}

function FieldFrame({ id, label, hint, showLabel = true, children }: { id: string; label: string; hint?: string; showLabel?: boolean; children: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id} className={showLabel ? "field-label" : "sr-only"}>
        {label}
      </label>
      {children}
      {hint && (
        <span className="field-hint" id={`${id}-hint`}>
          {hint}
        </span>
      )}
    </div>
  );
}

type InputExtras = {
  label: string;
  hint?: string;
  onValue: (v: string) => void;
  /** Lower-case aliases kept for call sites written against the old kit. */
  autocomplete?: string;
  inputmode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
};

/** Text input with a visible label and an optional hint. `onValue` gets the new string. */
export function TextField({
  label,
  hint,
  onValue,
  autocomplete,
  inputmode,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange"> & InputExtras) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint}>
      <input
        id={id}
        className="input"
        aria-describedby={hint ? `${id}-hint` : undefined}
        autoComplete={autocomplete ?? rest.autoComplete}
        inputMode={inputmode ?? rest.inputMode}
        onChange={(e) => onValue(e.target.value)}
        {...rest}
      />
    </FieldFrame>
  );
}

export function SelectField({
  label,
  hint,
  onValue,
  children,
  ...rest
}: { label: string; hint?: string; onValue: (v: string) => void; children: ReactNode; value: string; required?: boolean; disabled?: boolean }) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} hint={hint}>
      <select id={id} className="input select" aria-describedby={hint ? `${id}-hint` : undefined} onChange={(e) => onValue(e.target.value)} {...rest}>
        {children}
      </select>
    </FieldFrame>
  );
}

export function TextArea({
  label,
  showLabel = true,
  onValue,
  ...rest
}: { label: string; showLabel?: boolean; onValue: (v: string) => void; value: string; rows?: number; maxLength?: number; placeholder?: string }) {
  const id = useId();
  return (
    <FieldFrame id={id} label={label} showLabel={showLabel}>
      <textarea id={id} className="input textarea" onChange={(e) => onValue(e.target.value)} {...rest} />
    </FieldFrame>
  );
}

export function Check({ checked, onValue, children }: { checked: boolean; onValue: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(e) => onValue(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}

/** A set of toggleable tags (e.g. interests), each a real checkbox styled as a pill. */
export function TagPicker({
  legend,
  hint,
  options,
  picked,
  onChange,
}: {
  legend: string;
  hint?: string;
  options: { id: string; name: string }[];
  picked: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string, on: boolean) => onChange(on ? [...picked, id] : picked.filter((p) => p !== id));
  return (
    <fieldset className="field">
      <legend className="field-label">{legend}</legend>
      <div className="chips">
        {options.map((o) => (
          <label key={o.id} className="tag tag-toggle">
            <input type="checkbox" checked={picked.includes(o.id)} onChange={(e) => toggle(o.id, e.target.checked)} />
            {/* The tick is decoration: the checkbox already announces its state. */}
            {picked.includes(o.id) && <span aria-hidden>✓&nbsp;</span>}
            <span>{o.name}</span>
          </label>
        ))}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </fieldset>
  );
}

/** Read-only tags, e.g. someone's interests. Shared ones are filled (and say so to screen readers). */
export function Tags({ items, strong = [], label }: { items: { id: string; name: string }[]; strong?: string[]; label?: string }) {
  return (
    <ul className="chips" aria-label={label}>
      {items.map((i) => {
        const shared = strong.includes(i.id);
        return (
          <li key={i.id} className={`tag ${shared ? "tag-shared" : ""}`}>
            {shared && <span aria-hidden>✓ </span>}
            {i.name}
            {shared && <span className="sr-only"> (shared)</span>}
          </li>
        );
      })}
    </ul>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return <span className="badge">{children}</span>;
}

/** An inline message: errors are announced (role=alert), everything else is a polite status. */
export function Notice({
  tone = "informational",
  children,
}: {
  tone?: "informational" | "successful" | "warning" | "critical" | "neutral";
  children: ReactNode;
}) {
  return (
    <div className={`notice notice-${tone}`} role={tone === "critical" ? "alert" : "status"}>
      {children}
    </div>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <Notice tone="critical">{message}</Notice>;
}

export function Splash({ error, onRetry }: { error?: string; onRetry?: () => void }) {
  return (
    <div className="splash">
      <img src="/favicon.svg" alt="" width={48} height={48} className={error ? undefined : "pulse"} />
      {error ? (
        <>
          <p>{error}</p>
          {onRetry && (
            <Button kind="primary" onClick={onRetry}>
              Try again
            </Button>
          )}
        </>
      ) : (
        <p className="muted">Checking the timetable…</p>
      )}
    </div>
  );
}
