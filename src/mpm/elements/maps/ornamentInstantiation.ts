import { Attribute, Element } from '../../../xml/XomTypes.js';
import { attribute, firstChildElement, getAttributeValue } from '../../../xml/tree.js';
import { addUUID } from '../../../xml/ids.js';
import { groupBy, head, isNonEmpty, partitionWith, zipWith } from '../../../prelude/index.js';
import { formatNoteOrderPerf, parseNoteOrder } from './data/noteOrder.js';
import { expandOrnament } from './data/ornamentExpansion.js';
import { FrameDomain, NoteOffShift, TemporalSpread } from '../styles/defs/TemporalSpread.js';
import type { GenericMap } from './GenericMap.js';
import { applyGeneratedOrnament, principalNoteId, type Ornament } from './data/ornament.js';
import type { NoteOrderList, PitchSpec, ResolvedNote, Slot } from './data/ornamentExpansion.js';
import type { OrnamentAlignment } from '../styles/defs/TemporalSpread.js';
import type { TemporalValue } from '../styles/defs/TemporalValue.js';

/**
 * The MPM v3 **discrete-note renderer**: it turns an `<ornament>` that carries a note pool
 * (or a `note.order` in the v3 grammar) into real MSM `<note>` elements in the score, lays
 * them out in the ornament's time frame, and carves the principal note they replace.
 *
 * This is DESIGN.md D5's "phase N" (symbolic), D10 (timing and carving), D11 (several
 * ornaments on one principal) and D13 (generated notes are MSM `<note>`s, so MIDI export, the
 * facade's note discovery and every downstream pass see them with no further change).
 *
 * ## Where it sits in the pipeline
 *
 * `OrnamentationMap.apply` walks its entries once. A v2 ornament takes the untouched v2 path
 * (DESIGN.md D6: the byte gate). A v3 ornament is *prepared* here during the walk
 * ({@link prepareOrnament} — resolution, expansion, frame reading, all read-only on the
 * score) and *instantiated* here after the walk ({@link instantiateOrnaments}). The two-phase
 * shape is not tidiness:
 *
 * - D11 needs every ornament on a principal before it can lay out the first one (the overflow
 *   scale factor is a function of their total length), and
 * - inserting notes during the walk would change what a *later* v2 ornament sees, because the
 *   v2 branch collects "every note at this date" from the live map. Deferring keeps the v2
 *   path's inputs bit-for-bit what they were.
 *
 * Everything here runs in the symbolic domain, before the tempo pass. Tick and `%` frames are
 * therefore resolved to real tick dates on the generated notes; millisecond frames cannot be
 * (there are no milliseconds yet) and are expressed as the v2 `ornament.milliseconds.*`
 * markers the millisecond pass already consumes — plus, for `alignment="at end"`, the one new
 * marker the D5 amendment introduces (see {@link applyMillisecondSpacing}).
 *
 * Nothing here touches an ornament without a v3 feature ({@link isV3Ornament} is the gate),
 * nothing throws (RULE E1: every rejection logs its reason and returns), and nothing outside
 * the MSM clone `Performance.perform` opened is mutated (mutation boundary 3).
 */

/**
 * Attributes a generated note does **not** inherit from its principal.
 *
 * The renderer clones the principal (`Element.copy()`) and strips these, so that everything
 * the pipeline has already decided about that note carries over. Of the eleven attributes an
 * MSM note carries at this point in the pipeline, `modified` and `velocity` are the two that
 * survive.
 *
 * Why each of the others goes:
 * - `id` (i.e. `xml:id`) — every generated note draws its own; the principal's is then
 *   re-assigned to one of them deliberately (see {@link assignPrincipalId}).
 * - `date`, `duration`, `date.end` and their `.perf` twins — the layout computes them.
 * - `midi.pitch` — the expansion resolved it.
 * - `pitchname`, `accidentals`, `octave` — the principal's *spelling*. A note a third above it
 *   is not that note, and MSM treats these as derived from the pitch.
 * - `milliseconds.*` — do not exist yet in the symbolic phase; stripped so that performing an
 *   already-augmented MSM a second time cannot smuggle stale times in.
 * - `ornament.*` — markers a *previous* ornament left on the principal. Inheriting them would
 *   apply that ornament's offset a second time, to a note it never named.
 *
 * `ornament.carved` cannot fire within one render — only {@link markCarved} writes it, and
 * {@link createChords} has copied the principal by then. It is listed for the case a test
 * pins: a principal read back from an already augmented MSM does arrive carrying the mark, and
 * every note generated from it would claim to be a carved head.
 */
const NOT_INHERITED: readonly string[] = [
  'id',
  'date',
  'duration',
  'date.end',
  'date.perf',
  'duration.perf',
  'date.end.perf',
  'midi.pitch',
  'pitchname',
  'accidentals',
  'octave',
  'milliseconds.date',
  'milliseconds.date.end',
  'ornament.dynamics',
  'ornament.date.offset',
  'ornament.duration',
  'ornament.noteoff.shift',
  'ornament.milliseconds.date.offset',
  'ornament.milliseconds.duration',
  'ornament.milliseconds.fromend.offset',
  'ornament.generated',
  'ornament.carved',
  'ornament.ref',
  'ornament.source',
  'ornament.slot',
  'ornament.pass',
  'ornament.anchor',
];

/**
 * The reference implementation's yardstick for the `repetitions="-1"` fill sentinel: one
 * ornament note per 150 ms of frame (blueprint §4.2). DESIGN.md D9 keeps the number and drops
 * the append-until-it-fits loop that discovers it.
 */
const FILL_MILLISECONDS_PER_NOTE = 150;

/** The frame's clock. `%` is not one of these — it resolves into ticks (DESIGN.md D4). */
type FrameDomainV3 = 'ticks' | 'milliseconds';

/** A frame, resolved to plain numbers in one domain. Lengths are non-negative. */
interface FrameSpec {
  readonly domain: FrameDomainV3;
  readonly offset: number;
  readonly length: number;
  readonly intensity: number;
  readonly noteOffShift: NoteOffShift;
  readonly alignment: OrnamentAlignment;
}

/** The principal note's geometry, read once and shared by every ornament on it. */
interface PrincipalGeometry {
  /** Symbolic tick date the frame is anchored at. */
  readonly date: number;
  /** Symbolic tick duration `%` frames resolve against and note-offs are measured from. */
  readonly duration: number;
  /**
   * `date.perf − date` on the principal, or 0 when it carries no `date.perf` yet.
   *
   * Ornamentation runs *after* rubato, so a principal may already sit somewhere other than its
   * notated date. Generated notes are laid out in notated time — what the frame is defined
   * against, and what `%` measures — then shifted by the principal's own deflection. A
   * *duration* deflection (articulation) is deliberately not inherited: the frame already
   * fixes how long each ornament note lasts.
   */
  readonly perfDelta: number;
  /** Whether the principal has `.perf` attributes yet — the global stage runs before they exist. */
  readonly hasPerf: boolean;
  /**
   * Whether the principal carries a symbolic `date.end` that generated notes should mirror.
   *
   * False for every document in the repository — a scan of all 57 `.msm` files under `tests/`
   * finds `date.end` on `<section>` elements and on no `<note>` at all — so no fixture
   * exercises the `true` branch here or in {@link createNote} and {@link carve}. Kept because
   * MSM's schema permits the attribute on a note, and a generated note inheriting a stale
   * `date.end`, or a carved leftover keeping one while its `duration` shrank, would be an
   * inconsistent document.
   */
  readonly hasDateEnd: boolean;
}

