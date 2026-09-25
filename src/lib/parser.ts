// Salesforce text-paste parser — spec/03-sf-parser.md. Deterministic, no AI.

import type { Region, SfFields } from '../types';
import { isoToUs, isPast, usDateToIso, weekdayName } from './dates';

/** Labels as they appear on the SF Lightning record page (case-insensitive match). */
const KNOWN_LABELS = [
  'System Size (KW)',
  'Project Status',
  'Project',
  'Install Scheduled Date',
  'Installed',
  'Site',
  'Jurisdiction',
  'Utility Company',
  'Lender',
  'Funding Stage',
  'Install Region',
  'Latest Scheduled Visit',
  'Fulfillment Coordinator',
  'Install Ops PM',
  'Project Coordination Task',
  'Financing',
  'Unscheduled Work Items',
  'Scheduled Work Items',
  'Appointment Order',
  'Fulfillment Notes - Coordinator',
] as const;

const LABEL_SET = new Set(KNOWN_LABELS.map((l) => l.toLowerCase()));

const RECORD_TITLE_RE = /^(.+?)\s*\|\s*(FF|PA)\s*\|\s*(.+)$/;
const MD_LINK_RE = /^\[(.+?)\]\((https?:\/\/[^\s)]+)\)$/;

export interface ParseResult {
  /** Only the fields this paste actually contained (for merge-on-second-paste). */
  fields: Partial<SfFields>;
  warnings: string[];
  /** Every label/value pair seen, for the "Show raw" debug toggle. */
  rawPairs: Record<string, string>;
}

function normalizeRegion(raw: string): Region {
  const s = raw.toLowerCase();
  if (/houston|beaumont|\bhou\b/.test(s)) return 'HOU';
  if (/dallas|fort worth|\bdfw\b|north texas/.test(s)) return 'DFW';
  return 'OTHER';
}

/** Strip a markdown link down to its text; capture the URL. */
function unlink(value: string): { text: string; url?: string } {
  const m = value.match(MD_LINK_RE);
  return m ? { text: m[1], url: m[2] } : { text: value };
}

export function parseSfText(input: string, today?: string): ParseResult {
  const warnings: string[] = [];
  const rawPairs: Record<string, string> = {};
  const fields: Partial<SfFields> = { source: 'text' };

  // 1. Normalize: CRLF → LF, trim, drop empties and '*'-bullet lines.
  const lines = input
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !/^\*+$/.test(l));

  // Record title — first line matching "Name | FF | ..." anywhere in the paste.
  for (const line of lines) {
    const m = line.match(RECORD_TITLE_RE);
    if (m) {
      fields.customerName = m[1].trim();
      fields.recordTitle = line;
      break;
    }
  }

  // 2–3. Walk lines; a known label's value is everything until the next known label.
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!LABEL_SET.has(line.toLowerCase())) {
      i++;
      continue;
    }
    const label = line;
    const valueLines: string[] = [];
    i++;
    while (i < lines.length && !LABEL_SET.has(lines[i].toLowerCase())) {
      valueLines.push(lines[i]);
      i++;
    }
    rawPairs[label] = valueLines.join('\n');
  }

  const get = (label: (typeof KNOWN_LABELS)[number]): string | undefined => {
    const key = Object.keys(rawPairs).find((k) => k.toLowerCase() === label.toLowerCase());
    const v = key !== undefined ? rawPairs[key].trim() : '';
    return v === '' ? undefined : v;
  };

  // 4. Customer name fallback: Project lookup text.
  const project = get('Project');
  if (project) {
    const { text, url } = unlink(project);
    if (!fields.customerName) fields.customerName = text;
    if (url) fields.sfLinks = { ...fields.sfLinks, project: url };
  }

  // 5. Lookups rendered as markdown links.
  const site = get('Site');
  if (site) {
    const { text, url } = unlink(site);
    fields.siteAddress = text;
    if (url) fields.sfLinks = { ...fields.sfLinks, site: url };
  }
  const jur = get('Jurisdiction');
  if (jur) {
    const { text, url } = unlink(jur);
    fields.jurisdiction = text;
    if (url) fields.sfLinks = { ...fields.sfLinks, jurisdiction: url };
  }
  const utility = get('Utility Company');
  if (utility) fields.utility = unlink(utility).text;

  // 6. Dates.
  const rawDate = get('Install Scheduled Date');
  if (rawDate) {
    const iso = usDateToIso(rawDate);
    if (iso) fields.installScheduledDate = iso;
    else warnings.push(`Could not read Install Scheduled Date: "${rawDate}".`);
  }
  const visit = get('Latest Scheduled Visit');
  if (visit) fields.latestScheduledVisit = visit;

  // 7. Region normalization.
  const regionRaw = get('Install Region');
  if (regionRaw) {
    fields.installRegionRaw = regionRaw;
    fields.region = normalizeRegion(regionRaw);
    if (fields.region === 'OTHER') {
      warnings.push(`Region not recognized: ${regionRaw} — please select.`);
    }
  }

  // 8. System size.
  const size = get('System Size (KW)');
  if (size) {
    const n = parseFloat(size);
    if (!Number.isNaN(n)) fields.systemSizeKw = n;
  }

  const status = get('Project Status');
  if (status) fields.projectStatus = status;
  const lender = get('Lender');
  if (lender) fields.lender = lender;
  const funding = get('Funding Stage');
  if (funding) fields.fundingStage = funding;
  const swi = get('Scheduled Work Items');
  if (swi) fields.scheduledWorkItems = swi;
  const coordNotes = get('Fulfillment Notes - Coordinator');
  if (coordNotes) fields.coordinatorNotes = coordNotes;

  // 9. Warnings.
  if (fields.installScheduledDate && fields.latestScheduledVisit) {
    const visitIso = usDateToIso(fields.latestScheduledVisit);
    if (visitIso && visitIso !== fields.installScheduledDate) {
      warnings.push(
        `Latest Scheduled Visit (${isoToUs(visitIso)}) differs from Install Scheduled Date (${isoToUs(fields.installScheduledDate)}) — the post uses Install Scheduled Date.`,
      );
    }
  }
  if (!fields.installScheduledDate) warnings.push('No install date found.');
  if (fields.installScheduledDate && today && isPast(fields.installScheduledDate, today)) {
    warnings.push(
      `Install Scheduled Date (${isoToUs(fields.installScheduledDate)}) is in the past.`,
    );
  }
  if (!fields.customerName) warnings.push('Customer name missing.');

  return { fields, warnings, rawPairs };
}

/** Weekday for display next to the date input. */
export function installWeekday(iso: string | undefined): string {
  return iso ? weekdayName(iso) : '';
}

/**
 * Merge a second paste into the current fields — later paste overwrites only
 * the fields it contains (spec/03 "Second paste").
 */
export function mergeSfFields(current: SfFields, parsed: Partial<SfFields>): SfFields {
  const merged: SfFields = { ...current };
  for (const [k, v] of Object.entries(parsed)) {
    if (v === undefined || k === 'sfLinks' || k === 'source') continue;
    (merged as unknown as Record<string, unknown>)[k] = v;
  }
  if (parsed.sfLinks) merged.sfLinks = { ...current.sfLinks, ...parsed.sfLinks };
  return merged;
}
