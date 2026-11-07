import { usePush } from "../push";
import { Button, Card, FormError, Notice } from "../ui";

/** Settings card: turn notifications on or off for this device. */
export function NotificationSettings() {
  const { status, enable, disable } = usePush();
  return (
    <Card className="form-wide" aria-labelledby="notify-title" role="region">
      <h2 id="notify-title">Notifications</h2>
      <p className="muted small">
        We'll tell you when your train is near, when you've boarded and arrived, and when someone writes to you. Nothing
        else.
      </p>
      <PushState status={status} />
      {status === "off" && (
        <Button kind="primary" onClick={() => enable.mutate()} disabled={enable.isPending}>
          Turn on notifications
        </Button>
      )}
      {status === "on" && (
        <>
          <Notice tone="successful">Notifications are on for this device.</Notice>
          <Button onClick={() => disable.mutate()} disabled={disable.isPending}>
            Turn off
          </Button>
        </>
      )}
      <FormError message={enable.error?.message ?? disable.error?.message} />
    </Card>
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
          <Button small onClick={() => enable.mutate()} disabled={enable.isPending}>
            Notify me
          </Button>
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
      return <Notice tone="informational">On iPhone and iPad, add Aboard to your Home Screen first (Share → Add to Home Screen), then open it from there.</Notice>;
    case "unsupported":
      return <Notice tone="neutral">This browser can't show notifications.</Notice>;
    case "unavailable":
      return <Notice tone="neutral">Notifications aren't set up on this server yet.</Notice>;
    case "denied":
      return <Notice tone="warning">Notifications are blocked for Aboard. Allow them in your browser's site settings.</Notice>;
    default:
      return null;
  }
}
