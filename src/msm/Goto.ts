import { Element, Attribute, Nodes } from '../xml/XomTypes.js';

/**
 * This is a helper class for processing MSM sequencingMaps.
 * It is used to represent goto elements from msm sequencingMaps, used in methods Msm.applySequencingMapToMap() and Mei.processEnding().
 * Port of meico.msm.Goto
 * @author Axel Berndt.
 */
export class Goto {
    public date: number = 0.0;               // the date attribute
    public targetDate: number = 0.0;         // the target.date attribute
    public targetId: string = "";            // the target.id attribute
    public target: Element | null = null;
    public source: Element | null = null;    // the source element in the msm document
    public activity: string = "1";           // this indicates when the goto is processed and when it is ignored
    public counter: number = 0;              // this counter is used to keep track of how often the goto is passed (typically a repetition is ignored at the second time)

    /**
     * constructor from individual parameters, better use Goto.fromElement(gt) as constructor, it is safer and more convenient
     * @param date
     * @param targetDate
     * @param targetId
     * @param activity
     * @param source
     */
    constructor(date: number, targetDate: number, targetId: string | null, activity: string, source: Element);
    /**
     * constructor from XML element
     * @param gt
     */
    constructor(gt: Element);
    constructor(dateOrGt: number | Element, targetDate?: number, targetId?: string | null, activity?: string, source?: Element) {
        if (typeof dateOrGt === 'number') {
            // 5-arg constructor: date, targetDate, targetId, activity, source
            this.date = dateOrGt;
            this.source = source!;
            this.activity = activity!;
            this.targetDate = targetDate!;

            if (targetId !== null && targetId !== undefined) {
                let tid = targetId;
                if (tid.startsWith("#"))
                    tid = tid.substring(1, tid.length - 1);
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
     */
    private initFromElement(gt: Element): void {
        let a = gt.getAttribute("date");                                                            // get its date attribute
        if (a === null)                                                                             // if it has none
            throw new Error("Missing attribute date in " + gt.toXML());                             // the Goto instance cannot be created
        this.date = parseFloat(gt.getAttributeValue("date")!);                                     // get the date as double
        if (Number.isNaN(this.date))                                                                // parseFloat yields NaN where Java's Double.parseDouble throws
            throw new Error("Invalid attribute date in " + gt.toXML());                             // the Goto instance cannot be created

        // get its target.id and target element
        if ((gt.getAttribute("target.id") !== null) && gt.getAttributeValue("target.id")!.length > 0) {     // if there is a nonempty attribute target.id
            this.targetId = gt.getAttributeValue("target.id")!.trim();                                       // get target.id

            if (this.targetId.startsWith("#"))                                                               // remove the # at the start
                this.targetId = this.targetId.substring(1, this.targetId.length);

            const parent = gt.getParent();
            if (parent !== null) {
                const targetCandidates: Nodes = parent.query("descendant::*[attribute::xml:id='" + this.targetId + "']");  // find target element (must be a sibling of gt)
                if (targetCandidates.size() > 0) this.target = targetCandidates.get(0) as unknown as Element;               // get it
            }
        }

        // determine target date
        a = gt.getAttribute("target.date");                                                                               // get its target.date
        if (a === null) {                                                                                                  // if it has none
            if (this.target === null)                                                                                       // and there is no target specified otherwise
                throw new Error("Missing attribute target.date or a valid target.id in " + gt.toXML());                     // the Goto instance cannot be created
            this.targetDate = parseFloat(this.target.getAttributeValue("date")!);                                        // get the date from the target
            if (Number.isNaN(this.targetDate))                                                                              // if it fails
                throw new Error("The target of " + gt.toXML() + " has no valid attribute date.");                            // the Goto instance cannot be created
        } else {                                                                                                            // it has the target.date attribute
            this.targetDate = parseFloat(gt.getAttributeValue("target.date")!);                                              // get the date as double
            if (Number.isNaN(this.targetDate))                                                                              // parseFloat yields NaN where Java's Double.parseDouble throws
                throw new Error("Invalid attribute target.date in " + gt.toXML());                                           // the Goto instance cannot be created
        }

        this.activity = (gt.getAttribute("activity") === null) ? "1" : gt.getAttributeValue("activity")!;                   // get the activity string
    }

    /**
     * creates and returns an XML element of the goto
     * @returns
     */
    toElement(): Element {
        const gt = new Element("goto");                                                 // make a goto element
        gt.addAttribute(new Attribute("date", String(this.date)));                      // give it the date
        gt.addAttribute(new Attribute("activity", this.activity));                       // process this goto at the second time, later on ignore it
        gt.addAttribute(new Attribute("target.date", String(this.targetDate)));          // add the target.date attribute
        gt.addAttribute(new Attribute("target.id", "#" + this.targetId));                // add the target.id attribute
        return gt;
    }

    /**
     * call this method when you come across the goto during the processing of sequencingMaps,
     * it will increase the counter and return whether it is active (true) or passive (false)
     * @returns
     */
    isActive(): boolean {
        let active = false;

        if ((this.counter < this.activity.length) && (this.activity.charAt(this.counter) === '1'))
            active = true;

        this.counter++;
        return active;
    }
}
