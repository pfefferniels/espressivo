/**
 * This is a helper class to parse a String to a program change number.
 * Port of meico.midi.InstrumentsDictionary
 *
 * In the Java version, the instruments dictionary was loaded from a resource file.
 * In this TypeScript port, the dictionary data is embedded directly.
 *
 * The string similarity matching uses a Normalized Levenshtein distance
 * implemented in pure TypeScript (replacing the Java java-string-similarity library).
 *
 * ## Lookup order is load-bearing
 *
 * `getProgramChange` is a **linear scan over the whole dictionary in insertion
 * order**, and two of its rules make that order observable:
 *
 * - a distance of exactly 0 returns immediately, so an exact name never depends on
 *   what follows it;
 * - otherwise the best match is kept with a strict `<`, so among several keys at the
 *   same minimal distance **the earliest one wins**.
 *
 * The insertion order is the line order of `DICT_DATA` below, because a JS `Map`
 * iterates in insertion order. Reordering the data, or rebuilding the map from a
 * differently-ordered source, silently re-resolves every fuzzy name that has a tie —
 * and fuzzy names are the normal case (`"Klarinette in B"`, `"Horn in F"`).
 *
 * **Java-parity note, pre-existing, do not "fix".** Java's `dict` is a
 * `HashMap<String, Short>` (`InstrumentsDictionary.java:57`) and `entrySet()`
 * iterates in hash order, not insertion order. Exact matches agree in both languages
 * — distance 0 returns the same value whatever the order — but a *tie* between two
 * fuzzy candidates can resolve to different instruments in Java and here. The same
 * asymmetry makes `getInstrumentName(pc)` deterministic here (it returns the first
 * name listed under that program number) and effectively arbitrary in Java.
 *
 * ## The data format, and why it stays a string
 *
 * `DICT_DATA` is parsed at construction: `%` starts a comment line, `#N` sets the
 * program number for everything that follows (clamped into 0..127), blank lines are
 * skipped, and every other line is an instrument name stored lower-cased. It holds
 * 838 name lines that collapse to **836 keys** — `lead 5 charang` is listed twice
 * under one program number, and `tenore` is listed under both 52 and 53, so the
 * later value (53) wins while the key keeps its *earlier* position in the scan.
 * Turning the table into a `readonly` array of tuples is possible in principle, but
 * it would have to reproduce that last-value/first-position rule exactly, and the
 * only gain is parse time on a table that is rebuilt per lookup anyway. Left as
 * data, deliberately.
 *
 * ## Only one distance method is reachable from the pipeline
 *
 * The eleven `distanceMethod` constants mirror the eleven metrics of Java's
 * `info.debatty.java.stringsimilarity`; the implementations below are hand-written
 * replacements, not a port of that library. Only `NormalizedLevenshtein` — the
 * default, and the only one `EventMaker.createProgramChangeByName` can select — is
 * exercised by the conversion pipeline, so it is the only one whose agreement with
 * the Java library is evidenced by the fixtures. The other ten are public API for
 * external callers and are pinned only by this port's own unit tests.
 *
 * @author Axel Berndt
 */

export class InstrumentsDictionary {
  // Distance method constants
  static readonly Levenshtein: number = 0x00;
  static readonly NormalizedLevenshtein: number = 0x01;
  static readonly Damerau: number = 0x02;
  static readonly JaroWinkler: number = 0x03;
  static readonly LongestCommonSubsequence: number = 0x04;
  static readonly MetricLCS: number = 0x05;
  static readonly NGram: number = 0x06;
  static readonly QGram: number = 0x07;
  static readonly Cosine: number = 0x08;
  static readonly Jaccard: number = 0x09;
  static readonly SorensenDice: number = 0x0a;

  /**
   * the default instrument names of General MIDI, indexed by program change number
   * (used by `getInstrumentName`, e.g. for MIDI-to-MSM conversion)
   */
  static readonly DefaultNames: readonly string[] = [
    'Acoustic Grand Piano',
    'Bright Acoustic Piano',
    'Electric Grand Piano',
    'Honkytonk Piano',
    'Electric Piano 1',
    'Electric Piano 2',
    'Harpsichord',
    'Clavinet',
    'Celesta',
    'Glockenspiel',
    'Music Box',
    'Vibraphone',
    'Marimba',
    'Xylophone',
    'Tubular Bells',
    'Dulcimer',
    'Drawbar Organ',
    'Percussive Organ',
    'Rock Organ',
    'Church Organ',
    'Reed Organ',
    'Accordion',
    'Harmonica',
    'Tango Accordion',
    'Acoustic Nylon Guitar',
    'Acoustic Steel Guitar',
    'Electric Jazz Guitar',
    'Electric Clean Guitar',
    'Electric Muted Guitar',
    'Overdriven Guitar',
    'Distorted Guitar',
    'Harmonic Guitar',
    'Acoustic Bass',
    'Fingered Electric Bass',
    'Picked Electric Bass',
    'Fretless Bass',
    'Slap Bass 1',
    'Slap Bass 2',
    'Synth Bass 1',
    'Synth Bass 2',
    'Violin',
    'Viola',
    'Cello',
    'Contrabass',
    'Tremolo Strings',
    'Pizzicato Strings',
    'Orchestral Harp',
    'Timpani',
    'String Ensemble 1',
    'String Ensemble 2',
    'Synth Strings 1',
    'Synth Strings 2',
    'Choir Aahs',
    'Voice Oohs',
    'Synth Choir',
    'Orchestra Hit',
    'Trumpet',
    'Trombone',
    'Tuba',
    'Muted Trumpet',
    'French Horn',
    'Brass Section',
    'Synth Brass 1',
    'Synth Brass 2',
    'Soprano Sax',
    'Alto Sax',
    'Tenor Sax',
    'Baritone Sax',
    'Oboe',
    'English Horn',
    'Bassoon',
    'Clarinet',
    'Piccolo',
    'Flute',
    'Recorder',
    'Pan Flute',
    'Blown Bottle',
    'Shakuhachi',
    'Whistle',
    'Ocarina',
    'Lead 1 Square',
    'Lead 2 Sawtooth',
    'Lead 3 Calliope',
    'Lead 4 Chiff',
    'Lead 5 Charang',
    'Lead 6 Voice',
    'Lead 7 Fifths',
    'Lead 8 (Bass + Lead)',
    'Pad 1 New Age',
    'Pad 2 Warm',
    'Pad 3 Polysynth',
    'Pad 4 Choir',
    'Pad 5 Bowed',
    'Pad 6 Metallic',
    'Pad 7 Halo',
    'Pad 8 Sweep',
    'FX 1 Rain',
    'FX 2 Soundtrack',
    'FX 3 Crystal',
    'FX 4 Atmosphere',
    'FX 5 Brightness',
    'FX 6 Goblins',
    'FX 7 Echoes',
    'FX 8 Scifi',
    'Sitar',
    'Banjo',
    'Shamisen',
    'Koto',
    'Kalimba',
    'Bagpipe',
    'Fiddle',
    'Shanai',
    'Tinkle Bell',
    'Agogo',
    'Steel Drums',
    'Woodblock',
    'Taiko Drum',
    'Melodic Tom',
    'Synth Drum',
    'Reverse Cymbal',
    'Guitar Fret Noise',
    'Breath Noise',
    'Seashore',
    'Bird Tweet',
    'Telephone Ring',
    'Helicopter',
    'Applause',
    'Gunshot',
  ];

