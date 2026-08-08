import { Element, Attribute, Nodes } from '../xml/XomTypes.js';

/**
 * This is a helper class for processing MSM sequencingMaps.
 * It is used to represent goto elements from msm sequencingMaps, used in methods Msm.applySequencingMapToMap() and Mei.processEnding().
 * Port of meico.msm.Goto
 * @author Axel Berndt.
 *
 * One jump in a `<sequencingMap>`: "on reaching {@link date}, continue at
 * {@link targetDate}". That is how MSM encodes a repeat sign, a `dacapo`, or a numbered
 * ending, without writing the music out twice —
 * `Msm.applySequencingMapToMap` is what later turns it into literal, linear time.
 *
 * ## Marker wiring
 *
 * A goto names its destination twice over: `target.date` is the date to jump to and
 * `target.id` references the `xml:id` of a `<marker>` in the markerMap. The reference is
 * written MEI-style with a leading `#`, which is stripped on the way in, and the marker
 * element itself is resolved eagerly in the constructor (see {@link target}). Either one
 * suffices: with no `target.date` the date is read off the resolved marker instead, and
 * a goto with neither is rejected.
 *
 * The two can disagree — nothing checks that `target.date` equals the marker's own
 * `date`, and when both are present the attribute wins and the marker is never consulted.
 *
 * ## Activity
 *
 * {@link activity} is a string of `1`s and `0`s read left to right, one character per
 * pass: `"1"` is a plain jump taken once, `"10"` a repeat taken the first time and
 * ignored the second, `"110"` a repeat taken twice. Past the end of the string the goto is
 * inactive forever, which is what makes expansion terminate. {@link counter} is the
 * cursor into it and is advanced by {@link isActive}, so *asking* whether a goto is active
 * is what consumes a pass — calling it twice per encounter would silently skip a
 * repetition.
 */
export class Goto {
  /** the date attribute — where playback jumps *from* */
  public date = 0.0;
  /** the target.date attribute — where playback jumps *to* */
  public targetDate = 0.0;
  /** the target.id attribute, with any leading `#` removed */
  public targetId = '';
  /** the marker element `targetId` resolves to, if it was found; never re-resolved */
  public target: Element | null = null;
  /** the goto element this was read from; null when built from parameters */
  public source: Element | null = null;
  /** per-pass on/off pattern of `1`/`0` characters; see the class comment */
  public activity = '1';
  /** how many passes have been consumed — the cursor into {@link activity} */
  public counter = 0;

  /**
   * constructor from individual parameters, better use Goto.fromElement(gt) as constructor, it is safer and more convenient
   * @param date
   * @param targetDate
   * @param targetId
   * @param activity
   * @param source
   *
   * **Ported bug — do not "fix".** The `#` stripping here is `substring(1, length - 1)`,
   * which drops the *last* character as well as the first, where the element constructor
   * gets it right with `substring(1, length)`. Java has exactly this asymmetry
   * (`Goto.java:40` vs `Goto.java:57`), so correcting it would diverge from the reference.
   *
   * It is latent at the only production call site:
   * `Mei2MsmMpmConverter.processEnding` passes an `endingMarker_…` id, which never starts
   * with `#`. Note the round trip is still lossy in principle — {@link toElement} *writes*
   * `target.id` with a leading `#`, so feeding that value back through this constructor
   * would lose a character while feeding it back through the element constructor would
   * not.
   */
  constructor(
    date: number,
    targetDate: number,
    targetId: string | null,
    activity: string,
    source: Element,
  );
  /**
   * constructor from XML element
   * @param gt
   */
  constructor(gt: Element);
  constructor(
    dateOrGt: number | Element,
    targetDate?: number,
    targetId?: string | null,
    activity?: string,
    source?: Element,
  ) {
    if (typeof dateOrGt === 'number') {
      // 5-arg constructor: date, targetDate, targetId, activity, source
      this.date = dateOrGt;
      this.source = source!;
      this.activity = activity!;
      this.targetDate = targetDate!;

      if (targetId !== null && targetId !== undefined) {
        let tid = targetId;
        if (tid.startsWith('#')) tid = tid.substring(1, tid.length - 1);
        this.targetId = tid;
      }
    } else {
      // Element constructor
      this.initFromElement(dateOrGt);
    }
  }

