import { describe, it, expect } from 'vitest';
import { Msm } from '../../src/msm/Msm.js';
import { Element, Attribute } from '../../src/xml/XomTypes.js';

const XML_NS = 'http://www.w3.org/XML/1998/namespace';

// ---------------------------------------------------------------------------
// Builders. Everything is assembled programmatically so that the maps contain
// no whitespace text nodes; Helper.getNextSiblingElement() walks raw children,
// so a pretty-printed map would stop the traversal at the first indentation.
// ---------------------------------------------------------------------------

function note(date: number, duration: number, pitch: number, id?: string): Element {
  const n = new Element('note');
  n.addAttribute(new Attribute('date', String(date)));
  n.addAttribute(new Attribute('duration', String(duration)));
  n.addAttribute(new Attribute('midi.pitch', String(pitch)));
  if (id !== undefined) n.addAttribute(new Attribute('xml:id', XML_NS, id));
  return n;
}

function mapOf(name: string, children: Element[]): Element {
  const m = new Element(name);
  for (const c of children) m.appendChild(c);
  return m;
}

/** A score with four quarter notes at 0, 720, 1440 and 2160, ids n1..n4. */
function fourNoteScore(): Element {
  return mapOf('score', [
    note(0, 720, 60, 'n1'),
    note(720, 720, 62, 'n2'),
    note(1440, 720, 64, 'n3'),
    note(2160, 720, 65, 'n4'),
  ]);
}

function gotoElement(atts: Record<string, string>): Element {
  const gt = new Element('goto');
  for (const [name, value] of Object.entries(atts)) gt.addAttribute(new Attribute(name, value));
  return gt;
}

function markerElement(date: number, id: string): Element {
  const m = new Element('marker');
  m.addAttribute(new Attribute('date', String(date)));
  m.addAttribute(new Attribute('xml:id', XML_NS, id));
  return m;
}

function dates(map: Element): number[] {
  const out: number[] = [];
  const es = map.getChildElements();
  for (let i = 0; i < es.size(); ++i) out.push(parseFloat(es.get(i).getAttributeValue('date')!));
  return out;
}

function ids(map: Element): (string | null)[] {
  const out: (string | null)[] = [];
  const es = map.getChildElements();
  for (let i = 0; i < es.size(); ++i) {
    const a = es.get(i).getAttribute('id', XML_NS);
    out.push(a === null ? null : a.getValue());
  }
  return out;
}

