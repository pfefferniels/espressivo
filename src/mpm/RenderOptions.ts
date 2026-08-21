import { foldl } from '../prelude/index.js';
import type { Normalized } from '../units.js';

/**
 * Caller-supplied knobs for one performance render (ARCHITECTURE.md §2.4).
 *
 * Every field is optional and every default reproduces the historic behaviour exactly, so
 * `perform(msm)` and `perform(msm, {})` are bit-identical to a render with no options at all.
 *
 * Fields are plain `number`, deliberately (RULE U3a). A brand costs the *writer* of input:
 * since RULE U2 forbids converter functions, a branded field would force every caller to write
 * `0.05 as Normalized`. The brand is applied internally instead, with one `as` at the use site.
 */
export interface RenderOptions {
  /**
   * Base seed for imprecision rendering. A `seed` attribute in the MPM always wins
   * (RULE F7); this supplies a seed only where the MPM supplies none. Omitting it leaves
   * every distribution on its constructor's `Math.random()` seed — today's behaviour.
   */
  readonly seed?: number;

  /**
   * Largest value step tolerated between two consecutive sampled `<position>` events, in
   * the **normalized 0..1** domain `movementSegment` (`mpm/elements/maps/data/movement.ts`) subdivides
   * against — not the 0..127 domain it scales into. Raising it subdivides less and emits
   * fewer events for a long ramp; lowering it emits more. Defaults to
   * {@link DEFAULT_MOVEMENT_SAMPLE_MAX_STEP}.
   */
  readonly movementSampleMaxStep?: number;

  /**
   * Whether MPM v3 ornaments generate their notes. Defaults to
   * {@link DEFAULT_EXPAND_ORNAMENTS}.
   *
   * Set to `false` and every ornament that uses a v3 feature (`isV3Ornament`'s gate: a note
   * pool, a `noteid`, `repetitions`, or the grouping syntax in `note.order`) is skipped whole:
   * no note is created, no `ornament.*` provenance attribute is written, and not even the
   * `note.order.perf` echo lands on the `<ornament>` element.
   *
   * It does not reach MPM v2 ornaments, which generate nothing to begin with — they write
   * modifier markers onto notes that already exist. A v3 ornament suppressed by this flag is
   * not re-routed through the v2 path either: v2 would spread notes the v3 ornament never
   * claimed.
   */
  readonly expandOrnaments?: boolean;
}

/**
 * The historic sampling step, which every reference fixture is generated with. Changing
 * it changes rendered output — that is what the knob is for, and why it is a knob rather
 * than the mutable static it replaced (RULE I5).
 *
 * Mirrors `MovementMap.java:252`, whose static must likewise be left at its default by
 * anyone regenerating ground truth from the Java fork (parity ledger row D1).
 */
export const DEFAULT_MOVEMENT_SAMPLE_MAX_STEP = 0.1 as Normalized;

/**
 * Ornament expansion is on unless a caller turns it off, so that omitting
 * {@link RenderOptions.expandOrnaments} renders the MPM as written.
 *
 * Mirrors meico's own opt-out (`Mei.exportMsmMpm`'s `ignoreOrnaments`, CLI `-eo`), whose
 * default is likewise "expand"; only the polarity of the name is flipped.
 */
export const DEFAULT_EXPAND_ORNAMENTS = true;

/**
 * Per-render, per-call state. Created in {@link Performance.perform} and passed by
 * reference down the render chain; never stored on a class, a module or `globalThis`.
 *
 * {@link streamOrdinal} is mutable by design and is the one exception the immutability
 * policy grants this type (RULE I1, boundary 6): it shares its lifetime exactly with the
 * `perform` call that created it and is unreachable once that call returns.
 */
export interface RenderContext {
  readonly options: RenderOptions;
  /** Monotonic ordinal of imprecision streams within this render. Mutable by design. */
  streamOrdinal: number;
}

/**
 * Deterministic sub-seed. Pure; no state. Never returns 0 (Mulberry32 must not be seeded
 * 0, which is why {@link RandomNumberProvider}'s own field initializer ends in `|| 1`).
 *
 * Called as `deriveSeed(options.seed, ordinal, impIndex)` — that argument order is
 * normative (§2.4), because the derived seeds are only reproducible if every caller folds
 * the same parts in the same order.
 */
export function deriveSeed(base: number, ...parts: readonly number[]): number {
  // Integer arithmetic throughout (`Math.imul`, `^`, `>>>`), so there is no float to
  // reassociate; `foldl` walks front to back, which is the argument order the seeds depend on.
  const h = foldl(parts, base >>> 0, (acc, p) => Math.imul(acc ^ (p >>> 0), 0x27d4eb2d) >>> 0);
  return h || 1; // 0 -> 1, matching RandomNumberProvider's own guard
}
