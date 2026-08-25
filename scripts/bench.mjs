/**
 * Rendering benchmark, with a superlinearity detector — the net under a rendering path whose
 * linearity was won back once and can be handed away again one allocation at a time.
 *
 * The per-fixture wall times are the coarse signal. The real one is microseconds per note
 * across four sizes: a linear stage holds that roughly flat, and anything quadratic shows up
 * as a rising column long before it becomes a timeout. Convert and render are timed apart, or
 * one stage's curve hides inside the total. Current figures are in `bench-baseline.json`.
 *
 * The "residual nonlinearity" once recorded here (4000 → 32 000 notes, 3.1x for 2x the notes)
 * did not survive re-measurement: it was read off the synthetic block back when that block took
 * one sample per size rather than a median (fixed by 38f3886, one commit later), and a single
 * sample's drift ratio is exactly the noise 38f3886's own commit message caught red-handed — the
 * same code reporting "x2.7 SUPERLINEAR" and "x1.2 linear enough" ten minutes apart. Re-run at
 * 4000/8000/16000/32000 under the current median-of-`REPEATS` methodology: x1.0, both stages,
 * `descendantElements`'s own call/visit counts scale exactly linearly with note count too. No
 * open nonlinearity is known on this path.
 *
 *   node scripts/bench.mjs                 measure and print
 *   node scripts/bench.mjs --save          write scripts/bench-baseline.json
 *   node scripts/bench.mjs --check         compare against the baseline, exit 1 on regression
 *
 * Timing is not a unit test and deliberately does not run in `vitest`, where a loaded CI box
 * would make it flap. `--check` is for running by hand either side of a change.
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MEI_DIR = join(ROOT, 'tests/integration/fixtures/mei');
const BASELINE = join(ROOT, 'scripts/bench-baseline.json');

/** How much slower than baseline is tolerated before --check fails. */
const TOLERANCE = 1.25;
/** Repeats per measurement; the median is reported, which is stabler than a mean under GC. */
const REPEATS = 3;
// Kept small: the largest sizes dominate the run time.
const SYNTHETIC_SIZES = [250, 500, 1000, 2000];

const api = await import(join(ROOT, 'dist/api/index.js'));

/** The library logs to the console on every conversion; a benchmark must not pay for that. */
function silenced(f) {
  const { log, error, warn } = console;
  const discard = () => undefined;
  console.log = discard;
  console.error = discard;
  console.warn = discard;
  try {
    return f();
  } finally {
    Object.assign(console, { log, error, warn });
  }
}

function median(xs) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function timeMs(f, repeats = REPEATS) {
  const runs = [];
  for (let i = 0; i < repeats; ++i) {
    const t0 = process.hrtime.bigint();
    f();
    runs.push(Number(process.hrtime.bigint() - t0) / 1e6);
  }
  return median(runs);
}