describe('Msm.applySequencingMapToMap', () => {
  // ---------------------------------------------------------------
  // Nothing to expand (Msm.java:501-502)
  // ---------------------------------------------------------------
  it('should return null when the sequencingMap has no goto elements', () => {
    const seq = mapOf('sequencingMap', [markerElement(0, 'rptstart1')]);
    const score = fourNoteScore();

    expect(Msm.applySequencingMapToMap(seq, score, new Map())).toBeNull();
  });

  it('should return null for a completely empty sequencingMap', () => {
    expect(
      Msm.applySequencingMapToMap(new Element('sequencingMap'), fourNoteScore(), new Map()),
    ).toBeNull();
  });

  // ---------------------------------------------------------------
  // A single repetition: |: n1 n2 :| n3 n4
  // ---------------------------------------------------------------
  describe('single repetition', () => {
    function expand(seq: Element): {
      newMap: Element;
      repetitionIDs: Map<string, string>;
      score: Element;
    } {
      const score = fourNoteScore();
      const repetitionIDs = new Map<string, string>();
      const newMap = Msm.applySequencingMapToMap(seq, score, repetitionIDs)!;
      return { newMap, repetitionIDs, score };
    }

    it('should repeat the notes before the goto and shift everything after it', () => {
      const seq = mapOf('sequencingMap', [
        markerElement(0, 'rptstart1'),
        gotoElement({ date: '1440', 'target.id': '#rptstart1', activity: '10' }),
      ]);
      const { newMap } = expand(seq);

      expect(dates(newMap)).toEqual([0, 720, 1440, 2160, 2880, 3600]);
    });

    it('should give the repeated copies new ids and leave the originals alone', () => {
      const seq = mapOf('sequencingMap', [
        markerElement(0, 'rptstart1'),
        gotoElement({ date: '1440', 'target.id': '#rptstart1', activity: '10' }),
      ]);
      const { newMap } = expand(seq);

      expect(ids(newMap)).toEqual([
        'n1',
        'n2',
        'meico_repetition_1_n1',
        'meico_repetition_1_n2',
        'n3',
        'n4',
      ]);
    });

    it('should record the original-to-copy id mapping', () => {
      const seq = mapOf('sequencingMap', [
        markerElement(0, 'rptstart1'),
        gotoElement({ date: '1440', 'target.id': '#rptstart1', activity: '10' }),
      ]);
      const { repetitionIDs } = expand(seq);

      expect([...repetitionIDs.entries()].sort()).toEqual([
        ['n1', 'meico_repetition_1_n1'],
        ['n2', 'meico_repetition_1_n2'],
      ]);
    });

    it('should behave the same when the goto uses target.date instead of target.id', () => {
      const seq = mapOf('sequencingMap', [
        gotoElement({ date: '1440', 'target.date': '0', activity: '10' }),
      ]);
      const { newMap } = expand(seq);

      expect(dates(newMap)).toEqual([0, 720, 1440, 2160, 2880, 3600]);
      expect(ids(newMap)).toEqual([
        'n1',
        'n2',
        'meico_repetition_1_n1',
        'meico_repetition_1_n2',
        'n3',
        'n4',
      ]);
    });

    it('should preserve the other note attributes in the copies', () => {
      const seq = mapOf('sequencingMap', [
        gotoElement({ date: '1440', 'target.date': '0', activity: '10' }),
      ]);
      const { newMap } = expand(seq);
      const repeatedFirstNote = newMap.getChildElements().get(2);

      expect(repeatedFirstNote.getAttributeValue('midi.pitch')).toBe('60');
      expect(repeatedFirstNote.getAttributeValue('duration')).toBe('720');
    });

    it('should not modify the original map', () => {
      const seq = mapOf('sequencingMap', [
        gotoElement({ date: '1440', 'target.date': '0', activity: '10' }),
      ]);
      const { score } = expand(seq);

      expect(dates(score)).toEqual([0, 720, 1440, 2160]);
      expect(ids(score)).toEqual(['n1', 'n2', 'n3', 'n4']);
    });

    it('should clean up the repetitionCounter bookkeeping attributes (Msm.java:595-605)', () => {
      const seq = mapOf('sequencingMap', [
        gotoElement({ date: '1440', 'target.date': '0', activity: '10' }),
      ]);
      const { newMap, score } = expand(seq);

      expect(score.query('descendant::*[@repetitionCounter]').size()).toBe(0);
      expect(newMap.query('descendant::*[@repetitionCounter]').size()).toBe(0);
    });

    it('should keep the map element itself, including its name and attributes', () => {
      const score = fourNoteScore();
      score.addAttribute(new Attribute('someAttribute', 'someValue'));
      const seq = mapOf('sequencingMap', [
        gotoElement({ date: '1440', 'target.date': '0', activity: '10' }),
      ]);
      const newMap = Msm.applySequencingMapToMap(seq, score, new Map())!;

      expect(newMap.getLocalName()).toBe('score');
      expect(newMap.getAttributeValue('someAttribute')).toBe('someValue');
    });
  });

  // ---------------------------------------------------------------
  // Two repetitions - exercises the repetitionIDs chaining (Msm.java:546-549)
  // ---------------------------------------------------------------
  describe('double repetition (activity "110")', () => {
    const seq = () =>
      mapOf('sequencingMap', [gotoElement({ date: '1440', 'target.date': '0', activity: '110' })]);

    it('should play the repeated section three times in total', () => {
      const newMap = Msm.applySequencingMapToMap(seq(), fourNoteScore(), new Map())!;
      expect(dates(newMap)).toEqual([0, 720, 1440, 2160, 2880, 3600, 4320, 5040]);
    });

    it('should number the repetition ids by pass', () => {
      const newMap = Msm.applySequencingMapToMap(seq(), fourNoteScore(), new Map())!;
      expect(ids(newMap)).toEqual([
        'n1',
        'n2',
        'meico_repetition_1_n1',
        'meico_repetition_1_n2',
        'meico_repetition_2_n1',
        'meico_repetition_2_n2',
        'n3',
        'n4',
      ]);
    });

    it('should chain the id mapping from each pass to the next, not from the original', () => {
      const repetitionIDs = new Map<string, string>();
      Msm.applySequencingMapToMap(seq(), fourNoteScore(), repetitionIDs);

      expect(repetitionIDs.get('n1')).toBe('meico_repetition_1_n1');
      expect(repetitionIDs.get('meico_repetition_1_n1')).toBe('meico_repetition_2_n1');
      expect(repetitionIDs.get('n2')).toBe('meico_repetition_1_n2');
      expect(repetitionIDs.get('meico_repetition_1_n2')).toBe('meico_repetition_2_n2');
      expect(repetitionIDs.size).toBe(4);
    });
  });

  // ---------------------------------------------------------------
  // activity string semantics
  // ---------------------------------------------------------------
  describe('activity strings', () => {
    it('should ignore a goto that is inactive from the start', () => {
      const seq = mapOf('sequencingMap', [
        gotoElement({ date: '1440', 'target.date': '0', activity: '0' }),
      ]);
      const newMap = Msm.applySequencingMapToMap(seq, fourNoteScore(), new Map())!;

      expect(dates(newMap)).toEqual([0, 720, 1440, 2160]);
      expect(ids(newMap)).toEqual(['n1', 'n2', 'n3', 'n4']);
    });

    it('should take the jump once for the default activity "1"', () => {
      const seq = mapOf('sequencingMap', [gotoElement({ date: '1440', 'target.date': '0' })]);
      const newMap = Msm.applySequencingMapToMap(seq, fourNoteScore(), new Map())!;

      expect(dates(newMap)).toEqual([0, 720, 1440, 2160, 2880, 3600]);
    });
  });

  // ---------------------------------------------------------------
  // date.end handling (Msm.java:530-534)
  // ---------------------------------------------------------------
  it('should shift date.end along with date, preserving the duration', () => {
    const pedal = new Element('pedal');
    pedal.addAttribute(new Attribute('date', '0'));
    pedal.addAttribute(new Attribute('date.end', '1440'));
    const pedalMap = mapOf('pedalMap', [pedal]);

    const seq = mapOf('sequencingMap', [
      gotoElement({ date: '720', 'target.date': '0', activity: '10' }),
    ]);
    const newMap = Msm.applySequencingMapToMap(seq, pedalMap, new Map())!;
    const es = newMap.getChildElements();

    expect(es.size()).toBe(2);
    expect(parseFloat(es.get(0).getAttributeValue('date')!)).toBe(0);
    expect(parseFloat(es.get(0).getAttributeValue('date.end')!)).toBe(1440);
    expect(parseFloat(es.get(1).getAttributeValue('date')!)).toBe(720);
    expect(parseFloat(es.get(1).getAttributeValue('date.end')!)).toBe(2160);
  });

  /*
   * The test above reaches `date.end` only through the TAIL loop — the one that runs after
   * the last goto. With a single repeat, the goto loop copies its one element while
   * `dateOffset` is still 0, so the `+ dateOffset` term in the goto loop's own `date.end`
   * update is invisible there: a control deleting it left all 237 tests green.
   *
   * A repeat taken TWICE reaches it. The second pass copies the element with `dateOffset`
   * already at 720, so the middle copy is the only place in the suite where the goto loop's
   * offset and a `date.end` meet.
   */
  it('shifts date.end inside the goto loop too, once a jump has built up an offset', () => {
    const pedal = new Element('pedal');
    pedal.addAttribute(new Attribute('date', '0'));
    pedal.addAttribute(new Attribute('date.end', '360'));
    const pedalMap = mapOf('pedalMap', [pedal]);

    const seq = mapOf('sequencingMap', [
      gotoElement({ date: '720', 'target.date': '0', activity: '110' }),
    ]);
    const newMap = Msm.applySequencingMapToMap(seq, pedalMap, new Map())!;
    const es = newMap.getChildElements();

    expect(es.size()).toBe(3);
    // pass 1 (goto loop, offset 0), pass 2 (goto loop, offset 720), tail (offset 1440)
    expect(dates(newMap)).toEqual([0, 720, 1440]);
    const ends: number[] = [];
    for (let i = 0; i < es.size(); ++i)
      ends.push(parseFloat(es.get(i).getAttributeValue('date.end')!));
    expect(ends).toEqual([360, 1080, 1800]);
  });

  // ---------------------------------------------------------------
  // elements without ids
  // ---------------------------------------------------------------
  it('should duplicate elements without an xml:id but record no id mapping', () => {
    const score = mapOf('score', [note(0, 720, 60), note(720, 720, 62), note(1440, 720, 64)]);
    const seq = mapOf('sequencingMap', [
      gotoElement({ date: '1440', 'target.date': '0', activity: '10' }),
    ]);
    const repetitionIDs = new Map<string, string>();
    const newMap = Msm.applySequencingMapToMap(seq, score, repetitionIDs)!;

    expect(dates(newMap)).toEqual([0, 720, 1440, 2160, 2880]);
    expect(repetitionIDs.size).toBe(0);
  });

  // ---------------------------------------------------------------
  // multiple gotos (Msm.java:521 - the "goto is before currentDate" guard)
  // ---------------------------------------------------------------
  it('should skip a goto that lies before the current date after a later jump', () => {
    const seq = mapOf('sequencingMap', [
      gotoElement({ date: '720', 'target.date': '0', activity: '10' }),
      gotoElement({ date: '2160', 'target.date': '1440', activity: '10' }),
    ]);
    const newMap = Msm.applySequencingMapToMap(seq, fourNoteScore(), new Map())!;

    // n1 | n1' n2 n3 | n3' n4  - the first goto is not reconsidered after the
    // second jump moved currentDate to 1440.
    expect(dates(newMap)).toEqual([0, 720, 1440, 2160, 2880, 3600]);
    expect(ids(newMap)).toEqual([
      'n1',
      'meico_repetition_1_n1',
      'n2',
      'n3',
      'meico_repetition_1_n3',
      'n4',
    ]);
  });

  // ---------------------------------------------------------------
  // malformed gotos are skipped, not fatal (Msm.java:507-512)
  // ---------------------------------------------------------------
  it('should skip malformed goto elements and still apply the valid ones', () => {
    const seq = mapOf('sequencingMap', [
      gotoElement({ 'target.date': '0' }), // no date -> rejected
      gotoElement({ date: '1440', 'target.date': '0', activity: '10' }), // valid
    ]);
    const newMap = Msm.applySequencingMapToMap(seq, fourNoteScore(), new Map())!;

    expect(dates(newMap)).toEqual([0, 720, 1440, 2160, 2880, 3600]);
  });

  it('should produce an unexpanded copy when every goto is malformed', () => {
    const seq = mapOf('sequencingMap', [gotoElement({ 'target.date': '0' })]);
    const newMap = Msm.applySequencingMapToMap(seq, fourNoteScore(), new Map())!;

    expect(newMap).not.toBeNull();
    expect(dates(newMap)).toEqual([0, 720, 1440, 2160]);
  });

  // ---------------------------------------------------------------
  // a forward jump (da capo / skip) rather than a repetition
  // ---------------------------------------------------------------
  it('should drop the skipped range for a forward jump', () => {
    // jump from 720 forward to 2160, i.e. n2 and n3 are never played
    const seq = mapOf('sequencingMap', [
      gotoElement({ date: '720', 'target.date': '2160', activity: '1' }),
    ]);
    const newMap = Msm.applySequencingMapToMap(seq, fourNoteScore(), new Map())!;

    // dateOffset becomes 720-2160 = -1440, so n4 (at 2160) lands at 720
    expect(dates(newMap)).toEqual([0, 720]);
    expect(ids(newMap)).toEqual(['n1', 'n4']);
  });
});

