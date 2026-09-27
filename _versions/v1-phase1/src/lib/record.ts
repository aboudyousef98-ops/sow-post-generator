// Record factory + tag housekeeping.

import type { PostRecord, Region, Settings } from '../types';

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
    usePolished: { layout: true, siteSurvey: true, design: true, homeowner: true },
    tags: autoTags('HOU', settings, []),
    warnings: [],
    createdAt: now,
    updatedAt: now,
    schemaVersion: 1,
  };
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
