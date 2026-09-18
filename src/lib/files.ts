import { access, constants, mkdir, statfs } from 'node:fs/promises';
import { ENV_CONFIG } from '../config/env.config';

export interface VolumeHealth {
  path: string;
  mounted: boolean;
  writable: boolean;
  freeMb: number | null;
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

  try {
    await mkdir(path, { recursive: true });
    mounted = true;
  } catch {
    // Left false: in production the volume should already exist, and failing to
    // create it is itself the finding.
  }

  if (mounted) {
    writable = await access(path, constants.W_OK).then(() => true).catch(() => false);
    freeMb = await statfs(path)
      .then((s) => Math.round((s.bavail * s.bsize) / 1_048_576))
      .catch(() => null);
  }

  return { path, mounted, writable, freeMb };
}
