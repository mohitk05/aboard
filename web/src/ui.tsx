import {
  DBBadge,
  DBButton,
  DBCard,
  DBCheckbox,
  DBInput,
  DBNotification,
  DBSelect,
  DBTag,
  DBTextarea,
} from "@db-ux/react-core-components";
import type { ChangeEvent, ComponentProps, ReactNode } from "react";
import { Link } from "react-router";

// Aboard's UI kit: thin wrappers over DB UX Design System components, so screens share one
// vocabulary (and one place to adjust if the design system changes).

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

/** A departure-board panel: dark slab with amber lettering (Aboard's own look). */
export function Board({ label, title, sub }: { label: string; title: string; sub?: string }) {
  return (
    <section className="board" aria-label={label}>
      <div className="board-label">{label}</div>
      <div className="board-title">{title}</div>
      {sub && <div className="board-sub">{sub}</div>}
    </section>
  );
}

export function Card({ children, className, ...rest }: ComponentProps<typeof DBCard>) {
  return (
    <DBCard spacing="medium" className={`card ${className ?? ""}`} {...rest}>
      {children}
    </DBCard>
  );
}

type ButtonKind = "primary" | "secondary" | "quiet" | "danger";
const VARIANT: Record<ButtonKind, "brand" | "outlined" | "ghost" | "filled"> = {
  primary: "brand",
  secondary: "outlined",
  quiet: "ghost",
  danger: "filled",
};

export function Button({
  kind = "secondary",
  small,
  ...rest
}: Omit<ComponentProps<typeof DBButton>, "variant" | "size"> & { kind?: ButtonKind; small?: boolean }) {
  return (
    <DBButton
      variant={VARIANT[kind]}
      size={small ? "small" : "medium"}
      data-kind={kind}
      type={rest.type ?? (rest.onClick ? "button" : "submit")}
      {...rest}
    />
  );
}

/** A router link that looks like a DB button. */
export function ButtonLink({ to, kind = "secondary", children }: { to: string; kind?: ButtonKind; children: ReactNode }) {
  return (
    <Link to={to} className="db-button" data-variant={VARIANT[kind]} data-size="medium">
      {children}
    </Link>
  );
}

/** Text input with a visible label and an optional hint. `onValue` gets the new string. */
export function TextField({
  hint,
  onValue,
  ...rest
}: Omit<ComponentProps<typeof DBInput>, "message" | "onChange"> & { label: string; hint?: string; onValue: (v: string) => void }) {
  return (
    <DBInput
      {...rest}
      message={hint}
      showMessage={!!hint}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onValue(e.target.value)}
    />
  );
}

export function SelectField({
  hint,
  onValue,
  children,
  ...rest
}: Omit<ComponentProps<typeof DBSelect>, "message" | "onChange"> & {
  label: string;
  hint?: string;
  onValue: (v: string) => void;
  children: ReactNode;
}) {
  return (
    <DBSelect {...rest} message={hint} showMessage={!!hint} onChange={(e: ChangeEvent<HTMLSelectElement>) => onValue(e.target.value)}>
      {children}
    </DBSelect>
  );
}

export function TextArea({
  onValue,
  ...rest
}: Omit<ComponentProps<typeof DBTextarea>, "onChange"> & { label: string; onValue: (v: string) => void }) {
  return <DBTextarea {...rest} onChange={(e: ChangeEvent<HTMLTextAreaElement>) => onValue(e.target.value)} />;
}

export function Check({ checked, onValue, children }: { checked: boolean; onValue: (v: boolean) => void; children: ReactNode }) {
  return (
    <DBCheckbox checked={checked} onChange={(e: ChangeEvent<HTMLInputElement>) => onValue(e.target.checked)}>
      {children}
    </DBCheckbox>
  );
}

/** A set of toggleable tags (e.g. interests), each a checkbox inside a DB tag. */
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
          <DBTag key={o.id}>
            <label>
              <input type="checkbox" checked={picked.includes(o.id)} onChange={(e) => toggle(o.id, e.target.checked)} />
              {o.name}
            </label>
          </DBTag>
        ))}
      </div>
      {hint && <span className="field-hint">{hint}</span>}
    </fieldset>
  );
}

/** Read-only tags, e.g. someone's interests. Shared ones are emphasised. */
export function Tags({ items, strong = [], label }: { items: { id: string; name: string }[]; strong?: string[]; label?: string }) {
  return (
    <div className="chips" aria-label={label}>
      {items.map((i) => (
        <DBTag key={i.id} semantic="neutral" emphasis={strong.includes(i.id) ? "strong" : "weak"}>
          {i.name}
        </DBTag>
      ))}
    </div>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <DBBadge semantic="neutral" emphasis="strong" size="small" className="badge">
      {children}
    </DBBadge>
  );
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
    <DBNotification semantic={tone} variant="standalone" role={tone === "critical" ? "alert" : "status"} showIcon={false}>
      {children}
    </DBNotification>
  );
}

export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <div className="form-error">
      <Notice tone="critical">{message}</Notice>
    </div>
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
