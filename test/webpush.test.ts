import { describe, expect, it } from "vitest";
import { b64u, encryptPayload, sendPush, vapidAuthorization, type VapidKeys } from "../src/lib/webpush";
import { fakeBrowser } from "./push-helpers";

const enc = new TextEncoder();
const dec = new TextDecoder();


async function vapidKeys(): Promise<VapidKeys> {
  const kp = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const pub = new Uint8Array((await crypto.subtle.exportKey("raw", kp.publicKey)) as ArrayBuffer);
  const jwk = (await crypto.subtle.exportKey("jwk", kp.privateKey)) as JsonWebKey;
  return { publicKey: b64u.encode(pub), privateKey: jwk.d!, subject: "mailto:test@aboard.test" };
}

describe("web push encryption (RFC 8291)", () => {
  it("produces a message the browser can decrypt", async () => {
    const browser = await fakeBrowser();
    const body = await encryptPayload(browser.sub, enc.encode('{"title":"Your train is near"}'));
    expect(await browser.decrypt(body)).toBe('{"title":"Your train is near"}');
  });

  it("uses a fresh salt and server key every time", async () => {
    const browser = await fakeBrowser();
    const a = await encryptPayload(browser.sub, enc.encode("x"));
    const b = await encryptPayload(browser.sub, enc.encode("x"));
    expect(b64u.encode(a.slice(0, 16))).not.toBe(b64u.encode(b.slice(0, 16)));
  });
});

describe("VAPID (RFC 8292)", () => {
  it("signs a JWT for the push service's origin that verifies with the public key", async () => {
    const keys = await vapidKeys();
    const header = await vapidAuthorization("https://fcm.googleapis.com/fcm/send/xyz", keys, 1_700_000_000_000);
    const m = header.match(/^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/)!;
    expect(m).toBeTruthy();
    expect(m[4]).toBe(keys.publicKey);
    const claims = JSON.parse(dec.decode(b64u.decode(m[2]!)));
    expect(claims).toEqual({ aud: "https://fcm.googleapis.com", exp: 1_700_000_000 + 12 * 3600, sub: keys.subject });
    const pub = await crypto.subtle.importKey("raw", b64u.decode(keys.publicKey), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    const ok = await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      pub,
      b64u.decode(m[3]!),
      enc.encode(`${m[1]}.${m[2]}`),
    );
    expect(ok).toBe(true);
  });
});

describe("sendPush", () => {
  it("posts an encrypted, signed request to the subscription endpoint", async () => {
    const browser = await fakeBrowser();
    const keys = await vapidKeys();
    let seen: { url: string; headers: Headers; body: Uint8Array } | null = null;
    const fakeFetch = (async (url: string, init: RequestInit) => {
      seen = { url, headers: new Headers(init.headers), body: init.body as Uint8Array };
      return new Response(null, { status: 201 });
    }) as unknown as typeof fetch;

    const status = await sendPush(browser.sub, { title: "Berlin in 10 minutes", body: "Get your bags.", tag: "approach:1" }, keys, fakeFetch);
    expect(status).toBe(201);
    expect(seen!.url).toBe(browser.sub.endpoint);
    expect(seen!.headers.get("Content-Encoding")).toBe("aes128gcm");
    expect(seen!.headers.get("Authorization")).toMatch(/^vapid t=/);
    expect(seen!.headers.get("TTL")).toBeTruthy();
    expect(JSON.parse(await browser.decrypt(seen!.body))).toMatchObject({ title: "Berlin in 10 minutes" });
  });
});
