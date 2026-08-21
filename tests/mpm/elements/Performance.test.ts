import { describe, it, expect, vi } from 'vitest';
import { errOf, okValue } from '../../support/result.js';
import { Performance } from '../../../src/mpm/elements/Performance.js';
import { Part } from '../../../src/mpm/elements/Part.js';
import { Mpm } from '../../../src/mpm/Mpm.js';
import { Msm } from '../../../src/msm/Msm.js';
import { AsynchronyMap } from '../../../src/mpm/elements/maps/AsynchronyMap.js';
import { ImprecisionMap } from '../../../src/mpm/elements/maps/ImprecisionMap.js';
import { Element, Attribute } from '../../../src/xml/XomTypes.js';

const XML_NS = 'http://www.w3.org/XML/1998/namespace';

/** An MSM with one part, notes at 0 and ppq, ids n1/n2. */
function makeMsm(ppq = 720, partNumber = 1, partName = 'Piano'): Msm {
  const msm = Msm.createMsm('Test', 'msm-id', ppq);
  const part = Msm.makePart(partName, partNumber, 0, 0);
  const score = part.getFirstChildElement('dated')!.getFirstChildElement('score')!;
  for (let i = 0; i < 2; ++i) {
    const n = new Element('note');
    n.addAttribute(new Attribute('xml:id', XML_NS, `n${i + 1}`));
    n.addAttribute(new Attribute('date', String(i * ppq)));
    n.addAttribute(new Attribute('duration', String(ppq)));
    n.addAttribute(new Attribute('midi.pitch', String(60 + i)));
    score.appendChild(n);
  }
  msm.addPart(part);
  return msm;
}

function num(e: Element, name: string): number {
  return parseFloat(e.getAttributeValue(name)!);
}

function scoreNotes(msm: Msm): Element[] {
  const score = msm.getParts().get(0).getFirstChildElement('dated')!.getFirstChildElement('score')!;
  return score.getChildElements('note').toArray();
}

