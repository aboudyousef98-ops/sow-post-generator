// Record factory + tag housekeeping.

import type { PostRecord, Region, Settings } from '../types';
import { emptyInstallNotes } from './installNotes';

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
 */
export function hasContent(r: PostRecord): boolean {
  const { sf } = r;
  const filled = [
    sf.customerName,
    sf.installScheduledDate,
    sf.siteAddress,
    sf.jurisdiction,
    sf.installRegionRaw,
    sf.recordTitle,
    r.designerTag,
    ...Object.values(r.notes),
  ];
  return filled.some((v) => (v ?? '').trim() !== '') || sf.systemSizeKw !== undefined;
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
