import { XmlBase } from '../xml/XmlBase.js';
import { Document, Element, Attribute, Nodes } from '../xml/XomTypes.js';
import { KeyValue } from '../supplementary/KeyValue.js';
import { duration2decimal } from '../music/duration.js';
import { getFilenameWithoutExtension } from '../music/text.js';
import { attribute, firstChildElement, getAttributeValue } from '../xml/tree.js';
import { v4 as uuidv4 } from 'uuid';
import type { Msm } from '../msm/Msm.js';
import type { Mpm } from '../mpm/Mpm.js';

/**
 * The document an empty {@link Mei} starts from. Java loads the equivalent from the
 * resource `/resources/minimal.mei`; there is no resource loader here, so it is inlined.
 * It is deliberately the smallest tree that still satisfies everything downstream reaches
 * for: a `meiHead` with a `title` (so {@link Mei.getTitle} has somewhere to look), and a
 * `music/body/mdiv/score` spine with one `staffDef` and one empty `measure` (so
 * {@link Mei.getMusic} is non-null and the converter finds a body to walk).
 */
const MINIMAL_MEI = `<?xml version="1.0" encoding="UTF-8"?>
<mei xmlns="http://www.music-encoding.org/ns/mei" meiversion="4.0.0">
    <meiHead>
        <fileDesc>
            <titleStmt>
                <title/>
            </titleStmt>
            <pubStmt/>
        </fileDesc>
    </meiHead>
    <music>
        <body>
            <mdiv>
                <score>
                    <scoreDef>
                        <staffGrp>
                            <staffDef n="1" clef.line="2" clef.shape="G" lines="5"/>
                        </staffGrp>
                    </scoreDef>
                    <section>
                        <measure/>
                    </section>
                </score>
            </mdiv>
        </body>
    </music>
</mei>`;

/**
 * An MEI document, held as a XOM-style {@link Document} tree.
 *
 * `Mei` is the **entry stage** of the pipeline this port exists for:
 * `MEI → MSM + MPM → (expressive) MIDI`. It is deliberately a thin wrapper — it owns the
 * tree, offers navigation helpers over it (`getMeiHead`, `getMusic`, `getAllMdivs`, …),
 * and three *preprocessing* passes that rewrite the tree in place before conversion:
 * {@link Mei.resolveCopyofs}, {@link Mei.removeRendElements} and
 * {@link Mei.resolveExpansions}. All musical interpretation lives in
 * {@link Mei2MsmMpmConverter}, which calls those three in that order (see its
 * `convertMei`) and then walks the `body` subtrees.
 *
 * **The preprocessing passes mutate this instance.** The converter works around that by
 * copying the whole document up front and restoring it afterwards when its `cleanup` flag
 * is set — so a caller who converts twice with `cleanup` gets the same result twice, and a
 * caller who converts with `cleanup: false` does not. That is Java's contract too.
 *
 * Port of `meico.mei.Mei`.
 * @author Axel Berndt
 */
export class Mei extends XmlBase {
  /** an empty MEI built from the {@link MINIMAL_MEI} template */
  constructor();
  /** wrap an already parsed document (taken over, not copied) */
  constructor(mei: Document);
  /** parse MEI from an XML string */
  constructor(xml: string, isXmlString: true);
  /**
   * Three genuinely different things to start from — nothing, a parsed tree, or XML
   * source — which is why this stays an overload set rather than one optional parameter
   * (`unified-signatures` is knowingly left standing; collapsing it is T16's call, and it
   * would make `new Mei(someString)` silently mean "empty" instead of "parse this").
   * Java has eight constructors here; the five that take `File`, `InputStream` or a
   * validation schema have no counterpart in this port.
   */
  constructor(arg?: Document | string, isXmlString?: true) {
    if (arg === undefined) {
      super(MINIMAL_MEI, true);
    } else if (arg instanceof Document) {
      super(arg);
    } else if (typeof arg === 'string' && isXmlString) {
      super(arg, true);
    } else {
      super();
    }
  }

  /** the readable spelling of `new Mei(xml, true)` */
  static fromXml(xml: string): Mei {
    return new Mei(xml, true);
  }

  /**
   * The MEI source as a string, or null if this instance is empty.
   * Java's `writeMei()` writes a `…-meico.mei` file next to the source instead; there is
   * no file system in the target environment, so this returns the serialization and lets
   * the caller decide what to do with it.
   */
  writeMei(): string | null {
    return this.exportXml();
  }

