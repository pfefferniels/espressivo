/**
 * MEI's `dur` vocabulary to the numbers MSM and MIDI use. Leaf module — imports nothing.
 *
 * Moved verbatim out of `mei/Helper` by T14 (ARCHITECTURE.md §8.2).
 *
 * The conversion tables below are pipeline arithmetic, not style. Every literal in this
 * module feeds tick computations whose results are byte-compared against the Java
 * reference, so the values, the case labels and the fall-through defaults are frozen.
 *
 * Port of the duration half of `meico.mei.Helper`.
 * @author Axel Berndt
 */

/**
 * convert the duration string into decimal (e.g., 4 -> 1/4) and returns the result
 *
 * The unit is the whole note: `1` → 1.0, `4` → 0.25, down to `2048`. The three mensural
 * names sit above the whole note (`breve` 2, `long` 4, `maxima` 8). An unrecognised
 * string — including `'0'`, which MEI allows for a breve — returns **0.0**, and callers
 * that divide by the result get infinity rather than an error. Java behaves identically.
 *
 * @param durString
 * @return
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
 * convert a duration string to a word representation
 * @param durString
 * @return
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
 * convert a duration specified in pulses (based on ppq) to decimal format
 * @param pulses
 * @param ppq
 * @return
 */
export function pulseDuration2decimal(pulses: number, ppq: number): number {
  return pulses / (ppq * 4.0);
}

/**
 * generate an HTML Unicode string with the note/rest value and dots according to the specified duration
 * @param duration
 * @param isRest
 * @return
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
 * This is a helper method for decimalDuration2HtmlUnicode().
 * From a decimal duration value, take the undotted note value and the remainder. This method computes the number of dots.
 * @param undottedNoteValue
 * @param remainder
 * @return
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
