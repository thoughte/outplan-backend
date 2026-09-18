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

/** What the extension says, when the browser will not say.
 *
 *  Browsers disagree about unfamiliar extensions: the same .md file arrives as
 *  text/markdown from one and application/octet-stream from another, and .heic
 *  and .csv are just as inconsistent. Rejecting on that would mean a file
 *  uploads from his laptop and fails from his phone, for no reason he can see.
 *
 *  This stays an ALLOWLIST - the extension must still be one we accept, and an
 *  unknown extension is still refused. It only supplies a type the browser
 *  declined to guess; it never overrides one the browser did send.
 */
const BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown',
  csv: 'text/csv', json: 'application/json', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  png: 'image/png', heic: 'image/heic', doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const VAGUE = new Set(['application/octet-stream', 'binary/octet-stream', '', 'application/x-unknown']);

/** The media type to trust for this upload, or null to refuse it. */
export function resolveType(mimetype: string | undefined, filename: string): string | null {
  const given = (mimetype ?? '').toLowerCase().split(';')[0].trim();
  if (given && !VAGUE.has(given)) return ACCEPTED[given] ? given : null;
  const ext = filename.toLowerCase().split('.').pop() ?? '';
  const guessed = BY_EXTENSION[ext];
  return guessed && ACCEPTED[guessed] ? guessed : null;
}

export const uploadSchema = z.object({
  kind: z.enum(['report', 'plan', 'scan', 'note', 'other']).default('other'),
  status: z.enum(['current', 'superseded', 'draft']).default('current'),
  /// The date the CONTENT is about. Not when it was uploaded.
  contentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  note: z.string().max(500).optional(),
});
export type UploadInput = z.infer<typeof uploadSchema>;