  /**
   * The `meiHead` element, or null if this instance is empty.
   * Looked up namespace-agnostically first and then in the root element's own namespace,
   * because MEI in the wild appears both with and without the MEI namespace declared.
   * The same two-step is used by {@link Mei.getMusic}.
   */
  getMeiHead(): Element | null {
    if (this.isEmpty()) return null;

    let e = this.getRootElement()!.getFirstChildElement('meiHead');
    if (e === null)
      e = this.getRootElement()!.getFirstChildElement(
        'meiHead',
        this.getRootElement()!.getNamespaceURI(),
      );

    return e;
  }

  /**
   * The work title, used to name the MSM movements the converter produces.
   *
   * **The two fallback paths below are unreachable, in this port and in Java alike.** They
   * are written as `catch (NullPointerException)` handlers around
   * `firstChildElement(name, ofThis)` — but that method returns null for a null
   * `ofThis` in both languages (`Helper.java:…getFirstChildElement(String, Element)`
   * opens with `if (ofThis == null) return null;`), so no exception is ever thrown and
   * control never leaves the first block. The effective behaviour is therefore: read
   * `meiHead/fileDesc/titleStmt/title`, and if any link of that chain is missing fall
   * through to the filename. The MEI 3.0 (`workDesc/work/titleStmt/title`) and MEI 4.0+
   * (`workList/work/title`) locations are never consulted.
   *
   * Kept bug-for-bug: the reference MSM fixtures carry titles produced by exactly this
   * behaviour. Do not "repair" the fallbacks — that would rename movements.
   * @return the title, the source filename without extension, or an empty string
   */
  getTitle(): string {
    let title: Element | null;

    try {
      title = firstChildElement('fileDesc', this.getMeiHead()!);
      title = firstChildElement('titleStmt', title!);
      title = firstChildElement('title', title!);
    } catch {
      try {
        title = firstChildElement('workDesc', this.getMeiHead()!);
        title = firstChildElement('work', title!);
        title = firstChildElement('titleStmt', title!);
        title = firstChildElement('title', title!);
      } catch {
        try {
          title = firstChildElement('workList', this.getMeiHead()!);
          title = firstChildElement('work', title!);
          title = firstChildElement('title', title!);
        } catch {
          return this.getFile() === null
            ? ''
            : getFilenameWithoutExtension(Mei.fileBasename(this.getFile()!));
        }
      }
    }
    return title !== null
      ? title.getValue()
      : this.getFile() === null
        ? ''
        : getFilenameWithoutExtension(Mei.fileBasename(this.getFile()!));
  }

  /**
   * the file is stored as a path string here, whereas Java uses a File object;
   * this reproduces java.io.File.getName(), i.e. the path is stripped down to the last path segment
   * @param path
   * @return
   */
  private static fileBasename(path: string): string {
    const i = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
    return i < 0 ? path : path.substring(i + 1);
  }

  /** the `music` element, or null if this instance is empty; see {@link Mei.getMeiHead} */
  getMusic(): Element | null {
    if (this.isEmpty()) return null;

    let e = this.getRootElement()!.getFirstChildElement('music');
    if (e === null)
      e = this.getRootElement()!.getFirstChildElement(
        'music',
        this.getRootElement()!.getNamespaceURI(),
      );

    return e;
  }

  /** all movements in this MEI; nested mdivs contribute only their leaves */
  getAllMdivs(): Element[] {
    const result: Element[] = [];
    const music = this.getMusic();
    if (music !== null) result.push(...this._getAllMdivs(music));
    return result;
  }

  /**
   * Recursive worker for {@link Mei.getAllMdivs}. Descends only through `body`, `group`
   * and `mdiv` — every other element ends the walk, which is what keeps this cheap on a
   * full score. An `mdiv` containing further `mdiv`s is a *container*, not a movement, so
   * it contributes its leaves and not itself; only a childless-of-mdivs `mdiv` is emitted.
   */
  private _getAllMdivs(inThis: Element): Element[] {
    const result: Element[] = [];
    const children = inThis.getChildElements();

    for (let i = 0; i < children.size(); i++) {
      const e = children.get(i);
      switch (e.getLocalName()) {
        case 'body':
        case 'group':
          result.push(...this._getAllMdivs(e));
          break;
        case 'mdiv': {
          const subMdivs = this._getAllMdivs(e);
          if (subMdivs.length === 0) result.push(e);
          else result.push(...subMdivs);
          break;
        }
      }
    }

    return result;
  }

