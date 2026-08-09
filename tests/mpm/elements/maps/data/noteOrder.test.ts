import { describe, it, expect } from 'vitest';
import {
  parseNoteOrder,
  formatNoteOrder,
  formatNoteOrderPerf,
  type NoteOrder,
} from '../../../../../src/mpm/elements/maps/data/noteOrder.js';

type NoteOrderList = Extract<NoteOrder, { kind: 'list' }>;

/** Assert the value parsed to a list and hand it back narrowed. */
function asList(order: NoteOrder | null): NoteOrderList {
  expect(order).not.toBeNull();
  expect(order!.kind).toBe('list');
  return order as NoteOrderList;
}

/** The item sequence as plain id arrays, which is what every expectation below compares. */
function idsOf(order: NoteOrder | null): string[][] {
  return asList(order).items.map((item) => [...item.ids]);
}

// The exact warning strings are part of this module's contract (they are what W3/W5 will
// log), so they are spelled out here rather than imported — a test that shares the
// production constant cannot notice the constant changing.
const W = {
  trimmedAscending:
    'note.order: surrounding whitespace trimmed before matching keyword "ascending pitch".',
  trimmedDescending:
    'note.order: surrounding whitespace trimmed before matching keyword "descending pitch".',
  notARef: (token: string) =>
    `note.order: token "${token}" is not an ID reference (no leading "#"); skipped.`,
  emptyRef: 'note.order: token "#" is an empty ID reference; skipped.',
  unspaced: (token: string) => `note.order: token "${token}" has unspaced brackets; split.`,
  nestedChord: 'note.order: "[" inside an open chord; ignored.',
  strayChordEnd: 'note.order: "]" without a matching "["; ignored.',
  unclosedChord: 'note.order: chord opened with "[" was never closed; closed at end of input.',
  emptyChord: 'note.order: empty chord "[ ]"; dropped.',
  groupStartInChord: 'note.order: "|:" inside a chord; ignored.',
  groupEndInChord: 'note.order: ":|" inside a chord; ignored.',
  nestedGroup: 'note.order: "|:" inside an open repeat group; ignored.',
  strayGroupEnd: 'note.order: ":|" without a matching "|:"; ignored.',
  unclosedGroup:
    'note.order: repeat group opened with "|:" was never closed; closed at the last item.',
  emptyGroup: 'note.order: empty repeat group; dropped.',
};

describe('parseNoteOrder — keywords', () => {
  it('recognises "ascending pitch" exactly, with no warnings', () => {
    expect(parseNoteOrder('ascending pitch')).toEqual({ kind: 'ascending', warnings: [] });
  });

  it('recognises "descending pitch" exactly, with no warnings', () => {
    expect(parseNoteOrder('descending pitch')).toEqual({ kind: 'descending', warnings: [] });
  });

  const TRIMMED = [
    { name: 'leading space, ascending', raw: '  ascending pitch', kind: 'ascending' as const },
    { name: 'trailing newline, ascending', raw: 'ascending pitch\n', kind: 'ascending' as const },
    {
      name: 'tabs both sides, descending',
      raw: '\tdescending pitch\t',
      kind: 'descending' as const,
    },
  ];

  it.each(TRIMMED)('$name is accepted as the keyword, with a warning', ({ raw, kind }) => {
    const order = parseNoteOrder(raw);
    expect(order).not.toBeNull();
    expect(order!.kind).toBe(kind);
    expect(order!.warnings).toEqual([
      kind === 'ascending' ? W.trimmedAscending : W.trimmedDescending,
    ]);
  });

  it('does not normalise whitespace inside the keyword — "ascending  pitch" stays a list', () => {
    const order = asList(parseNoteOrder('ascending  pitch'));
    expect(order.items).toEqual([]);
    expect(order.groups).toEqual([]);
    expect(order.warnings).toEqual([W.notARef('ascending'), W.notARef('pitch')]);
  });

  it('is case-sensitive — "Ascending pitch" is not the keyword', () => {
    const order = asList(parseNoteOrder('Ascending pitch'));
    expect(order.items).toEqual([]);
    expect(order.warnings).toEqual([W.notARef('Ascending'), W.notARef('pitch')]);
  });
});

describe('parseNoteOrder — empty input', () => {
  const EMPTY = [
    { name: 'empty string', raw: '' },
    { name: 'spaces only', raw: '   ' },
    { name: 'mixed whitespace only', raw: ' \t\n ' },
  ];

  it.each(EMPTY)('$name returns null', ({ raw }) => {
    expect(parseNoteOrder(raw)).toBeNull();
  });
});

