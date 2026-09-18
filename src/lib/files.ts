import { access, constants, mkdir, readFile, stat, statfs, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ENV_CONFIG } from '../config/env.config';

export interface VolumeHealth {
  path: string;
  /** A real volume is mounted here, not just a directory inside the image. */
  mounted: boolean;
  writable: boolean;
  freeMb: number | null;
  /** Written here but NOT on a volume: it survives until the next deploy and
   *  then is gone. Worse than no storage, because it works when you test it. */
  ephemeral: boolean;
  /** When this storage was first written to, and how many boots ago that was.
   *  A firstSeen older than the running container is the only real proof that
   *  the storage outlives a deploy - see stampBoot below. */
  firstSeen: string | null;
  boots: number | null;
}

/** A tiny file the server touches on every boot, to prove the storage is real.
 *
 *  Everything else about a volume can be true and it can still be a trap: the
 *  path exists, writes succeed, the device id differs from root, and it is
 *  still possible the platform hands back an empty directory on the next
 *  deploy. The only evidence that settles it is a file written by a previous
 *  container being read by this one.
 *
 *  So: firstSeen is set once and never rewritten, and boots increments. If
 *  firstSeen predates this container and boots keeps climbing, the volume
 *  genuinely survives deploys. If firstSeen resets to now on every deploy, it
 *  does not - and that is worth knowing BEFORE a year of reports is on it.
 */
const MARKER = '.volume-history.json';

export async function stampBoot(): Promise<void> {
  const file = join(ENV_CONFIG.FILES_DIR, MARKER);
  try {
    await mkdir(ENV_CONFIG.FILES_DIR, { recursive: true });
    type Marker = { firstSeen?: string; boots?: number };
    const prev: Marker = await readFile(file, 'utf8')
      .then((t) => JSON.parse(t) as Marker)
      .catch((): Marker => ({}));
    const next = {
      firstSeen: prev.firstSeen ?? new Date().toISOString(),
      boots: (prev.boots ?? 0) + 1,
      lastBoot: new Date().toISOString(),
    };
    await writeFile(file, JSON.stringify(next, null, 2), 'utf8');
    console.log(`[files] ${ENV_CONFIG.FILES_DIR} boot ${next.boots}, first written ${next.firstSeen}`);
  } catch (e) {
    // Never fatal. Storage is not needed to hold a conversation, and a server
    // that refuses to start because it could not write a marker file is a
    // worse outcome than one that reports the problem on /health.
    console.error('[files] could not stamp the storage marker:', (e as Error).message);
  }
}

/** Can this process actually write a file, right now.
 *
 *  Asked at boot and on /health rather than discovered when someone uploads a
 *  report. A volume that is missing, or mounted owned by root while the server
 *  runs as `node`, looks completely healthy from the outside: the API answers,
 *  the database is up, and only the write fails. That is the same shape as the
 *  outage where the container was gone for days while everything reported fine.
 *
 *  `mounted` and `writable` are separate on purpose - "the directory is not
 *  there" and "it is there and I am not allowed to write to it" have different
 *  fixes, and collapsing them into one boolean sends you after the wrong one.
 */
export async function volumeHealth(): Promise<VolumeHealth> {
  const path = ENV_CONFIG.FILES_DIR;
  let mounted = false;
  let writable = false;
  let freeMb: number | null = null;

  let exists = false;
  try {
    await mkdir(path, { recursive: true });
    exists = true;
  } catch {
    // Left false: in production the volume should already exist, and failing to
    // create it is itself the finding.
  }

  if (exists) {
    writable = await access(path, constants.W_OK).then(() => true).catch(() => false);
    freeMb = await statfs(path)
      .then((s) => Math.round((s.bavail * s.bsize) / 1_048_576))
      .catch(() => null);

    // Is this actually a VOLUME, or just a directory baked into the image?
    //
    // The Dockerfile creates /data/files, so the path exists either way and
    // writing to it succeeds either way. The difference only shows up at the
    // next deploy, when an unmounted directory takes every uploaded report with
    // it. A mounted filesystem has a different device id from the root one, so
    // compare them and report the answer rather than letting "it worked when I
    // tested it" stand in for durability.
    mounted = await Promise.all([stat(path), stat('/')])
      .then(([here, root]) => here.dev !== root.dev)
      .catch(() => false);
  }

  const marker = exists
    ? await readFile(join(path, MARKER), 'utf8')
        .then((t) => JSON.parse(t) as { firstSeen?: string; boots?: number })
        .catch(() => null)
    : null;

  return {
    path, mounted, writable, freeMb,
    ephemeral: exists && writable && !mounted,
    firstSeen: marker?.firstSeen ?? null,
    boots: marker?.boots ?? null,
  };
}
