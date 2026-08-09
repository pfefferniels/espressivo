/**
 * MEI's `pname`/`accid` vocabularies to the numbers MSM and MIDI use, and back.
 * Leaf module — imports nothing.
 *
 * Moved verbatim out of `mei/Helper` by T14 (ARCHITECTURE.md §8.2).
 *
 * The conversion tables below are pipeline arithmetic, not style. Every literal in this
 * module feeds pitch computations whose results are byte-compared against the Java
 * reference, so the values, the case labels and the fall-through defaults are frozen.
 *
 * Port of the pitch/accidental half of `meico.mei.Helper`.
 * @author Axel Berndt
 */

/**
 * compute the decimal value of the accidental (1 = 1 semitone)
 *
 * Covers MEI's quarter-tone vocabulary as well, which is why the return type is
 * fractional: `su`/`3qs` are +1.5, `sd`/`1qs` +0.5, and so on. Anything unrecognised —
 * including `n` (natural), which is listed explicitly and deliberately falls through —
 * yields 0. Note that {@link accidDecimal2String} is not a strict inverse: it
 * maps 2 back to `ss` and 3 to `xs`, so `x`, `ts` and the `n`-prefixed spellings do not
 * survive a round trip.
 *
 * @param accid the string to be converted
 * @return the decimal value of the accidental
 */
export function accidString2decimal(accid: string): number {
  let accidentals = 0.0;
  switch (accid) {
    case 's':
      accidentals = 1;
      break;
    case 'f':
      accidentals = -1;
      break;
    case 'ss':
      accidentals = 2;
      break;
    case 'x':
      accidentals = 2;
      break;
    case 'ff':
      accidentals = -2;
      break;
    case 'xs':
      accidentals = 3;
      break;
    case 'ts':
      accidentals = 3;
      break;
    case 'tf':
      accidentals = -3;
      break;
    case 'n':
      break;
    case 'nf':
      accidentals = -1;
      break;
    case 'ns':
      accidentals = 1;
      break;
    case 'su':
      accidentals = 1.5;
      break;
    case 'sd':
      accidentals = 0.5;
      break;
    case 'fu':
      accidentals = -0.5;
      break;
    case 'fd':
      accidentals = -1.5;
      break;
    case 'nu':
      accidentals = 0.5;
      break;
    case 'nd':
      accidentals = -0.5;
      break;
    case '1qf':
      accidentals = -0.5;
      break;
    case '3qf':
      accidentals = -1.5;
      break;
    case '1qs':
      accidentals = 0.5;
      break;
    case '3qs':
      accidentals = 1.5;
      break;
  }
  return accidentals;
}

/**
 * Compute the string value of a Decimal (given as String or number).
 * Will take the most simple accidental sign (avoids combinations with neutral signs).
 *
 * Both spellings of every value are listed (`'1'` and `'1.0'`) because the input reaches
 * this either from a JavaScript number's `toString` (`1`) or straight out of an MSM
 * attribute written by Java (`1.0`). A value that matches neither is **returned
 * unchanged** rather than rejected, so this can hand back arbitrary strings.
 *
 * @param accidObject
 * @return
 */
export function accidDecimal2String(accidObject: string | number | null): string | null {
  let accid = '';
  if (typeof accidObject === 'string') {
    accid = accidObject;
  } else if (typeof accidObject === 'number') {
    accid = accidObject.toString();
  } else {
    return null;
  }

  switch (accid) {
    case '1':
    case '1.0':
      accid = 's';
      break;
    case '-1':
    case '-1.0':
      accid = 'f';
      break;
    case '2':
    case '2.0':
      accid = 'ss';
      break;
    case '-2':
    case '-2.0':
      accid = 'ff';
      break;
    case '3':
    case '3.0':
      accid = 'xs';
      break;
    case '-3':
    case '-3.0':
      accid = 'tf';
      break;
    case '0':
    case '0.0':
      accid = 'n';
      break;
    case '-0.5':
      accid = '1qf';
      break;
    case '-1.5':
      accid = '3qf';
      break;
    case '0.5':
      accid = '1qs';
      break;
    case '1.5':
      accid = '3qs';
      break;
  }

  return accid;
}

/**
 * convert an accidental string to a word representation
 * @param accid
 * @return
 */
