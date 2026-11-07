// Generate a VAPID key pair for web push. Usage: npm run vapid
// Put the values in .dev.vars for local use, and as secrets in Cloudflare:
//   npx wrangler secret put VAPID_PUBLIC_KEY   (and VAPID_PRIVATE_KEY, VAPID_SUBJECT)
const b64u = (buf) => Buffer.from(buf).toString("base64url");
const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = await crypto.subtle.exportKey("raw", kp.publicKey);
const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
console.log(`VAPID_PUBLIC_KEY=${b64u(pub)}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
console.log(`VAPID_SUBJECT=mailto:you@example.com`);
