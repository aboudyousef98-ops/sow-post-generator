// Export / import helpers shared by the History and Settings tabs.

import type { Ahj, ExportFile, PostRecord, Settings } from '../types';
import { mergeAhjs } from './ahj';
import { buildExport, exportFileName, mergeImport } from './storage';

export function downloadExport(settings: Settings, records: PostRecord[], ahjs: Ahj[] = []): void {
  const file = buildExport(settings, records, ahjs);
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = exportFileName();
  a.click();
  URL.revokeObjectURL(url);
}

export interface ImportOutcome {
  records: PostRecord[];
  ahjs: Ahj[];
  settings?: Settings;
  summary: string;
}

export async function readImportFile(
  file: File,
  currentRecords: PostRecord[],
  importSettings: boolean,
  currentAhjs: Ahj[] = [],
): Promise<ImportOutcome> {
  const text = await file.text();
  let parsed: ExportFile;
  try {
    parsed = JSON.parse(text) as ExportFile;
  } catch {
    throw new Error('Not a valid JSON file.');
  }
  if (!Array.isArray(parsed.records)) throw new Error('File has no records array.');
  const { records, added, updated } = mergeImport(currentRecords, parsed);
  const ahjs = Array.isArray(parsed.ahjs) ? mergeAhjs(currentAhjs, parsed.ahjs) : currentAhjs;
  const ahjNote = Array.isArray(parsed.ahjs) ? `, ${parsed.ahjs.length} AHJ boards merged` : '';
  return {
    records,
    ahjs,
    settings: importSettings && parsed.settings ? parsed.settings : undefined,
    summary: `Imported: ${added} added, ${updated} updated${ahjNote}${importSettings ? ', settings applied' : ''}.`,
  };
}