  /** name (lower case) → program change number, in `DICT_DATA` line order */
  private readonly dict: Map<string, number>;

  /**
   * The constructor. It builds the dictionary from the embedded data.
   * In Java this read from resources/instuments.dict; here the data is embedded directly.
   *
   * Cheap enough to be built per lookup, which is what callers do — Java rebuilds it
   * per instance too, and nothing in `getProgramChange` mutates it.
   */
  constructor() {
    this.dict = new Map<string, number>();
    this.buildDictionary();
  }

  /**
   * Build the instruments dictionary from embedded data.
   * This replaces the Java file-reading constructor.
   *
   * A later duplicate of a name overwrites the earlier value but keeps the earlier
   * scan position — the behaviour Java's `HashMap.put` has, and the reason `tenore`
   * resolves to 53 while sitting among the 52s. Java's own guard against duplicates
   * is commented out in `InstrumentsDictionary.java:76-77`, so last-wins is
   * deliberate in both languages.
   *
   * One divergence: this trims trailing whitespace off each line before testing it
   * for emptiness and before storing it, where Java stores the line as read. The
   * embedded data has no trailing whitespace, so it makes no difference here.
   */
  private buildDictionary(): void {
    const dictData = InstrumentsDictionary.DICT_DATA;
    const lines = dictData.split('\n');
    let pc = 0;

    for (const rawLine of lines) {
      const line = rawLine.trimEnd();
      if (line.length === 0) continue; // empty line
      if (line.charAt(0) === '%') continue; // comment line

      if (line.charAt(0) === '#') {
        // program change number line
        pc = parseInt(line.substring(1).replace(/\s+/g, ''), 10);
        if (pc > 127) pc = 127;
        if (pc < 0) pc = 0;
        continue;
      }

      // put the string into the map, associate it with pc
      this.dict.set(line.toLowerCase(), pc);
    }
  }

  /**
   * This method parses the input string name and outputs its corresponding midi program change number.
   * This is based on the Normalized Levenshtein distance between the input string and the strings
   * in the instrument names dictionary.
   *
   * Never fails: an unmatched name still returns the nearest entry, and an empty name
   * returns 0 without scanning. The scan order is significant — see the class comment.
   * Every lookup reports the key it settled on to stdout, matching Java
   * (`InstrumentsDictionary.java:157,168`); the port keeps that because the tests and
   * the CLI both read it.
   *
   * @param name an instrument's name string
   * @param distanceMethod one of the eleven constants above; anything unrecognised,
   *   including a missing argument, falls back to Normalized Levenshtein
   * @return the suggested midi program change number; if instrument unknown, output is 0 (Acoustic Grand Piano)
   */
  getProgramChange(name: string, distanceMethod?: number): number {
    if (distanceMethod === undefined) {
      return this.getProgramChange(name, InstrumentsDictionary.NormalizedLevenshtein);
    }

    if (name.length === 0)
      // if the name string is empty
      return 0; // default instrument is Acoustic Grand Piano (program Change = 0)

    const n = name.toLowerCase(); // to ignore the case
    let pc = 0; // here comes the result
    let distance = Number.MAX_VALUE; // indicates the distance to the name string
    let bestKey = ''; // the key `pc` came from; reported below, Java calls it `foo`

    for (const [key, value] of this.dict.entries()) {
      let curDistance: number;
      switch (distanceMethod) {
        case InstrumentsDictionary.Levenshtein:
          curDistance = InstrumentsDictionary.levenshteinDistance(key, n);
          break;
        case InstrumentsDictionary.NormalizedLevenshtein:
          curDistance = InstrumentsDictionary.normalizedLevenshteinDistance(key, n);
          break;
        case InstrumentsDictionary.Damerau:
          curDistance = InstrumentsDictionary.damerauLevenshteinDistance(key, n);
          break;
        case InstrumentsDictionary.JaroWinkler:
          curDistance = InstrumentsDictionary.jaroWinklerDistance(key, n);
          break;
        case InstrumentsDictionary.LongestCommonSubsequence:
          curDistance = InstrumentsDictionary.lcsDistance(key, n);
          break;
        case InstrumentsDictionary.MetricLCS:
          curDistance = InstrumentsDictionary.metricLCSDistance(key, n);
          break;
        case InstrumentsDictionary.NGram:
          curDistance = InstrumentsDictionary.ngramDistance(key, n, 2);
          break;
        case InstrumentsDictionary.QGram:
          curDistance = InstrumentsDictionary.qgramDistance(key, n, 2);
          break;
        case InstrumentsDictionary.Cosine:
          curDistance = InstrumentsDictionary.cosineDistance(key, n);
          break;
        case InstrumentsDictionary.Jaccard:
          curDistance = InstrumentsDictionary.jaccardDistance(key, n);
          break;
        case InstrumentsDictionary.SorensenDice:
          curDistance = InstrumentsDictionary.sorensenDiceDistance(key, n);
          break;
        default:
          curDistance = InstrumentsDictionary.normalizedLevenshteinDistance(key, n);
      }

      if (curDistance === 0) {
        // found perfect match
        console.log(`${name} is mapped to ${key} with ${curDistance}`);
        return value; // return the value
      }

      // strictly less than, so the earliest key at the minimal distance wins
      if (curDistance < distance) {
        distance = curDistance;
        pc = value;
        bestKey = key;
      }
    }
    console.log(`${name} is mapped to ${bestKey} with ${distance}`);
    return pc;
  }

