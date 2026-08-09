import { describe, expect, it } from 'vitest';
import {
  TEMPORAL_DOMAIN_SUFFIX,
  formatTemporalValue,
  parseTemporalValueLenient,
  parseTemporalValueStrict,
  type TemporalDomain,
  type TemporalValue,
} from '../../../../../src/mpm/elements/styles/defs/TemporalValue.js';

/**
 * Reference: MPM spec at develop @ 1de00bb — `src/specs/att.time.frame.xml`,
 * `src/specs/att.time.frameLength.xml`, `src/specs/temporalSpread.xml`, `src/mpm.odd`.
 * Line citations in the tables below point into that clone.
 *
 * There is no Java ground truth to compare against: the reference implementation rejects
 * most of these inputs (see the PARITY NOTE in the module under test), so every expected
 * value here is read off the spec grammar by hand.
 */

/** The numeric shapes `^-?[0-9]+(\.[0-9]+)?$` admits: signed/unsigned × integer/decimal. */
const NUMERIC_FORMS: readonly (readonly [text: string, value: number])[] = [
  ['0', 0],
  ['480', 480],
  ['-100', -100],
  ['20.5', 20.5],
  ['-0.5', -0.5],
  ['0.0', 0],
];

/** The complete suffix alternation, with the domain each names. */
const SUFFIX_FORMS: readonly (readonly [suffix: string, domain: TemporalDomain])[] = [
  ['ticks', 'ticks'],
  ['ms', 'milliseconds'],
  ['%', 'relative'],
];

/** Every literal the v3 spec writes out as an example, with where it says it. */
const SPEC_EXAMPLES: readonly (readonly [
  text: string,
  value: number,
  domain: TemporalDomain,
  source: string,
])[] = [
  ['360ticks', 360, 'ticks', 'mpm.odd:685'],
  ['20.5ms', 20.5, 'milliseconds', 'mpm.odd:685'],
  ['80%', 80, 'relative', 'mpm.odd:685'],
  ['-100ms', -100, 'milliseconds', 'att.time.frame.xml:20'],
  ['50.0%', 50, 'relative', 'att.time.frame.xml:20'],
  ['480ticks', 480, 'ticks', 'att.time.frame.xml:20'],
  ['0.0ticks', 0, 'ticks', 'att.time.frame.xml:16, the frame.offset default'],
  ['100%', 100, 'relative', 'temporalSpread.xml:38, the frameLength default'],
  ['200ms', 200, 'milliseconds', 'att.time.frameLength.xml:21'],
  ['-100.0ms', -100, 'milliseconds', 'temporalSpread.xml:48, the exemplum'],
  ['200.0ticks', 200, 'ticks', 'temporalSpread.xml:48, the exemplum'],
];

/**
 * Strings the spec regex rejects, with the reason. Several are inputs the reference
 * implementation accepts (`360th`, `?`) or produces; they must not leak in here.
 */
const STRICT_REJECTIONS: readonly (readonly [text: string, why: string])[] = [
  ['480', 'suffix-less — lenient only'],
  ['0.0', 'suffix-less — lenient only'],
  ['-22.0', 'suffix-less — lenient only'],
  ['.5ticks', 'leading dot: the grammar needs a digit before the point'],
  ['5.ms', 'trailing dot: the fraction group needs a digit after the point'],
  ['1e3ms', 'exponent form is outside the grammar'],
  ['1E3ms', 'exponent form is outside the grammar'],
  ['Infinityms', 'not a decimal literal'],
  ['-Infinityms', 'not a decimal literal'],
  ['NaNms', 'not a decimal literal'],
  ['Infinity', 'not a decimal literal, and no suffix'],
  ['NaN', 'not a decimal literal, and no suffix'],
  ['360th', "'th' is a reference-implementation domain no spec release has"],
  ['360?', "'?' is the reference implementation's Unknown domain"],
  ['?', 'domain marker alone'],
  [' 100ms', 'no whitespace tolerance'],
  ['100ms ', 'no whitespace tolerance'],
  ['100 %', 'no whitespace tolerance'],
  ['100 ms', 'no whitespace tolerance'],
  ['', 'empty'],
  ['-', 'sign alone'],
  ['ms', 'suffix alone'],
  ['%', 'suffix alone'],
  ['ticks', 'suffix alone'],
  ['+100ms', 'the grammar has no plus sign'],
  ['--100ms', 'double sign'],
  ['1.2.3ms', 'two decimal points'],
  ['1,5ms', 'comma is not a decimal point'],
  ['0x10ticks', 'hex is outside the grammar'],
  ['360TICKS', 'the suffixes are case-sensitive'],
  ['360Ms', 'the suffixes are case-sensitive'],
  ['360ticksticks', 'one suffix only'],
  ['360ticks360', 'trailing junk'],
  ['360ticks\n', 'a trailing newline is not end of input, as in Java Matcher.matches()'],
];

