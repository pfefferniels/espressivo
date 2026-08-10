/**
 * `exaggerateMpm` as a caller meets it: the identity contract, the typed-error surface, the
 * options, and the plain-data guarantee — everything about the facade that does not need a
 * render. The two claims that do (R5 symbolic invariance and A14's expected directions) are in
 * `tests/integration/expression-transform.test.ts`.
 *
 * The engine underneath is covered by `tests/expression/**`; nothing here re-tests it. What is
 * tested here is the boundary: that the engine's plain `Error`s arrive as the documented
 * classes with the offender still named, that `options.msm` reaches the report and nothing
 * else, and that the result survives the round trips RULE F1 promises.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { MessageChannel } from 'worker_threads';
import {
  EXPRESSION_DIMENSIONS,
  EngineInvariantError,
  InvalidOptionError,
  MeicoError,
  ParseError,
  PerformanceNotFoundError,
  canonicalMpm,
  exaggerateMpm,
  performMsm,
  type ExaggerateOptions,
  type ExaggerationFactors,
  type XmlText,
} from '../../src/api/index.js';

const FIXTURES = join(dirname(fileURLToPath(import.meta.url)), '..', 'integration', 'fixtures');
const reference = (name: string, extension: 'msm' | 'mpm') =>
  readFileSync(join(FIXTURES, 'reference', `${name}.${extension}`), 'utf-8') as XmlText;
const allMaps = (name: string, extension: 'msm' | 'mpm') =>
  readFileSync(join(FIXTURES, 'all-maps-reference', `${name}.${extension}`), 'utf-8') as XmlText;

const SPANS = reference('tempo_dynamics_spans', 'mpm');
const ALL_MAPS = allMaps('all_maps', 'mpm');

const uniformFactors = (s: number): ExaggerationFactors =>
  Object.fromEntries(EXPRESSION_DIMENSIONS.map((dimension) => [dimension, s]));

const MPM_NS = 'http://www.cemfi.de/mpm/ns/1.0';

/** A hand-built document, for the shapes no fixture in the corpus has. */
function document(performances: string): XmlText {
  return `<mpm xmlns="${MPM_NS}">${performances}</mpm>` as XmlText;
}

function performance(name: string, dated: string, header = '', ppq = 720): string {
  return (
    `<performance name="${name}" pulsesPerQuarter="${ppq}">` +
    `<global><header>${header}</header><dated>${dated}</dated></global>` +
    `</performance>`
  );
}

const TWO_TEMPI =
  '<tempoMap><tempo date="0.0" bpm="60" beatLength="0.25"/>' +
  '<tempo date="720.0" bpm="120" beatLength="0.25"/></tempoMap>';

// ---------------------------------------------------------------------------
// P1 — the identity predicates
// ---------------------------------------------------------------------------

