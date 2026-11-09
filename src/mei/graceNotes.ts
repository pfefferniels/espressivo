/**
 * The grace notes of an MEI score: the notes a conversion to MSM leaves out.
 *
 * A grace note sounds but takes no time from the bar, and MSM has nowhere to put a note without
 * a duration of its own. meico skips a `graceGrp` and a grace `chord` whole, and so does
 * {@link Mei2MsmConverter}, byte for byte. What is played around them is then exactly what the
 * score says without them — and nothing in the MSM says they were there.
 *
 * MPM v3 can play them: an `<ornament>` carries a pool of `<note>`s, names the score note it
 * decorates in `@noteid`, and its `<ornamentDef>` places the figure in time. To write one, a
 * caller needs what this module reports: each grace note's pitch, worked out the way every other
 * note's pitch is (key signature, earlier accidentals in the bar, transposition, octave lines),
 * the MSM note the group leads to, and whether the last grace note is tied into it — in which
 * case that note is struck as the grace and held, not struck again.
 *
 * A bare `note` with `@grace` outside a `graceGrp` is *not* reported. The converter does not
 * leave it out: it reaches the MSM as a note of `duration="0"` at the date of the note it leads
 * to, as it does in the Java reference, and it is addressable there by its `xml:id`.
 *
 * Reading the grace notes changes nothing the conversion writes. Their pitch is computed without
 * the one side effect pitch computation has on the MSM (copying a newer global key signature
 * into the part), and a grace note's own accidental is not carried on to the later notes of its
 * bar, because the reference does not carry it either.
 */
import { Element } from '../xml/XomTypes.js';
import { attribute, parentElement } from '../xml/tree.js';

/** One grace note. */
export interface GraceNote {
  /** The MEI `xml:id`, or null when the note has none. */
  readonly id: string | null;
  /** The MIDI pitch, computed as the converter computes every note's. */
  readonly pitch: number;
  /** The spelling, as an MSM note carries it: `pitchname`, `accidentals` and `octave`. */
  readonly pitchname: string;
  readonly accidentals: number;
  readonly octave: number;
  /**
   * The position of the note's event in its group, from 0. The notes of a grace chord share one;
   * a slot whose notes all lack a pitch is left out and the ones after it close up.
   */
  readonly slot: number;
}

/** One group of grace notes and the note it decorates. */
export interface GraceGroup {
  /** The `xml:id` of the `graceGrp`, or of the grace chord, or null. */
  readonly id: string | null;
  /** The `number` of the MSM part the group is in. */
  readonly part: number;
  /**
   * The date of the note the group decorates, in the MSM's ticks. With no such note, the date
   * the conversion had reached at the group, which is where that note would have stood.
   */
  readonly date: number;
  /**
   * The `xml:id` of the MSM note the group decorates: the next note of its layer, or the
   * previous one for `@attach="pre"`, across a barline if the group ends its bar. A chord gives
   * the member the last grace note is tied into, else the member nearest in pitch to it (the
   * higher one when two are as near). Null when the next event is a rest, when there is none,
   * or when that note has no `xml:id` of its own in the MSM.
   */
  readonly principal: string | null;
  /**
   * Whether a note of the last slot is tied into the principal: the principal is then struck as
   * that grace note and held, and does not sound again on its own date.
   */
  readonly tiedToPrincipal: boolean;
  /** `@grace` — `acc`, `unacc` or `unknown` — of the group, or of its first note; else null. */
  readonly kind: string | null;
  /** `@attach` of the `graceGrp` — `pre`, `post` or `unknown` — or null. */
  readonly attach: string | null;
  /** In document order, which is playing order. */
  readonly notes: readonly GraceNote[];
}

/** A grace note before the walk is over: the element is kept, the tie is not known yet. */
export interface PendingGraceNote extends GraceNote {
  readonly element: Element;
}

/** A group recorded during the walk, resolved against the finished movement afterwards. */
export interface PendingGraceGroup {
  /** The `graceGrp`, or a grace `chord` outside one. */
  readonly element: Element;
  readonly part: number;
  /** The converter's clock at the group, the fallback for {@link GraceGroup.date}. */
  readonly clock: number;
  readonly notes: readonly PendingGraceNote[];
}

const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

const idOf = (element: Element): string | null => attribute('id', element)?.getValue() ?? null;

const isGrace = (element: Element): boolean => element.getAttribute('grace') !== null;

/** An event that ends the search for a principal without being one. */
const SILENT = new Set(['rest', 'mRest', 'space', 'mSpace', 'multiRest', 'halfmRpt', 'mRpt']);

const LAYERS = new Set(['layer', 'oLayer']);
const STAFFS = new Set(['staff', 'oStaff']);

/**
 * The events of a grace container, one slot per event: a chord's notes share one, every other
 * note has its own. Beams and tuplets are looked through; rests and spaces have no pitch and are
 * not slots.
 */
