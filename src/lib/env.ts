/**
 * Pryse runs as the live system only when NEXT_PUBLIC_PRYSE_ENV=production.
 * Anything else (qa, test, local, unset) is a testing system: every screen,
 * PDF and email is marked TESTING so nothing can be mistaken for a real
 * invoice or a legally signed document.
 */
export const IS_TESTING = (process.env.NEXT_PUBLIC_PRYSE_ENV || "").trim().toLowerCase() !== "production";
export const TEST_LABEL = "TESTING";
export const TEST_NOTE = "Test system. Not a valid tax invoice or legally signed document.";
