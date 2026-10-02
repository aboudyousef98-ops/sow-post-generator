// Installation Complexity Classification — spec/04-classification.md.
// Level names must be used verbatim in the post (§5 naming discipline).

import type { Descriptors, DriverId, Level } from '../types';

export const LEVEL_NAMES: Record<Level, string> = {
  1: 'Standard Installation',
  2: 'Extended Routing & Integration',
  3: 'Service Equipment Modification',
  4: 'Major Electrical & Civil Construction',
};

/**
 * Governing scope + planning window per level — verbatim from the 2026
 * standard's summary table (`SOW Complexity Classification.pdf` p.2, and
 * spec/04 §1). Treated like LEVEL_NAMES: never paraphrased. The window now
 * prints in the post as well as on screen (spec/10 §12).
 */
export const LEVEL_INFO: Record<Level, { scope: string; window: string }> = {
  1: {
    scope: 'Back-to-back, or standard exterior placement with direct grid, load and PV routes',
    window: '1 crew-day',
  },
  2: {
    scope:
      'Spread equipment, attic run, runs up to 25 ft with additional bends, generator connection, existing PV/system integration',
    window: '1 to 1.5 crew-days',
  },
  3: {
    scope: 'MPU, FSU, FTP, relocation ≤ 20 ft, or a short manual trench with controlled access',
    window: '1.5 to 2 crew-days',
  },
  4: {
    // The field-verification clause is a pre-construction control (PDF p.6),
    // not a duration — it belongs in scope, never in the printed window.
    scope:
      'Dirt or concrete trenching, difficult MPU/FSU (interior, obstructed, restricted space), obstructed access, or work outside standard limits; field verification before scheduling & material release',
    window: 'Site-specific, minimum 2 days',
  },
};

export interface DriverDef {
  id: DriverId;
  label: string;
  group: 'L2' | 'L3' | 'L4';
}

export const DRIVERS: DriverDef[] = [
  // Routing & integration (→ L2)
  { id: 'spread_equipment', label: 'Battery/equipment spread out (not back-to-back / not consolidated)', group: 'L2' },
  { id: 'attic_run', label: 'Attic run with good access', group: 'L2' },
  { id: 'long_run_25ft', label: 'Grid/load run longer than standard, with extra bends, up to 25 ft', group: 'L2' },
  { id: 'generator', label: 'Generator connection or coordination', group: 'L2' },
  { id: 'existing_system_integration', label: 'Integration with existing PV / generator / related equipment', group: 'L2' },
  // Service equipment (→ L3)
  { id: 'mpu', label: 'Main Panel Upgrade (MPU)', group: 'L3' },
  { id: 'fsu', label: 'Full Service Upgrade (FSU)', group: 'L3' },
  { id: 'ftp', label: 'FTP', group: 'L3' },
  { id: 'relocation_le_20ft', label: 'Equipment relocation ≤ 20 ft', group: 'L3' },
  { id: 'manual_trench_short', label: 'Short manual trench, controlled access', group: 'L3' },
  // Civil / difficult conditions (→ L4)
  { id: 'dirt_trench', label: 'Dirt trenching beyond a minor manual trench', group: 'L4' },
  { id: 'concrete_trench', label: 'Concrete saw-cut / restoration', group: 'L4' },
  { id: 'relocation_gt_20ft', label: 'Relocation > 20 ft', group: 'L4' },
  { id: 'difficult_mpu_fsu', label: 'MPU/FSU in interior location, obstructed, difficult routing or restricted working space', group: 'L4' },
  { id: 'obstructed_access', label: 'Obstructed access to route/equipment', group: 'L4' },
  { id: 'outside_standard_limits', label: 'Any scope outside standard limits (state the reason)', group: 'L4' },
];

const SHORT_LABELS: Record<DriverId, string> = {
  spread_equipment: 'spread equipment',
  attic_run: 'attic run',
  long_run_25ft: 'long run up to 25 ft',
  generator: 'generator connection',
  existing_system_integration: 'existing system integration',
  mpu: 'MPU',
  fsu: 'FSU',
  ftp: 'FTP',
  relocation_le_20ft: 'relocation ≤ 20 ft',
  manual_trench_short: 'short manual trench',
  dirt_trench: 'dirt trenching',
  concrete_trench: 'concrete trenching',
  relocation_gt_20ft: 'relocation > 20 ft',
  difficult_mpu_fsu: 'difficult MPU/FSU',
  obstructed_access: 'obstructed access',
  outside_standard_limits: 'scope outside standard limits',
};

function label(ids: DriverId[]): string {
  return ids.map((i) => SHORT_LABELS[i]).join(', ');
}

const L4_IDS: DriverId[] = ['dirt_trench', 'concrete_trench', 'relocation_gt_20ft', 'difficult_mpu_fsu', 'obstructed_access', 'outside_standard_limits'];
const L3_IDS: DriverId[] = ['mpu', 'fsu', 'ftp', 'relocation_le_20ft', 'manual_trench_short'];
const L2_IDS: DriverId[] = ['spread_equipment', 'attic_run', 'long_run_25ft', 'generator', 'existing_system_integration'];

