/**
 * The MPM v3 `note.order` grammar — tokenizer, AST and serializers — as pure functions
 * over plain strings. No XML, no classes, no state, and no logging: every diagnostic is
 * *returned* (see {@link NoteOrder}) so the caller decides whether it reaches the console.
 * Pure-module precedent: `bezier.ts` in this directory (RULE C3).
 *
 * WHAT `note.order` IS. On an `<ornament>`, `note.order` names the notes the ornament
 * plays and the sequence it plays them in. It is either one of two keywords —
 * `"ascending pitch"` / `"descending pitch"`, meaning "every note at this date, sorted by
 * pitch", which is the v2 arpeggio behaviour — or a space-separated list of note ID
 * references (`#n1 #n2 …`) drawn from the ornament's note pool and the surrounding score.
 * Two grouping constructs decorate that list: `[ … ]` marks a chord (notes sharing one
 * onset, one slot in the spread), `|: … :|` marks the repetition group that `@repetitions`
 * multiplies. The rendered result is written back to a separate `note.order.perf`
 * attribute (see {@link formatNoteOrderPerf}); the authored `note.order` is never touched.
 *
 * GRAMMAR SOURCE. The authority is the schematron in the spec's `att.note.order.xml`, and
 * it is deliberately **wider than the ODD prose**: it admits every whitespace-separated
 * token that either starts with `#` or is exactly one of `[ ] | |: :| :|:`. So the bare
 * barline `|` and the compound `:|:` are legal although `mpm.odd:735` documents neither
 * (research/github-v3-design.md §3.3). `:|:` is normalised to `:| |:` before tokenizing,
 * following the reference implementation (research/lars-v3-implementation.md §4.2,
 * `OrnamentationMap.java:353`); this parser therefore treats it as "close the open group,
 * open the next one", which is how adjacent groups are spelled.
 *
 * The same §3.3 records the grammar's own inconsistency: the `<desc>` inside
 * `att.note.order.xml` illustrates chords as `[#id1 #id2]`, which its own spaced-token
 * constraint rejects. Since the spec's own example uses that form, real documents will
 * too, so unspaced brackets are salvaged (split off as their own tokens) with a warning
 * rather than skipped.
 *
 * TERMINATION AND COST. The reference tokenizer loops over a mutable index that it fails to
 * advance for a token without `#`, so a bare id hangs it forever (lars report §4.2, bug 2).
 * This parser makes non-termination unrepresentable instead of merely unlikely: tokenization
 * is one forward pass over a fixed array, bracket salvage is two monotone index scans over a
 * fixed string, and no branch can revisit a token. Cost is linear in the input's length, the
 * diagnostics are capped ({@link MAX_NOTE_ORDER_WARNINGS}), and malformed input degrades to a
 * warning plus a skip rather than an exception (DESIGN.md D9, D16).
 *
 * KNOWN LIMIT, measured rather than assumed. "Degrades rather than throws" is a statement about
 * the *grammar*, not about every input a hostile caller can construct: `tokens.push(...parts)`
 * spreads the salvaged tokens of one glued value as call arguments, so a single token holding
 * enough brackets overflows the call stack — `RangeError: Maximum call stack size exceeded`, at
 * **~100 000 brackets** (measured thresholds ranged 105 555–105 989 across runs on one
 * machine — it tracks stack headroom, not the runtime version). It is pre-existing, it is
 * two orders of magnitude past any authored `note.order`, and the pathological test in the suite
 * deliberately sits below it at 64 000. It is documented here rather than fixed because the fix
 * (push in a loop, or `concat`) belongs with the same shape elsewhere in this codebase —
 * `ornamentInstantiation`'s `Math.min(...dates)` has it too — and one wave should change both.
 *
 * PARITY NOTE. **v2 had no grammar here beyond a whitespace-split list of IDs**:
 * `OrnamentData` stores `note.order` as either one magic string or `value.replace(/#/g,
 * '').split(/\s+/)`, and everything downstream reads that flat array. Nothing in v2 knows
 * what a bracket or a repeat sign means. This module is v3-only and must never be reached
 * from the v2 path — an ornament that shows no v3 feature keeps the untouched v2 code path
 * (DESIGN.md D6), and W3/W5 own that gate. Running this parser on v2 input would not
 * change the ID sequence for any v2-shaped value, but it would change the *type* of the
 * thing v2 rendering consumes, which is exactly the drift D6 exists to prevent.
 */

