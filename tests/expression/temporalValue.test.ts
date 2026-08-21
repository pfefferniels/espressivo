/**
 * The expression layer's replication of MPM v3's temporal-value grammar, pinned against the
 * real one.
 *
 * The layer zone forbids `src/expression/**` from importing anything under `src/mpm/**` except
 * `names.ts`, so the grammar is transliterated rather than shared and these tests are its parity
 * pin: the same text goes to both readers, on separate parses, and the two answers are compared
 * — never one reader's output fed to the other.
 *
 * The one place the two deliberately disagree is serialization, and it has its own describe:
 * the renderer rebuilds a value's text from its resolved domain (canonicalizing `"44"` into
 * `"44ticks"`), while this engine puts the author's own suffix bytes back.
 */
import { describe, expect, it } from 'vitest';
import { parseMpmRoot } from '../../src/expression/mpmDocument.js';
import {
  detectFrameFormat,
  formatTemporalText,
  parseTemporalText,
  resolveTemporalDomain,
  v3FrameOffsetAttribute,
} from '../../src/expression/temporalValue.js';
import { TemporalSpread } from '../../src/mpm/elements/styles/defs/TemporalSpread.js';
import {
  formatTemporalValue,
  parseTemporalValueLenient,
  parseTemporalValueStrict,
} from '../../src/mpm/elements/styles/defs/TemporalValue.js';
import { MPM_NAMESPACE } from '../../src/mpm/names.js';
import type { Element } from '../../src/xml/XomTypes.js';

/** A bare `<temporalSpread>` document, for the element-level readers. */
function spread(attributes: string): Element {
  return parseMpmRoot(`<temporalSpread xmlns="${MPM_NAMESPACE}" ${attributes}/>`);
}

/**
 * The same attributes read through the real `TemporalSpread`, on its own parse.
 *
 * Its constructor mutates nothing here, but several of this port's parsers rewrite the tree
 * they are handed, and a parity test sharing one compares a reader against a tree the other
 * reader has already edited.
 */
function realSpread(attributes: string): TemporalSpread {
  return new TemporalSpread(spread(attributes));
}

/**
 * Every shape of the grammar and of its neighbourhood, accepted and rejected alike.
 *
 * The rejections carry the weight: the accepted forms would agree under almost any regex, while
 * `"1e3ticks"`, `".5"` and `" 44"` are exactly where a plausible re-implementation drifts from
 * the schematron the renderer enforces.
 */
const GRAMMAR_CORPUS: readonly string[] = [
  // Accepted, suffixed.
  '360ticks',
  '20.5ms',
  '80%',
  '-22.0ms',
  '-100ticks',
  '0ticks',
  '-0.0ticks',
  '0.0%',
  '100%',
  '1234567890123ms',
  // Accepted, suffix-less — what the format's own sample corpus writes.
  '44',
  '-22.0',
  '0',
  '0.0',
  '300.0',
  // Rejected: the spelling of the number.
  '.5ms',
  '1e3ticks',
  '+44ticks',
  'Infinityticks',
  'NaNticks',
  '1.ms',
  '1..0ms',
  '.5',
  '1e3',
  '+44',
  'Infinity',
  'NaN',
  // Rejected: the spelling of the suffix, or its neighbourhood.
  '44 ticks',
  ' 44ticks',
  '44ticks ',
  '44TICKS',
  '44th',
  '44?',
  '44s',
  '80%%',
  '80 %',
  'abc%',
  'ticks',
  '%',
  '',
  '44ticks\n',
];