export function graceSlots(container: Element): Element[][] {
  if (container.getLocalName() === 'chord') return [notesOf(container)];

  const slots: Element[][] = [];
  const visit = (element: Element): void => {
    for (const child of element.getChildElements().toArray()) {
      const name = child.getLocalName();
      if (name === 'chord') slots.push(notesOf(child));
      else if (name === 'note') slots.push([child]);
      else if (!SILENT.has(name)) visit(child);
    }
  };
  visit(container);
  return slots.filter((slot) => slot.length > 0);
}

/** The notes of a chord, its own and those of a chord nested in it. */
function notesOf(chord: Element): Element[] {
  const notes: Element[] = [];
  const visit = (element: Element): void => {
    for (const child of element.getChildElements().toArray()) {
      if (child.getLocalName() === 'note') notes.push(child);
      else visit(child);
    }
  };
  visit(chord);
  return notes;
}

/**
 * Copy what an `accid` child says onto its grace note, as the converter's accidental handling
 * does for every note it walks — without putting the accidental on the bar's list, which would
 * carry it on to later notes the reference plays without it.
 */
export function adoptAccidentals(note: Element): void {
  for (const accid of note.getChildElements().toArray()) {
    if (accid.getLocalName() !== 'accid') continue;
    for (const name of ['accid.ges', 'accid']) {
      const value = accid.getAttribute(name);
      if (value !== null && note.getAttribute(name) === null) note.addAttribute(value.copy());
    }
  }
}

type Direction = 'forward' | 'backward';

/**
 * What the search for a principal finds at one element: the event it decides on, a stop with no
 * principal, or nothing yet.
 */
type Found = { readonly event: Element | null } | null;

function inspect(element: Element, direction: Direction): Found {
  const name = element.getLocalName();
  if (name === 'graceGrp') return null;
  if ((name === 'note' || name === 'chord') && isGrace(element)) return null;
  if (name === 'note' || name === 'chord') return { event: element };
  if (SILENT.has(name)) return { event: null };
  return within(element, direction);
}

/** The first decision inside `element`, in document order or against it. */
function within(element: Element, direction: Direction): Found {
  const children = element.getChildElements().toArray();
  if (direction === 'backward') children.reverse();
  for (const child of children) {
    const found = inspect(child, direction);
    if (found !== null) return found;
  }
  return null;
}

/**
 * The event next to `from` in its layer, looking through beams and tuplets and past other grace
 * notes, and on into the same layer of the neighbouring measure when the layer runs out.
 */
export function adjacentEvent(from: Element, direction: Direction, mdiv: Element): Element | null {
  let layer: Element | null = null;
  for (let node: Element = from; ;) {
    const parent = parentElement(node);
    // A group outside any layer has no neighbours to speak of: the siblings of a staff are other
    // staves, and the next note there belongs to another voice.
    if (parent === null || STAFFS.has(parent.getLocalName())) return null;
    if (parent.getLocalName() === 'measure') return null;
    const siblings = parent.getChildElements().toArray();
    const at = siblings.indexOf(node);
    const next = direction === 'forward' ? siblings.slice(at + 1) : siblings.slice(0, at).reverse();
    for (const sibling of next) {
      const found = inspect(sibling, direction);
      if (found !== null) return found.event;
    }
    if (LAYERS.has(parent.getLocalName())) {
      layer = parent;
      break;
    }
    node = parent;
  }

  return neighbouringLayer(layer, direction, mdiv);
}

/** The same staff and layer of the measure before or after this layer's. */
function neighbouringLayer(layer: Element, direction: Direction, mdiv: Element): Element | null {
  const staff = parentElement(layer);
  const measure = staff === null ? null : parentElement(staff);
  if (staff === null || measure === null || !STAFFS.has(staff.getLocalName())) return null;

  const measures = descendants(mdiv, 'measure');
  const index = measures.indexOf(measure);
  const neighbour = measures[direction === 'forward' ? index + 1 : index - 1];
  if (index === -1 || neighbour === undefined) return null;

  const staffN = staff.getAttributeValue('n');
  const layerN = layer.getAttributeValue('n');
  for (const candidate of neighbour.getChildElements().toArray()) {
    if (!STAFFS.has(candidate.getLocalName())) continue;
    if (candidate.getAttributeValue('n') !== staffN) continue;
    for (const next of candidate.getChildElements().toArray()) {
      if (!LAYERS.has(next.getLocalName()) || next.getAttributeValue('n') !== layerN) continue;
      return within(next, direction)?.event ?? null;
    }
  }
  return null;
}

function descendants(of: Element, name: string): Element[] {
  const found: Element[] = [];
  const visit = (element: Element): void => {
    for (const child of element.getChildElements().toArray()) {
      if (child.getLocalName() === name) found.push(child);
      visit(child);
    }
  };
  visit(of);
  return found;
}