/** One ornament, read and expanded, waiting for its group's layout. */
export interface PreparedOrnament {
  readonly od: Ornament;
  /** The principal note element, or null on D7's no-principal path. */
  readonly principal: Element | null;
  readonly geometry: PrincipalGeometry;
  readonly slots: readonly Slot[];
  readonly frame: FrameSpec;
  /** `xml:id` of the `<ornament>`, for the `ornament.ref` provenance attribute (D10). */
  readonly ornamentId: string | null;
  /** Pitch of the principal, or null when there is none. Decides the id carrier (D10). */
  readonly principalPitch: number | null;
}

/**
 * DESIGN.md D6's gate: does this `<ornament>` use anything MPM v2 cannot express?
 *
 * Each of the four markers is impossible in a v2 document: a v2 `<ornament>` is always empty,
 * and `noteid`, `repetitions` and the `note.order` grouping syntax all arrived with v3.
 * `repetitions` is tested on the *attribute*, not on the parsed value, because
 * `repetitions="0"` is as much a v3 marker as `repetitions="3"`.
 *
 * The `note.order` test is a character probe rather than a parse: `[`, `]` and `|` are the
 * only characters the v3 grammar adds and none can occur in a v2 value, so the v3 parser
 * stays off the v2 path entirely.
 */
export function isV3Ornament(xml: Element, od: Ornament): boolean {
  if (od.notes.length > 0) return true;
  if (od.noteid !== null) return true;
  if (attribute('repetitions', xml) !== null) return true;
  return od.noteOrderText !== null && /[[\]|]/.test(od.noteOrderText);
}

/**
 * Read one v3 ornament: resolve its principal, expand its `note.order`, resolve its frame.
 * Read-only on the score — nothing is created or moved until {@link instantiateOrnaments}.
 *
 * The one write is `note.order.perf` on the `<ornament>` element itself, which DESIGN.md D7
 * asks for "for downstream visibility" and which is written as soon as an expansion exists.
 *
 * @param od already carrying its style, def, date, scale and v3 fields
 * @param notes every note of every map being ornamented, by `xml:id`
 * @param owners which map each note lives in ({@link noteOwners}) — what lets the key
 *   signature be read from the principal's *own* part when a global ornamentation map reaches
 *   across several
 * @returns null when the ornament cannot be rendered; the reason has been logged
 */
export function prepareOrnament(
  od: Ornament,
  ornamentXml: Element,
  notes: ReadonlyMap<string, Element>,
  owners: ReadonlyMap<Element, GenericMap>,
): PreparedOrnament | null {
  const ornamentId = attribute('id', ornamentXml)?.getValue() ?? od.xmlId;
  const label = describeOrnament(ornamentId, od.date);

  if (od.noteOrderText === null) {
    console.error(
      `Warning: ${label} uses MPM v3 features but has no note.order, so there is no sequence to play; the ornament is skipped.`,
    );
    return null;
  }
  const order = parseNoteOrder(od.noteOrderText);
  if (order === null || order.kind !== 'list') {
    // A pitch keyword keeps its full v2 behaviour (D9), so this is unreachable from
    // `OrnamentationMap.apply` — `isV3Ornament`'s character probe rejects both keywords. It
    // stands for callers that build an Ornament in code.
    console.error(
      `Warning: ${label} combines MPM v3 features with the v2 note.order keyword "${od.noteOrderText}"; the ornament is skipped.`,
    );
    return null;
  }
  logDiagnostics(label, order.warnings);

  const principal = resolvePrincipal(od, order, notes, label);
  const principalPitch = principal === null ? null : readNumber(principal, 'midi.pitch');
  if (principal !== null && principalPitch === null) {
    console.error(
      `Warning: ${label} resolves to a principal note without a readable midi.pitch; the ornament is skipped.`,
    );
    return null;
  }

  const values = frameValues(od);
  const anchored = readGeometry(principal, od.date);
  const frame = resolveFrame(values, anchored, principal !== null, label);
  if (frame === null) return null;
  if (principal === null && frame.domain === 'milliseconds') {
    console.error(
      `Warning: ${label} has a millisecond frame but no principal note; a millisecond frame borrows its tick position and length from its principal, so the ornament is skipped.`,
    );
    return null;
  }
  // With no principal the frame itself stands in for one (D7 step 3: the frame anchors at the
  // ornament's own date), so that noteoff.shift still has an end to measure against.
  const geometry =
    principal !== null
      ? anchored
      : { ...anchored, duration: Math.max(0.0, frame.offset) + frame.length };

  const expansion = expandOrnament({
    order,
    pool: poolOf(od),
    principal:
      principal === null || principalPitch === null
        ? null
        : { id: getAttributeValue('id', principal), midiPitch: principalPitch },
    msmNotes: msmPitchesOf(order, od, notes),
    repetitions: od.repetitions,
    diatonicContext: {
      keyFifths: readKeyFifths(
        principal === null ? null : (owners.get(principal) ?? null),
        od.date,
      ),
    },
    frameNoteBudget: frameNoteBudget(od, values),
  });
  logDiagnostics(label, expansion.warnings);
  if (!expansion.ok) {
    console.error(`Warning: ${label} cannot be rendered: ${expansion.reason}`);
    return null;
  }

  ornamentXml.addAttribute(
    new Attribute(
      'note.order.perf',
      formatNoteOrderPerf(expansion.slots.flatMap((slot) => slot.notes.map((note) => note.ref))),
    ),
  );

  return {
    od,
    principal,
    geometry,
    slots: expansion.slots,
    frame,
    ornamentId,
    principalPitch,
  };
}

/**
 * Lay out and instantiate every prepared ornament, grouped by the principal note they decorate
 * (DESIGN.md D11).
 *
 * Grouping is by element identity and keeps map order, so the front group's cursor walks the
 * ornaments in the order the `ornamentationMap` lists them. Ornaments with no principal each
 * form their own group.
 */
export function instantiateOrnaments(
  prepared: readonly PreparedOrnament[],
  owners: ReadonlyMap<Element, GenericMap>,
  maps: readonly GenericMap[],
): void {
  if (prepared.length === 0) return;

  // Every group is laid out before any orphan is: layout appends generated notes to the target
  // maps, so an interleaved pass would append them in a different order. `groupBy` preserves
  // encounter order inside each bucket and `Map` preserves first-encounter order across them.
  const { yes: orphans, no: parented } = partitionWith(prepared, (o) => o.principal === null);

  for (const [principal, group] of groupBy(parented, (o) => o.principal))
    renderGroup(group, principal, owners, maps);
  for (const orphan of orphans) renderGroup([orphan], null, owners, maps);
}

// ---------------------------------------------------------------------------------------
// principal resolution (D7)
// ---------------------------------------------------------------------------------------