describe('Performance', () => {
  describe('fromName / fromXml', () => {
    it('should create a performance with the given name', () => {
      const p = okValue(Performance.fromName('My Performance'));

      expect(p).not.toBeNull();
      expect(p.getName()).toBe('My Performance');
      expect(p.getXml()!.getLocalName()).toBe('performance');
    });

    it('should default the resolution to 720 pulses per quarter', () => {
      expect(okValue(Performance.fromName('P')).getPulsesPerQuarter()).toBe(720);
    });

    it('should accept an explicit resolution', () => {
      const p = okValue(Performance.fromName('P', 480));

      expect(p.getPPQ()).toBe(480);
      expect(p.getXml()!.getAttributeValue('pulsesPerQuarter')).toBe('480');
    });

    it('should accept an explicit id', () => {
      const p = okValue(Performance.fromName('P', 480, 'perf-1'));
      expect(p.getId()).toBe('perf-1');
    });

    it('should create a global environment', () => {
      const p = okValue(Performance.fromName('P'));

      expect(p.getGlobal()).not.toBeNull();
      expect(p.getXml()!.getFirstChildElement('global')).not.toBeNull();
    });

    it('should start with no parts', () => {
      const p = okValue(Performance.fromName('P'));

      expect(p.size()).toBe(0);
      expect(p.getAllParts()).toEqual([]);
    });

    it('should name the missing attribute when there is no name', () => {
      const xml = new Element('performance', Mpm.MPM_NAMESPACE);
      expect(errOf(Performance.fromXml(xml))).toEqual({
        kind: 'missingAttribute',
        what: 'Performance',
        attribute: 'name',
      });
    });

    it('should name the missing attribute when the name is empty', () => {
      const xml = new Element('performance', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('name', ''));

      expect(errOf(Performance.fromXml(xml))).toEqual({
        kind: 'missingAttribute',
        what: 'Performance',
        attribute: 'name',
      });
    });

    it('should report a null xml element rather than printing it', () => {
      expect(errOf(Performance.fromXml(null))).toEqual({
        kind: 'noElement',
        what: 'Performance',
      });
    });

    it('should adopt the parts of an existing performance element', () => {
      const xml = new Element('performance', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('name', 'P'));
      const partXml = new Element('part', Mpm.MPM_NAMESPACE);
      partXml.addAttribute(new Attribute('name', 'Piano'));
      partXml.addAttribute(new Attribute('number', '1'));
      partXml.addAttribute(new Attribute('midi.channel', '0'));
      partXml.addAttribute(new Attribute('midi.port', '0'));
      xml.appendChild(partXml);

      const p = okValue(Performance.fromXml(xml));

      expect(p.size()).toBe(1);
      expect(p.getAllParts()[0].getName()).toBe('Piano');
    });

    /**
     * `readFrom` promises that `<part>` children which fail to parse are skipped rather than
     * aborting the whole performance. Nothing else pins that: turning the `continue` into an
     * abort leaves the whole `tests/mpm` suite and the integration corpus green, because no
     * fixture contains a malformed `<part>`.
     *
     * Both halves are asserted, because either one alone would still pass an abort: the
     * performance survives, and the parts either side of the bad one are the ones in it.
     */
    it('skips a part it cannot read and keeps the rest of the performance', () => {
      const xml = new Element('performance', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('name', 'P'));
      const part = (attributes: Record<string, string>): Element => {
        const e = new Element('part', Mpm.MPM_NAMESPACE);
        for (const [n, v] of Object.entries(attributes)) e.addAttribute(new Attribute(n, v));
        return e;
      };
      xml.appendChild(part({ name: 'Before', number: '1', 'midi.channel': '0', 'midi.port': '0' }));
      // No `number`: `Part.fromXml` refuses it, and the performance must not go with it.
      xml.appendChild(part({ name: 'Bad', 'midi.channel': '1', 'midi.port': '0' }));
      xml.appendChild(part({ name: 'After', number: '3', 'midi.channel': '2', 'midi.port': '0' }));

      const p = okValue(Performance.fromXml(xml));

      expect(p.size()).toBe(2);
      expect(p.getAllParts().map((q) => q.getName())).toEqual(['Before', 'After']);
      // The skipped part's element stays in the document — it is invisible to the object
      // model, not deleted from the XML.
      expect(p.getXml()!.getChildElements('part').size()).toBe(3);
    });
  });

  describe('name and resolution', () => {
    it('should update the name attribute', () => {
      const p = okValue(Performance.fromName('Old'));
      p.setName('New');

      expect(p.getName()).toBe('New');
      expect(p.getXml()!.getAttributeValue('name')).toBe('New');
    });

    it('should update the resolution attribute via setPPQ', () => {
      const p = okValue(Performance.fromName('P'));
      p.setPPQ(960);

      expect(p.getPPQ()).toBe(960);
      expect(p.getXml()!.getAttributeValue('pulsesPerQuarter')).toBe('960');
    });
  });

  describe('setId / getId', () => {
    it('should be null by default', () => {
      expect(okValue(Performance.fromName('P')).getId()).toBeNull();
    });

    it('should add an xml:id attribute when set for the first time', () => {
      const p = okValue(Performance.fromName('P'));
      p.setId('perf-1');

      expect(p.getId()).toBe('perf-1');
      expect(p.getXml()!.getAttribute('id', XML_NS)!.getValue()).toBe('perf-1');
    });

    it('should overwrite an existing id in place', () => {
      const p = okValue(Performance.fromName('P', 720, 'first'));
      p.setId('second');

      expect(p.getId()).toBe('second');
      expect(p.getXml()!.getAttribute('id', XML_NS)!.getValue()).toBe('second');
    });

    it('should remove the attribute when set to null', () => {
      const p = okValue(Performance.fromName('P', 720, 'perf-1'));
      p.setId(null);

      expect(p.getId()).toBeNull();
      expect(p.getXml()!.getAttribute('id', XML_NS)).toBeNull();
    });

    it('should tolerate setting null when there is no id', () => {
      const p = okValue(Performance.fromName('P'));

      expect(() => p.setId(null)).not.toThrow();
      expect(p.getId()).toBeNull();
    });
  });

  describe('parts', () => {
    function threePartPerformance(): Performance {
      const p = okValue(Performance.fromName('P'));
      p.addPart(okValue(Part.fromValues('Piano', 1, 0, 0)));
      p.addPart(okValue(Part.fromValues('Violin', 2, 1, 0)));
      p.addPart(okValue(Part.fromValues('Cello', 3, 2, 1)));
      return p;
    }

    it('should append parts to the xml and count them', () => {
      const p = threePartPerformance();

      expect(p.size()).toBe(3);
      expect(p.getXml()!.getChildElements('part').size()).toBe(3);
    });

    it('should refuse to add the same part twice', () => {
      const p = okValue(Performance.fromName('P'));
      const part = okValue(Part.fromValues('Piano', 1, 0, 0));

      expect(p.addPart(part)).toBe(true);
      expect(p.addPart(part)).toBe(false);
      expect(p.size()).toBe(1);
    });

    it('should find a part by number', () => {
      expect(threePartPerformance().getPart(2)!.getName()).toBe('Violin');
    });

    it('should find a part by name', () => {
      expect(threePartPerformance().getPartByName('Cello')!.getNumber()).toBe(3);
    });

    it('should find a part by midi channel and port', () => {
      expect(threePartPerformance().getPartByMidi(2, 1)!.getName()).toBe('Cello');
    });

    it('should return null when no part matches', () => {
      const p = threePartPerformance();

      expect(p.getPart(99)).toBeNull();
      expect(p.getPartByName('Tuba')).toBeNull();
      expect(p.getPartByMidi(9, 9)).toBeNull();
    });

    it('should remove a part by number', () => {
      const p = threePartPerformance();
      p.removePartByNumber(2);

      expect(p.size()).toBe(2);
      expect(p.getPart(2)).toBeNull();
      expect(p.getXml()!.getChildElements('part').size()).toBe(2);
    });

    it('should remove a part by name', () => {
      const p = threePartPerformance();
      p.removePartByName('Piano');

      expect(p.size()).toBe(2);
      expect(p.getPartByName('Piano')).toBeNull();
      expect(p.getXml()!.getChildElements('part').size()).toBe(2);
    });

    it('should remove a part by reference', () => {
      const p = threePartPerformance();
      const cello = p.getPartByName('Cello')!;
      p.removePart(cello);

      expect(p.size()).toBe(2);
      expect(p.getPartByName('Cello')).toBeNull();
    });

    it('should ignore removal requests that match nothing', () => {
      const p = threePartPerformance();

      p.removePartByNumber(99);
      p.removePartByName('Tuba');
      p.removePart(okValue(Part.fromValues('Foreign', 9, 9, 9)));

      expect(p.size()).toBe(3);
    });
  });

  describe('getCorrespondingPart', () => {
    it('should match an MSM part by number', () => {
      const p = okValue(Performance.fromName('P'));
      p.addPart(okValue(Part.fromValues('DifferentName', 1, 0, 0)));

      const msmPart = Msm.makePart('Piano', 1, 0, 0);
      expect(p.getCorrespondingPart(msmPart)!.getNumber()).toBe(1);
    });

    it('should fall back to the name when the number does not match', () => {
      const p = okValue(Performance.fromName('P'));
      p.addPart(okValue(Part.fromValues('Piano', 7, 0, 0)));

      const msmPart = Msm.makePart('Piano', 1, 0, 0);
      expect(p.getCorrespondingPart(msmPart)!.getNumber()).toBe(7);
    });

    it('should return null for a null msm part', () => {
      expect(okValue(Performance.fromName('P')).getCorrespondingPart(null)).toBeNull();
    });

    it('should return null when nothing corresponds', () => {
      const p = okValue(Performance.fromName('P'));
      p.addPart(okValue(Part.fromValues('Violin', 2, 1, 0)));

      expect(p.getCorrespondingPart(Msm.makePart('Piano', 1, 0, 0))).toBeNull();
    });
  });

  describe('perform', () => {
    it('should return a clone and leave the original MSM untouched', () => {
      const msm = makeMsm();
      const p = okValue(Performance.fromName('P'));
      p.addPart(okValue(Part.fromValues('Piano', 1, 0, 0)));

      const performed = p.perform(msm);

      expect(performed).not.toBe(msm);
      expect(scoreNotes(msm)[0].getAttribute('milliseconds.date')).toBeNull();
      expect(scoreNotes(performed)[0].getAttribute('milliseconds.date')).not.toBeNull();
    });

    it('should convert the MSM to the performance resolution', () => {
      const msm = makeMsm(360);
      const p = okValue(Performance.fromName('P', 720));
      p.addPart(okValue(Part.fromValues('Piano', 1, 0, 0)));

      const performed = p.perform(msm);

      expect(performed.getPPQ()).toBe(720);
      expect(num(scoreNotes(performed)[1], 'date')).toBe(720);
    });

    it('should give every note a velocity when there is no dynamicsMap', () => {
      const msm = makeMsm();
      const p = okValue(Performance.fromName('P'));
      p.addPart(okValue(Part.fromValues('Piano', 1, 0, 0)));

      for (const note of scoreNotes(p.perform(msm))) expect(num(note, 'velocity')).toBe(100);
    });

    it('should map dates to milliseconds one-to-one when there is no tempoMap', () => {
      const msm = makeMsm(720);
      const p = okValue(Performance.fromName('P', 720));
      p.addPart(okValue(Part.fromValues('Piano', 1, 0, 0)));

      const notes = scoreNotes(p.perform(msm));

      expect(num(notes[0], 'milliseconds.date')).toBe(0);
      expect(num(notes[0], 'milliseconds.date.end')).toBe(720);
      expect(num(notes[1], 'milliseconds.date')).toBe(720);
      expect(num(notes[1], 'milliseconds.date.end')).toBe(1440);
    });

    it('should still perform when no MPM part corresponds to the MSM part', () => {
      const msm = makeMsm();
      const p = okValue(Performance.fromName('P')); // no parts at all

      const notes = scoreNotes(p.perform(msm));

      expect(num(notes[0], 'milliseconds.date')).toBe(0);
      expect(num(notes[0], 'velocity')).toBe(100);
    });

    it('should rename the output file after the performance', () => {
      const msm = makeMsm();
      msm.setFile('/tmp/piece.msm');
      const p = okValue(Performance.fromName('Expressive'));

      expect(p.perform(msm).getFile()).toBe('/tmp/piece_Expressive.msm');
    });

    it('should add performance timing attributes to the global maps', () => {
      const msm = makeMsm();
      const markerMap = msm
        .getGlobal()!
        .getFirstChildElement('dated')!
        .getFirstChildElement('markerMap')!;
      const marker = new Element('marker');
      marker.addAttribute(new Attribute('date', '720'));
      markerMap.appendChild(marker);

      const p = okValue(Performance.fromName('P'));
      const performed = p.perform(msm);

      const performedMarker = performed
        .getGlobal()!
        .getFirstChildElement('dated')!
        .getFirstChildElement('markerMap')!
        .getChildElements('marker')
        .get(0);
      expect(num(performedMarker, 'date.perf')).toBe(720);
      expect(num(performedMarker, 'milliseconds.date')).toBe(720);
    });

    it('should skip an MSM part that has no dated environment', () => {
      const msm = makeMsm();
      const orphan = Msm.makePart('Ghost', 2, 1, 0);
      orphan.removeChild(orphan.getFirstChildElement('dated')!);
      msm.addPart(orphan);

      const p = okValue(Performance.fromName('P'));

      expect(() => p.perform(msm)).not.toThrow();
    });

    // `Performance.renderMillisecondsModifiersToMap`.
    describe('ornament milliseconds offsets', () => {
      /** A performance whose part carries an empty ornamentationMap, so the modifiers run. */
      function performanceWithOrnamentationMap(): Performance {
        const p = okValue(Performance.fromName('P', 720));
        const part = okValue(Part.fromValues('Piano', 1, 0, 0));
        part.getDated()!.addMapByType(Mpm.ORNAMENTATION_MAP);
        p.addPart(part);
        return p;
      }

      // Java parity (OrnamentationMap.java:477-509): without ornament.noteoff.shift the
      // note END does not move — only the onset shifts, altering the effective duration.
      it('should shift milliseconds.date but keep milliseconds.date.end when there is no noteoff shift', () => {
        const msm = makeMsm(720);
        scoreNotes(msm)[1].addAttribute(new Attribute('ornament.milliseconds.date.offset', '-50'));

        const notes = scoreNotes(performanceWithOrnamentationMap().perform(msm));

        expect(num(notes[1], 'milliseconds.date')).toBe(670);
        expect(num(notes[1], 'milliseconds.date.end')).toBe(1440);
      });

      it('should shift milliseconds.date.end along with the onset when ornament.noteoff.shift is set', () => {
        const msm = makeMsm(720);
        const note = scoreNotes(msm)[1];
        note.addAttribute(new Attribute('ornament.milliseconds.date.offset', '-50'));
        note.addAttribute(new Attribute('ornament.noteoff.shift', 'true'));

        const notes = scoreNotes(performanceWithOrnamentationMap().perform(msm));

        expect(num(notes[1], 'milliseconds.date')).toBe(670);
        expect(num(notes[1], 'milliseconds.date.end')).toBe(1390);
      });

      it('should apply an absolute ornament.milliseconds.duration to the note end', () => {
        const msm = makeMsm(720);
        const note = scoreNotes(msm)[1];
        note.addAttribute(new Attribute('ornament.milliseconds.date.offset', '-50'));
        note.addAttribute(new Attribute('ornament.milliseconds.duration', '100'));

        const notes = scoreNotes(performanceWithOrnamentationMap().perform(msm));

        expect(num(notes[1], 'milliseconds.date')).toBe(670);
        expect(num(notes[1], 'milliseconds.date.end')).toBe(770); // date + offset + duration
      });

      it('should leave notes without an ornament offset alone', () => {
        const msm = makeMsm(720);
        scoreNotes(msm)[1].addAttribute(new Attribute('ornament.milliseconds.date.offset', '-50'));

        const notes = scoreNotes(performanceWithOrnamentationMap().perform(msm));

        expect(num(notes[0], 'milliseconds.date')).toBe(0);
        expect(num(notes[0], 'milliseconds.date.end')).toBe(720);
      });

      it('should not apply the offsets when the part has no ornamentationMap', () => {
        const msm = makeMsm(720);
        scoreNotes(msm)[1].addAttribute(new Attribute('ornament.milliseconds.date.offset', '-50'));

        const p = okValue(Performance.fromName('P', 720));
        p.addPart(okValue(Part.fromValues('Piano', 1, 0, 0)));

        expect(num(scoreNotes(p.perform(msm))[1], 'milliseconds.date')).toBe(720);
      });
    });

    // Per Performance.java, the global map applies to every MSM part that has no local
    // ornamentationMap of its own.
    describe('global ornamentationMap', () => {
      it('should perform normally when a global ornamentationMap is present', () => {
        const msm = makeMsm(720);
        const p = okValue(Performance.fromName('P', 720));
        p.getGlobal()!.getDated()!.addMapByType(Mpm.ORNAMENTATION_MAP);
        p.addPart(okValue(Part.fromValues('Piano', 1, 0, 0)));

        const notes = scoreNotes(p.perform(msm));

        expect(num(notes[0], 'milliseconds.date')).toBe(0);
        expect(num(notes[1], 'milliseconds.date')).toBe(720);
      });

      it('should apply the global map to parts that have no local ornamentationMap', () => {
        const msm = makeMsm(720);
        scoreNotes(msm)[1].addAttribute(new Attribute('ornament.milliseconds.date.offset', '-50'));

        const p = okValue(Performance.fromName('P', 720));
        p.getGlobal()!.getDated()!.addMapByType(Mpm.ORNAMENTATION_MAP);
        p.addPart(okValue(Part.fromValues('Piano', 1, 0, 0)));

        expect(num(scoreNotes(p.perform(msm))[1], 'milliseconds.date')).toBe(670);
      });

      it('should exclude parts that bring their own ornamentationMap from the global one', () => {
        // Part 1 has a local ornamentationMap in the MPM and part 2 has not, so only part 2 is
        // handed to the global map — but both end up with a map, so both get their offsets.
        const msm = makeMsm(720);
        const violin = Msm.makePart('Violin', 2, 1, 0);
        const violinScore = violin.getFirstChildElement('dated')!.getFirstChildElement('score')!;
        const violinNote = new Element('note');
        violinNote.addAttribute(new Attribute('xml:id', XML_NS, 'v1'));
        violinNote.addAttribute(new Attribute('date', '720'));
        violinNote.addAttribute(new Attribute('duration', '720'));
        violinNote.addAttribute(new Attribute('midi.pitch', '67'));
        violinNote.addAttribute(new Attribute('ornament.milliseconds.date.offset', '30'));
        violinScore.appendChild(violinNote);
        msm.addPart(violin);

        scoreNotes(msm)[1].addAttribute(new Attribute('ornament.milliseconds.date.offset', '-50'));

        const p = okValue(Performance.fromName('P', 720));
        p.getGlobal()!.getDated()!.addMapByType(Mpm.ORNAMENTATION_MAP);
        const pianoPart = okValue(Part.fromValues('Piano', 1, 0, 0));
        pianoPart.getDated()!.addMapByType(Mpm.ORNAMENTATION_MAP); // local map -> excluded from the global one
        p.addPart(pianoPart);
        p.addPart(okValue(Part.fromValues('Violin', 2, 1, 0)));

        const performed = p.perform(msm);

        const pianoNotes = performed
          .getParts()
          .get(0)
          .getFirstChildElement('dated')!
          .getFirstChildElement('score')!
          .getChildElements('note');
        const violinNotes = performed
          .getParts()
          .get(1)
          .getFirstChildElement('dated')!
          .getFirstChildElement('score')!
          .getChildElements('note');

        expect(num(pianoNotes.get(1), 'milliseconds.date')).toBe(670);
        expect(num(violinNotes.get(0), 'milliseconds.date')).toBe(750);
      });

      it('should tolerate a global ornamentationMap when the performance has no parts', () => {
        const msm = makeMsm(720);
        const p = okValue(Performance.fromName('P', 720));
        p.getGlobal()!.getDated()!.addMapByType(Mpm.ORNAMENTATION_MAP);

        expect(() => p.perform(msm)).not.toThrow();
      });
    });

    /**
     * Six edges of `perform`'s stage order, each found by breaking the order on purpose and
     * watching the suite stay green.
     *
     * The byte-equivalence gate cannot see any of them, for three separate reasons, which is
     * why they are pinned structurally rather than by a fixture:
     *
     * - No fixture in `tests/integration/fixtures/` contains a single `<pedal>` element. Every
     *   pedalMap in the corpus is empty, so both calls of the global millisecond stage and the
     *   first two of the part's are no-ops throughout.
     * - The imprecision fixtures are compared with imprecision-affected attributes filtered
     *   out, deliberately: Java's RNG is not this one's. Every edge whose only effect is on
     *   the order of RNG draws — the cross-part stream ordinal, the order of the four
     *   imprecision domains — is invisible to the reference comparison by construction.
     * - No fixture sets `subNoteDynamics`, so every channelVolumeMap in the corpus has exactly
     *   one entry, at date 0, where rubato is the identity.
     *
     * Each test states an invariant rather than a recorded number, so none has to be
     * regenerated when an unrelated value moves.
     */
    describe('stage order', () => {
      /** `count` parts with identical notes, so any difference between them is not the music. */
      function makeMsmWithParts(count: number, ppq = 720): Msm {
        const msm = Msm.createMsm('Test', 'msm-id', ppq);
        for (let p = 0; p < count; ++p) {
          const part = Msm.makePart(`Part${p + 1}`, p + 1, p, 0);
          const score = part.getFirstChildElement('dated')!.getFirstChildElement('score')!;
          for (let i = 0; i < 4; ++i) {
            const n = new Element('note');
            n.addAttribute(new Attribute('xml:id', XML_NS, `p${p}n${i}`));
            n.addAttribute(new Attribute('date', String(i * ppq)));
            n.addAttribute(new Attribute('duration', String(ppq)));
            n.addAttribute(new Attribute('midi.pitch', '60'));
            score.appendChild(n);
          }
          msm.addPart(part);
        }
        return msm;
      }

      /** Global imprecision maps in the domains named, none seeded, so `options.seed` governs. */
      function performanceWithImprecision(...domains: string[]): Performance {
        const p = okValue(Performance.fromName('P', 720));
        for (const domain of domains) {
          const map = ImprecisionMap.createImprecisionMap(domain)!;
          map.addDistributionUniform(0, -30, 30);
          p.getGlobal()!.getDated()!.addMap(map);
        }
        return p;
      }

      const partNotes = (msm: Msm, part: number): Element[] =>
        msm
          .getParts()
          .get(part)
          .getFirstChildElement('dated')!
          .getFirstChildElement('score')!
          .getChildElements('note')
          .toArray();

      const timings = (msm: Msm, part: number): number[] =>
        partNotes(msm, part).map((n) => num(n, 'milliseconds.date'));

      it('gives two identical parts different imprecision offsets', () => {
        // `ctx.streamOrdinal` counts imprecision CALLS across the whole render, and
        // `deriveSeed(seed, ordinal, impIndex)` folds it into the seed. Reset it per part and
        // the two parts here — same notes, same map — would come out identically shaken.
        const performed = performanceWithImprecision('timing').perform(makeMsmWithParts(2), {
          seed: 7,
        });

        expect(timings(performed, 0)).not.toEqual(timings(performed, 1));
      });

      it('leaves a part unaffected by the parts that come after it', () => {
        // The ordinal a part's imprecision call sees depends on the calls BEFORE it, so
        // rendering the parts in document order makes part 1 independent of part 2's
        // existence. Walk the parts in any other order and this stops being true.
        const alone = performanceWithImprecision('timing').perform(makeMsmWithParts(1), {
          seed: 7,
        });
        const withSecond = performanceWithImprecision('timing').perform(makeMsmWithParts(2), {
          seed: 7,
        });

        expect(timings(withSecond, 0)).toEqual(timings(alone, 0));
      });

      it('renders the same bytes twice for the same seed', () => {
        const render = () =>
          performanceWithImprecision('timing', 'dynamics')
            .perform(makeMsmWithParts(2), { seed: 99 })
            .getRootElement()!
            .toXML();

        expect(render()).toBe(render());
      });

      it('runs the timing imprecision pass before the other three domains', () => {
        // Same argument one level down: the four domains advance the same counter, so if
        // timing is first among them its result cannot depend on whether the other three are
        // there at all. Only `milliseconds.date` is compared, which is the only attribute the
        // timing domain writes — and only the FIRST part, because from the second part on the
        // extra domains of the parts before it have already advanced the counter, which is the
        // same reason the test above renders part 1 alone to compare against.
        const timingOnly = performanceWithImprecision('timing').perform(makeMsmWithParts(2), {
          seed: 7,
        });
        const allFour = performanceWithImprecision(
          'timing',
          'dynamics',
          'toneduration',
          'tuning',
        ).perform(makeMsmWithParts(2), { seed: 7 });

        expect(timings(allFour, 0)).toEqual(timings(timingOnly, 0));
      });

      it('runs the millisecond passes in the reference order', () => {
        // Asynchrony and imprecision are both millisecond-domain shifts, so it would be easy
        // to assume they commute. They do not: an imprecision draw is indexed on the note's
        // millisecond date (`index = msDate / timingBasisMs`), so shifting first changes which
        // value is drawn. The number of calls does not depend on which maps the MSM has —
        // a missing map is passed as null and returns early — so the whole sequence can be
        // pinned rather than one pair of it.
        const msm = makeMsmWithParts(1);
        const globalPedal = msm
          .getGlobal()!
          .getFirstChildElement('dated')!
          .getFirstChildElement('pedalMap')!;
        for (const date of [0, 720]) {
          const pedal = new Element('pedal');
          pedal.addAttribute(new Attribute('date', String(date)));
          globalPedal.appendChild(pedal);
        }

        const p = okValue(Performance.fromName('P', 720));
        const asynchrony = AsynchronyMap.createAsynchronyMap()!;
        asynchrony.addAsynchrony(0, 25);
        p.getGlobal()!.getDated()!.addMap(asynchrony);
        const imprecision = ImprecisionMap.createImprecisionMap('timing')!;
        imprecision.addDistributionUniform(0, -30, 30);
        p.getGlobal()!.getDated()!.addMap(imprecision);

        const asynchronySpy = vi.spyOn(asynchrony, 'renderAsynchronyToMap');
        const imprecisionSpy = vi.spyOn(imprecision, 'renderImprecisionToMap');

        p.perform(msm, { seed: 7 });

        const named = (spy: { mock: { invocationCallOrder: readonly number[] } }, name: string) =>
          spy.mock.invocationCallOrder.map((order) => ({ order, name }));
        const order = [
          ...named(asynchronySpy, 'asynchrony'),
          ...named(imprecisionSpy, 'imprecision'),
        ]
          .sort((a, b) => a.order - b.order)
          .map((call) => call.name);

        expect(order).toEqual([
          'asynchrony', // the global pedalMap
          'imprecision', //  "     "     "
          'asynchrony', // the part's pedalMap
          'imprecision', //  "     "      "
          'asynchrony', // the channelVolumeMap, after its own tempo pass
          'asynchrony', // the positionMap, likewise
          'asynchrony', // the score
          'imprecision', // the score, last of all
        ]);
      });

      it('accentuates a part that has no timeSignatureMap against the global one', () => {
        // The one thing the global scope hands the part scope besides its ornamentation, and
        // the only consumer of it. Every all-maps fixture part carries its own
        // timeSignatureMap, so dropping the fallback entirely leaves the whole suite green.
        const velocities = (numerator: string): number[] => {
          const mpm = new Mpm(accentuationMpm());
          const msm = new Msm(accentuationMsm(numerator));
          return mpm
            .getPerformance(0)!
            .perform(msm)
            .getParts()
            .get(0)
            .getFirstChildElement('dated')!
            .getFirstChildElement('score')!
            .getChildElements('note')
            .toArray()
            .map((n) => num(n, 'velocity'));
        };

        // Same notes, same pattern, different GLOBAL time signature: the beat each note falls
        // on changes, so the accentuation does. Ignore the fallback and both come out alike.
        expect(velocities('4.0')).not.toEqual(velocities('3.0'));
      });

      it('keeps the rubato pass off the channelVolumeMap', () => {
        // The sub-note volume curve is deliberately not in the list rubato and tempo walk —
        // rubato's high-frequency wobble does not belong in a dynamics curve. Put it in the
        // list and these dates move; the score's dates move either way, which is what the
        // second assertion checks the fixture is actually exercising rubato.
        const dates = (withRubato: boolean) => {
          const performed = new Mpm(subNoteDynamicsMpm(withRubato))
            .getPerformance(0)!
            .perform(new Msm(subNoteDynamicsMsm()));
          const dated = performed.getParts().get(0).getFirstChildElement('dated')!;
          const read = (map: string, child: string) =>
            dated
              .getFirstChildElement(map)!
              .getChildElements(child)
              .toArray()
              .map((e) => e.getAttributeValue('date.perf'));
          return { volume: read('channelVolumeMap', 'volume'), score: read('score', 'note') };
        };

        const withRubato = dates(true);
        const withoutRubato = dates(false);

        expect(withRubato.volume.length).toBeGreaterThan(1);
        expect(withRubato.volume).toEqual(withoutRubato.volume);
        expect(withRubato.score).not.toEqual(withoutRubato.score);
      });
    });
  });
});

