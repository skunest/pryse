import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "crypto";

export const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

/** A random URL-safe token. Only its hash is stored. */
export const newToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const newOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

export const otpHash = (signerId: string, code: string) => sha256(`otp:${signerId}:${code}`);

export function safeEqual(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export const OTP_TTL_MIN = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_SECONDS = 60;
export const SESSION_TTL_MIN = 45;

/**
 * Document types and whether an ordinary electronic signature is allowed.
 * ECTA (Act 25 of 2002) s4(3)-(4) and Schedules 1 and 2 exclude some
 * transactions entirely. Others carry a warning to check formalities.
 */
export const DOCUMENT_TYPES: { value: string; label: string; allowed: boolean; note?: string }[] = [
  { value: "engagement_letter", label: "Letter of engagement", allowed: true },
  { value: "mandate", label: "Mandate", allowed: true },
  { value: "fee_agreement", label: "Fee agreement", allowed: true },
  { value: "settlement_agreement", label: "Settlement agreement", allowed: true },
  { value: "acknowledgement_of_debt", label: "Acknowledgement of debt", allowed: true },
  { value: "consent_form", label: "Consent or declaration form", allowed: true },
  { value: "fica_declaration", label: "FICA declaration", allowed: true },
  { value: "commercial_agreement", label: "Commercial agreement or contract", allowed: true },
  { value: "power_of_attorney", label: "Power of attorney", allowed: true,
    note: "Some powers of attorney (for example for the Deeds Office or court) require a handwritten or advanced electronic signature. Check the requirements before sending." },
  { value: "other", label: "Other document", allowed: true,
    note: "Make sure no law requires a handwritten, witnessed or commissioned signature for this document." },
  { value: "sale_of_land", label: "Agreement for the sale of land or immovable property", allowed: false,
    note: "ECTA excludes agreements for the alienation of immovable property. These must be signed by hand." },
  { value: "long_lease", label: "Long-term lease of immovable property (20 years or more)", allowed: false,
    note: "ECTA excludes long-term leases of immovable property for 20 years or longer." },
  { value: "will", label: "Will or codicil", allowed: false,
    note: "ECTA excludes wills and codicils. These must be signed by hand in front of witnesses." },
  { value: "bill_of_exchange", label: "Bill of exchange", allowed: false,
    note: "ECTA excludes bills of exchange." },
  { value: "affidavit", label: "Affidavit or sworn statement", allowed: false,
    note: "Affidavits must be signed before a commissioner of oaths and cannot be signed through Pryse." },
];

export function documentType(value: string) {
  return DOCUMENT_TYPES.find((d) => d.value === value);
}

export function maskEmail(email: string) {
  const [u, d] = email.split("@");
  if (!d) return email;
  return `${u.slice(0, 1)}${"*".repeat(Math.max(2, u.length - 2))}${u.slice(-1)}@${d}`;
}
