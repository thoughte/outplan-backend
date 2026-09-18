import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ENV_CONFIG } from '../../config/env.config';
import { prisma } from '../../lib/prisma';
import { pdfText } from '../../lib/pdf-text';

/** Read the files that have been uploaded but not yet read.
 *
 *  A file is digested EXACTLY ONCE, and this is where that happens: the bytes
 *  go in, text and identity come out, and from then on the engine sees only the
 *  database. A PDF nobody has read is, to everything downstream, a report that
 *  does not exist.
 *
 *  IT NEVER EXTRACTS MEASUREMENTS. Not one value is read out of these files.
 *  His 732 measurements, 573 genetic markers and 8 reports were extracted once,
 *  over a very long and very expensive analysis, and they are already in the
 *  record. Re-deriving them from the same PDFs would spend that again to produce
 *  numbers we already have - and would quietly introduce a second, disagreeing
 *  version of his own results.
 *
 *  So the text is read for exactly two purposes: to check whose report this is,
 *  and to work out WHICH already-known report it is. Then the existing rows are
 *  pointed at the page they came from. Identification and provenance, never
 *  re-extraction.
 *
 *  It runs after the server is already listening, never before. Reading a
 *  43-page scan takes a second or two; doing that at boot would mean a deploy
 *  where the service is down for as long as the backlog is large, and the whole
 *  point of the last outage was that a container which cannot answer is worse
 *  than one with work still queued.
 */

/** Sample collection date, in the several ways labs print it.
 *
 *  Collection, never the date the report was issued - those are routinely weeks
 *  apart, and a trend plotted against issue dates is a trend of the lab's
 *  admin rather than of him. */
const DATE_PATTERNS: { re: RegExp; parse: (m: RegExpMatchArray) => string | null }[] = [
  // "Sample Collection Date : 04/Sep/2026"
  { re: /(?:sample\s+collection|collection|collected)\s*(?:date)?\s*[:\-]?\s*(\d{1,2})[\/\-\s]([A-Za-z]{3,})[\/\-\s](\d{2,4})/i,
    parse: (m) => iso(m[3], month(m[2]), m[1]) },
  // "Registered: 09 Apr, 24 09:20 PM"
  { re: /registered\s*[:\-]?\s*(\d{1,2})\s+([A-Za-z]{3,})\s*,?\s*(\d{2,4})/i,
    parse: (m) => iso(m[3], month(m[2]), m[1]) },
  // "Collected On: 04-09-2026"
  { re: /(?:collect\w*|drawn)\s*(?:on|date)?\s*[:\-]?\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i,
    parse: (m) => iso(m[3], Number(m[2]), m[1]) },
];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const month = (s: string): number => MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1;

