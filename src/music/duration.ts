/**
 * MEI's `dur` vocabulary to the numbers MSM and MIDI use. Leaf module — imports nothing.
 *
 * Every literal below feeds tick computations that are byte-compared against the Java
 * reference, so the values, the case labels and the fall-through defaults are frozen.
 *
 * Port of the duration half of `meico.mei.Helper`.
 * @author Axel Berndt
 */

/**
 * Convert a `dur` value to a decimal fraction of a whole note: `1` → 1.0, `4` → 0.25, down
 * to `2048`. The three mensural names sit above the whole note (`breve` 2, `long` 4,
 * `maxima` 8).
 *
 * An unrecognised string — including `'0'`, which MEI allows for a breve — returns 0.0, and
 * callers that divide by the result get infinity rather than an error. Java behaves the same.
 */
export function duration2decimal(durString: string): number {
  switch (durString) {
    case 'maxima':
      return 8.0;
    case 'long':
      return 4.0;
    case 'breve':
      return 2.0;
    case '1':
      return 1.0;
    case '2':
      return 0.5;
    case '4':
      return 0.25;
    case '8':
      return 0.125;
    case '16':
      return 0.0625;
    case '32':
      return 0.03125;
    case '64':
      return 0.015625;
    case '128':
      return 0.0078125;
    case '256':
      return 0.00390625;
    case '512':
      return 0.001953125;
    case '1024':
      return 0.0009765625;
    case '2048':
      return 0.00048828125;
  }
  return 0.0;
}

/**
 * Convert a `dur` value to its English note-value name; unrecognised strings pass through.
 */
export function duration2word(durString: string): string {
  switch (durString) {
    case 'maxima':
    case 'long':
    case 'breve':
      return durString;
    case '1':
      return 'whole';
    case '2':
      return 'half';
    case '4':
      return 'quarter';
    case '8':
      return 'eighth';
    case '16':
      return `${durString}th`;
    case '32':
      return `${durString}nd`;
    case '64':
    case '128':
    case '256':
      return `${durString}th`;
    case '512':
      return `${durString}nd`;
    case '1024':
    case '2048':
      return `${durString}th`;
  }
  return durString;
}

/**
 * Convert a duration in MIDI ticks to a decimal fraction of a whole note, at `ppq` ticks
 * per quarter.
 */
export function pulseDuration2decimal(pulses: number, ppq: number): number {
  return pulses / (ppq * 4.0);
}

/**
 * Render a decimal duration as HTML Unicode entities: the note or rest glyph plus its dots.
 * Anything below a 128th, or above a maxima, degrades to the word `note`/`rest`.
 */
export function decimalDuration2HtmlUnicode(duration: number, isRest: boolean): string {
  if (duration < 0.0078125) return isRest ? 'rest' : 'note';
  if (duration < 0.015625)
    return (
      (isRest ? '&#119106;' : '&#119140;') +
      durationRemainder2UnicodeDots(0.0078125, duration - 0.0078125)
    );
  if (duration < 0.03125)
    return (
      (isRest ? '&#119105;' : '&#119139;') +
      durationRemainder2UnicodeDots(0.015625, duration - 0.015625)
    );
  if (duration < 0.0625)
    return (
      (isRest ? '&#119104;' : '&#119138;') +
      durationRemainder2UnicodeDots(0.03125, duration - 0.03125)
    );
  if (duration < 0.125)
    return (
      (isRest ? '&#119103;' : '&#119137;') +
      durationRemainder2UnicodeDots(0.0625, duration - 0.0625)
    );
  if (duration < 0.25)
    return (
      (isRest ? '&#119102;' : '&#119136;') + durationRemainder2UnicodeDots(0.125, duration - 0.125)
    );
  if (duration < 0.5)
    return (
      (isRest ? '&#119101;' : '&#119135;') + durationRemainder2UnicodeDots(0.25, duration - 0.25)
    );
  if (duration < 1.0)
    return (
      (isRest ? '&#119100;' : '&#119134;') + durationRemainder2UnicodeDots(0.5, duration - 0.5)
    );
  if (duration < 2.0)
    return (
      (isRest ? '&#119099;' : '&#119133;') + durationRemainder2UnicodeDots(1.0, duration - 1.0)
    );
  if (duration < 4.0)
    return (
      (isRest ? '2 &#119098;' : '&#119132;') + durationRemainder2UnicodeDots(2.0, duration - 2.0)
    );
  if (duration < 8.0)
    return (
      (isRest ? '4 &#119098;' : '&#119223;') + durationRemainder2UnicodeDots(4.0, duration - 4.0)
    );
  if (duration === 8.0) return isRest ? '8 &#119098;' : '&#119222;';
  else return isRest ? 'rest' : 'note';
}

/**
 * The augmentation dots that make up `remainder` on top of `undottedNoteValue`, halving the
 * dot value each step and stopping at a 128th.
 */
function durationRemainder2UnicodeDots(undottedNoteValue: number, remainder: number): string {
  let dots = '';
  let v = undottedNoteValue / 2.0;
  for (let r = remainder; r >= v && r >= 0.0078125; v /= 2.0) {
    dots = `${dots}.`;
    r -= v;
  }
  return dots;
}
