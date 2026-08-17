# Welte-Mignon Roll Scholarship & Roll-Fidelity Debates — Verified Sub-Survey

(Delivered 2026-08-10 by the literature team's Welte-fidelity sub-agent; every
item verified at source per its method note; [unverified] tags preserved.
Archived verbatim by the conductor; design implications drawn in SURVEY.md §4.)

NOTE: full text of the sub-agent report follows; see git history for
provenance. Key design-shaping findings extracted by the conductor:

1. TEMPO UNCERTAINTY IS STRUCTURAL (Hall, Pianola Journal 22 (2012) 3-9):
   red Welte rolls were designed for one speed but late rolls require unknown
   slower speeds; the same roll on the same instrument plays at different
   tempi (Hagmann 1984, Seewen measurements). Hall's sharpest question: "how
   do you tell if it is an eccentric old-fashioned interpretation playing at
   the correct speed, or a more conventional approach at the wrong one?"
   ⇒ Level-invariant comparison (the shape component; optionally level+gain-
   invariant) is a musicological REQUIREMENT for roll corpora, not a bonus
   product. The level/gain/shape decomposition is the module's answer.
2. DYNAMICS MAY BE EDITORIAL (Hall PJ14; Simonton/Lawson/Peetz/Reinhart
   debate unresolved; Reinhart: "the raw data required a highly skilled
   editor"): an analyst must be able to run timing-only comparisons,
   excluding dynamics as potentially editorial.
   ⇒ Dimension-selective comparison (weights incl. 0) is first-class.
3. ASYNCHRONY MAY BE ARTIFACT (Hagmann's "künstliches Arpeggio": the
   two-zone dynamic split can force asynchrony indistinguishable from
   intention) ⇒ same dimension-selectivity argument; report should let
   asynchrony be examined in isolation.
4. HALL'S PROHIBITION ("it can be misleading to attack a music roll with a
   ruler") ⇒ JND-thresholded reporting is the methodological defense: the
   module surfaces differences ABOVE perceptual thresholds and keeps
   sub-threshold mass in the remainder row, resisting over-precise claims.
5. THE VALIDATION CASES the field itself uses are roll-vs-disc pairs of the
   same artist (Busoni Chopin op.15/2: Welte 441 vs Columbia L1432 — anchors
   BOTH the sceptical and confirmatory arguments; Scheurer's list of
   same-artist roll+disc pairs was built expressly for this).
   ⇒ When such pairs exist as MPM encodings, they are the module's natural
   evaluation corpus.
6. Named positions table (Schonberg/Tinan | Hagmann/Hall/Köpp |
   Lawson/Caswell/Simonton/Peetz | Reinhart/Howat | Peres da Costa) — the
   README's musicological framing should cite this debate as the use case:
   dimension-exact, threshold-aware comparison of roll-encoded performances
   is what this literature has needed and measured by hand (Gottschewski
   1996; Bärtsch 2020; Köpp 2023).

---

## (a) ANNOTATED BIBLIOGRAPHY (verbatim from the sub-agent)

### 1. Denis Hall — Pianola Journal

All back issues free at https://www.pianola.org/journal/journal.cfm.

- Hall, "The Reproducing Piano — what can it really do?" PJ 14 (2001): 3–26.
  Six measurable factors (pitch, duration, placing, dynamics, sustaining
  pedal, una corda); notes/timing/pedalling captured automatically, dynamics
  NOT; no pneumatic action plays more than one dynamic level per half-keyboard
  — melody/accompaniment separation "has to be faked" by microscopic time
  offsets, "this deception does take place almost all the time".
- Hall, "Whose Fingers on What Piano?" PJ 8 (1995): 5–12. Recording piano vs
  playback piano problem; Bauer's letters; firms minimized by tying both to
  the same brands (Welte: Feurich or Steinway).
- Hall, "The Early Recordings for the Welte-Mignon." PJ 16 (2005): 33–48.
- Hall, "Recording Welte-Mignon Piano Rolls in Germany." PJ 16 (2005): 49–52.
  Forensic reconstruction of Simonton's 1950 account (mercury trough, carbon
  rods, inked rollers); measured implied resolution ~0.06"/~0.16" marks at
  9¾ ft/min — "probably too short to extract really meaningful data";
  ex-employee Lydia Reinbolz (1976 interview by Hans-W. Schmitz) recalled
  double-length second masters. Verdict: "barely adequate."
- Hall, "Piano Roll Speeds." PJ 22 (2012): 3–9. THE tempo-uncertainty
  article: "Tempo langsamer stellen" rolls with non-constant required
  reduction; two copies of Busoni's Don Juan roll 1323 cut to different
  lengths; Paderewski Chopin op. 25/9 Duo-Art 6097 marked Tempo 90 matches
  his Welte 1253 and 1924 Victor disc only at Tempo 80.