  /**
   * given a program change number, return the instrument's name
   *
   * Reading the dictionary (the default) returns the **first** name listed under that
   * program number, lower-cased, because the scan follows `DICT_DATA` order — so
   * program 0 gives `"acoustic grand piano"`, not `"Klavier"`. Java's hash-ordered
   * map gives an arbitrary synonym instead. Pass `useGmDefaultNames` for the
   * canonical General MIDI spelling, which is also the fallback if the dictionary
   * cannot be built.
   *
   * @param useGmDefaultNames if false the names are taken from the instruments dictionary
   * @return the instrument's name or an empty string if not found in the dictionary
   */
  static getInstrumentName(programChangeNumber: number, useGmDefaultNames = false): string {
    if (useGmDefaultNames) return InstrumentsDictionary.DefaultNames[programChangeNumber];

    let dict: InstrumentsDictionary;
    try {
      dict = new InstrumentsDictionary();
    } catch (e) {
      console.error(e);
      return InstrumentsDictionary.DefaultNames[programChangeNumber];
    }

    for (const [key, value] of dict.dict.entries()) {
      if (value === programChangeNumber) return key;
    }
    return '';
  }

  // ============================================================
  // String distance implementations (replacing java-string-similarity library)
  // ============================================================

  /**
   * Compute the Levenshtein distance of two strings.
   *
   * Textbook full-matrix edit distance: the number of single-character insertions,
   * deletions and substitutions between the two strings. This is the one metric whose
   * definition is unambiguous enough that the hand-written version and Java's library
   * cannot disagree, which matters because `normalizedLevenshteinDistance` — the
   * default and only pipeline-reachable metric — is built on it.
   */
  private static levenshteinDistance(str1: string, str2: string): number {
    const matrix: number[][] = [];
    for (let i = 0; i <= str1.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= str2.length; j++) {
      matrix[0][j] = j;
    }
    for (let a = 1; a <= str1.length; a++) {
      for (let b = 1; b <= str2.length; b++) {
        const right = str1.charAt(a - 1) !== str2.charAt(b - 1) ? 1 : 0;
        let mini = matrix[a - 1][b] + 1;
        if (matrix[a][b - 1] + 1 < mini) mini = matrix[a][b - 1] + 1;
        if (matrix[a - 1][b - 1] + right < mini) mini = matrix[a - 1][b - 1] + right;
        matrix[a][b] = mini;
      }
    }
    return matrix[str1.length][str2.length];
  }

  /**
   * Compute the Normalized Levenshtein distance (0..1) of two strings.
   *
   * Edit distance divided by the longer length, so an exact match is 0 and a total
   * mismatch approaches 1. **This is the metric the whole conversion pipeline uses**:
   * every instrument name in every MEI fixture is resolved through it.
   */
  private static normalizedLevenshteinDistance(str1: string, str2: string): number {
    const maxLen = Math.max(str1.length, str2.length);
    if (maxLen === 0) return 0;
    return InstrumentsDictionary.levenshteinDistance(str1, str2) / maxLen;
  }

