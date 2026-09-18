/** Every agent key starts with this.
 *
 *  A distinct prefix so the middleware can tell instantly which kind of
 *  credential arrived, without trying to verify a Firebase token first and
 *  reading the failure as permission to try something else. Ambiguity between
 *  two credential types is how one ends up being accepted in place of the
 *  other. */
export const AGENT_PREFIX = 'oak_';

import { z } from 'zod';

export const createKeySchema = z.object({
  label: z.string().min(1, 'Give it a name you will recognise later').max(60),
  /** Bounded on purpose. A key with no end date is a key nobody remembers
   *  issuing, and this one reaches a health record. */
  days: z.number().int().min(1).max(365).default(30),
});
export type CreateKeyInput = z.infer<typeof createKeySchema>;

/** At most this many live at once. Not about abuse - it is his own account -
 *  but a list of twenty keys is a list nobody reads, and unread is the same as
 *  invisible. */
export const MAX_LIVE_KEYS = 5;

export interface AgentKeyView {
  id: string;
  label: string;
  scopes: string[];
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
}