  /** all variant encodings — `choice` and `app` elements — anywhere in this document */
  getAllVariantEncodings(): Nodes {
    return Mei.getAllVariantEncodingsStatic(this.getRootElement()!);
  }

  /**
   * All `choice` and `app` elements in the subtree of `inThis`. Java overloads the name
   * `getAllVariantEncodings` for the instance and the static form; TypeScript cannot, so
   * the static one carries the `Static` suffix.
   */
  static getAllVariantEncodingsStatic(inThis: Element): Nodes {
    return inThis.query("descendant::*[(local-name()='choice' or local-name()='app')]");
  }

  /**
   * Convert to MSM only, discarding the performance side. Just
   * {@link Mei.exportMsmMpm} with the MPM half dropped.
   */
  exportMsm(
    ppq?: number,
    dontUseChannel10?: boolean,
    ignoreExpansions?: boolean,
    cleanup?: boolean,
  ): Msm[] {
    return this.exportMsmMpm(ppq, dontUseChannel10, ignoreExpansions, cleanup).getKey();
  }

  /**
   * Convert this MEI into one MSM plus one MPM **per movement** (`mdiv`).
   *
   * @param ppq pulses per quarter note. A floor, not a fixed value: the converter compares
   *   it against {@link Mei.computeMinimalPPQ} and silently raises it if this resolution
   *   could not express the shortest note in the source as an integer tick count.
   * @param dontUseChannel10 keep MIDI channel 10 (the percussion channel) free when
   *   assigning channels to parts. Decided here rather than at MIDI export so that the MSM
   *   and the eventual MIDI file agree on channel numbers.
   * @param ignoreExpansions convert the encoding as written, skipping
   *   {@link Mei.resolveExpansions} — i.e. do not perform the repeats and reorderings that
   *   `expansion` elements prescribe.
   * @param cleanup strip the conversion's working attributes and helper elements from the
   *   MSM before returning, and restore this MEI to its pre-conversion state. Pass false
   *   to inspect the intermediate state.
   * @return the MSMs and the matching MPMs, index-aligned
   *
   * NOT YET USABLE — construct the converter yourself, as `tests/integration` does:
   * `new Mei2MsmMpmConverter(ppq, …).convert(mei)`. `Mei2MsmMpmConverter` imports this
   * module for `Mei.getLayer`/`getStaff` and for the `instanceof Mei` that discriminates
   * its two `convert` overloads, so a top-level import here would close a value cycle
   * between the two modules. T18 removed the `Mpm` ⇄ `GenericStyle` cycle and the
   * CommonJS `require` that used to stand in for this import, but not this cycle:
   * untangling it means editing the converter's overload dispatch, which is T15's item
   * and the highest-risk change in the project. Until T15 lands, this method throws
   * rather than pretending — same observable behaviour the `require` had.
   */
  exportMsmMpm(
    ppq = 720,
    dontUseChannel10 = true,
    ignoreExpansions = false,
    cleanup = true,
  ): KeyValue<Msm[], Mpm[]> {
    throw new Error(
      'Mei.exportMsmMpm is not available: importing Mei2MsmMpmConverter from Mei would close a ' +
        'module cycle between the two. Run the conversion directly instead — ' +
        `new Mei2MsmMpmConverter(${ppq}, ${dontUseChannel10}, ${ignoreExpansions}, ${cleanup})` +
        '.convert(mei)',
    );
  }

  /**
   * The coarsest pulses-per-quarter resolution that still represents every note value in
   * this MEI as a whole number of ticks.
   *
   * `dur` attributes are note *values* (`4` = quarter), converted to fractions of a whole
   * note by {@link duration2decimal}; each dot halves the value again. The smallest
   * such fraction `dur` divided into a quarter note (`0.25 / dur`) is how many ticks a
   * quarter must be worth. Results below 1 clamp to 1 and non-integers round *up* — never
   * down, or the shortest note would not fit.
   *
   * Tuplets are not considered (Java says so explicitly), so this is a lower bound on what
   * a tuplet-bearing score really needs; the converter's own rounding absorbs the rest.
   */
  computeMinimalPPQ(): number {
    const e = this.getMusic();
    if (e === null) return 0;

    const durs = e.query('descendant::*[attribute::dur]');
    let dur = 4.0;
    for (let i = durs.size() - 1; i >= 0; --i) {
      const elem = durs.get(i) as unknown as Element;
      let d =
        elem.getAttribute('dur') !== null ? duration2decimal(elem.getAttributeValue('dur')!) : 4.0;
      let dots = elem.getAttribute('dots') !== null ? parseInt(elem.getAttributeValue('dots')!) : 0;
      for (; dots > 0; --dots) d /= 2;
      if (dur > d) dur = d;
    }

    const result = 0.25 / dur;

    if (result < 1) return 1;
    if (result - Math.floor(result) !== 0) return Math.floor(result) + 1;
    return Math.floor(result);
  }