- Also: "Duo-Art Rolls" PJ 10 (1998); "A Window in Time — a response" PJ 12
  (1999); "How Do You Like Your Debussy?" PJ 23 (2013): 27–37; "The
  Russians, the Welte-Mignon and the Duo-Art" PJ 25 (2016): 31–35;
  "Alexander Scriabin and his Piano Rolls" PJ 25 (~37–41 [unverified]);
  "Paderewski and the Player Piano" PJ 21 (2010); Hall & Farmer, "Kenneth
  Caswell (1931–2018)" PJ 26 (2019).

### 2. Rex Lawson

- Lawson, "On the Right Track — Dynamic Recording for the Reproducing Piano
  (Part One)." PJ 20 (2009): 3–58. Strongest PRO-automation position,
  explicit disagreement with Hall: Welte subtlety appears "in places that
  were musically unimportant… where no recording producer… would have
  bothered to dally"; either "an enormous team of genius roll-editors" (no
  evidence) or an automatic system; reconstructs a complete automatic marking
  system from 1900s components; "Simonton and his colleagues were not
  reliable purveyors of historical accuracy."
- Parts Two–Five: PJ 21 (2010) Hupfeld Dea; PJ 22 (2012); PJ 23 (2013)
  Ampico; PJ 26 (2019) Duo-Art patents. [page ranges unverified]
- Lawson, "Cleaning the Windows of Time." PJ 12 (1999). [pages unverified]

### 3. Peter Hagmann — foundational sceptical study (CORRECTED CITATION)

- Hagmann, Das Welte-Mignon-Klavier, die Welte-Philharmonie-Orgel und die
  Anfänge der Reproduktion von Musik. Bern/Frankfurt/New York: Peter Lang,
  1984. (Europäische Hochschulschriften 36/10.) ISBN 3-261-03464-5.
  Dissertation BASEL (not Freiburg — Freiburg's UB merely hosts the free
  2002 digital edition: https://freidok.uni-freiburg.de/data/608).
  Chapters: "Getreue Wiedergabe des Künstlerspiels?" (46), "Zum Problem der
  Manipulation" (67), "Zum Tempo-Problem" (81), "Zum Problem der
  Anschlagsdifferenzierung" (107), conclusion (149). Evidence: measurements
  on two Welte-Mignon pianos + Philharmonie organ, Seewen collection, three
  sessions (1978–1980). Five problem areas relativizing the fidelity claim,
  incl.: recording method unknown, editing "muss auch für Welte angenommen
  werden"; transport speed not reliably normed (same roll, same instrument,
  different tempi); the "künstliches Arpeggio" — split-keyboard dynamics make
  asynchrony possibly a technical necessity, aurally indistinguishable from
  intention. Relays Roman Flury's finding: Welte transfers average ~12%
  longer than disc recordings of same interpretations (Busoni Chopin
  Nocturne op. 15/2: Welte 441 vs Columbia L 1432). REJECTS the conclusion
  that rolls are worthless for interpretation history.

### 4. Gerhard Dangel / Augustinermuseum Freiburg

- Dangel & Schmitz, Welte-Mignon Klavierrollen: Gesamtkatalog der
  europäischen Aufnahmen 1904–1932. Stuttgart, 2006. ISBN 3-00-017110-X.
  Online database: http://www.welte-mignon.de/kat/ (Augustinermuseum + UB
  Freiburg). [pagination unverified]
- Dangel (ed.), Aus Freiburg in die Welt. 100 Jahre Welte-Mignon. Freiburg:
  Augustinermuseum, 2005 (centenary exhibition catalogue).
- Dangel, "Die Firma Welte und die Welte-Philharmonie-Orgeln weltweit" in
  Wie von Geisterhand (Seewen 2011), open access:
  https://www.hkb-interpretation.ch/publikationen/monographien-und-sammelbaende/wie-von-geisterhand
- Scheurer, "Das Welte-Mignon als Spiegelbild der romantischen
  Interpretationskunst" (same volume, open-access PDF) — maps Welte artists
  onto five 19th-c. pianistic schools; compiles same-artist roll+disc pairs
  expressly for the authenticity debate.

### 5. What Welte dynamics encode — the debate

