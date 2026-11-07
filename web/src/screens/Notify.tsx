import { usePush } from "../push";
import { FormError } from "../ui";

/** Settings card: turn notifications on or off for this device. */
export function NotificationSettings() {
  const { status, enable, disable } = usePush();
  return (
    <section className="card form-wide" aria-labelledby="notify-title" role="region">
      <h2 id="notify-title">Notifications</h2>
      <p className="muted small">
        We'll tell you when your train is near, when you've boarded and arrived, and when someone writes to you. Nothing
        else.
      </p>
      <PushState status={status} />
      {status === "off" && (
        <button className="btn btn-primary" onClick={() => enable.mutate()} disabled={enable.isPending}>
          Turn on notifications
        </button>
      )}
      {status === "on" && (
        <>
          <p role="status">Notifications are on for this device.</p>
          <button className="btn" onClick={() => disable.mutate()} disabled={disable.isPending}>
            Turn off
          </button>
        </>
      )}
      <FormError message={enable.error?.message ?? disable.error?.message} />
    </section>
  );
}

/** A one-line nudge on the ticket and journey screens, shown only while notifications are off. */
export function NotifyNudge({ about }: { about: string }) {
  const { status, enable } = usePush();
  if (status !== "off" && status !== "needs-install") return null;
  return (
    <div className="nudge">
      {status === "off" ? (
        <>
          <span>{about}</span>
          <button className="btn btn-small" onClick={() => enable.mutate()} disabled={enable.isPending}>
            Notify me
          </button>
        </>
      ) : (
        <span>To get notifications on iPhone, add Aboard to your Home Screen: Share → Add to Home Screen.</span>
      )}
      <FormError message={enable.error?.message} />
    </div>
  );
}

function PushState({ status }: { status: ReturnType<typeof usePush>["status"] }) {
  switch (status) {
    case "needs-install":
      return <p className="notice-soft">On iPhone and iPad, add Aboard to your Home Screen first (Share → Add to Home Screen), then open it from there.</p>;
    case "unsupported":
      return <p className="notice-soft">This browser can't show notifications.</p>;
    case "unavailable":
      return <p className="notice-soft">Notifications aren't set up on this server yet.</p>;
    case "denied":
      return <p className="notice-soft">Notifications are blocked for Aboard. Allow them in your browser's site settings.</p>;
    default:
      return null;
  }
}
