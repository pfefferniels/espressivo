import { describe, it, expect } from 'vitest';
import { Performance } from '../../../src/mpm/elements/Performance.js';
import { Part } from '../../../src/mpm/elements/Part.js';
import { Mpm } from '../../../src/mpm/Mpm.js';
import { Msm } from '../../../src/msm/Msm.js';
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
  // ---------------------------------------------------------------
  // creation
  // ---------------------------------------------------------------
  describe('createPerformance', () => {
    it('should create a performance with the given name', () => {
      const p = Performance.createPerformance('My Performance')!;

      expect(p).not.toBeNull();
      expect(p.getName()).toBe('My Performance');
      expect(p.getXml()!.getLocalName()).toBe('performance');
    });

    it('should default the resolution to 720 pulses per quarter', () => {
      expect(Performance.createPerformance('P')!.getPulsesPerQuarter()).toBe(720);
    });

    it('should accept an explicit resolution', () => {
      const p = Performance.createPerformance('P', 480)!;

      expect(p.getPPQ()).toBe(480);
      expect(p.getXml()!.getAttributeValue('pulsesPerQuarter')).toBe('480');
    });

    it('should accept an explicit id', () => {
      const p = Performance.createPerformance('P', 480, 'perf-1')!;
      expect(p.getId()).toBe('perf-1');
    });

    it('should create a global environment', () => {
      const p = Performance.createPerformance('P')!;

      expect(p.getGlobal()).not.toBeNull();
      expect(p.getXml()!.getFirstChildElement('global')).not.toBeNull();
    });

    it('should start with no parts', () => {
      const p = Performance.createPerformance('P')!;

      expect(p.size()).toBe(0);
      expect(p.getAllParts()).toEqual([]);
    });

    it('should return null when the name attribute is missing', () => {
      const xml = new Element('performance', Mpm.MPM_NAMESPACE);
      expect(Performance.createPerformance(xml)).toBeNull();
    });

    it('should return null when the name attribute is empty', () => {
      const xml = new Element('performance', Mpm.MPM_NAMESPACE);
      xml.addAttribute(new Attribute('name', ''));

      expect(Performance.createPerformance(xml)).toBeNull();
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

      const p = Performance.createPerformance(xml)!;

      expect(p.size()).toBe(1);
      expect(p.getAllParts()[0].getName()).toBe('Piano');
    });
  });

  // ---------------------------------------------------------------
  // name and resolution
  // ---------------------------------------------------------------
  describe('name and resolution', () => {
    it('should update the name attribute', () => {
      const p = Performance.createPerformance('Old')!;
      p.setName('New');

      expect(p.getName()).toBe('New');
      expect(p.getXml()!.getAttributeValue('name')).toBe('New');
    });

    it('should update the resolution attribute via setPPQ', () => {
      const p = Performance.createPerformance('P')!;
      p.setPPQ(960);

      expect(p.getPPQ()).toBe(960);
      expect(p.getXml()!.getAttributeValue('pulsesPerQuarter')).toBe('960');
    });
  });

  // ---------------------------------------------------------------
  // id handling (Performance.java setId/getId)
  // ---------------------------------------------------------------
  describe('setId / getId', () => {
    it('should be null by default', () => {
      expect(Performance.createPerformance('P')!.getId()).toBeNull();
    });

    it('should add an xml:id attribute when set for the first time', () => {
      const p = Performance.createPerformance('P')!;
      p.setId('perf-1');

      expect(p.getId()).toBe('perf-1');
      expect(p.getXml()!.getAttribute('id', XML_NS)!.getValue()).toBe('perf-1');
    });

    it('should overwrite an existing id in place', () => {
      const p = Performance.createPerformance('P', 720, 'first')!;
      p.setId('second');

      expect(p.getId()).toBe('second');
      expect(p.getXml()!.getAttribute('id', XML_NS)!.getValue()).toBe('second');
    });

    it('should remove the attribute when set to null', () => {
      const p = Performance.createPerformance('P', 720, 'perf-1')!;
      p.setId(null);

      expect(p.getId()).toBeNull();
      expect(p.getXml()!.getAttribute('id', XML_NS)).toBeNull();
    });

    it('should tolerate setting null when there is no id', () => {
      const p = Performance.createPerformance('P')!;

      expect(() => p.setId(null)).not.toThrow();
      expect(p.getId()).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // parts
  // ---------------------------------------------------------------
  describe('parts', () => {
    function threePartPerformance(): Performance {
      const p = Performance.createPerformance('P')!;
      p.addPart(Part.createPart('Piano', 1, 0, 0)!);
      p.addPart(Part.createPart('Violin', 2, 1, 0)!);
      p.addPart(Part.createPart('Cello', 3, 2, 1)!);
      return p;
    }

    it('should append parts to the xml and count them', () => {
      const p = threePartPerformance();

      expect(p.size()).toBe(3);
      expect(p.getXml()!.getChildElements('part').size()).toBe(3);
    });

    it('should refuse to add the same part twice', () => {
      const p = Performance.createPerformance('P')!;
      const part = Part.createPart('Piano', 1, 0, 0)!;

      expect(p.addPart(part)).toBe(true);
      expect(p.addPart(part)).toBe(false);
      expect(p.size()).toBe(1);
    });

    it('should find a part by number', () => {
      expect(threePartPerformance().getPart(2)!.getName()).toBe('Violin');
    });

    it('should find a part by name', () => {
      expect(threePartPerformance().getPart('Cello')!.getNumber()).toBe(3);
    });

    it('should find a part by midi channel and port', () => {
      expect(threePartPerformance().getPart(2, 1)!.getName()).toBe('Cello');
    });

    it('should return null when no part matches', () => {
      const p = threePartPerformance();

      expect(p.getPart(99)).toBeNull();
      expect(p.getPart('Tuba')).toBeNull();
      expect(p.getPart(9, 9)).toBeNull();
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
      expect(p.getPart('Piano')).toBeNull();
      expect(p.getXml()!.getChildElements('part').size()).toBe(2);
    });

    it('should remove a part by reference', () => {
      const p = threePartPerformance();
      const cello = p.getPart('Cello')!;
      p.removePart(cello);

      expect(p.size()).toBe(2);
      expect(p.getPart('Cello')).toBeNull();
    });

    it('should ignore removal requests that match nothing', () => {
      const p = threePartPerformance();

      p.removePartByNumber(99);
      p.removePartByName('Tuba');
      p.removePart(Part.createPart('Foreign', 9, 9, 9)!);

      expect(p.size()).toBe(3);
    });
  });

  // ---------------------------------------------------------------
  // getCorrespondingPart
  // ---------------------------------------------------------------
  describe('getCorrespondingPart', () => {
    it('should match an MSM part by number', () => {
      const p = Performance.createPerformance('P')!;
      p.addPart(Part.createPart('DifferentName', 1, 0, 0)!);

      const msmPart = Msm.makePart('Piano', 1, 0, 0);
      expect(p.getCorrespondingPart(msmPart)!.getNumber()).toBe(1);
    });

    it('should fall back to the name when the number does not match', () => {
      const p = Performance.createPerformance('P')!;
      p.addPart(Part.createPart('Piano', 7, 0, 0)!);

      const msmPart = Msm.makePart('Piano', 1, 0, 0);
      expect(p.getCorrespondingPart(msmPart)!.getNumber()).toBe(7);
    });

    it('should return null for a null msm part', () => {
      expect(Performance.createPerformance('P')!.getCorrespondingPart(null)).toBeNull();
    });

    it('should return null when nothing corresponds', () => {
      const p = Performance.createPerformance('P')!;
      p.addPart(Part.createPart('Violin', 2, 1, 0)!);

      expect(p.getCorrespondingPart(Msm.makePart('Piano', 1, 0, 0))).toBeNull();
    });
  });

  // ---------------------------------------------------------------
  // perform
  // ---------------------------------------------------------------
  describe('perform', () => {
    it('should return a clone and leave the original MSM untouched', () => {
      const msm = makeMsm();
      const p = Performance.createPerformance('P')!;
      p.addPart(Part.createPart('Piano', 1, 0, 0)!);

      const performed = p.perform(msm);

      expect(performed).not.toBe(msm);
      expect(scoreNotes(msm)[0].getAttribute('milliseconds.date')).toBeNull();
      expect(scoreNotes(performed)[0].getAttribute('milliseconds.date')).not.toBeNull();
    });

    it('should convert the MSM to the performance resolution', () => {
      const msm = makeMsm(360);
      const p = Performance.createPerformance('P', 720)!;
      p.addPart(Part.createPart('Piano', 1, 0, 0)!);

      const performed = p.perform(msm);

      expect(performed.getPPQ()).toBe(720);
      expect(num(scoreNotes(performed)[1], 'date')).toBe(720);
    });

    it('should give every note a velocity when there is no dynamicsMap', () => {
      const msm = makeMsm();
      const p = Performance.createPerformance('P')!;
      p.addPart(Part.createPart('Piano', 1, 0, 0)!);

      for (const note of scoreNotes(p.perform(msm))) expect(num(note, 'velocity')).toBe(100);
    });

    it('should map dates to milliseconds one-to-one when there is no tempoMap', () => {
      const msm = makeMsm(720);
      const p = Performance.createPerformance('P', 720)!;
      p.addPart(Part.createPart('Piano', 1, 0, 0)!);

      const notes = scoreNotes(p.perform(msm));

      expect(num(notes[0], 'milliseconds.date')).toBe(0);
      expect(num(notes[0], 'milliseconds.date.end')).toBe(720);
      expect(num(notes[1], 'milliseconds.date')).toBe(720);
      expect(num(notes[1], 'milliseconds.date.end')).toBe(1440);
    });

    it('should still perform when no MPM part corresponds to the MSM part', () => {
      const msm = makeMsm();
      const p = Performance.createPerformance('P')!; // no parts at all

      const notes = scoreNotes(p.perform(msm));

      expect(num(notes[0], 'milliseconds.date')).toBe(0);
      expect(num(notes[0], 'velocity')).toBe(100);
    });

    it('should rename the output file after the performance', () => {
      const msm = makeMsm();
      msm.setFile('/tmp/piece.msm');
      const p = Performance.createPerformance('Expressive')!;

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

      const p = Performance.createPerformance('P')!;
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

      const p = Performance.createPerformance('P')!;

      expect(() => p.perform(msm)).not.toThrow();
    });

    // -----------------------------------------------------------
    // ornamentation milliseconds modifiers (Performance.renderMillisecondsModifiersToMap)
    // -----------------------------------------------------------
    describe('ornament milliseconds offsets', () => {
      /** A performance whose part carries an (empty) ornamentationMap, so the modifier pass runs. */
      function performanceWithOrnamentationMap(): Performance {
        const p = Performance.createPerformance('P', 720)!;
        const part = Part.createPart('Piano', 1, 0, 0)!;
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

        const p = Performance.createPerformance('P', 720)!;
        p.addPart(Part.createPart('Piano', 1, 0, 0)!);

        expect(num(scoreNotes(p.perform(msm))[1], 'milliseconds.date')).toBe(720);
      });
    });

    // -----------------------------------------------------------
    // global ornamentationMap (Performance.java: the global map applies to
    // every MSM part that has no local ornamentationMap of its own)
    // -----------------------------------------------------------
    describe('global ornamentationMap', () => {
      it('should perform normally when a global ornamentationMap is present', () => {
        const msm = makeMsm(720);
        const p = Performance.createPerformance('P', 720)!;
        p.getGlobal()!.getDated()!.addMapByType(Mpm.ORNAMENTATION_MAP);
        p.addPart(Part.createPart('Piano', 1, 0, 0)!);

        const notes = scoreNotes(p.perform(msm));

        expect(num(notes[0], 'milliseconds.date')).toBe(0);
        expect(num(notes[1], 'milliseconds.date')).toBe(720);
      });

      it('should apply the global map to parts that have no local ornamentationMap', () => {
        const msm = makeMsm(720);
        scoreNotes(msm)[1].addAttribute(new Attribute('ornament.milliseconds.date.offset', '-50'));

        const p = Performance.createPerformance('P', 720)!;
        p.getGlobal()!.getDated()!.addMapByType(Mpm.ORNAMENTATION_MAP);
        p.addPart(Part.createPart('Piano', 1, 0, 0)!);

        // the part falls back to the global ornamentationMap, so the
        // milliseconds modifiers are applied
        expect(num(scoreNotes(p.perform(msm))[1], 'milliseconds.date')).toBe(670);
      });

      it('should exclude parts that bring their own ornamentationMap from the global one', () => {
        // MSM part 1 has a local ornamentationMap in the MPM, part 2 has not.
        // Only part 2 is handed to the global map, but both end up with an
        // ornamentation map, so both get their millisecond offsets applied.
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

        const p = Performance.createPerformance('P', 720)!;
        p.getGlobal()!.getDated()!.addMapByType(Mpm.ORNAMENTATION_MAP);
        const pianoPart = Part.createPart('Piano', 1, 0, 0)!;
        pianoPart.getDated()!.addMapByType(Mpm.ORNAMENTATION_MAP); // local map -> excluded from the global one
        p.addPart(pianoPart);
        p.addPart(Part.createPart('Violin', 2, 1, 0)!);

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
        const p = Performance.createPerformance('P', 720)!;
        p.getGlobal()!.getDated()!.addMapByType(Mpm.ORNAMENTATION_MAP);

        expect(() => p.perform(msm)).not.toThrow();
      });
    });
  });
});