/** Four notes and a global 4/4 or 3/4, in a part that brings no timeSignatureMap of its own. */
function accentuationMsm(numerator: string): string {
  const notes = [0, 720, 1440, 2160]
    .map((d, i) => `<note xml:id="n${i}" date="${d}.0" midi.pitch="60.0" duration="720.0" />`)
    .join('');
  return (
    '<?xml version="1.0"?><msm title="Accentuation" pulsesPerQuarter="720">' +
    '<global><header /><dated>' +
    `<timeSignatureMap><timeSignature date="0.0" numerator="${numerator}" denominator="4" /></timeSignatureMap>` +
    '<keySignatureMap /><markerMap /><sectionMap /><phraseMap /><sequencingMap /><pedalMap /><miscMap />' +
    '</dated></global>' +
    '<part name="Piano" number="1" midi.channel="0" midi.port="0"><header /><dated>' +
    `<keySignatureMap /><markerMap /><sequencingMap /><pedalMap /><phraseMap /><miscMap /><score>${notes}</score>` +
    '</dated></part></msm>'
  );
}

/** A global metricalAccentuationMap whose pattern sticks to measures, so the meter matters. */
function accentuationMpm(): string {
  return (
    '<?xml version="1.0"?><mpm xmlns="http://www.cemfi.de/mpm/ns/1.0">' +
    '<performance name="accentuation" pulsesPerQuarter="720"><global>' +
    '<header><metricalAccentuationStyles><styleDef name="s">' +
    '<accentuationPatternDef name="p" length="4.0">' +
    '<accentuation beat="1.0" value="20.0" transition.from="0.0" transition.to="1.0" />' +
    '<accentuation beat="2.0" value="-10.0" transition.from="0.0" transition.to="1.0" />' +
    '<accentuation beat="3.0" value="10.0" transition.from="0.0" transition.to="1.0" />' +
    '<accentuation beat="4.0" value="-10.0" transition.from="0.0" transition.to="1.0" />' +
    '</accentuationPatternDef></styleDef></metricalAccentuationStyles></header>' +
    '<dated><metricalAccentuationMap><style date="0.0" name.ref="s" />' +
    '<accentuationPattern date="0.0" name.ref="p" scale="1.0" loop="true" stickToMeasures="true" />' +
    '</metricalAccentuationMap></dated></global>' +
    '<part name="Piano" number="1" midi.channel="0" midi.port="0"><header /><dated /></part>' +
    '</performance></mpm>'
  );
}