/** Well-formed but domain-less strings, incl. the four the real corpus actually contains. */
const LENIENT_ONLY: readonly (readonly [text: string, value: number, source: string])[] = [
  ['-22.0', -22, 'Reger - Moment Musical op 13 no 4.mpm, frame.offset'],
  ['0.0', 0, 'Reger - Moment Musical op 13 no 4.mpm, frame.offset'],
  ['300.0', 300, 'Reger - Moment Musical op 13 no 4.mpm, frameLength'],
  ['44.0', 44, 'Reger - Moment Musical op 13 no 4.mpm, frameLength'],
  ['0', 0, 'ornamentDef.xml exemplum, frame.offset="0"'],
  ['480', 480, 'plain integer'],
  ['-100', -100, 'plain signed integer'],
  ['20.5', 20.5, 'plain decimal'],
];

describe('parseTemporalValueStrict', () => {
  describe('every suffix on every numeric shape the spec grammar admits', () => {
    for (const [suffix, domain] of SUFFIX_FORMS)
      for (const [numeric, value] of NUMERIC_FORMS)
        it(`parses "${numeric}${suffix}" as ${String(value)} ${domain}`, () => {
          expect(parseTemporalValueStrict(`${numeric}${suffix}`)).toEqual({ value, domain });
        });
  });

  describe("the spec's own examples", () => {
    for (const [text, value, domain, source] of SPEC_EXAMPLES)
      it(`parses "${text}" (${source})`, () => {
        expect(parseTemporalValueStrict(text)).toEqual({ value, domain });
      });
  });

  describe('rejections', () => {
    for (const [text, why] of STRICT_REJECTIONS)
      it(`rejects ${JSON.stringify(text)} — ${why}`, () => {
        expect(parseTemporalValueStrict(text)).toBeNull();
      });
  });

  it('keeps the sign of zero, which the tick arithmetic downstream can observe', () => {
    const negative = parseTemporalValueStrict('-0.0ticks');
    expect(negative).not.toBeNull();
    expect(Object.is(negative!.value, -0)).toBe(true);

    const positive = parseTemporalValueStrict('0.0ticks');
    expect(Object.is(positive!.value, 0)).toBe(true);
  });

  it('stores a relative value as the literal before the % sign, not as a fraction', () => {
    expect(parseTemporalValueStrict('80%')).toEqual({ value: 80, domain: 'relative' });
    expect(parseTemporalValueStrict('0.5%')).toEqual({ value: 0.5, domain: 'relative' });
  });

  it('parses the decimal exactly as Double.parseDouble would', () => {
    // 0.1 and 20.5 are the nearest doubles to their decimal text; 0.1 is not exact in
    // binary, so pinning it proves the parse is the IEEE round-to-nearest one and not a
    // digit-by-digit accumulation.
    expect(parseTemporalValueStrict('0.1ms')!.value).toBe(0.1);
    expect(parseTemporalValueStrict('20.5ms')!.value).toBe(20.5);
    expect(parseTemporalValueStrict('9007199254740993ticks')!.value).toBe(9007199254740992);
  });

  it('overflows to Infinity on a schema-valid number too large for a double', () => {
    // The grammar bounds the spelling, not the magnitude: 309 digits satisfy the
    // schematron. Java's Double.parseDouble returns Infinity for the same text
    // (7ff0000000000000), so this is parity-correct and deliberately unguarded — the
    // caller owns the finiteness check.
    const huge = '9'.repeat(309);
    expect(parseTemporalValueStrict(`${huge}ticks`)).toEqual({ value: Infinity, domain: 'ticks' });
    expect(parseTemporalValueStrict(`-${huge}ms`)).toEqual({
      value: -Infinity,
      domain: 'milliseconds',
    });
    expect(parseTemporalValueLenient(huge)).toEqual({ value: Infinity, domain: null });
  });

  it('agrees with the domain table both ways', () => {
    // Guards the two directions against drifting apart: whatever suffix the table says
    // spells a domain must be the suffix that parses back to it.
    for (const domain of Object.keys(TEMPORAL_DOMAIN_SUFFIX) as TemporalDomain[])
      expect(parseTemporalValueStrict(`1${TEMPORAL_DOMAIN_SUFFIX[domain]}`)).toEqual({
        value: 1,
        domain,
      });
  });
});

