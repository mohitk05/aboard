import { expect } from "vitest";
import { b64u } from "../src/lib/webpush";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, bytes * 8));
}

/** A fake browser: a P-256 key pair and auth secret, and RFC 8291 decryption. */
export async function fakeBrowser() {
  const keys = (await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair;
  const publicRaw = new Uint8Array((await crypto.subtle.exportKey("raw", keys.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return {
    sub: { endpoint: `https://push.example.test/send/${crypto.randomUUID()}`, p256dh: b64u.encode(publicRaw), auth: b64u.encode(auth) },
    async decrypt(body: Uint8Array): Promise<string> {
      const salt = body.slice(0, 16);
      const rs = new DataView(body.buffer, body.byteOffset + 16, 4).getUint32(0);
      expect(rs).toBe(4096);
      const idlen = body[20]!;
      const asPublic = body.slice(21, 21 + idlen);
      const ciphertext = body.slice(21 + idlen);
      const asKey = await crypto.subtle.importKey("raw", asPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
      const ecdh = new Uint8Array(
        await crypto.subtle.deriveBits({ name: "ECDH", public: asKey } as unknown as SubtleCryptoDeriveKeyAlgorithm, keys.privateKey, 256),
      );
      const ikm = await hkdf(auth, ecdh, new Uint8Array([...enc.encode("WebPush: info\0"), ...publicRaw, ...asPublic]), 32);
      const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
      const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
      const k = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["decrypt"]);
      const plain = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: nonce }, k, ciphertext));
      expect(plain.at(-1)).toBe(2); // last-record delimiter
      return dec.decode(plain.slice(0, -1));
    },
  };
}

