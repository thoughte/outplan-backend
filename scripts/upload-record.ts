/** Put his remaining files where they belong, on his behalf.
 *
 *    npm run upload:record            dry run - says exactly what it would send
 *    npm run upload:record -- --send  actually uploads
 *
 *  The migration is mine to finish, not his to perform. The one thing I cannot
 *  do is authenticate as him: the bytes have to reach the volume through the
 *  upload endpoint, and that endpoint requires HIS token. So it is read from
 *  /Users/work/Claude/Health/.secrets/id_token, the same place as every other
 *  secret in this project, and it is never printed.
 *
 *  A Firebase ID token lasts an hour. That is a feature here - it is enough to
 *  finish a migration and useless afterwards.
 *
 *  Nothing is deduplicated client-side on purpose. The server is the one that
 *  knows what it already holds: identical bytes are refused outright, and a
 *  different copy of a report it already has is stored and marked superseded.
 *  Guessing that from here would be a second, worse answer to a question the
 *  server answers properly.
 */
import { readFile, readdir } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

const API = process.env.API_BASE ?? 'https://api.outplan.org';
const TOKEN_FILE = '/Users/work/Claude/Health/.secrets/id_token';
const SESSION_FILE = '/Users/work/Claude/Health/.secrets/session_id';

const TYPES: Record<string, string> = {
  '.pdf': 'application/pdf', '.md': 'text/markdown', '.txt': 'text/plain',
  '.csv': 'text/csv', '.json': 'application/json',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
};

/** Only what is actually still missing. The two reports whose measurements have
 *  no source page yet, and the plan documents, which have never been uploaded. */
const ROOT = '/Users/work/Claude/Health';
const WANTED = [
  { file: `${ROOT}/reports/2026-03-09_healthians_17233199685.pdf`, kind: 'report', status: 'current' },
  { file: `${ROOT}/reports/2026-09-04_healthians_20072450147.pdf`, kind: 'report', status: 'current' },
];

/** Status read from the name, the same rule the app uses. */
function statusOf(name: string): string {
  const n = name.toLowerCase();
  if (/superseded|v\d+-of-\d+|_old(?:[._-]|$)/.test(n)) return 'superseded';
  if (/pre-critic|draft|[._-]wip[._-]/.test(n)) return 'draft';
  return 'current';
}

const dateOf = (name: string): string | null => name.match(/(\d{4}-\d{2}-\d{2})/)?.[1] ?? null;

async function main(): Promise<void> {
  const send = process.argv.includes('--send');

  for (const p of await readdir(`${ROOT}/plans`)) {
    if (extname(p) === '.md') {
      WANTED.push({ file: join(`${ROOT}/plans`, p), kind: 'plan', status: statusOf(p) });
    }
  }

  console.log(`${WANTED.length} files to send -> ${API}\n`);
  for (const w of WANTED) {
    const bytes = await readFile(w.file).catch(() => null);
    console.log(`  ${basename(w.file).slice(0, 52).padEnd(54)}${w.kind.padEnd(8)}${w.status.padEnd(12)}` +
      (bytes ? `${(bytes.length / 1024).toFixed(0)} KB` : 'MISSING ON DISK'));
  }

  if (!send) { console.log('\nDRY RUN. Re-run with --send once the token is in place.'); return; }

  const token = (await readFile(TOKEN_FILE, 'utf8').catch(() => '')).trim();
  if (!token) throw new Error(`No token at ${TOKEN_FILE}`);
  const existing = (await readFile(SESSION_FILE, 'utf8').catch(() => '')).trim();

  // Register this as a device, unless one was supplied. Every request needs both
  // the token and a live session - that pairing is what makes "sign out that
  // phone" possible, and a script is not exempt from it.
  let sessionId = existing;
  if (!sessionId) {
    const r = await fetch(`${API}/api/v1/sessions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ label: 'migration from laptop' }),
    });
    if (!r.ok) throw new Error(`could not register a session: ${r.status} ${await r.text()}`);
    sessionId = (await r.json() as { data: { id: string } }).data.id;
  }
  console.log(`\nsession ${sessionId.slice(0, 8)}…\n`);

  let stored = 0, already = 0, failed = 0;
  for (const w of WANTED) {
    const name = basename(w.file);
    const bytes = await readFile(w.file).catch(() => null);
    if (!bytes) { console.log(`  ${name.padEnd(54)}MISSING ON DISK`); failed++; continue; }

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(bytes)], { type: TYPES[extname(name).toLowerCase()] ?? 'application/octet-stream' }), name);
    form.append('kind', w.kind);
    form.append('status', w.status);
    const d = dateOf(name);
    if (d) form.append('contentDate', d);

    try {
      const res = await fetch(`${API}/api/v1/files`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'x-session-id': sessionId },
        body: form,
      });
      const body = await res.json().catch(() => null) as { duplicate?: boolean; error?: { message?: string } } | null;
      if (!res.ok) {
        console.log(`  ${name.slice(0, 52).padEnd(54)}FAILED ${res.status} ${body?.error?.message ?? ''}`);
        failed++;
      } else if (body?.duplicate) {
        console.log(`  ${name.slice(0, 52).padEnd(54)}already here`);
        already++;
      } else {
        console.log(`  ${name.slice(0, 52).padEnd(54)}stored`);
        stored++;
      }
    } catch (e) {
      console.log(`  ${name.slice(0, 52).padEnd(54)}FAILED ${(e as Error).message}`);
      failed++;
    }
  }
  console.log(`\nstored ${stored}, already there ${already}, failed ${failed}`);
}

main().catch((e: Error) => { console.error(e.message); process.exit(1); });