/** Decision sequence, evaluated top-down L4 → L1 exactly as the standard says (§3). */
export function suggestLevel(d: Set<DriverId>): { level: Level; reason: string } {
  const hit = (ids: DriverId[]) => ids.filter((i) => d.has(i));
  const l4 = hit(L4_IDS);
  if (l4.length) return { level: 4, reason: `L4 driver: ${label(l4)}` };
  const l3 = hit(L3_IDS);
  if (l3.length) return { level: 3, reason: `Service equipment work: ${label(l3)}` };
  const l2 = hit(L2_IDS);
  if (l2.length) return { level: 2, reason: `Extended routing/integration: ${label(l2)}` };
  return { level: 1, reason: 'No drivers selected — standard scope' };
}

/**
 * Keyword → suggested drivers from Scheduled Work Items + Coordinator Notes
 * (spec/03 keyword table). Suggestions are shown ticked with a "suggested"
 * style; the user can untick.
 */
export function suggestDriversFromText(text: string): DriverId[] {
  const s = text.toLowerCase();
  const out = new Set<DriverId>();
  if (/\bmpu\b|main panel upgrade/.test(s)) out.add('mpu');
  if (/\bfsu\b|full service upgrade/.test(s)) out.add('fsu');
  if (/\bftp\b/.test(s)) out.add('ftp');
  if (/attic run/.test(s)) out.add('attic_run');
  const trench = /trench/.test(s);
  if (trench && /dirt|soil|excavat/.test(s)) out.add('dirt_trench');
  else if (trench && /concrete|saw/.test(s)) out.add('concrete_trench');
  else if (trench) out.add('manual_trench_short');
  if (/generator/.test(s)) out.add('generator');
  if (/existing (pv|solar|system)/.test(s)) out.add('existing_system_integration');
  if (/relocat/.test(s)) out.add('relocation_le_20ft'); // user confirms distance
  return [...out];
}

/**
 * Auto-generated Installation Layout seed sentence (§4). Built from
 * descriptors + drivers in the fixed clause order; clauses with no data are
 * dropped. The user edits freely afterwards.
 */
export function layoutSeed(drivers: Set<DriverId>, d: Descriptors = {}): string {
  const parts: string[] = [];

  // 1. Layout
  if (drivers.has('spread_equipment')) parts.push('Equipment spread across the site.');
  else if (d.backToBack) parts.push('Back-to-back installation.');
  else if (d.backToBack === false) parts.push('Standard exterior placement.');

  // 2. Walls
  if (d.walls === '1') parts.push('The installation will be carried out on one wall.');
  else if (d.walls === '2')
    parts.push(
      `The installation will be carried out on two walls${d.wallOrientations ? ` (${d.wallOrientations})` : ''}.`,
    );
  else if (d.walls === '3+') parts.push('The installation will be carried out on three walls.');

  // 3. Stories
  if (d.stories === '1') parts.push('1-story house.');
  else if (d.stories === '2') parts.push('Two-story house.');
  else if (d.stories === 'mixed' && d.storiesText) parts.push(`${d.storiesText}.`);

  // 4. Service
  const service = (['mpu', 'fsu', 'ftp'] as DriverId[]).filter((i) => drivers.has(i));
  if (service.length) {
    const name = service.map((i) => SHORT_LABELS[i]).join('/');
    let reloc = '';
    if (drivers.has('relocation_gt_20ft')) reloc = ' with relocation (> 20 ft)';
    else if (drivers.has('relocation_le_20ft')) reloc = ' with relocation (≤ 20 ft)';
    parts.push(`This project requires an ${name}${reloc}.`);
  } else if (drivers.has('relocation_gt_20ft')) {
    parts.push('Equipment relocation (> 20 ft).');
  } else if (drivers.has('relocation_le_20ft')) {
    parts.push('Equipment relocation (≤ 20 ft).');
  }

  // 5. Routing
  if (drivers.has('attic_run')) parts.push('Attic run.');
  if (drivers.has('long_run_25ft')) parts.push('Long run with additional bends (up to 25 ft).');
  if (drivers.has('generator')) parts.push('Generator connection.');
  if (drivers.has('existing_system_integration')) parts.push('Integration with existing PV/system.');

  // 6. Civil
  if (drivers.has('dirt_trench')) parts.push('Dirt trenching required.');
  if (drivers.has('concrete_trench')) parts.push('Concrete trenching (saw-cut and restoration) required.');
  if (drivers.has('manual_trench_short')) parts.push('Short manual trench with controlled access.');

  // 7. Difficulties
  if (drivers.has('obstructed_access')) parts.push('Obstructed access.');
  if (drivers.has('difficult_mpu_fsu'))
    parts.push(`Difficult MPU/FSU location${d.outsideLimitsReason ? ` (${d.outsideLimitsReason})` : ''}.`);
  if (drivers.has('outside_standard_limits') && d.outsideLimitsReason)
    parts.push(`Outside standard limits: ${d.outsideLimitsReason}.`);

  // 8. Extras
  const extras: string[] = [];
  if (d.batteries) extras.push(`${d.batteries} ${d.batteries === 1 ? 'battery' : 'batteries'}`);
  if (d.inverterIndoors) extras.push('inverter located indoors');
  if (extras.length) parts.push(`${extras.join('; ')}.`.replace(/^./, (c) => c.toUpperCase()));

  return parts.join(' ');
}
