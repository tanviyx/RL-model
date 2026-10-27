import test from "node:test";
import assert from "node:assert/strict";
import { validateEmail } from "../utils/validateEmail.js";

const dnsErr = (code) => Object.assign(new Error(code), { code });
// A fake DNS: gmail.com has MX, a-only.com only an A record, nullmx.com a "null MX", servfail.com errors.
const resolver = {
  resolveMx: async (d) => {
    if (d === "gmail.com") return [{ exchange: "gmail-smtp-in.l.google.com", priority: 5 }];
    if (d === "nullmx.com") return [{ exchange: ".", priority: 0 }];
    if (d === "a-only.com") throw dnsErr("ENODATA");
    if (d === "servfail.com") throw dnsErr("ESERVFAIL");
    throw dnsErr("ENOTFOUND");
  },
  resolve4: async (d) => { if (d === "a-only.com") return ["1.2.3.4"]; throw dnsErr("ENOTFOUND"); },
  resolve6: async () => { throw dnsErr("ENODATA"); },
};

test("a real-looking address is accepted and normalised", async () => {
  const r = await validateEmail("  Tanvi@Gmail.com ", resolver);
  assert.deepEqual(r, { ok: true, email: "tanvi@gmail.com" });
});

test("a domain with only an A record can still receive mail", async () => {
  assert.equal((await validateEmail("x@a-only.com", resolver)).ok, true);
});

for (const bad of ["", undefined, "no at sign", "a@b@gmail.com", "a..b@gmail.com", ".a@gmail.com", "x@-bad.com", "x@gmail"]) {
  test(`rejects malformed address ${JSON.stringify(bad)}`, async () => {
    const r = await validateEmail(bad, resolver);
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
  });
}

test("suggests the right domain for a common typo", async () => {
  const r = await validateEmail("tanvi@gmial.com", resolver);
  assert.equal(r.ok, false);
  assert.match(r.message, /tanvi@gmail\.com/);
});

test("blocks throwaway domains", async () => {
  const r = await validateEmail("x@mailinator.com", resolver);
  assert.equal(r.ok, false);
  assert.match(r.message, /Disposable/);
});

test("rejects domains that cannot receive mail", async () => {
  for (const d of ["nope-domain-xyz.com", "nullmx.com"]) {
    const r = await validateEmail(`x@${d}`, resolver);
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
  }
});

test("a DNS outage is reported as try-again (503), not as a bad address", async () => {
  const origError = console.error;
  console.error = () => {};
  try {
    const r = await validateEmail("x@servfail.com", resolver);
    assert.equal(r.ok, false);
    assert.equal(r.status, 503);
  } finally { console.error = origError; }
});