export function accidString2word(accid: string): string {
  let accidental = '';
  switch (accid) {
    case 's':
      accidental = 'sharp';
      break;
    case 'f':
      accidental = 'flat';
      break;
    case 'ss':
      accidental = 'sharp-sharp';
      break;
    case 'x':
      accidental = 'double-sharp';
      break;
    case 'ff':
      accidental = 'flat-flat';
      break;
    case 'xs':
    case 'ts':
      accidental = 'triple-sharp';
      break;
    case 'tf':
      accidental = 'triple-flat';
      break;
    case 'n':
      accidental = 'natural';
      break;
    case 'nf':
      accidental = 'natural-flat';
      break;
    case 'ns':
      accidental = 'natural-sharp';
      break;
    case 'su':
      accidental = 'sharp-up';
      break;
    case 'sd':
      accidental = 'sharp-down';
      break;
    case 'fu':
      accidental = 'flat-up';
      break;
    case 'fd':
      accidental = 'flat-down';
      break;
    case 'nu':
      accidental = 'natural-up';
      break;
    case 'nd':
      accidental = 'natural-down';
      break;
    case '1qf':
      accidental = 'quarter-flat';
      break;
    case '3qf':
      accidental = 'three-quarters-flat';
      break;
    case '1qs':
      accidental = 'quarter-sharp';
      break;
    case '3qs':
      accidental = 'three-quarters-sharp';
      break;
  }
  return accidental;
}

/**
 * compute the string value of accidental decimal value (1 = 1 semitone)
 * @param accid double value of accidental
 * @return the unicode string value of the accidental
 */
export function accidDecimal2unicodeString(accid: number): string {
  if (accid === 0.0) {
    return '';
  } else if (accid === 1.0) {
    return '&#9839;';
  } else if (accid === -1.0) {
    return '&#9837;';
  } else if (accid === 2.0) {
    return '&#119082;';
  } else if (accid === -2.0) {
    return '&#119083;';
  } else if (accid === 3.0) {
    return '&#119082;&#9839;';
  } else if (accid === -3.0) {
    return '&#9837;&#9837;&#9837;';
  } else if (accid === 1.5) {
    return '&#119088;';
  } else if (accid === 0.5) {
    return '&#119090;';
  } else if (accid === -0.5) {
    return '&#119091;';
  } else if (accid === -1.5) {
    return '&#119085;';
  }
  return '?';
}

/**
 * converts an mei pname to a midi pitch number in the first midi octave
 *
 * Accepts bare letters (`c`…`b`, either case) and letters with a baked-in accidental
 * (`c#`, `cs`, `db`, `df`, …); the octave is the caller's business, this only gives the
 * pitch class.
 *
 * **There is no case returning 10.** `a#`, `as`, `bb` and `bf` — and their capitalised
 * forms — are absent from the table and fall through to -1, while every other
 * chromatic degree is spelled out. The gap is in `Helper.java` too and is ported as is.
 * It is latent in practice: MEI normally encodes B flat as `pname="b"` with a separate
 * `accid`, and the converter's other entry point passes only the first character
 * (`pname2midi(ac.substring(0, 1))`), so a bare letter always reaches the table.
 *
 * @param pname the pname string
 * @return the midi pitch number in the first midi octave (one octave below the first MEI CMN octave), or -1 if unrecognised
 */
export function pname2midi(pname: string): number {
  switch (pname) {
    case 'b#':
    case 'B#':
    case 'bs':
    case 'Bs':
    case 'c':
    case 'C':
      return 0.0;
    case 'c#':
    case 'C#':
    case 'cs':
    case 'Cs':
    case 'db':
    case 'Db':
    case 'df':
    case 'Df':
      return 1.0;
    case 'd':
    case 'D':
      return 2.0;
    case 'd#':
    case 'D#':
    case 'ds':
    case 'Ds':
    case 'eb':
    case 'Eb':
    case 'ef':
    case 'Ef':
      return 3.0;
    case 'fb':
    case 'Fb':
    case 'ff':
    case 'Ff':
    case 'e':
    case 'E':
      return 4.0;
    case 'e#':
    case 'E#':
    case 'es':
    case 'Es':
    case 'f':
    case 'F':
      return 5.0;
    case 'f#':
    case 'F#':
    case 'fs':
    case 'Fs':
    case 'gb':
    case 'Gb':
    case 'gf':
    case 'Gf':
      return 6.0;
    case 'g':
    case 'G':
      return 7.0;
    case 'g#':
    case 'G#':
    case 'gs':
    case 'Gs':
    case 'ab':
    case 'Ab':
    case 'af':
    case 'Af':
      return 8.0;
    case 'a':
    case 'A':
      return 9.0;
    case 'cb':
    case 'Cb':
    case 'cf':
    case 'Cf':
    case 'b':
    case 'B':
      return 11.0;
    default:
      return -1.0;
  }
}

/**
 * converts a midi pitch value to a pitch name string (which includes enharmonic equivalents)
 * @param midipitch the midi pitch value
 * @return the pitch name string
 */
export function midi2pname(midipitch: number): string {
  const pitchclass = Math.round(midipitch % 12.0);
  switch (pitchclass) {
    case 0:
      return 'C';
    case 1:
      return 'C# Db';
    case 2:
      return 'D';
    case 3:
      return 'D# Eb';
    case 4:
      return 'E';
    case 5:
      return 'F';
    case 6:
      return 'F# Gb';
    case 7:
      return 'G';
    case 8:
      return 'G# Ab';
    case 9:
      return 'A';
    case 10:
      return 'A# Bb';
    case 11:
      return 'B';
    default:
      return '';
  }
}