/**
 * DESIGN.md D7's chain, in order: `@noteid` (with or without its `#`), then the first
 * `note.order` reference that is neither a pool note nor unresolvable, then nothing.
 *
 * Step 2 skips pool ids deliberately — a pool note is ornament-local and cannot be the
 * principal — and it skips references that name no note in the index, because a dangling
 * reference is dropped by the expansion anyway and must not consume the principal slot.
 */
function resolvePrincipal(
  od: Ornament,
  order: NoteOrderList,
  notes: ReadonlyMap<string, Element>,
  label: string,
): Element | null {
  const noteid = principalNoteId(od);
  if (noteid !== null) {
    const principal = notes.get(noteid);
    if (principal !== undefined) return principal;
    console.error(
      `Warning: ${label} names a principal note "${od.noteid ?? ''}" that this score does not have; falling back to note.order.`,
    );
  }

  const pool = new Set(od.notes.map((note) => note.id));
  for (const item of order.items)
    for (const id of item.ids) {
      if (pool.has(id)) continue;
      const candidate = notes.get(id);
      if (candidate !== undefined) return candidate;
    }

  return null;
}

/** The note pool as the expansion engine wants it: id → pitch spec. */
function poolOf(od: Ornament): ReadonlyMap<string, PitchSpec> {
  const pool = new Map<string, PitchSpec>();
  for (const note of od.notes) pool.set(note.id, note.pitchSpec);
  return pool;
}

/**
 * Pitches of the score notes `note.order` names directly — everything that is not a pool id,
 * looked up in the index the map already built. A reference whose note has no readable
 * `midi.pitch` is left out, so the expansion drops it with its own warning rather than
 * carrying a `NaN` into the output.
 */
function msmPitchesOf(
  order: NoteOrderList,
  od: Ornament,
  notes: ReadonlyMap<string, Element>,
): ReadonlyMap<string, number> {
  const pool = new Set(od.notes.map((note) => note.id));
  const pitches = new Map<string, number>();
  for (const item of order.items)
    for (const id of item.ids) {
      if (pool.has(id) || pitches.has(id)) continue;
      const note = notes.get(id);
      if (note === undefined) continue;
      const pitch = readNumber(note, 'midi.pitch');
      if (pitch !== null) pitches.set(id, pitch);
    }
  return pitches;
}

// ---------------------------------------------------------------------------------------
// frames (D4, D5)
// ---------------------------------------------------------------------------------------

/** A `temporalSpread`'s frame as authored, before anything is resolved to a number. */
interface FrameValues {
  readonly offset: TemporalValue;
  readonly length: TemporalValue;
  readonly intensity: number;
  readonly noteOffShift: NoteOffShift;
  readonly alignment: OrnamentAlignment;
}

/**
 * Read the def's frame, from whichever generation its `temporalSpread` was written in.
 *
 * A v3-sourced spread hands over its two {@link TemporalValue}s directly. A v2-sourced spread
 * is reachable from a v3 ornament too — a note pool over a plain
 * `<temporalSpread frame.start="-22.0" frameLength="44.0"/>` is legal — and its element-wide
 * `time.unit` becomes the domain of both values. A def with no `temporalSpread` gets the
 * spec's attribute defaults, `0.0ticks` and `100%`, so the ornament spans exactly its
 * principal: the only reading under which a def of nothing but a `dynamicsGradient` renders.
 */
function frameValues(od: Ornament): FrameValues {
  const def = od.ornamentDef;
  const alignment: OrnamentAlignment = def === null ? 'at start' : def.getAlignment();
  const spread = def === null ? null : def.getTemporalSpread();
  if (spread === null)
    return {
      offset: { value: 0.0, domain: 'ticks' },
      length: { value: 100.0, domain: 'relative' },
      intensity: 1.0,
      noteOffShift: NoteOffShift.False,
      alignment,
    };

  const v3Offset = spread.getFrameOffset();
  const v3Length = spread.getFrameLengthValue();
  const v2Domain = spread.frameDomain === FrameDomain.Milliseconds ? 'milliseconds' : 'ticks';
  return {
    offset: v3Offset ?? { value: spread.frameStart, domain: v2Domain },
    length: v3Length ?? { value: spread.getFrameLength(), domain: v2Domain },
    intensity: spread.intensity,
    noteOffShift: spread.noteOffShift,
    alignment,
  };
}

/**
 * Resolve a frame to numbers in one domain.
 *
 * The frame's domain is its `frameLength`'s — the length is the span the notes are spread
 * over, so it decides which clock the spacing is counted on. `%` resolves against the
 * principal's symbolic *tick* duration and therefore lands in ticks (DESIGN.md D4: a %-frame
 * trill is tempo-dependent and must breathe with rubato, which only tick-domain placement
 * gives; the reference implementation resolves it against milliseconds instead).
 *
 * `frame.offset` may carry its own domain in v3, and a value in a domain the frame cannot use
 * is dropped to 0 with a log rather than silently reinterpreted: ticks and milliseconds are
 * not convertible before the tempo pass has run. `%` on the offset resolves like `%` on the
 * length, and so is usable only in a tick-domain frame. A zero offset in the wrong domain is
 * the schema default rather than an authoring mistake, so it passes silently.
 *
 * @returns null when the frame cannot be resolved at all, having logged why
 */
function resolveFrame(
  values: FrameValues,
  geometry: PrincipalGeometry,
  hasPrincipal: boolean,
  label: string,
): FrameSpec | null {
  if (values.length.domain === 'relative' && !hasPrincipal) {
    console.error(
      `Warning: ${label} has a frameLength of "${values.length.value}%" but no principal note to measure it against; the ornament is skipped.`,
    );
    return null;
  }

  const domain: FrameDomainV3 = values.length.domain === 'milliseconds' ? 'milliseconds' : 'ticks';
  const length =
    values.length.domain === 'relative'
      ? (values.length.value / 100.0) * geometry.duration
      : values.length.value;

  // Compared against the frame's *resolved* domain, not the authored one:
  // `frame.offset="360ticks" frameLength="50%"` is the spec's figure-3 exemplum, and a `%`
  // length resolving into ticks is what makes those two commensurable.
  const offsetDomain: FrameDomainV3 =
    values.offset.domain === 'milliseconds' ? 'milliseconds' : 'ticks';
  let offset = 0.0;
  if (offsetDomain !== domain) {
    if (values.offset.value !== 0.0)
      console.error(
        `Warning: ${label} states frame.offset in a domain its frameLength cannot use; the offset is ignored.`,
      );
  } else if (values.offset.domain === 'relative')
    offset = (values.offset.value / 100.0) * geometry.duration;
  else offset = values.offset.value;

  const alignment: OrnamentAlignment = hasPrincipal ? values.alignment : 'at start';
  if (alignment !== values.alignment)
    console.error(
      `Warning: ${label} is aligned "at end" but has no principal note to end at; it is rendered at its own date instead.`,
    );

  return {
    domain,
    offset,
    length: Math.max(0.0, length),
    intensity: values.intensity,
    noteOffShift: values.noteOffShift,
    alignment,
  };
}

