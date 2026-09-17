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