  /**
   * Preprocessing pass 1 of 3: replace every `copyof`/`sameas` placeholder by a deep copy
   * of the element it points at, so the converter never has to chase a reference.
   *
   * Both attributes hold a local reference of the form `#someXmlId`. `copyof` and `sameas`
   * are treated identically here; if an element carries both, `copyof` wins.
   *
   * The outer loop repeats because a placeholder may resolve to a subtree that *contains
   * further placeholders*; each pass rescans the whole document. Two things end it:
   * - no placeholders left — the normal exit;
   * - the same set of references recurring, i.e. a cycle (`a` copies `b` copies `a`). Those
   *   placeholders are unresolvable, so they are reported and deleted from the tree.
   *
   * Note the ids: every `xml:id` **inside** a copy is suffixed with `_meico_<uuid>` so the
   * document keeps unique ids, but the copy's own root id is then overwritten with the
   * placeholder's id — the placeholder's identity survives, its content is replaced. The
   * order in which those UUIDs are drawn is observable in the output and the equivalence
   * tests canonicalise by first occurrence, so **do not reorder these loops**.
   *
   * Scanning starts at the root element, not at `music`: references may point from the
   * music into `meiHead`.
   *
   * Two knowing divergences from `Mei.java`, neither observable on the fixtures:
   * - the cycle test compares the sorted reference lists for equality, where Java compares
   *   two `HashMap.values()` collections with mutual `containsAll` — set semantics, which
   *   ignores multiplicity. A pass that changes only *how often* a reference occurs is a
   *   cycle to Java and progress here;
   * - iteration order is insertion order (a JS `Map`) where Java's `HashMap` order is
   *   unspecified, so the two draw their UUIDs in different orders.
   *
   * @return the XML of the placeholders that could not be resolved (empty if all were), or
   *   null if there is no document
   */
  resolveCopyofs(): string[] | null {
    const e = this.getRootElement();
    if (e === null) return null;

    const notResolved: string[] = [];
    let previousPlaceholders = new Map<Element, string>();

    console.log("Resolving copyofs and sameas's:");

    while (true) {
      const elements = new Map<string, Element>();
      const placeholders = new Map<Element, string>();

      const all = e.query(
        'descendant::*[attribute::copyof or attribute::sameas or attribute::xml:id]',
      );
      for (let i = 0; i < all.size(); ++i) {
        const element = all.get(i) as unknown as Element;

        let a = element.getAttribute('copyof');
        if (a === null) a = element.getAttribute('sameas');
        if (a !== null) {
          let copyof = a.getValue();
          if (copyof.charAt(0) === '#') copyof = copyof.substring(1);
          placeholders.set(element, copyof);
        }

        a = element.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
        if (a !== null) {
          elements.set(a.getValue(), element);
        }
      }

      if (placeholders.size === 0) break;

      // Detect circular references
      const currentValues = [...placeholders.values()].sort();
      const previousValues = [...previousPlaceholders.values()].sort();
      if (
        currentValues.length === previousValues.length &&
        currentValues.every((v, i) => v === previousValues[i])
      ) {
        for (const elem of placeholders.keys()) {
          notResolved.push(elem.toXML());
          const parent = elem.getParent();
          if (parent) parent.removeChild(elem);
        }
        console.error(' circular copyof or sameas referencing detected, cannot be resolved,');
        break;
      }
      previousPlaceholders = placeholders;

      console.log(` ${placeholders.size} copyofs and sameas's ...`);

      for (const [placeholder, copyofId] of placeholders) {
        const found = elements.get(copyofId);

        if (!found) {
          notResolved.push(placeholder.toXML());
          const parent = placeholder.getParent();
          if (parent) parent.removeChild(placeholder);
          continue;
        }

        const copy = found.copy();

        try {
          const parent = placeholder.getParent();
          if (parent) parent.replaceChild(placeholder, copy);
        } catch {
          notResolved.push(placeholder.toXML());
          continue;
        }

        const ids = copy.query('descendant-or-self::*[@xml:id]');
        for (let j = 0; j < ids.size(); ++j) {
          const idElement = ids.get(j) as unknown as Element;
          const idAttr = idElement.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
          if (idAttr) {
            const uuid = `${idAttr.getValue()}_meico_${uuidv4()}`;
            idAttr.setValue(uuid);
          }
        }

        const id = placeholder.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
        if (id !== null) {
          const copyId = copy.getAttribute('id', 'http://www.w3.org/XML/1998/namespace');
          if (copyId) copyId.setValue(id.getValue());
        }
      }
    }

    console.log(' done');

    if (notResolved.length > 0)
      console.log(`The following placeholders could not be resolved:\n${notResolved.toString()}`);

    return notResolved;
  }