/**
 * The slot budget for `repetitions="-1"`, meico's undocumented fill-the-frame sentinel.
 *
 * Computable only from a frame whose length is stated in milliseconds: a tick or `%` frame's
 * real duration depends on the tempo map, which has not run yet, so DESIGN.md D9's "requires
 * an ms-resolvable frame, else log+skip" resolves to "the authored `frameLength` carries the
 * `ms` suffix". Null for every other case, which makes the expansion engine reject the
 * ornament with its own message.
 */
function frameNoteBudget(od: Ornament, values: FrameValues): number | null {
  if (od.repetitions !== -1) return null;
  if (values.length.domain !== 'milliseconds') return null;
  return Math.ceil(values.length.value / FILL_MILLISECONDS_PER_NOTE);
}

// ---------------------------------------------------------------------------------------
// layout (D10, D11)
// ---------------------------------------------------------------------------------------

/** One generated note, placed. */
interface PlannedNote {
  readonly resolved: ResolvedNote;
  readonly date: number;
  readonly duration: number;
  /**
   * Index of this note's slot in the EXPANSION's final sequence, post-dedup and post-landing —
   * not in what survives DESIGN.md D14's clamping, so a dropped note leaves a gap in the
   * numbering rather than renumbering the notes after it.
   */
  readonly slotIndex: number;
  /** The slot's repetition pass, or null when it came from outside every repeat group. */
  readonly repetitionPass: number | null;
}

/** One generated note element and the resolved note it came from, kept side by side. */
interface BuiltNote {
  readonly resolved: ResolvedNote;
  readonly element: Element;
}

/**
 * One ornament's generated elements: grouped into chords for the transformers, and flat in
 * generation order for the id assignment. Built together because DESIGN.md D14 may drop a
 * note, and pairing an element back to its slot afterwards would be guesswork — the expansion
 * engine shares slot objects between repeat passes, so identity says nothing about position.
 */
interface BuiltOrnament {
  readonly chords: Element[][];
  readonly notes: readonly BuiltNote[];
}

/** One ornament's plan: its slots, in order, each holding its notes. */
interface PlannedOrnament {
  readonly ornament: PreparedOrnament;
  readonly slots: readonly (readonly PlannedNote[])[];
  /**
   * The millisecond spacing this ornament needs written over its generated notes, or null for
   * a tick-domain frame, whose dates are already final.
   */
  readonly spacing: ((chords: Element[][]) => void) | null;
  /**
   * Where this ornament's frame begins, relative to the principal's date: the layout cursor
   * plus the ornament's own `frame.offset`. It and {@link length} are the two numbers the
   * spacing is computed from, which {@link carve} recomputes for its head-loss warning.
   */
  readonly start: number;
  /** The frame's length after D11's overflow scaling — 1× in the millisecond domain. */
  readonly length: number;
}

/**
 * Lay out one principal's ornaments and render them.
 *
 * The layout runs per frame domain (the ruling amending D11): tick and `%` ornaments share a
 * tick cursor, millisecond ones share a millisecond cursor, and a principal carrying both gets
 * a warning plus two independent layouts, since the spec says nothing about how a tick frame
 * and a millisecond frame on one note should be packed.
 */
function renderGroup(
  group: readonly PreparedOrnament[],
  principal: Element | null,
  owners: ReadonlyMap<Element, GenericMap>,
  maps: readonly GenericMap[],
): void {
  // A group is never empty; the guard is what lets the reads below be reads.
  if (!isNonEmpty(group)) return;
  const first = head(group);

  const ticks = group.filter((ornament) => ornament.frame.domain === 'ticks');
  const milliseconds = group.filter((ornament) => ornament.frame.domain === 'milliseconds');
  if (ticks.length > 0 && milliseconds.length > 0)
    console.error(
      `Warning: the note decorated by ${describeOrnament(first.ornamentId, first.od.date)} carries both tick-domain and millisecond-domain ornaments; they are laid out independently and may overlap.`,
    );

  const planned = [...planDomain(ticks), ...planDomain(milliseconds)];
  if (!isNonEmpty(planned)) return;
  const geometry = first.geometry;
  const built = planned.map((plan) => createChords(plan, geometry, principal));
  if (built.every((one) => one.chords.length === 0)) return;

  if (principal !== null) {
    // Carving decides who keeps the id, so it runs first (D10 id-uniqueness ruling, LOG.md
    // 2026-08-09): a surviving head leftover keeps its own id, and only when the principal is
    // consumed whole does the id move to a generated note. Never both — two elements sharing
    // an xml:id is not a valid document.
    if (!carve(principal, planned, built, geometry, owners))
      assignPrincipalId(principal, head(planned).ornament.principalPitch, built);
  }

  const owner = ownerOf(principal, owners, maps);
  if (owner === null) return;
  // `built` is `planned.map(…)`, so the two sequences are the same length by construction.
  for (const [plan, one] of zipWith(planned, built, (p, b) => [p, b] as const)) {
    const generated = applyGeneratedOrnament(plan.ornament.od, {
      chords: one.chords,
      spacing: plan.spacing,
    });
    for (const chord of generated) for (const note of chord) owner.addElement(note);
  }
}

/**
 * One domain's layout: front ornaments from the principal's start, end ornaments packed
 * against its end, everything scaled down together when they do not fit (DESIGN.md D11 — the
 * overflow rule the spec drafted and then commented out).
 *
 * `scaleFactor = min(1, principalDuration / totalRawLength)` counts frame lengths only; an
 * offset displaces a frame but is not part of what has to fit. In the millisecond domain the
 * factor is always 1: the principal's duration in milliseconds is not knowable before the
 * tempo pass.
 */
function planDomain(group: readonly PreparedOrnament[]): PlannedOrnament[] {
  if (!isNonEmpty(group)) return [];

  const first = head(group);
  const geometry = first.geometry;
  const front = group.filter((ornament) => ornament.frame.alignment === 'at start');
  const end = group.filter((ornament) => ornament.frame.alignment === 'at end');
  const totalRaw = group.reduce((sum, ornament) => sum + ornament.frame.length, 0.0);
  const scale =
    first.frame.domain === 'milliseconds' || totalRaw <= 0.0
      ? 1.0
      : Math.min(1.0, geometry.duration / totalRaw);
  const endTotal = end.reduce((sum, ornament) => sum + ornament.frame.length * scale, 0.0);

  const planned: PlannedOrnament[] = [];
  let cursor = 0.0;
  for (const ornament of front) {
    planned.push(planOrnament(ornament, cursor + ornament.frame.offset, scale, geometry));
    cursor += ornament.frame.length * scale;
  }
  // The end group is packed so that its last member finishes exactly at the principal's end.
  // A millisecond frame has no tick geometry to measure back from, so its cursor runs from the
  // end itself (negative values, which is what the end-anchored marker of D5 expresses).
  cursor = first.frame.domain === 'milliseconds' ? -endTotal : geometry.duration - endTotal;
  for (const ornament of end) {
    planned.push(planOrnament(ornament, cursor + ornament.frame.offset, scale, geometry));
    cursor += ornament.frame.length * scale;
  }
  return planned;
}

