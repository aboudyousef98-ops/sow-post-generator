# STUDY — Equipment widths extracted from the Elevation Drawing template (DXF)

> Date: 2026-11-17 | Source: `Elevation Drawing -Template (1).dxf` (ASCII DXF, AC1032/2018, 59 MB)
> Units: `$INSUNITS = 1` (inches), `$MEASUREMENT = 0` (imperial). All figures below are inches.
> Status: RESEARCH — four widths still missing, nothing built on this yet.

---

## 1. Confidence levels — read this before using any number

| Tier | What it means |
|---|---|
| **A — measured** | Taken from block geometry or from the spacing of real INSERTs. Trustworthy. |
| **B — stated** | The drawing's own text names the size (e.g. "10X10X48 GUTTER BOX"). Trustworthy. |
| **C — unknown** | Could not be extracted. **Not guessed.** Needs Aboud or a spec sheet. |

A label-proximity pass was tried and **thrown away**: it returned the same
rectangle (14.30 × 30.82) for "Duracell Inverter", "125A Solar Load Center",
"Gutter Box" *and* "Duracell Battery", which means those labels are leader-text
clustered near a legend, not annotations sitting on their geometry. Four
identical answers for four different parts is a failed method, not a finding.

---

## 2. Tier A — measured from the drawing

### Duracell battery
| Property | Value | How |
|---|---|---|
| Body width | **23.57"** | `BOS_DURACELL_BATTERY` block bounding box |
| Body height | **55.38"** | same |
| Centre-to-centre spacing | **27.33"** (19 occurrences) · **27.54"** (13) | X-delta between adjacent INSERTs |
| Clear gap between bodies | **3.76" / 3.97"** → ~**4"** | spacing − body width |

### Battery run — total span, end to end
Measured across 21 real runs (53 battery inserts):

| Batteries | Span | Occurrences |
|---|---|---|
| 2 | **50.90"** | 8 |
| 2 | 51.11" | 2 |
| 3 | **78.44"** | 11 |

Checks out arithmetically: `2 × 23.57 + 3.76 = 50.90`, `3 × 23.57 + 2 × 3.87 = 78.45`.
**The drawing only ever contains runs of 2 or 3** — no 1s, no 4s.

### Other BOS_ library blocks
| Block | W × H |
|---|---|
| `BOS_GUTTER_BOX` | **48.00 × 10.00** |
| `BOS_JUNCTION_BOX` | 12.00 × 12.00 |
| `BOS_LR_CONDULET_EXTERNAL` | 11.83 × 5.07 |
| `BOS_LB/LL_CONDULET_EXTERNAL` | 10.83 × 5.07 |
| `BOS_PVC_ELBOW` / `BOS_ELBOW90_2PVC` | 12.29 × 12.29 |
| `BOS_ELBOW90_114PVC` | 8.60 × 8.60 |
| `BOS_PVC_45D ELBOW` | 10.22 × 10.76 |
| `BOS_OFFSET_NIPPLE` | 4.46 × 4.08 |
| `BOS_LB_CONDULET_DRILL` | 3.70 × 20.93 |
| `BOS_MALE_ADAPTOR` | 3.28 × 2.17 |
| `BOS_MYERS` | 3.00 × 2.88 |
| `BOS_GROUNDING_BUSHING` | 2.18 × 1.45 |

Blocks whose bounding box came back in the tens of thousands of inches
(`Gas Meter`, `Tesla Gateway III`, `MSP`, the disconnects…) are **polluted** —
they contain nested references at far-flung coordinates. Their sizes are NOT
usable. Only the `BOS_*` family is drawn clean at origin.

---

## 3. Tier B — sizes the drawing states in its own text

Gutter boxes come in four catalogue sizes, named in the labels:

| Label | Section | Length |
|---|---|---|
| `8X8X24 GUTTER BOX` | 8 × 8 | 24" |
| `8X8X48 GUTTER BOX` | 8 × 8 | 48" |
| `10X10X24 GUTTER BOX` | 10 × 10 | 24" |
| `10X10X48 GUTTER BOX` | 10 × 10 | 48" |

(`8X8X48 RT` and `8X8X24 RT` also appear — "RT" variant, purpose unconfirmed.)
The `BOS_GUTTER_BOX` block at 48 × 10 is the 10×10×48.

Label frequency across the sheet set, as a proxy for what is standard:
`DURACELL BATTERY` 87 · `125A SOLAR LOAD CENTER` 85 · `GUTTER BOX` 79 ·
`DURACELL INVERTER` 79 · `200A UTILITY METER` 54 · `125A ENPHASE LOAD CENTER` 5.

So the standard Duracell wall is: **battery run + inverter + 125A solar load
center + gutter box + 200A utility meter**.

---

## 4. Tier C — MISSING, needed before the calculator can be trusted

These four are the blockers. They are drawn inside nested parent blocks, so
they could not be measured, and they will **not** be guessed:

1. **Duracell inverter** — width
2. **125A solar load center** — width
3. **200A utility meter** — width
4. **AC disconnect** — width (if it is on the same wall)

Also unconfirmed:
5. Is the ~4" battery gap a **manufacturer/fire-code minimum** or drafting preference?
6. Do **Sonnen** stacks have a different width, or only different kWh?
7. End clearances — how far from a corner/door/gas meter must the run start?

---

## 5. The 48" observation

Aboud: *"the gutter with its equipment that most of the time fit in the 48"
gutter box space."*

The numbers line up with that: a **2-battery run is 50.9"**, and the standard
gutter box is **48"** — near enough that the gutter and its equipment span the
same stretch of wall as a 2-battery run. A **3-battery run is 78.4"**, which
overruns a single 48" gutter by ~30".

**Not yet confirmed**: whether a 3-battery job uses a longer gutter, two
gutters, or simply lets the batteries run past it. This is question 8 for Aboud
and it decides whether the calculator needs a gutter row at all.

---

## 6. What this unlocks

With the battery numbers alone, the wall-fit check already works for the most
common case:

```
needed = stacks × 23.57 + (stacks − 1) × 4
  1 stack  →  23.6"
  2 stacks →  50.9"
  3 stacks →  78.4"
```

Adding the four missing widths extends it to the full equipment row.

*Extraction scripts: `%TEMP%\dxf-scan{,2,3,4}.mjs` — read-only, the DXF was never modified.*
