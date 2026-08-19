/**
 * Rendering benchmark, with a superlinearity detector.
 *
 * Commit 980ae7e won 3.1x on real fixtures and 71x on a 32 000-note score by removing five
 * superlinear shapes from the rendering path, and measured all of it ad hoc. The functional
 * rewrite moves that same path onto immutable data, which is exactly the kind of change that
 * can hand those wins back one allocation at a time. This script is the net.
 *
 * The per-fixture wall times are the coarse signal. The real one is **microseconds per note
 * across four sizes**: a linear stage holds that roughly flat, and anything quadratic shows up
 * as a rising column long before it becomes a timeout.
 *
 * The two stages are timed apart, which is the whole reason this file exists in this shape.
 * Measured on the tree at the time of writing:
 *
 *      notes   convert us/note   render us/note
 *        250               627               35
 *        500               863               13
 *       1000              1750               15
 *       2000              3901               29
 *       4000              8025               15
 *
 * `renderExpressiveMidi` is flat — commit 980ae7e made it linear and it has stayed that way.
 * `convertMeiToMsmMpm` is quadratic, and 980ae7e never touched it: its 32 000-note figure was
 * the render stage alone. A 4000-note score — a modest piano piece — spends 32 seconds in the
 * converter and 60 milliseconds in the renderer. Keep the two columns separate or the
 * converter's curve hides inside a total.
 *
 *   node scripts/bench.mjs                 measure and print
 *   node scripts/bench.mjs --save          write scripts/bench-baseline.json
 *   node scripts/bench.mjs --check         compare against the baseline, exit 1 on regression
 *
 * Timing is not a unit test and deliberately does not run in `vitest`: a CI box under load
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
// Kept small deliberately: the converter is quadratic, so 8000 notes alone is ~2 minutes.
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

function renderAll(meiText) {
  let bytes = 0;
  for (const movement of api.convertMeiToMsmMpm(meiText)) {
    bytes += api.renderExpressiveMidi({ msm: movement.msm, mpm: movement.mpm }).length;
  }
  return bytes;
}

/** The two stages timed apart, because only one of them is linear. */
function timeStages(meiText) {
  let movements = [];
  const convertMs = timeMs(() => (movements = api.convertMeiToMsmMpm(meiText)), 1);
  const renderMs = timeMs(() => {
    for (const m of movements) api.renderExpressiveMidi({ msm: m.msm, mpm: m.mpm });
  }, 1);
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
  const verdict = (x) =>
    x > 2 ? `x${x.toFixed(1)}  SUPERLINEAR` : `x${x.toFixed(1)}  linear enough`;
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