/** MEI text with `notes` quarter notes, four to a measure, one staff. */
function syntheticMei(notes) {
  const pitches = ['c', 'd', 'e', 'f', 'g', 'a', 'b'];
  const measures = [];
  for (let m = 0; m * 4 < notes; ++m) {
    const inMeasure = Math.min(4, notes - m * 4);
    const noteTags = [];
    for (let i = 0; i < inMeasure; ++i) {
      const n = m * 4 + i;
      noteTags.push(`<note xml:id="n${n}" pname="${pitches[n % 7]}" oct="4" dur="4"/>`);
    }
    measures.push(
      `<measure n="${m + 1}" xml:id="m${m}"><staff n="1"><layer n="1">${noteTags.join('')}</layer></staff></measure>`,
    );
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="5.0" xml:id="mei-bench">
<meiHead><fileDesc><titleStmt><title>bench</title></titleStmt><pubStmt/></fileDesc></meiHead>
<music><body><mdiv xml:id="mdiv1"><score>
<scoreDef><staffGrp><staffDef n="1" lines="5" clef.shape="G" clef.line="2" key.sig="0" meter.count="4" meter.unit="4"/></staffGrp></scoreDef>
<section xml:id="section1">${measures.join('')}</section>
</score></mdiv></body></music></mei>`;
}

/**
 * The MPM every fixture is performed with. Conversion mints none, and `renderExpressiveMidi`
 * throws on an MSM that was never performed, so the bench brings its own. It sits in `<global>`,
 * so it reaches every part of every fixture, and it is flat, so the render column measures the
 * pipeline rather than map lookup. `pulsesPerQuarter` is the converter's default ppq.
 */
const BENCH_MPM = `<?xml version="1.0" encoding="UTF-8"?>
<mpm xmlns="http://www.cemfi.de/mpm/ns/1.0">
  <performance name="bench" pulsesPerQuarter="720">
    <global>
      <header/>
      <dated>
        <tempoMap>
          <tempo date="0.0" bpm="120.0" beatLength="0.25"/>
        </tempoMap>
      </dated>
    </global>
  </performance>
</mpm>`;

function renderAll(meiText) {
  let bytes = 0;
  for (const movement of api.convertMeiToMsm(meiText)) {
    bytes += api.renderExpressiveMidi({ msm: movement.msm, mpm: BENCH_MPM }).length;
  }
  return bytes;
}

/**
 * The two stages timed apart, each the median of {@link REPEATS} runs. A single sample per
 * size is not enough: the drift verdict is a ratio whose noisiest term is the smallest size,
 * so one unlucky run there inverts it.
 */
function timeStages(meiText) {
  let movements = [];
  const convertMs = timeMs(() => (movements = api.convertMeiToMsm(meiText)));
  const renderMs = timeMs(() => {
    for (const m of movements) api.renderExpressiveMidi({ msm: m.msm, mpm: BENCH_MPM });
  });
  return { convertMs, renderMs };
}

function measure() {
  const fixtures = {};
  let total = 0;
  for (const file of readdirSync(MEI_DIR)
    .sort()
    .filter((f) => f.endsWith('.mei'))) {
    const text = readFileSync(join(MEI_DIR, file), 'utf8');
    let bytes = 0;
    const ms = silenced(() => timeMs(() => (bytes = renderAll(text))));
    fixtures[file] = { ms: +ms.toFixed(2), midiBytes: bytes };
    total += ms;
  }

  const synthetic = {};
  for (const notes of SYNTHETIC_SIZES) {
    const text = syntheticMei(notes);
    const { convertMs, renderMs } = silenced(() => timeStages(text));
    synthetic[notes] = {
      convertMs: +convertMs.toFixed(1),
      renderMs: +renderMs.toFixed(1),
      convertUsPerNote: +((convertMs * 1000) / notes).toFixed(0),
      renderUsPerNote: +((renderMs * 1000) / notes).toFixed(0),
    };
  }

  return { fixtures, fixtureTotalMs: +total.toFixed(1), synthetic };
}

function report(now, base) {
  const cmp = (label, cur, prev) => {
    const ratio = prev === undefined ? null : cur / prev;
    const flag = ratio === null ? '' : ratio > TOLERANCE ? '  REGRESSED' : '';
    const delta =
      ratio === null ? '' : ` (${ratio >= 1 ? '+' : ''}${((ratio - 1) * 100).toFixed(0)}%)`;
    console.log(`  ${label.padEnd(30)} ${String(cur).padStart(9)}${delta}${flag}`);
    return flag !== '';
  };

  let regressed = false;
  console.log('\nReal fixtures — MEI to expressive MIDI, median of ' + REPEATS + '\n');
  for (const [file, m] of Object.entries(now.fixtures)) {
    regressed = cmp(file, m.ms, base?.fixtures?.[file]?.ms) || regressed;
    const prevBytes = base?.fixtures?.[file]?.midiBytes;
    if (prevBytes !== undefined && prevBytes !== m.midiBytes) {
      console.log(`      ! MIDI bytes moved: ${prevBytes} -> ${m.midiBytes}`);
      regressed = true;
    }
  }
  regressed = cmp('TOTAL', now.fixtureTotalMs, base?.fixtureTotalMs) || regressed;

  console.log('\nSynthetic scores — the shape of each column is the point\n');
  console.log('    notes    convert ms   us/note      render ms   us/note');
  for (const [notes, m] of Object.entries(now.synthetic)) {
    console.log(
      `  ${notes.padStart(7)} ${String(m.convertMs).padStart(13)} ${String(m.convertUsPerNote).padStart(9)} ` +
        `${String(m.renderMs).padStart(14)} ${String(m.renderUsPerNote).padStart(9)}`,
    );
    const prev = base?.synthetic?.[notes];
    if (prev !== undefined) {
      if (m.convertMs / prev.convertMs > TOLERANCE) {
        console.log(`      ! convert regressed ${prev.convertMs} -> ${m.convertMs} ms`);
        regressed = true;
      }
      if (m.renderMs / prev.renderMs > TOLERANCE) {
        console.log(`      ! render regressed ${prev.renderMs} -> ${m.renderMs} ms`);
        regressed = true;
      }
    }
  }

  const drift = (pick) => {
    const xs = Object.values(now.synthetic).map(pick);
    return xs[xs.length - 1] / xs[0];
  };
  // Advisory, not a gate. It is a ratio of two medians and the smallest size is its noisiest
  // term, so on a loaded machine it can flip. `--check` gates on the per-size TIMES against a
  // committed baseline — a comparison of like with like — and not on this. Read a SUPERLINEAR
  // verdict as "go measure properly", never as a failure.
  const verdict = (x) =>
    x > 2
      ? `x${x.toFixed(1)}  SUPERLINEAR (advisory — re-run on a quiet machine)`
      : `x${x.toFixed(1)}  linear enough`;
  const lo = SYNTHETIC_SIZES[0];
  const hi = SYNTHETIC_SIZES[SYNTHETIC_SIZES.length - 1];
  console.log(`\n  us/note drift ${lo}..${hi} notes`);
  console.log(`    convert   ${verdict(drift((m) => m.convertUsPerNote))}`);
  console.log(`    render    ${verdict(drift((m) => m.renderUsPerNote))}`);
  return regressed;
}

const now = measure();

if (process.argv.includes('--save')) {
  writeFileSync(BASELINE, JSON.stringify(now, null, 2) + '\n');
  console.log(`baseline written to scripts/bench-baseline.json`);
  report(now, null);
} else {
  const base = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
  const regressed = report(now, base);
  if (process.argv.includes('--check')) {
    if (base === null) {
      console.error('\nno baseline; run `npm run bench:save` first');
      process.exit(1);
    }
    if (regressed) {
      console.error(`\nregression beyond ${TOLERANCE}x, or MIDI output moved`);
      process.exit(1);
    }
    console.log('\nno regression');
  }
}