describe('parseTemporalValueLenient', () => {
  describe('accepts everything the strict mode accepts, identically', () => {
    for (const [text, value, domain, source] of SPEC_EXAMPLES)
      it(`parses "${text}" (${source})`, () => {
        expect(parseTemporalValueLenient(text)).toEqual({ value, domain });
      });
  });

  describe('accepts suffix-less numbers with a null domain', () => {
    for (const [text, value, source] of LENIENT_ONLY)
      it(`parses "${text}" (${source})`, () => {
        expect(parseTemporalValueLenient(text)).toEqual({ value, domain: null });
      });
  });

  it('leaves the fallback policy to the caller', () => {
    // No ticks default, no time.unit lookup here — DESIGN.md D3 puts both in the reader.
    expect(parseTemporalValueLenient('300.0')?.domain).toBeNull();
  });

  describe('rejections', () => {
    const rejected: readonly (readonly [text: string, why: string])[] = [
      ['', 'empty'],
      ['-', 'sign alone'],
      ['ms', 'suffix alone'],
      ['%', 'suffix alone'],
      ['ticks', 'suffix alone'],
      ['.5', 'leading dot'],
      ['5.', 'trailing dot'],
      ['1e3', 'exponent form'],
      ['NaN', 'not a decimal literal'],
      ['Infinity', 'not a decimal literal'],
      [' 100', 'nothing is trimmed'],
      ['100 ', 'nothing is trimmed'],
      ['1,5', 'comma is not a decimal point'],
      ['--1', 'double sign'],
      ['1.2.3', 'two decimal points'],
      ['0x10', 'hex'],
      ['abc', 'garbage'],
      ['360th', 'a reference-implementation domain'],
    ];
    for (const [text, why] of rejected)
      it(`rejects ${JSON.stringify(text)} — ${why}`, () => {
        expect(parseTemporalValueLenient(text)).toBeNull();
      });
  });
});

