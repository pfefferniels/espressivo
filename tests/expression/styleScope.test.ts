import { describe, it, expect } from 'vitest';
import { orderedEntries, styleNameAt } from '../../src/expression/datedView.js';
import { parseMpmRoot } from '../../src/expression/mpmDocument.js';
import { readPerformances, type MpmEnvironment } from '../../src/expression/mpmTree.js';
import {
  findStyleDef,
  readDefValue,
  readLevel,
  resolveLevel,
  type LevelReading,
} from '../../src/expression/styleScope.js';
import { Mpm } from '../../src/mpm/Mpm.js';
import { DynamicsMap } from '../../src/mpm/elements/maps/DynamicsMap.js';
import { DynamicsStyle } from '../../src/mpm/elements/styles/DynamicsStyle.js';
import { DYNAMICS_MAP, DYNAMICS_STYLE, TEMPO_STYLE } from '../../src/mpm/names.js';
import { globalEnvironment, partEnvironment, performanceDocument } from './rawFixtures.js';

/** The global environment of the first performance of a hand-built document. */
function globalOf(text: string): MpmEnvironment {
  return readPerformances(parseMpmRoot(text))[0].global;
}

/** Resolve every `<dynamics>` of a map the way the engine's walker would. */
function resolveMap(
  environment: MpmEnvironment,
  globalEnvironment: MpmEnvironment,
  mapName = DYNAMICS_MAP,
): LevelReading[] {
  const entries = orderedEntries(environment.maps.get(mapName)!);
  return entries
    .map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => entry.element.getLocalName() !== 'style')
    .map(({ entry, index }) =>
      resolveLevel(
        entry.element.getAttributeValue('volume')!,
        'dynamics',
        styleNameAt(entries, index),
        environment,
        globalEnvironment,
      ),
    );
}

const MEI_STYLES =
  '<dynamicsStyles><styleDef name="MEI export">' +
  '<dynamicsDef name="f" value="97"/><dynamicsDef name="p" value="48"/>' +
  '</styleDef></dynamicsStyles>';