/** One slot of the sequence: a single note, or a chord when more than one id is present. */
export interface NoteOrderItem {
  /** Referenced ids with the leading `#` stripped. `length > 1` means chord. */
  readonly ids: readonly string[];
}

/**
 * A `|: … :|` span, as **inclusive item indices** into {@link NoteOrderItem} list — not
 * token indices, because `@repetitions` multiplies slots, not tokens.
 *
 * Multiple groups are legal (`|: #a :| |: #b :|`, and `:|:` yields two adjacent ones).
 * Groups produced by {@link parseNoteOrder} never nest and never overlap: a group can only
 * open when none is open, and the next one can only start after the previous one's `end`.
 */
export interface RepeatGroup {
  readonly start: number;
  readonly end: number;
}

/**
 * The parsed value. The two keyword variants carry no items — they are resolved against
 * the notes at the ornament's date, not against the pool.
 *
 * `warnings` is present on **every** variant, not just `list`. That is a deliberate widening
 * of the shape sketched in the wave brief: the trimmed-keyword lenience below has to report
 * itself somewhere, and a caller collecting diagnostics should not have to narrow the union
 * first. It is always an array, empty when the input was clean.
 */
export type NoteOrder =
  | { readonly kind: 'ascending'; readonly warnings: readonly string[] }
  | { readonly kind: 'descending'; readonly warnings: readonly string[] }
  | {
      readonly kind: 'list';
      readonly items: readonly NoteOrderItem[];
      readonly groups: readonly RepeatGroup[];
      readonly warnings: readonly string[];
    };

const KEYWORD_ASCENDING = 'ascending pitch';
const KEYWORD_DESCENDING = 'descending pitch';

/**
 * How many diagnostics one value may collect before the rest are counted instead of kept.
 *
 * A malformed value's warnings are proportional to its length — a 100 000-character token run
 * of `]` produced 100 000 strings, all of them the same sentence, and the caller logs every one
 * (W2 verifier advisory, LOG.md 2026-08-09). The cap bounds both the array and the console; the
 * suppressed ones are summarised in a final entry so the count is never silently lost. 100 is
 * far past the point where a reader learns anything new: no hand-written `note.order` has that
 * many distinct problems, and a machine-written one has the same problem 100 000 times.
 */
export const MAX_NOTE_ORDER_WARNINGS = 100;

/** Character codes of the two bracket tokens, for the index scan in {@link splitUnspacedBrackets}. */
const OPEN_BRACKET = 0x5b;
const CLOSE_BRACKET = 0x5d;

/**
 * Split a token that carries brackets glued to an id — `[#id1`, `#id2]`, `[#id]` — into the
 * separate tokens the schematron demands. A token that is already well-formed comes back
 * unchanged, so `parts.length > 1` is exactly the "salvaged something" signal.
 *
 * Both bracket runs are located by an index scan, so a glued token costs time linear in its
 * length. The first draft peeled the string with `slice` **and collected the peeled brackets
 * with `tail.unshift(']')`**, and the second of those is what made it quadratic: `unshift`
 * re-indexes the whole array on every call. Isolated at 64 000 brackets on this machine, the
 * old pair costs ~1150 ms, the `unshift` alone ~975 ms of it, and a `slice`-only variant just
 * ~8 ms — so a mutation that restores only the `slice` shape is **not** a control for this fix,
 * which is how one was measured passing. The whole parse of that input now takes 6–21 ms across
 * runs. Same tokens out, same warning, same order; only the cost changed (W2 verifier advisory,
 * LOG.md 2026-08-09).
 *
 * Termination is structural rather than argued: two monotone index scans over a fixed string,
 * no loop over a value it also mutates.
 */
function splitUnspacedBrackets(token: string): readonly string[] {
  let start = 0;
  let end = token.length;

  while (end - start > 1 && token.charCodeAt(start) === OPEN_BRACKET) ++start;
  while (end - start > 1 && token.charCodeAt(end - 1) === CLOSE_BRACKET) --end;
  if (start === 0 && end === token.length) return [token];

  const parts: string[] = [];
  for (let i = 0; i < start; ++i) parts.push('[');
  parts.push(token.slice(start, end));
  for (let i = end; i < token.length; ++i) parts.push(']');
  return parts;
}

