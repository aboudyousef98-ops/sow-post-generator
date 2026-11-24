// Design process QA (Aboud 2026-11-24) — two tri-state checks in the Feedback
// card, beside the wire-material check. Each answer only matters when it is
// "No": a "No" adds a reminder line to Design Feedback (both the Slack post and
// the SF field), via designQaLines() in template.ts. Tri-state on purpose — a
// blank must never flag the designer, the same contract as the wire verdict
// and every SVT site-condition pick. No required gate (this site does not gate
// fields); the readiness row stays advisory.

import type { DesignQa, PostRecord } from '../types';

interface Props {
  record: PostRecord;
  update: (updater: (r: PostRecord) => PostRecord) => void;
}

const yesNoValue = (v: boolean | undefined) => (v === undefined ? '' : v ? 'yes' : 'no');
const yesNoParse = (v: string): boolean | undefined => (v === '' ? undefined : v === 'yes');

export default function DesignQaRow({ record, update }: Props) {
  const q = record.designQa ?? {};
  const setQa = (patch: Partial<DesignQa>) =>
    update((r) => ({ ...r, designQa: { ...(r.designQa ?? {}), ...patch } }));

  return (
    <>
      <div className="install-subhead">Design process check</div>
      <div className="install-row">
        <label className="field">
          Project files on the shared folder?
          <select value={yesNoValue(q.sharedFolder)} onChange={(e) => setQa({ sharedFolder: yesNoParse(e.target.value) })}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <span className="field-hint">No → adds a reminder to save them to the shared folder</span>
        </label>

        <label className="field">
          Used the master template?
          <select value={yesNoValue(q.usedTemplate)} onChange={(e) => setQa({ usedTemplate: yesNoParse(e.target.value) })}>
            <option value="">—</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <span className="field-hint">No → adds a reminder to use the template next time</span>
        </label>
      </div>
    </>
  );
}