describe('styleScope', () => {
  describe('positional style scope decides which levels resolve', () => {
    const EQUAL_DATES = performanceDocument(
      globalEnvironment(
        MEI_STYLES,
        '<dynamicsMap><dynamics date="0.0" volume="f"/><style date="0.0" name.ref="MEI export"/>' +
          '<dynamics date="1.0" volume="p"/></dynamicsMap>',
      ),
    );

    it('leaves the instruction before the equal-dated switch unresolvable', () => {
      const global = globalOf(EQUAL_DATES);
      const [before, after] = resolveMap(global, global);
      expect(before.kind).toBe('unresolvable');
      expect(before.value).toBeNaN();
      expect(after).toMatchObject({ kind: 'def', value: 48 });
    });

    it('agrees with the renderer, which reads the same two levels as 100 and 48', () => {
      // The renderer's own numbers, from DynamicsMap.getDynamicsDataOf on a separate parse.
      // 100.0 is DynamicsStyle's unresolvable FALLBACK (DynamicsStyle.ts:55), not a reading
      // of the document, which is why the engine reports NaN there and skips the site
      // instead of exaggerating a level nobody wrote.
      const mpm = new Mpm(EQUAL_DATES);
      const map = mpm
        .getPerformance(0)!
        .getGlobal()!
        .getDated()!
        .getMap(DYNAMICS_MAP) as DynamicsMap;
      const rendered = [0, 2].map((i) => map.getDynamicsDataOf(i)!.volume);
      expect(rendered).toEqual([100, 48]);

      const global = globalOf(EQUAL_DATES);
      const [before, after] = resolveMap(global, global);
      expect(before.kind).toBe('unresolvable');
      expect(after.value).toBe(rendered[1]);
    });
  });

  describe('whole-styleDef shadowing, part over global', () => {
    const SHADOWED = performanceDocument(
      globalEnvironment(
        '<dynamicsStyles><styleDef name="S">' +
          '<dynamicsDef name="f" value="97"/><dynamicsDef name="p" value="48"/>' +
          '</styleDef></dynamicsStyles>',
        '',
      ) +
        partEnvironment(
          '<dynamicsStyles><styleDef name="S"><dynamicsDef name="p" value="10"/></styleDef></dynamicsStyles>',
          '<dynamicsMap><style date="0.0" name.ref="S"/><dynamics date="0.0" volume="p"/>' +
            '<dynamics date="1.0" volume="f"/></dynamicsMap>',
        ),
    );

    it('takes the part styleDef whole — a def missing from it does NOT fall back per-def', () => {
      const performance = readPerformances(parseMpmRoot(SHADOWED))[0];
      const [p, f] = resolveMap(performance.parts[0], performance.global);
      expect(p).toMatchObject({ kind: 'def', value: 10 });
      // The global "S" HAS an f=97; whole-styleDef shadowing means it is unreachable here.
      expect(f.kind).toBe('unresolvable');
    });

    it('agrees with the renderer on both levels', () => {
      const mpm = new Mpm(SHADOWED);
      const map = mpm
        .getPerformance(0)!
        .getAllParts()[0]
        .getDated()!
        .getMap(DYNAMICS_MAP) as DynamicsMap;
      // Index 0 is the <style> switch; the two instructions follow it.
      expect([map.getDynamicsDataOf(1)!.volume, map.getDynamicsDataOf(2)!.volume]).toEqual([
        10, 100,
      ]);
    });

    it('falls back to the global header when the part declares no styleDef of that name', () => {
      const text = performanceDocument(
        globalEnvironment(MEI_STYLES, '') +
          partEnvironment(
            '<dynamicsStyles><styleDef name="other"><dynamicsDef name="p" value="10"/></styleDef></dynamicsStyles>',
            '<dynamicsMap><style date="0.0" name.ref="MEI export"/><dynamics date="0.0" volume="p"/></dynamicsMap>',
          ),
      );
      const performance = readPerformances(parseMpmRoot(text))[0];
      const [p] = resolveMap(performance.parts[0], performance.global);
      expect(p).toMatchObject({ kind: 'def', value: 48 });
      // The site reported is the GLOBAL one — its blast radius is the whole performance.
      expect(p.kind === 'def' && p.environment.scope).toBe('global');
    });

    it('reports a part-local def as a part site', () => {
      const performance = readPerformances(parseMpmRoot(SHADOWED))[0];
      const [p] = resolveMap(performance.parts[0], performance.global);
      expect(p.kind === 'def' && p.environment.scope).toBe('part');
      expect(p.kind === 'def' && p.environment.partIndex).toBe(0);
    });

    it('resolves nothing for an absent or empty style name', () => {
      const global = globalOf(SHADOWED);
      expect(findStyleDef(DYNAMICS_STYLE, null, global, global)).toBeNull();
      expect(findStyleDef(DYNAMICS_STYLE, '', global, global)).toBeNull();
      expect(findStyleDef(DYNAMICS_STYLE, 'nonexistent', global, global)).toBeNull();
      expect(findStyleDef(TEMPO_STYLE, 'S', global, global)).toBeNull();
    });
  });

  describe('def lookup first, then parseFloat', () => {
    const NUMERIC_NAME = performanceDocument(
      globalEnvironment(
        '<tempoStyles><styleDef name="S"><tempoDef name="120" value="60"/></styleDef></tempoStyles>',
        '',
      ),
    );

    it('lets a def named "120" shadow the numeric reading of bpm="120"', () => {
      const global = globalOf(NUMERIC_NAME);
      expect(resolveLevel('120', 'tempo', 'S', global, global)).toMatchObject({
        kind: 'def',
        value: 60,
      });
    });

    it('reads bpm="120bpm" as 120, exactly as parseFloat does', () => {
      const global = globalOf(NUMERIC_NAME);
      expect(resolveLevel('120bpm', 'tempo', 'S', global, global)).toEqual({
        kind: 'literal',
        value: 120,
      });
    });

    it.each(['+', '-', '?', '', 'sfz'])(
      'reports the MEI placeholder %s as unresolvable rather than as the renderer 100.0',
      (placeholder) => {
        const global = globalOf(NUMERIC_NAME);
        const reading = resolveLevel(placeholder, 'tempo', 'S', global, global);
        expect(reading.kind).toBe('unresolvable');
        expect(reading.value).toBeNaN();
      },
    );

    it('agrees with DynamicsStyle.getNumericValueStatic everywhere except the fallback', () => {
      const text = performanceDocument(globalEnvironment(MEI_STYLES, ''));
      const global = globalOf(text);
      const styleDefElement = readPerformances(parseMpmRoot(text))[0]
        .global.styleCollections.get(DYNAMICS_STYLE)!
        .getChildElements('styleDef')
        .get(0);
      const style = DynamicsStyle.createDynamicsStyle(styleDefElement)!;

      for (const level of ['f', 'p', '64', '64.5', '120bpm']) {
        expect(resolveLevel(level, 'dynamics', 'MEI export', global, global).value).toBe(
          style.getNumericValue(level),
        );
      }
      // The one divergence, and it is deliberate: 100.0 is invented, NaN is reported.
      expect(style.getNumericValue('?')).toBe(100);
      expect(resolveLevel('?', 'dynamics', 'MEI export', global, global).value).toBeNaN();
    });
  });

  describe('def validity mirrors the def classes', () => {
    function defsIn(defs: string): MpmEnvironment {
      return globalOf(
        performanceDocument(
          globalEnvironment(
            `<dynamicsStyles><styleDef name="S">${defs}</styleDef></dynamicsStyles>`,
            '',
          ),
        ),
      );
    }

    it('skips a def whose @value Java would reject, falling through to parseFloat', () => {
      const global = defsIn('<dynamicsDef name="f" value="loud"/>');
      expect(resolveLevel('f', 'dynamics', 'S', global, global).kind).toBe('unresolvable');
      // Same def, a level string that IS numeric: the literal path still works.
      expect(resolveLevel('64', 'dynamics', 'S', global, global)).toEqual({
        kind: 'literal',
        value: 64,
      });
    });

    it('skips a def with no @value at all', () => {
      const global = defsIn('<dynamicsDef name="f"/>');
      expect(resolveLevel('f', 'dynamics', 'S', global, global).kind).toBe('unresolvable');
    });

    it('skips a def with no @name', () => {
      const global = defsIn('<dynamicsDef value="97"/>');
      expect(resolveLevel('', 'dynamics', 'S', global, global).kind).toBe('unresolvable');
    });

    it('keeps the LAST of duplicate names, as the name-keyed index does', () => {
      const global = defsIn(
        '<dynamicsDef name="f" value="97"/><dynamicsDef name="f" value="110"/>',
      );
      expect(resolveLevel('f', 'dynamics', 'S', global, global)).toMatchObject({ value: 110 });
    });

    it('does not let an INVALID duplicate displace the valid def before it', () => {
      // parseDefs `continue`s past a rejected def without assigning it (GenericStyle.ts:62-63).
      const global = defsIn(
        '<dynamicsDef name="f" value="97"/><dynamicsDef name="f" value="loud"/>',
      );
      expect(resolveLevel('f', 'dynamics', 'S', global, global)).toMatchObject({ value: 97 });
    });

    it('accepts Java-legal non-finite literals, leaving the gate to reject them', () => {
      const global = defsIn('<dynamicsDef name="f" value="NaN"/>');
      const reading = resolveLevel('f', 'dynamics', 'S', global, global);
      expect(reading.kind).toBe('def');
      expect(reading.value).toBeNaN();
    });

    it('accepts the Java type suffix and rejects hex, like parseJavaDouble', () => {
      const withSuffix = defsIn('<dynamicsDef name="f" value="97.5f"/>');
      expect(resolveLevel('f', 'dynamics', 'S', withSuffix, withSuffix)).toMatchObject({
        kind: 'def',
        value: 97.5,
      });
      const hex = defsIn('<dynamicsDef name="f" value="0x10"/>');
      expect(resolveLevel('f', 'dynamics', 'S', hex, hex).kind).toBe('unresolvable');
    });
  });

  describe('readDefValue / readLevel without a style', () => {
    it('reads nothing when no style is in scope, whatever the string looks like', () => {
      expect(readLevel('f', null, 'dynamics').kind).toBe('unresolvable');
      expect(readLevel('64', null, 'dynamics')).toEqual({ kind: 'literal', value: 64 });
    });

    it('returns null for a def the class would have dropped', () => {
      const global = globalOf(
        performanceDocument(
          globalEnvironment(
            '<dynamicsStyles><styleDef name="S"><dynamicsDef name="f" value="loud"/></styleDef></dynamicsStyles>',
            '',
          ),
        ),
      );
      const def = global.styleCollections
        .get(DYNAMICS_STYLE)!
        .getChildElements('styleDef')
        .get(0)
        .getChildElements('dynamicsDef')
        .get(0);
      expect(readDefValue(def)).toBeNull();
    });
  });
});