/**
 * Parse a raw `note.order` attribute value.
 *
 * Returns `null` only for an empty or whitespace-only value — there is no order to speak
 * of, and the caller treats the ornament as if the attribute were absent. Every other
 * input yields a value: an input that survives tokenization with **zero** items still comes
 * back as a `list` with an empty `items` array plus the warnings explaining why, which
 * mirrors v2's "empty list, continue" handling of the same situation and keeps the
 * diagnostics reachable. Callers skip such an ornament; they must not treat it as `null`.
 *
 * Keyword matching is exact first. A value that only differs by surrounding whitespace is
 * accepted as the keyword too, with a warning: XML attribute values routinely pick up stray
 * space from pretty-printers, and the alternative reading — two tokens, neither an ID
 * reference — is never what the author meant. Whitespace *inside* the keyword is not
 * normalised: `"ascending  pitch"` stays a (degenerate) list, because collapsing it would
 * mean inventing a rule no source states.
 */
export function parseNoteOrder(raw: string): NoteOrder | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  if (raw === KEYWORD_ASCENDING) return { kind: 'ascending', warnings: [] };
  if (raw === KEYWORD_DESCENDING) return { kind: 'descending', warnings: [] };
  if (trimmed === KEYWORD_ASCENDING)
    return { kind: 'ascending', warnings: [trimmedKeywordWarning(KEYWORD_ASCENDING)] };
  if (trimmed === KEYWORD_DESCENDING)
    return { kind: 'descending', warnings: [trimmedKeywordWarning(KEYWORD_DESCENDING)] };

  const items: NoteOrderItem[] = [];
  const groups: RepeatGroup[] = [];
  const warnings: string[] = [];

  /**
   * Collect a diagnostic, up to {@link MAX_NOTE_ORDER_WARNINGS} of them. Past the cap only the
   * count survives, and {@link summariseSuppressed} turns it into the array's last entry — so
   * the array is bounded, and "there was more" is still said out loud.
   */
  let suppressed = 0;
  const warn = (message: string): void => {
    if (warnings.length < MAX_NOTE_ORDER_WARNINGS) warnings.push(message);
    else ++suppressed;
  };

  const pushChord = (ids: readonly string[]): void => {
    if (ids.length === 0) {
      warn('note.order: empty chord "[ ]"; dropped.');
      return;
    }
    items.push({ ids: [...ids] });
  };

  const closeGroup = (start: number): void => {
    const end = items.length - 1;
    if (end < start) {
      warn('note.order: empty repeat group; dropped.');
      return;
    }
    groups.push({ start, end });
  };

  const tokens: string[] = [];
  for (const rawToken of trimmed.replace(/:\|:/g, ':| |:').split(/\s+/)) {
    const parts = splitUnspacedBrackets(rawToken);
    if (parts.length > 1) warn(`note.order: token "${rawToken}" has unspaced brackets; split.`);
    tokens.push(...parts);
  }

  /** Ids collected since the last `[`, or `null` while no chord is open. */
  let chord: string[] | null = null;
  /** Item index the open `|:` started at, or `null` while no group is open. */
  let groupStart: number | null = null;

  for (const token of tokens) {
    switch (token) {
      case '[':
        if (chord !== null) warn('note.order: "[" inside an open chord; ignored.');
        else chord = [];
        break;

      case ']':
        if (chord === null) warn('note.order: "]" without a matching "["; ignored.');
        else {
          pushChord(chord);
          chord = null;
        }
        break;

      case '|:':
        if (chord !== null) warn('note.order: "|:" inside a chord; ignored.');
        else if (groupStart !== null)
          warn('note.order: "|:" inside an open repeat group; ignored.');
        else groupStart = items.length;
        break;

      case ':|':
        if (chord !== null) warn('note.order: ":|" inside a chord; ignored.');
        else if (groupStart === null) warn('note.order: ":|" without a matching "|:"; ignored.');
        else {
          closeGroup(groupStart);
          groupStart = null;
        }
        break;

      // The bare barline is legal per the schematron and carries no semantics: it is a
      // notational courtesy, like a barline in the middle of a trill figure.
      case '|':
        break;

      default: {
        if (!token.startsWith('#')) {
          warn(`note.order: token "${token}" is not an ID reference (no leading "#"); skipped.`);
          break;
        }
        // Only the *leading* `#` is the reference marker (the schematron says
        // `starts-with($i, '#')`), so `##a` denotes the id `#a`. Such an id resolves to no
        // note and is dropped downstream; inventing a stricter rule here would reject a
        // token the grammar accepts.
        const id = token.slice(1);
        if (id.length === 0) {
          warn('note.order: token "#" is an empty ID reference; skipped.');
          break;
        }
        if (chord !== null) chord.push(id);
        else items.push({ ids: [id] });
        break;
      }
    }
  }

  if (chord !== null) {
    warn('note.order: chord opened with "[" was never closed; closed at end of input.');
    pushChord(chord);
  }
  if (groupStart !== null) {
    warn('note.order: repeat group opened with "|:" was never closed; closed at the last item.');
    closeGroup(groupStart);
  }
  summariseSuppressed(warnings, suppressed);

  return { kind: 'list', items, groups, warnings };
}

