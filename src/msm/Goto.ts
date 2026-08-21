import { Element, Attribute, Nodes } from '../xml/XomTypes.js';

/**
 * One jump in a `<sequencingMap>`: "on reaching {@link date}, continue at {@link targetDate}".
 * That is how MSM encodes a repeat sign, a `dacapo`, or a numbered ending without writing the
 * music out twice; `Msm.applySequencingMapToMap` turns it into literal, linear time.
 *
 * A goto names its destination twice over: `target.date` is the date to jump to and `target.id`
 * references the `xml:id` of a `<marker>` in the markerMap. The reference is written MEI-style
 * with a leading `#`, which is stripped on the way in, and the marker element itself is
 * resolved eagerly in the constructor (see {@link target}). Either one suffices: with no
 * `target.date` the date is read off the resolved marker instead, and a goto with neither is
 * rejected. The two can disagree — nothing checks that `target.date` equals the marker's own
 * `date`, and when both are present the attribute wins and the marker is never consulted.
 *
 * {@link activity} is a string of `1`s and `0`s read left to right, one character per pass:
 * `"1"` is a plain jump taken once, `"10"` a repeat taken the first time and ignored the
 * second, `"110"` a repeat taken twice. Past the end of the string the goto is inactive
 * forever, which is what makes expansion terminate. {@link counter} is the cursor into it and
 * is advanced by {@link isActive}, so asking whether a goto is active is what consumes a pass —
 * calling it twice per encounter would silently skip a repetition.
 *
 * Port of meico.msm.Goto
 * @author Axel Berndt.
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
   * Build from individual parameters; the element form is safer and more convenient.
   *
   * Ported bug, do not "fix": the `#` stripping here is `substring(1, length - 1)`, which drops
   * the last character as well as the first, where the element constructor gets it right with
   * `substring(1, length)`. Java has exactly this asymmetry (`Goto.java:40` vs `Goto.java:57`).
   *
   * It is latent at the only production call site — `Mei2MsmMpmConverter.processEnding` passes
   * an `endingMarker_…` id, which never starts with `#`. The round trip is lossy in principle
   * all the same: {@link toElement} writes `target.id` with a leading `#`, so feeding that value
   * back through this constructor loses a character where the element constructor would not.
   */
  constructor(
    date: number,
    targetDate: number,
    targetId: string | null,
    activity: string,
    source: Element,
  );
  /** Build from a `<goto>` element. */
  constructor(gt: Element);
  constructor(
    ...args:
      | [gt: Element]
      | [
          date: number,
          targetDate: number,
          targetId: string | null,
          activity: string,
          source: Element,
        ]
  ) {
    if (args.length === 1) {
      this.initFromElement(args[0]);
      return;
    }

    const [date, targetDate, targetId, activity, source] = args;
    this.date = date;
    this.source = source;
    this.activity = activity;
    this.targetDate = targetDate;

    if (targetId !== null) {
      let tid = targetId;
      if (tid.startsWith('#')) tid = tid.substring(1, tid.length - 1);
      this.targetId = tid;
    }
  }

  /**
   * Throwing is the contract, not a failure mode: `applySequencingMapToMap` builds its Goto list
   * inside a `try` and logs and skips the ones that throw, so a malformed `<goto>` costs its own
   * jump and nothing else.
   *
   * Two adaptations of Java's control flow, both preserving behaviour:
   *
   * - Java gets its rejections from `Double.parseDouble` throwing on malformed input;
   *   `parseFloat` returns `NaN` instead, so each parse is followed by an explicit
   *   `Number.isNaN` check that raises the same error at the same point.
   * - the `parent !== null` guard has no counterpart in Java, which would throw a
   *   `NullPointerException` on a parentless `<goto>`. Here such an element yields
   *   `target = null` and then fails on the missing `target.date` instead — the same outcome
   *   for the caller, reached without a different exception type.
   *
   * The target search runs `descendant::` from the goto's parent, so the marker must live in the
   * same sequencingMap; one elsewhere in the document is not found. If several elements share
   * the id, the first in document order wins.
   *
   * @throws when the element cannot describe a jump: no `date`, or neither a usable
   *   `target.date` nor a resolvable `target.id`
   */
  private initFromElement(gt: Element): void {
    const dateAttribute = gt.getAttribute('date');
    if (dateAttribute === null) throw new Error(`Missing attribute date in ${gt.toXML()}`);
    this.date = parseFloat(dateAttribute.getValue());
    if (Number.isNaN(this.date)) throw new Error(`Invalid attribute date in ${gt.toXML()}`);

    const targetIdAttribute = gt.getAttribute('target.id');
    if (targetIdAttribute !== null && targetIdAttribute.getValue().length > 0) {
      this.targetId = targetIdAttribute.getValue().trim();

      if (this.targetId.startsWith('#'))
        this.targetId = this.targetId.substring(1, this.targetId.length);

      const parent = gt.getParent();
      if (parent !== null) {
        const targetCandidates: Nodes = parent.query(
          `descendant::*[attribute::xml:id='${this.targetId}']`,
        );
        // Both tests are needed: `Nodes.get` is a checked read and throws past the end, and
        // the element test is what narrows the node.
        if (targetCandidates.size() > 0) {
          const first = targetCandidates.get(0);
          if (first instanceof Element) this.target = first;
        }
      }
    }

    const targetDateAttribute = gt.getAttribute('target.date');
    if (targetDateAttribute === null) {
      if (this.target === null)
        throw new Error(`Missing attribute target.date or a valid target.id in ${gt.toXML()}`);

      // A target with no `date` becomes NaN rather than an error of its own, so it takes the
      // same route and raises the same message as a target with an unparsable one. Both
      // pairings are pinned by `tests/msm/Goto.test.ts`.
      const targetOwnDate = this.target.getAttribute('date');
      this.targetDate = targetOwnDate === null ? NaN : parseFloat(targetOwnDate.getValue());
      if (Number.isNaN(this.targetDate))
        throw new Error(`The target of ${gt.toXML()} has no valid attribute date.`);
    } else {
      this.targetDate = parseFloat(targetDateAttribute.getValue());
      if (Number.isNaN(this.targetDate))
        throw new Error(`Invalid attribute target.date in ${gt.toXML()}`);
    }

    const activityAttribute = gt.getAttribute('activity');
    this.activity = activityAttribute === null ? '1' : activityAttribute.getValue();
  }

  /**
   * The goto as a `<goto>` element. All four attributes are written unconditionally and in this
   * order — `date`, `activity`, `target.date`, `target.id` — which is the serialised attribute
   * order. The `#` is put back on `target.id` here; see the parameter constructor for the
   * asymmetric round trip.
   */
  toElement(): Element {
    const gt = new Element('goto');
    gt.addAttribute(new Attribute('date', String(this.date)));
    gt.addAttribute(new Attribute('activity', this.activity));
    gt.addAttribute(new Attribute('target.date', String(this.targetDate)));
    gt.addAttribute(new Attribute('target.id', `#${this.targetId}`));
    return gt;
  }

  /**
   * Whether this goto is taken on the current pass. Not a predicate — every call advances
   * {@link counter} by one, whatever the answer, so it must be called exactly once per
   * encounter. `applySequencingMapToMap` relies on that: the counter running off the end of
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
