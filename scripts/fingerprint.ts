/** Print the fingerprints of the LOCAL values, to compare against the server.
 *
 *    npm run config:fingerprint
 *    curl -s https://api.outplan.org/health | python3 -m json.tool
 *
 *  The fp values must match. If one differs, the deployed value is not the one
 *  in this .env - which is exactly what happens when a runtime variable has been
 *  set as a build argument instead.
 */
import { ENV_CONFIG } from '../src/config/env.config';
import { fingerprint } from '../src/config/fingerprint';

const rows = {
  database_url: fingerprint(ENV_CONFIG.DATABASE_URL),
  anthropic_base_url: fingerprint(ENV_CONFIG.ANTHROPIC_BASE_URL),
  anthropic_api_key: fingerprint(ENV_CONFIG.ANTHROPIC_API_KEY),
  firebase_service_account: fingerprint(ENV_CONFIG.FIREBASE_SERVICE_ACCOUNT),
};

console.log('\n  LOCAL (.env)\n');
for (const [k, v] of Object.entries(rows)) {
  console.log(`  ${k.padEnd(26)} ${v.present ? `${String(v.chars).padStart(5)} chars  fp ${v.fp}` : '    MISSING'}`);
}
console.log('');
