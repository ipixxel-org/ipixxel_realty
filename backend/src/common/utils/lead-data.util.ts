const NAME_KEYS = [
  'fullName',
  'full_name',
  'name',
  'Name',
  'Full Name',
  'Full name',
  'Your Name',
  'Your name',
  'full name',
];
const PHONE_KEYS = [
  'phone',
  'phoneNumber',
  'phone_number',
  'Phone',
  'Phone Number',
  'Phone number',
  'phone number',
  'Mobile',
  'mobile',
  'WhatsApp',
  'whatsapp',
];
const EMAIL_KEYS = [
  'email',
  'Email',
  'emailAddress',
  'Email Address',
  'Email address',
  'email_address',
];
const PROJECT_KEYS = ['project', 'Project', 'projectName', 'Project Name'];
const UNIT_KEYS = ['unitId', 'Unit ID', 'unit_id', 'UnitId'];
const INTEREST_KEYS = [
  'interestedIn',
  'Interested in',
  'interested_in',
  'Interest',
  'Configuration',
];

const ALIAS_GROUPS: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: 'fullName', aliases: NAME_KEYS },
  { canonical: 'phone', aliases: PHONE_KEYS },
  { canonical: 'email', aliases: EMAIL_KEYS },
  { canonical: 'interestedIn', aliases: INTEREST_KEYS },
  { canonical: 'project', aliases: PROJECT_KEYS },
];

function firstString(
  data: Record<string, unknown>,
  keys: string[],
): string | null {
  for (const key of keys) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function firstMatching(
  data: Record<string, unknown>,
  pattern: RegExp,
  skip: RegExp,
): string | null {
  for (const [key, value] of Object.entries(data)) {
    if (skip.test(key)) continue;
    if (typeof value === 'string' && value.trim() && pattern.test(key)) {
      return value.trim();
    }
  }
  return null;
}

/** At least 6 digits — rules out consent values like "yes" in a phone slot. */
function looksLikePhone(value: string): boolean {
  return (value.match(/\d/g) ?? []).length >= 6;
}

/**
 * The lead's phone. Prefers a value that actually looks like a number: a
 * "Contact me on WhatsApp" checkbox used to overwrite `phone` with "yes",
 * while the real number stayed under the field's own label. Falls back to the
 * old first-match behaviour when nothing looks like a phone.
 */
function resolvePhone(data: Record<string, unknown>, skip?: RegExp): string | null {
  const candidates: string[] = [];
  for (const key of PHONE_KEYS) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) candidates.push(v.trim());
  }
  for (const [key, v] of Object.entries(data)) {
    if (skip?.test(key)) continue;
    if (typeof v === 'string' && v.trim() && /phone|mobile|whatsapp/i.test(key)) {
      candidates.push(v.trim());
    }
  }
  return candidates.find(looksLikePhone) ?? candidates[0] ?? null;
}

function sameValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  return typeof left === 'string' && typeof right === 'string' && left.trim() === right.trim();
}

function collapseAliases(
  data: Record<string, unknown>,
  canonical: string,
  aliases: string[],
  value: string | null,
) {
  if (!value) return;
  data[canonical] = value;
  for (const alias of aliases) {
    if (alias !== canonical && sameValue(data[alias], value)) delete data[alias];
  }
}

export function normalizeLeadData(
  data: Record<string, unknown>,
  extras?: { unitId?: string | null; projectName?: string | null },
): Record<string, unknown> {
  const next = { ...data };
  const skip = /project|unit|form|source|id$/i;
  const fullName =
    firstString(data, NAME_KEYS) ?? firstMatching(data, /\bname\b/i, skip);
  const phone = resolvePhone(data, skip);
  const email =
    firstString(data, EMAIL_KEYS) ?? firstMatching(data, /email/i, skip);
  const project = extras?.projectName ?? firstString(data, PROJECT_KEYS);
  const unitId = extras?.unitId ?? firstString(data, UNIT_KEYS);
  const interestedIn =
    firstString(data, INTEREST_KEYS) ??
    firstMatching(data, /interest|configuration|bhk/i, skip);

  collapseAliases(next, 'fullName', ALIAS_GROUPS[0].aliases, fullName);
  collapseAliases(next, 'phone', ALIAS_GROUPS[1].aliases, phone);
  collapseAliases(next, 'email', ALIAS_GROUPS[2].aliases, email);
  collapseAliases(next, 'project', ALIAS_GROUPS[4].aliases, project);
  if (unitId) next.unitId = unitId;
  collapseAliases(next, 'interestedIn', ALIAS_GROUPS[3].aliases, interestedIn);
  return next;
}

export function leadContactFromData(data: Record<string, unknown>): {
  fullName: string | null;
  phone: string | null;
  email: string | null;
} {
  return {
    fullName: firstString(data, NAME_KEYS),
    phone: (() => {
      const p = firstString(data, PHONE_KEYS);
      // Never dedupe on a non-number ("yes") — it would merge different people.
      return p && looksLikePhone(p) ? p : null;
    })(),
    email: firstString(data, EMAIL_KEYS),
  };
}
