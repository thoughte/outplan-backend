/** Reading a schedule the way it was written down.
 *
 *  His interventions carry human sentences, not cron: "once daily with
 *  breakfast", "once daily 20:00", "as needed (SOS)", "irregular", "uncertain".
 *  A plan is built by deciding which of those are things to do TODAY.
 */

export interface Slot {
  /** 'HH:MM' when the record actually says one. Null for "with breakfast",
   *  which is a time of day rather than a time; inventing 08:00 for it puts a
   *  deadline on something that never had one. */
  atLocal: string | null;
  /** Sorts the day. Morning before evening, and anything undated last. */
  sortOrder: number;
  /** How the person refers to this group: "morning meds", "night meds". This is
   *  what makes "took my morning meds" tick five boxes instead of none. */
  group: 'morning' | 'evening' | 'other';
}

/** Daily, or not on today's list at all.
 *
 *  As-needed, SOS, irregular and uncertain are deliberately excluded. Putting
 *  "Sildenafil - as needed" on a daily to-do list is absurd, and putting
 *  something described as "uncertain" on it asserts a routine that nobody
 *  established. A list that includes things he is not meant to do every day is a
 *  list he stops trusting.
 */
const NOT_DAILY = /as needed|\bsos\b|\bprn\b|irregular|uncertain|occasional|brief course/i;

export function slotFor(schedule: string | null | undefined): Slot | null {
  const s = (schedule ?? '').trim();
  if (!s || NOT_DAILY.test(s)) return null;

  // An explicit clock time wins: "once daily 20:00".
  const clock = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (clock) {
    const hh = Number(clock[1]);
    const atLocal = `${String(hh).padStart(2, '0')}:${clock[2]}`;
    return { atLocal, sortOrder: hh * 60 + Number(clock[2]), group: hh >= 16 ? 'evening' : 'morning' };
  }

  if (/breakfast|morning/i.test(s)) return { atLocal: null, sortOrder: 8 * 60, group: 'morning' };
  if (/lunch|midday|afternoon/i.test(s)) return { atLocal: null, sortOrder: 13 * 60, group: 'other' };
  if (/dinner|evening|night|bed/i.test(s)) return { atLocal: null, sortOrder: 20 * 60, group: 'evening' };
  if (/daily|every day|once a day/i.test(s)) return { atLocal: null, sortOrder: 12 * 60, group: 'other' };

  // Something with a schedule we cannot read. Left off rather than guessed at:
  // a plan is only useful if every line on it is true.
  return null;
}