/**
 * Place one ornament's slots.
 *
 * `start` is the frame's offset from the principal's date — the layout's cursor plus the
 * ornament's own `frame.offset` — so that the spacing expression below is character for
 * character the v2 engine's (`TemporalSpread.apply`): every slot but the last is placed at
 * `pow(i / (n − 1), intensity) * length + start`, and the last one is placed *outside* the
 * loop at `start + length`. For `n === 1` the loop does not run and the single slot lands at
 * the end of the frame, which reads as a surprise and is v2's behaviour exactly.
 *
 * A millisecond frame has no tick geometry to place notes at: its notes sit on the principal's
 * own date and duration and carry the spacing as markers, written by
 * {@link applyMillisecondSpacing} from the same `start` and `length`.
 */
function planOrnament(
  ornament: PreparedOrnament,
  start: number,
  scale: number,
  geometry: PrincipalGeometry,
): PlannedOrnament {
  const { frame, slots } = ornament;
  const length = frame.length * scale;

  if (frame.domain === 'milliseconds')
    return {
      ornament,
      slots: slots.map((slot, index) =>
        slot.notes.map((resolved) => ({
          resolved,
          date: geometry.date,
          duration: geometry.duration,
          slotIndex: index,
          repetitionPass: slot.repetitionPass ?? null,
        })),
      ),
      spacing: (chords) =>
        applyMillisecondSpacing(chords, start, length, frame, frame.alignment === 'at end'),
      start,
      length,
    };

  const dates = spacingOffsets(slots.length, start, length, frame.intensity).map(
    (offset) => geometry.date + offset,
  );
  const principalEnd = geometry.date + geometry.duration;
  return {
    ornament,
    slots: zipWith(slots, dates, (slot, date, index) =>
      slot.notes.map((resolved) => ({
        resolved,
        date,
        duration: noteDuration(
          frame.noteOffShift,
          date,
          dates.at(index + 1) ?? null,
          geometry.duration,
          principalEnd,
        ),
        slotIndex: index,
        repetitionPass: slot.repetitionPass ?? null,
      })),
    ),
    spacing: null,
    start,
    length,
  };
}

/**
 * The v2 power-function spacing, as an array: `count` offsets from the anchor, the last one
 * pinned at the end of the frame.
 *
 * FROZEN against `TemporalSpread.apply` — same expression, same operand order, same
 * out-of-loop placement of the last slot. `intensity` bends the spacing (1 even, >1 crowds the
 * start, <1 the end), and its two unguarded edges are v2's: `intensity === 0` puts every slot
 * at the end of the frame (`pow(0, 0) === 1`), and a negative one sends the first slot to
 * `Infinity`. Both are reproduced rather than repaired — a v3 frame is the same engine.
 */
function spacingOffsets(count: number, start: number, length: number, intensity: number): number[] {
  const offsets: number[] = [];
  for (let i = 0; i < count - 1; ++i)
    offsets.push(Math.pow(i / (count - 1), intensity) * length + start);
  offsets.push(start + length);
  return offsets;
}

/**
 * The first onset {@link spacingOffsets} produces for these numbers — which is not `start`
 * whenever `intensity` bends the spacing away from it, and is `start + length` at
 * `intensity === 0`.
 *
 * Derived from the array rather than from a formula of its own, so a change to the spacing
 * cannot leave this behind. `reduce` rather than `Math.min(...offsets)`: the expansion engine's
 * ceiling permits a million slots, and a spread that wide overflows the call stack.
 * {@link spacingOffsets} always yields at least the pinned last slot, so the reduction never
 * sees an empty array.
 */
function earliestSpacingOffset(
  count: number,
  start: number,
  length: number,
  intensity: number,
): number {
  return spacingOffsets(count, start, length, intensity).reduce((a, b) => Math.min(a, b));
}

/**
 * DESIGN.md D10's three note-off modes, over generated notes rather than over existing ones:
 *
 * - `false` — every ornament note ends where the principal would have ended, so the ornament
 *   fills in underneath a held note (figure 1's arpeggio reading).
 * - `true` — every note keeps the principal's duration, so the ends shift with the onsets.
 * - `monophonic` — each note ends where the next begins and the last one runs to the
 *   principal's end, which is figure 1's tie: a turn that resolves into the note it decorates.
 */
function noteDuration(
  shift: NoteOffShift,
  date: number,
  nextDate: number | null,
  principalDuration: number,
  principalEnd: number,
): number {
  switch (shift) {
    case NoteOffShift.True:
      return principalDuration;
    case NoteOffShift.Monophonic:
      return nextDate === null ? principalEnd - date : nextDate - date;
    // `false` is the third and last member of the enum; named so that adding a fourth is a
    // compile error rather than a silent alias for it.
    case NoteOffShift.False:
      return principalEnd - date;
  }
}

/**
 * Write a millisecond frame's spacing as the markers the millisecond pass consumes.
 *
 * `alignment="at start"` reuses the v2 engine verbatim: a `TemporalSpread` is built with the
 * resolved numbers in its v2 fields and applied to the generated notes, so the markers —
 * `ornament.milliseconds.date.offset`, the absolute `ornament.milliseconds.duration` that
 * `monophonic` writes onto the *previous* chord, the presence-only `ornament.noteoff.shift` —
 * are produced by the same code that produces them for a v2 arpeggio, accumulation and operand
 * order included.
 *
 * `alignment="at end"` cannot, and that is the D5 amendment. The frame is anchored at the
 * principal's *millisecond end*, which is unknowable before the tempo pass, so no onset-offset
 * marker can express it. Phase N writes `ornament.milliseconds.fromend.offset` instead — a
 * static quantity, the spacing plus `frame.offset` minus `frameLength` — which the millisecond
 * pass reads as `milliseconds.date = milliseconds.date.end + value`. The loop below mirrors
 * `TemporalSpread.setOrnamentDateAtts` statement for statement with that attribute name in
 * place of the onset one.
 */
function applyMillisecondSpacing(
  chords: Element[][],
  start: number,
  length: number,
  frame: FrameSpec,
  fromEnd: boolean,
): void {
  if (!fromEnd) {
    const spread = new TemporalSpread();
    spread.frameStart = start;
    spread.setFrameLength(length);
    spread.frameDomain = FrameDomain.Milliseconds;
    spread.intensity = frame.intensity;
    spread.noteOffShift = frame.noteOffShift;
    spread.apply(chords);
    return;
  }

  const dateAttName = 'ornament.milliseconds.fromend.offset';
  const durAttName = 'ornament.milliseconds.duration';
  const offsets = spacingOffsets(chords.length, start, length, frame.intensity);
  let previous: Element[] | null = null;
  // One offset per chord. `zipWith` stops at the shorter, which for the one length these two
  // can disagree on — `chords` empty, where the spacing still pins its last slot — is empty.
  for (const [chord, dateOffset] of zipWith(chords, offsets, (c, o) => [c, o] as const)) {
    for (const note of chord) {
      const ornamentDateAtt = attribute(dateAttName, note);
      if (ornamentDateAtt !== null)
        ornamentDateAtt.setValue(String(dateOffset + parseFloat(ornamentDateAtt.getValue())));
      else note.addAttribute(new Attribute(dateAttName, String(dateOffset)));
    }
    if (frame.noteOffShift === NoteOffShift.True) {
      for (const note of chord) note.addAttribute(new Attribute('ornament.noteoff.shift', 'true'));
      previous = null;
    } else if (frame.noteOffShift === NoteOffShift.Monophonic) {
      if (previous !== null)
        for (const prev of previous) {
          const prevDateOffsetAtt = attribute(dateAttName, prev);
          if (prevDateOffsetAtt === null) continue;
          const duration = String(dateOffset - parseFloat(prevDateOffsetAtt.getValue()));
          const ornamentDurationAtt = attribute(durAttName, prev);
          if (ornamentDurationAtt !== null) ornamentDurationAtt.setValue(duration);
          else prev.addAttribute(new Attribute(durAttName, duration));
        }
      previous = chord;
    } else previous = null;
  }
}