- Hänggi & Köpp (eds.), «Recording the Soul of Music». Welte-Künstlerrollen
  für Orgel und Klavier als authentische Interpretationsdokumente? Symposium
  Seewen 2013. Seewen/Bern 2017. 184 pp. ISBN 978-3-9523397-4-9. Open
  access. Contents incl. Rumsey "The Speed of Welte's Organ Rolls"; Hennig
  "Dynamik auf der Philharmonie-Orgel"; Debrunner "Von der Welte-Rolle zur
  parametrisierbaren Wiedergabe auf synthetischen Instrumenten"; Bärtsch
  "Welte vs. Audio"; Torbianelli/Bausch "Welte-Künstlerrollen als
  Interpretationsquellen?"; Köpp "Künstlerrollen im Kontext"; Fulton "How
  the Welte Pipe-Organ Rolls Were Made".
- Bärtsch, "Welte vs. Audio. – Chopins vielbesprochenes Nocturne Fis-Dur
  op. 15/2 im intermedialen Vergleich" (pp. ~106–127). Cleanest intermedial
  control: Busoni same nocturne Welte 1905 vs disc 17 years later; rubato
  and text deviations "keineswegs medienspezifisch oder zufällig"; but
  refuses to over-generalize; criticizes Peres da Costa BY NAME for equal
  treatment of audio and Welte sources on three spot-checks.
