// Export / import helpers shared by the History and Settings tabs.

import type { ExportFile, PostRecord, Settings } from '../types';
import { buildExport, exportFileName, mergeImport } from './storage';

export function downloadExport(settings: Settings, records: PostRecord[]): void {
  const file = buildExport(settings, records);
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
  settings?: Settings;
  summary: string;
}

export async function readImportFile(
  file: File,
  currentRecords: PostRecord[],
  importSettings: boolean,
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
  return {
    records,
    settings: importSettings && parsed.settings ? parsed.settings : undefined,
    summary: `Imported: ${added} added, ${updated} updated${importSettings ? ', settings applied' : ''}.`,
  };
}