describe('parseNoteOrder — spec exempla', () => {
  // The four values from the ornament exemplum (research/github-v3-design.md §3.3 and the
  // spec's src/specs/ornament.xml), plus the chord form its <desc> illustrates.
  const EXEMPLA = [
    {
      name: 'plain reordering list',
      raw: '#id1 #id3 #id2 #id4',
      items: [['id1'], ['id3'], ['id2'], ['id4']],
      groups: [],
    },
    {
      name: 'half-tone trill group',
      raw: '|: #n1 #princNote :|',
      items: [['n1'], ['princNote']],
      groups: [{ start: 0, end: 1 }],
    },
    {
      name: 'ungrouped turn around the principal',
      raw: '#n2 #princNote1 #n3 #princNote1',
      items: [['n2'], ['princNote1'], ['n3'], ['princNote1']],
      groups: [],
    },
    {
      name: 'second trill group',
      raw: '|: #n4 #princNote2 :|',
      items: [['n4'], ['princNote2']],
      groups: [{ start: 0, end: 1 }],
    },
    {
      name: 'spaced chord (the desc example, respelled per the schematron)',
      raw: '[ #n97 #n98 ]',
      items: [['n97', 'n98']],
      groups: [],
    },
  ];

  it.each(EXEMPLA)('$name parses without warnings', ({ raw, items, groups }) => {
    const order = asList(parseNoteOrder(raw));
    expect(idsOf(order)).toEqual(items);
    expect(order.groups).toEqual(groups);
    expect(order.warnings).toEqual([]);
  });
});

describe('parseNoteOrder — chords and groups', () => {
  it('parses a chord in the middle of a list, occupying one slot', () => {
    const order = asList(parseNoteOrder('#a [ #n97 #n98 ] #b'));
    expect(idsOf(order)).toEqual([['a'], ['n97', 'n98'], ['b']]);
    expect(order.groups).toEqual([]);
    expect(order.warnings).toEqual([]);
  });

  it('parses a three-note chord', () => {
    expect(idsOf(parseNoteOrder('[ #a #b #c ]'))).toEqual([['a', 'b', 'c']]);
  });

  it('indexes groups by item, not by token', () => {
    const order = asList(parseNoteOrder('#x |: #a [ #b #c ] :| #y'));
    expect(idsOf(order)).toEqual([['x'], ['a'], ['b', 'c'], ['y']]);
    // items 1 and 2 are inside the group; the chord is a single item, so end is 2, not 3.
    expect(order.groups).toEqual([{ start: 1, end: 2 }]);
    expect(order.warnings).toEqual([]);
  });

  it('supports two groups spelled out in full', () => {
    const order = asList(parseNoteOrder('|: #a :| |: #b :|'));
    expect(idsOf(order)).toEqual([['a'], ['b']]);
    expect(order.groups).toEqual([
      { start: 0, end: 0 },
      { start: 1, end: 1 },
    ]);
    expect(order.warnings).toEqual([]);
  });

  it('normalises ":|:" into two adjacent groups', () => {
    const order = asList(parseNoteOrder('|: #a :|: #b :|'));
    expect(idsOf(order)).toEqual([['a'], ['b']]);
    expect(order.groups).toEqual([
      { start: 0, end: 0 },
      { start: 1, end: 1 },
    ]);
    expect(order.warnings).toEqual([]);
  });

  it('normalises ":|:" even without surrounding spaces in the source value', () => {
    const order = asList(parseNoteOrder('|: #a :|:#b :|'));
    // ':|:' expands to ':| |:', so the token after it is '|:#b' — no bracket to salvage,
    // and '|:#b' is not an ID reference, so it is skipped rather than guessed at.
    expect(order.groups).toEqual([{ start: 0, end: 0 }]);
    expect(order.warnings).toEqual([W.notARef('|:#b'), W.strayGroupEnd]);
  });

  it('accepts and ignores the bare barline', () => {
    const order = asList(parseNoteOrder('#a | #b'));
    expect(idsOf(order)).toEqual([['a'], ['b']]);
    expect(order.groups).toEqual([]);
    expect(order.warnings).toEqual([]);
  });

  // A bare '|' inside an open repeat group must not close or split it. The span this
  // asserts is what @repetitions multiplies downstream, so reading '|' as a group end
  // would silently halve every repeated figure that carries a courtesy barline — and the
  // bare-barline tests above all sit *outside* a group, where that mistake is invisible.
  it('does not let a bare barline close an open repeat group', () => {
    const order = asList(parseNoteOrder('|: #a | #b :|'));
    expect(idsOf(order)).toEqual([['a'], ['b']]);
    expect(order.groups).toEqual([{ start: 0, end: 1 }]);
    expect(order.warnings).toEqual([]);
  });

  it('does not let a bare barline split a repeat group nested in a longer list', () => {
    const order = asList(parseNoteOrder('#x |: #a | #b :| #y'));
    expect(idsOf(order)).toEqual([['x'], ['a'], ['b'], ['y']]);
    expect(order.groups).toEqual([{ start: 1, end: 2 }]);
    expect(order.warnings).toEqual([]);
  });

  it('groups never overlap, even when written back to back', () => {
    const order = asList(parseNoteOrder('|: #a #b :| |: #c :|'));
    const [first, second] = order.groups;
    expect(first).toEqual({ start: 0, end: 1 });
    expect(second).toEqual({ start: 2, end: 2 });
    expect(second.start).toBeGreaterThan(first.end);
  });
});

