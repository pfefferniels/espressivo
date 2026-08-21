/**
 * Compile-time units of measure, with zero runtime cost (ARCHITECTURE.md §7, RULE U1).
 *
 * The failure these prevent happened: {@link MovementData.getMovementSegment} takes its
 * sampling threshold in a normalized 0..1 domain and returns values scaled ×127, so
 * `maxStepSize` meant one thing going in and another coming out. Fixtures generated against a
 * 0..127 input subdivided ~1270× too often and stored 16129 = 127 × 127, double-scaled.
 *
 * A branded type is `number` plus a phantom property: a `number` everywhere arithmetic is
 * concerned, but not interchangeable with a differently-branded one. There are no
 * `asTicks(n)`-style converters, because RULE U2 requires this module to emit no JavaScript at
 * all — so a raw number becomes a branded one through an `as` cast at the few construction
 * sites, normally where an XML attribute is parsed. This module compiles to `export {};` and
 * nothing else; do not add a value to it.
 *
 * Where brands apply is fixed by RULE U3 and is deliberately narrow: the facade's output types
 * and three interior declarations. RULE U4 keeps them out of the parity-frozen arithmetic,
 * where an `as` at every operator would bury exactly the changes a reviewer must be able to
 * see.
 */

declare const brand: unique symbol;
type Branded<Name extends string> = number & { readonly [brand]: Name };

/** Symbolic MSM/MPM time, in pulses per quarter note. */
export type Ticks = Branded<'ticks'>;

/** Performance time. */
export type Milliseconds = Branded<'ms'>;

/** A 0..1 quantity — before any scaling into a MIDI range. */
export type Normalized = Branded<'normalized'>;

/** A 0..127 MIDI value: velocity, controller value, pitch. */
export type Midi7Bit = Branded<'midi7'>;

/** Beats per minute. */
export type Bpm = Branded<'bpm'>;
