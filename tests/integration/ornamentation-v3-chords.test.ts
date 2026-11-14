/**
 * A v3 `temporalSpread` over score notes performs what its v2 twin performs.
 *
 * Each case renders two chords twice: once with a v2 frame and no `noteid`, once with the same
 * numbers as a v3 frame, with or without `noteid`, and compares every performed note.
 */
import { describe, it, expect } from 'vitest';
import { performMsm } from '../../src/api/pipeline.js';

const chord = (prefix: string, date: number, notes: readonly (readonly [number, number])[]) =>
  notes
    .map(
      ([pitch, duration], i) =>
        `<note xml:id="${prefix}${String(i + 1)}" date="${String(date)}" duration="${String(duration)}" midi.pitch="${String(pitch)}"/>`,
    )
    .join('');

const MSM = `<msm title="t" pulsesPerQuarter="720"><global><header/><dated/></global>
<part name="p" number="1" midi.channel="0" midi.port="0"><header/><dated><score>
${chord('a', 1440, [
  [48, 720],
  [55, 1440],
  [64, 360],
])}
<note xml:id="mid" date="2160" duration="720" midi.pitch="70"/>
${chord('b', 2880, [
  [50, 1440],
  [57, 1440],
  [62, 1440],
  [66, 720],
])}
</score></dated></part></msm>`;

interface Frame {
  readonly start: number;
  readonly length: number;
  readonly unit: 'ticks' | 'ms';
  readonly shift: 'false' | 'true' | 'monophonic';
}

const v2Spread = ({ start, length, unit, shift }: Frame) =>
  `<temporalSpread frame.start="${String(start)}" frameLength="${String(length)}"${unit === 'ms' ? ' time.unit="milliseconds"' : ''} intensity="0.4" noteoff.shift="${shift}"/>`;

const v3Spread = ({ start, length, unit, shift }: Frame) =>
  `<temporalSpread frame.offset="${String(start)}${unit}" frameLength="${String(length)}${unit}" intensity="0.4" noteoff.shift="${shift}"/>`;

const ORDERS = {
  'id list': (ids: readonly string[]) => ids.map((id) => `#${id}`).join(' '),
  'reversed id list': (ids: readonly string[]) =>
    [...ids]
      .reverse()
      .map((id) => `#${id}`)
      .join(' '),
  'ascending pitch': () => 'ascending pitch',
  'descending pitch': () => 'descending pitch',
} as const;

const CHORDS = [
  { date: 1440, ids: ['a1', 'a2', 'a3'] },
  { date: 2880, ids: ['b1', 'b2', 'b3', 'b4'] },
] as const;

const mpm = (spread: string, ornaments: string) => `<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0">
<performance name="p" pulsesPerQuarter="720"><global><header><ornamentationStyles><styleDef name="s">
<ornamentDef name="arp"><dynamicsGradient transition.from="-1" transition.to="0.5"/>${spread}</ornamentDef>
</styleDef></ornamentationStyles></header><dated>
<tempoMap><tempo date="0" bpm="90" beatLength="0.25" transition.to="70"/><tempo date="2880" bpm="70" beatLength="0.25"/></tempoMap>
<ornamentationMap><style date="0" name.ref="s"/>${ornaments}</ornamentationMap>
</dated></global>
<part name="p" number="1" midi.channel="0" midi.port="0"><header/><dated><dynamicsMap><dynamics date="0" volume="80"/></dynamicsMap></dated></part>
</performance></mpm>`;

const ornaments = (order: (ids: readonly string[]) => string, withNoteid: boolean) =>
  CHORDS.map(({ date, ids }) => {
    const noteid = withNoteid ? ` noteid="#${ids[1] ?? ''}"` : '';
    return `<ornament date="${String(date)}" name.ref="arp" scale="20"${noteid} note.order="${order(ids)}"/>`;
  }).join('');

/** Every note tag of the performed MSM, sorted by id. */
const performedNotes = (spread: string, ornamentXml: string): string[] =>
  [...performMsm({ msm: MSM, mpm: mpm(spread, ornamentXml) }).matchAll(/<note\b[^>]*>/g)]
    .map((match) => match[0])
    .sort();

const FRAMES: readonly Frame[] = (['ticks', 'ms'] as const).flatMap((unit) =>
  (['false', 'true', 'monophonic'] as const).flatMap((shift) => [
    { start: -60, length: 120, unit, shift },
    { start: 0, length: 90, unit, shift },
  ]),
);

describe('a v3 frame over score notes performs as its v2 twin', () => {
  for (const [orderName, order] of Object.entries(ORDERS))
    for (const withNoteid of [false, true])
      it(`${orderName}, ${withNoteid ? 'with' : 'without'} noteid`, () => {
        for (const frame of FRAMES) {
          const v2 = performedNotes(v2Spread(frame), ornaments(order, false));
          const v3 = performedNotes(v3Spread(frame), ornaments(order, withNoteid));
          expect(v3, JSON.stringify(frame)).toEqual(v2);
        }
      });
});
