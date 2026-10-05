// Strips everything except digits (and a leading '+') so equivalent
// phone numbers typed/stored with different formatting — "+91 9825041200",
// "+919825041200", "+91 98250 41200" — all normalize to the same string.
// Used both when persisting a phone number and when checking for
// duplicates, so the two can never drift out of sync with each other.
export function normalizePhoneNumber(raw: string): string {
  const trimmed = raw.trim();
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  return hasPlus ? `+${digits}` : digits;
}

// True when an edit form re-submits the number already stored for that user.
// Older records were saved without a country code ("9876543210") while the
// forms now send one ("+919876543210"), so a prefixed and an unprefixed value
// also match when they differ only by a 1–3 digit country code.
export function isSamePhoneNumber(
  stored: string | null | undefined,
  submitted: string,
): boolean {
  if (!stored) return false;
  const a = normalizePhoneNumber(stored);
  const b = normalizePhoneNumber(submitted);
  if (a === b) return true;
  if (a.startsWith('+') === b.startsWith('+')) return false;
  const [withCode, withoutCode] = a.startsWith('+')
    ? [a.slice(1), b]
    : [b.slice(1), a];
  const extra = withCode.length - withoutCode.length;
  return (
    withoutCode.length >= LOOSE_PHONE_MIN_DIGITS &&
    extra >= 1 &&
    extra <= 3 &&
    withCode.endsWith(withoutCode)
  );
}

// Accepted shape for a mobile number on our create/edit forms: digits only,
// an optional single leading '+', and at most 15 digits (E.164's ceiling).
// No spaces, hyphens or letters. Shared by every DTO that validates a phone
// so the rule can't drift between modules.
export const PHONE_NUMBER_REGEX = /^\+?\d{1,15}$/;

// Same rule, but also allows an empty string — for optional phone fields,
// where class-validator's `@IsOptional()` only skips `undefined`/`null`.
export const OPTIONAL_PHONE_NUMBER_REGEX = /^(\+?\d{1,15})?$/;

export const PHONE_NUMBER_MESSAGE =
  'Mobile number must contain digits only (optionally starting with +) and be at most 15 digits.';

// ---------------------------------------------------------------------------
// Loose variant — for CRM / lead-facing contact fields where an agent types
// or pastes a number with its original formatting. Allows an optional single
// leading '+', then digits with spaces, hyphens, parentheses and dots as
// separators. Letters and other symbols are rejected.
//
// The bound is on DIGIT COUNT, not string length: 7–15 digits after stripping
// separators. 15 is E.164's ceiling; 7 is a safe floor that still admits every
// market this product serves — India mobile is 10 national digits, Gulf 9
// (12 with the +971 country code), US 10 (11 with +1) — without hard-coding
// any one country's format.
export const LOOSE_PHONE_MIN_DIGITS = 7;
export const LOOSE_PHONE_MAX_DIGITS = 15;

// Char set + digit-count in one pattern: the lookahead counts total digits
// (7–15), the body constrains the allowed characters.
export const LOOSE_PHONE_NUMBER_REGEX =
  /^(?=(?:\D*\d){7,15}\D*$)\+?[\d()\s.-]+$/;

// Same rule, but also matches '' — for optional fields, where class-validator's
// `@IsOptional()` only skips `undefined` / `null`, not the empty string.
export const OPTIONAL_LOOSE_PHONE_NUMBER_REGEX =
  /^(?:(?=(?:\D*\d){7,15}\D*$)\+?[\d()\s.-]+)?$/;

export const LOOSE_PHONE_NUMBER_MESSAGE =
  'Enter a valid phone number: digits only (7–15 of them), optionally starting with + and using spaces or hyphens to format.';

/** Runtime check matching LOOSE_PHONE_NUMBER_REGEX, for use outside DTOs. */
export function isValidLoosePhone(raw: string): boolean {
  const value = raw.trim();
  if (!/^\+?[\d()\s.-]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  return (
    digits.length >= LOOSE_PHONE_MIN_DIGITS &&
    digits.length <= LOOSE_PHONE_MAX_DIGITS
  );
}
