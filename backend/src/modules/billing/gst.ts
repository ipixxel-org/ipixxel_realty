/**
 * GST reference data and checks for billing v2. States are identified by
 * their 2-digit GST state code — the first two characters of a GSTIN.
 */

/** GST state / UT codes in use (25 and 28 are retired; 97 = other territory). */
export const GST_STATES: Readonly<Record<string, string>> = {
  '01': 'Jammu and Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '31': 'Lakshadweep',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
  '38': 'Ladakh',
  '97': 'Other Territory',
};

export const isGstStateCode = (
  code: string | null | undefined,
): code is string =>
  !!code && Object.hasOwn(GST_STATES, code);

/** 2-digit state code, 10-char PAN, entity number, 'Z', checksum character. */
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function normaliseGstin(raw: string | null | undefined): string {
  return (raw ?? '').trim().toUpperCase();
}

/**
 * Checks a GSTIN's format and that its state code matches `stateCode`.
 * Returns a customer-readable problem, or null when valid. An empty GSTIN is
 * valid (it is optional) — callers decide whether it is required.
 */
export function gstinProblem(
  raw: string | null | undefined,
  stateCode: string | null | undefined,
): string | null {
  const gstin = normaliseGstin(raw);
  if (!gstin) return null;
  if (gstin.length !== 15) return 'A GSTIN has 15 characters.';
  if (!GSTIN_RE.test(gstin))
    return "That doesn't look like a GSTIN (format: 29ABCDE1234F1Z5).";
  if (stateCode && gstin.slice(0, 2) !== stateCode) {
    const name = GST_STATES[stateCode] ?? stateCode;
    return `This GSTIN is registered in state code ${gstin.slice(0, 2)}, but the state chosen is ${name} (${stateCode}).`;
  }
  return null;
}
