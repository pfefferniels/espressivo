import { Svg } from './Svg.js';

/**
 * This class interfaces a collection of SVGs.
 * One such SVG is one page of the score. This class comprises the whole score.
 * Port of meico.svg.SvgCollection
 *
 * @author Axel Berndt
 */
export class SvgCollection {
    protected svgs: Svg[] = [];
    protected title: string = "";

    /**
     * constructor
     * @param svgs optional array of Svg objects
     */
    constructor(svgs?: Svg[]) {
        if (svgs !== undefined) {
            this.svgs = svgs;
        }
    }

    /**
     * set a title for this collection
     * @param title
     */
    setTitle(title: string): void {
        this.title = title;
    }

    /**
     * get the title of this collection
     * @return
     */
    getTitle(): string {
        return this.title;
    }

    /**
     * returns the number of SVGs in this collection
     * @return
     */
    size(): number {
        return this.svgs.length;
    }

    /**
     * add an SVG to the collection
     * @param svg
     */
    add(svg: Svg): void {
        this.svgs.push(svg);
    }

    /**
     * remove an SVG from the collection by index
     * @param index
     * @return the Svg that was removed from the list
     */
    removeSvgAt(index: number): Svg {
        const removed = this.svgs.splice(index, 1);
        return removed[0];
    }

    /**
     * remove an SVG from the collection by reference
     * @param svg
     * @return true if this list contained the specified element
     */
    removeSvg(svg: Svg): boolean {
        const idx = this.svgs.indexOf(svg);
        if (idx !== -1) {
            this.svgs.splice(idx, 1);
            return true;
        }
        return false;
    }

    /**
     * is there some data in this collection?
     * @return
     */
    isEmpty(): boolean {
        return this.svgs.length === 0;
    }

    /**
     * access the element at the specified index
     * @param index
     * @return
     */
    get(index: number): Svg {
        return this.svgs[index];
    }

    /**
     * a getter to access the collection of SVGs
     * @return
     */
    getSvgs(): Svg[] {
        return this.svgs;
    }

    /**
     * exports all SVGs as strings
     * @return an array of XML strings, or null entries if errors occurred
     */
    writeSvgs(): (string | null)[];
    /**
     * exports all SVGs as strings with page number added to filename
     * @param filename the filename string; it should include the path and the extension, page numbers will be added automatically
     * @return an array of XML strings, or null entries if errors occurred
     */
    writeSvgs(filename: string): (string | null)[];
    writeSvgs(filename?: string): (string | null)[] {
        const results: (string | null)[] = [];

        if (filename !== undefined) {
            const lastDot = filename.lastIndexOf('.');
            const name = lastDot > 0 ? filename.substring(0, lastDot) : filename;
            const extension = lastDot > 0 ? filename.substring(lastDot) : '';

            for (let i = 0; i < this.svgs.length; ++i) {
                const pageNum = String(i).padStart(4, '0');
                results.push(this.svgs[i].writeSvg(name + "-" + pageNum + extension));
            }
        } else {
            for (const svg of this.svgs) {
                results.push(svg.writeSvg());
            }
        }

        return results;
    }
}
