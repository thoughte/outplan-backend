/** Pull the text out of a PDF, server-side.
 *
 *  This is what makes an uploaded report part of the record rather than a file
 *  sitting on a disk. The engine only ever reads the database, so a PDF nobody
 *  has read is, to the engine, a report that does not exist.
 *
 *  No canvas and no rendering. Text extraction needs neither, and pulling a
 *  native graphics stack into the server image to read words off a page is how
 *  a build starts failing on Alpine again.
 */

/** pdf.js emits one item per positioned run, not per line. Joined naively, a
 *  two-column lab report becomes an unreadable ribbon and a value drifts away
 *  from the marker it belongs to. Items are grouped back into lines by their y
 *  position first. */
function toLines(items: { str: string; transform: number[] }[]): string[] {
  const rows = new Map<number, { x: number; s: string }[]>();
  for (const it of items) {
    if (!it.str) continue;
    // Round y so runs a fraction apart land on the same line.
    const y = Math.round(it.transform[5]);
    if (!rows.has(y)) rows.set(y, []);
    rows.get(y)!.push({ x: it.transform[4], s: it.str });
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])                       // PDF y grows upward
    .map(([, runs]) => runs.sort((a, b) => a.x - b.x).map((r) => r.s).join(' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export interface PdfText {
  pages: number;
  text: string;
  /** True when the file is almost certainly a scan: pages exist, words do not.
   *  Worth saying out loud - "we read it and found nothing" and "we could not
   *  read it" lead to different next steps, and only one of them is the user's
   *  problem. */
  looksScanned: boolean;
}

export async function pdfText(bytes: Buffer): Promise<PdfText> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task = pdfjs.getDocument({
    data: new Uint8Array(bytes),
    // No worker process on the server: one request should not spawn one.
    disableWorker: true,
    isEvalSupported: false,
  } as Parameters<typeof pdfjs.getDocument>[0]);

  const doc = await task.promise;
  try {
    const out: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      const lines = toLines(content.items as { str: string; transform: number[] }[]);
      if (lines.length) out.push(lines.join('\n'));
      page.cleanup();
    }
    const text = out.join('\n\n');
    return {
      pages: doc.numPages,
      text,
      looksScanned: doc.numPages > 0 && text.replace(/\s/g, '').length < 40 * doc.numPages,
    };
  } finally {
    await task.destroy();
  }
}