- Köpp, "Interpretationsanalyse an Welte-Mignon Klavierrollen – Ein
  quellenkritischer Versuch am Beispiel von Debussys Einspielungen." In
  Popović & Mutter 2023: 127–162. Pins the scepticism's historiography on
  Schonberg, "From Leschetizky to Gabrilovitch," High Fidelity 14/3 (1964):
  6f. ("Basically, then, piano rolls are to be distrusted… What they can do
  is to give the scholar and professional musician an index of style").
  Köpp's periodisation rebuttal: before the electric microphone (1925/26)
  discs are no more reliable than rolls for dynamics/nuance/pedalling.
- Peetz, "Das Welte-Mignon-T100-Aufnahmeverfahren: Aktuelle
  Forschungsergebnisse zur Dynamikerfassung." Das Mechanische
  Musikinstrument, April 2004: 7–24; and "Achtung! Streng geheim!…" 32/95
  (2006). Mark-width encodes dynamics theory. [verified only as citations]
- Reinhart, "The Welte-Mignon Recording Process in Germany." PJ 16 (2005):
  3–32. Best map of the camps ("polar opposite camps"); names Caswell as
  "adamant" pro-automation; middle position: "the raw data required a highly
  skilled editor"; the editor's role "never addressed in any of the
  published accounts"; names the editors: Buchali, Burkard, Haass, Berthold
  Welte. Pro-capture evidence: Ravel roll 2888 inconsistent inner-voice
  accents; 1,000+ recordings issued 1905–6. Welte "sought the live
  performance," Aeolian "the studio performance."
- Reinhart, "Scriabin and the Welte-Mignon: A Different Perspective." PJ 16
  (2005): 53–56.
- Bärtsch, Klavierspiel um 1905 im Spiegel des Welte-Mignon-Systems. PhD
  diss., Bern, 2020. DOI 10.48549/4302. [full text unverified — anti-bot
  wall; abstract read]. Method: FIRST a source-critical methodology for roll
  information, THEN four interpretive situations × two recordings (Beethoven
  op. 111; Liszt Don Juan; Debussy & Saint-Saëns concert waltzes; Hungarian
  Rhapsodies by Reisenauer and Stavenhagen "nach persönlicher Erinnerung an
  Franz Liszt"). Four analytic categories: Strukturverdeutlichung,
  performative Emergenz, 19th-c. influence, Konfabulation vs Tradierung.
- Winkels, Ludwig van Beethovens Mondschein-Sonate auf
  Welte-Mignon-Künstlerrollen: unter dem Aspekt der Dynamik und des Tempos.
  Frankfurt a.M., 2002. [known only via Köpp fn. 24]

### 6. Scholarship USING Welte rolls as performance evidence

- Gottschewski, Die Interpretation als Kunstwerk. Musikalische
  Zeitgestaltung und ihre Analyse am Beispiel von
  Welte-Mignon-Klavieraufnahmen aus dem Jahre 1905. Laaber, 1996. 332 pp. +
  graphics + CD. ISBN 3-89007-309-3 (PhD Freiburg 1993). THE substantial
  musicological study built on Welte rolls (Zeitgestaltung theory). Related:
  "Graphic Analysis of Recorded Interpretations," Computing in Musicology 8
  (1992): 93–96; "Tempoarchitektur," Musiktheorie 1993/2: 99–117; keynote in
  Softwaregestützte Interpretationsforschung (2023): 19–49.
- Popović & Mutter (eds.), Claude Debussy: die Klavieraufnahmen. Wolke,
  2023. 503 pp. ISBN 978-3-95593-407-1. OPEN ACCESS:
  https://www.wolke-verlag.de/wp-content/uploads/230811_Debussy.pdf
  Flagship modern volume treating Welte rolls as performance evidence.
  Howat's chapter re-dates the six Debussy rolls (2733–2736, 2738–2739) to
  SUMMER 1912 (Paris session, ~140 rolls, 19 artists; Granados Archives
  letters unearthed by Lawson & Hall); Paris serials run in alphabetical
  order of performer (2719 Angiéras → 2888 Ravel) — allotted later in
  Freiburg. Contents also incl. Dodson on D'un cahier d'esquisses, Senn
  "Artful Destabilization: Tempo Rubato in… Danseuses de Delphes", Köpp's
  source-critical chapter, Kabisch on La Cathédrale engloutie.
- Howat, "Debussy and Welte." PJ 7 (1994): 3–18. First systematic use of
  rolls for a critical edition (Durand Œuvres complètes); four-tier taxonomy
  of roll variants (correction / "R" auxiliary staff / barely-plausible list
  / ignored fluffs); La Cathédrale engloutie tempo changes resolving the
  6/4/3/2 metre problem; the "Serenade for the doll" una-corda attribution
  question ("Did Debussy disobey his own instruction? Or did Welte's editor
  … edit out this counterproductive-seeming soft pedal?"); Mme de Tinan
  "always insisted… the Welte rolls were a poor representation of Debussy's
  playing," excepting La soirée dans Grenade.
- Peres da Costa, Off the Record: Performing Practices in Romantic Piano
  Playing. OUP, 2012. Uses audio + Welte + other rolls on equal footing —
  challenged by Bärtsch (above).
- Mahler: four rolls, 9 Nov 1905, Leipzig. Active transcription work:
  Wodehouse/Ooms/Phillips on WM 769 (Sym 5 Trauermarsch), 4th Global Piano
  Roll Meeting, Stanford, 7 Aug 2026; same programme: Gottschewski on roll
  editors in earliest Welte years (WM0198, Condon Collection);
  Bärtsch/d'Avila/Facchini "What Shall We Do with Dynamics in Roll
  Research?"; Widuch on the Freiburg/Leipzig studios; Bausch "Deciphering
  the Hupfeld DEA Expression System." (Conference papers, not yet
  peer-reviewed.)
- Grieg (3 rolls, Apr 1906): no dedicated peer-reviewed study found —
  honest gap. Saint-Saëns: case in Bärtsch 2020 + Gottschewski CD. Busoni:
  the single most-tested case (anchors both camps). Scriabin: Reinhart PJ16,
  Hall PJ25 (six rolls/nine pieces 1910, Russian session of 233 rolls).
  Reger: Hagmann's abandoned starting point (~30 rolls); no separate study —
  honest gap.
- Secondary load-bearing: Smith & Howe, The Welte-Mignon: Its Music and
  Musicians (Vestal Press/AMICA, 1994) — the standard roll listing; König,
  PJ 18 (2007); Hamilton, After the Golden Age (OUP 2008).

## (b) Research questions by scholar — see full table in conductor extraction
(Hagmann: fidelity/manipulation/tempo/asynchrony-attribution; Hall: which of
six factors survive the medium, speed-vs-interpretation ambiguity, the
anti-ruler prohibition; Lawson: automatic-marking reconstruction, the
genius-editors dilemma; Reinhart: provable vs supportable, inconsistent
inner-voice accents, 1905–6 throughput, the named editors; Köpp: rolls vs
pre-1926 discs as sources, composer-authority; Howat: dating, missing
serials, una-corda attribution, variant taxonomy, transfer variability;
Bärtsch: roll/disc convergence, Peres da Costa's method, slow-music bias,
source-critical methodology first, dynamics in roll research.)

## (c) Named positions in the fidelity debate

| Position | Named holders |
|---|---|
| Rolls fundamentally untrustworthy | Schonberg (1964); Mme de Tinan (on Debussy) |
| Fidelity claim relativised, rolls still valuable | Hagmann (1984); Hall; Köpp |
| Welte dynamics genuinely auto-recorded | Lawson; Caswell; Simonton; Peetz |
| Middle: some capture, editor indispensable | Reinhart; Howat |
| Rolls on par with audio as evidence | Peres da Costa (2012) — challenged by Bärtsch |

## (d) Unverified/gaps (verbatim tags preserved)
Bärtsch 2020 full text; Peetz's own texts; Dangel/Schmitz pagination;
Winkels publisher/pagination; Lawson Parts 2–5 + PJ12 page ranges; Hall
Scriabin PJ25 pages; 2017 Seewen chapter page ranges; NO dedicated
peer-reviewed Grieg or Reger roll studies exist (real literature gaps);
2026 GPRM papers unpublished.
