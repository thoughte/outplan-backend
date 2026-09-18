import { z } from 'zod';

/** What the browser is allowed to send.
 *
 *  An allowlist rather than a blocklist. This endpoint writes attacker-supplied
 *  bytes to disk under a name the attacker influences, so the question is never
 *  "is this dangerous" but "is this one of the few things we actually accept".
 */
export const ACCEPTED: Record<string, string> = {
  'application/pdf': 'pdf',
  'text/plain': 'txt',
  'text/markdown': 'md',
  'text/csv': 'csv',
  'application/json': 'json',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
};

/** Types whose bytes ARE their text. Anything else is stored and left for a
 *  parser; a PDF read as UTF-8 produces convincing garbage, which is worse than
 *  no text at all because nothing downstream can tell it is garbage. */
export const TEXTUAL = new Set(['text/plain', 'text/markdown', 'text/csv', 'application/json']);

export const uploadSchema = z.object({
  kind: z.enum(['report', 'plan', 'scan', 'note', 'other']).default('other'),
  status: z.enum(['current', 'superseded', 'draft']).default('current'),
  /// The date the CONTENT is about. Not when it was uploaded.
  contentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).optional(),
});
export type UploadInput = z.infer<typeof uploadSchema>;
