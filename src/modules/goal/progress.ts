/** How far along a goal is, and whether it is done.
 *
 *  Every number here is derived from the record. Nothing about progress is
 *  stored and updated by hand, because a stored percentage is a number that can
 *  drift away from the measurements it claims to summarise, and then the app is
 *  confidently telling someone about their health using a figure nothing
 *  supports.
 */

export type Direction = 'down' | 'up' | 'reach' | 'stop' | 'maintain';

export interface Standing {
  /** 0 to 1, or null when it genuinely cannot be known yet. Null is a real
   *  answer and gets shown as "waiting", never as 0%: a goal with no baseline
   *  has not failed to progress, it has not started. */
  fraction: number | null;
  current: number | null;
  reached: boolean;
  /** Said plainly, for a screen. "121.4 to 90, now 110" beats "34%". */
  summary: string;
}

/** Distance travelled between where he started and where he is going.
 *
 *  Clamped at both ends. Past the target is 100%, not 140% - a goal cannot be
 *  more finished than finished, and a bar that overflows tells him nothing
 *  except that the maths leaked.
 *
 *  Below the baseline is 0%, not negative. Going backwards is worth knowing and
 *  it is shown in the numbers, but a negative bar reads as punishment, and
 *  someone whose uric acid drifted up in a hard week does not need the app to
 *  stage a small ceremony about it.
 */
export function standing(
  baseline: number | null | undefined,
  target: number | null | undefined,
  current: number | null | undefined,
  direction: Direction,
  unit?: string | null,
): Standing {
  const u = unit ? ` ${unit}` : '';

  if (current == null) {
    return { fraction: null, current: null, reached: false, summary: 'no reading yet' };
  }
  if (baseline == null) {
    return { fraction: null, current, reached: false, summary: `now ${trim(current)}${u}, no starting number yet` };
  }
  if (target == null) {
    const moved = current - baseline;
    return {
      fraction: null, current, reached: false,
      summary: `${trim(baseline)} to ${trim(current)}${u}, no target set${moved === 0 ? '' : ` (${moved > 0 ? '+' : ''}${trim(moved)})`}`,
    };
  }

  const reached = direction === 'up' || direction === 'reach'
    ? current >= target
    : current <= target;

  const span = target - baseline;
  // Baseline already at target. It is either done or the target needs to move;
  // either way, reporting a division by zero as a percentage helps nobody.
  const fraction = span === 0
    ? (reached ? 1 : null)
    : Math.max(0, Math.min(1, (current - baseline) / span));

  return {
    fraction, current, reached,
    summary: `${trim(baseline)} to ${trim(target)}${u}, now ${trim(current)}${u}`,
  };
}

/** Adherence over a window: how often the thing actually happened.
 *
 *  For "stop" goals the arithmetic inverts - zero occurrences is 100%. Someone
 *  whose goal is no alcohol and who drank nothing all week has not scored zero.
 */
export function adherence(
  daysWithIt: number, daysInWindow: number, direction: Direction,
): Standing {
  if (!daysInWindow) return { fraction: null, current: null, reached: false, summary: 'no days to judge yet' };
  const rate = daysWithIt / daysInWindow;
  const fraction = direction === 'stop' ? 1 - rate : rate;
  return {
    fraction,
    current: daysWithIt,
    reached: direction === 'stop' ? daysWithIt === 0 : daysWithIt === daysInWindow,
    summary: direction === 'stop'
      ? `${daysWithIt} of the last ${daysInWindow} days`
      : `${daysWithIt} of ${daysInWindow} days`,
  };
}

/** A goal made of goals is as far along as its parts.
 *
 *  A plain mean, not weighted. Weighting invites a number nobody can check: if
 *  "go meds free" says 61%, he should be able to count six children and see
 *  why. Children with no reading yet are excluded rather than counted as zero,
 *  because a parent should not look like it is failing on account of a child
 *  that has not started.
 */
export function rollUp(children: (number | null)[]): number | null {
  const known = children.filter((c): c is number => c !== null);
  if (!known.length) return null;
  return known.reduce((a, b) => a + b, 0) / known.length;
}

const trim = (n: number): string =>
  Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
