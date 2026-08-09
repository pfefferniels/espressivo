import { describe, it, expect } from 'vitest';
import { Mpm } from '../../src/mpm/Mpm.js';
import { Element, Attribute, Document } from '../../src/xml/XomTypes.js';

describe('Mpm', () => {
  // ---------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------
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

  // ---------------------------------------------------------------
  // Create MPM document
  // ---------------------------------------------------------------
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

  // ---------------------------------------------------------------
  // Constructor variants
  // ---------------------------------------------------------------
  describe('constructors', () => {
    it('should create from default constructor', () => {
      const mpm = new Mpm();
      expect(mpm.isEmpty()).toBe(false);
      expect(mpm.getRootElement()!.getLocalName()).toBe('mpm');
    });
  });

  // ---------------------------------------------------------------
  // isInNamespace
  // ---------------------------------------------------------------
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
      expect(mpm.isInNamespace('note')).toBe(false);
      expect(mpm.isInNamespace('')).toBe(false);
    });

    // These four assertions look wrong and are not. The vocabulary reproduces two typos from
    // the Java reference verbatim — a trailing space in 'accentuation ' (Mpm.java:214) and
    // 'dynamcisGradient' for dynamicsGradient (Mpm.java:218) — because correcting either would
    // accept a name the reference rejects and reject one it accepts. See PARITY.md §3; do not
    // "fix" the vocabulary to make these read better.
    it('should reproduce the two Java typos in the vocabulary, bug-for-bug', () => {
      const mpm = Mpm.createMpm();
      expect(mpm.isInNamespace('accentuation ')).toBe(true);
      expect(mpm.isInNamespace('accentuation')).toBe(false);
      expect(mpm.isInNamespace('dynamcisGradient')).toBe(true);
      expect(mpm.isInNamespace('dynamicsGradient')).toBe(false);
    });
  });

  // ---------------------------------------------------------------
  // addPerformance
  // ---------------------------------------------------------------
  describe('addPerformance', () => {
    it('should add a performance object with getXml', () => {
      const mpm = Mpm.createMpm();

      // Create a mock performance that satisfies the Performance interface
      const perfElement = new Element('performance', Mpm.MPM_NAMESPACE);
      perfElement.addAttribute(new Attribute('name', 'default'));

      const mockPerformance = {
        getName: () => 'default',
        getXml: () => perfElement,
      };

      // addPerformance(performance: Performance) returns boolean
      const result = mpm.addPerformance(mockPerformance as any);
      expect(result).toBe(true);
      expect(mpm.size()).toBe(1);
    });

    it('should access added performance by index', () => {
      const mpm = Mpm.createMpm();

      const perfElement = new Element('performance', Mpm.MPM_NAMESPACE);
      perfElement.addAttribute(new Attribute('name', 'test-perf'));

      const mockPerformance = {
        getName: () => 'test-perf',
        getXml: () => perfElement,
      };

      mpm.addPerformance(mockPerformance as any);
      const retrieved = mpm.getPerformance(0);
      expect(retrieved).not.toBeNull();
      expect(retrieved!.getName()).toBe('test-perf');
    });

    it('should access added performance by name', () => {
      const mpm = Mpm.createMpm();

      const perfElement = new Element('performance', Mpm.MPM_NAMESPACE);
      perfElement.addAttribute(new Attribute('name', 'my-performance'));

      const mockPerformance = {
        getName: () => 'my-performance',
        getXml: () => perfElement,
      };

      mpm.addPerformance(mockPerformance as any);
      const retrieved = mpm.getPerformance('my-performance');
      expect(retrieved).not.toBeNull();
      expect(retrieved!.getName()).toBe('my-performance');
    });

    it('should return null for a performance name that does not exist', () => {
      const mpm = Mpm.createMpm();
      expect(mpm.getPerformance('nonexistent')).toBeNull();
    });

    it('should return null for an out-of-bounds index', () => {
      const mpm = Mpm.createMpm();
      expect(mpm.getPerformance(0)).toBeNull();
      expect(mpm.getPerformance(99)).toBeNull();
    });

    it('should add multiple performances', () => {
      const mpm = Mpm.createMpm();

      for (let i = 0; i < 3; i++) {
        const perfElement = new Element('performance', Mpm.MPM_NAMESPACE);
        perfElement.addAttribute(new Attribute('name', `perf-${i}`));
        mpm.addPerformance({
          getName: () => `perf-${i}`,
          getXml: () => perfElement,
        } as any);
      }

      expect(mpm.size()).toBe(3);
      expect(mpm.getAllPerformances().length).toBe(3);
    });

    it('should reject null performance', () => {
      const mpm = Mpm.createMpm();
      const result = mpm.addPerformance(null as any);
      expect(result).toBe(false);
      expect(mpm.size()).toBe(0);
    });

    it('should append performance XML to the root element', () => {
      const mpm = Mpm.createMpm();

      const perfElement = new Element('performance', Mpm.MPM_NAMESPACE);
      perfElement.addAttribute(new Attribute('name', 'attached'));

      mpm.addPerformance({
        getName: () => 'attached',
        getXml: () => perfElement,
      } as any);

      // The performance element should be a child of the root
      const root = mpm.getRootElement()!;
      const performanceChildren = root.getChildElements('performance');
      expect(performanceChildren.size()).toBe(1);
    });
  });

  // ---------------------------------------------------------------
  // removePerformance
  // ---------------------------------------------------------------
  describe('removePerformance', () => {
    it('should remove a performance by reference', () => {
      const mpm = Mpm.createMpm();

      const perfElement = new Element('performance', Mpm.MPM_NAMESPACE);
      perfElement.addAttribute(new Attribute('name', 'toRemove'));

      const mockPerf = {
        getName: () => 'toRemove',
        getXml: () => perfElement,
      };

      mpm.addPerformance(mockPerf as any);
      expect(mpm.size()).toBe(1);

      mpm.removePerformance(mockPerf as any);
      expect(mpm.size()).toBe(0);
    });

    it('should remove performances by name', () => {
      const mpm = Mpm.createMpm();

      const perfElement = new Element('performance', Mpm.MPM_NAMESPACE);
      perfElement.addAttribute(new Attribute('name', 'removable'));

      mpm.addPerformance({
        getName: () => 'removable',
        getXml: () => perfElement,
      } as any);

      expect(mpm.size()).toBe(1);
      mpm.removePerformance('removable');
      expect(mpm.size()).toBe(0);
    });
  });

  // ---------------------------------------------------------------
  // XML export
  // ---------------------------------------------------------------
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
