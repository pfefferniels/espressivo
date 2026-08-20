import meico.msm.Msm;
import meico.mpm.Mpm;
import meico.mpm.elements.Performance;
import meico.mpm.elements.Part;
import meico.mpm.elements.maps.*;
import meico.midi.Midi;
import nu.xom.*;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;

/**
 * `subNoteDynamics` reference data.
 *
 * No fixture in meico-ts sets it: every <volume> entry in the corpus carries mandatory="true",
 * so only the non-sub-note branch of DynamicsMap is ever reached and every channelVolumeMap
 * has exactly one entry, at date 0. This builds the other branch — a transition with
 * subNoteDynamics on, which makes DynamicsMap emit a continuous channelVolume ramp.
 *
 * Modelled on GenerateAllMapsReference's helpers so the output is comparable with that family.
 */
public class GenerateSubNoteDynamicsReference {
    public static void main(String[] args) throws Exception {
        File out = new File(args[0]);
        out.mkdirs();
        // The two halves of the same rule, so the fixture pins the DIFFERENCE and not just one side.
        generate(out, "subnote_dynamics_on",  true);
        generate(out, "subnote_dynamics_off", false);
        System.out.println("Done.");
    }

    private static void generate(File out, String name, boolean subNote) throws Exception {
        Msm msm = simpleMsm(name);
        Mpm mpm = Mpm.createMpm();
        Performance perf = Performance.createPerformance("test performance", 720);
        mpm.addPerformance(perf);

        TempoMap tempoMap = TempoMap.createTempoMap();
        tempoMap.addTempo(0, "120", 0.25);
        perf.getGlobal().getDated().addMap(tempoMap);

        DynamicsMap dyn = DynamicsMap.createDynamicsMap();
        // A transition from 40 to 120 across the whole score. With subNoteDynamics the map is
        // sampled continuously; without it, one entry at the instruction's own date.
        dyn.addDynamics(0.0, "40", "120", 0.0, 0.0, subNote);
        dyn.addDynamics(2880.0, "120", "40", 0.4, 0.2, subNote);
        Part mpmPart = Part.createPart("Piano", 1, 0, 0);
        mpmPart.getDated().addMap(dyn);
        perf.addPart(mpmPart);

        write(new File(out, name + ".msm"), msm.toXML());
        write(new File(out, name + ".mpm"), mpm.toXML());
        write(new File(out, name + "_augmented.msm"), perf.perform(msm).toXML());
        Midi expressive = msm.exportExpressiveMidi(perf, true);
        if (expressive != null) expressive.writeMidi(new File(out, name + "_expressive.mid"));
        else System.out.println("  WARNING: expressive MIDI null for " + name);
    }

    private static Msm simpleMsm(String title) {
        Msm msm = Msm.createMsm(title, null, 720);
        Element part = Msm.makePart("Piano", 1, 0, 0);
        Element dated = part.getFirstChildElement("dated");
        dated.getFirstChildElement("timeSignatureMap").appendChild(Msm.makeTimeSignature(0, 4, 4, null));
        Element score = dated.getFirstChildElement("score");
        int[] pitches = {60, 62, 64, 65, 67, 69, 71, 72};
        for (int i = 0; i < pitches.length; i++) {
            Element note = new Element("note");
            note.addAttribute(new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", "n" + (i + 1)));
            note.addAttribute(new Attribute("date", Double.toString(i * 720.0)));
            note.addAttribute(new Attribute("midi.pitch", Double.toString(pitches[i])));
            note.addAttribute(new Attribute("pitchname", "x"));
            note.addAttribute(new Attribute("accidentals", "0.0"));
            note.addAttribute(new Attribute("octave", "3.0"));
            note.addAttribute(new Attribute("duration", "720.0"));
            score.appendChild(note);
        }
        Element sectionMap = msm.getGlobal().getFirstChildElement("dated").getFirstChildElement("sectionMap");
        Element section = new Element("section");
        section.addAttribute(new Attribute("date", "0.0"));
        section.addAttribute(new Attribute("date.end", "5760.0"));
        section.addAttribute(new Attribute("xml:id", "http://www.w3.org/XML/1998/namespace", "sec1"));
        sectionMap.appendChild(section);
        msm.addPart(part);
        msm.setFile(new File(title + ".msm"));
        return msm;
    }

    private static void write(File f, String s) throws IOException {
        try (FileWriter w = new FileWriter(f)) { w.write(s); }
        System.out.println("  Wrote: " + f.getName());
    }
}
