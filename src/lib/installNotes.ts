import type { InstallNotes } from '../types';

/** A fully-blank Installation Notes block — every box empty, no dropdown chosen. */
export function emptyInstallNotes(): InstallNotes {
  return {
    orientations: [],
    storiesOther: '',
    batteryLocation: '',
    mainDisconnectLocation: '',
    loadRun: '',
    serviceRun: '',
    solarRun: '',
    batteryRun: '',
    specialCases: '',
    other: '',
  };
}