  /**
   * Compute the Damerau-Levenshtein distance of two strings.
   */
  private static damerauLevenshteinDistance(str1: string, str2: string): number {
    const len1 = str1.length;
    const len2 = str2.length;
    const d: number[][] = [];
    for (let i = 0; i <= len1; i++) {
      d[i] = [];
      for (let j = 0; j <= len2; j++) {
        d[i][j] = 0;
      }
    }
    for (let i = 0; i <= len1; i++) d[i][0] = i;
    for (let j = 0; j <= len2; j++) d[0][j] = j;

    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        const cost = str1.charAt(i - 1) === str2.charAt(j - 1) ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1, // deletion
          d[i][j - 1] + 1, // insertion
          d[i - 1][j - 1] + cost, // substitution
        );
        if (
          i > 1 &&
          j > 1 &&
          str1.charAt(i - 1) === str2.charAt(j - 2) &&
          str1.charAt(i - 2) === str2.charAt(j - 1)
        ) {
          d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + cost); // transposition
        }
      }
    }
    return d[len1][len2];
  }

  /**
   * Compute the Jaro-Winkler distance (0..1) of two strings.
   */
  private static jaroWinklerDistance(s1: string, s2: string): number {
    if (s1 === s2) return 0;
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 0;

    const matchDistance = Math.max(0, Math.floor(maxLen / 2) - 1);
    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);

    let matches = 0;
    let transpositions = 0;

    for (let i = 0; i < s1.length; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, s2.length);
      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1.charAt(i) !== s2.charAt(j)) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }

    if (matches === 0) return 1;

    let k = 0;
    for (let i = 0; i < s1.length; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1.charAt(i) !== s2.charAt(k)) transpositions++;
      k++;
    }

    const jaro =
      (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;

    // Winkler prefix bonus
    let prefix = 0;
    for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
      if (s1.charAt(i) === s2.charAt(i)) prefix++;
      else break;
    }

    return 1 - (jaro + prefix * 0.1 * (1 - jaro));
  }

  /**
   * Compute the Longest Common Subsequence distance of two strings.
   */
  private static lcsDistance(s1: string, s2: string): number {
    const len1 = s1.length;
    const len2 = s2.length;
    const dp: number[][] = [];
    for (let i = 0; i <= len1; i++) {
      dp[i] = [];
      for (let j = 0; j <= len2; j++) {
        dp[i][j] = 0;
      }
    }
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (s1.charAt(i - 1) === s2.charAt(j - 1)) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    const lcsLen = dp[len1][len2];
    return len1 + len2 - 2 * lcsLen;
  }

  /**
   * Compute the Metric LCS distance (0..1) of two strings.
   */
  private static metricLCSDistance(s1: string, s2: string): number {
    const maxLen = Math.max(s1.length, s2.length);
    if (maxLen === 0) return 0;
    // The Metric LCS = 1 - LCS(s1, s2) / max(|s1|, |s2|)
    const len1 = s1.length;
    const len2 = s2.length;
    const dp: number[][] = [];
    for (let i = 0; i <= len1; i++) {
      dp[i] = [];
      for (let j = 0; j <= len2; j++) {
        dp[i][j] = 0;
      }
    }
    for (let i = 1; i <= len1; i++) {
      for (let j = 1; j <= len2; j++) {
        if (s1.charAt(i - 1) === s2.charAt(j - 1)) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    const lcsLen = dp[len1][len2];
    return 1 - lcsLen / maxLen;
  }

  /**
   * Get n-grams of a string. Returns an empty list when the string is shorter than `n`.
   */
  private static getNgrams(s: string, n: number): string[] {
    const ngrams: string[] = [];
    if (s.length < n) return ngrams;
    for (let i = 0; i <= s.length - n; i++) {
      ngrams.push(s.substring(i, i + n));
    }
    return ngrams;
  }

  /**
   * Compute the N-Gram distance (0..1) of two strings.
   */
  private static ngramDistance(s1: string, s2: string, n: number): number {
    if (s1.length === 0 && s2.length === 0) return 0;
    if (s1.length === 0 || s2.length === 0) return 1;

    // Normalized N-gram distance
    const special = '\n'; // padding character
    const s1p = special.repeat(n - 1) + s1;
    const s2p = special.repeat(n - 1) + s2;

    const ngrams1 = InstrumentsDictionary.getNgrams(s1p, n);
    const ngrams2 = InstrumentsDictionary.getNgrams(s2p, n);

    let matches = 0;
    const used = new Array(ngrams2.length).fill(false);

    for (const ng1 of ngrams1) {
      for (let j = 0; j < ngrams2.length; j++) {
        if (!used[j] && ng1 === ngrams2[j]) {
          matches++;
          used[j] = true;
          break;
        }
      }
    }

    return 1 - matches / Math.max(ngrams1.length, ngrams2.length);
  }

  /**
   * Get a profile (map of ngrams to counts) for QGram-based distances.
   * Unlike `ngramDistance`, the string is not padded first.
   */
  private static getProfile(s: string, n: number): Map<string, number> {
    const profile = new Map<string, number>();
    const ngrams = InstrumentsDictionary.getNgrams(s, n);
    for (const ng of ngrams) {
      profile.set(ng, (profile.get(ng) || 0) + 1);
    }
    return profile;
  }

  /**
   * Compute the QGram distance of two strings.
   *
   * The odd one out: **not normalised to 0..1**, it is the summed absolute difference
   * of the two bigram profiles, so it grows with string length. That is the library's
   * definition too, but it means a `distance` from this metric is not comparable with
   * one from any other — only within a single scan, which is all `getProgramChange`
   * needs.
   */
  private static qgramDistance(s1: string, s2: string, q: number): number {
    const profile1 = InstrumentsDictionary.getProfile(s1, q);
    const profile2 = InstrumentsDictionary.getProfile(s2, q);

    const allKeys = new Set<string>();
    for (const k of profile1.keys()) allKeys.add(k);
    for (const k of profile2.keys()) allKeys.add(k);

    let distance = 0;
    for (const key of allKeys) {
      const v1 = profile1.get(key) || 0;
      const v2 = profile2.get(key) || 0;
      distance += Math.abs(v1 - v2);
    }
    return distance;
  }

  /**
   * Compute the Cosine distance (0..1) of two strings based on bigram profiles.
   */
  private static cosineDistance(s1: string, s2: string): number {
    const profile1 = InstrumentsDictionary.getProfile(s1, 2);
    const profile2 = InstrumentsDictionary.getProfile(s2, 2);

    if (profile1.size === 0 && profile2.size === 0) return 0;
    if (profile1.size === 0 || profile2.size === 0) return 1;

    const allKeys = new Set<string>();
    for (const k of profile1.keys()) allKeys.add(k);
    for (const k of profile2.keys()) allKeys.add(k);

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;
    for (const key of allKeys) {
      const v1 = profile1.get(key) || 0;
      const v2 = profile2.get(key) || 0;
      dotProduct += v1 * v2;
      norm1 += v1 * v1;
      norm2 += v2 * v2;
    }

    const denom = Math.sqrt(norm1) * Math.sqrt(norm2);
    if (denom === 0) return 1;
    return 1 - dotProduct / denom;
  }

  /**
   * Compute the Jaccard distance (0..1) of two strings based on bigram sets.
   */
  private static jaccardDistance(s1: string, s2: string): number {
    const ngrams1 = new Set(InstrumentsDictionary.getNgrams(s1, 2));
    const ngrams2 = new Set(InstrumentsDictionary.getNgrams(s2, 2));

    if (ngrams1.size === 0 && ngrams2.size === 0) return 0;

    let intersection = 0;
    for (const ng of ngrams1) {
      if (ngrams2.has(ng)) intersection++;
    }

    const union = ngrams1.size + ngrams2.size - intersection;
    if (union === 0) return 0;
    return 1 - intersection / union;
  }

  /**
   * Compute the Sorensen-Dice distance (0..1) of two strings based on bigram sets.
   */
  private static sorensenDiceDistance(s1: string, s2: string): number {
    const ngrams1 = new Set(InstrumentsDictionary.getNgrams(s1, 2));
    const ngrams2 = new Set(InstrumentsDictionary.getNgrams(s2, 2));

    if (ngrams1.size === 0 && ngrams2.size === 0) return 0;

    let intersection = 0;
    for (const ng of ngrams1) {
      if (ngrams2.has(ng)) intersection++;
    }

    const denom = ngrams1.size + ngrams2.size;
    if (denom === 0) return 0;
    return 1 - (2 * intersection) / denom;
  }

  // ============================================================
  // Embedded instruments dictionary data
  // (originally from resources/instuments.dict)
  //
  // FROZEN — line order is lookup order (see the class comment). Adding a name is
  // safe; moving one re-resolves every fuzzy lookup that ties with it.
  // ============================================================

  private static readonly DICT_DATA: string = `% Acoustic Grand Piano
# 0
Acoustic Grand Piano
Grand Piano
Acoustic Grand
Grand
Piano
Klavier
Flügel
Flugel
Fluegel
Konzertflügel
Konzertflugel
Konzertfluegel
Hammerklavier
Pianoforte
Piano Left Hand
Piano Right Hand

% Bright Acoustic Piano
# 1
Bright Acoustic Piano
Bright Piano

% Electric Grand Piano
# 2
Electric Grand Piano
Electric Grand

% Honkytonk Piano
# 3
Honkytonk Piano
Honkytonk

% Electric Piano 1
# 4
Electric Piano 1
Electric Piano
E-Piano
Epiano

% Electric Piano 2
# 5
Electric Piano 2
E-Piano 2
Epiano 2

% Harpsichord
# 6
Harpsichord
Cembalo
Clavicembalo
Clavicymbel
Kielflügel
Kielflugel
Kielfluegel
Klavizimbel
Continuo

% Clavinet
# 7
Clavinet

% Celesta
# 8
Celesta
Celeste

% Glockenspiel
# 9
Glockenspiel
Bells
Bell
Carillon
Orchestra Bells

% Music Box
# 10
Music Box
Spieldose
Spieluhr

% Vibraphone
# 11
Vibraphone
Vibraphon
Vibrafon

% Marimba
# 12
Marimba
Marimbaphon

% Xylophone
# 13
Xylophone
Xylophon
Xylofon
Keyed Xylophone
Klaviaturxylophon
Klaviaturxylofon

% Tubular Bells
# 14
Tubular Bells
Chimes
Chime
Röhrenglocken
Rohrenglocken
Roehrenglocken

% Dulcimer
# 15
Dulcimer
Hackbrett

% Drawbar Organ
# 16
Drawbar Organ
Hammond Organ
Hammondorgel
Hammond
Electronic Organ
Elektronische Orgel
E-Orgel

% Percussive Organ
# 17
Percussive Organ

% Rock Organ
# 18
Rock Organ
Rockorgel

% Church Organ
# 19
Church Organ
Kirchenorgel
Pipe Organ
Pfeifenorgel
Organ
Orgel
upper
lower
Pedal
Prinzipal

% Reed Organ
# 20
Reed Organ
Reed
Pump Organ
Harmonium

% Accordion
# 21
Accordion
Ziehharmonika
Akkordeon
Schifferklavier
Handharmonika
Handorgel
Quetsche
Squeezebox
Flutina
concertina
Konzertina
Piano Accordion

% Harmonica
# 22
Harmonica
Harmonika
Mundharmonika
Mouthorgan
Mouth Organ
Mouth-Organ
Mouth Harp
French Harp

% Tango Accordion
# 23
Tango Accordion

% Acoustic Guitar nylon
# 24
Acoustic Nylon Guitar
Acoustic Guitar nylon
Acoustic Guitar
Nylon Guitar
Guitar Nylon
Gitarre
Gitarre Nylon
Akustikgitarre

% Acoustic Steel Guitar
# 25
Acoustic Steel Guitar
Acoustic Guitar steel
Steel Guitar
Guitar steel
Gitarre Stahl

% Electric Jazz Guitar
# 26
Electronic Jazz Guitar
Electric Guitar jazz
Jazz Guitar
Guitar jazz
Jazzgitarre

% Electric Clean Guitar
# 27
Electronic Clean Guitar
Electric Guitar clean
Clean Electric Guitar
Electric Guitar
Elektrische Gitarre
Elektrische Gitarre clean
E-Gitarre
clean E-Gitarre
cleane E-Gitarre
E-Gitarre clean

% Electric Muted Guitar
# 28
Electronic Muted Guitar
Electric Guitar muted
Muted Electric Guitar
Electrische Gitarre gedämpft
Electrische Gitarre gedampft
Electrische Gitarre gedaempft

% Overdriven Guitar
# 29
Overdriven Guitar
Overdrive Guitar
Guitar Overdriven
Guitar Overdrive
Overdrive-Gitarre
Overdrive Gitarre
Rockgitarre
Rock Guitar

% Distorted Guitar
# 30
Distortion Guitar
Distorted Guitar
Guitar Distorted
Verzerrte Gitarre
E-Gitarre verzerrt
Gitarre verzerrt
elektrische Gitarre verzerrt
verzerrte elektrische Gitarre
verzerrte E-Gitarre

% Harmonic Guitar
# 31
Guitar Harmonics
Harmonic Guitar
Harmoniegitarre

% Acoustic Bass
# 32
Acoustic Bass
Akustischer Bass
Bass Guitar
Bassgitarre
Bassgitarre akustisch
Akustische Bassgitarre

% Electric Bass finger
# 33
Electric Bass finger
Fingered Electric Bass
Fingered Bass
Electric Bass fingered
Electric Bass Guitar
Electric Bass
Elektrische Bassgitarre
Elektrischer Bass

% Electric Bass pick
# 34
Electric Bass pick
Electric Bass picked
Picked Electric Bass
Picked Bass
Gezupfte Bassgitarre
Bassgitarre gezupft

% Fretless Bass
# 35
Fretless Bass
Bass fretless
Bass bundlos
bundloser Bass

% Slap Bass 1
# 36
Slap Bass 1
Slap Bass
Slapped Bass 1
Bass slapped 1
Slapped Bass
Bass slapped

% Slap Bass 2
# 37
Slap Bass 2
Slapped Bass 2
Bass slapped 2

% Synth Bass 1
# 38
Synth Bass 1
Synth Bass
Bass Synth 1
Bass Synth
Synthesizer Bass 1
Synthesizer-Bass 1
Synthesizerbass 1
Bass Synthesizer 1
Bass-Synthesizer 1
Basssynthesizer 1
Synthesizer Bass
Synthesizer-Bass
Synthesizerbass
Bass Synthesizer
Bass-Synthesizer
Basssynthesizer

% Synth Bass 2
# 39
Synth Bass 2
Bass Synth 2
Synthesizer Bass 2
Synthesizer-Bass 2
Synthesizerbass 2
Bass Synthesizer 2
Bass-Synthesizer 2
Basssynthesizer 2

% Violin
# 40
Violin
Violine
Violino
Geige
Violin solo
Violine solo
Violino solo
Geige solo
Solo Violin
Solovioline
Sologeige

% Viola
# 41
Viola
Solo Viola
Viola solo
Viola Bastarda
Viola d'amore
Viola tenore
Bratsche
Bratsche solo
Solobratsche
Liebesgeige
Tenorgeige

% Cello
# 42
Cello
Gambe
Viol
Viola da gamba
Violoncello

% Contrabass
# 43
Contrabass
Kontrabass
Bassgeige
Double Bass
Bass Fiddle
String Bass
American Bass Viol
Bass Viol
Contrabass Viol

% Tremolo Strings
# 44
Tremolo Strings
Strings tremolo
Streicher Tremolo
Streichertremolo
Tremolostreicher
Tremolo Streicher

% Pizzicato Strings
# 45
Pizzicato Strings
Strings Pizzicato
Pizzicatostreicher
Streicherpizzicato
Pizzicato Streicher
Streicher Pizzicato

% Orchestral Harp
# 46
Orchestral Harp
Orchesterharp
Harfe
Harp
Konzertharfe

% Timpani
# 47
Timpani
Kettle Drum
Kettledrum
Tympani
Tympano
Tympanum
Timpano
Timbal
Pauke
Pauken
Kesselpauke
Kesselpauken
Tympanon

% String Ensemble 1
# 48
String Ensemble 1
String Ensemble
Ensemble Strings 1
Ensemble Strings
Streichensemble 1
Streicherensemble 1
Streichensemble
Streicherensemble

% String Ensemble 2
# 49
String Ensemble 2
Ensemble Strings 2
Streichensemble 2
Streicherensemble 2

% Synth Strings 1
# 50
Synth Strings 1
Synth Strings
String Synth 1
String Synth
Synthistreicher
Streichersynthi
Synthesized Strings

% Synth Strings 2
# 51
Synth Strings 2
String Synth 2

% Choir Aahs
# 52
Choir Aahs
Choir
Chor Aah
Chor
Gesang
Chant
Soprane
Soprani
Superior
Superius
Alti
Tenöre
Tenore
Tenoere
Tenori
Bässe
Basse
Baesse
Bassi
Singstimmen
S.
A.
T.
B.

% Voice Oohs
# 53
Voice Oohs
Voice
Sopran
Soprano
Alt
Alto
Altus
Contratenor
Tenor
Tenore
Bass
Basso
Bassus
Sopran solo
Alt solo
Alto solo
Tenor solo
Bass solo
Basso solo
Canto
Cantus
Quinto
Singstimme
Baritone
Melody
Melodie

% Synth Choir
# 54
Synth Choir
Choir Synth
Synthesizer Choir
Synthesizer Chor
Choir Synthesizer

% Orchestra Hit
# 55
Orchestra Hit
Orchestral Hit

% Trumpet
# 56
Trumpet
Trumpet in
Trompete
Trompete in
Naturtrompete
Basstrompete
Trump
Tromba
Trompette
Solo Trumpet
Trumpet Solo
Bass Trumpet
Clarino
Clarini
Clarino in
Clarini in

% Trombone
# 57
Trombone
Alto Trombone
Tenor Trombone
Bass Trombone
Posaune
Altposaune
Tenorposaune
Bassposaune
Baßposaune

% Tuba
# 58
Tuba
Bass Tuba
Basstuba
Baßtuba
Bombardon
Contrabass Tuba
Kontrabasstuba
Kontrabaßtuba
Wagner Tuba
Wagnertuba
Basso Tuba
Euphonium

% Muted Trumpet
# 59
Muted Trumpet
Trumpet muted
Trompete gedämpft
Gedämpfte Trompete

% French Horn
# 60
French Horn
Waldhorn
Horn
Horn in
French Horn in
Double French Horn
Doppelwaldhorn
Triple French Horn
Triple Horn
Triple-Horn
Natural Horn
Bugle
Corno
Corno in
Corni
Corni in

% Brass Section
# 61
Brass Section
Blechbläser
Trompeten
Posaunen
Hörner
Tuben

% Synth Brass 1
# 62
Synth Brass 1
Brass Synth 1
Synthesizer Brass 1
Brass Synthesizer 1
Synth Brass
Brass Synth
Synthesizer Brass
Brass Synthesizer

% Synth Brass 2
# 63
Synth Brass 2
Brass Synth 2
Synthesizer Brass 2
Brass Synthesizer 2

% Soprano Sax
# 64
Soprano Sax
Soprano Saxophone
Saxophone Soprano
Saxophone Sopran
Sopransaxophon
Sopransaxofon

% Alto Sax
# 65
Alto Sax
Alto Saxophone
Saxophone Alto
Saxophone Alt
Altsaxophon
Altsaxofon

% Tenor Sax
# 66
Tenor Sax
Tenor Saxophone
Sax Tenor
Saxophone Tenor
Tenorsaxophon
Tenorsaxofon
Saxophone
Saxophon
Saxofon

% Baritone Sax
# 67
Baritone Sax
Baritone Saxophone
Sax Baritone
Saxophone Bariton
Baritonsaxophon
Baritonsaxofon

% Oboe
# 68
Oboe
Oboi
Oboen
Hautboy
Hoboe
Hautbois
Oboe d'amore
Oboe da caccia

% English Horn
# 69
English Horn
Englischhorn
Cor Anglais
Cor Inglese

% Bassoon
# 70
Bassoon
Fagott
Fagotte
Fagotti
Rackettfagott
Fagotto
Basson

% Clarinet
# 71
Clarinet
Clarinet in
Klarinette
Klarinette in
Klarinetten
Klarinetten in
Clarionet
Clarionet in
Clarinetto
Clarinetto in
Clarinette
Clarinette in
Clarinetti
Clarinetti in

% Piccolo
# 72
Piccolo
Piccolo Flute
Piccoloflöte

% Flute
# 73
Flute
Flöte
Flöten
Flauto
Concert Flute
Traversflöte
Querflöte

% Recorder
# 74
Recorder
Blockflöte
Registratore

% Pan Flute
# 75
Pan Flute
Panflöte

% Blown Bottle
# 76
Blown Bottle
Bottle
Flasche
Jug

% Shakuhachi
# 77
Shakuhachi

% Whistle
# 78
Whistle
Pfeife

% Ocarina
# 79
Ocarina
Gefäßflöte
Kugelflöte

% Lead 1 square
# 80
Lead 1 Square
Lead Square
Lead 1
Lead Synth 1
Square Lead
Square
Synth Square
Square Synth
Synthesizer Square
Square Synthesizer
Lead Rect
Rect Lead
Rect
Synth Rect
Rect Synth
Synthesizer Rect
Rect Synthesizer
Rectangle Lead
Lead Rectangle
Rectangle
Synth Rectangle
Rectangle Synth
Synthesizer Rectangle
Rectangle Synthesizer
Rechteck

% Lead 2 sawtooth
# 81
Lead 2 sawtooth
Lead sawtooth
Lead 2
Lead Synth 2
Lead Synth
Lead Synthesizer
Lead-Synthesizer
Sawtooth Lead
Sawtooth
Synth Sawtooth
Sawtooth Synth
Synthesizer Sawtooth
Sawtooth Synthesizer
Saw Lead
Saw
Synth Saw
Saw Synth
Synthesizer Saw
Saw Synthesizer
Sägezahn
Sagezahn
Saegezahn

% Lead 3 calliope
# 82
Lead 3 Calliope
Lead 3
Calliope Lead 3
Calliope Lead
Lead Calliope
Calliope
Dampforgel
Dampfpfeifenorgel

% Lead 4 chiff
# 83
Lead 4 chiff
Lead 4
Lead chiff
Chiff Lead
Chiff Lead 4
Chiff

% Lead 5 charang
# 84
Lead 5 charang
Lead 5
Lead 5 charang
Charang
Lead Charang
Charang Lead

% Lead 6 voice
# 85
Lead 6 voice
Lead 6
Lead voice
Voice Lead
Synth Voice
Voice Synth
Voice Synthesizer
Synthesizer Voice

% Lead 7 fifths
# 86
Lead 7 fifths
Lead 7
Lead fifths
Fifths Lead

% Lead 8 (bass + lead)
# 87
Lead 8 (bass + lead)
Lead 8 bass + lead
Lead 8 bass+lead
Lead 8
Lead bass lead
Lead bass and lead
Lead bass plus lead
Lead (bass and lead)
Lead (bass plus lead)

% Pad 1 new age
# 88
Pad 1 new age
Pad 1
Pad New Age
Pad Newage
New Age
Newage
New Age Pad
Newage Pad

% Pad 2 warm
# 89
Pad 2 warm
Pad 2
Pad warm
Warm Pad
Pad

% Pad 3 polysynth
# 90
Pad 3 polysynth
Pad 3
Pad polysynth
Polysynth
Polysynth pad
Polysynthpad

% Pad 4 choir
# 91
Pad 4 choir
Pad 4
Pad Choir
Choir Pad

% Pad 5 bowed
# 92
Pad 5 bowed
Pad 5
Pad bowed
Bowed Pad

% Pad 6 metallic
# 93
Pad 6 metallic
Pad 6
Pad metallic
Metallic Pad

% Pad 7 halo
# 94
Pad 7 halo
Pad 7
Pad halo
Halo Pad

% Pad 8 sweep
# 95
Pad 8 sweep
Pad 8
Pad sweep
Sweep Pad

% FX 1 rain
# 96
FX 1 rain
FX 1
FX rain
Rain FX
Rain

% FX 2 soundtrack
# 97
FX 2 soundtrack
FX 2
FX soundtrack
Soundtrack FX
Soundtrack

% FX 3 crystal
# 98
FX 3 crystal
FX 3
FX crystal
Crystal FX
Crystal
Kristall

% FX 4 atmosphere
# 99
FX 4 atmosphere
FX 4
FX atmosphere
Atmosphere FX
Atmosphere
Atmosphäre
Atmosphare
Atmosphaere

% FX 5 brightness
# 100
FX 5 brightness
FX 5
FX brightness
Brightness FX
Brightness
Helligkeit
Glanz

% FX 6 goblins
# 101
FX 6 goblins
FX 6
FX goblins
Goblins FX
Goblins
Kobolde

% FX 7 echoes
# 102
FX 7 echoes
FX 7
FX echoes
Echoes FX
Echoes
Echos
Echo

% FX 8 scifi
# 103
FX 8 scifi
FX 8
FX scifi
Scifi FX
Scifi
Sci Fi
Science Fiction
Science-Fiction
Sciencefiction

% Sitar
# 104
Sitar

% Banjo
# 105
Banjo

% Shamisen
# 106
Shamisen

% Koto
# 107
Koto

% Kalimba
# 108
Kalimba
Daumenklavier
Mbira
Gourd Piano
Thumb Piano

% Bagpipe
# 109
Bagpipe
Bagpipes
Dudelsack
Sackpfeife
Bock
Bockpfeife
Cornamusa
Piva
Zampogna
Biniou
Cornemuse

% Fiddle
# 110
Fiddle
Fiedel

% Shanai
# 111
Shanai

% Tinkle Bell
# 112
Tinkle Bell
Tinkle
Klingel

% Agogo
# 113
Agogo
Agogo Bell

% Steel Drums
# 114
Steel Drums
Steel Drum
Steeldrums
Steeldrum
Stahltrommel
Stahltrommeln

% Woodblock
# 115
Woodblock
Wood
Holzblock

% Taiko Drum
# 116
Taiko Drum
Taiko

% Melodic Tom
# 117
Melodic Tom
Tom
Tomtom
Tom-Tom

% Synth Drum
# 118
Synth Drum
Drum Synth
Synthesizer Drum
Drum Synthesizer

% Reverse Cymbal
# 119
Reverse Cymbal
Cymbal Reverse
Cymbal Crescendo
Cymbal Cresc

% Guitar Fret Noise
# 120
Guitar Fret Noise
Fret Noise
Guitar Noise
Bundgeräusch
Bundgeraeusch
Bundgerausch
Gitarrenbundgeräusch
Gitarrenbundgeraeusch
Gitarrenbundgerausch

% Breath Noise
# 121
Breath Noise
Breath
Atemgeräusch
Atemgeraeusch
Atemgerausch
Atem

% Seashore
# 122
Seashore
Shore
Coast
Seacoast
Waterside
Meeresbrandung
Brandung
Wellenrauschen
Küste
Kuste
Kueste
Strand
Ufer
Seeküste

% Bird Tweet
# 123
Bird Tweet
Bird
Birds
Tweet
Vogelzwitschern
Zwitschern
Vogel
Vögel
Voegel
Chirp

% Telephone Ring
# 124
Telephone Ring
Telephone
Telephon
Telefon
Telefonklingeln

% Helicopter
# 125
Helicopter
Helikopter
Hubschrauber
Chopper
Copter

% Applause
# 126
Applause
Plaudit
Acclamations
Clapping
Clapping of Hands
Hands clapping
Hand clapping
Handclapping
Applaus
Beifall
Händeklatschen
Haendeklatschen
Handeklatschen
Klatschen

% Gunshot
# 127
Gunshot
Gun
Shot
Shoot
Shotgun
Schuss
Schuß
Gewehrschuss
Gewehrschuß
Kanonenschuss
Kanonenschuß
Flintenschuss
Flintenschuß
Gewehr
Flinte
Kanone`;
}