describe('temporalValue — the grammar, pinned against the real v3 parser', () => {
  it.each(GRAMMAR_CORPUS)('agrees on acceptance and value: %j', (text) => {
    const replica = parseTemporalText(text);
    const real = parseTemporalValueLenient(text);
    expect(replica === null).toBe(real === null);
    if (replica === null || real === null) return;
    // Object.is, not toBe on the number alone: `-0.0ticks` must stay -0 on both sides.
    expect(Object.is(replica.value, real.value)).toBe(true);
  });

  it.each(GRAMMAR_CORPUS)('agrees on which values carry a unit of their own: %j', (text) => {
    const replica = parseTemporalText(text);
    const strict = parseTemporalValueStrict(text);
    expect(replica !== null && replica.suffix !== '').toBe(strict !== null);
  });

  it.each(['360ticks', '20.5ms', '80%', '-22.0ms'])(
    'maps each suffix onto the domain the real parser resolves it to: %j',
    (text) => {
      const replica = parseTemporalText(text)!;
      const real = parseTemporalValueStrict(text)!;
      expect(resolveTemporalDomain(replica.suffix, spread('frameLength="0"'))).toBe(real.domain);
    },
  );

  it('keeps the bare number of a percentage, as the real parser does', () => {
    // "80%" is 80, not 0.8: resolving it against a principal note is the renderer's job.
    expect(parseTemporalText('80%')).toEqual({ value: 80, suffix: '%' });
    expect(parseTemporalValueStrict('80%')).toEqual({ value: 80, domain: 'relative' });
  });

  it('accepts the 309-digit overflow both readers accept, and leaves it non-finite', () => {
    const huge = `${'9'.repeat(309)}ticks`;
    expect(parseTemporalText(huge)!.value).toBe(Infinity);
    expect(parseTemporalValueStrict(huge)!.value).toBe(Infinity);
    // The gate is what refuses it; the parser's job is only to agree with the renderer's.
  });
});

describe('temporalValue — the legacy @time.unit fallback (D3)', () => {
  it.each([
    ['milliseconds', 'milliseconds'],
    ['relative', 'relative'],
    ['ticks', 'ticks'],
    ['nonsense', 'ticks'],
  ] as const)('resolves a suffix-less value under @time.unit=%j to %s', (unit, expected) => {
    const attributes = `frame.offset="44" time.unit="${unit}"`;
    expect(resolveTemporalDomain('', spread(attributes))).toBe(expected);
    expect(realSpread(attributes).getFrameOffset()!.domain).toBe(expected);
  });

  it('falls back to ticks with no @time.unit at all', () => {
    expect(resolveTemporalDomain('', spread('frame.offset="44"'))).toBe('ticks');
    expect(realSpread('frame.offset="44"').getFrameOffset()!.domain).toBe('ticks');
  });

  it('lets a value’s own suffix win over a contradicting @time.unit', () => {
    const attributes = 'frame.offset="44%" time.unit="milliseconds"';
    expect(resolveTemporalDomain('%', spread(attributes))).toBe('relative');
    expect(realSpread(attributes).getFrameOffset()!.domain).toBe('relative');
  });
});