  /** alias of {@link Mei.resolveCopyofs}, which already handles `sameas` */
  resolveCopyofsAndSameas(): string[] | null {
    return this.resolveCopyofs();
  }

  /**
   * Preprocessing pass 2 of 3: `rend` elements carry purely visual formatting, and only
   * their text matters to the conversion — so each one is replaced by its own string value
   * and dropped.
   *
   * "Replaced" is generous: the text is **appended to the end of the parent**, not spliced
   * in at the `rend`'s position, so a `rend` in the middle of mixed content moves its text
   * to the back. Java does the same (`parent.appendChild(r.getValue())`), and downstream
   * consumers of these strings — `dynam`, `tempo`, `dir` labels — read the parent's whole
   * value, so the reordering is invisible there. Kept as is.
   */
  removeRendElements(): void {
    const e = this.getMusic();
    if (e === null) return;

    console.log('Replacing rend elements by their values:');

    let count = 0;
    const rends = e.query("descendant::*[local-name()='rend']");
    for (let i = 0; i < rends.size(); ++i) {
      const r = rends.get(i) as unknown as Element;
      const parent = r.getParent();
      if (parent === null) continue;

      parent.appendChild(r.getValue());
      parent.removeChild(r);
      count++;
    }

    console.log(` done, ${count} rends replaced`);
  }

  /**
   * Preprocessing pass 3 of 3: render `expansion` elements, turning the encoding into a
   * "through-composed" one in which every section appears in playing order.
   *
   * Skipped entirely when the converter is given `ignoreExpansions`.
   */
  resolveExpansions(): void {
    console.log('Resolving Expansions:');
    const music = this.getMusic();
    if (music) {
      this.getRootElement()!.replaceChild(music, this._resolveExpansions(music));
    }
    console.log(' done');
  }

