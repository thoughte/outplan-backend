/** Small, focused utilities. Anything that grows a branch belongs in a module. */

export function isBlank(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
}

/** ISO date in a fixed zone, for day bucketing. Never use the server's locale:
 *  a meal logged at 00:30 IST belongs to that day, not to the UTC one. */
export function localDay(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(at);
}

/** The clock, where they are, written for a prompt.
 *
 *  The app told him it was the 18th when it was the 19th, and guessed "10 to 11"
 *  when it was 04:53, having inferred the hour from his dinner and his
 *  cigarette. Everything downstream of timing inherited that: it had already
 *  told him food landed close to bedtime three nights that week, which it had no
 *  way to know.
 *
 *  Said plainly, and never guessed. Where the zone is not established this
 *  returns null and the prompt says the time is unknown, because an app that is
 *  confidently wrong about when something happened is worse than one that admits
 *  it cannot tell.
 */
export function clockFor(at: Date, timezone: string | null | undefined): string | null {
  if (!timezone) return null;
  try {
    const f = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone, weekday: 'long', day: 'numeric', month: 'long',
      year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
    });
    return f.format(at);
  } catch {
    // An unknown zone is not a reason to invent one.
    return null;
  }
}

/** The modern IANA name for a zone.
 *
 *  Browsers still report legacy aliases: a phone in Kanpur returns
 *  "Asia/Calcutta", not "Asia/Kolkata". Both work everywhere, which is exactly
 *  why it goes unnoticed, and then two people in the same city are stored under
 *  different strings and anything grouping by zone treats them as two places.
 *
 *  An explicit map, NOT Intl. `Intl.resolvedOptions().timeZone` was the obvious
 *  way to do this and it is runtime-dependent: on the Node this runs on it
 *  resolves "Asia/Kolkata" TO "Asia/Calcutta", the opposite direction, so the
 *  server and the browser could each helpfully normalise toward a different
 *  answer. A lookup table is boring and gives the same result everywhere.
 *
 *  Anything not listed passes through untouched. A zone this table has not heard
 *  of is far more likely to be correct than to be a legacy name worth guessing
 *  at.
 */
const ZONE_ALIASES: Record<string, string> = {
  'asia/calcutta': 'Asia/Kolkata',
  'asia/dacca': 'Asia/Dhaka',
  'asia/katmandu': 'Asia/Kathmandu',
  'asia/rangoon': 'Asia/Yangon',
  'asia/saigon': 'Asia/Ho_Chi_Minh',
  'asia/thimbu': 'Asia/Thimphu',
  'america/buenos_aires': 'America/Argentina/Buenos_Aires',
  'europe/kiev': 'Europe/Kyiv',
  'australia/canberra': 'Australia/Sydney',
  'pacific/samoa': 'Pacific/Pago_Pago',
};

export function canonicalZone(tz: string): string {
  const given = tz.trim();
  return ZONE_ALIASES[given.toLowerCase()] ?? given;
}

/** Is this a zone this machine can actually use? A stored zone that throws when
 *  formatted is worse than no zone: every later call fails, not this one. */
export function isUsableZone(tz: string): boolean {
  try { Intl.DateTimeFormat('en', { timeZone: tz }); return true; } catch { return false; }
}