describe('temporalValue — generation detection, pinned against TemporalSpread', () => {
  const DETECTION_CORPUS: readonly string[] = [
    // v2: bare doubles, or nothing at all.
    '',
    'frame.start="-22.0" frameLength="44"',
    'frameLength="44"',
    'frame.start="-22.0"',
    'intensity="2.0" noteoff.shift="monophonic"',
    'frame.start="-22.0" frameLength="44" time.unit="milliseconds"',
    // v2 despite an alignment, which is v3-only but is not a frame value.
    'frame.start="-22.0" alignment="at end"',
    // v3: the renamed attribute.
    'frame.offset="-22.0ticks" frameLength="44ticks"',
    'frame.offset="-22.0"',
    'frame.offset="-22.0" frame.start="-11.0" frameLength="44"',
    // v3: a unit suffix anywhere on a frame value, including the mixed spelling.
    'frame.start="-22.0" frameLength="44%"',
    'frame.start="-22.0ms" frameLength="44"',
    'frameLength="100%"',
    // v3 by the probe alone: the probe is a FORMAT test, not a validity test.
    'frameLength="abc%"',
    'frame.start="--5ticks"',
  ];

  it.each(DETECTION_CORPUS)('agrees with getSourceFormat(): %j', (attributes) => {
    expect(detectFrameFormat(spread(attributes))).toBe(realSpread(attributes).getSourceFormat());
  });

  it('reads the offset through the same ?? chain the v3 parser uses', () => {
    expect(v3FrameOffsetAttribute(spread('frame.offset="1ticks" frame.start="2ticks"'))).toBe(
      'frame.offset',
    );
    expect(v3FrameOffsetAttribute(spread('frame.start="2ticks"'))).toBe('frame.start');
    expect(v3FrameOffsetAttribute(spread('frameLength="44%"'))).toBeNull();

    // And the renderer really does ignore the shadowed alias.
    expect(realSpread('frame.offset="1ticks" frame.start="2ticks"').getFrameOffset()).toEqual({
      value: 1,
      domain: 'ticks',
    });
  });

  it('reads a v3-detected element’s frame.start as the offset, not as a v2 field', () => {
    // The mixed spelling of the ruling: one v3 marker makes the whole element v3, and the old
    // name carries its value across into the v3 reading.
    const real = realSpread('frame.start="-22.0" frameLength="44%"');
    expect(real.getSourceFormat()).toBe('v3');
    expect(real.getFrameOffset()).toEqual({ value: -22, domain: 'ticks' });
    expect(real.getFrameLengthValue()).toEqual({ value: 44, domain: 'relative' });
    // The v2 field is untouched, which is why the engine must not read it here.
    expect(real.frameStart).toBe(0);
  });
});

describe('temporalValue — serialization keeps the author’s spelling', () => {
  it.each([
    ['360ticks', 2, '720ticks'],
    ['80%', 1.5, '120%'],
    ['20.5ms', 2, '41ms'],
    ['-22.0ms', 2, '-44ms'],
    ['-22.0ms', 0.5, '-11ms'],
    ['44', 2, '88'],
    ['-22.0', 2, '-44'],
    ['0.0%', 3, '0%'],
  ])('scales %j by %d into %j', (text, factor, expected) => {
    const parsed = parseTemporalText(text)!;
    expect(formatTemporalText({ ...parsed, value: parsed.value * factor })).toBe(expected);
  });

  it('writes a negative-scaled-to-zero offset as an unsigned 0, keeping its unit', () => {
    // `s · x` is -0 for a negative x at s = 0; the transform normalizes the sign, and this is
    // the spelling that reaches the document either way.
    const parsed = parseTemporalText('-22.0ms')!;
    expect(formatTemporalText({ ...parsed, value: parsed.value * 0 })).toBe('0ms');
    expect(formatTemporalText({ ...parsed, value: 0 })).toBe('0ms');
  });

  it('diverges from the renderer’s formatter exactly where the design says it does', () => {
    // Same number, same domain, two jobs: the renderer writes canonical v3, this engine writes
    // back what it found. A suffix-less value is the whole case.
    expect(formatTemporalText({ value: 88, suffix: '' })).toBe('88');
    expect(formatTemporalValue({ value: 88, domain: 'ticks' })).toBe('88ticks');
    // Where the author did write a suffix the two agree: spelling, not meaning.
    expect(formatTemporalText({ value: 120, suffix: '%' })).toBe('120%');
    expect(formatTemporalValue({ value: 120, domain: 'relative' })).toBe('120%');
  });

  it('round-trips every accepted form of the corpus unchanged at factor 1', () => {
    for (const text of GRAMMAR_CORPUS) {
      const parsed = parseTemporalText(text);
      if (parsed === null) continue;
      // Only the number's spelling may normalize (`-22.0` → `-22`), never the unit's.
      expect(formatTemporalText(parsed).replace(/^[-0-9.]+/, '')).toBe(
        text.replace(/^[-0-9.]+/, ''),
      );
    }
  });
});
