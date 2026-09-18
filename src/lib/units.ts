/** Turning what a lab printed into something you can plot.
 *
 *  A chart of one marker over time is the whole point of keeping a record for
 *  years, and it is exactly where a record quietly lies. Kunal's own data:
 *
 *    wbc_count         4700 cumm      beside 6.8, 7.6, 7.4, 6.8 in 10^3/uL
 *    testosterone_free 3.89 ng/dL     after  15.42 pg/ml
 *
 *  Plotted raw, the first is a 700x spike when it is really the LOWEST of the
 *  five, and the second shows free testosterone falling when it actually rose
 *  (3.89 ng/dL is 38.9 pg/mL). The numbers are all correct. The units moved.
 *
 *  So values are never rewritten. `value` and `unit` stay exactly as the lab
 *  printed them, because they are the evidence and the only way to re-check a
 *  mapping later. The converted number lives beside them.
 */

/** Everything that means the same measurement, mapped to one spelling and a
 *  factor into a base unit for its dimension.
 *
 *  Case folding alone is not enough and is actively dangerous here: `mIU/mL`
 *  and `µIU/ml` differ only in case and are a THOUSAND-fold apart. They are
 *  listed separately and deliberately.
 */
interface Norm { unit: string; base: string; factor: number }

const ALIASES: Record<string, Norm> = {};
const define = (base: string, unit: string, factor: number, ...spellings: string[]): void => {
  for (const s of [unit, ...spellings]) ALIASES[s.toLowerCase()] = { unit, base, factor };
};

// --- concentration, mass per volume ---------------------------------------
define('mg/dL', 'mg/dL', 1, 'mg/dl');
define('mg/dL', 'mg/L', 0.1);                       // 10 mg/L = 1 mg/dL
define('g/dL', 'g/dL', 1, 'g/dl', 'gm/dl', 'gm%');  // gm% IS g/dL
define('pg/mL', 'pg/mL', 1, 'pg/ml');
define('pg/mL', 'ng/dL', 10, 'ng/dl');              // 1 ng/dL = 10 pg/mL
define('pg/mL', 'ng/L', 1);                         // 1 ng/L = 1 pg/mL
define('ng/mL', 'ng/mL', 1, 'ng/ml');
define('µg/dL', 'µg/dL', 1, 'ug/dl', 'ug/dL', 'µg/dl');
define('µmol/L', 'µmol/L', 1, 'umol/l');
define('mmol/L', 'mmol/L', 1, 'mmol/l');

// --- counts per volume ------------------------------------------------------
// Base is cells per microlitre. `cumm` is per cubic millimetre, which IS a
// microlitre - that is the whole 1000x wbc problem.
define('10^3/µL', '10^3/µL', 1000, '10^3/ul', '10^3/µl', 'thou/mm3');
define('10^3/µL', 'cells/µL', 1, 'cumm', '/cumm');
define('10^6/µL', '10^6/µL', 1_000_000, '10^6/µl', '10^6/ul', 'mill/cumm', 'millions/cumm');

// --- enzyme and hormone activity -------------------------------------------
define('U/L', 'U/L', 1, 'u/l');
define('U/mL', 'U/mL', 1, 'u/ml');
define('IU/mL', 'IU/mL', 1, 'iu/ml');
define('µIU/mL', 'µIU/mL', 1, 'uiu/ml', 'µiu/ml');
// mIU/mL is a THOUSAND micro-IU/mL, not a spelling of it. `mlU/ml` is a typo of
// this one - lowercase L for capital I - and belongs here, not with µIU/mL.
// Same DIMENSION as µIU/mL though, so a marker reported both ways converts
// correctly instead of being refused; the 1000 is the whole point.
define('µIU/mL', 'mIU/mL', 1000, 'miu/ml', 'mlu/ml');

// --- cell indices and everything dimensionless ------------------------------
define('fL', 'fL', 1, 'fl');
define('pg', 'pg', 1, 'pg/cell');
define('%', '%', 1);
define('ratio', 'ratio', 1, 'Ratio');
define('/HPF', '/HPF', 1, '/hpf');
define('mm/hr', 'mm/hr', 1, 'mm/1st hour', 'mm/1st hr.', 'mm/1st hr');
define('kg', 'kg', 1, 'kgs');
define('kg/m²', 'kg/m²', 1, 'kg/m2');
define('cm', 'cm', 1);
define('mL/min/1.73m²', 'mL/min/1.73m²', 1, 'ml/min/1.73m2');
define('kcal/day', 'kcal/day', 1, 'kcal');
define('years', 'years', 1);

/** The printed unit, resolved. Unknown units are returned as themselves with no
 *  base, so they are never silently treated as compatible with anything. */
export function normaliseUnit(raw: string | null | undefined): Norm | null {
  if (!raw) return null;
  return ALIASES[raw.trim().toLowerCase()] ?? null;
}

/** Convert a value between two printed units, or null if they are not the same
 *  kind of thing. Refusing is the correct answer far more often than guessing. */
export function convert(value: number, from: string, to: string): number | null {
  const f = normaliseUnit(from);
  const t = normaliseUnit(to);
  if (!f || !t || f.base !== t.base) return null;
  return (value * f.factor) / t.factor;
}
