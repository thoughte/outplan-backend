import { access, constants, mkdir, stat, statfs } from 'node:fs/promises';
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

  return { path, mounted, writable, freeMb, ephemeral: exists && writable && !mounted };
}
