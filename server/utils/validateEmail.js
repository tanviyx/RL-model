import dns from "dns/promises";

// Practical (not full RFC 5322) syntax check: local@domain.tld
const EMAIL_RE =
  /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/;

// Throwaway-mail providers. Extend this list as needed.
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "guerrillamail.net", "10minutemail.com",
  "10minutemail.net", "temp-mail.org", "tempmail.com", "throwawaymail.com",
  "yopmail.com", "trashmail.com", "getnada.com", "sharklasers.com",
  "dispostable.com", "maildrop.cc", "fakeinbox.com", "mintemail.com",
]);

// Very common typos -> suggestion
const TYPO_DOMAINS = {
  "gmial.com": "gmail.com", "gmai.com": "gmail.com", "gmal.com": "gmail.com",
  "gmail.co": "gmail.com", "gmail.con": "gmail.com", "gamil.com": "gmail.com",
  "yaho.com": "yahoo.com", "yahoo.con": "yahoo.com", "hotmial.com": "hotmail.com",
  "hotmail.con": "hotmail.com", "outlok.com": "outlook.com", "outlook.con": "outlook.com",
};

const DNS_TIMEOUT_MS = 4000;
const NOT_FOUND_CODES = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(Object.assign(new Error("DNS timeout"), { code: "ETIMEOUT" })), ms)
    ),
  ]);

/**
 * Can this domain receive mail? Checks MX records, then falls back to A/AAAA
 * (RFC 5321 "implicit MX"). Returns true / false, or throws on DNS failures
 * that say nothing about the domain (timeout, SERVFAIL, no network).
 */
const domainCanReceiveMail = async (domain, resolver) => {
  try {
    const mx = await withTimeout(resolver.resolveMx(domain), DNS_TIMEOUT_MS);
    // "Null MX" (RFC 7505): a single "." record means "this domain accepts no mail"
    const usable = mx.filter((r) => r.exchange && r.exchange !== ".");
    if (usable.length > 0) return true;
    if (mx.length > 0) return false;
  } catch (err) {
    if (!NOT_FOUND_CODES.has(err.code)) throw err;
  }

  for (const lookup of [resolver.resolve4, resolver.resolve6]) {
    try {
      const addrs = await withTimeout(lookup.call(resolver, domain), DNS_TIMEOUT_MS);
      if (addrs.length > 0) return true;
    } catch (err) {
      if (!NOT_FOUND_CODES.has(err.code)) throw err;
    }
  }
  return false;
};

/**
 * Validate an email address entirely on the server, no OTP.
 *
 * Returns:
 *   { ok: true,  email }                 -> normalized (trimmed, lowercased) address
 *   { ok: false, status: 400, message }  -> the address is not acceptable
 *   { ok: false, status: 503, message }  -> could not verify right now, try again
 *
 * Note: this proves the domain exists and accepts mail. It cannot prove that
 * this particular mailbox exists or belongs to the user - only sending a
 * message (OTP / link) can do that.
 */
export const validateEmail = async (rawEmail, resolver = dns) => {
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";

  if (!email) return { ok: false, status: 400, message: "Email is required" };

  const [local = "", domain = ""] = email.split("@");
  if (
    email.length > 254 ||
    local.length > 64 ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    !EMAIL_RE.test(email)
  ) {
    return { ok: false, status: 400, message: "Please enter a valid email address" };
  }

  if (TYPO_DOMAINS[domain]) {
    return {
      ok: false,
      status: 400,
      message: `Did you mean ${local}@${TYPO_DOMAINS[domain]}?`,
    };
  }

  if (DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, status: 400, message: "Disposable email addresses are not allowed" };
  }

  try {
    const canReceive = await domainCanReceiveMail(domain, resolver);
    if (!canReceive) {
      return {
        ok: false,
        status: 400,
        message: "This email domain cannot receive mail. Please use a real email address",
      };
    }
  } catch (err) {
    console.error("EMAIL DNS CHECK FAILED:", domain, err.code || err.message);
    return {
      ok: false,
      status: 503,
      message: "Could not verify this email right now. Please try again in a moment",
    };
  }

  return { ok: true, email };
};