// One-time display-name renames, applied on every load.
//
// Aboud 2026-10-17: "you can change yarob's name to Yarob on everything on the
// platform to avoid confusion."
//
// Why this exists instead of just rewriting the stored blobs:
//
// Person names are stored as DISPLAY STRINGS on every row (`coordinator`,
// `actor`, `author`, `person`) — see the SPEC-GAP note in board/types.ts. The
// stored copies WERE rewritten (scripts/migrate-2026-10-17.mjs), but that alone
// does not reach anyone: `mergeById` only takes the incoming row when its
// `updatedAt` is strictly NEWER, and a rename does not change `updatedAt`. So
// every client whose localStorage already holds the old spelling would keep it
// forever. Bumping `updatedAt` on all 161 projects would have fixed the merge
// and ruined the "Last update" column and the staleness flags at the same time.
//
// So the rename is applied as a normalisation at read time. It is idempotent,
// costs one pass over the data, and is correct no matter what any cache holds.
// Entries can be deleted once no stored blob or cache contains the old value.

export const LEGACY_NAMES: Record<string, string> = {
  "Ya'rob Alnabelsi": 'Yarob Alnabelsi',
  'Ya’rob Alnabelsi': 'Yarob Alnabelsi', // curly apostrophe, seen in pasted text
};

/** Rename one display-name value. Returns it unchanged when nothing matches. */
export function renameValue<T>(value: T): T {
  return typeof value === 'string' && value in LEGACY_NAMES
    ? (LEGACY_NAMES[value] as unknown as T)
    : value;
}

/**
 * The fields that hold a person's display name anywhere in this app. Listed
 * explicitly rather than rewritten blind, so a project genuinely CALLED
 * "Ya'rob Alnabelsi" would not be renamed out from under us.
 */
const NAME_FIELDS: readonly string[] = [
  'coordinator',
  'actor',
  'author',
  'person',
  'by',
  'updatedBy',
  'createdBy',
  'editedBy',
  'displayName',
  'lastAuthor',
];

/** Fields holding an ARRAY of bare display names, e.g. `settings.authors`. */
const NAME_LIST_FIELDS: readonly string[] = ['authors'];

/**
 * Walk a decoded blob and rewrite legacy names in the known fields only.
 * Returns the SAME object when nothing changed, so React sees no new identity
 * and no needless re-render or re-save happens on the overwhelmingly common
 * path where there is nothing to rename.
 */
export function renameLegacyNames<T>(input: T): T {
  let changed = false;

  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      const out = node.map(walk);
      return changed ? out : node;
    }
    if (node && typeof node === 'object') {
      const src = node as Record<string, unknown>;
      const out: Record<string, unknown> = {};
      let localChanged = false;
      for (const [k, v] of Object.entries(src)) {
        let w: unknown;
        if (typeof v === 'string' && NAME_FIELDS.includes(k)) {
          w = renameValue(v);
        } else if (Array.isArray(v) && NAME_LIST_FIELDS.includes(k)) {
          const list = v.map((x) => (typeof x === 'string' ? renameValue(x) : walk(x)));
          w = list.some((x, i) => x !== v[i]) ? list : v;
        } else {
          w = walk(v);
        }
        if (w !== v) {
          changed = true;
          localChanged = true;
        }
        out[k] = w;
      }
      return localChanged ? out : node;
    }
    // A bare string reached by any other route is data, not a person — leave it.
    return node;
  };

  return walk(input) as T;
}
