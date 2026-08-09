# Expression-Transform Campaign (exaggeration / spotlight)

Autonomous program, started 2026-08-09. Conductor session: this file's author.
User directive: integrate the mpm-renderer exaggeration mechanism ("shader") into
espressivo — **rethought, generalized, idiomatic** — without the prototype's dead
ends and magic numbers. Full autonomous authority per [[meico-swarm-governance]]
(journal invariant-touching calls in expression/LOG.md before executing).

## Mission

A new layered module `src/expression/` + facade entry points in `src/api/` that
transform an MPM performance parametrically:

- **Exaggerate**: per-dimension factor `s` (s=1 ⇒ identity) applied in the correct
  scale space per attribute — the mpm-renderer formulas paper's principle:
  *transform into an unbounded space where the neutral point maps to 0, scale by s,
  map back* (log around a geometric mean, logit around 0.5, linear around 0,
  boundary-respecting power laws).
- **Spotlight** (generalized Shader.bringOut): attenuate all dimensions NOT
  represented in a selection of MPM instructions, with explicit attenuation.
- Supporting primitives as the design decides (uniform scaling, humanize).

## Relationship to the sources

- `/Users/nielspfeffer/Projects/mpm-renderer` (Java prototype) is the *idea source*,
  NOT a parity target. We deliberately diverge; divergences are design decisions,
  recorded in DESIGN.md, not bugs.
- Known prototype defects we do NOT port: articulation exaggeration declared but
  unimplemented; `Isolation.contextualize` date/volume confusion; hardcoded PPQ 720;
  hardcoded clamps; magic default weights (1.1/0.2/1.3/…); magic shader factor 0.1;
  sketchiness exponent soup.
- Isolation/exemplify/context rendering is OUT OF SCOPE for this campaign (separate
  future campaign; it is selection/excerpt machinery, not expression transformation).

## Non-negotiable invariants

1. **Verify gate**: `npm run verify` green before every commit. No exceptions.
2. **Upstream-parity untouched**: nothing under `tests/integration/fixtures/**`
   changes; existing rendering code paths (`src/mpm`, `src/msm`, `src/mei`,
   `src/midi`) are not modified except where the design REQUIRES a hook, each such
   touch journaled with rationale and proven byte-neutral for the untouched
   pipeline (fixture suite is the proof).
3. **New code is additive**: `src/expression/` + `src/api` additions + tests.
4. **One wave = one commit** on branch `exaggeration`, message
   `feat(expression): <title>` / `chore(expression): …`. Never commit on main.
5. **No magic numbers**: every constant is either (a) a mathematical identity,
   (b) an explicit option with a documented default and rationale, or (c) a named
   preset documented as heuristic. Hard clamps only where the MPM spec or renderer
   defines a domain — cited.
6. **s=1 is byte-identity**: exaggerating with factor 1 returns a byte-identical
   document. Property-tested.
7. **Idiomatic per house rules**: refactor/CHARTER.md conventions apply (readonly,
   no input mutation at the facade, typed errors, RULE F1/F2 plain-data facade).
8. **Adversarial verification** per wave before its commit.

## Coordination

- Ornamentation campaign (worktree ../meico-ts-orn, branch ornamentation-v3,
  session meico-ts-09): messaged 2026-08-09 re ornament attribute surface + merge
  order. Until they answer, ornament coverage targets main's surface,
  registry-driven for cheap adaptation.
- mlign-57: exaggeration as alignment-training data augmentation; their answer may
  shape facade options (seeded batch generation). Not a blocker.

## State

Journal: expression/LOG.md (append-only). Waves: W0 survey → W1 design →
W2 core engine → W3 facade → W4 spotlight/presets/docs → W5 audit+report.
