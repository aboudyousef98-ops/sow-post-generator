// Salesforce note fields — Scheduling Alerts! plus the AHJ / utility
// requirement columns of the "Export → Details Only" .xlsx (Aboud 2026-10-21:
// "i want the alerts, ahj notes, all the notes to appear on the compose as
// alerts for us to read").
//
// One shape, four consumers: lib/sfWorkbook reads them out of the export,
// lib/sfImport decides whether a board row's copy needs updating, lib/board
// logs the change, and ComposeTab shows them as a read-only banner. Only the
// xlsx has these columns — the browser paste never produces an SfNotes at all,
// which is what keeps a paste from wiping notes a file wrote.

export interface SfNotes {
  /** "Fulfillment: Scheduling Alerts!" */
  alerts?: string;
  /** "Fulfillment: Jurisdiction: Design/City Requirements" */
  ahjDesign?: string;
  /** "Fulfillment: Jurisdiction: Battery Requirements" */
  ahjBattery?: string;
  /** "Fulfillment: Utility Company: Requirements - Design" */
  utilityDesign?: string;
  /** "Fulfillment: Utility Company: Battery Requirements" */
  utilityBattery?: string;
}

/** Canonical order and the labels the team reads on Compose and in Activity. */
export const SF_NOTE_SECTIONS: { key: keyof SfNotes; label: string }[] = [
  { key: 'alerts', label: 'Scheduling alerts' },
  { key: 'ahjDesign', label: 'AHJ — design requirements' },
  { key: 'ahjBattery', label: 'AHJ — battery requirements' },
  { key: 'utilityDesign', label: 'Utility — design requirements' },
  { key: 'utilityBattery', label: 'Utility — battery requirements' },
];

const text = (notes: SfNotes | undefined, key: keyof SfNotes) => (notes?.[key] ?? '').trim();

/** The filled sections, in canonical order — what the Compose banner renders. */
export function sfNotesSections(notes: SfNotes | undefined): { key: keyof SfNotes; label: string; text: string }[] {
  return SF_NOTE_SECTIONS.flatMap((s) => {
    const t = text(notes, s.key);
    return t ? [{ ...s, text: t }] : [];
  });
}

export function hasSfNotes(notes: SfNotes | undefined): boolean {
  return SF_NOTE_SECTIONS.some((s) => text(notes, s.key));
}

/** Field-by-field equality where undefined, {} and '' are the same emptiness. */
export function sfNotesEqual(a: SfNotes | undefined, b: SfNotes | undefined): boolean {
  return SF_NOTE_SECTIONS.every((s) => text(a, s.key) === text(b, s.key));
}

/** Activity-log value: the section names, never the (long) text itself. */
export function sfNotesSummary(notes: SfNotes | undefined): string {
  const labels = sfNotesSections(notes).map((s) => s.label);
  return labels.length ? labels.join(' · ') : '—';
}