describe('parseNoteOrder — lenience', () => {
  const CASES = [
    {
      name: 'token without "#" is skipped',
      raw: 'n5 #a',
      items: [['a']],
      groups: [],
      warnings: [W.notARef('n5')],
    },
    {
      name: 'empty ID reference "#" is skipped',
      raw: '# #a',
      items: [['a']],
      groups: [],
      warnings: [W.emptyRef],
    },
    {
      name: '"[" inside a chord is ignored',
      raw: '[ #a [ #b ]',
      items: [['a', 'b']],
      groups: [],
      warnings: [W.nestedChord],
    },
    {
      name: '"]" without "[" is ignored',
      raw: '#a ] #b',
      items: [['a'], ['b']],
      groups: [],
      warnings: [W.strayChordEnd],
    },
    {
      name: 'unclosed chord is closed implicitly at end of input',
      raw: '#a [ #b #c',
      items: [['a'], ['b', 'c']],
      groups: [],
      warnings: [W.unclosedChord],
    },
    {
      name: 'empty chord is dropped',
      raw: '[ ] #a',
      items: [['a']],
      groups: [],
      warnings: [W.emptyChord],
    },
    {
      name: '"|:" inside an open group is ignored',
      raw: '|: #a |: #b :|',
      items: [['a'], ['b']],
      groups: [{ start: 0, end: 1 }],
      warnings: [W.nestedGroup],
    },
    {
      name: '":|" without an open group is ignored',
      raw: '#a :| #b',
      items: [['a'], ['b']],
      groups: [],
      warnings: [W.strayGroupEnd],
    },
    {
      name: 'unclosed group is closed at the last item',
      raw: '|: #a #b',
      items: [['a'], ['b']],
      groups: [{ start: 0, end: 1 }],
      warnings: [W.unclosedGroup],
    },
    {
      name: 'empty group is dropped',
      raw: '|: :| #a',
      items: [['a']],
      groups: [],
      warnings: [W.emptyGroup],
    },
    {
      name: 'unclosed group with nothing after it is dropped, not spanned backwards',
      raw: '#a |:',
      items: [['a']],
      groups: [],
      warnings: [W.unclosedGroup, W.emptyGroup],
    },
    {
      name: '"|:" inside a chord is ignored (group token crossing a chord boundary)',
      raw: '|: [ #a |: #b ] :|',
      items: [['a', 'b']],
      groups: [{ start: 0, end: 0 }],
      warnings: [W.groupStartInChord],
    },
    {
      name: '":|" inside a chord is ignored (chord spanning a group boundary)',
      raw: '|: [ #a :| #b ] #c',
      items: [['a', 'b'], ['c']],
      groups: [{ start: 0, end: 1 }],
      warnings: [W.groupEndInChord, W.unclosedGroup],
    },
    {
      name: 'the bare barline is ignored inside a chord too',
      raw: '[ #a | #b ]',
      items: [['a', 'b']],
      groups: [],
      warnings: [],
    },
    {
      name: 'an unclosed empty chord warns twice',
      raw: '#a [',
      items: [['a']],
      groups: [],
      warnings: [W.unclosedChord, W.emptyChord],
    },
    {
      name: 'a value with no resolvable token still yields an empty list, not null',
      raw: 'foo bar',
      items: [],
      groups: [],
      warnings: [W.notARef('foo'), W.notARef('bar')],
    },
  ];

  it.each(CASES)('$name', ({ raw, items, groups, warnings }) => {
    const order = asList(parseNoteOrder(raw));
    expect(idsOf(order)).toEqual(items);
    expect(order.groups).toEqual(groups);
    expect(order.warnings).toEqual(warnings);
  });

  it('never throws on any of the lenience cases', () => {
    for (const { raw } of CASES) expect(() => parseNoteOrder(raw)).not.toThrow();
  });
});

