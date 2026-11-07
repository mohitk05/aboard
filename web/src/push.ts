import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";

export type PushStatus =
  | "unsupported" // this browser can't do web push
  | "needs-install" // iPhone/iPad: only works once added to the Home Screen
  | "unavailable" // the server has no VAPID keys
  | "denied" // the user blocked notifications
  | "off"
  | "on";

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

function urlB64ToBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function serverKey(): Promise<string | null> {
  try {
    return (await api<{ publicKey: string }>("GET", "/push/key")).publicKey;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

async function currentStatus(): Promise<PushStatus> {
  if (!("serviceWorker" in navigator) || !("Notification" in window)) return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  if (!("PushManager" in window)) return isIOS() && !isStandalone() ? "needs-install" : "unsupported";
  if (!(await serverKey())) return "unavailable";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

const key = ["push-status"] as const;

/** Whether this device gets notifications, and switches to change that. */
export function usePush() {
  const qc = useQueryClient();
  const status = useQuery({ queryKey: key, queryFn: currentStatus, staleTime: 60_000 });

  const enable = useMutation({
    mutationFn: async () => {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notifications weren't allowed. You can change this in your browser settings.");
      const k = await serverKey();
      if (!k) throw new Error("Notifications aren't set up on this server yet.");
      const reg = await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToBytes(k) }));
      await api("POST", "/push/subscription", { subscription: sub.toJSON() });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  const disable = useMutation({
    mutationFn: async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) return;
      await api("DELETE", "/push/subscription", { subscription: { endpoint: sub.endpoint } });
      await sub.unsubscribe();
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });

  return { status: status.data, enable, disable };
}
