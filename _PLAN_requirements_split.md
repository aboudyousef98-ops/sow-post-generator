# Design — Requirements split + SOW general notes

> Aboud, 2026-10-08: "we need the AHJ requirements to be more than one part, so we have
> Utility requirement, AHJ, Solrite/funding requirements" + "one extra tab for (SOW general notes)
> beside the AHJ". Approved: "do the design and implement".

## Decisions taken (his answers)

1. **Each category is keyed differently** — AHJ by Jurisdiction, Utility by utility company,
   Solrite/funding globally. He rejected "all three keyed by Jurisdiction" precisely because the
   same CenterPoint rules would be re-typed under every Harris-area jurisdiction.
2. **SOW general notes is team reference only — it NEVER reaches a post.** Same shape as an AHJ
   board ("similar to AHJ requirements but general"), its own main tab, no approval, no post section.

## Data model — extend, do not fork

One discriminator on the existing entity:

```ts
export type RequirementKind = 'ahj' | 'utility' | 'funding' | 'general';
// on Ahj:
kind?: RequirementKind;   // absent === 'ahj' (every board that already exists)
```

**The Blobs key stays `ahjs` and `mergeAhjs` is untouched.** That is the whole point of extending
rather than adding three new stores: no new sync path, no new merge rules, and every board already
in production keeps working with `kind` simply absent. `kindOf(board)` defaults to `'ahj'`.

## Matching — the part that differs per kind

| Kind | Matched against | How |
|---|---|---|
| `ahj` | `sf.jurisdiction` | existing name/alias matcher |
| `utility` | `sf.utility` | same matcher, different key |
| `funding` | — | global: every live `funding` board applies |
| `general` | — | never matched, never posted |

`sf.utility` already existed (the Salesforce extractor fills it, and TNMP already drives the 4–6 h
disconnect rule). A manual picker was added 2026-10-08 so it can be set when a paste misses it.

## Approval — explicit per kind

`ahjApprovedId` stays exactly as-is. Two additive siblings:

```ts
utilityApprovedId?: string;
fundingApprovedId?: string;
```

Same contract as `ahjApprovedId`: it stores the id of the SPECIFIC board approved, so changing the
Jurisdiction/Utility away from it automatically un-approves, and changing back restores it.
Repetitive by choice — a single map would have needed a migration for `ahjApprovedId`.

## Post output

Up to three sections, always in this order, each omitted when not approved or empty:

```
*AHJ Requirements (Harris County):*
• ...
*Utility Requirements (CenterPoint Energy):*
• ...
*Funding Requirements (Solrite):*
• ...
```

`general` never appears here.

## UI

- The `AHJ Requirements` main tab becomes **`Requirements`**, with a kind switcher: AHJ / Utility /
  Funding. One component, parameterised by kind — the parent hands it the boards of that kind and a
  setter that merges them back, so the other kinds cannot be clobbered.
- New main tab **`SOW Notes`** for `kind: 'general'` — same board UI, no approval, no post section.
- Compose grows an approval control per matched kind, mirroring the existing AHJ banner.

## Risks

- **Clobbering other kinds on write.** The per-kind setter must re-attach the boards it was not
  given. Covered by a test that edits one kind and asserts the others survive byte-identical.
- **Un-kinded boards.** Anything created before today has no `kind`; `kindOf()` defaults it to
  `'ahj'` so production data lands in the AHJ tab exactly where it is now. Covered by a test.
- **Post regression.** Existing posts must be byte-identical when only an AHJ is approved.
  Covered by a test.