  /**
   * Recursive worker for {@link Mei.resolveExpansions}: returns a regularized copy of
   * `root`, which the caller substitutes for `root`.
   *
   * An `expansion`'s `plist` is a space-separated list of `#`-references naming its
   * siblings in playing order — repeats are expressed by naming a sibling twice. The pass
   * is three steps on a deep copy:
   * 1. delete the `expansion` elements themselves (they are instructions, not music), and
   *    read the `plist`. An `expansion` without a `plist` is invalid and is treated as
   *    absent — *not* as an empty plist, which would delete all the music;
   * 2. recurse depth-first over the children (backwards, since children are removed during
   *    the walk), dropping any child that the `plist` does not name;
   * 3. detach all children into an id-keyed map, then re-append them in `plist` order.
   *
   * ### Two known port divergences, both latent — no fixture in the suite has an `expansion`
   *
   * The `catch` in step 3 is Java's repeat mechanism: appending an element that already
   * has a parent throws `MultipleParentException` there, and the handler makes a fresh
   * copy with fresh `meico_expansion_of_…` ids. This port's {@link Element.appendChild}
   * does not throw — it silently detaches the node from its old parent and re-appends it.
   * So the `try` always succeeds, the handler is unreachable, and **a repeated `plist`
   * entry moves the section to its later position instead of duplicating it**: `A B A`
   * plays as `B A`, not `A B A`.
   *
   * Inside that handler, Java additionally rewrites `#`-references among the copy's
   * descendants so they point at the renamed copies (`Mei.java`, the `copyDescendants`
   * loop). This port never implemented it: the loop was present but empty, narrating the
   * intent in comments while doing nothing, and has been removed — the id map
   * `idOldAndNew` is built and, as in the original port, not consumed.
   *
   * Fixing either belongs with the XomTypes work (T17) and a decision about MEI expansion
   * support; both are behaviour changes, so neither is done here.
   */
  private _resolveExpansions(root: Element): Element {
    const regularizedRoot = root.copy();
    const expansion = firstChildElement('expansion', regularizedRoot);
    let plist: string[] | null = null;

    if (expansion !== null) {
      // Remove all expansion elements
      const expansions = regularizedRoot.getChildElements('expansion');
      for (let i = expansions.size() - 1; i >= 0; --i) {
        regularizedRoot.removeChild(expansions.get(i));
      }

      // Parse plist
      if (expansion.getAttribute('plist') !== null) {
        plist = expansion.getAttributeValue('plist')!.trim().replace(/#/g, '').split(/\s+/);
      } else {
        // expansion with no plist is not valid
      }
    }

    // Depth-first resolution
    const children = regularizedRoot.getChildElements();
    for (let i = children.size() - 1; i >= 0; --i) {
      const child = children.get(i);

      if (plist !== null) {
        const childId = attribute('id', child);
        if (childId === null || !plist.includes(childId.getValue())) {
          regularizedRoot.removeChild(child);
          continue;
        }
      }

      regularizedRoot.replaceChild(child, this._resolveExpansions(child));
    }

    // Rearrange children according to plist
    if (plist !== null) {
      const childHash = new Map<string, Element>();

      let child = firstChildElement(regularizedRoot);
      while (child !== null) {
        child.detach();
        const id = getAttributeValue('id', child);
        if (id !== null) childHash.set(id, child);
        child = firstChildElement(regularizedRoot);
      }

      for (const plistEntry of plist) {
        const c = childHash.get(plistEntry);
        if (c === null || c === undefined) continue;

        try {
          regularizedRoot.appendChild(c);
        } catch {
          // Element already has a parent (was already appended)
          const copy = c.copy();
          const idOldAndNew = new Map<string, string>();

          const cs = copy.query('descendant-or-self::*[@xml:id or @id]');
          for (let i = 0; i < cs.size(); ++i) {
            const ce = cs.get(i) as unknown as Element;
            const idAttr = attribute('id', ce);
            if (idAttr) {
              const newId = `meico_expansion_of_${idAttr.getValue()}_${uuidv4()}`;
              idOldAndNew.set(`#${idAttr.getValue()}`, `#${newId}`);
              idAttr.setValue(newId);
            }
          }

          regularizedRoot.appendChild(copy);
        }
      }
    }

    return regularizedRoot;
  }

  /**
   * Give every `measure`, `note`, `rest`, `mRest`, `multiRest`, `chord`, `tuplet`, `mdiv`,
   * `reh` and `section` that lacks an `xml:id` a fresh `meico_<uuid>` one.
   *
   * Not part of the conversion pipeline — the converter mints ids on demand instead. This
   * is for callers who want a source in which everything the MSM can refer to is
   * addressable. Each call draws one UUID per unidentified element, so it is not
   * idempotent in the ids it produces (only in the set of elements it leaves identified).
   * @return how many ids were added
   */
  addIds(): number {
    console.log('Adding IDs to MEI:');
    const root = this.getRootElement();
    if (root === null) {
      console.error(' Error: no root element found');
      return 0;
    }

    const e = root.query(
      "descendant::*[(local-name()='measure' or local-name()='note' or local-name()='rest' or local-name()='mRest' or local-name()='multiRest' or local-name()='chord' or local-name()='tuplet' or local-name()='mdiv' or local-name()='reh' or local-name()='section') and not(@xml:id)]",
    );
    for (let i = 0; i < e.size(); ++i) {
      const uuid = `meico_${uuidv4()}`;
      const a = new Attribute('xml:id', 'http://www.w3.org/XML/1998/namespace', uuid);
      (e.get(i) as unknown as Element).addAttribute(a);
    }

    console.log(' done');
    return e.size();
  }

  /**
   * Split every multi-layer `staff` into one single-layer `staff` per layer, so that the
   * conversion downstream emits **one MSM `part` per MEI layer** instead of one per staff.
   *
   * MEI keeps the voices of a keyboard or divisi staff as sibling `layer` elements inside
   * one `staff`, and {@link Mei2MsmMpmConverter} makes one MSM part per `staffDef` — so
   * those voices are merged into a single part, sharing one MIDI channel and one
   * instrument. This pass rewrites the encoding so each voice arrives as its own staff,
   * and therefore its own part, channel and instrument. It is what you want before
   * per-voice performance rendering, and it is **not** part of the conversion pipeline:
   * the converter never calls it, so the default behaviour is unchanged. Call it yourself
   * before `exportMsm`/`exportMsmMpm`.
   *
   * **This mutates the instance**, like the other preprocessing passes — clone first if
   * the original is still needed. Unlike them it is *not* undone by the converter's
   * `cleanup` flag, because the converter never invokes it.
   *
   * The new staffs are numbered by **string concatenation** of the original `@n` values,
   * `staff@n + layer@n` — staff 2, layer 1 becomes staff `21`. Elements missing an `@n`
   * get a synthetic one: `1000000` for a staff, and `<layer index> * 1000000` for a layer,
   * so the first unnumbered layer of an unnumbered staff becomes staff `10000000`. Each
   * moved layer is renumbered `@n="1"`, since its new staff holds only it.
   *
   * Every `staffDef` is then regenerated: each new staff gets a deep copy of the
   * `staffDef` its original staff referenced (so clef, key, transposition and instrument
   * carry over), renumbered to the new `@n` and appended to the copy's original container;
   * the originals are then detached. The copies are appended in **ascending numeric order**
   * of the new `@n`, which is what keeps the part order in the MSM musically sensible
   * rather than following the order the layers happened to be visited in. A score with no
   * `scoreDef` at all gets one, appended to `score`, holding freshly minted empty
   * `staffDef`s.
   *
   * Two upstream behaviours are reproduced rather than repaired, and both are recorded in
   * PARITY.md §4:
   *
   * - The concatenation scheme is **ambiguous**: staff 1 / layer 11 and staff 11 / layer 1
   *   both yield `111`, and then share a `staffDef` and a part.
   * - `oStaff` elements are matched alongside `staff`, but only their `layer` children are
   *   moved — an `oStaff` holding `oLayer` children yields no new staff and is **dropped**,
   *   because the original is detached unconditionally.
   *
   * Backported from upstream `meico.mei.Mei.layersToStaffs()` (cemfi/meico v0.11.10, with
   * the v0.11.12 fix that inserts the new staffs at the original's position instead of
   * appending them to the end of the measure). It postdates the v0.11.2 reference fork this
   * port is otherwise measured against; see PARITY.md §4.
   */
  layersToStaffs(): void {
    const namespaceURI = this.getRootElement()!.getNamespaceURI();

    for (const mdiv of this.getAllMdivs()) {
      // each mdiv has to be processed individually
      const score = firstChildElement('score', mdiv);
      if (score === null) continue;

      const origStaffDefs = new Map<string, Element>();
      let scoreDef = firstChildElement('scoreDef', score);
      if (scoreDef === null) {
        // add staffDef elements here; if it is not empty at the end, add it to score
        scoreDef = new Element('scoreDef', namespaceURI);
      } else {
        const staffDefs = scoreDef.query("descendant::*[local-name()='staffDef']");
        for (let i = 0; i < staffDefs.size(); ++i) {
          const staffDef = staffDefs.get(i) as unknown as Element;
          const n = staffDef.getAttribute('n');
          if (n !== null) origStaffDefs.set(n.getValue(), staffDef);
        }
      }

      // for each new staff number, what the original staff number was, so the new
      // staffDefs can be generated with the correct original contents
      const newStaffOrigStaff = new Map<string, string>();

      const staffsOriginal = score.query(
        "descendant::*[local-name()='staff' or local-name()='oStaff']",
      );
      for (let s = 0; s < staffsOriginal.size(); ++s) {
        const staff = staffsOriginal.get(s) as unknown as Element;
        const staffContainer = staff.getParent();
        if (staffContainer === null) continue;
        let index = staffContainer.indexOf(staff);

        const nStaff = staff.getAttribute('n');
        const staffN = nStaff !== null ? nStaff.getValue() : '1000000';

        const layers = staff.query("descendant::*[local-name()='layer']");
        for (let l = 0; l < layers.size(); ++l) {
          const layer = layers.get(l) as unknown as Element;
          const nLayer = layer.getAttribute('n');
          const layerN = nLayer !== null ? nLayer.getValue() : String(l * 1000000);

          const newStaffN = staffN.concat(layerN);
          newStaffOrigStaff.set(newStaffN, staffN);

          layer.detach();
          layer.addAttribute(new Attribute('n', '1')); // this staff holds only this layer
          const newStaff = new Element('staff', namespaceURI);
          newStaff.addAttribute(new Attribute('n', newStaffN));
          newStaff.appendChild(layer);
          staffContainer.insertChild(newStaff, ++index); // directly behind the original
        }

        staff.detach(); // replaced by the newly generated staffs
      }

      // generate new staffDefs, ordered by @n; the originals are deleted afterwards
      const numberedStaffDefs = new Map<number, KeyValue<Element, Element>>();
      const unnumberedStaffDefs: KeyValue<Element, Element>[] = [];
      for (const [newStaffN, origStaffN] of newStaffOrigStaff) {
        const origStaffDef = origStaffDefs.get(origStaffN);
        let newStaffDef: Element;
        let container: Element | null;
        if (origStaffDef !== undefined) {
          newStaffDef = origStaffDef.copy();
          container = origStaffDef.getParent();
        } else {
          newStaffDef = new Element('staffDef', namespaceURI);
          container = scoreDef;
        }
        if (container === null) continue;
        newStaffDef.addAttribute(new Attribute('n', newStaffN));

        // cannot append here — the sequence has to follow @n, not visiting order
        const kv = new KeyValue(newStaffDef, container);
        const sortKey = parseInt(newStaffN, 10);
        // A non-numeric @n is out of schema (MEI types staff/@n as data.INT) and makes
        // Java throw NumberFormatException here. Ordering the entry last is strictly more
        // useful than crashing, and cannot affect a conforming encoding.
        if (Number.isNaN(sortKey)) unnumberedStaffDefs.push(kv);
        else numberedStaffDefs.set(sortKey, kv);
      }

      const ordered = [...numberedStaffDefs.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, kv]) => kv);
      ordered.push(...unnumberedStaffDefs);
      for (const kv of ordered) kv.getValue().appendChild(kv.getKey());

      for (const origStaffDef of origStaffDefs.values()) origStaffDef.detach();

      // if a scoreDef had to be generated, and it is not empty, add it to the score
      if (scoreDef.getParent() === null && scoreDef.getChildCount() > 0) {
        score.appendChild(scoreDef);
      }
    }