describe('parseNoteOrder — unspaced bracket salvage', () => {
  it('salvages the spec desc form "[#id1 #id2]"', () => {
    // att.note.order.xml's own <desc> writes chords this way, which its own spaced-token
    // schematron rejects (research/github-v3-design.md §3.3). Read it, warn about it.
    const order = asList(parseNoteOrder('[#id1 #id2]'));
    expect(idsOf(order)).toEqual([['id1', 'id2']]);
    expect(order.groups).toEqual([]);
    expect(order.warnings).toEqual([W.unspaced('[#id1'), W.unspaced('#id2]')]);
  });

  it('salvages a single-token chord "[#a]"', () => {
    const order = asList(parseNoteOrder('[#a]'));
    expect(idsOf(order)).toEqual([['a']]);
    expect(order.warnings).toEqual([W.unspaced('[#a]')]);
  });

  it('salvages repeated brackets', () => {
    const order = asList(parseNoteOrder('[[#a]]'));
    // The inner '[' is a nested chord start and the trailing ']' has no partner left.
    expect(idsOf(order)).toEqual([['a']]);
    expect(order.warnings).toEqual([W.unspaced('[[#a]]'), W.nestedChord, W.strayChordEnd]);
  });

  it('leaves well-spaced brackets alone', () => {
    expect(asList(parseNoteOrder('[ #a #b ]')).warnings).toEqual([]);
  });

  it('does not mistake a repeat token for a bracketed id', () => {
    const order = asList(parseNoteOrder('|: #a :|'));
    expect(order.warnings).toEqual([]);
  });
});

describe('parseNoteOrder — pathological input terminates', () => {
  // The reference tokenizer hangs on a token without '#' because its index never advances
  // (research/lars-v3-implementation.md §4.2, bug 2). Every case here would hang it; each
  // carries an explicit per-test timeout so a regression fails loudly instead of stalling
  // the suite (architecture brief §5).
  const PATHOLOGICAL = [
    { name: 'a lone "#"', raw: '#' },
    { name: 'a lone "["', raw: '[' },
    { name: 'a lone "]"', raw: ']' },
    { name: 'a lone "|:"', raw: '|:' },
    { name: 'a lone ":|"', raw: ':|' },
    { name: 'a lone "|"', raw: '|' },
    { name: 'a lone ":|:"', raw: ':|:' },
    { name: 'overlapping repeat compounds', raw: ':|:|:' },
    { name: 'bare ids only', raw: 'n5 n6 n7' },
    { name: 'brackets only', raw: '[ [ [ ] ] ]' },
    { name: 'nothing but repeat marks', raw: '|: |: :| :| :|' },
    { name: 'punctuation soup', raw: '#[]|:|#:|[#' },
  ];

  it.each(PATHOLOGICAL)(
    '$name returns a list quickly',
    ({ raw }) => {
      const order = parseNoteOrder(raw);
      expect(order).not.toBeNull();
      expect(order!.kind).toBe('list');
    },
    1000,
  );

  it('reads "####" as the id "###" rather than looping or throwing', () => {
    // The schematron's test is `starts-with($i, '#')`, so this token is *valid*; only the
    // leading '#' is the marker. The id resolves to no note and is dropped downstream.
    expect(idsOf(parseNoteOrder('####'))).toEqual([['###']]);
  }, 1000);

  it('handles a long garbage stream in linear time', () => {
    const noise = ['[', ']', '|:', ':|', '|', '#', '####', 'x', ':|:'];
    const raw = Array.from({ length: 30000 }, (_, i) => noise[i % noise.length]).join(' ');
    const order = asList(parseNoteOrder(raw));
    expect(order.warnings.length).toBeGreaterThan(0);
  }, 2000);

  it('handles a long well-formed list', () => {
    const raw = Array.from({ length: 10000 }, (_, i) => `#n${String(i)}`).join(' ');
    const order = asList(parseNoteOrder(raw));
    expect(order.items).toHaveLength(10000);
    expect(order.warnings).toEqual([]);
  }, 2000);
});