/** Eight notes over two bars — long enough for a rubato frame to displace the later ones. */
function subNoteDynamicsMsm(): string {
  const notes = Array.from(
    { length: 8 },
    (_, i) => `<note xml:id="n${i}" date="${i * 720}.0" midi.pitch="60.0" duration="720.0" />`,
  ).join('');
  return (
    '<?xml version="1.0"?><msm title="SubNote" pulsesPerQuarter="720">' +
    '<global><header /><dated><timeSignatureMap /><keySignatureMap /><markerMap /><sectionMap />' +
    '<phraseMap /><sequencingMap /><pedalMap /><miscMap /></dated></global>' +
    '<part name="Piano" number="1" midi.channel="0" midi.port="0"><header /><dated>' +
    `<keySignatureMap /><markerMap /><sequencingMap /><pedalMap /><phraseMap /><miscMap /><score>${notes}</score>` +
    '</dated></part></msm>'
  );
}

/**
 * `subNoteDynamics` on a bounded ramp is what makes `renderDynamicsToMap` emit a volume curve
 * at all — without the flag, or without a following instruction to bound the ramp, the map it
 * returns holds a single entry at date 0, where rubato happens to be the identity.
 */
function subNoteDynamicsMpm(withRubato: boolean): string {
  const rubatoMap = withRubato
    ? '<rubatoMap><rubato date="0.0" frameLength="2880.0" intensity="0.5" lateStart="0.0" earlyEnd="1.0" loop="true" /></rubatoMap>'
    : '';
  return (
    '<?xml version="1.0"?><mpm xmlns="http://www.cemfi.de/mpm/ns/1.0">' +
    `<performance name="subnote" pulsesPerQuarter="720"><global><header /><dated>${rubatoMap}` +
    '<dynamicsMap><dynamics date="0.0" volume="60" transition.to="110" curvature="0.0" protraction="0.0" subNoteDynamics="true" />' +
    '<dynamics date="5040.0" volume="110" /></dynamicsMap>' +
    '</dated></global>' +
    '<part name="Piano" number="1" midi.channel="0" midi.port="0"><header /><dated /></part>' +
    '</performance></mpm>'
  );
}
