// Customer-name formatting (Aboud, 2026-10-02): Salesforce pastes arrive in
// ALL CAPS ("ANTHONY STEREFF") and the post must read "Anthony Stereff" —
// first letter capital, the rest small, on every word. Applied at every entry
// point (text paste, image extraction, manual typing) so the record itself is
// always stored normalized.

/** "ANTHONY STEREFF" / "anthony stereff" → "Anthony Stereff". Hyphenated parts count as words. */
export function titleCaseName(name: string): string {
  return name.replace(/[^\s-]+/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());
}