/**
 * Append the tally of the diagnostics {@link MAX_NOTE_ORDER_WARNINGS} kept out, if any.
 *
 * It is pushed past the cap on purpose — the cap bounds what is *collected*, and one more
 * entry saying how much was dropped is what keeps the array honest. So a capped result holds
 * exactly `MAX_NOTE_ORDER_WARNINGS + 1` entries and never more.
 */
function summariseSuppressed(warnings: string[], suppressed: number): void {
  if (suppressed === 0) return;
  warnings.push(
    `note.order: ${String(suppressed)} further diagnostics suppressed; the value is malformed ` +
      `well past the first ${String(MAX_NOTE_ORDER_WARNINGS)}.`,
  );
}

function trimmedKeywordWarning(keyword: string): string {
  return `note.order: surrounding whitespace trimmed before matching keyword "${keyword}".`;
}

/**
 * Serialize an AST back to canonical `note.order` syntax: keywords verbatim, lists
 * space-separated with `#`-prefixed ids, chords as `[ #a #b ]`, repetition groups as
 * `|: … :|`. Every token is separated by exactly one space, which is the form the
 * schematron accepts and the guidelines show.
 *
 * Canonical is not the same as identical: the parser accepts spellings this function does
 * not produce (`:|:`, bare `|`, unspaced brackets, a one-note "chord" `[ #a ]`), so
 * `formatNoteOrder(parseNoteOrder(x))` round-trips `x` only when `x` is already canonical.
 * A `list` with no items serializes to the empty string.
 */
export function formatNoteOrder(order: NoteOrder): string {
  if (order.kind === 'ascending') return KEYWORD_ASCENDING;
  if (order.kind === 'descending') return KEYWORD_DESCENDING;

  const starts = new Set(order.groups.map((g) => g.start));
  const ends = new Set(order.groups.map((g) => g.end));
  const out: string[] = [];

  for (const [index, item] of order.items.entries()) {
    if (starts.has(index)) out.push('|:');
    if (item.ids.length === 1) out.push(`#${item.ids[0]}`);
    else out.push('[', ...item.ids.map((id) => `#${id}`), ']');
    if (ends.has(index)) out.push(':|');
  }

  return out.join(' ');
}

/**
 * Serialize the *rendered* sequence into the `note.order.perf` attribute value: the ids of
 * the notes actually generated, in playing order, space-separated and **without** the `#`
 * prefix.
 *
 * The missing `#` is not an oversight — it is what the reference writes
 * (`String.join(" ", noteOrder)` over ids it has already stripped, lars report §4.2), and
 * downstream consumers read `note.order.perf` as bare ids. A leading `#` on an incoming id
 * is stripped so that callers may pass either spelling; nothing else about the ids is
 * touched. Chord structure and repeat marks are deliberately absent: `note.order.perf`
 * records what was played, and by that point every chord has become its own notes.
 */
export function formatNoteOrderPerf(expandedIds: readonly string[]): string {
  return expandedIds.map((id) => (id.startsWith('#') ? id.slice(1) : id)).join(' ');
}