describe('formatNoteOrder', () => {
  it('writes the keywords verbatim', () => {
    expect(formatNoteOrder({ kind: 'ascending', warnings: [] })).toBe('ascending pitch');
    expect(formatNoteOrder({ kind: 'descending', warnings: [] })).toBe('descending pitch');
  });

  it('writes an empty list as the empty string', () => {
    expect(formatNoteOrder({ kind: 'list', items: [], groups: [], warnings: [] })).toBe('');
  });

  it('writes chords with spaced brackets and ids with "#"', () => {
    expect(
      formatNoteOrder({
        kind: 'list',
        items: [{ ids: ['a'] }, { ids: ['n97', 'n98'] }],
        groups: [],
        warnings: [],
      }),
    ).toBe('#a [ #n97 #n98 ]');
  });

  it('wraps a group in "|:" / ":|" around the right items', () => {
    expect(
      formatNoteOrder({
        kind: 'list',
        items: [{ ids: ['x'] }, { ids: ['a'] }, { ids: ['b', 'c'] }, { ids: ['y'] }],
        groups: [{ start: 1, end: 2 }],
        warnings: [],
      }),
    ).toBe('#x |: #a [ #b #c ] :| #y');
  });

  it('writes a one-item group with both marks around the same item', () => {
    expect(
      formatNoteOrder({
        kind: 'list',
        items: [{ ids: ['a'] }],
        groups: [{ start: 0, end: 0 }],
        warnings: [],
      }),
    ).toBe('|: #a :|');
  });

  it('writes two groups back to back', () => {
    expect(
      formatNoteOrder({
        kind: 'list',
        items: [{ ids: ['a'] }, { ids: ['b'] }],
        groups: [
          { start: 0, end: 0 },
          { start: 1, end: 1 },
        ],
        warnings: [],
      }),
    ).toBe('|: #a :| |: #b :|');
  });

  it('drops warnings from the serialized form', () => {
    const order = parseNoteOrder('n5 #a');
    expect(asList(order).warnings).toHaveLength(1);
    expect(formatNoteOrder(order!)).toBe('#a');
  });
});

describe('round trip — canonical inputs are their own serialization', () => {
  const CANONICAL = [
    'ascending pitch',
    'descending pitch',
    '#id1 #id3 #id2 #id4',
    '|: #n1 #princNote :|',
    '#n2 #princNote1 #n3 #princNote1',
    '|: #n4 #princNote2 :|',
    '[ #n97 #n98 ]',
    '#a [ #n97 #n98 ] #b',
    '|: #a :| |: #b :|',
    '#x |: #a [ #b #c ] :| #y',
  ];

  it.each(CANONICAL)('%s survives parse -> format unchanged', (raw) => {
    const order = parseNoteOrder(raw);
    expect(order).not.toBeNull();
    expect(order!.warnings).toEqual([]);
    expect(formatNoteOrder(order!)).toBe(raw);
  });

  it.each(CANONICAL)('%s reparses to an identical AST', (raw) => {
    const once = parseNoteOrder(raw);
    const twice = parseNoteOrder(formatNoteOrder(once!));
    expect(twice).toEqual(once);
  });

  const NON_CANONICAL = [
    {
      name: '":|:" becomes two spelled-out groups',
      raw: '|: #a :|: #b :|',
      out: '|: #a :| |: #b :|',
    },
    { name: 'a one-note chord collapses', raw: '[ #a ]', out: '#a' },
    { name: 'the bare barline disappears', raw: '#a | #b', out: '#a #b' },
    { name: 'unspaced brackets come back spaced', raw: '[#id1 #id2]', out: '[ #id1 #id2 ]' },
  ];

  it.each(NON_CANONICAL)('$name', ({ raw, out }) => {
    expect(formatNoteOrder(parseNoteOrder(raw)!)).toBe(out);
  });
});

describe('formatNoteOrderPerf', () => {
  it('joins bare ids with single spaces', () => {
    expect(formatNoteOrderPerf(['n1', 'princNote', 'n1'])).toBe('n1 princNote n1');
  });

  it('strips a leading "#" so callers may pass either spelling', () => {
    expect(formatNoteOrderPerf(['#n1', 'n2', '#n3'])).toBe('n1 n2 n3');
  });

  it('writes an empty sequence as the empty string', () => {
    expect(formatNoteOrderPerf([])).toBe('');
  });

  it('writes a single id without separators', () => {
    expect(formatNoteOrderPerf(['#n1'])).toBe('n1');
  });

  it('carries no chord or repeat structure — it records what was played', () => {
    const order = asList(parseNoteOrder('|: #a [ #b #c ] :|'));
    const played = order.items.flatMap((item) => [...item.ids]);
    expect(formatNoteOrderPerf(played)).toBe('a b c');
  });
});
