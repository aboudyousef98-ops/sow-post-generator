// Wire material check — Aboud 2026-11-11.
//
// Why this exists: Solrite was rejecting projects with "the wires presented on
// the submitted evidence (Al) do not match the ones described on the latest
// planset submission (Cu)". The material legitimately changes after the
// elevation review — what was missing is that nothing in the handoff ever SAID
// which material won, so the planset in Salesforce was never updated.
//
// Two picks (what the SLD shows, what the BOS will install) produce one
// derived sentence, which `effectiveNoteLines` prepends to Design Feedback in
// BOTH the Slack post and the Salesforce field. Derived, exactly like the
// walls/MPU sentences in installNotes.ts: it is not typed into `notes.design`,
// so `✨ Polish with AI` can never reword it and it cannot be deleted by
// accident. There is no required gate — this site does not gate fields.

import type { PostRecord, ServiceAmps, WireMaterial } from '../types';

export const WIRE_MATERIALS: { value: WireMaterial; label: string }[] = [
  { value: 'CU', label: 'Copper (CU)' },
  { value: 'AL', label: 'Aluminum (AL)' },
];

/** The material as it reads mid-sentence. */
const WORD: Record<WireMaterial, string> = { CU: 'copper', AL: 'aluminum' };

/** The material as it reads in a UI chip. */
export const SHORT: Record<WireMaterial, string> = { CU: 'Copper', AL: 'Aluminum' };

/** Table 310.12 rows, ascending — also the dropdown order. */
export const SERVICE_AMPS: ServiceAmps[] = [100, 110, 125, 150, 175, 200, 225, 250, 300, 350, 400];

/**
 * NEC Table 310.12 — Single-Phase Dwelling Services and Feeders.
 *
 * Scope, repeated as a hint in the form: this table covers the dwelling
 * SERVICE / FEEDER conductors (which is what an MPU or FSU touches), not PV or
 * battery circuits, and it applies only where no adjustment or correction
 * factors are required. It is guidance for the wording — the coordinator still
 * picks the material.
 *
 * NOTE on 225 A copper: the reference graphic the team circulated prints
 * "30/" there. That is a typo in the graphic; the code reads 3/0 AWG, which is
 * what the real table says. Pinned by wireMaterial.test.ts so it is not
 * "corrected" back to the picture.
 */
export const TABLE_310_12: Record<ServiceAmps, { cu: string; al: string }> = {
  100: { cu: '4 AWG', al: '2 AWG' },
  110: { cu: '3 AWG', al: '1 AWG' },
  125: { cu: '2 AWG', al: '1/0 AWG' },
  150: { cu: '1 AWG', al: '2/0 AWG' },
  175: { cu: '1/0 AWG', al: '3/0 AWG' },
  200: { cu: '2/0 AWG', al: '4/0 AWG' },
  225: { cu: '3/0 AWG', al: '250 kcmil' },
  250: { cu: '4/0 AWG', al: '300 kcmil' },
  300: { cu: '250 kcmil', al: '350 kcmil' },
  350: { cu: '350 kcmil', al: '500 kcmil' },
  400: { cu: '400 kcmil', al: '600 kcmil' },
};

/** The table's conductor for a rating + material, or undefined when either is unpicked. */
export function wireSizeFor(amps: ServiceAmps | undefined, material: WireMaterial | undefined): string | undefined {
  if (!amps || !material) return undefined;
  return material === 'CU' ? TABLE_310_12[amps].cu : TABLE_310_12[amps].al;
}

export type WireStatus = 'match' | 'mismatch' | 'unknown';

/** 'unknown' until BOTH halves are picked — a half-answer states nothing. */
export function wireStatus(r: PostRecord): WireStatus {
  const { design, bos } = r.wire ?? {};
  if (!design || !bos) return 'unknown';
  return design === bos ? 'match' : 'mismatch';
}

/**
 * The ask on its own — "Please update the design SLD to …" — for the Compose
 * copy button, so the request can be pasted straight to the designer. Empty
 * unless there is a real mismatch.
 */
export function wireRequestText(r: PostRecord): string {
  if (wireStatus(r) !== 'mismatch') return '';
  const { bos, serviceAmps } = r.wire!;
  const size = wireSizeFor(serviceAmps, bos);
  const target = size
    ? `${size} ${WORD[bos!]} for the ${serviceAmps} A service (NEC Table 310.12)`
    : `${WORD[bos!]} conductors`;
  return `Please update the design SLD to ${target} and re-upload it to Salesforce so the planset matches the BOS.`;
}

/**
 * The derived Design Feedback bullet. '' while the answer is unknown — there
 * is nothing truthful to say, and a "pending" line in a Solrite submission
 * would be worse than silence. The form shows the gap instead.
 */
export function wireFeedbackLine(r: PostRecord): string {
  const status = wireStatus(r);
  if (status === 'unknown') return '';
  const { design, bos, serviceAmps } = r.wire!;

  if (status === 'match') {
    const size = wireSizeFor(serviceAmps, bos);
    const tail = size ? ` (${size} for the ${serviceAmps} A service, NEC Table 310.12)` : '';
    return `Wire material unchanged — the design SLD and the BOS both specify ${WORD[bos!]} conductors${tail}.`;
  }

  return (
    `Wire material changed after the elevation review — the BOS specifies ${WORD[bos!]}, ` +
    `the design SLD shows ${WORD[design!]}. ${wireRequestText(r)}`
  );
}