// ---------------------------------------------------------------------------------------
// instantiation and carving (D10, D13, D14)
// ---------------------------------------------------------------------------------------

/**
 * Build one ornament's notes, slot by slot.
 *
 * DESIGN.md D14's negative-date rule is applied here, at creation, rather than in the MIDI
 * export the reference implementation patches: a frame with a negative offset may begin before
 * the piece does, so a note that would end at or before tick 0 is dropped while one that
 * straddles 0 is clamped to start there. A note whose layout gave it a negative length — a
 * frame packed past its principal's end — is clamped to zero the same way. A slot that loses
 * all of its notes loses its place in the sequence, so the dynamics gradient ramps across what
 * actually sounds.
 *
 * A note whose position is not a finite number is dropped too. The v2 spacing engine's two
 * unguarded edges are inherited on purpose (`intensity === 0` piles every slot at the frame
 * end, a negative one sends the first slot to `Infinity` — see {@link spacingOffsets}), and
 * `intensity="abc"` reads as `NaN`. In v2 that could only write a marker *attribute* onto a
 * note the score already had; v3 turns positions into elements, so without this it would
 * materialise a real `<note date="Infinity" duration="NaN">` — the `NaN` from
 * `Infinity − Infinity`, since the clamp below computes the duration as `end − date`. The drop
 * is announced once per ornament, not once per note: the cause is a frame value, so it usually
 * fires for every slot at once.
 */
function createChords(
  plan: PlannedOrnament,
  geometry: PrincipalGeometry,
  principal: Element | null,
): BuiltOrnament {
  const chords: Element[][] = [];
  const notes: BuiltNote[] = [];
  let planCount = 0;
  let nonFinite = 0;

  for (const slot of plan.slots) {
    const chord: Element[] = [];
    for (const planned of slot) {
      ++planCount;
      const end = planned.date + Math.max(0.0, planned.duration);
      if (!Number.isFinite(planned.date) || !Number.isFinite(end)) {
        ++nonFinite;
        continue;
      }
      if (end <= 0.0) continue;
      const date = Math.max(0.0, planned.date);
      const element = createNote(planned, date, end - date, geometry, principal, plan.ornament);
      chord.push(element);
      notes.push({ resolved: planned.resolved, element });
    }
    if (chord.length > 0) chords.push(chord);
  }

  if (nonFinite > 0)
    console.error(
      `Warning: ${describeOrnament(plan.ornament.ornamentId, plan.ornament.od.date)} would place ` +
        `${nonFinite} of its ${planCount} ornament notes at a date or duration that is not a ` +
        `finite number — a negative or unreadable intensity, or a frame value that is not ` +
        `finite, does that; those notes are dropped.`,
    );
  return { chords, notes };
}

/**
 * One generated MSM `<note>` (DESIGN.md D13).
 *
 * A *copy* of the principal with {@link NOT_INHERITED} stripped. What is written back
 * afterwards, in this order: the identity (`xml:id`, drawn from the codebase's own generator
 * so that the equivalence suites' first-occurrence canonicalisation stays meaningful), the
 * symbolic position (`date`, `midi.pitch`, `duration`, and `date.end` when the principal had
 * one), the performance position (the three `.perf` attributes, only when the principal
 * already carries them — the global ornamentation stage runs before `date.perf` exists, and
 * inventing it there would hide the note from
 * `Performance.addPerformanceTimingAttributes`), and the provenance family (below).
 *
 * A pitch may be fractional: MSM carries microtonal `midi.pitch` and only the MIDI export
 * rounds, which is what makes `interval.chromatic="0.5"` a quarter tone rather than an error.
 *
 * ## The provenance family (D10, as extended by the two rulings of 2026-08-09)
 *
 * Written last, after every musical attribute, in the fixed order `generated`, `ref`, `source`,
 * `slot`, `pass`, `anchor`. Attribute order is byte-visible (CHARTER §79-80) and no Java
 * reference writes any of these, so nothing external binds the choice. All six are v3-only:
 *
 * - `ornament.generated="true"` — this note did not exist in the score.
 * - `ornament.ref` — the `<ornament>`'s `xml:id`, when it has one.
 * - `ornament.source` — the `note.order` token this note resolved from: a pool note's id, the
 *   principal's, or another score note's. It says *which* member of the figure this is.
 * - `ornament.slot` — the note's 0-based onset in the expanded sequence.
 * - `ornament.pass` — the 0-based repetition pass, on notes from a repeat group only; absent
 *   everywhere else.
 * - `ornament.anchor` — the id the principal note had *before* this ornament replaced it.
 *   Without it the join from a generated note back to its score position is not total: an
 *   ornament whose `note.order` never names its principal, and which leaves no head leftover,
 *   would otherwise erase that id from the document entirely.
 */
function createNote(
  planned: PlannedNote,
  date: number,
  duration: number,
  geometry: PrincipalGeometry,
  principal: Element | null,
  ornament: PreparedOrnament,
): Element {
  const note = principal === null ? new Element('note') : principal.copy();
  note.removeChildren();
  for (const name of NOT_INHERITED) {
    const existing = attribute(name, note);
    if (existing !== null) note.removeAttribute(existing);
  }

  addUUID(note);
  note.addAttribute(new Attribute('date', String(date)));
  note.addAttribute(new Attribute('midi.pitch', String(planned.resolved.midiPitch)));
  note.addAttribute(new Attribute('duration', String(duration)));
  if (geometry.hasDateEnd) note.addAttribute(new Attribute('date.end', String(date + duration)));
  if (geometry.hasPerf) {
    note.addAttribute(new Attribute('date.perf', String(date + geometry.perfDelta)));
    note.addAttribute(new Attribute('duration.perf', String(duration)));
    note.addAttribute(new Attribute('date.end.perf', String(date + geometry.perfDelta + duration)));
  }
  note.addAttribute(new Attribute('ornament.generated', 'true'));
  if (ornament.ornamentId !== null)
    note.addAttribute(new Attribute('ornament.ref', ornament.ornamentId));
  note.addAttribute(new Attribute('ornament.source', planned.resolved.ref));
  note.addAttribute(new Attribute('ornament.slot', String(planned.slotIndex)));
  if (planned.repetitionPass !== null)
    note.addAttribute(new Attribute('ornament.pass', String(planned.repetitionPass)));
  // Read from the principal, not from the id-carrier: at this point nothing has moved yet, so
  // this is the id the score had before the ornament touched it, which is what the anchor is.
  if (principal !== null) {
    const anchor = attribute('id', principal);
    if (anchor !== null) note.addAttribute(new Attribute('ornament.anchor', anchor.getValue()));
  }
  return note;
}

