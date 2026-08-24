import { describe, it, expect } from 'vitest';
import { silenceConsoleError } from '../support/console.js';
import { okValue } from '../support/result.js';
import { Mpm } from '../../src/mpm/Mpm.js';
import { Performance } from '../../src/mpm/elements/Performance.js';

/** A real {@link Performance}: a `<performance name="…">` with the `<global>` child. */
function performance(name: string): Performance {
  return okValue(Performance.fromName(name));
}

describe('Mpm', () => {
  describe('constants', () => {
    it('should define MPM_NAMESPACE', () => {
      expect(Mpm.MPM_NAMESPACE).toBe('http://www.cemfi.de/mpm/ns/1.0');
    });

    it('should define style type constants', () => {
      expect(Mpm.ARTICULATION_STYLE).toBe('articulationStyles');
      expect(Mpm.ORNAMENTATION_STYLE).toBe('ornamentationStyles');
      expect(Mpm.DYNAMICS_STYLE).toBe('dynamicsStyles');
      expect(Mpm.METRICAL_ACCENTUATION_STYLE).toBe('metricalAccentuationStyles');
      expect(Mpm.TEMPO_STYLE).toBe('tempoStyles');
      expect(Mpm.RUBATO_STYLE).toBe('rubatoStyles');
    });

    it('should define map type constants', () => {
      expect(Mpm.ARTICULATION_MAP).toBe('articulationMap');
      expect(Mpm.ORNAMENTATION_MAP).toBe('ornamentationMap');
      expect(Mpm.DYNAMICS_MAP).toBe('dynamicsMap');
      expect(Mpm.MOVEMENT_MAP).toBe('movementMap');
      expect(Mpm.METRICAL_ACCENTUATION_MAP).toBe('metricalAccentuationMap');
      expect(Mpm.TEMPO_MAP).toBe('tempoMap');
      expect(Mpm.RUBATO_MAP).toBe('rubatoMap');
      expect(Mpm.ASYNCHRONY_MAP).toBe('asynchronyMap');
      expect(Mpm.IMPRECISION_MAP).toBe('imprecisionMap');
    });

    it('should define imprecision map sub-type constants', () => {
      expect(Mpm.IMPRECISION_MAP_TIMING).toBe('imprecisionMap.timing');
      expect(Mpm.IMPRECISION_MAP_DYNAMICS).toBe('imprecisionMap.dynamics');
      expect(Mpm.IMPRECISION_MAP_TONEDURATION).toBe('imprecisionMap.toneduration');
      expect(Mpm.IMPRECISION_MAP_TUNING).toBe('imprecisionMap.tuning');
    });
  });

  describe('createMpm', () => {
    it('should create an empty MPM object', () => {
      const mpm = Mpm.createMpm();
      expect(mpm).toBeDefined();
      expect(mpm).not.toBeNull();
    });

    it('should not be empty (has root element)', () => {
      const mpm = Mpm.createMpm();
      expect(mpm.isEmpty()).toBe(false);
    });

    it('should have a root element named "mpm"', () => {
      const mpm = Mpm.createMpm();
      expect(mpm.getRootElement()).not.toBeNull();
      expect(mpm.getRootElement()!.getLocalName()).toBe('mpm');
    });

    it('should have the MPM namespace on the root element', () => {
      const mpm = Mpm.createMpm();
      expect(mpm.getRootElement()!.getNamespaceURI()).toBe(Mpm.MPM_NAMESPACE);
    });

    it('should start with zero performances', () => {
      const mpm = Mpm.createMpm();
      expect(mpm.size()).toBe(0);
    });

    it('should have null metadata initially', () => {
      const mpm = Mpm.createMpm();
      expect(mpm.getMetadata()).toBeNull();
    });
  });

  describe('constructors', () => {
    it('should create from default constructor', () => {
      const mpm = new Mpm();
      expect(mpm.isEmpty()).toBe(false);
      expect(mpm.getRootElement()!.getLocalName()).toBe('mpm');
    });
  });

  describe('isInNamespace', () => {
    it('should recognize MPM element names', () => {
      const mpm = Mpm.createMpm();
      expect(mpm.isInNamespace('mpm')).toBe(true);
      expect(mpm.isInNamespace('performance')).toBe(true);
      expect(mpm.isInNamespace('global')).toBe(true);
      expect(mpm.isInNamespace('part')).toBe(true);
      expect(mpm.isInNamespace('header')).toBe(true);
      expect(mpm.isInNamespace('dated')).toBe(true);
      expect(mpm.isInNamespace('tempoMap')).toBe(true);
      expect(mpm.isInNamespace('dynamicsMap')).toBe(true);
      expect(mpm.isInNamespace('tempo')).toBe(true);
      expect(mpm.isInNamespace('dynamics')).toBe(true);
    });

    it('should reject non-MPM element names', () => {
      const mpm = Mpm.createMpm();
      expect(mpm.isInNamespace('nonExistentElement')).toBe(false);
      expect(mpm.isInNamespace('div')).toBe(false);
      expect(mpm.isInNamespace('score')).toBe(false);
      expect(mpm.isInNamespace('')).toBe(false);
    });

    // MPM v3 gives an `<ornament>` a pool of `<note>` children (PARITY.md §6.2 D1, spec
    // `note.xml`), so `note` is MPM vocabulary. `score` above stays MSM-only.
    it('should recognize the MPM v3 ornament pool note', () => {
      const mpm = Mpm.createMpm();
      expect(mpm.isInNamespace('note')).toBe(true);
    });

    // Two names in the Java vocabulary are typos: a trailing space in 'accentuation '
    // (Mpm.java:214) and 'dynamcisGradient' for dynamicsGradient (Mpm.java:218). This
    // vocabulary accepts the corrections and keeps accepting the misspellings, making it a
    // superset of the reference's: dropping either misspelling would reject a name a
    // Java-written MPM may legitimately carry. See PARITY.md, "Fixed bugs".
    it('accepts the corrected spellings and keeps accepting the two Java typos', () => {
      const mpm = Mpm.createMpm();
      expect(mpm.isInNamespace('accentuation ')).toBe(true);
      expect(mpm.isInNamespace('accentuation')).toBe(true);
      expect(mpm.isInNamespace('dynamcisGradient')).toBe(true);
      expect(mpm.isInNamespace('dynamicsGradient')).toBe(true);
    });

    it('still rejects near-misses of the two corrected names', () => {
      const mpm = Mpm.createMpm();
      expect(mpm.isInNamespace('accentuation  ')).toBe(false);
      expect(mpm.isInNamespace(' accentuation')).toBe(false);
      expect(mpm.isInNamespace('dynamicsGradiant')).toBe(false);
      expect(mpm.isInNamespace('dynamcisGradients')).toBe(false);
    });
  });

  describe('addPerformance', () => {
    it('should add a performance object with getXml', () => {
      const mpm = Mpm.createMpm();
      mpm.addPerformance(performance('default'));
      expect(mpm.size()).toBe(1);
    });

    it('should access added performance by index', () => {
      const mpm = Mpm.createMpm();
      mpm.addPerformance(performance('test-perf'));
      const retrieved = mpm.getPerformance(0);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.getName()).toBe('test-perf');
    });

    it('should access added performance by name', () => {
      const mpm = Mpm.createMpm();
      mpm.addPerformance(performance('my-performance'));
      const retrieved = mpm.getPerformanceByName('my-performance');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.getName()).toBe('my-performance');
    });

    it('should return null for a performance name that does not exist', () => {
      const mpm = Mpm.createMpm();
      expect(mpm.getPerformanceByName('nonexistent')).toBeNull();
    });

    it('should return null for an out-of-bounds index', () => {
      const mpm = Mpm.createMpm();
      expect(mpm.getPerformance(0)).toBeNull();
      expect(mpm.getPerformance(99)).toBeNull();
    });

    it('should add multiple performances', () => {
      const mpm = Mpm.createMpm();
      for (let i = 0; i < 3; i++) mpm.addPerformance(performance(`perf-${i}`));

      expect(mpm.size()).toBe(3);
      expect(mpm.getAllPerformances().length).toBe(3);
    });

    it('should append performance XML to the root element', () => {
      const mpm = Mpm.createMpm();
      mpm.addPerformance(performance('attached'));

      const root = mpm.getRootElement()!;
      const performanceChildren = root.getChildElements('performance');
      expect(performanceChildren.size()).toBe(1);
      expect(performanceChildren.get(0).getAttributeValue('name')).toBe('attached');
    });
  });

  describe('removePerformance', () => {
    it('should remove a performance by reference', () => {
      const mpm = Mpm.createMpm();
      const perf = performance('toRemove');

      mpm.addPerformance(perf);
      expect(mpm.size()).toBe(1);

      mpm.removePerformance(perf);
      expect(mpm.size()).toBe(0);
      expect(mpm.getRootElement()!.getChildElements('performance').size()).toBe(0);
    });

    it('should remove performances by name', () => {
      const mpm = Mpm.createMpm();
      mpm.addPerformance(performance('removable'));

      expect(mpm.size()).toBe(1);
      mpm.removePerformanceByName('removable');
      expect(mpm.size()).toBe(0);
      expect(mpm.getRootElement()!.getChildElements('performance').size()).toBe(0);
    });
  });

  describe('parseData', () => {
    /**
     * `getPerformance(index)` answers by position into the list `parseData` builds, so parse
     * order is what indexes the whole `getPerformance` / `getAllPerformances` surface.
     * Reversing that list leaves every other test in `tests/mpm` green; the only thing in
     * the tree that notices is `tests/comparison/fixtures.test.ts`, from another suite and
     * for another reason.
     */
    it('keeps the performances in document order, which is what indexes them', () => {
      const mpm = new Mpm(
        `<?xml version="1.0" encoding="UTF-8"?>` +
          `<mpm xmlns="${Mpm.MPM_NAMESPACE}">` +
          `<performance name="zulu" pulsesPerQuarter="720"/>` +
          `<performance name="alpha" pulsesPerQuarter="720"/>` +
          `<performance name="mike" pulsesPerQuarter="720"/>` +
          `</mpm>`,
      );

      expect(mpm.size()).toBe(3);
      expect(mpm.getAllPerformances().map((p) => p.getName())).toEqual(['zulu', 'alpha', 'mike']);
      expect(mpm.getPerformance(0)?.getName()).toBe('zulu');
      expect(mpm.getPerformance(1)?.getName()).toBe('alpha');
      expect(mpm.getPerformance(2)?.getName()).toBe('mike');
    });

    /**
     * `XmlBase.parseXmlString` reads as though a bad string yields an empty document: it
     * catches `ParsingException`, prints it and stores null. That catch is dead.
     * `@xmldom/xmldom` throws its own `ParseError` from inside `DOMParser.parseFromString`,
     * so `Builder.build` never reaches either of its `throw new ParsingException` lines and
     * the error travels straight out of the constructor.
     *
     * Java throws too — `Mpm(String xml)` declares `throws ParsingException` — so the port
     * agrees with the reference on this input, in a different exception type.
     */
    it.each([
      ['an unclosed tag', '<mpm><performance name="a"'],
      ['prose', 'not xml at all'],
      ['the empty string', ''],
      ['a bare declaration', '<?xml version="1.0" encoding="UTF-8"?>'],
    ])('throws rather than building an empty document from %s', (_what, source) => {
      const err = silenceConsoleError();
      expect(() => new Mpm(source)).toThrow();
      err.mockRestore();
    });

    /**
     * The constructor arm only an untyped (plain-JS) caller can reach; the cast simulates
     * such a caller rather than defeating the compiler for typed code. The body tests
     * `instanceof Document || typeof === 'string'`, not `=== undefined` — testing for
     * undefined would send this caller down the parse path and leave it with no document.
     */
    it('gives an untyped caller passing something else the empty document, not a null one', () => {
      const mpm = new Mpm(42 as unknown as string);
      expect(mpm.isEmpty()).toBe(false);
      expect(mpm.getRootElement()!.getLocalName()).toBe('mpm');
      expect(mpm.size()).toBe(0);
    });
  });

  describe('writeMpm', () => {
    it('should produce a valid XML string', () => {
      const mpm = Mpm.createMpm();
      const xml = mpm.writeMpm();
      expect(xml).not.toBeNull();
      expect(xml!).toContain('<mpm');
      expect(xml!).toContain(Mpm.MPM_NAMESPACE);
    });
  });
});
