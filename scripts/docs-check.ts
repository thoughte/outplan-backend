/** Does the spec still describe the API?
 *
 *    npm run docs:check
 *
 *  Documentation rots silently. Nobody notices a missing endpoint until someone
 *  builds against the spec and finds it describes a service that no longer
 *  exists - and before this file, urls.ts in the frontend carried a comment
 *  saying "the backend publishes an OpenAPI spec" when no spec existed at all.
 *
 *  Not a test and not a gate. It is a thirty-line reader that says which routes
 *  the code registers and which ones the spec mentions, and names the
 *  difference. Run it when you change a route.
 */
import { readFileSync } from 'node:fs';

const setup = readFileSync('src/routes.setup.ts', 'utf8');
const routes = readFileSync('src/shared/routes.ts', 'utf8');
const spec = readFileSync('docs/openapi.yaml', 'utf8');

/** Resolve ALL_ROUTES.a.b back to its literal.
 *
 *  By its FULL dotted path, not its last segment. `sessions.base`, `files.base`
 *  and `agentKeys.base` are three different routes that all end in "base", and
 *  a resolver keyed on the last word reports every one of them as missing -
 *  which the first version of this file duly did.
 */
const literals = new Map<string, string>();
{
  const stack: string[] = [];
  for (const line of routes.split('\n')) {
    const open = line.match(/^\s*(\w+):\s*\{/);
    if (open) { stack.push(open[1]!); continue; }
    if (/^\s*\},?\s*$/.test(line)) { stack.pop(); continue; }
    const leaf = line.match(/^\s*(\w+):\s*'([^']+)'/);
    if (leaf) literals.set([...stack, leaf[1]!].join('.'), leaf[2]!);
  }
}

const registered = new Set<string>();
for (const line of setup.split('\n')) {
  // Commented-out registrations are not routes. The ADMIN BOUNDARY is a plan.
  if (/^\s*(\/\/|\*)/.test(line)) continue;
  const m = line.match(/app\.(get|post|patch|delete)\(\s*(?:(API_PREFIX)\s*\+\s*)?([^,]+),/);
  if (!m) continue;
  const expr = m[3]!.trim();
  let path: string | null = null;

  const direct = expr.match(/^'([^']+)'$/);
  if (direct) path = direct[1]!;
  else {
    const dotted = expr.replace(/^ALL_ROUTES\./, '').trim();
    path = literals.get(dotted) ?? null;
  }
  if (!path) { console.warn(`  (could not resolve: ${expr})`); continue; }
  if (m[2]) path = `/api/v1${path}`;
  // Express ':id' against OpenAPI '{id}'
  registered.add(path.replace(/:(\w+)/g, '{$1}'));
}

const documented = new Set<string>(
  [...spec.matchAll(/^ {2}(\/[^:\s]+):/gm)].map((m) => m[1]!),
);

const missing = [...registered].filter((r) => !documented.has(r)).sort();
const extra = [...documented].filter((d) => !registered.has(d)).sort();

console.log(`registered in code : ${registered.size}`);
console.log(`described in spec  : ${documented.size}`);
console.log(missing.length ? `\nIN THE CODE, NOT IN THE SPEC:\n${missing.map((m) => '  ' + m).join('\n')}` : '\nnothing undocumented');
console.log(extra.length ? `\nIN THE SPEC, NOT IN THE CODE:\n${extra.map((m) => '  ' + m).join('\n')}` : 'nothing stale');

// Exit non-zero so it is usable from a hook later, without being one now.
process.exit(missing.length || extra.length ? 1 : 0);