/**
 * Hand the principal's `xml:id` to the generated note that inherits its identity
 * (DESIGN.md D10).
 *
 * The id has to survive somewhere: MSM `goto`/`marker` wiring and the MEI id links point at
 * it, and a performance that silently dropped it would break both. The first note the
 * expansion sourced *from* the principal is the heir, with a same-pitch note as the fallback
 * and, failing that, the first generated note. It is written by overwriting the id that note
 * already drew, which keeps `xml:id` where it is in the attribute list and keeps the number of
 * generated ids equal to the number of generated notes, in document order (PARITY.md §5:
 * "keep ID-generation call order stable").
 *
 * Called only when the principal was consumed whole. The D10 id-uniqueness ruling (LOG.md,
 * 2026-08-09): the id goes to the head leftover when one survives, else to the heir, never to
 * both, since two elements sharing an `xml:id` is not a valid document. `ornament.anchor` is
 * on every generated note precisely so that no consumer needs the id there to find its way
 * home. {@link carve} reports which case applies and {@link renderGroup} is the xor.
 */
function assignPrincipalId(
  principal: Element,
  principalPitch: number | null,
  built: readonly BuiltOrnament[],
): void {
  const id = attribute('id', principal);
  if (id === null) return;

  const notes = built.flatMap((one) => one.notes);
  if (!isNonEmpty(notes)) return;

  const heir =
    notes.find((note) => note.resolved.source === 'principal') ??
    notes.find((note) => principalPitch !== null && note.resolved.midiPitch === principalPitch) ??
    head(notes);
  const heirId = attribute('id', heir.element);
  if (heirId !== null) heirId.setValue(id.getValue());
}

/**
 * Replace the principal with what the ornament generated (DESIGN.md D10).
 *
 * "Replace" has two shapes. An ornament aligned `at end` leaves the head of the note
 * sounding — the principal is heard, and the figure arrives on top of its last part — so the
 * principal element stays in the map, shortened to end where the earliest generated note
 * begins, keeping its id and every other attribute. Anything else consumes the note whole and
 * the element is removed.
 *
 * A head that would be empty or negative is no head: a frame starting at or before the
 * principal's date (a negative `frame.offset`, or a frame long enough to cover the note)
 * removes it like any other. Millisecond frames never leave a head either, and cannot: their
 * notes sit on the principal's own tick date, and where they land in real time is decided two
 * passes later — so the head of an `at end` millisecond ornament's principal is lost.
 *
 * That last case is the only one where this function throws away sounding music the author
 * asked for, so it says so (RULE E1). The span it names is how much of the principal still
 * sounds, measured back from its end — the only quantity here that exists before the tempo
 * pass. That span is the first onset the spread actually produces, not the frame's own length:
 * the two differ whenever `intensity` bends the spacing, and at `intensity === 0` every slot
 * lands at the frame end instead. {@link earliestSpacingOffset} recomputes it from the same
 * function that writes the markers, so the two cannot drift apart.
 *
 * @returns whether the principal survived as a head leftover. That is also the answer to "does
 *   the principal's `xml:id` still exist in the document", which is why the caller runs this
 *   *before* {@link assignPrincipalId} and skips it when this returns true — the D10
 *   id-uniqueness ruling (LOG.md, 2026-08-09).
 */
function carve(
  principal: Element,
  planned: readonly PlannedOrnament[],
  built: readonly BuiltOrnament[],
  geometry: PrincipalGeometry,
  owners: ReadonlyMap<Element, GenericMap>,
): boolean {
  const leavesHead = planned.some(
    (plan) => plan.ornament.frame.domain === 'ticks' && plan.ornament.frame.alignment === 'at end',
  );
  const dates = planned.flatMap((plan) => plan.slots.flat().map((note) => note.date));
  const head = dates.length === 0 ? geometry.date : Math.min(...dates);

  if (leavesHead && head > geometry.date) {
    const duration = head - geometry.date;
    setNumber(principal, 'duration', duration);
    if (geometry.hasDateEnd) setNumber(principal, 'date.end', geometry.date + duration);
    if (geometry.hasPerf) {
      setNumber(principal, 'duration.perf', duration);
      setNumber(principal, 'date.end.perf', geometry.date + geometry.perfDelta + duration);
    }
    markCarved(principal, planned);
    return true;
  }

  for (const [plan, one] of zipWith(planned, built, (p, b) => [p, b] as const)) {
    const { frame, ornamentId, od } = plan.ornament;
    if (frame.domain !== 'milliseconds' || frame.alignment !== 'at end') continue;
    const earliest = earliestSpacingOffset(
      one.chords.length,
      plan.start,
      plan.length,
      frame.intensity,
    );
    // Clamped: a frame offset past the principal's end puts every onset after the note is
    // over, and "the last −10ms" is not a sentence. Nothing of the principal sounds then.
    const span = Math.max(0.0, -earliest);
    console.error(
      `Warning: ${describeOrnament(ornamentId, od.date)} is a millisecond frame aligned "at end", ` +
        `so the principal note it replaces cannot be carved before the tempo pass has run: only ` +
        `the last ${span}ms of it are rendered and its head is dropped. ` +
        `A tick or % frame keeps the head.`,
    );
  }

  const owner = owners.get(principal);
  if (owner !== undefined) owner.removeElement(principal);
  return false;
}

/**
 * Mark a surviving head leftover as ornamented (LOG.md, "the carved leftover is ornamented").
 *
 * The leftover is the one note an ornament *alters* without generating: it is shortened, and
 * nothing else in the document would say so. D15's facade contract is that `ornamented` holds
 * for a note "generated by or altered by" an ornament, and a predicate can only see what the
 * document says, so the altered-but-not-generated path needs its own marker.
 *
 * Two attributes, and deliberately not the other four:
 * - `ornament.carved="true"` — the surviving head of a principal an ornament ate. A separate
 *   name from `ornament.generated` because the two are opposites: this note *was* in the score
 *   and stayed, the generated ones never were.
 * - `ornament.ref` — which ornament did it, when that ornament has an `xml:id`. Several may
 *   carve one principal (D11); the first `at end` tick ornament in map order is named, the same
 *   "first in the group speaks for it" the layout already uses for the group's geometry.
 * - **not** `ornament.source` / `ornament.slot` / `ornament.pass`: the leftover is not a member
 *   of the expanded sequence — it has no `note.order` token, no onset in the spread and no
 *   repetition pass. Writing any of them would invent a position it does not occupy.
 * - **not** `ornament.anchor`: the anchor names the score note a generated note came from, and
 *   the leftover *is* that note — it kept the principal's `xml:id`, which the D10 id-uniqueness
 *   ruling guarantees. The attribute stays generated-note-only.
 *
 * Written after the timing attributes, so a leftover reads as a note first and as bookkeeping
 * after — the same order {@link createNote} uses.
 */
