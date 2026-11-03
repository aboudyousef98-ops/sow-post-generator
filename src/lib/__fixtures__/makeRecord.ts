// One PostRecord factory for every test file. Before Phase 7 each test file
// hand-rolled its own literal, so a model change broke four files at once.

import type { InstallNotes, PostRecord } from '../../types';
import { emptyInstallNotes } from '../installNotes';

/**
 * Installation notes with every REQUIRED question answered — i.e. the battery
 * installation analysis (Aboud 2026-11-03), which `missingRequired()` gates
 * "Copy for Slack" and "Mark as posted" on.
 *
 * `makeRecord()` deliberately does NOT use this: most tests assert post shape,
 * and a battery block there would add a section to every golden. Tests that
 * need a record the gate considers READY start from this instead.
 *
 * `over` wins, so a test can answer the questions differently.
 */
export function answeredInstallNotes(over: Partial<InstallNotes> = {}): InstallNotes {
  return {
    ...emptyInstallNotes(),
    batteryBase: 'wall-mount',
    batteryElevation: '48 in above the garage floor',
    wallEven: true,
    batteryPushFromWall: false,
    ...over,
  };
}

export function makeRecord(overrides: Partial<PostRecord> = {}): PostRecord {
  return {
    id: 'test-id',
    status: 'draft',
    author: 'Aboud Yousef',
    sf: {
      customerName: 'Norca Garcia',
      installScheduledDate: '2026-10-01',
      region: 'HOU',
      jurisdiction: 'Pasadena',
      siteAddress: '1317 Skylark Rd, Pasadena, TX 77502',
      source: 'text',
    },
    drivers: [],
    suggestedLevel: 1,
    level: 1,
    notes: { layout: '', siteSurvey: '', design: '', homeowner: '' },
    installNotes: emptyInstallNotes(),
    usePolished: {},
    tags: ['Tarek Abu Hseini', 'Mohammed Azizi', 'Diego Banegas'],
    warnings: [],
    createdAt: '2026-09-26T00:00:00.000Z',
    updatedAt: '2026-09-26T00:00:00.000Z',
    schemaVersion: 1,
    ...overrides,
  };
}
