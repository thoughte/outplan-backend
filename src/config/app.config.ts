import { prisma } from '../lib/prisma';

/** Runtime configuration, read from the database and cached briefly.
 *
 *  Three rules govern this file.
 *
 *  It FAILS SAFE. When the database is unreachable the defaults below apply,
 *  and every default is the restrictive choice - an empty CORS list denies every
 *  cross-origin request rather than allowing them. A config layer that opens up
 *  when it cannot reach its source is worse than no config layer.
 *
 *  It is CACHED, NOT LOADED ONCE. Read at boot and a change needs a redeploy,
 *  which is the thing this exists to avoid. The TTL is the delay between
 *  changing a value and it taking effect.
 *
 *  It is NOT for secrets. DATABASE_URL and the Anthropic credentials stay in the
 *  environment: a secret in a table is readable by anything that can read the
 *  table, including a bug in an unrelated query.
 */
export interface AppSettings {
  'cors.origins': string[];
  'reasoning.model': string;
  'reasoning.enabled': boolean;
  'app.timezone': string;
  'talk.max_message_chars': number;
}

const DEFAULTS: AppSettings = {
  'cors.origins': [],
  'reasoning.model': 'claude-sonnet-5',
  'reasoning.enabled': false,
  'app.timezone': 'Asia/Kolkata',
  'talk.max_message_chars': 8000,
};

const TTL_MS = 30_000;
let cache: { at: number; values: AppSettings } | null = null;

export async function loadSettings(force = false): Promise<AppSettings> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.values;

  const values: AppSettings = { ...DEFAULTS };
  try {
    const rows = await prisma.appConfig.findMany();
    for (const row of rows) {
      if (row.key in DEFAULTS) {
        (values as unknown as Record<string, unknown>)[row.key] = row.value;
      }
      // A key that is not in DEFAULTS is ignored rather than surfaced. It is
      // almost always a value left behind by a version that has been rolled
      // back, and honouring it would resurrect removed behaviour silently.
    }
    cache = { at: Date.now(), values };
  } catch {
    // Unreachable database: serve defaults, do not cache. The next request
    // tries again rather than being stuck on the restrictive fallback.
    return { ...DEFAULTS };
  }
  return values;
}

export async function getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K]> {
  return (await loadSettings())[key];
}

/** Everything the defaults define, upserted. Safe on every boot: an existing
 *  row keeps its value, a new key arrives with its default rather than being
 *  undefined until someone notices. */
export async function seedSettings(): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULTS)) {
    await prisma.appConfig.upsert({
      where: { key },
      update: {},
      create: { key, value: value as never, description: null },
    });
  }
}
