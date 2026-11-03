// Record factory + tag housekeeping.

import type { PostRecord, Region, Settings } from '../types';
import { emptyInstallNotes, INSTALL_TEXT_FIELDS, servicesOf } from './installNotes';

export function blankRecord(author: string, settings: Settings): PostRecord {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    status: 'draft',
    author,
    sf: { customerName: '', installScheduledDate: '', region: 'HOU', source: 'manual' },
    drivers: [],
    suggestedLevel: 1,
    level: 1,
    notes: { layout: '', siteSurvey: '', design: '', homeowner: '' },
    installNotes: emptyInstallNotes(),
    usePolished: {},
    tags: autoTags('HOU', settings, []),
    warnings: [],
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };
}

/**
 * Does this record hold anything worth keeping? (Aboud, 2026-09-28)
 *
 * Autosave used to require a customer name, so notes typed before the name was
 * filled in were never persisted at all — the most likely way two projects were
 * lost. Now ANY filled field makes the draft real. `tags` and `level` are
 * excluded because blankRecord() pre-populates them, so counting them would
 * make every empty form a draft.
 *
 * Also inspects `installNotes` (carried fix, Phase 7 review): once the guided
 * Installation Notes UI ships, a draft holding only install-notes content and
 * no customer name must still autosave — the exact data-loss class this
 * function exists to prevent. Uses `INSTALL_TEXT_FIELDS` so the list of free-
 * text boxes can't drift from `installNotes.ts`, and also counts the three
 * dropdown choices (`walls`, `stories`, `service`) and `storiesOther`, since
 * choosing a dropdown is real work worth saving. `orientations` entries count
 * only when non-empty — `blankRecord()`'s `[]` and an untouched `['', '']`
 * must not count as content.
 */
export function hasContent(r: PostRecord): boolean {
  const { sf, installNotes: n } = r;
  const filled = [
    sf.customerName,
    sf.installScheduledDate,
    sf.siteAddress,
    sf.jurisdiction,
    sf.installRegionRaw,
    sf.recordTitle,
    r.designerTag,
    ...Object.values(r.notes),
    ...INSTALL_TEXT_FIELDS.map((f) => n?.[f.field]),
    n?.storiesOther,
    n?.roofMaterialOther,
    ...(n?.orientations ?? []),
  ];
  const dropdownChosen =
    n?.walls !== undefined ||
    n?.stories !== undefined ||
    n?.roofRating !== undefined ||
    n?.roofMaterial !== undefined ||
    n?.panelFacesFront !== undefined ||
    // Battery installation analysis (Aboud 2026-11-03). The three tri-state
    // answers are listed explicitly because `false` is a real answer here —
    // a truthiness check would treat "No" as "not answered" and lose the draft.
    n?.batteryBase !== undefined ||
    n?.batteryBaseNeedsWork !== undefined ||
    n?.wallEven !== undefined ||
    n?.batteryPushFromWall !== undefined ||
    (n !== undefined && servicesOf(n).length > 0);
  return filled.some((v) => (v ?? '').trim() !== '') || sf.systemSizeKw !== undefined || dropdownChosen;
}

/**
 * Auto tags = fixed tags + region lead, then any manual extras the user added.
 * Called when the region changes: replaces the previous lead, keeps extras.
 */
export function autoTags(region: Region, settings: Settings, currentTags: string[]): string[] {
  const leads = Object.values(settings.regionLead).filter(Boolean) as string[];
  const auto = new Set([...settings.fixedTags, ...leads]);
  const extras = currentTags.filter((t) => !auto.has(t));
  const lead = settings.regionLead[region];
  return [...settings.fixedTags, ...(lead ? [lead] : []), ...extras];
}