const tiedOn = (note: Element): boolean => {
  const tie = note.getAttributeValue('tie');
  return tie !== null && (tie.startsWith('i') || tie.startsWith('m'));
};

const pnumOf = (note: Element): number | null => {
  const value = note.getAttributeValue('pnum');
  return value === null ? null : parseFloat(value);
};

/**
 * The note of `event` the group decorates, and whether the group's last slot is tied into it.
 *
 * Read after the walk, when two things exist that do not exist during it: the `pnum` and `date`
 * the converter writes back onto every MEI note it converts, and the `@tie` it writes onto both
 * ends of every `<tie>` — which comes after the staves in its measure, so after the group too.
 */
function principalIn(
  event: Element,
  last: readonly PendingGraceNote[],
): { note: Element; tied: boolean } | null {
  const candidates = event.getLocalName() === 'chord' ? notesOf(event) : [event];
  const pitched = candidates.filter((note) => pnumOf(note) !== null);
  if (pitched.length === 0) return null;

  for (const grace of last) {
    if (!tiedOn(grace.element)) continue;
    const into = pitched.find((note) => pnumOf(note) === grace.pitch);
    if (into !== undefined) return { note: into, tied: true };
  }

  const target = Math.max(...last.map((grace) => grace.pitch));
  let best: Element | null = null;
  let bestDistance = Infinity;
  for (const note of pitched) {
    const pitch = pnumOf(note) ?? 0;
    const distance = Math.abs(pitch - target);
    const bestPitch = best === null ? -Infinity : (pnumOf(best) ?? 0);
    if (distance < bestDistance || (distance === bestDistance && pitch > bestPitch)) {
      best = note;
      bestDistance = distance;
    }
  }
  return best === null ? null : { note: best, tied: false };
}

/**
 * Resolve the groups recorded during one movement's walk against the movement as converted.
 *
 * @param msmNoteIds the `xml:id` of every note in the movement's MSM
 */
export function resolveGraceGroups(
  pending: readonly PendingGraceGroup[],
  mdiv: Element,
  msmNoteIds: ReadonlySet<string>,
): GraceGroup[] {
  const resolved: GraceGroup[] = [];
  const loose: boolean[] = [];

  for (const group of pending) {
    const attach =
      group.element.getLocalName() === 'graceGrp'
        ? group.element.getAttributeValue('attach')
        : null;
    const kind =
      group.element.getAttributeValue('grace') ??
      group.notes.map((note) => note.element.getAttributeValue('grace')).find((k) => k !== null) ??
      null;

    const lastSlot = Math.max(...group.notes.map((note) => note.slot));
    const last = group.notes.filter((note) => note.slot === lastSlot);
    const event = adjacentEvent(group.element, attach === 'pre' ? 'backward' : 'forward', mdiv);
    const found = event === null ? null : principalIn(event, last);

    const principalId = found === null ? null : idOf(found.note);
    const principal = principalId !== null && msmNoteIds.has(principalId) ? principalId : null;
    const dateText = found?.note.getAttributeValue('date') ?? null;

    const one: GraceGroup = {
      id: idOf(group.element),
      part: group.part,
      date: dateText === null ? group.clock : parseFloat(dateText),
      principal,
      tiedToPrincipal: principal !== null && (found?.tied ?? false),
      kind,
      attach,
      notes: group.notes.map((note) => ({
        id: note.id,
        pitch: note.pitch,
        pitchname: note.pitchname,
        accidentals: note.accidentals,
        octave: note.octave,
        slot: note.slot,
      })),
    };

    // Grace chords outside a `graceGrp` that lead to one note are one figure, not several.
    const isLoose = group.element.getLocalName() !== 'graceGrp';
    const previous = resolved.at(-1);
    if (
      isLoose &&
      loose.at(-1) === true &&
      previous !== undefined &&
      previous.principal !== null &&
      previous.principal === one.principal &&
      previous.part === one.part
    ) {
      const offset = Math.max(...previous.notes.map((note) => note.slot)) + 1;
      resolved[resolved.length - 1] = {
        ...previous,
        tiedToPrincipal: one.tiedToPrincipal,
        notes: [
          ...previous.notes,
          ...one.notes.map((note) => ({ ...note, slot: note.slot + offset })),
        ],
      };
      continue;
    }

    resolved.push(one);
    loose.push(isLoose);
  }

  return resolved;
}

/** The `xml:id` of every note under `root`. */
export function noteIdsOf(root: Element): Set<string> {
  const ids = new Set<string>();
  const visit = (element: Element): void => {
    for (const child of element.getChildElements().toArray()) {
      if (child.getLocalName() === 'note') {
        const id = child.getAttributeValue('id', XML_NAMESPACE);
        if (id !== null) ids.add(id);
      }
      visit(child);
    }
  };
  visit(root);
  return ids;
}
