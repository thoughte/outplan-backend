import { createHash } from 'node:crypto';

export interface Fingerprint {
  present: boolean;
  chars: number;
  fp: string | null;
}

/** A comparable marker for a secret that reveals nothing about it.
 *
 *  The obvious version of this shows the first and last few characters. That
 *  works, and it also publishes ten real characters of a signing key on an
 *  endpoint anyone can reach. A truncated SHA-256 answers the same question -
 *  "is the value on the server the one I have?" - and is not reversible.
 *
 *  `chars` is here because it catches the failure this was written for without
 *  needing the hash at all: a value set as a build argument instead of a runtime
 *  variable arrives empty or truncated, and the length says so immediately.
 */
export function fingerprint(value: string | undefined | null): Fingerprint {
  const v = value ?? '';
  if (!v) return { present: false, chars: 0, fp: null };
  return {
    present: true,
    chars: v.length,
    fp: createHash('sha256').update(v).digest('hex').slice(0, 12),
  };
}
