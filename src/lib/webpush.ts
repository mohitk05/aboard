// Web Push from a Worker, with WebCrypto only:
//   - RFC 8291 message encryption (aes128gcm content coding)
//   - RFC 8292 VAPID: an ES256 JWT that proves the push comes from this server
//
// VAPID keys are base64url strings: the public key is the 65-byte uncompressed P-256 point,
// the private key is the 32-byte scalar. Generate a pair with `npm run vapid`.

export interface PushSubscription {
  endpoint: string;
  p256dh: string; // browser's public key, base64url
  auth: string; // 16-byte auth secret, base64url
}

export interface VapidKeys {
  publicKey: string;
  privateKey: string;
  subject: string; // "mailto:you@example.com" or an https URL
}

const enc = new TextEncoder();

export const b64u = {
  encode(bytes: ArrayBuffer | Uint8Array): string {
    let s = "";
    for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  },
  decode(s: string): Uint8Array {
    const pad = "=".repeat((4 - (s.length % 4)) % 4);
    return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad), (c) => c.charCodeAt(0));
  },
};

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** Encrypt `payload` for one subscription. Returns the request body (RFC 8188 header + ciphertext). */
export async function encryptPayload(
  sub: Pick<PushSubscription, "p256dh" | "auth">,
  payload: Uint8Array,
  opts: { salt?: Uint8Array; serverKeys?: CryptoKeyPair } = {},
): Promise<Uint8Array> {
  const uaPublic = b64u.decode(sub.p256dh);
  const authSecret = b64u.decode(sub.auth);
  const salt = opts.salt ?? crypto.getRandomValues(new Uint8Array(16));

  const server =
    opts.serverKeys ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPublic = new Uint8Array((await crypto.subtle.exportKey("raw", server.publicKey)) as ArrayBuffer);
  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdhSecret = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, server.privateKey, 256),
  );

  // RFC 8291 §3.4: combine the ECDH secret with the auth secret.
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, ecdhSecret, keyInfo, 32);
  // RFC 8188 §2.2–2.3: content encryption key and nonce.
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);

  const key = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const plaintext = concat(payload, new Uint8Array([2])); // 0x02 = last (and only) record, no padding
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, ciphertext);
}

/** Import a VAPID private key (32-byte scalar) using its public key for x/y. */
async function vapidSigningKey(keys: VapidKeys): Promise<CryptoKey> {
  const pub = b64u.decode(keys.publicKey);
  if (pub.length !== 65 || pub[0] !== 4) throw new Error("VAPID public key must be a 65-byte uncompressed P-256 point");
  return crypto.subtle.importKey(
    "jwk",
    {
      kty: "EC",
      crv: "P-256",
      x: b64u.encode(pub.slice(1, 33)),
      y: b64u.encode(pub.slice(33, 65)),
      d: keys.privateKey,
      ext: true,
    },
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
}

/** RFC 8292 Authorization header value for a push to `endpoint`. */
export async function vapidAuthorization(endpoint: string, keys: VapidKeys, now = Date.now()): Promise<string> {
  const header = b64u.encode(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u.encode(
    enc.encode(
      JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: keys.subject }),
    ),
  );
  const signingInput = `${header}.${claims}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, await vapidSigningKey(keys), enc.encode(signingInput));
  return `vapid t=${signingInput}.${b64u.encode(sig)}, k=${keys.publicKey}`;
}

export interface PushMessage {
  title: string;
  body: string;
  /** Where tapping the notification takes you. */
  url?: string;
  /** Notifications with the same tag replace each other. */
  tag?: string;
}

/**
 * Send one notification. Returns the push service's HTTP status:
 * 201 = accepted; 404/410 = the subscription is gone and should be deleted.
 */
export async function sendPush(
  sub: PushSubscription,
  msg: PushMessage,
  keys: VapidKeys,
  fetchImpl: typeof fetch = fetch,
): Promise<number> {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(msg)));
  const res = await fetchImpl(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: await vapidAuthorization(sub.endpoint, keys),
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      TTL: String(6 * 3600),
      Urgency: "normal",
      ...(msg.tag ? { Topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) } : {}),
    },
    body,
  });
  return res.status;
}