describe('formatTemporalValue', () => {
  it('writes each domain with its v3 suffix', () => {
    expect(formatTemporalValue({ value: 360, domain: 'ticks' })).toBe('360ticks');
    expect(formatTemporalValue({ value: 20.5, domain: 'milliseconds' })).toBe('20.5ms');
    expect(formatTemporalValue({ value: 80, domain: 'relative' })).toBe('80%');
    expect(formatTemporalValue({ value: -100, domain: 'milliseconds' })).toBe('-100ms');
    expect(formatTemporalValue({ value: -0.5, domain: 'relative' })).toBe('-0.5%');
  });

  it('uses the house String(x) convention, not Java Double.toString', () => {
    // Java would write "0.0ticks" / "50.0%"; every shipped serializer in this port writes
    // String(x) instead (research/java-ts-v2-ornamentation.md §5.3 item 5). Both spellings
    // satisfy the schematron, and this keeps one number-writing rule in the codebase.
    expect(formatTemporalValue({ value: 0, domain: 'ticks' })).toBe('0ticks');
    expect(formatTemporalValue({ value: 50, domain: 'relative' })).toBe('50%');
    expect(formatTemporalValue({ value: 100, domain: 'relative' })).toBe('100%');
  });

  it('normalizes negative zero to "0", as String(-0) does', () => {
    expect(formatTemporalValue({ value: -0, domain: 'ticks' })).toBe('0ticks');
  });

  it('falls out of the schema-valid range where ToString switches to exponent form', () => {
    // Documented limitation, not a guard: no musical frame reaches 1e21 ticks, and
    // clamping here would only move the problem to the caller.
    expect(formatTemporalValue({ value: 1e21, domain: 'ticks' })).toBe('1e+21ticks');
    expect(parseTemporalValueStrict('1e+21ticks')).toBeNull();
  });

  it('writes a non-finite value out verbatim, which no reader takes back', () => {
    // One hop from real input: a 309-digit frameLength parses to Infinity *successfully*,
    // so a caller's log-and-skip on a failed parse never sees it. The formatter stays
    // total and the guard decision belongs to the code that owns the attribute (W3).
    expect(formatTemporalValue({ value: Infinity, domain: 'ticks' })).toBe('Infinityticks');
    expect(formatTemporalValue({ value: -Infinity, domain: 'milliseconds' })).toBe('-Infinityms');
    expect(formatTemporalValue({ value: NaN, domain: 'relative' })).toBe('NaN%');
    expect(parseTemporalValueStrict('Infinityticks')).toBeNull();
    expect(parseTemporalValueStrict('NaN%')).toBeNull();

    const overflowed = parseTemporalValueStrict(`${'9'.repeat(309)}ticks`);
    expect(parseTemporalValueStrict(formatTemporalValue(overflowed!))).toBeNull();
  });
});

describe('round trip', () => {
  describe('strict parse to format to strict parse preserves value and domain', () => {
    for (const [text, value, domain, source] of SPEC_EXAMPLES)
      it(`round-trips "${text}" (${source})`, () => {
        const first = parseTemporalValueStrict(text);
        expect(first).toEqual({ value, domain });
        const second = parseTemporalValueStrict(formatTemporalValue(first!));
        expect(second).toEqual(first);
      });
  });

  describe('format to strict parse is the identity on constructed values', () => {
    const values: readonly TemporalValue[] = [
      { value: 0, domain: 'ticks' },
      { value: 480, domain: 'ticks' },
      { value: -22.5, domain: 'ticks' },
      { value: 0.1, domain: 'milliseconds' },
      { value: -100, domain: 'milliseconds' },
      { value: 300, domain: 'milliseconds' },
      { value: 100, domain: 'relative' },
      { value: 66.6, domain: 'relative' },
      { value: -1.25, domain: 'relative' },
    ];
    for (const value of values)
      it(`round-trips ${formatTemporalValue(value)}`, () => {
        expect(parseTemporalValueStrict(formatTemporalValue(value))).toEqual(value);
      });
  });

  it('preserves the value but not the source spelling', () => {
    // The trailing zero of the spec's own default is not reproduced; the parsed value is.
    expect(formatTemporalValue(parseTemporalValueStrict('0.0ticks')!)).toBe('0ticks');
    expect(formatTemporalValue(parseTemporalValueStrict('50.0%')!)).toBe('50%');
  });

  it('turns a suffix-less corpus value into a canonical one once the caller picks a domain', () => {
    // The reader's job (DESIGN.md D3) shown end to end: "-22.0" with no unit becomes
    // "-22ticks" after the ticks fallback is applied by the caller, not by this module.
    const lenient = parseTemporalValueLenient('-22.0');
    expect(lenient).toEqual({ value: -22, domain: null });
    expect(formatTemporalValue({ value: lenient!.value, domain: lenient!.domain ?? 'ticks' })).toBe(
      '-22ticks',
    );
  });
});