describe('Msm.resolveSequencingMaps', () => {
  /**
   * Build an MSM with one part. The caller decides which sequencingMaps exist.
   */
  function buildMsm(options: {
    globalGotos?: Element[];
    globalMarkers?: Element[];
    localGotos?: Element[] | null; // null = no local sequencingMap element at all
  }): Msm {
    const msm = Msm.createMsm('Test', 'test-id', 720);
    const globalDated = msm.getGlobal()!.getFirstChildElement('dated')!;

    const globalSeq = globalDated.getFirstChildElement('sequencingMap')!;
    for (const g of options.globalGotos ?? []) globalSeq.appendChild(g);

    // a non-empty global map that must be expanded along with the parts
    const globalMarkerMap = globalDated.getFirstChildElement('markerMap')!;
    for (const m of options.globalMarkers ?? []) globalMarkerMap.appendChild(m);

    // a miscMap with content - it must be left untouched
    const miscMap = globalDated.getFirstChildElement('miscMap')!;
    const misc = new Element('misc');
    misc.addAttribute(new Attribute('date', '0'));
    miscMap.appendChild(misc);

    const part = Msm.makePart('Piano', 1, 0, 0);
    const partDated = part.getFirstChildElement('dated')!;
    const score = partDated.getFirstChildElement('score')!;
    for (const n of fourNoteScore().getChildElements().toArray()) score.appendChild(n);

    const localSeq = partDated.getFirstChildElement('sequencingMap')!;
    if (options.localGotos === null) {
      partDated.removeChild(localSeq);
    } else {
      for (const g of options.localGotos ?? []) localSeq.appendChild(g);
    }

    msm.addPart(part);
    return msm;
  }

  function partScore(msm: Msm): Element {
    return msm.getParts().get(0).getFirstChildElement('dated')!.getFirstChildElement('score')!;
  }

  it('should return an empty mapping for an empty MSM', () => {
    expect(new Msm().resolveSequencingMaps().size).toBe(0);
  });

  it('should expand a part score via the global sequencingMap when the part has none', () => {
    const msm = buildMsm({
      globalGotos: [gotoElement({ date: '1440', 'target.date': '0', activity: '10' })],
      localGotos: null,
    });
    msm.resolveSequencingMaps();

    expect(dates(partScore(msm))).toEqual([0, 720, 1440, 2160, 2880, 3600]);
  });

  it('should expand the global maps themselves', () => {
    const msm = buildMsm({
      globalGotos: [gotoElement({ date: '1440', 'target.date': '0', activity: '10' })],
      globalMarkers: [markerElement(0, 'mA'), markerElement(1440, 'mB')],
      localGotos: null,
    });
    msm.resolveSequencingMaps();

    const markerMap = msm
      .getGlobal()!
      .getFirstChildElement('dated')!
      .getFirstChildElement('markerMap')!;
    expect(dates(markerMap)).toEqual([0, 1440, 2880]);
  });

  it('should leave the miscMap untouched', () => {
    const msm = buildMsm({
      globalGotos: [gotoElement({ date: '1440', 'target.date': '0', activity: '10' })],
      localGotos: null,
    });
    msm.resolveSequencingMaps();

    const miscMap = msm
      .getGlobal()!
      .getFirstChildElement('dated')!
      .getFirstChildElement('miscMap')!;
    expect(dates(miscMap)).toEqual([0]);
  });

  it('should delete the global sequencingMap afterwards', () => {
    const msm = buildMsm({
      globalGotos: [gotoElement({ date: '1440', 'target.date': '0', activity: '10' })],
      localGotos: null,
    });
    msm.resolveSequencingMaps();

    expect(
      msm.getGlobal()!.getFirstChildElement('dated')!.getFirstChildElement('sequencingMap'),
    ).toBeNull();
  });

  it('should delete a local sequencingMap afterwards', () => {
    const msm = buildMsm({
      localGotos: [gotoElement({ date: '1440', 'target.date': '0', activity: '10' })],
    });
    msm.resolveSequencingMaps();

    const partDated = msm.getParts().get(0).getFirstChildElement('dated')!;
    expect(partDated.getFirstChildElement('sequencingMap')).toBeNull();
  });

  it('should let a local sequencingMap override the global one', () => {
    const msm = buildMsm({
      globalGotos: [gotoElement({ date: '1440', 'target.date': '0', activity: '10' })],
      localGotos: [gotoElement({ date: '720', 'target.date': '0', activity: '10' })],
    });
    msm.resolveSequencingMaps();

    // the local goto repeats only the first note: n1 n1' n2 n3 n4
    expect(dates(partScore(msm))).toEqual([0, 720, 1440, 2160, 2880]);
  });

  it('should let an empty local sequencingMap suppress the global one entirely', () => {
    const msm = buildMsm({
      globalGotos: [gotoElement({ date: '1440', 'target.date': '0', activity: '10' })],
      localGotos: [],
    });
    msm.resolveSequencingMaps();

    expect(dates(partScore(msm))).toEqual([0, 720, 1440, 2160]);
  });

  it('should leave a part untouched when neither a local nor a global goto applies', () => {
    const msm = buildMsm({ localGotos: null });
    msm.resolveSequencingMaps();

    expect(dates(partScore(msm))).toEqual([0, 720, 1440, 2160]);
  });

  it('should return the collected repetition id mappings', () => {
    const msm = buildMsm({
      globalGotos: [gotoElement({ date: '1440', 'target.date': '0', activity: '10' })],
      localGotos: null,
    });
    const repetitionIDs = msm.resolveSequencingMaps();

    expect(repetitionIDs.get('n1')).toBe('meico_repetition_1_n1');
    expect(repetitionIDs.get('n2')).toBe('meico_repetition_1_n2');
  });

  it('should expand every part when several parts share the global sequencingMap', () => {
    const msm = buildMsm({
      globalGotos: [gotoElement({ date: '1440', 'target.date': '0', activity: '10' })],
      localGotos: null,
    });

    const second = Msm.makePart('Violin', 2, 1, 0);
    const secondDated = second.getFirstChildElement('dated')!;
    secondDated.removeChild(secondDated.getFirstChildElement('sequencingMap')!);
    const secondScore = secondDated.getFirstChildElement('score')!;
    for (const n of fourNoteScore().getChildElements().toArray()) secondScore.appendChild(n);
    msm.addPart(second);

    msm.resolveSequencingMaps();

    for (let p = 0; p < msm.getParts().size(); ++p) {
      const score = msm
        .getParts()
        .get(p)
        .getFirstChildElement('dated')!
        .getFirstChildElement('score')!;
      expect(dates(score)).toEqual([0, 720, 1440, 2160, 2880, 3600]);
    }
  });
});