/**
 * convert a midi pitch value to a pitch name string without accidental, the accidental will be encoded in a separate string;
 * this method is used during MIDI to MSM conversion
 * @param useSharpInsteadOfFlat use sharp or flat for accidental?
 * @param midipitch the midi pitch value
 * @param pnameAccid the output array: [pitchName, accidental] - must have length >= 2
 */
export function midi2PnameAndAccid(
  useSharpInsteadOfFlat: boolean,
  midipitch: number,
  pnameAccid: string[],
): void {
  if (pnameAccid.length < 2) {
    console.error(
      'Error in method Helper.midi2PnameAndAccid: Array length of pnameAccid should be at least 2.',
    );
    return;
  }

  const pitchclass = Math.round(midipitch % 12.0);
  switch (pitchclass) {
    case 0:
      pnameAccid[0] = 'C';
      pnameAccid[1] = '0.0';
      return;
    case 1:
      if (useSharpInsteadOfFlat) {
        pnameAccid[0] = 'C';
        pnameAccid[1] = '1.0';
      } else {
        pnameAccid[0] = 'D';
        pnameAccid[1] = '-1.0';
      }
      return;
    case 2:
      pnameAccid[0] = 'D';
      pnameAccid[1] = '0.0';
      return;
    case 3:
      if (useSharpInsteadOfFlat) {
        pnameAccid[0] = 'D';
        pnameAccid[1] = '1.0';
      } else {
        pnameAccid[0] = 'E';
        pnameAccid[1] = '-1.0';
      }
      return;
    case 4:
      pnameAccid[0] = 'E';
      pnameAccid[1] = '0.0';
      return;
    case 5:
      pnameAccid[0] = 'F';
      pnameAccid[1] = '0.0';
      return;
    case 6:
      if (useSharpInsteadOfFlat) {
        pnameAccid[0] = 'F';
        pnameAccid[1] = '1.0';
      } else {
        pnameAccid[0] = 'G';
        pnameAccid[1] = '-1.0';
      }
      return;
    case 7:
      pnameAccid[0] = 'G';
      pnameAccid[1] = '0.0';
      return;
    case 8:
      if (useSharpInsteadOfFlat) {
        pnameAccid[0] = 'G';
        pnameAccid[1] = '1.0';
      } else {
        pnameAccid[0] = 'A';
        pnameAccid[1] = '-1.0';
      }
      return;
    case 9:
      pnameAccid[0] = 'A';
      pnameAccid[1] = '0.0';
      return;
    case 10:
      if (useSharpInsteadOfFlat) {
        pnameAccid[0] = 'A';
        pnameAccid[1] = '1.0';
      } else {
        pnameAccid[0] = 'B';
        pnameAccid[1] = '-1.0';
      }
      return;
    case 11:
      pnameAccid[0] = 'B';
      pnameAccid[1] = '0.0';
      return;
    default:
      pnameAccid[0] = '';
      pnameAccid[1] = '';
  }
}

/**
 * Extends midi2PnameAndAccid to set octave value from midi pitch.
 * @param useSharpInsteadOfFlat
 * @param midipitch
 * @param pnameAccidOct array of length >= 3: [pitchName, accidental, octave]
 */
export function midi2PnameAccidOct(
  useSharpInsteadOfFlat: boolean,
  midipitch: number,
  pnameAccidOct: string[],
): void {
  if (pnameAccidOct.length < 3) {
    console.error(
      'Error in method Helper.midi2PnameAccidOct: Array length of pnameAccidOct should be at least 3.',
    );
    return;
  }
  midi2PnameAndAccid(useSharpInsteadOfFlat, midipitch, pnameAccidOct);
  if (pnameAccidOct[0] === '') return;
  pnameAccidOct[2] = getMidiOctave(midipitch).toString();
}

/**
 * Map midi pitch to octave.
 * @param midiPitch
 * @return
 */
function getMidiOctave(midiPitch: number): number {
  if (midiPitch >= 21 && midiPitch <= 23) return 0;
  if (midiPitch >= 24 && midiPitch <= 35) return 1;
  if (midiPitch >= 36 && midiPitch <= 47) return 2;
  if (midiPitch >= 48 && midiPitch <= 59) return 3;
  if (midiPitch >= 60 && midiPitch <= 71) return 4;
  if (midiPitch >= 72 && midiPitch <= 83) return 5;
  if (midiPitch >= 84 && midiPitch <= 95) return 6;
  if (midiPitch >= 96 && midiPitch <= 107) return 7;
  if (midiPitch >= 108) return 8;

  return -1;
}