describe('P1: the identity transform returns the canonical baseline byte for byte', () => {
  const documents: readonly (readonly [string, XmlText])[] = [
    ['tempo_dynamics_spans', SPANS],
    ['articulations', reference('articulations', 'mpm')],
    ['all_maps', ALL_MAPS],
    ['ornamentation', allMaps('ornamentation', 'mpm')],
  ];

  it.each(documents)('%s: factors {} writes nothing', (_name, mpm) => {
    const { mpm: out, report } = exaggerateMpm(mpm, { factors: {} });
    expect(out).toBe(canonicalMpm(mpm));
    expect(report.totalWrites).toBe(0);
  });

  it.each(documents)('%s: every dimension at 1 writes nothing', (_name, mpm) => {
    // The predicate that actually exercises the engine (A2): a missing key never reaches a
    // transform, while an explicit 1 has to be short-circuited at the dimension level. It
    // cannot be "the value is unchanged so the write is skipped" — at s = 1 the round trip
    // through a scale space is not the identity in doubles, and `"1.0"` would come back `"1"`.
    const { mpm: out, report } = exaggerateMpm(mpm, { factors: uniformFactors(1) });
    expect(out).toBe(canonicalMpm(mpm));
    expect(report.totalWrites).toBe(0);
  });

  it('reports every dimension skipped with an identity-factor note, not absent', () => {
    const { report } = exaggerateMpm(SPANS, { factors: uniformFactors(1) });
    const [only] = report.performances;
    for (const dimension of EXPRESSION_DIMENSIONS) {
      expect(only.dimensions[dimension].state, dimension).toBe('skipped');
      expect(only.dimensions[dimension].requestedFactor, dimension).toBe(1);
    }
    expect(only.notes.filter((note) => note.kind === 'identity-factor')).toHaveLength(
      EXPRESSION_DIMENSIONS.length,
    );
  });

  it('is idempotent on its own output, which is what makes the baseline canonical', () => {
    const once = exaggerateMpm(SPANS, { factors: {} }).mpm;
    expect(exaggerateMpm(once, { factors: {} }).mpm).toBe(once);
  });

  it('is deterministic: the same input and factors give the same bytes (R2)', () => {
    const factors = uniformFactors(1.7);
    expect(exaggerateMpm(ALL_MAPS, { factors }).mpm).toBe(exaggerateMpm(ALL_MAPS, { factors }).mpm);
  });

  it("does not touch the caller's input, which is a string and so cannot be (RULE I3a)", () => {
    const before = SPANS;
    exaggerateMpm(SPANS, { factors: uniformFactors(3) });
    expect(SPANS).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// RULE F1 — plain data
// ---------------------------------------------------------------------------

describe('RULE F1: the result is plain data', () => {
  const result = () =>
    exaggerateMpm(ALL_MAPS, { factors: uniformFactors(2), msm: allMaps('all_maps', 'msm') });

  /** Every node of the value, with a readable path for the failure message. */
  function* nodes(value: unknown, path = '$'): Generator<[string, unknown]> {
    yield [path, value];
    if (value === null || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const [index, item] of value.entries()) yield* nodes(item, `${path}[${index}]`);
    } else {
      for (const [key, item] of Object.entries(value)) yield* nodes(item, `${path}.${key}`);
    }
  }

  it('contains only the permitted types, with every number finite', () => {
    for (const [path, node] of nodes(result())) {
      if (node === null || ['string', 'number', 'boolean'].includes(typeof node)) {
        if (typeof node === 'number')
          expect(Number.isFinite(node), `${path} = ${String(node)} is finite`).toBe(true);
        continue;
      }
      expect(typeof node, `${path} is not a function or symbol`).toBe('object');
      expect(node instanceof Map || node instanceof Set, `${path} is not a Map/Set`).toBe(false);
      const prototype = Object.getPrototypeOf(node) as unknown;
      expect(
        prototype === Object.prototype || prototype === Array.prototype,
        `${path} is a plain object or array`,
      ).toBe(true);
      for (const key of Object.keys(node as object)) {
        const descriptor = Object.getOwnPropertyDescriptor(node, key)!;
        expect(descriptor.get, `${path}.${key} is a data property`).toBeUndefined();
        expect(descriptor.value, `${path}.${key} is not undefined`).not.toBeUndefined();
      }
    }
  });

  it('never exposes an XomTypes node, not even one level down', () => {
    for (const [path, node] of nodes(result()))
      if (node !== null && typeof node === 'object')
        expect(
          'getLocalName' in node || 'toXML' in node || 'getDomNode' in node,
          `${path} is not an XML node`,
        ).toBe(false);
  });

  it('survives a JSON round trip unchanged — every report field included', () => {
    const value = result();
    expect(JSON.parse(JSON.stringify(value)) as unknown).toEqual(value);
  });

  it('survives structuredClone and a postMessage hop unchanged', async () => {
    const value = result();
    expect(structuredClone(value)).toEqual(value);

    const { port1, port2 } = new MessageChannel();
    try {
      const received = new Promise((resolve) => port2.once('message', resolve));
      port1.postMessage(value);
      expect(await received).toEqual(value);
    } finally {
      port1.close();
      port2.close();
    }
  });

  it('hands out fresh objects, so `===` memoization sees a change (RULE I3b)', () => {
    const first = result();
    const second = result();
    expect(second).toEqual(first);
    expect(second).not.toBe(first);
    expect(second.report).not.toBe(first.report);
    expect(second.report.performances[0].notes).not.toBe(first.report.performances[0].notes);
  });
});

// ---------------------------------------------------------------------------
// RULE E2 — the error surface
// ---------------------------------------------------------------------------

describe('RULE E2: every failure is a typed error naming the offender', () => {
  const factors: ExaggerationFactors = { tempo: 2 };

  describe('ParseError', () => {
    /**
     * Class AND message, always, in one call — because either alone leaves a refactor free to
     * break the other. The `options.msm` cases are the ones this matters most for: `parseRoot`
     * is shared between the two document kinds, and routing MSM failures through
     * `InvalidOptionError` (defensible-looking, since a bad `options.msm` IS an option) would
     * keep a message-only assertion green while breaking the documented `@throws`.
     */
    const rejects = (thunk: () => unknown, pattern: RegExp) => {
      expect(thunk).toThrow(ParseError);
      expect(thunk).toThrow(pattern);
    };

    it.each([
      ['not well-formed', '<mpm><performance></mpm>'],
      ['not XML at all', 'certainly not xml'],
    ])('rejects an MPM that is %s', (_why, text) => {
      // The foreign class trap: `@xmldom/xmldom` throws its OWN `ParseError`, which shares a
      // name with this package's and is not the same class. A consumer catching by identity
      // would miss it entirely if the facade did not translate.
      rejects(() => exaggerateMpm(text as XmlText, { factors }), /^MPM: /);
    });

    it('rejects a well-formed document whose root is not <mpm>', () => {
      rejects(
        () => exaggerateMpm('<msm pulsesPerQuarter="720"/>' as XmlText, { factors }),
        /MPM: expected a <mpm> root element, found <msm>/,
      );
    });

    it.each([
      ['empty', ''],
      ['blank', '   '],
    ])('rejects %s input as "got nothing"', (_why, text) => {
      rejects(
        () => exaggerateMpm(text as XmlText, { factors }),
        /MPM: expected XML text, got nothing/,
      );
    });

    it('rejects a non-string from an untyped caller without a TypeError', () => {
      rejects(
        () => exaggerateMpm(null as unknown as XmlText, { factors }),
        /MPM: expected XML text, got nothing/,
      );
    });

    it('rejects a malformed or wrong-rooted options.msm, naming MSM rather than MPM', () => {
      rejects(() => exaggerateMpm(SPANS, { factors, msm: '<msm' as XmlText }), /^MSM: /);
      rejects(
        () => exaggerateMpm(SPANS, { factors, msm: '<mpm/>' as XmlText }),
        /MSM: expected a <msm> root element, found <mpm>/,
      );
    });

    /**
     * `canonicalMpm` is called on the SAME text as `exaggerateMpm` — it is the oracle every
     * identity claim in this file compares against — so the two have to agree on the failure
     * path as exactly as they agree on the success path. They did not: the export used to be
     * the interior `canonicalBaseline` verbatim, which parses with a bare `Builder` and hands
     * back `@xmldom/xmldom`'s own `ParseError`, a class that is not a `MeicoError` at all.
     */
    describe('canonicalMpm agrees with exaggerateMpm on every rejection', () => {
      const inputs: readonly (readonly [string, unknown])[] = [
        ['not well-formed', '<mpm><performance></mpm>'],
        ['not XML at all', 'certainly not xml'],
        ['the wrong root', '<msm pulsesPerQuarter="720"/>'],
        ['empty', ''],
        ['blank', '   '],
        ['a non-string', null],
        ['undefined', undefined],
      ];

      const thrownBy = (call: () => unknown): Error => {
        try {
          call();
        } catch (error) {
          return error as Error;
        }
        return expect.unreachable('expected a rejection, got a value');
      };

      it.each(inputs)('rejects %s with the same class and the same message', (_why, input) => {
        const fromExaggerate = thrownBy(() => exaggerateMpm(input as XmlText, { factors }));
        const fromCanonical = thrownBy(() => canonicalMpm(input as XmlText));

        expect(fromExaggerate).toBeInstanceOf(ParseError);
        expect(fromCanonical).toBeInstanceOf(ParseError);
        expect(fromCanonical.message).toBe(fromExaggerate.message);
      });

      it('agrees byte for byte on the success path too', () => {
        expect(canonicalMpm(SPANS)).toBe(exaggerateMpm(SPANS, { factors: {} }).mpm);
      });
    });
  });

  describe('InvalidOptionError', () => {
    const rejects = (options: unknown, pattern: RegExp) => {
      expect(() => exaggerateMpm(SPANS, options as ExaggerateOptions)).toThrow(InvalidOptionError);
      expect(() => exaggerateMpm(SPANS, options as ExaggerateOptions)).toThrow(pattern);
    };

    it('names an unknown dimension key, and lists the ones it accepts', () => {
      rejects({ factors: { tempoo: 2 } }, /unknown exaggeration dimension: "tempoo"/);
      rejects({ factors: { tempoo: 2 } }, /expected one of tempo, tempoShape, dynamics/);
    });

    it('names the dimension and the value of a non-finite factor', () => {
      rejects({ factors: { dynamics: NaN } }, /factor for dynamics must be finite, got NaN/);
      rejects({ factors: { tempo: Infinity } }, /factor for tempo must be finite, got Infinity/);
    });

    it('names a factor outside its dimension s-domain, with the mathematics', () => {
      // Not a clamp: for a boundary-power dimension T's range is the half-line (−∞,0], so a
      // negative s leaves it and P3 (domain closure) fails outright.
      rejects(
        { factors: { pedalShape: -1 } },
        /factor for pedalShape must be ≥ 0 .*half-line.*got -1/s,
      );
      // …while a dimension whose scale space is all of ℝ accepts one.
      expect(() => exaggerateMpm(SPANS, { factors: { tempo: -1 } })).not.toThrow();
    });

    it('names an out-of-domain velocityRange, minRubatoWindow, center or scope', () => {
      rejects(
        { factors, velocityRange: { min: 100, max: 20 } },
        /velocityRange.min must be below velocityRange.max/,
      );
      rejects(
        { factors, velocityRange: { min: 0, max: 127 } },
        /velocityRange.min must be positive \(velocity 0 is a note-off\), got 0/,
      );
      rejects({ factors, minRubatoWindow: 0 }, /minRubatoWindow must lie in \(0,1\), got 0/);
      rejects({ factors, minRubatoWindow: 1 }, /minRubatoWindow must lie in \(0,1\), got 1/);
      rejects({ factors, center: { tempo: 0 } }, /center.tempo must be a positive finite number/);
      rejects({ factors, scope: 'local' }, /unknown scope: "local"/);
    });

    it('names a performance index that is not a non-negative integer', () => {
      // Spelled exactly as `selectPerformance` spells it, so the two facades agree.
      rejects({ factors, performance: -1 }, /performance index must be a non-negative integer/);
      rejects({ factors, performance: 1.5 }, /performance index must be a non-negative integer/);
    });

    it('rejects a missing or non-object factors record from an untyped caller', () => {
      rejects({}, /options.factors must be a record/);
      rejects({ factors: 2 }, /options.factors must be a record/);
      expect(() => exaggerateMpm(SPANS, undefined as unknown as ExaggerateOptions)).toThrow(
        /options must be an object/,
      );
    });

    it('is raised before the document is parsed, so an option typo wins over a bad document', () => {
      expect(() => exaggerateMpm('not xml' as XmlText, { factors: { nope: 1 } as never })).toThrow(
        InvalidOptionError,
      );
    });
  });

  describe('PerformanceNotFoundError', () => {
    const rejects = (selector: string | number, pattern: RegExp) => {
      const call = () => exaggerateMpm(SPANS, { factors, performance: selector });
      expect(call).toThrow(PerformanceNotFoundError);
      expect(call).toThrow(pattern);
    };

    it('reports a name that matches nothing', () => {
      rejects('Rubato', /MPM: no performance named 'Rubato'/);
    });

    it('reports an index past the end, with the count the document does have', () => {
      rejects(3, /MPM: no performance at index 3; the document has 1/);
    });

    it('is not raised when the selector matches, nor when there is no selector', () => {
      expect(() =>
        exaggerateMpm(SPANS, { factors, performance: 'MEI export performance' }),
      ).not.toThrow();
      expect(() => exaggerateMpm(SPANS, { factors, performance: 0 })).not.toThrow();
      expect(() => exaggerateMpm(SPANS, { factors })).not.toThrow();
    });

    it('reads a null selector as absent, the way every other option in the bag reads it', () => {
      // The engine normalises all five of its options with `??`, so `null` is "absent" for
      // `scope`, `center`, `velocityRange`, `minRubatoWindow` and `performance` alike. A
      // facade guard spelling absence `=== undefined` would make one option bag carry two
      // meanings for one value — and would report a performance named 'null' that no caller
      // ever wrote, on a document the engine had already transformed in full.
      const nulled = exaggerateMpm(SPANS, {
        factors,
        performance: null as unknown as undefined,
      });
      expect(nulled.report.performances).toHaveLength(1);
      expect(nulled.mpm).toBe(exaggerateMpm(SPANS, { factors }).mpm);
    });
  });

  describe('EngineInvariantError', () => {
    /**
     * A6's `lateStart < earlyEnd` assertion, reached the only way it can be.
     *
     * The guard clamps the joint trim to `1 − minRubatoWindow`, so the split is ordered by
     * construction *for a `minRubatoWindow` big enough to survive the subtraction*. Below
     * about 2⁻⁵³ it does not: `1 − 1e-17` rounds to exactly 1.0, the clamp stops clamping, and
     * a saturating trim collapses the window onto a point. Which is precisely what the option's
     * documented default exists to prevent — the failure is the engine reporting on itself,
     * not a condition of the document.
     */
    const crossing: ExaggerateOptions = {
      factors: { rubato: 2000 },
      minRubatoWindow: 1e-17,
    };
    const rubato = document(
      performance(
        'P',
        '<rubatoMap><rubato date="0.0" frameLength="720.0" lateStart="0.25" earlyEnd="0.75"/></rubatoMap>',
      ),
    );

    it('wraps an interior invariant failure, keeping the interior message', () => {
      expect(() => exaggerateMpm(rubato, crossing)).toThrow(EngineInvariantError);
      expect(() => exaggerateMpm(rubato, crossing)).toThrow(
        /failed an internal invariant — rubato window \(0.25, 0.75\).*crossed pair at s = 2000/,
      );
    });

    it('keeps the interior error as `cause`, so a bug report can carry the stack', () => {
      try {
        exaggerateMpm(rubato, crossing);
        expect.unreachable('the crossing window should have thrown');
      } catch (error) {
        expect((error as Error).cause).toBeInstanceOf(Error);
      }
    });

    it('does not fire at the documented default, which is what the default is for', () => {
      expect(() => exaggerateMpm(rubato, { factors: { rubato: 2000 } })).not.toThrow();
    });
  });

  it('every error class descends from MeicoError, so one catch covers the facade', () => {
    for (const thrower of [
      () => exaggerateMpm('bad' as XmlText, { factors }),
      () => exaggerateMpm(SPANS, { factors: { nope: 1 } as never }),
      () => exaggerateMpm(SPANS, { factors, performance: 'nope' }),
    ])
      expect(thrower).toThrow(MeicoError);
  });
});

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

describe('options', () => {
  const twoPerformances = document(
    performance('First', TWO_TEMPI) + performance('Second', TWO_TEMPI),
  );

  it('transforms ALL performances by default — the A11 divergence from performMsm', () => {
    const { report } = exaggerateMpm(twoPerformances, { factors: { tempo: 2 } });
    expect(report.performances.map((p) => p.performance.name)).toEqual(['First', 'Second']);
    expect(report.performances.every((p) => p.totalWrites > 0)).toBe(true);
  });

  it.each([
    ['by name', 'Second' as const],
    ['by index', 1 as const],
  ])('narrows to one performance %s', (_how, selector) => {
    const { report } = exaggerateMpm(twoPerformances, {
      factors: { tempo: 2 },
      performance: selector,
    });
    expect(report.performances).toHaveLength(1);
    expect(report.performances[0].performance).toEqual({ index: 1, name: 'Second' });
  });

  it('leaves the unselected performance byte-identical', () => {
    const narrowed = exaggerateMpm(twoPerformances, {
      factors: { tempo: 2 },
      performance: 0,
    }).mpm;
    const both = exaggerateMpm(twoPerformances, { factors: { tempo: 2 } }).mpm;
    expect(narrowed).not.toBe(both);
    // The second performance still carries the values it started with.
    expect(narrowed.split('name="Second"')[1]).toBe(
      canonicalMpm(twoPerformances).split('name="Second"')[1],
    );
  });

  it('gesture scope leaves constants and defs alone where global moves them', () => {
    const global = exaggerateMpm(SPANS, { factors: { dynamics: 2 } });
    const gesture = exaggerateMpm(SPANS, { factors: { dynamics: 2 }, scope: 'gesture' });
    expect(gesture.mpm).not.toBe(global.mpm);
    expect(
      gesture.report.performances[0].notes.some((n) => n.kind === 'untouched-in-gesture'),
    ).toBe(true);
  });

  it('a center override replaces the computed center and is echoed in the report', () => {
    const computed = exaggerateMpm(SPANS, { factors: { tempo: 2 } });
    const overridden = exaggerateMpm(SPANS, { factors: { tempo: 2 }, center: { tempo: 90 } });
    expect(computed.report.performances[0].centers.tempo).not.toBe(90);
    expect(overridden.report.performances[0].centers.tempo).toBe(90);
    expect(overridden.mpm).not.toBe(computed.mpm);
  });

  it('a widened velocityRange stops the clamp the default range fires', () => {
    const clamped = exaggerateMpm(SPANS, { factors: { dynamics: 2 } });
    const widened = exaggerateMpm(SPANS, {
      factors: { dynamics: 2 },
      velocityRange: { min: 1, max: 1000 },
    });
    expect(clamped.report.performances[0].dimensions.dynamics.clamps).toBeGreaterThan(0);
    expect(widened.report.performances[0].dimensions.dynamics.clamps).toBe(0);
    expect(widened.mpm).not.toBe(clamped.mpm);
  });

  it('echoes a full fifteen-key appliedFactors, defaulting the absent ones to 1', () => {
    const { report } = exaggerateMpm(SPANS, { factors: { tempo: 1.5 } });
    expect(Object.keys(report.appliedFactors).sort()).toEqual([...EXPRESSION_DIMENSIONS].sort());
    expect(report.appliedFactors.tempo).toBe(1.5);
    expect(report.appliedFactors.rubato).toBe(1);
    // `requestedFactor` keeps the two apart: what the caller asked for is null where the
    // default filled in, which is what lets a consumer diff two samples' intent.
    expect(report.performances[0].dimensions.tempo.requestedFactor).toBe(1.5);
    expect(report.performances[0].dimensions.rubato.requestedFactor).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// The report's reachable-but-surprising states
// ---------------------------------------------------------------------------

describe('report states', () => {
  it("pins 'inert' with sitesSkipped > 0, which is legal and reachable (§4 #9)", () => {
    // Every level in this map is a placeholder that resolves to no def and is not a number, so
    // every site fails the gate AND the center population comes out empty. The site tally says
    // `skipped`; the dimension-level verdict says `inert`, and it wins — reporting a failure
    // where the truthful answer is "this document gives this dimension nothing to work on".
    const placeholders = document(
      performance(
        'P',
        '<dynamicsMap><dynamics date="0.0" volume="+"/><dynamics date="720.0" volume="?"/></dynamicsMap>',
      ),
    );
    const { report } = exaggerateMpm(placeholders, { factors: { dynamics: 2 } });
    const dynamics = report.performances[0].dimensions.dynamics;

    expect(dynamics.state).toBe('inert');
    expect(dynamics.sitesSkipped).toBeGreaterThan(0);
    expect(dynamics.writes).toBe(0);
    expect(report.performances[0].notes.map((note) => note.kind)).toContain('unresolvable-level');
  });

  it('distinguishes absent from inert: a dimension with no sites at all is absent', () => {
    const noDynamics = document(performance('P', TWO_TEMPI));
    const { report } = exaggerateMpm(noDynamics, { factors: uniformFactors(2) });
    expect(report.performances[0].dimensions.dynamics.state).toBe('absent');
    expect(report.performances[0].dimensions.tempo.state).toBe('transformed');
  });

  it('reports a lopsided articulation def as partial, never transformed (D-B)', () => {
    // meico's own `stacc`: `absoluteDurationMs` is excluded because its neutral lives in the
    // MSM, so exaggerating it renders "more staccato" as "softer" and never as "shorter".
    const { report } = exaggerateMpm(reference('articulations', 'mpm'), {
      factors: { articulation: 2 },
    });
    const notes = report.performances[0].notes.filter(
      (note) => note.kind === 'articulation-component-excluded',
    );
    expect(notes.length).toBeGreaterThan(0);
    expect(notes[0].detail).toMatch(/absoluteDurationMs/);
  });
});

// ---------------------------------------------------------------------------
// A10 — the MSM carve-out
// ---------------------------------------------------------------------------

describe('A10: options.msm reaches the report and nothing else (R1 carve-out)', () => {
  const factors = uniformFactors(2);
  const score = allMaps('all_maps', 'msm');

  it('changes not one byte of the transformed document', () => {
    expect(exaggerateMpm(ALL_MAPS, { factors, msm: score }).mpm).toBe(
      exaggerateMpm(ALL_MAPS, { factors }).mpm,
    );
  });

  it('leaves every estimate null when it is omitted', () => {
    const { estimates } = exaggerateMpm(ALL_MAPS, { factors }).report.performances[0];
    expect(estimates.unreachableLevels).toBeNull();
    expect(estimates.articulationCommitCliffs).toBeNull();
    expect(estimates.ornamentSpreadCliffs).toBeNull();
    expect(estimates.imprecisionDurationCliffs).toBeNull();
  });

  it('reads a null msm as absent, not as XML text that failed to parse', () => {
    // Same rule as `performance` next door: `null` means absent throughout this option bag.
    const nulled = exaggerateMpm(ALL_MAPS, { factors, msm: null as unknown as undefined });
    expect(nulled.report.performances[0].estimates.unreachableLevels).toBeNull();
    expect(nulled.mpm).toBe(exaggerateMpm(ALL_MAPS, { factors }).mpm);
  });

  it('counts the notes an unterminated final transition never reaches (§7.4)', () => {
    // `all_maps`'s last <dynamics> carries a `@transition.to`, and `getEndDate` answers
    // MAX_VALUE for the last instruction in a map — so the ramp runs to infinity and its
    // target is scaled but never rendered.
    const { estimates } = exaggerateMpm(ALL_MAPS, { factors, msm: score }).report.performances[0];
    expect(estimates.unreachableLevels).toBeGreaterThan(0);
  });

  it('counts every note when no dynamics map governs the part at all', () => {
    // `tempo.mpm` has a tempoMap and nothing else, so every note gets the renderer's hardcoded
    // 100.0 and no dynamics factor can move any of them.
    const { estimates } = exaggerateMpm(reference('tempo', 'mpm'), {
      factors,
      msm: reference('tempo', 'msm'),
    }).report.performances[0];
    const noteCount = (reference('tempo', 'msm').match(/<note /g) ?? []).length;
    expect(noteCount).toBeGreaterThan(0);
    expect(estimates.unreachableLevels).toBe(noteCount);
  });

  it('counts a tick-domain ornament frame against the shortest note, with no render needed', () => {
    const wideFrame = document(
      performance(
        'P',
        '',
        '<ornamentationStyles><styleDef name="S"><ornamentDef name="roll">' +
          '<temporalSpread frame.start="-100.0" frameLength="200.0"/>' +
          '</ornamentDef></styleDef></ornamentationStyles>',
      ),
    );
    const raw = reference('tempo', 'msm');
    expect(
      exaggerateMpm(wideFrame, { factors: { ornamentSpread: 8 }, msm: raw }).report.performances[0]
        .estimates.ornamentSpreadCliffs,
    ).toBe(1);
    expect(
      exaggerateMpm(wideFrame, { factors: { ornamentSpread: 0.001 }, msm: raw }).report
        .performances[0].estimates.ornamentSpreadCliffs,
    ).toBe(0);
  });

  it('converts the note length onto the FRAME’s tick grid, not the score’s', () => {
    // The two grids are equal in every fixture of this corpus, so this is the only case that
    // can catch the conversion running the wrong way. `tempo.msm`'s shortest note is 720 ticks
    // at ppq 720 — one quarter — which is 360 ticks on a performance declaring ppq 360. A
    // frame of 400 reaches it; inverting the ratio would measure it against 1440 and miss.
    const frame = (ppq: number) =>
      document(
        performance(
          'P',
          '',
          '<ornamentationStyles><styleDef name="S"><ornamentDef name="roll">' +
            '<temporalSpread frame.start="0.0" frameLength="200.0"/>' +
            '</ornamentDef></styleDef></ornamentationStyles>',
          ppq,
        ),
      );
    const cliffs = (ppq: number) =>
      exaggerateMpm(frame(ppq), { factors: { ornamentSpread: 2 }, msm: reference('tempo', 'msm') })
        .report.performances[0].estimates.ornamentSpreadCliffs;

    expect(cliffs(360)).toBe(1);
    expect(cliffs(720)).toBe(0);
  });

  it('falls back to 720 on each side when that side declares no grid', () => {
    // Both fallbacks are 720, and every fixture declares 720 on both sides, so neither
    // constant is observable from the corpus — each is pinned here against a counterpart
    // that declares something else. The frames are chosen so that a fallback of 480 would
    // give the opposite answer in both directions.
    const ornament = (frameLength: string) =>
      '<ornamentationStyles><styleDef name="S"><ornamentDef name="roll">' +
      `<temporalSpread frame.start="0.0" frameLength="${frameLength}"/>` +
      '</ornamentDef></styleDef></ornamentationStyles>';
    const cliffs = (mpm: XmlText, msm: XmlText) =>
      exaggerateMpm(mpm, { factors: { ornamentSpread: 2 }, msm }).report.performances[0].estimates
        .ornamentSpreadCliffs;

    // (a) The PERFORMANCE declares no `@pulsesPerQuarter`. `tempo.msm`'s shortest note is one
    // quarter, so at the 720 fallback it is 720 performance ticks and the 600-tick scaled
    // frame fits; a fallback of 480 would make the note 480 ticks and the frame a cliff.
    const undeclaredPerformance = document(
      `<performance name="P"><global><header>${ornament('300.0')}</header>` +
        `<dated></dated></global></performance>`,
    );
    const declared720 = document(performance('P', '', ornament('300.0'), 720));
    const declared480 = document(performance('P', '', ornament('300.0'), 480));
    expect(cliffs(undeclaredPerformance, reference('tempo', 'msm'))).toBe(0);
    expect(cliffs(undeclaredPerformance, reference('tempo', 'msm'))).toBe(
      cliffs(declared720, reference('tempo', 'msm')),
    );
    expect(cliffs(declared480, reference('tempo', 'msm'))).toBe(1);

    // (b) The MSM declares no `@pulsesPerQuarter` against a 360-ppq performance. At the 720
    // fallback the shortest note is one quarter — 360 performance ticks, which the 400-tick
    // scaled frame overruns; a fallback of 480 would make it 1.5 quarters and no cliff.
    const undeclaredScore = reference('tempo', 'msm').replace(
      ' pulsesPerQuarter="720"',
      '',
    ) as XmlText;
    expect(undeclaredScore).not.toContain('pulsesPerQuarter');
    const perf360 = document(performance('P', '', ornament('200.0'), 360));
    expect(cliffs(perf360, undeclaredScore)).toBe(1);
    expect(cliffs(perf360, undeclaredScore)).toBe(cliffs(perf360, reference('tempo', 'msm')));
  });

  it('answers null — not zero — where the risk is a millisecond one and the MSM is a score', () => {
    // The distinction the field exists to keep: `0` means "sites of this family, none at
    // risk", `null` means "sites of this family whose risk this MSM does not determine". A
    // note's length in milliseconds exists only after a render, and R1 puts a render out of
    // reach, so a raw score cannot answer.
    const millisecondSites = document(
      performance(
        'P',
        '<imprecisionMap.toneduration><distribution.uniform date="0.0" limit.lower="-400.0" limit.upper="400.0"/></imprecisionMap.toneduration>',
        '<articulationStyles><styleDef name="S"><articulationDef name="late" absoluteDelayMs="900.0"/></styleDef></articulationStyles>',
      ),
    );
    const raw = exaggerateMpm(millisecondSites, {
      factors: uniformFactors(2),
      msm: reference('tempo', 'msm'),
    }).report.performances[0].estimates;
    expect(raw.articulationCommitCliffs).toBeNull();
    expect(raw.imprecisionDurationCliffs).toBeNull();

    // The same question against a PERFORMED MSM, which carries `milliseconds.date.end`.
    const performed = performMsm({
      msm: reference('tempo', 'msm'),
      mpm: reference('tempo', 'mpm'),
    });
    const answered = exaggerateMpm(millisecondSites, {
      factors: uniformFactors(2),
      msm: performed,
    }).report.performances[0].estimates;
    expect(answered.articulationCommitCliffs).toBe(1);
    expect(answered.imprecisionDurationCliffs).toBe(1);
  });

  it('answers 0 for a family whose sites are all comfortably inside a note', () => {
    const gentle = document(
      performance(
        'P',
        '<imprecisionMap.toneduration><distribution.uniform date="0.0" limit.lower="-1.0" limit.upper="1.0"/></imprecisionMap.toneduration>',
      ),
    );
    const performed = performMsm({
      msm: reference('tempo', 'msm'),
      mpm: reference('tempo', 'mpm'),
    });
    expect(
      exaggerateMpm(gentle, { factors: { imprecisionDuration: 2 }, msm: performed }).report
        .performances[0].estimates.imprecisionDurationCliffs,
    ).toBe(0);
  });

  it('keeps beatsUnverifiable tied to whether accentuation ran', () => {
    const score = allMaps('metrical_accentuation', 'msm');
    const mpm = allMaps('metrical_accentuation', 'mpm');
    expect(
      exaggerateMpm(mpm, { factors: { accentuation: 2 }, msm: score }).report.performances[0]
        .estimates.beatsUnverifiable,
    ).toBe(true);
    expect(
      exaggerateMpm(mpm, { factors: { tempo: 2 }, msm: score }).report.performances[0].estimates
        .beatsUnverifiable,
    ).toBe(false);
  });
});