function iso(y: string, m: number, d: string): string | null {
  if (!m) return null;
  // A two-digit year is this century. These are lab reports, not history.
  const year = y.length === 2 ? 2000 + Number(y) : Number(y);
  if (year < 2000 || year > 2100) return null;
  return `${year}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Any date, in the formats labs actually print. */
const LOOSE = [
  { re: /\b(\d{1,2})[\/\-\s]([A-Za-z]{3,})[\/\-\s,]?\s*(\d{2,4})\b/, y: 3, mo: 2, d: 1, named: true },
  { re: /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})\b/, y: 3, mo: 2, d: 1, named: false },
];

/** Where the value sits relative to its label. */
const NEAR_LABEL = /(sample\s+collect\w*(?:\s+on)?|collection\s+date|collected\s+on|drawn\s+on|registered)\s*[:\-]?/i;

export function collectionDate(text: string): string | null {
  // Same line first - unambiguous when the lab prints it that way.
  for (const { re, parse } of DATE_PATTERNS) {
    const m = text.match(re);
    if (m) { const d = parse(m); if (d) return d; }
  }

  // Then near the label. His 2022 and 2023 Healthians reports are laid out in
  // two columns, so "Sample Collected On" and its value end up on different
  // lines and no same-line pattern can ever match them. Look just after the
  // label instead - close enough that it is still that label's value, not the
  // next field's.
  const at = text.search(NEAR_LABEL);
  if (at >= 0) {
    const window = text.slice(at, at + 220);
    for (const f of LOOSE) {
      const m = window.match(f.re);
      if (!m) continue;
      const mo = f.named ? month(m[f.mo]) : Number(m[f.mo]);
      const d = iso(m[f.y], mo, m[f.d]);
      if (d) return d;
    }
  }
  return null;
}

/** The lab's booking reference. Long digit strings only - short ones are ages,
 *  page numbers and reference ranges. */
export function bookingRef(text: string): string | null {
  const m = text.match(/(?:booking|order|visit|patient)\s*(?:id|no\.?|ref\w*)\s*[:\-#]?\s*([A-Z0-9]{6,})/i);
  return m ? m[1].toUpperCase() : null;
}

/** Is this the right person's report?
 *
 *  His first rule about any report, and it comes before anything else is read.
 *  A file that names someone else must never have its numbers folded into his
 *  record - and a household shares a laptop, an email address and a lab.
 */
export function namesPerson(text: string, fullName: string): boolean {
  const flat = text.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ');
  const parts = fullName.toLowerCase().split(/\s+/).filter((p) => p.length > 2);
  return parts.every((p) => flat.includes(p));
}

export interface DigestOutcome {
  file: string;
  result: 'read' | 'scanned-no-text' | 'wrong-person' | 'same-report-already-here' | 'failed' | 'skipped-type';
  detail?: string;
}

export async function digestPending(userId: string, fullName: string, limit = 25): Promise<DigestOutcome[]> {
  const pending = await prisma.storedFile.findMany({
    where: { userId, digestedAt: null },
    orderBy: { uploadedAt: 'asc' },
    take: limit,
  });

  const outcomes: DigestOutcome[] = [];

  for (const f of pending) {
    try {
      if (f.mediaType !== 'application/pdf') {
        outcomes.push({ file: f.filename, result: 'skipped-type', detail: f.mediaType });
        continue;
      }
      const bytes = await readFile(join(ENV_CONFIG.FILES_DIR, f.path));
      const { text, pages, looksScanned } = await pdfText(bytes);

      if (looksScanned) {
        await prisma.storedFile.update({
          where: { id: f.id },
          data: { digestNote: `${pages} pages, no selectable text - looks like a photographed or scanned page` },
        });
        outcomes.push({ file: f.filename, result: 'scanned-no-text', detail: `${pages} pages` });
        continue;
      }

      // IDENTITY FIRST. Nothing else is read from a file that names someone else.
      if (!namesPerson(text, fullName)) {
        await prisma.storedFile.update({
          where: { id: f.id },
          data: { digestNote: `not linked: this file does not name ${fullName}` },
        });
        outcomes.push({ file: f.filename, result: 'wrong-person' });
        continue;
      }

      const date = collectionDate(text);
      const ref = bookingRef(text);

      // DUPLICATE SECOND, and by CONTENT rather than by bytes. The same report
      // downloaded twice is two different files with two different hashes - the
      // upload dedup cannot see it, and only reading them can.
      if (ref || date) {
        const twin = await prisma.storedFile.findFirst({
          where: {
            userId, id: { not: f.id }, digestedAt: { not: null },
            ...(ref ? { text: { contains: ref } } : { contentDate: date ? new Date(`${date}T00:00:00Z`) : undefined }),
          },
        });
        if (twin) {
          await prisma.storedFile.update({
            where: { id: f.id },
            data: {
              text, digestedAt: new Date(), status: 'superseded',
              contentDate: date ? new Date(`${date}T00:00:00Z`) : null,
              digestNote: `same report as "${twin.filename}" (${ref ?? date}) - kept, but not read into the record twice`,
            },
          });
          outcomes.push({ file: f.filename, result: 'same-report-already-here', detail: twin.filename });
          continue;
        }
      }

      // Match to a report already in the record.
      //
      // Booking reference first, because two of his blood panels were collected
      // on the same day and a date cannot separate them. But a reference is not
      // unique either: his 22 Apr 2023 blood panel and his DNA report carry the
      // SAME booking number, 7916244308, because they came from one visit. So
      // among the reports that match, prefer one that has no file yet -
      // otherwise the second upload overwrites the first one's provenance and
      // the DNA report silently claims the blood panel's pages.
      const matches = ref
        ? await prisma.report.findMany({ where: { userId, bookingRef: ref } })
        : [];
      const byDate = date && !matches.length
        ? await prisma.report.findMany({ where: { userId, collectedOn: new Date(`${date}T00:00:00Z`) } })
        : [];
      const pool = matches.length ? matches : byDate;
      const report = pool.find((r) => !r.sourceFileId) ?? null;

      await prisma.storedFile.update({
        where: { id: f.id },
        data: {
          text, digestedAt: new Date(),
          contentDate: date ? new Date(`${date}T00:00:00Z`) : null,
          digestNote: report
            ? null
            : `read (${pages} pages)${date ? `, collected ${date}` : ', no collection date found'} - no report in the record matches it yet`,
        },
      });

      if (report) {
        // Provenance, both ways: the report knows its file, and every number
        // read off it points straight back at the page it was printed on.
        await prisma.report.update({ where: { id: report.id }, data: { sourceFileId: f.id } });
        const linked = await prisma.measurement.updateMany({
          where: { reportId: report.id }, data: { sourceFileId: f.id },
        });
        outcomes.push({ file: f.filename, result: 'read', detail: `${date ?? 'no date'} - linked ${linked.count} measurements` });
      } else {
        outcomes.push({
          file: f.filename,
          result: 'read',
          detail: pool.length
            ? `${date ?? 'no date'} - matches ${pool.length} report(s), all of which already have a file`
            : `${date ?? 'no date'} - no report in the record matches it`,
        });
      }
    } catch (e) {
      await prisma.storedFile.update({
        where: { id: f.id }, data: { digestNote: `could not read: ${(e as Error).message}` },
      }).catch(() => undefined);
      outcomes.push({ file: f.filename, result: 'failed', detail: (e as Error).message });
    }
  }

  return outcomes;
}