function markCarved(principal: Element, planned: readonly PlannedOrnament[]): void {
  principal.addAttribute(new Attribute('ornament.carved', 'true'));
  for (const plan of planned) {
    const { frame, ornamentId } = plan.ornament;
    if (frame.domain !== 'ticks' || frame.alignment !== 'at end' || ornamentId === null) continue;
    principal.addAttribute(new Attribute('ornament.ref', ornamentId));
    return;
  }
}

// ---------------------------------------------------------------------------------------
// reading the score
// ---------------------------------------------------------------------------------------

/** Which map holds which note — built once, and only when there is a v3 ornament to place. */
export function noteOwners(maps: readonly GenericMap[]): ReadonlyMap<Element, GenericMap> {
  const owners = new Map<Element, GenericMap>();
  for (const map of maps)
    for (const note of map.getAllElementsOfType('note')) owners.set(note.getValue(), map);
  return owners;
}

/**
 * The map a principal's generated notes belong in: the one its principal lives in, so that a
 * *global* ornamentation map — which may name notes in several parts at once — puts each
 * ornament's notes into the part it decorates rather than into `maps[0]`.
 */
function ownerOf(
  principal: Element | null,
  owners: ReadonlyMap<Element, GenericMap>,
  maps: readonly GenericMap[],
): GenericMap | null {
  if (principal !== null) {
    const owner = owners.get(principal);
    if (owner !== undefined) return owner;
  }
  return maps.at(0) ?? null;
}

/**
 * The principal's geometry, or — with no principal (D7 step 3) — a stand-in anchored at the
 * ornament's own date, whose duration the caller fills in from the resolved frame.
 */
function readGeometry(principal: Element | null, ornamentDate: number): PrincipalGeometry {
  if (principal === null)
    return { date: ornamentDate, duration: 0.0, perfDelta: 0.0, hasPerf: false, hasDateEnd: false };

  const date = readNumber(principal, 'date') ?? ornamentDate;
  const datePerf = readNumber(principal, 'date.perf');
  return {
    date,
    duration: readNumber(principal, 'duration') ?? 0.0,
    perfDelta: datePerf === null ? 0.0 : datePerf - date,
    hasPerf: datePerf !== null,
    hasDateEnd: attribute('date.end', principal) !== null,
  };
}

/**
 * The key signature in force at `date`, as a circle-of-fifths position (negative for flats) —
 * the tonal context `interval.diatonic` is resolved against (DESIGN.md D8).
 *
 * MSM states a key signature as a `<keySignature>` holding one `<accidental>` per altered
 * pitch, each with a semitone `value` (`1.0` sharp, `-1.0` flat), so the fifths count is the
 * sharps minus the flats. The part's own `keySignatureMap` wins; the global one is the
 * fallback; no signature anywhere means C major, which is also what a document that never
 * states a key means.
 *
 * PARITY NOTE — the thresholds are `> 0` / `< 0`, not the `> 1.0` / `< 1.0` this port
 * inherited in `Msm.parseKeySignatureMap`, which counted no sharp at all and would have put a
 * trill in the wrong key. That bug is fixed at the source (`meico@db83c7c5`) and in the port,
 * so the two readings now agree.
 */
export function readKeyFifths(map: GenericMap | null, date: number): number {
  if (map === null) return 0;
  const dated = map.getXml().getParent();
  if (dated === null) return 0;

  const local = fifthsFromMap(firstChildElement('keySignatureMap', dated), date);
  if (local !== null) return local;

  // `<score>`'s `<dated>` sits in a `<part>`, whose parent is the `<msm>` root; the global key
  // signature map hangs off that root's `<global><dated>`.
  const root = dated.getParent()?.getParent() ?? null;
  const globalEnv = root === null ? null : firstChildElement('global', root);
  const globalDated = globalEnv === null ? null : firstChildElement('dated', globalEnv);
  const globalMap = globalDated === null ? null : firstChildElement('keySignatureMap', globalDated);
  return fifthsFromMap(globalMap, date) ?? 0;
}

/** The last `<keySignature>` at or before `date`, counted out. Null when the map has none. */
function fifthsFromMap(keySignatureMap: Element | null, date: number): number | null {
  if (keySignatureMap === null) return null;
  let found: Element | null = null;
  for (const candidate of keySignatureMap.getChildElements('keySignature')) {
    const at = readNumber(candidate, 'date');
    if (at !== null && at <= date) found = candidate;
  }
  if (found === null) return null;

  let fifths = 0;
  for (const accidental of found.getChildElements('accidental')) {
    const value = readNumber(accidental, 'value');
    if (value === null) continue;
    if (value > 0.0) ++fifths;
    else if (value < 0.0) --fifths;
  }
  return fifths;
}

/**
 * A numeric MSM attribute, or null when it is absent or unreadable.
 *
 * `parseFloat`, the reading every other renderer in this port uses for MSM note attributes.
 * DESIGN.md D16's `parseJavaDouble` requirement is about MPM v3 parse code — the pool note's
 * pitch attributes and `@repetitions` — and does not reach an MSM read. PARITY.md §6.8 records
 * the split and names this family as one `P1` already left open.
 */
function readNumber(element: Element, name: string): number | null {
  const att = attribute(name, element);
  if (att === null) return null;
  const value = parseFloat(att.getValue());
  return Number.isNaN(value) ? null : value;
}

/** Overwrite a numeric attribute in place, keeping its position in the attribute list. */
function setNumber(element: Element, name: string, value: number): void {
  const att = attribute(name, element);
  if (att !== null) att.setValue(String(value));
  else element.addAttribute(new Attribute(name, String(value)));
}

/**
 * How many of one diagnostic array's entries reach the console before the rest are counted.
 *
 * The two pure modules this reads from *return* their diagnostics rather than logging them
 * (RULE E1), which makes this where "how much of it does a human want" is decided. Both arrays
 * grow with the length of the value: a 50 000 item `note.order` of unresolvable references
 * produces 100 000 expansion diagnostics — measured — and printing them buries every other
 * line the render emits. `noteOrder` additionally caps its own array so the memory is bounded
 * too; the expansion's array is bounded by the input's length, and this bounds what is said
 * about it. The count that follows the twenty says how much was left out.
 */
const MAX_LOGGED_DIAGNOSTICS = 20;

/** Report a pure module's returned diagnostics, up to {@link MAX_LOGGED_DIAGNOSTICS} of them. */
function logDiagnostics(label: string, warnings: readonly string[]): void {
  for (const warning of warnings.slice(0, MAX_LOGGED_DIAGNOSTICS))
    console.error(`Warning: ${label}: ${warning}`);
  if (warnings.length > MAX_LOGGED_DIAGNOSTICS)
    console.error(
      `Warning: ${label}: and ${String(warnings.length - MAX_LOGGED_DIAGNOSTICS)} further ` +
        `diagnostics about the same value, not listed.`,
    );
}

/** How an ornament is named in a log line: its `xml:id` if it has one, else its date. */
function describeOrnament(id: string | null, date: number): string {
  return id === null || id === ''
    ? `the ornament at date ${date}`
    : `ornament "${id}" (date ${date})`;
}