    // the staffDef copies carry the originals' xml:ids
    this.fixDuplicateIds();
  }

  /**
   * The `layer` element `ofThis` sits in, or null. Walks the parent chain all the way to
   * the document root; Java stops one short of the root element, which makes no difference
   * unless the root itself is a `layer`.
   */
  static getLayer(ofThis: Element): Element | null {
    let e: Element | null = ofThis.getParent();
    while (e !== null) {
      if (e.getLocalName() === 'layer') return e;
      e = e.getParent();
    }
    return null;
  }

  /**
   * A layer's identity for voice-tracking during conversion: its `def`, else its `n`, else
   * the empty string — which is also what a non-`layer` element yields. `def` wins because
   * it names a `layerDef` and is therefore stable across measures where `n` need not be.
   * The empty string is a meaningful value downstream: it means "unlayered", and
   * `isSameLayer` treats it as matching everything.
   */
  static getLayerId(layer: Element | null): string {
    if (layer === null || layer.getLocalName() !== 'layer') return '';
    if (layer.getAttribute('def') !== null) return layer.getAttributeValue('def')!;
    if (layer.getAttribute('n') !== null) return layer.getAttributeValue('n')!;
    return '';
  }

  /** the `staff` element `ofThis` sits in, or null; see {@link Mei.getLayer} */
  static getStaff(ofThis: Element): Element | null {
    let e: Element | null = ofThis.getParent();
    while (e !== null) {
      if (e.getLocalName() === 'staff') return e;
      e = e.getParent();
    }
    return null;
  }

  /** a staff's identity, `def` before `n`; see {@link Mei.getLayerId} */
  static getStaffId(staff: Element | null): string {
    if (staff === null || staff.getLocalName() !== 'staff') return '';
    if (staff.getAttribute('def') !== null) return staff.getAttributeValue('def')!;
    if (staff.getAttribute('n') !== null) return staff.getAttributeValue('n')!;
    return '';
  }
}
