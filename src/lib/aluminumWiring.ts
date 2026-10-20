// Aluminum wiring stance per jurisdiction — drives the yellow warning under
// Jurisdiction on Compose (Aboud 2026-10-20, from Othman's 509-row list).
//
// The dataset lives in `aluminumWiringData.ts`, GENERATED from the xlsx by
// `scripts/import-aluminum-xlsx.mjs` — never hand-edited. Salesforce will
// carry this on its jurisdictions object eventually; until then the sheet is
// the truth and a new sheet is one regeneration away.

import { normName } from './ahj';
import { ALUMINUM_WIRING } from './aluminumWiringData';

export interface AluminumEntry {
  name: string;
  requirement: string;
}

/**
 * Canonical lookup key. The sheet mostly says "Addison" but Salesforce (and
 * three sheet rows) say "City of Addison" — strip the prefix on BOTH sides so
 * either spelling hits. Deliberately nothing fuzzier than that.
 */
function aluminumKey(s: string): string {
  return normName(s).replace(/^(city|town|village) of /, '');
}

/**
 * The stance for a jurisdiction, or null when it is not on the list.
 *
 * An exact (normalized) name match always wins. The prefix-stripped match is
 * a fallback, and only when it is unambiguous: the list really does carry BOTH
 * "City of Lakeside" and "Town of Lakeside" — two different jurisdictions —
 * so a bare "Lakeside" matches nothing rather than guessing.
 */
export function matchAluminum(
  jurisdiction: string | undefined,
  entries: AluminumEntry[] = ALUMINUM_WIRING,
): AluminumEntry | null {
  const full = normName(jurisdiction ?? '');
  if (!full) return null;
  const exact = entries.find((e) => normName(e.name) === full);
  if (exact) return exact;
  const k = aluminumKey(full);
  const stripped = entries.filter((e) => aluminumKey(e.name) === k);
  return stripped.length === 1 ? stripped[0] : null;
}