  /**
   * Initialize from an XML element
   * @param gt the goto element
   * @throws when the element cannot describe a jump: no `date`, or neither a usable
   *   `target.date` nor a resolvable `target.id`
   *
   * Throwing is the documented contract, not a failure mode — `applySequencingMapToMap`
   * builds its Goto list inside a `try` and logs and skips the ones that throw, so a
   * malformed `<goto>` costs its own jump and nothing else.
   *
   * Two adaptations of Java's control flow, both preserving behaviour:
   *
   * - Java gets its rejections from `Double.parseDouble` throwing on malformed input;
   *   `parseFloat` returns `NaN` instead, so each parse is followed by an explicit
   *   `Number.isNaN` check that raises the same error at the same point.
   * - the `parent !== null` guard has no counterpart in Java, which would throw a
   *   `NullPointerException` on a parentless `<goto>`. Here such an element yields
   *   `target = null` and then fails on the missing `target.date` instead — the same
   *   outcome for the caller, reached without a different exception type.
   *
   * The target search is `descendant::` from the goto's **parent**, i.e. the marker must
   * live in the same sequencingMap; a marker elsewhere in the document is not found. If
   * several elements share the id, the first in document order wins.
   */
  private initFromElement(gt: Element): void {
    let a = gt.getAttribute('date'); // get its date attribute
    if (a === null)
      // if it has none
      throw new Error(`Missing attribute date in ${gt.toXML()}`); // the Goto instance cannot be created
    this.date = parseFloat(gt.getAttributeValue('date')!); // get the date as double
    if (Number.isNaN(this.date))
      // parseFloat yields NaN where Java's Double.parseDouble throws
      throw new Error(`Invalid attribute date in ${gt.toXML()}`); // the Goto instance cannot be created

    // get its target.id and target element
    if (gt.getAttribute('target.id') !== null && gt.getAttributeValue('target.id')!.length > 0) {
      // if there is a nonempty attribute target.id
      this.targetId = gt.getAttributeValue('target.id')!.trim(); // get target.id

      if (this.targetId.startsWith('#'))
        // remove the # at the start
        this.targetId = this.targetId.substring(1, this.targetId.length);

      const parent = gt.getParent();
      if (parent !== null) {
        const targetCandidates: Nodes = parent.query(
          `descendant::*[attribute::xml:id='${this.targetId}']`,
        ); // find target element (must be a sibling of gt)
        if (targetCandidates.size() > 0)
          this.target = targetCandidates.get(0) as unknown as Element; // get it
      }
    }

    // determine target date
    a = gt.getAttribute('target.date'); // get its target.date
    if (a === null) {
      // if it has none
      if (this.target === null)
        // and there is no target specified otherwise
        throw new Error(`Missing attribute target.date or a valid target.id in ${gt.toXML()}`); // the Goto instance cannot be created
      this.targetDate = parseFloat(this.target.getAttributeValue('date')!); // get the date from the target
      if (Number.isNaN(this.targetDate))
        // if it fails
        throw new Error(`The target of ${gt.toXML()} has no valid attribute date.`); // the Goto instance cannot be created
    } else {
      // it has the target.date attribute
      this.targetDate = parseFloat(gt.getAttributeValue('target.date')!); // get the date as double
      if (Number.isNaN(this.targetDate))
        // parseFloat yields NaN where Java's Double.parseDouble throws
        throw new Error(`Invalid attribute target.date in ${gt.toXML()}`); // the Goto instance cannot be created
    }

    this.activity = gt.getAttribute('activity') === null ? '1' : gt.getAttributeValue('activity')!; // get the activity string
  }

  /**
   * creates and returns an XML element of the goto
   * @returns
   *
   * Writes all four attributes unconditionally, in this order — `date`, `activity`,
   * `target.date`, `target.id` — and the order is the serialised attribute order. The `#`
   * is put back on `target.id` here; see the note on the parameter constructor about the
   * asymmetric round trip.
   */
  toElement(): Element {
    const gt = new Element('goto'); // make a goto element
    gt.addAttribute(new Attribute('date', String(this.date))); // give it the date
    gt.addAttribute(new Attribute('activity', this.activity)); // process this goto at the second time, later on ignore it
    gt.addAttribute(new Attribute('target.date', String(this.targetDate))); // add the target.date attribute
    gt.addAttribute(new Attribute('target.id', `#${this.targetId}`)); // add the target.id attribute
    return gt;
  }

  /**
   * call this method when you come across the goto during the processing of sequencingMaps,
   * it will increase the counter and return whether it is active (true) or passive (false)
   * @returns
   *
   * **Not a predicate — it mutates.** Every call advances {@link counter} by one, whether
   * the answer was true or false, so it must be called exactly once per encounter.
   * `applySequencingMapToMap` relies on that: the counter running off the end of
   * {@link activity} is what makes its restarting goto search terminate.
   */
  isActive(): boolean {
    let active = false;

    if (this.counter < this.activity.length && this.activity.charAt(this.counter) === '1')
      active = true;

    this.counter++;
    return active;
  }
}
