# W0 Survey — Musicology & MIR Literature on Comparing Performances

Campaign: performance-comparison module for espressivo (meico-ts). Written 2026-08-10.
Scope: what performance-analysis research measures, how it compares performances, and
what that implies for a module that computes distances and edit paths between MPM
documents.

## Verification standard

Every citation below was checked against a primary online source during this session
(publisher pages, open-access PDFs read in full, Crossref/OpenAlex/DBLP/DataCite APIs,
ISMIR/ICMC proceedings archives, arXiv, K10plus MARC, project sites, or repository
source code). Where a full text was read, quoted numbers and formulas come from the
paper itself. Anything that could not be confirmed at source is marked **[unverified]**
and must not be cited without re-checking. Citation errors that are in circulation are
marked **⚠** with the correction.

The session's WebSearch budget was exhausted partway through (200/200); everything after
that point was verified by direct fetch, DOI resolution, Crossref/PubMed/DBLP APIs and
proceedings archives, all of which work without search. Coverage of very recent
(late-2025 / 2026) work is therefore thinner than the rest, and is flagged as such in §6.

**Where to find what the design work asked for:**

- **§4.0** — perceptual thresholds and JND constants, each tagged **[literature]** with a
  verified citation or **[convention]** where the literature supplies none. Answers
  SURVEY.md **A-Q3**.
- **§6.0** — verdicts on the three open questions: **A-Q11** (novelty claim: confirmed in
  the narrow form, with what was searched), **A-Q8** (scapes: confirmed central, promote
  from stretch), **A-Q3** (weights: partially grounded).
- **§3** — research questions of working musicologists; **§5** — gaps and opportunities.

**Welte-Mignon roll scholarship is incorporated by reference.** The full verified
bibliography for that strand lives in `comparison/survey-lit-welte.md` and is **not
duplicated here**. §1.6 carries only its six design-shaping implications (W-1…W-6), which
feed §4 and §5.

**Corrections to premises this survey started with** — carry these forward:

1. Hudson's own terms are **"earlier rubato"** and **"later rubato"**, not
   "contrametric" and "agogic". The contrametric/agogic pair is Rosenblum's. (§1.6)
2. Sapp's "hybrid numeric/rank" metric combines Pearson correlation with **rank-based
   scapeplot coverage**, **not** Spearman. The strings "Spearman" and "Kendall" occur in
   neither the 2007 nor the 2008 paper. (§1.2)
3. The SUPRA paper's author order is **Shi, Sapp, Arul, McBride, Smith**. (§1.6)
4. Hagmann's Welte dissertation was submitted at **Basel**; Freiburg hosts the free
   digital edition. (§1.6)
5. Zhang & Dixon's ICASSP 2023 paper is **"Disentangling the Horowitz Factor"**, not
   "Symbolic Disentangled Representations for Expressive Piano Performance". (§1.4)
6. **partitura has no `velocity_trend`, `velocity_dev`, `pedal_trend` or
   `pedal_articulation`** — those belong to the Basis Mixer lineage. Verified by
   grepping the repository. (§1.5)
7. There is **no `movementMap` in the published MPM schema**; it exists only in meico.
   (§5)
8. **Cancino-Chacón et al. (2018) contains no equations at all.** It is the paper that
   complains formal definitions do not exist; it is not a source of them. (§1.5)
9. No paper titled "Melodic similarity through tree edit distance" exists in the
   Rizo/Iñesta corpus. (§1.7)
10. MIREX Symbolic Melodic Similarity reports **AP**, not MAP. (§1.8)
11. **Repp never used MDS.** His toolkit is PCA, correlation, curve-fitting and ANOVA.
    The dendrogram-style clustering of his *Träumerei* data was done by Almansa &
    Delicado (2009). (§1.1)

---

# §1 Annotated bibliography

## §1.1 Classic empirical performance research

The founding question of this literature is exactly ours: given many performances of one
piece, what is shared and what is individual? The answers are unusually well quantified,
and several of them are negative results that constrain what a comparison module can
honestly claim.

### Repp — the measurement backbone

**Repp, Bruno H. (1990). "Patterns of expressive timing in performances of a Beethoven
minuet by nineteen famous pianists." *Journal of the Acoustical Society of America*
88(2), 622–641. DOI 10.1121/1.399766.**
Nineteen commercial recordings, inter-onset intervals measured from waveforms. PCA
reduced the timing variation to two orthogonal factors, the first being **phrase-final
lengthening**. Explicitly refutes Clynes's universal "Beethoven pulse": "No constant
pulse was found at the surface in any of the performances."
*Lesson for MPM comparison:* the first principal component of a timing corpus is
phrase-final lengthening — i.e. structure, not identity. A distance that does not
factor this out is mostly measuring the score.

**Repp, Bruno H. (1992). "Diversity and commonality in music performance: An analysis of
timing microstructure in Schumann's 'Träumerei'." *JASA* 92(5), 2546–2568.
DOI 10.1121/1.404425.**
The canonical multi-performance study: 28 recorded performances by 24 pianists (Cortot
and Horowitz contribute three each), inter-tone onset intervals measured throughout.
Global timing patterns track the hierarchical grouping structure — pronounced ritardandi
at ends of major sections, expressive lengthening of accented tones within melodic
gestures. Local within-gesture ritardandi fit a **parabolic timing function**, a
one-parameter family. Repp's framing of the two constraints: grouping structure and the
parabola are "the two major constraints under which pianists are operating. Within these
constraints, there is room for much individual variation."
*Lesson:* agreement is high at the global level and divergence grows as you descend the
structural hierarchy — so report distance **per hierarchical level**, never as one
number.

**Repp, Bruno H. (1995). "Expressive timing in Schumann's 'Träumerei': An analysis of
performances by graduate student pianists." *JASA* 98(5 Pt 1), 2413–2427.
DOI 10.1121/1.413276.**
Students were "quite comparable to the experts" on average, but PCA showed them "much
more homogeneous": their differences "seemed to represent mainly variations around a
common performance standard… whereas expert performances exhibited a variety of
underlying timing patterns."
*Lesson:* variance around the norm is itself a measurable quantity and it tracks
expertise. A comparison module should be able to report "how far from the corpus centroid"
as a first-class statistic, not only pairwise distance.

**Repp, Bruno H. (1998). "A microcosm of musical expression. I. Quantitative analysis of
pianists' timing in the initial measures of Chopin's Etude in E major." *JASA* 104(2
Pt 1), 1085–1100.** [DOI unverified; page range verified]
**115 commercial recordings**, bars 1–5, Varimax-rotated PCA yielding four "timing
strategies". The decisive negative result, in his own words: "**there were no distinct
clusters of timing patterns. Rather, the space of possibilities seemed to be 'sampled' by
individual performers in a rather continuous way.**" Sociocultural correlates were weak:
recording date correlated +0.27 with PC-I and −0.39 with PC-II — "timing is becoming more
typical or mainstream" — and "French pianists were less likely to have Type I timing
profiles than their Polish and Russian colleagues."
*Lesson:* **expect no clusters.** A dendrogram that produces crisp schools is a
suspicious result in this field, not a strong one. Design the corpus product to show
continuous structure (embedding, nearest-neighbour ranking) rather than to force
partitions.

**Repp, Bruno H. (1999). "A microcosm of musical expression. II. Quantitative analysis of
pianists' dynamics in the initial measures of Chopin's Etude in E major." *JASA* 105(3),
1972–1988. DOI 10.1121/1.426743.**
Same corpus, dynamics instead of timing. Again "no clustering of performances into
distinct groups was apparent", and timing and dynamics were **uncorrelated** at this
local level.
*Lesson:* timing and dynamics are empirically near-independent channels at the local
level. That is a positive argument for per-dimension decomposition rather than a fused
scalar.

**Repp, Bruno H. (1999). "A microcosm of musical expression. III. Contributions of timing
and dynamics to the aesthetic impression of pianists' performances of the initial
measures of Chopin's Etude in E major." *JASA* 106(1), 469–478. DOI 10.1121/1.427078.**
Regression of expert aesthetic ratings on 16 measured timing/dynamics variables accounted
for only **9–18% of the variance** for real recordings (versus 53% for synthesized
performances varying in timing alone). Conclusion: "very different patterns of timing and
dynamics are aesthetically acceptable."
*Lesson:* **calibrate ambitions.** A tempo/dynamics distance measures performer
*identity* reasonably and aesthetic *quality* barely at all. Never present distance as a
proxy for quality or for how different two performances *sound*.

**Repp, Bruno H. (1997). "The aesthetic quality of a quantitatively average music
performance: Two preliminary experiments." *Music Perception* 14(4), 419–444.
DOI 10.2307/40285732.**
The mathematical average of 10 student *Träumerei* performances was rated **second
highest in quality** while **second lowest in individuality**.
**Replicated:** Wolf, A., Kopiez, R., Platz, F., Lin, H.-R., & Mütze, H. (2018).
"Tendency Towards the Average? The Aesthetic Evaluation of a Quantitatively Average Music
Performance." *Music Perception* 36(1), 98–108. DOI 10.1525/mp.2018.36.1.98. N = 205,
Germany and Taiwan: "The average performance was rated better than the individual
performances… (large effect size)."
*Lesson:* the **mean performance is a musically legitimate object**, not an artefact.
This is the empirical answer to Clarke's objection that averaging "may have little value"
(§1.6), and it licenses using a corpus norm as the reference against which two documents
are compared.

**Repp, Bruno H. (1996). "Patterns of note onset asynchronies in expressive piano
performance." *JASA* 100(6), 3917–3932. DOI 10.1121/1.417245.**
Ten graduate pianists, three pieces (*Träumerei*, Debussy *La fille aux cheveux de lin*,
Chopin Prelude in D♭), each twice, Yamaha Disklavier, onsets sensed from hammer motion.
"A pervasive tendency was found for the highest-pitched notes (usually the principal
melody) to lead lower-pitched notes, especially those played with the same hand. Inner
notes of within-hand chords tended to lag behind outer notes." Strong correlations with
MIDI velocity led Repp to the **velocity-artifact** hypothesis.
*Lesson:* asynchrony is structured (outer voices lead, inner voices lag) and is
correlated with dynamics — so an asynchrony distance and a dynamics distance are **not
independent** and must not be summed as if they were.

**Repp, Bruno H. (1996). "Pedal Timing and Tempo in Expressive Piano Performance: A
Preliminary Investigation." *Psychology of Music* 24(2), 199–221.
DOI 10.1177/0305735696242011.** And **Repp, B. H. (1997). "The effect of tempo on pedal
timing in piano performance." *Psychological Research* 60(3), 164–172.
DOI 10.1007/BF00419764.**
The only sustained empirical work on pedalling as an expressive parameter; pedal timing
is tempo-dependent and does not scale proportionally.
*Lesson:* pedal is a real expressive channel with its own tempo-dependence. MPM encodes
it only through meico's unschematised `movementMap` (§5) — so pedalling is a
known-missing dimension, not an oversight to be quietly ignored.

**⚠ [unverified] Repp never used multidimensional scaling.** If you have seen "Repp did
MDS", that is a misattribution, most likely to **Almansa, J. & Delicado, P. (2009).
"Analysing musical performance through functional data analysis: rhythmic structure in
Schumann's Träumerei." *Connection Science* 21(2–3), 207–225.
DOI 10.1080/09540090902733848**, who applied functional data analysis and clustering to
Repp's *Träumerei* data. Their specific cluster memberships are [unverified].

### Todd — parametric models of the tempo/dynamics arch

**Todd, Neil P. McAngus (1985). "A Model of Expressive Timing in Tonal Music." *Music
Perception* 3(1), 33–57. DOI 10.2307/40285321.**
**Todd, N. P. McAngus (1992). "The dynamics of dynamics: A model of musical expression."
*JASA* 91(6), 3540–3550. DOI 10.1121/1.402843.**
**Todd, N. P. McAngus (1995). "The kinematics of musical expression." *JASA* 97(3),
1940–1949. DOI 10.1121/1.412067.**
The kinematic/"musical motion" family: tempo and dynamics are modelled as arch-shaped
functions over the phrase hierarchy, composed additively across levels, with the
1995 paper grounding the shape in constant-deceleration kinematics.
*Lesson:* the field's default model of a tempo or dynamics curve is **a sum of
parametric shapes indexed by phrase level**. That is precisely how MPM encodes them
(a `tempo` element with `transition.to` and `meanTempoAt` *is* a shape primitive), so a
shape-aware comparison is closer to the literature than a pointwise curve difference.
Note ⚠ a pagination discrepancy for the 1985 paper: Crossref gives 33–57, some secondary
sources 33–58.

### Palmer — structure, and asynchrony as a deliberate device

**Palmer, Caroline (1989). "Mapping musical thought to musical performance." *Journal of
Experimental Psychology: Human Perception and Performance* 15(2), 331–346.
DOI 10.1037/0096-1523.15.2.331.**
Six pianists, beginnings of Mozart K. 331 and a Brahms intermezzo, electronic keyboard.
Analysed chord asynchronies among other things and found both melody lead and bass
anticipation.
**Palmer, Caroline (1996). "On the Assignment of Structure in Music Performance." *Music
Perception* 14(1), 23–56. DOI 10.2307/40285708.** (See also **Palmer (1996), "Anatomy of
a Performance: Sources of Musical Expression," *Music Perception* 13(3), 433–453,
DOI 10.2307/40286178.**)
Argues that melody lead is a **deliberate expressive device** by which performers mark
voice structure — the position Goebl (2001) then tests and largely overturns.
**Palmer, Caroline (1997). "Music Performance." *Annual Review of Psychology* 48(1),
115–138. DOI 10.1146/annurev.psych.48.1.115.**
The standard review. Its three-stage account of performance (interpretation → planning →
movement) is the frame Cancino-Chacón et al. (2018) use to observe that computational
models "focus almost exclusively on the planning process".
*Lesson:* the intentional-vs-mechanical status of asynchrony is a **live scholarly
dispute**, not settled fact. A module that reports an asynchrony difference should report
it as a difference in the encoding, and leave the interpretive question open.

### Goebl — the melody-lead correction, and asynchrony at corpus scale

**Goebl, Werner (2001). "Melody lead in piano performance: Expressive device or
artifact?" *JASA* 110(1), 563–572. DOI 10.1121/1.1376133.**
[Full text read: `https://iwk.mdw.ac.at/goebl/papers/Goebl_JASA2001_melodyLead.pdf`]
The pivotal experiment. 22 skilled pianists, Chopin Ballade op. 38 (45 bars) and Etude
op. 10/3 (21 bars), Bösendorfer SE290. Prior studies measured onsets at the
**hammer–string** contact; Goebl additionally reconstructs **finger–key** contact times
from the action's velocity-dependent travel time. Result, verbatim from the abstract:
"the melody lead decreases almost to zero at the finger-key level, which supports the
velocity artifact hypothesis." Predicted asynchronies derived from hammer-velocity
differences alone correlate with observed melody lead at mean r = 0.66 (Etude, right
hand), 0.58 and 0.50 (Ballade right/left hand), up to 0.79 for the Ballade third voice,
right hand (Table I(b), 22 pianists).
*Lesson:* **a large part of measured within-hand melody lead is a mechanical consequence
of dynamic differentiation, not an independent expressive choice.** For MPM this is
sharp: if two documents differ in `dynamicsMap` they will *mechanically* differ in
realised asynchrony on a real instrument. An asynchrony distance must either be taken as
a difference in the symbolic instruction (safe) or explicitly modelled against velocity
(hard) — but never reported as an independent expressive finding without that caveat.

**Goebl, W., Flossmann, S., & Widmer, G. (2010). "Investigations of Between-Hand
Synchronization in Magaloff's Chopin." *Computer Music Journal* 34(3), 35–44.**
[Full text read: `https://iwk.mdw.ac.at/goebl/papers/GoeblFlossmannWidmer-CMJ2010-Async.pdf`]
The largest quantitative study of asynchrony, on the Magaloff corpus (essentially the
complete Chopin, hundreds of thousands of notes). Reference points it establishes:
principal instruments in classical trios lead by 30–50 ms (Rasch 1979); bass
anticipations precede other notes by **70 ms or more** (Vernon 1936; Goebl 2001); melody
lead is ~30 ms and "is best explained as an artifact of the different key and hammer
velocities (Repp 1996; Goebl 2001)". They report that Magaloff's bass anticipations fall
predominantly on **strong beats** (0.66% of simultaneous events are off-beat
anticipations).
**The most transferable device in the paper** is their automatic detector for Hudson's
*earlier* rubato: an "out-of-sync region" is a run of consecutive asynchronies each
**larger than the typical perceptual threshold (30 ms)**, admitted only if the run
contains more events than the piece's average events-per-second.
*Lesson:* this is a directly implementable analytic on MPM's `asynchronyMap` — a
**30 ms perceptual floor plus a density-based run criterion** turns a raw asynchrony
difference into a named historical category ("earlier rubato"). Copy it.

Supporting instrument-side work, all verified on Goebl's publication list
(`https://iwk.mdw.ac.at/goebl/allpubl.html`): **Goebl & Bresin (2003), "Measurement and
reproduction accuracy of computer-controlled grand pianos," *JASA* 114(4), 2273–2283,
DOI 10.1121/1.1605387**; **Goebl, Bresin & Galembo (2005), "Touch and temporal behavior
of grand piano actions," *JASA* 118(2), 1154–1165, DOI 10.1121/1.1944648**;
**Goebl, Bresin & Fujinaga (2014), "Perception of touch quality in piano tones," *JASA*
136(5), 2839–2850, DOI 10.1121/1.4896461**.
*Lesson:* the measurement chain has a known, quantified error budget. Any distance
reported below that budget is noise.

### Gabrielsson and Clarke — the field's own reviews and critiques

**Gabrielsson, Alf (1999). "The Performance of Music." In D. Deutsch (ed.), *The
Psychology of Music*, 2nd edn., 501–602. DOI 10.1016/b978-012213564-4/50015-9.**
**Gabrielsson, Alf (2003). "Music Performance Research at the Millennium." *Psychology of
Music* 31(3), 221–272. DOI 10.1177/03057356030313002.**
The two standard syntheses of the empirical tradition, covering timing, dynamics,
articulation, and the emotional-expression literature. Use them for the pre-2003 canon
rather than reconstructing it.

**Clarke, Eric F. (2004). "Empirical Methods in the Study of Performance." Ch. 5 in
E. Clarke & N. Cook (eds.), *Empirical Musicology: Aims, Methods, Prospects*, 77–102.
Oxford University Press. ISBN 0-19-516749-X.**
Four critiques that a comparison module will meet by name:
- *Recordings are not transparent evidence.* "there is nothing straightforward or
  transparent about recordings as historical sources" — non-standardised speeds, the
  intrusiveness of mechanical-era recording, tape editing (citing Day 2000: master tapes
  with "150 splices").
- *The baseline problem.* Defining expression as departure from notation "regards the
  score as 'the piece' in a kind of disembodied, ahistorical fashion"; *notes inégales*
  and over-dotting show some "departures" are implicit in the notation itself.
- *Against averaging.* The reproducibility principle "runs counter to a fundamental
  principle in musical performance — the idea that performance is a recreative, rather
  than reproductive, act", so "the average of a set of performances… may have little
  value." (Repp 1997 and Wolf et al. 2018 are the empirical counterweight.)
- *The reification charge* — the one aimed squarely at edit paths: "many of the empirical
  methods described in this chapter have led to a thoroughgoing **reification of
  performance** — to a view of performance that treats it as a **thing rather than a
  process**… the tendency is to convert performance, in one way or another, into
  something that is **disturbingly like a score**."
*Lesson:* an edit path between two performances is the most literal possible instance of
the reification charge. Pre-empt it: present the path as a **finding aid that points at
passages to listen to**, not as the analysis.

---

## §1.2 The CHARM / Mazurka tradition — comparison as a research programme

This is the closest existing precedent to what the module must do, and the only tradition
that has built and shipped inter-performance similarity metrics for musicological use.

**The Mazurka Project.** `https://mazurka.org.uk` (⚠ TLS certificate expired — reachable
with cert checking relaxed). Directed by **Nicholas Cook** (Royal Holloway); data capture
by **Andrew Earis** (RCM); analysis by **Craig Sapp**. Funded by AHRC under CHARM.
Data still downloadable: a complete mazurka discography (51 performances of Op. 6/1
alone); **beat-by-beat tempo spreadsheets** for Opp. 17/4, 24/2, 30/2, 33/2, 59/3, 63/3,
68/3; dynamics spreadsheets; **reverse-conducting (tap-along) data** for 52+ performances
per mazurka; onset-detection and power-curve outputs; Sonic Visualiser plugins.
**Directly relevant detail:** the discography marks roll-sourced performances with a
subscript **PR** — "A subscript PR after a performer's name indicates that the
performance was recorded by piano roll." The corpus already treats roll-derived
performances as a distinct evidential class.
*Lesson:* **provenance is a first-class field.** Copy the PR convention: an MPM derived
from a roll scan, one hand-authored in MPM Toolbox, and one exported by meico from MEI
are three categorically different objects and the report must say which is which.

**Sapp, Craig Stuart (2007). "Comparative Analysis of Multiple Musical Performances."
*ISMIR 2007*, Vienna, 497–500.**
`https://ismir2007.ismir.net/proceedings/ISMIR2007_p497_sapp.pdf`
The **timescape/scape plot**: split a beat-indexed feature series into **all** contiguous
sub-sequences (6 beats → 21 sub-sequences), arrange them in a triangle with time on the
x-axis and sub-sequence length on the y-axis, compute Pearson correlation between the
reference performance and every other performance over each span, and colour each cell
with the hue of the **single best-correlating performance** — "the actual correlation
values are thrown away." Data: beat times hand-marked in Sonic Visualiser (tapping SD
60–80 ms, reduced to ~11 ms by independent repetition; ~1% data-error rate post-1980, 3%
for 1920s recordings); dynamics from raw power `10·log₁₀((1/N)Σxₙ²)` smoothed by a
**two-pass forward-and-reverse (zero-phase) exponential filter** `y[n] = αx[n] +
(1−α)y[n−1]`, α = 0.2, sampled ~70 ms after each beat onset. To correlate tempo and
dynamics jointly the two series are **interleaved**, with loudness z-scored onto tempo's
mean and SD so neither dominates. Practical finding: **including the average of all
performances as a pseudo-performance suppresses spurious random matches.** Results:
identifies a documented teacher/student pair, and reliably pairs three Rubinstein
recordings spanning 25 years.
*Lesson:* the single most transferable construction in the literature. Compute similarity
**at every position and every timescale**, not once globally.

**Sapp, Craig Stuart (2008). "Hybrid Numeric/Rank Similarity Metrics for Musical
Performance Analysis." *ISMIR 2008*, Philadelphia, 501–506.**
`https://ismir2008.ismir.net/papers/ISMIR2008_240.pdf`
**The single most important methodological paper for this campaign.** The motivating
problem is exactly ours, verbatim: "The correlation values are consistent only in
relation to a particular composition, and these absolute values cannot be compared
directly between different mazurkas." The modal correlation between two *random*
performances is **0.67 for Mazurka 17/4 but 0.87 for 68/3** — so 0.80 is above average in
one piece and poor in another.
The metric cascade, verified from the PDF:
- **S0** = Pearson correlation,
  `Pearson(x,y) = Σ(xₙ−x̄)(yₙ−ȳ) / √(Σ(xₙ−x̄)²·Σ(yₙ−ȳ)²)`.
- **S1** = the fraction of the scapeplot area a target performance covers for a given
  reference.
- **S2** = coverage of the most dominant performance, which is then *removed* and the
  plot recomputed, iteratively — defeating the "**Hatto effect**" in which one
  near-identical performance floods the plot.
- **S3** = split the database at the median into a **"noise floor"** (the worse-matching
  half) and the rest; reinsert each non-noise performance *individually* alongside the
  whole noise floor; its coverage area is its S3 score.
- **S4** = `√(S3 · S3ᵣ)` — the **geometric mean of the forward and reverse queries**,
  because "S3 scores are not symmetric: the score from A to B is not the same value as
  from B to A"; the geometric mean is preferred over the arithmetic "since it penalizes
  the final score if the type-3 and its reverse scores are not close to each other. For
  example, the arithmetic mean between 0.75 and 0.25 is 0.50, while the geometric mean is
  lower at 0.43."
**Features:** beat tempo, **smoothed tempo** (phrase architecture), **residual/desmoothed
tempo** `c = a − b` (the mazurka's short-first-beat metrical accentuation), beat
dynamics, and a 50/50 tempo+dynamics admixture.
**Evaluation:** ground truth = find the same pianist among ~60 others. Average rank
improves from **R0 = 4.97 to R4 = 2.70** — S4 is 3–4× better than plain correlation on all
five mazurkas and all features. For Horowitz 1971→1985, S0 ranks the true match 13th, S4
ranks it 1st. Forensic application: the "Cortot" Concert Artist disc matches Cortot's
Sony master-class recording only at rank 35 of 36 — evidence it is not Cortot.
*Lesson:* **a raw correlation is not a portable number.** Convert similarity into a rank
or coverage statistic against a background population; symmetrise asymmetric scores with
a geometric mean; and note the corollary — **two MPM files alone cannot tell you whether
0.8 is close.** A corpus is a prerequisite for a calibrated distance.

**Sapp's hierarchical correlation pages.** `https://mazurka.org.uk/ana/hicor/` (read in
full). His own statement of why a scalar distance fails: two beat-tempo sequences
correlate at r = 0.235, and "**This value is virtually meaningless**, and two mostly
random sequences could also generate a similar correlation value. The fact that there are
two arches in the blue sequence and one arch in the red sequence **cannot be described in
the single correlation number**." Extended to **polycorrelation plots**, which colour each
region by *which* performance is closest — a nearest-neighbour map over a corpus.
*Lesson:* the field's own critique of the scalar distance predates ours. An edit path is
well suited to answering it, because it is a *localised* object whose per-region cost
profile is closer to a scape than a scalar is.

**Cook, Nicholas (2007). "Performance analysis and Chopin's mazurkas." *Musicae
Scientiae* 11(2), 183–208.** Abstract verified at
`https://charm.rhul.ac.uk/studies/p6_6.html`. ⚠ CHARM gives 183–208; some indexes give
183–207.
**The single most important citation for the distance-matrix question.** With Earis and
Sapp, Cook characterises Paderewski's Op. 17/4 against late-twentieth-century
performances and examines relationships among interpretations of Op. 68/3. "**A possible
performance genealogy** of performances of the latter is proposed, in which recordings by
Rubinstein and Cortot play a key role, while **clustering based on Pearson correlation of
tempo data yields relationships supported in one instance by documented teacher/pupil
relationships.**" His verdict: "these findings are encouraging in that it appears possible
to draw meaningful conclusions from the consideration only of tempo data."
*Lesson:* **performance genealogy is the use case musicologists actually want** from a
distance matrix — and note Cook's own hedge, "in one instance". Lineage confirmation is
presented as suggestive, not validated.

**Cook, Nicholas (2001). "Between Process and Product: Music and/as Performance." *Music
Theory Online* 7(2).** `https://mtosmt.org/issues/mto.01.7.2/mto.01.7.2.cook.html`
The programmatic essay: recordings are "an archive of acoustical texts comparable in
extent and significance to the notated texts around which musicology originally came into
being." Identifies the fork the field still lives with — **large-scale statistical style
analysis** (Philip, Bowen), where "an essentially inductive approach of this kind does not
easily provide the kind of insight into the specific qualities of specific interpretations
that score-based analysis characteristically offers", versus **score-relative analysis**,
which risks reinstating the page-to-stage hierarchy. **⚠ This article does not discuss
Repp or the phrase arch** — do not cite it for that.

**Cook, Nicholas (2013). *Beyond the Score: Music as Performance.* Oxford University
Press. 458 pp. ISBN 978-0-19-935740-6. DOI 10.1093/acprof:oso/9780199357406.001.0001.**
The empirical/comparative core is chs. 5 ("Close and Distant Listening", 135–175), 6
("Objective Expression", 176–223) and 11 ("The Ghost in the Machine", 337–373). Chapter
titles and page ranges verified via Crossref; **chapter contents [unverified]** (OUP
Academic is Cloudflare-blocked). The "Close and Distant Listening" title adopts the
Moretti distant-reading framing that also drives the scape plots.

**Leech-Wilkinson, Daniel (2009). *The Changing Sound of Music: Approaches to Studying
Recorded Musical Performance.* London: CHARM.**
`https://charm.rhul.ac.uk/studies/chapters/intro.html` (read in full).
⚠ **Two conflicting ISBNs on the site itself**: 1-897791-21-6 in the preliminaries,
978-1-912466-33-7 in the footer. His prescribed citation form is **by chapter and
paragraph**, not page.
Methodological claims that bear on a comparison module:
- *Why measurement at all:* "One can talk about how a painting looks, **without having to
  invoke measurement**, in far more detail than one can talk about how a piece of music
  sounds… the only words we use that are specific to hearing are loud and quiet."
  Measurement is a prosthesis for a missing descriptive vocabulary, not an end.
- *Explicit scope limit* (ch. 1 ¶47): "The book is entirely concerned with
  moment-to-moment details. **It doesn't cover the statistical investigation of large data
  sets** which, as we have seen from recent work by Cook and Sapp on Chopin mazurkas, and
  by Spiro, Gold and Rink using the same data, **can offer a powerful approach to
  understanding style**."
- *On backward inference* (ch. 6 ¶22): "these kinds of studies of recordings, arguing
  backwards, **don't permit reliable historical discoveries; they do help us rethink our
  own view of the music**."
- *The phrase-arch historicisation* (ch. 7 ¶12, citing Sapp): "As Craig Sapp's graphical
  analyses of Chopin mazurkas show so clearly, **expressivity operated typically from
  moment to moment earlier in the 20th century, and at the next level up, from phrase to
  phrase more commonly later on**." ⚠ Attribute this to Leech-Wilkinson/Sapp — **no Cook
  passage critiquing the phrase arch was reachable** [unverified].
*Lesson:* the "period style, not universal" claim about the phrase arch is a **claim about
which timescale carries the expressive action** — precisely what a multi-scale distance
can measure. This is the strongest single argument for building the scape.

**Cook, N. & Leech-Wilkinson, D. "A musicologist's guide to Sonic Visualiser." CHARM.**
`https://charm.rhul.ac.uk/analysing/p9_1.html` (read in full). Opens with the field's
most quoted disclaimer: "**You don't need special techniques to analyse recordings**:
important work has been done using nothing more complicated than a CD player and a pencil
to mark up a score, or a stopwatch to measure the duration of movements… But it's possible
to make your observations more precise, to sharpen your hearing."

**Cook, N. & Sapp, C. "Purely coincidental? Joyce Hatto and Chopin's Mazurkas." CHARM.**
`https://charm.rhul.ac.uk/projects/p2_3_2.html`
The field's proof that quantitative inter-performance comparison can settle a question of
fact — the Hatto recordings identified as appropriated from other pianists.
*Lesson:* note carefully **what it proves: identity of provenance, not stylistic kinship.**
That is the one claim a distance can make at full strength.

**Spiro, N., Gold, N. & Rink, J. (2010). "The form of performance: analyzing pattern
distribution in select recordings of Chopin's Mazurka Op. 24 No. 2." *Musicae Scientiae*,
CHARM special issue 'Towards a musicology of recordings'.**
The other methodological pole to Cook's correlation clustering: 29 performances analysed
with **Self-Organising Maps** to identify "recurrent expressive patterns and their
location within the respective performances", plus a within-performer comparison of three
Rubinstein recordings. Conclusion: "the structure of the music **as performed** emerges
from and is defined by the performance patterns."
*Lesson:* **within-performer distance is the field's built-in null model.** No
between-performer distance is interpretable without it.

**CHARM's own methodological self-description** (`https://charm.rhul.ac.uk/about/about.html`)
is unusually candid and worth quoting in the design document: the Mazurka project used
visualisations designed to represent relationships between performances "**in strictly
objective terms**: this is an approach derived from MIR… the purpose of which is to
explore **how far complex cultural phenomena can (or cannot) be represented by patterns of
uninterpreted data**."

**Earis, Andrew (2007). "An algorithm to extract expressive timing and dynamics from
piano recordings." *Musicae Scientiae* 11(2), 155–182.** The data-capture half of the
Mazurka Project.

---

## §1.3 The performance worm — tempo–loudness trajectories

**Langner, J. & Goebl, W. (2003). "Visualizing Expressive Performance in Tempo–Loudness
Space." *Computer Music Journal* 27(4), 69–83. DOI 10.1162/014892603322730514.**
[Full text read: `https://iwk.mdw.ac.at/goebl/papers/Langner-Goebl_CMJ2003.pdf`]
The paper that specifies the computation. Timing comes from score–performance matching at
a **"track level" faster than the notated beat** (sixteenths for Chopin op. 10/3), from
which tempo in BPM relative to the notated beat is derived. Loudness is **not** MIDI
velocity: a Zwicker-model implementation converts audio to loudness in **sones** (Bark
critical bands, spectral and temporal masking), sampled every 11.6 ms, with one value per
track point taken as the **maximum within ±½ inter-track interval**, deliberately so a
loud note falling between track points is not missed. Both curves are then smoothed with
**overlapping Gaussian windows**, "window size" defined as the time between the left and
right **points of inflection**. Table 1's actual sizes: 2.486 s, 2.896 s, 3.212 s for
three performers — the **mode performed bar duration**, computed per performer and
quantised to 10 ms; a half-bar window of 1.606 s is shown for comparison. The paper is
explicit that "**The choice of window size is arbitrary and can be set by the
investigator.**" Regularities reported as trajectory *shape*: motion to the lower left at
phrase boundaries, tempo apex preceding loudness apex, a general counterclockwise
tendency. **Similarity measure: none — comparison is explicitly visual.**
*Lesson:* smoothing scale is a **musical** parameter. Set the window from the piece's own
mode bar/beat duration per document and compare at matched structural scales — a single
delayed note appears as a "ritardando loop" at quarter-note windows and vanishes at bar
level. And note that the canonical two-parameter performance space shipped with **no
distance function at all**; any metric here is our own contribution.

**Langner, J. & Goebl, W. (2002). "Representing Expressive Performance in Tempo–Loudness
Space." Proc. ESCOM 10th Anniversary Conference, Liège, CD-ROM.** The origin of the
representation; full text not obtained.

**Dixon, S., Goebl, W. & Widmer, G. (2002). "The Performance Worm: Real Time Visualisation
of Expression Based on Langner's Tempo-Loudness Animation." *ICMC 2002*, Göteborg,
361–364.** `https://quod.lib.umich.edu/i/icmc/bbp2372.2002.073/`
⚠ **Two authentic title variants circulate** — the long form above (ICMC archive,
Widmer's list, the *AI Magazine* reference list) and a short form ("…based on Langner's
representation") in Goebl's own later bibliographies. Cite the archive form. ⚠ **Unit
discrepancy: the Worm plots loudness in dB SPL; Langner & Goebl plot sones.**
States the comparison motive outright: "what is it that distinguishes one great artist
from another — what makes a Horowitz a Horowitz."

**Dixon, S., Goebl, W. & Widmer, G. (2002). "Real Time Tracking and Visualisation of
Musical Expression." *ICMAI 2002*, LNAI 2445, 58–68. DOI 10.1007/3-540-45722-4_7.**
[Full text read: `https://www.ofai.at/papers/oefai-tr-2002-04.pdf`]
The real-time algorithm. Audio → RMS amplitude in 10 ms blocks; onsets as peaks in the
slope of the smoothed amplitude; tempo induction clusters **inter-onset intervals**
weighted by the geometric mean of onset amplitudes, sweeping candidate periods from
**100 ms to 2500 ms in 10 ms steps**, merging clusters that are multiples/divisors, with
competing agents (BeatRoot). **Crucially, both trajectories are smoothed "over the past
via an exponential decay function"** — not the Gaussian of the offline method.
*Lesson:* there are **two different worms** in the literature — a causal
exponentially-decayed real-time one and a symmetric Gaussian offline one. For comparing
two documents offline, use the symmetric Gaussian; exponential decay introduces a
systematic lag that shows up as a spurious phase difference between two otherwise
identical curves.

**Widmer, G., Dixon, S., Goebl, W., Pampalk, E. & Tobudic, A. (2003). "In Search of the
Horowitz Factor." *AI Magazine* 24(3), 111–130. DOI 10.1609/aimag.v24i3.1722.**
[Full text read: `https://www.ofai.at/~werner.goebl/papers/Widmer-etal_AIMag2003.pdf`]
Source of the **"performance alphabet"**: beat-level tempo and loudness trajectories are
cut into **short fixed-length segments (e.g. two beats)**, *optionally* mean- and/or
variance-normalised "to abstract away from absolute tempo and loudness and/or absolute
pattern size", clustered, and each cluster prototype assigned a letter — so a performance
becomes a **string**. Figure 7's alphabet came from a **self-organizing map**; Figure 9 is
captioned a "24-Letter Performance Alphabet". Cluster usage per pianist is visualised with
smoothed data histograms, and — the key trick — **the joint SDH of all pianists is
subtracted from each individual SDH** so that commonalities cancel and idiosyncrasies
emerge. Discriminative substrings were found by a levelwise frequent-itemset search
selecting patterns with **low entropy of occurrence across pianists**: e.g. `FAVT` occurs
7× in Barenboim, 2× in Pires, 1× in Uchida, 0× elsewhere.
**The honest negative result is the most valuable part.** Asked whether the "typical
Horowitz pattern" of Figure 11 is real, the authors answer "**A closer analysis shows that
the answer is no.**" Most instances were **not perceptible**; the characteristic little
accelerando "is essentially the result of a temporal displacement of a single melody
note"; several occurrences were **artifacts of segment boundaries**. They further warn
that 8–10 occurrences are too few for significance, that a pattern absent as a substring
may simply be coded by a slightly different character sequence, and that they have **no
objective criterion for choosing the optimal alphabet**.
*Lesson:* **discretising continuous curves into a symbolic alphabet is not
distance-preserving.** Near-identical curves can land in different clusters and score as
maximally dissimilar. If we build a symbolic edit path over MPM instructions, we must
validate every "characteristic difference" against the underlying continuous rendering and
against segment-boundary artifacts.

**Widmer, G. (2003). "Discovering simple rules in complex data: A meta-learning algorithm
and some surprising musical discoveries." *Artificial Intelligence* 146(2), 129–148.
DOI 10.1016/S0004-3702(03)00016-X.**
PLCG (Partition, Learn, Cluster, Generalize). The musical payoff is note-level
timing/articulation rules. From the *AI Magazine* companion: 13 Mozart sonatas by Roland
Batik, >106,000 performed notes, melody notes only → 41,116 training notes, each described
by **29 attributes**; PLCG learned **17 rules**; rule TL2 alone correctly predicts 1,894
lengthenings = **14.12% of all significant lengthenings** with 588 counterexamples,
precision .763; four rules together cover ~23%. Note also that its targets are
**discrete classes with thresholds**: ritardando if local tempo >2% slower than the
previous note; crescendo if louder than predecessor *and* than the piece average;
staccato <80% of nominal, legato >1.0, else portato.
*Lesson:* if we want *explanations* for why two documents differ rather than a distance,
a coverage/precision-optimised rule learner over note-level context features is the tested
approach — and **expect low coverage (14% for the best single rule) to be a good result**.

**Goebl, W., Pampalk, E. & Widmer, G. (2004). "Exploring Expressive Performance
Trajectories: Six Famous Pianists Play Six Chopin Pieces." *ICMPC8*, 505–509; also OFAI
TR-2004-06.** [Full text read: `https://ofai.at/papers/oefai-tr-2004-06.pdf`]
The most methodologically explicit worm-comparison study, and **the recipe to copy**.
36 performances (3 Nocturnes, 3 Préludes; Arrau, Ashkenazy, Harasiewicz, Pires, Pollini,
Rubinstein), >2 hours. Phrase-segmented into 1–2-bar units → >1600 two-dimensional time
series, filtered to **1216 segments**, each **cubically interpolated to exactly 25 data
pairs** so segments are comparable. Then an explicit three-parameter sweep: **5
normalisation forms** (none; subtract mean; divide by mean — the latter two at *global
piece mean* or *local phrase mean*), **5 smoothing levels** (none, and Gaussian windows of
0.5, 0.75, 1 or 2 beats *either side*), and a continuous **tempo↔loudness weighting**.
All parametrisations feed **aligned self-organizing maps** so the user can slide a
parameter and watch clusters deform continuously.
*Lesson:* treat **normalisation level, smoothing width and the relative weight of the
tempo axis versus the dynamics axis as explicit, swept parameters of the comparison**, not
as hidden constants. Resample every segment to a fixed length before comparing.

**Goebl, W. & Widmer, G. (2009). "On the Use of Computational Methods for Expressive Music
Performance." In Crawford & Gibson (eds.), *Modern Methods for Musicology*, 93–113.
Ashgate.** [Full text read.]
Candid on the worm's limits: "Limitations of this way of showing performance are the loss
of detail due to data smoothing and the **absence of performance measures other than
expressive tempo and (overall) loudness**." Worked example: Brendel vs. Gould, Beethoven
op. 15 mvt. II, bars 1–4 — Brendel makes the accelerando/ritardando + crescendo/decrescendo
arch, Gould does the opposite.
*Lesson:* the worm is deliberately blind to articulation, voicing and asynchrony. Two
documents can be **worm-identical while differing in exactly the dimensions that carry
identity** (§1.4). This is the argument for MPM-native, per-map comparison.

**Widmer, G. & Tobudic, A. (2003). "Playing Mozart by Analogy: Learning Multi-level Timing
and Dynamics Strategies." *JNMR* 32(3), 259–268.** and **Tobudic, A. & Widmer, G. (2006).
"Relational IBL in Classical Music." *Machine Learning* 64, 5–24.
DOI 10.1007/s10994-006-8260-4.**
Elementary tempo and dynamics *shapes* are predicted at several levels of the phrase
hierarchy and **composed additively** with note-level predictions from a local model. A
K.280 rendition produced this way won second prize at RENCON'02.
*Lesson:* model a curve as **a sum of shapes at multiple phrase levels plus a local
residual**. That decomposition is also the natural way to *compare* two documents, since
it separates "differs in overall phrase arch" from "differs in note-level detail" — and it
is exactly Sapp's smoothed/residual tempo split arrived at independently.

---

## §1.4 Performer identification and performance-style clustering

This is where the field learned **which expressive dimensions carry identity** and **what
reference to compare against**. Both answers are counter-intuitive and both should shape
the module's defaults.

**Stamatatos, E. (2002). "Quantifying the Differences between Music Performers: Score vs.
Norm." *ICMC 2002*, Göteborg, 376–382; also OFAI TR-2002-13.**
[Full text read: `https://icsdweb.aegean.gr/stamatatos/papers/ICMC02.pdf`]
22 pianists on a Bösendorfer SE290, Chopin Etude op. 10/3 (bars 1–21) and Ballade op. 38
(bars 1–45). Exactly **three melody-only features**, all deviations from a reference:
**IOI** (timing), **OTD** off-time duration (articulation — the gap or overlap between one
note's offset and the next note's onset), and **DL** dynamic level. The contribution is
the choice of reference: the **norm** (average performance of pianists #01–#12) versus the
printed score. Two distance forms, `Dr = Σ((xᵢ−yᵢ)/xᵢ)/n` (relative) and
`Ds = Σ(xᵢ−yᵢ)/n` (simple); ANOVA showed `Dr` fits score-deviation features and `Ds` fits
norm-deviation features. Classifier: discriminant analysis with Mahalanobis distance,
10 held-out pianists, 4 segments of 20 soprano notes. Leave-one-out accuracies norm vs.
score: **77.5 / 57.5 / 57.5 %** vs. **42.5 / 42.5 / 32.5 %**. Cross-validation across
pieces (correct out of 10): norm Ballade-1→Ballade-2 = **9/10**, Ballade-1→Etude = 4/10,
Etude→Ballade-1 = 3/10; score-based 7/10 and 1/10. Also: individual pianists have lopsided
discriminatory power (#02 high in dynamics, low in articulation; #05 the reverse), and
**"extreme" performances make poor norms**.
*Lesson:* **subtract a norm (mean over performances of the same piece), not the flat
score.** Deviation-from-score is dominated by shared, piece-driven structure and makes
different performers look alike.

**Stamatatos, E. & Widmer, G. (2005). "Automatic identification of music performers with
learning ensembles." *Artificial Intelligence* 165(1), 37–56.
DOI 10.1016/j.artint.2005.01.007.**
[Full text read: `https://icsdweb.aegean.gr/stamatatos/papers/AIJ.pdf`]
⭐ **The key paper for which dimension carries identity.** Same corpus. An ensemble of 10
deliberately simple classifiers: **C11** on norm-deviation IOI/OTD/DL; **C21–C24** on
score-deviation features; **C31–C35** on **melody-lead** features — the onset-time and
dynamic-level offsets between the melody voice and the accompanying voices of a chord.
Combination by weighted majority voting. Intra-piece training accuracies: C11 = **82.5%**,
C31 = 57.5%, C35 = 47.5%. Inter-piece test (train on the Ballade, test on the whole Etude,
10 classes, baseline 10%): individual experts get 3–5 of 10; the **ensemble gets 7/10**,
and no single base classifier got pianists #14, #18 and #22 right — only the
meta-classifier did.
**The finding, quoted from the Discussion:** "it turns out that features related to
**articulation (staccato vs. legato) and melody lead are the most informative**, followed
by aspects of tempo and timing and, **finally, dynamics**. This may be of interest to the
field of performance research in musicology, where timing is still the expressive
dimension that is most often investigated."
*Lesson:* **weight articulation and asynchrony above tempo, and tempo above dynamics, for
identity questions.** This inverts both musicology's habitual focus and the worm's
two-parameter projection — and it maps directly onto MPM's `articulationMap` and
`asynchronyMap`, which no prior tool exploits.

**Saunders, C., Hardoon, D. R., Shawe-Taylor, J. & Widmer, G. (2004). "Using String
Kernels to Identify Famous Performers from Their Playing Style." *ECML 2004*, LNCS 3201,
384–395. DOI 10.1007/978-3-540-30115-8_36. — ECML'04 Best Paper.** Journal version:
*Intelligent Data Analysis* 12(4), 2008. ⚠ **Page range disputed**: DBLP says 425–440,
Widmer's own list 425–450; IOS Press 403s.
[Preprint read: `http://www.cp.jku.at/research/papers/Saunders_etal_ida_journal_preprint_2008.pdf`]
Performance worm trajectories are cut into fixed 2-beat segments, clustered into
prototypes, each assigned a symbol — a performance becomes a **string over a "Mozart
Performance Alphabet"**. Similarity is a **gap-weighted subsequence string kernel**,
`κ_p(s,t) = Σ_u φ_u(s)φ_u(t)` with decay λ penalising gaps, fed to SVM and kernel PLS.
6 pianists × 12 Mozart sonata movements, decomposed into **15 pairwise problems**,
leave-one-movement-out. Feature-based baseline 200.8 ± 2.9 (**69.7%**); string-kernel
SVM-on-KPLS **236.8 ± 8.0 ≈ 82.2%**, p < 0.01. Best substring lengths were only 1–2
characters. Their own words: "the ability of the string kernel to allow gaps in matching
sub-sequences is a key benefit for this data."
*Lesson:* **a gap-weighted subsequence kernel beats exact n-grams** — two performance
strings should be allowed to match with insertions and deletions, because the same
expressive gesture recurs at shifted positions with interpolated material. That is a
direct argument for an *edit path* rather than a positionwise diff.

**Grindlay, G. & Helmbold, D. (2006). "Modeling, analyzing, and synthesizing expressive
piano performance with graphical models." *Machine Learning* 65(2–3), 361–387.
DOI 10.1007/s10994-006-8751-3.** [Abstract only; ⚠ **no numerical evaluation verified**.]
The ESP system uses **hierarchical hidden Markov models** of performer style.
*Lesson:* an HHMM yields a **likelihood** of one performance under another performer's
style model — a principled alternative to curve distance when two documents cannot be
aligned point-to-point.

**Molina-Solana, M., Arcos, J. L. & Gómez, E. (2008). "Using Expressive Trends for
Identifying Violin Performers." *ISMIR 2008*, 495–500.**
[Full text read: `https://archives.ismir.net/ismir2008/paper/000210.pdf`] Journal version:
*Intelligent Data Analysis* 14(4), 555–571, DOI 10.3233/IDA-2010-0439.
23 professional violinists, commercial recordings of Bach's Sonatas and Partitas. Melodic
segmentation by **Narmour Implication–Realization patterns**; per IR pattern and per
descriptor (duration, energy), each note is compared to its fragment mean and mapped to a
qualitative symbol; the counts form a **discrete probability distribution** — the "trend
model". Distance between two performers = **weighted sum over IR patterns of the L1
distance between corresponding distributions**, weights = mean histogram cardinality.
Rank-1/3/10 accuracy (random 4.3%): within-piece **52.2 / 65.2 / 91.3** (set-1) and
**34.8 / 47.8 / 95.7** (set-2), but cross-piece (set-3) collapses to **15.8 / 26.3 /
68.4**.
*Lesson:* comparing two documents **within** the same piece is a fundamentally easier
problem than across pieces — expect roughly a 3× degradation. And a **weighted histogram
distance conditioned on a melodic-context class** is a cheap, alignment-free way to
compare curves of unequal length.

**Grachten, M. & Widmer, G. (2009). "Who Is Who In The End? Recognizing Pianists by their
Final Ritardandi." *ISMIR 2009*, Kobe, 51–56.**
[Full text read: `https://archives.ismir.net/ismir2009/paper/000004.pdf`]
An extreme information-bottleneck experiment: 8 final ritardandi across 6 Chopin
Nocturnes, IOI timing from commercial CDs, norm = average performance per piece. **The
transferable device is their measurement-error filter**: a set was annotated twice by two
people (304 time points), the absolute inter-annotator difference plotted against beat
duration, and the criterion `u(j) > 0.09 + exp[−2.5(a(j)+v̄) + 1.0]` retains only
deviations exceeding plausible annotation noise — discarding **>95%** of the scatter. The
residual is summarised by four attributes and fed to an MLP; **32%** of the 171 pairwise
tasks over 19 pianists are significantly above the majority baseline **with** filtering,
clearly fewer without.
*Lesson:* **filter differences against a measurement-noise model that is a function of
local tempo.** At slow tempi annotators agree far better, so a fixed absolute threshold
systematically over-reports differences in fast passages.

**Molina-Solana, M., Grachten, M. & Widmer, G. (2010). "Evidence for Pianist-specific
Rubato Style in Chopin Nocturnes." *ISMIR 2010*, Utrecht, 225–230.**
[Full text read: `https://archives.ismir.net/ismir2010/paper/000040.pdf`]
Each ritardando is reduced to **two parameters (w, q)** — curvature and depth — by fitting
Friberg & Sundberg's kinematic rubato model. The contribution is a linear transformation
that **cancels piece-specific components**: group instances by piece, compute the group
centroid, translate it to the origin, carrying all members with it. k-NN over 17 pianists,
~8 instances each, baseline 5.88%. The authors are candid: "the classification results are
not satisfactory from the perspective of performer identification" — the value is that
**the transformation improved them**, which is the actual evidence for a performer-specific
component, localised "specifically in the curvature and depth of the rubato (w and q
parameters)".
*Lesson:* the cleanest test of "**do these two documents differ by performer or by
piece?**" is whether subtracting the per-piece centroid improves discrimination. Absolute
accuracy is secondary. Also note: fitting a **shape** (curvature, depth) rather than
comparing samples is exactly what MPM already stores natively.

**Ramírez, R., Maestre, E. & Serra, X. (2010). "Automatic performer identification in
commercial monophonic Jazz performances." *Pattern Recognition Letters* 31(12),
1514–1523. DOI 10.1016/j.patrec.2009.12.032.** ⚠ Citation verified via DBLP; **method
details, dataset size and accuracies not verified.**

**Kosta, K., Ramirez, R., Bandtlow, O. F. & Chew, E. (2016). "Mapping between dynamic
markings and performed loudness: a machine learning approach." *Journal of Mathematics
and Music* 10(2), 149–172. DOI 10.1080/17459737.2016.1193237.**
[Preprint: `https://webspace.maths.qmul.ac.uk/o.bandtlow/publ/JMM.pdf`]
Loudness in sones, loess-smoothed, then **divided by the recording's own maximum** "in
this way we are able to compare different recording environments"; reference recording
chosen by **medoid selection with an IQR outlier constraint**. Headline: "**score features
may trump individual style when modeling loudness choices**" — corroborating Sapp's
independent finding that tempo is more performer-discriminative than dynamics.
*Lesson:* per-document max-normalisation is the standard fix for incommensurable dynamic
scales, and **medoid** (an actual member) is preferred to a synthetic mean as a reference.

### Recent deep-learning work (see also §6)

**Zhang, H., Tang, J., Rafee, S. R. M., Dixon, S. & Fazekas, G. (2022). "ATEPP: A Dataset
of Automatically Transcribed Expressive Piano Performance." *ISMIR 2022*, 446–453.**
[Full text read: `https://archives.ismir.net/ismir2022/paper/000053.pdf`;
`https://github.com/BetsyTang/ATEPP`]
**11,742 tracks / ~1,000 hours** by **49 pianists**, transcribed from commercial audio.
The paper states plainly that "none of the existing studies have applied deep learning
methods to performer identification, due to the lack of large-scale datasets with
overlapping performances." Their 1-D CNN baseline on raw note attributes with **no
expression preprocessing**: Mixture (16 pianists, 4676) acc **0.47**; Beethoven (12, 3078)
**0.48**; Chopin (5, 973) **0.55**; Bach (5, 1019) **0.59**. The composer-specific subsets
exist to **remove performer–repertoire correlation** (Horowitz plays Romantic repertoire,
Gould almost exclusively Bach).
*Lesson:* the most dangerous confound in this whole area is **repertoire leakage**. Always
check whether the discriminator is reading the performer or the piece.

**Rafee, S. R. M., Fazekas, G. & Wiggins, G. A. (2021). "Performer Identification From
Symbolic Representation of Music Using Statistical Models." *ICMC 2021*;
arXiv:2108.02576.** [Full text read: `https://arxiv.org/pdf/2108.02576`]
Direct modern descendant of Stamatatos. Nine pianists, all four movements of Schubert
D. 960, **16,980 aligned notes each**, aligned with Nakamura's HMM; the reference is the
**average performance**, not the score. Five norm-deviation features: `d(OT)` onset time,
`d(IOI)`, `d(OTD)` off-time duration, `d(DL)` dynamic level, `d(ND)` note duration. Each
feature's deviation *distribution* is estimated by histogram, KDE and GMM, and
classification is by **minimum KL divergence**. Individual-feature precision: **OT best in
all three models** (KDE .688), then DL (.589), IOI (.489), ND (.498), OTD (.342). Best
fusion: histogram with IOI+DL+ND → **precision 0.903, recall 0.875**. Several fusions
*underperform* single features. They explicitly flag **melody lead as omitted** and as
future work.
*Lesson:* two documents can be compared **without pointwise alignment** by comparing the
*distributions* of their per-note norm-deviations under KL divergence — and note that
**adding more parameter channels can hurt**. Channel selection matters more than channel
count.

**Zhang, H. & Dixon, S. (2023). "Disentangling the Horowitz Factor: Learning Content and
Style from Expressive Piano Performance." *ICASSP 2023*.
DOI 10.1109/ICASSP49357.2023.10095009.** [Full text read.]
A VQ-VAE with separate content and style branches over four token sequences (pitch,
velocity, onset, duration; 10 ms quantisation), disentangled by mutual-information
minimisation (MINE). **The evaluation design is the transferable part**: content
preservation measured by **note error rate** = (extra + pitch-wrong + missing)/(matched +
missing) against a **Nakamura HMM alignment**; style fit by a 40-way performer
discrimination probe. Best config: NER **.121** (same recording), Top-1 **.168**. The
authors are refreshingly honest that "there does not exist a bijective mapping between
performer and interpretation style" and that at Top-1 = 0.168 the disentanglement is only
"partially successful."
*Lesson:* **note error rate against an alignment** is the right content-preservation
metric when two documents differ in *both* notes and expression — it separates "different
notes" from "same notes played differently", which a raw curve distance cannot.

**Peter, S. D., Cancino-Chacón, C. E., Karystinaios, E. & Widmer, G. (2023). "Sounding Out
Reconstruction Error-Based Evaluation of Generative Models of Expressive Performance."
*DLfM 2023*, Milan, 58–66. DOI 10.1145/3625135.3625141; arXiv:2401.00471.**
[Full text read: `https://arxiv.org/pdf/2401.00471`]
⭐ **The single most directly relevant paper to this campaign, and it is a warning.** They
formalise reconstruction-error evaluation: given candidates P1, P2 and an expert reference
RP, compute `E = ‖P−RP‖²_L2 / d` and prefer the smaller — exactly the naive way to diff
two parameter documents. Each performance is a sequence of values per score onset for
expressively relevant attributes. They then break it deliberately, synthesising
"unmusical" performances by **randomisation within the ball of expert performances** (the
same L2 distance from the reference as a genuine rival expert), and run a listening test.
Their conclusions: MSE-based evaluation "**is not necessarily reliably favoring the same
performance wrt different targets**" — the winner flips when you change which expert
recording is the reference — and it "**is not dependably capable of discerning expert
performances from randomized performances**".
*Lesson:* **never report a single L2/MSE distance between two performance-parameter
documents as if it were the answer.** The ranking it produces is contingent on an
arbitrary reference and does not track perceptual similarity. Report per-dimension
distances across multiple references, and treat small distance as necessary but not
sufficient for "similar".

**Gingras, B., Lagrandeur-Ponce, T., Giordano, B. L. & McAdams, S. (2011). "Perceiving
musical individuality: Performer identity is best predicted when playing usual repertoire."
*Perception* 40(10), 1206–1220.**
[`https://www.mcgill.ca/mpcl/files/mpcl/gingras_2011_perception.pdf`]
The model for perceptual validation of a performance distance: 6 organists × 4
interpretations, 40 listeners free-sorting 30 excerpts, scored by **adjusted Rand index**
(chance-corrected) — above chance for 75% of musicians and 65% of nonmusicians, with **no
significant musician/nonmusician difference**. Critically the *computational* distance
predicts the human result: within-performer tempo correlation 0.43–0.89 vs. between-
performer 0.19–0.46, and the correlation ratio η for tempo **significantly predicted**
which performers listeners grouped correctly (χ²(1) = 23.80, p < .001).
*Lesson:* this is the only verified study that closes the loop from a computational
distance to human grouping behaviour. It is the template for validating ours.

---

## §1.5 Computational models of expressive performance and their parameter spaces

MPM is a parameter space. This section is the precedent literature for comparing
performances **in parameter space** rather than in audio — and the honest headline is that
the precedent is thin and the field knows it.

**Cancino-Chacón, C. E., Grachten, M., Goebl, W. & Widmer, G. (2018). "Computational
Models of Expressive Music Performance: A Comprehensive and Critical Review." *Frontiers
in Digital Humanities* 5:25. DOI 10.3389/fdigh.2018.00025.**
The canonical review. Its architecture is *score features* → *computational model* →
*expressive parameters*, crossed with static-vs-dynamic and with Palmer's (1997) cognitive
stages — where existing models "focus **almost exclusively on the planning process**."
**Canonical parameters:** "The most commonly modeled performance aspects (for the piano)
are **expressive tempo/timing, dynamics and articulation**," explicitly "leaving out other
dimensions such as timbral parameters, vibrato, or intonation." Their key conceptual
contribution is a **three-way temporal split — global tempo / local tempo / expressive
timing** (deviations of individual events from local tempo): "Setting these three notions
apart is of crucial importance." Articulation = "the ratio between the performed duration
of a note and its notated value". **Asynchrony/melody lead is not treated as a modelled
dimension.**
**§4.3 on evaluation** (omitted from the Frontiers HTML TOC; use the PDF) is the citable
statement of our blocker: (1) comparison to a single target performance is "highly
arbitrary… A poor fit does not necessarily mean that the model's predictions are musically
bad"; (2) "there is no guarantee that higher correlation, or lower MSE implies a musically
better performance… outliers can influence these measures"; (3) "**we cannot compare
performance models that encode an expressive dimension using different parameters (such as
modeling expressive tempo using IBI vs. BPM, or using linear vs. logarithmic
parameters)… There are currently no canonical definitions of the expressive dimensions**";
(4) no musical analogue of the **Structural Similarity Index** has ever been defined.
**§3.1.1.2** is the short, dense section on comparison in parameter space: Sapp (2007,
2008); Liem & Hanjalic (2011, 2015) on alignment patterns, standard deviations, entropy
and PCA; Peperkamp et al. (2017) on tempo curves as convex linear combinations of
variation functions; Liebman et al. (2012) phylogenetics; Grachten et al. (2017)
differential sensitivity analysis. Conclusion: the methods "support the idea of common
performance strategies across performers, as well as consistent individual differences,"
but give "**only weak evidence for the existence of 'performance schools'**", and
"effectively all studies are limited to small datasets."
⚠ **The paper contains no equations at all** — a grep of the publisher PDF returns zero
display math. It is the paper that *complains* formal definitions do not exist.
*Lesson:* this is the citable authority for **the absence of a standard**. It states our
exact blocker — two documents using different encodings of the same dimension are not
comparable by any correlation or error measure — and confirms there is no
perceptually-grounded performance-similarity measure to reuse.

**Widmer, G. & Goebl, W. (2004). "Computational Models of Expressive Music Performance:
The State of the Art." *JNMR* 33(3), 203–216. DOI 10.1080/0929821042000317804.**
The predecessor, and taxonomically more useful (organised by model family: KTH / Todd /
Mazzola / machine learning). §7 is the direct precedent for parameter-space comparison via
the performance alphabet. Records Repp's (1992) finding that agreement is high globally and
**divergence increases as you descend the structural hierarchy**. §7.3 gives the best
verifiable early performer-ID number: "correct recognition rates … of **80% and above for
certain pianist pairs**."

**Grachten, M. & Widmer, G. (2012). "Linear Basis Models for Prediction and Analysis of
Musical Expression." *JNMR* 41(4), 311–322. DOI 10.1080/09298215.2012.731071.**
`y = ϕ(x)w + ε`, fitted by `ŵ = argmin‖y − ϕ(x)w‖`. Basis functions encode dynamics
markings in three classes — *constant* (f, ff, p) → step; *impulsive* (fz, fp) → unit
impulse; *gradual* (cresc., dim.) → ramp-plus-step that **holds at 1 until the next
constant marking** — plus 3rd-order pitch polynomials, a grace-note indicator and two
Narmour IR bases. **Two incompatible target normalisations in one paper:** Experiment 1
(Magaloff, Bösendorfer SE) uses MIDI velocity "transformed to have **zero-mean per piece**"
(mean-centred, not scaled); Experiment 2 (commercial CDs) uses beat-level **sone** loudness
"transformed to have **zero mean and unit standard-deviation per piece**".
**On comparing fitted weights across performers — honestly, weakly:** "**The variance of
coefficients across pieces appears to be too large to reveal any direct relationships
between performers and coefficients, independent of the piece. Within pieces however,
significant effects of performer on coefficients are present**" (e.g. ff coefficients in
Op. 52, F(7,28) = 3.90, p < .005). **No clustering of weight vectors is performed in any
verified paper.**
*Lesson:* never assume scale is shared; check whether variance was divided out. And a
fitted-parameter-vector distance across pieces is a known dead end.

**Cancino-Chacón, C. E. (2018). *Computational Modeling of Expressive Music Performance
with Linear and Non-linear Basis Function Models.* Doctoral thesis, JKU Linz, 236 pp.**
`https://www.carloscancinochacon.com/documents/thesis/Cancino-JKU-2018.pdf`
**The definitive source for parameter definitions.** Formalises a *performance codec*
`C = (Y, Y⁻¹)` in four versions, lossless up to `BP_ave`. Codec v1.0 (note-wise, 4
parameters): `y_vel = vel/127`; `y_log_bpr = log₂(BP/BP_ave)` where `BP =
IOI_perf/IOI_score` and the equivalent performed onset is the **arithmetic mean** of chord
onsets; `y_tim = ô_perf − onset_perf` (**raw seconds, + = anticipated**, identically zero
for single-note onsets); `y_log_art = log₂(dur_perf/(dur_notated·BP))` with pedal-aware
sounding duration. Codec v2.0 splits into 2 onset-wise + 3 note-wise, with
`y_veltrend = (1/127)·max vel(o_i)` — **max**, not mean. ⚠ The Basis Mixer ISMIR 2016
late-breaking abstract defines loudness as the **average** velocity per onset; the thesis
codec uses the **max**. Same framework, one year apart.
The mature substitute for weight comparison is the **sensitivity-difference graph** (§5.4):
`SG_{i,j} = ∂f/∂ϕ_i · ϕ_i(o_j)`, `SD = SG_perf1 − SG_perf2`, demonstrated on
Solti/Chicago 1974 vs. Harnoncourt/COE 1991.
*Lesson:* four different conventions for "loudness" coexist in one research group (÷127,
mean-centred, z-scored, log-ratio-to-mean); **tempo is a period**, so positive log values
mean *slower* — the opposite sign of log BPM; and the log base is **2** throughout, so a
natural-log document is off by a factor of ~1.44. Pin all of this explicitly.

**YQX / rule learning.** Flossmann et al., SMC 2009 and *AI Magazine* 30(3), 35–48,
DOI 10.1609/aimag.v30i3.2249. On melody notes only: **IOI Ratio** = log(performed IOI /
score IOI), + = slower; **Loudness** = log(velocity / **mean velocity of the
performance**); **Articulation** = performed gap ÷ notated gap.

**Friberg, A., Bresin, R. & Sundberg, J. (2006). "Overview of the KTH rule system for
musical performance." *Advances in Cognitive Psychology* 2(2–3), 145–161.
DOI 10.2478/v10053-008-0052-x.** [Read in full.]
Each rule has a context part and an execution part, scaled by **k**: "Smaller values of k
are used when subtle changes are appropriate… **Thus, there is no 'optimal' setting of k
values** that would be appropriate for any type of music." Negative k inverts a rule. "The
selection of rules and rule quantities is collected in a **rule palette**, which defines a
particular performance style." Effects are "in principle **added or multiplied** together"
— additive is the norm. Total dimensionality "about **30–40 parameters**". Deviations are
tempo-relative (Weber's law) except Duration contrast and Swing ensemble. The paper itself
flags the inverse problem: "Clear evidence of this is seen in the **difficulty experienced
in applying the rules in reverse**."
**Friberg, A. (1991). "Generative Rules for Music Performance: A Formal Description of a
Rule System." *Computer Music Journal* 15(2), 56–71. DOI 10.2307/3680917.** The
authoritative units table: `DR` tone duration; `DRO` off-time duration (micropause);
`ΔDR` duration deviation (ms or %); `L` level (dB); `ΔL` relative level deviation (dB);
`VA` vibrato amplitude (%); `VF` vibrato frequency (Hz); `ΔF` frequency deviation
(**cents**); `k` quantity, default 1. "**Whenever possible, the resulting deviations from
the rules are additive**… The order in which the rules are applied is in general not
critical **except for the synchronization rules and the amplitude envelope rules which have
to be applied last**."
**Bresin, R. & Friberg, A. (2000). "Emotional Coloring of Computer-Controlled Music
Performances." *CMJ* 24(4), 44–63. DOI 10.1162/014892600559515.** The crispest statement of
k semantics: "**Quantities greater than unity imply an amplification… values between zero
and unity a reduced effect, and negative values the inverse.**" **The one place a k-vector
is treated as a metric space**: "According to a **principal component analysis applied to
the rule parameters**, the two most important dimensions… are **mean SL and tempo (Factor
1)**, and **phrasing and articulation (Factor 2)**." ⚠ The per-emotion k-values are
published only as bar graphs, not a numeric table.

**Has anyone used fitted k-vectors as a similarity space? No.** The evidence chain:
Friberg (1995b) needed **18 parameters for one rule** to fit Repp's 28 *Träumerei*
performances; Kroiss (2000) "could not find a single set of parameter values that would
produce a fit better than the baseline" [**unverified** — no online copy located];
Sundberg, Friberg & Bresin (2003), *JNMR* 32(3), 317–325, needed **16 sub-sections each
with its own k** for one Mozart Adagio; Zanon & De Poli (2003), *CMJ* 27(1), 29–46 and
*JNMR* 32(3), 295–315, came closest with least-squares k estimation — but classes were
**emotional intentions, not performers**, the rules proved **quasi-orthogonal but not
orthogonal** (Melodic charge, Harmonic charge and Duration contrast are collinear), and
Widmer & Goebl's footnote 1 records that Zanon & De Poli's k settings "were considerably
different from the settings found by Sundberg et al. (2003) **for the same performance of
the same Mozart piece**" — i.e. the fit is **non-identifiable**. Forward-citation sweeps of
both papers (~60 citing works each) found nothing building a performer-similarity space on
fitted k-vectors.
**The one genuine per-performer k-vector dataset that exists:** **Friberg, A., Gulz, T. &
Wettebrandt, C. (2023). "Computer Tools for Modeling Swing in a Jazz Ensemble." *CMJ*
47(1), 85–109. DOI 10.1162/comj_a_00675** — fitted palettes for Erskine, Jarrett, Marsalis
and Rich ship as machine-readable `.pal` files inside Director Musices 3.1.6. **Nobody has
computed a distance on them.**
*Lesson:* the k-vector is a verified *description language*, an unverified *fitting
target*, and has never been a *metric space*. Three facts make naive parameter-space
distance unsound — **collinear dimensions, non-identifiable fits, and region-scoped rather
than global parameters**. And per **Sundberg, Friberg & Frydén (1991), *Music Perception*
9(1), 71–91, DOI 10.2307/40286159**, musicians' preferred k values sit close to the
**threshold of perceptibility** — so differences below one JND are not differences.

**partitura — the most precisely specified working implementation.**
**Cancino-Chacón, C., Peter, S. D., Karystinaios, E., Foscarin, F., Grachten, M. &
Widmer, G. (2022). "Partitura: A Python Package for Symbolic Music Processing." *MEC
2022*, Halifax. arXiv:2206.01071.**
Verified by reading `partitura/musicanalysis/performance_codec.py` on `main`. **Default
output: exactly four note-wise float32 fields** —
`["beat_period", "velocity", "timing", "articulation_log"]`:

| Parameter | Exact definition | Normalisation |
|---|---|---|
| `beat_period` | `diff(mean performed onsets) / diff(unique score onsets)`, zero-order hold | **none — raw seconds per beat** |
| `velocity` | `MIDI_velocity / 127.0` | ÷127 → [0,1] |
| `timing` | `eq_onsets[i] − performed_onset` | none — **seconds; + = late** |
| `articulation_log` | `log2(p_duration / (beat_period × score_duration))` | **log₂**; grace notes → 0 |

Five `beat_normalization` variants append columns: `beat_period_log` = `log2(bp)`;
`beat_period_ratio` = `bp/mean(bp)`; `beat_period_ratio_log`; `beat_period_standardized` =
`(bp−mean)/std`. **`beat_period_mean` and `beat_period_std` are piece-global scalars
broadcast to every row**, not windowed statistics.
⚠ **Sign convention is the opposite of the thesis codec**: partitura's `timing =
equivalent − actual`, so **positive = late**; the thesis says "anticipation leads to a
positive timing value". Same lineage, inverted convention.
**Losslessness caveats, all read from source:** absolute start time is discarded;
`sound_off` collapses onto `note_off`; **all pedal information is lost** (pedal exists only
in the separate, non-invertible `performance_features` module); velocity is quantised and
clipped to [1,127]; `monotonize_times` silently repairs non-monotonic onsets; **only
`label=="match"` notes are encoded** — insertions and deletions are dropped.
**Foscarin, F. et al. (2022). "The match file format: Encoding Alignments between Scores
and Performances." *MEC 2022*. arXiv:2206.01104.** ⚠ The `note(...)` line differs
structurally between versions: v1.0.0 is
`note(Id, MidiPitch, Onset, Offset, Velocity, Channel, Track)` with onsets in **MIDI
ticks** and **no sound-off field**; v0.3.0–0.5.0 carries a pedal-adjusted `AdjOffset` that
exists **only in v0**. In-memory alignment has **four** labels, not three: `match`,
`deletion`, `insertion`, and **`ornament`**.
*Lesson:* partitura is the closest existing engineering answer, and its lessons are all
about **disambiguation**: pin the log base (2), pin the timing sign convention, distinguish
seconds-per-beat from BPM, distinguish global from local normalisation statistics,
distinguish an **invertible codec** from **descriptive features**, pin the format version,
and enumerate the losses explicitly rather than claiming "lossless".

**Liebman, E., Ornoy, E. & Chor, B. (2012). "A Phylogenetic Approach to Music Performance
Analysis." *JNMR* 41(2), 215–242. DOI 10.1080/09298215.2012.668194.**
[`https://www.cs.utexas.edu/~eladlieb/paper.pdf`; ⚠ several secondary sources, including
the Frontiers review, give 195–222; the article's own running header reads 215–242.]
⭐ **The cautionary tale that most exactly matches our situation.** 29 performances of two
Bach solo-violin Adagios, each encoded as an **87-dimensional vector across ten
categories** (vibrato, tempo, bowing, durations, dotting ratio, double-stop vs. arpeggio,
chord types, total duration…). They explicitly reject a single metric: "The different
categories are essentially incomparable and inconsistent, and therefore **do not induce a
single, uniform distance measure**." Instead: per-category Euclidean distances →
phylogenetic **quartets** → quartet max-cut → Adams consensus tree, validated by
Robinson–Foulds distances. **The decisive number: the correlation between tree distance and
the naively concatenated all-category vector distance is 0.12, versus 0.40–0.42 for the two
single best categories.** And: "It was conclusively revealed that the various performances
**do not cluster well when examined as a whole**." Findings correlate strongly with
performer date of birth (0.697) and only moderately with HIP affiliation.
*Lesson:* **concatenating heterogeneous parameter families into one vector and taking a
Euclidean distance destroys the signal.** Compute per-family distances separately, convert
each to ordinal/topological evidence, aggregate by consensus, and report per-family
agreement *as a result*. This is precisely the shape of the MPM map-type problem.

### MPM itself

Spec: `https://axelberndt.github.io/MPM/`, source `https://github.com/axelberndt/MPM`
(TEI ODD, namespace `http://www.cemfi.de/mpm/ns/1.0`, BSD-2 + CC-BY-4.0). Structure:
`mpm` → `performance` → one `global` plus 0..n `part`, each split into `header` (style
definitions) and `dated` (maps). **Each type of map is allowed only once** in a `dated`
environment; part-level data overrides global.
**Complete map list** (`model.mapLike`): `tempoMap`, `dynamicsMap`, `rubatoMap`,
`articulationMap`, `metricalAccentuationMap`, `asynchronyMap`, `ornamentationMap`,
`imprecisionMap`, `imprecisionMap.timing`, `imprecisionMap.dynamics`,
`imprecisionMap.tuning`, `imprecisionMap.toneduration`.
⚠ **There is no `movementMap` in the published MPM schema.** It exists only in meico
(`meico.mpm.elements.maps.MovementMap`). Treat it as an implementation-level extension
ahead of the schema.
**Curve models — two different mathematics.** Tempo is a **power function with one shape
parameter**: per Berndt (ISMIR 2021, p. 52), "The course of tempo curves is modelled with
power functions in the interval [0.0, 1.0]. Attribute `meanTempoAt` specifies the relative
position between start and end date of the transition where the curve passes the mean
tempo" —
`exponent = ln(0.5) / ln(meanTempoAt)`,
`tempo(t) = bpm·(1 − t^exponent) + transition.to·t^exponent`;
`meanTempoAt = 0.5` → exponent 1.0 → linear. Dynamics is a **cubic Bézier with two shape
parameters**: `curvature ∈ [0,1]` (0.0 = linear) and `protraction ∈ [−1,1]` (asymmetry).
Rubato: `localDate' = (localDate/frameLength)^intensity · (earlyEnd − lateStart) +
lateStart`, Schematron-enforced `0.0 ≤ lateStart < earlyEnd ≤ 1.0`; `intensity` < 1 =
short-long, > 1 = long-short. ⚠ **`tempo` has no `curvature`/`protraction`; `dynamics` has
no `meanTempoAt`.**
**Articulation modifiers** (legal on both `articulationDef` and `articulation`):
`absoluteVelocity`, `relativeVelocity` (default 1.0, multiplicative),
`absoluteVelocityChange` (default 0.0, additive), `detuneCents`, `detuneHz`,
`absoluteDuration`, `absoluteDurationChange`, `relativeDuration` (default 1.0),
`absoluteDelay` (**shifts onset *and* offset**), `absoluteDurationMs`,
`absoluteDurationChangeMs`, `absoluteDelayMs`. Multiple `articulation` elements on one note
are **interpreted sequentially and compound**.
**Imprecision maps** carry `distribution.uniform`, `.gaussian`, `.triangular`,
`.correlated.brownianNoise`, `.correlated.compensatingTriangle`, `.list`, with shared
`limit.lower/upper`, `clip.lower/upper`, **`seed`**, `milliseconds.timingBasis`.

**Berndt, A. (2021). "The Music Performance Markup Format and Ecosystem." *ISMIR 2021*,
50–57. DOI 10.5281/zenodo.5624429.**
`https://archives.ismir.net/ismir2021/paper/000005.pdf` — **the single best MPM citation.**
Positions MPM between "measurement-series formats" (audio, CSV, MIDI, MazurkaBL,
CrestMusePEDB) and "symbolic formats" (MEI, Humdrum, MusicXML): "The essential achievement
of MPM is to combine low-level and high-level perspective." Names two MPM Toolbox use
cases: creative performance authoring, and **analysis of performance *scores* — the
interpretation of signs in the autograph** (not audio).
Related, all verified: **Berndt & Hähnel (2010), "Modelling musical dynamics," *Audio
Mostly 2010*, DOI 10.1145/1859799.1859817** (origin of the `dynamicsMap` model);
**Berndt (2011), "Musical Tempo Curves," *ICMC 2011***; **Hähnel & Berndt (2010),
"Expressive Articulation for Synthetic Music Performances," *NIME 2010*, 277–282,
DOI 10.5281/zenodo.1177789**; **Hähnel & Berndt (2011), "Eighth-notes performances: kinds
of inégalité," *Audio Mostly 2011*, 75–81, DOI 10.1145/2095667.2095678** (the closest thing
to analytic use — but it analyses performances through the *models*, not MPM documents);
**Berndt & Bohl (2018), "Music Performance Markup: Formale Beschreibung musikalischer
Interpretationen," *editio* 32(1), 185–204, DOI 10.1515/editio-2018-0012**;
**Berndt, Waloschek & Hadjakos (2018), "Meico: A Converter Framework…," *Audio Mostly
2018*, 18:1–18:7, DOI 10.1145/3243274.3243282**. **Berndt (2015), "Formalizing Expressive
Music Performance Phenomena," in *Works in Audio and Music Technology*, ch. 4, 97–128,
TUDpress** is [**verified only indirectly**, as ref. 20 of the ISMIR paper] and is where
the closed-form curve definitions live in citable prose.

**Does any published work use MPM for analysis or comparison? Essentially no.**
No paper — by Berndt or anyone else — extracts an MPM from a recorded performance for
comparative purposes, compares two MPM documents, or defines a distance in MPM parameter
space. Berndt's ISMIR 2021 is candid that audio analysis was future work: "MPM Toolbox will
be supplemented by a comprehensive module for performance analyses in audio recordings."
**In the software, partially yes, and more than the papers admit.** MPM-Toolbox
(`https://github.com/axelberndt/MPM-Toolbox`) contains a working, never-published
extraction pipeline: `src/mpmToolbox/projectData/alignment/` holds a `basicPitchLcsAligner/`
package (Spotify Basic Pitch via ONNX transcribes the audio; a longest-common-subsequence
aligner matches it to the MSM score), and `Alignment.java` contains
`exportPerformance(...)`, `exportTiming()` ("Derives a global tempo and asynchrony maps
from the alignment's timing transformation data") and `exportArticulation()`, which renders
the performance, compares rendered against measured milliseconds, and emits residual
corrections when `|onsetDif| > 1.0` ms → `absoluteDelayMs`, `|offsetDif| > 1.0` ms →
`absoluteDurationMs`. Three limits visible in the code: tempo is fitted from
**piecewise-linear** timing segments and does **not** fit `meanTempoAt`; **no dynamics
fitting at all**; and everything not captured by tempo and asynchrony is dumped into
per-note articulation residuals, so articulation doubles as the error term.

| Capability | Status |
|---|---|
| Extract MPM from a recording | Implemented in MPM Toolbox (tempo + asynchrony + residual articulation only). **Never published.** |
| Compare two MPM documents | **Not implemented anywhere, not published.** |
| Distance metric in MPM parameter space | **Does not exist.** No formalisation, no paper, no code. |
| MPM used analytically in a published study | **No.** |

⚠ **Caveat on exhaustiveness:** no keyword sweep for third-party MPM papers or
German-language theses (Detmold/Paderborn Hochschulschriften, Edirom Summer School
reports) was possible after the search budget ran out. Treat "no third-party analytical
use" as **strongly supported but not exhaustively proven**.

### Corpora

| Corpus | Performances | Alignment | Format | Public? |
|---|---|---|---|---|
| ASAP (2020) | 1068 (paper) / 1067 (repo) | beat/downbeat | TSV + JSON | CC BY-NC-SA 4.0 |
| (n)ASAP (2023) | 1062 note-aligned, 7 M notes | **note** | `.tsv` + `.match` | CC BY-NC-SA 4.0 |
| Vienna 4x22 | 88 (4×22) | **note** | `.match` | CC BY 4.0 |
| Magaloff | ~150 pieces, 330 k notes | **note** | internal | **no** |
| Zeilinger | 31 movements, 70 k notes | **note** | unpublished | **no** |
| MazurkaBL | 2000 recordings, 44 mazurkas | beat (from audio) | CSV matrices | yes, no audio |
| Batik-plays-Mozart | 36 movements, 102,421 notes | **note** | `.match` + CSV | yes, ⚠ no licence file |
| MAESTRO v3 | 1276, 198.7 h | audio↔MIDI only | WAV + MIDI | CC BY-NC-SA 4.0 |
| CrestMuse PEDB | 242 + 443 | note deviation | DeviationInstanceXML | academic, JP registration |
| SUPRA-RW | 478 red Welte rolls, ~52 h | — (roll→MIDI) | TIFF/MIDI/audio | CC BY 4.0 |

Key citations: **Foscarin, McLeod, Rigaux, Jacquemard & Sakai (2020), "ASAP…," *ISMIR
2020*, 534–541, DOI 10.5281/zenodo.4245490**; **Peter, Cancino-Chacón, Foscarin, McLeod,
Henkel, Karystinaios & Widmer (2023), "Automatic Note-Level Score-to-Performance Alignments
in the ASAP Dataset," *TISMIR* 6(1), 27–42, DOI 10.5334/tismir.149** — "the largest
available fully note-aligned dataset", shipping **two encodings deliberately** (a thin
parse-friendly TSV of id-pairs and the thick self-describing match format), adding an `id`
to every MusicXML score note and a **`robust_note_alignment` quality flag** per
performance; **Goebl (2017), *The Vienna 4x22 Piano Corpus*, DOI 10.21939/4X22**;
**Flossmann, Goebl, Grachten, Niedermayer & Widmer (2010), "The Magaloff Project," *JNMR*
39(4), 363–377** (introduces the essential `matched`/`omitted`/`inserted` vocabulary);
**Kosta, Bandtlow & Chew (2018), "MazurkaBL…," *TENOR'18*, DOI 10.5281/zenodo.1290763** —
per mazurka, CSV tables where **rows = score beats, columns = recording**, beat times in
seconds and loudness in sones, plus an index-aligned table of expressive markings; **Hu &
Widmer (2023), "The Batik-plays-Mozart Corpus," *ISMIR 2023*, 297–303,
DOI 10.5281/zenodo.10265283** — 95.36% matched / 4.44% insertions / 0.20% deletions,
chained to the *Annotated Mozart Sonatas* harmony/cadence/phrase labels.
*Lesson:* the field's de-facto interchange format for note-level alignment is the **match
file**, and the pattern worth copying is *(shared quantised score grid, per-note stable id,
deviation vector, explicit insertion/deletion labels, per-region confidence flag)*.
**CrestMuse PEDB is the strongest conceptual precedent** — each note stored as a deviation
from a mechanical rendering plus the performer's own declared phrase structure and apex,
i.e. *(reference grid, deviation vector, declared intent)*. MAESTRO is the counterexample:
beautifully time-aligned, useless for comparison, because nothing anchors it to a score.

---

## §1.6 Historical musicology of recordings and piano rolls

The Welte-Mignon use case makes this a first-class section, not background. Its central
lesson is uncomfortable and must be designed for: **a roll-derived MPM is a distance
between two control encodings, not between two performances.**

### Practice taxonomies

**Peres Da Costa, Neal (2012). *Off the Record: Performing Practices in Romantic Piano
Playing.* Oxford University Press. xxxiv + 342 pp. ISBN 978-0-19-538691-2.
DOI 10.1093/acprof:oso/9780195386912.001.0001.**
The taxonomy, verified from chapter-level DOIs: ch. 1 "Early Recordings: Their Value as
Evidence" (3–40); ch. 2 "**Playing One Hand after the Other: Dislocation**" (41–100); ch. 3
"**Unnotated Arpeggiation**" (101–188); ch. 4 "**Metrical Rubato and Other Forms of
Rhythmic Alteration**" (189–250); ch. 5 "**Tempo Modification**" (251–308). So the taxonomy
is **four practices**, and chs. 2–3 together (the asynchrony complex) are nearly half the
book. ⚠ **"Overholding" is not a chapter heading and could not be verified as one of his
named categories [unverified]** — do not attribute the term to him without checking the
index. Evidence base: acoustic, **piano roll** and electric recordings of pianists trained
as far back as the mid-nineteenth century (Reinecke b. 1824, Leschetizky b. 1830,
Saint-Saëns b. 1838). His polemic: these are not the idiosyncrasies of ageing musicians but
"a range of established expressive practices of a lost age." He is the field's **permissive
pole on roll fidelity**, and is challenged by name for it — Manuel Bärtsch criticises his
"absolute Gleichbehandlung von Audio- und Welte-Interpretationsdokumenten" on the strength
of only three spot-check comparisons, after which "spielt die Quellenkritik im weiteren
Verlauf seiner Untersuchung keine Rolle mehr."
**His own worked example, open access and highly recommended:** Peres Da Costa (2019),
"Carl Reinecke's Performance of his Arrangement of the Second Movement from Mozart's Piano
Concerto K. 488," in *Rund um Beethoven: Interpretationsforschung heute*, 114–149,
DOI 10.26045/kp64-6178-007
(`https://www.hkb-interpretation.ch/fileadmin/user_upload/documents/Publikationen/Bd.14/HKB14_07_PeresDaCosta_114-149.pdf`).
He compares a c.1905 Hupfeld Phonola roll against modern recordings and lists **eight
performance features**: texture-doubling, re-ornamentation, *inégale* long–short playing,
over-dotting, agogic accents, character-driven tempo modification, "a predominantly
arpeggiated style with varying types, combinations and speeds of arpeggiation, and varying
intensities of asynchrony between melody and bass", and quasi-improvised recomposition.
Crucially explicit about the medium: the Phonola "faithfully recorded the notes and their
rhythmic placements and the tempo fluctuations… **But it is uncertain whether sustain and
soft pedalling were added or enhanced by a roll editor, and the system did not record
dynamic expression**." And on tempo: "On the roll is 'Tempo 50.' **At the present time,
however, it is still not sure at what tempo the roll should be played.**"
*Lesson:* this eight-feature list is close to a specification for MPM-native comparison
outputs — and it maps onto `ornamentationMap` (arpeggiation), `asynchronyMap`
(dislocation), `rubatoMap` (*inégale*, over-dotting), `tempoMap` (character-driven
modification), `metricalAccentuationMap` (agogic accents).

**Hudson, Richard (1994). *Stolen Time: The History of Tempo Rubato.* Oxford: Clarendon
Press. ISBN 0-19-816169-7. DOI 10.1093/oso/9780198161691.001.0001.** ⚠ pagination xiv vs
xv + 473 [unverified which is right].
⚠ **Hudson's own labels are "earlier rubato" and "later rubato", not contrametric and
agogic** — verified from Barton Hudson's review, *Performance Practice Review* 9(2) (1996),
Art. 7, DOI 10.5642/perfpr.199609.02.07, open access.
- **"Later rubato"** = expressive tempo fluctuation, the whole performing body
  accelerating and slowing together; widespread from about the middle of the Romantic
  period, first in Kalkbrenner's *Theorie der Tonkunst* (1789).
- **"Earlier rubato"** = "maintenance of even tempo in the accompaniment while the melody
  proceeds more freely, anticipating the beat or lagging behind it by some indeterminate
  time interval, so that melody and accompaniment are temporarily unsynchronized" — the
  type "apparently preferred by most musicians of the 18th and early 19th centuries, Mozart
  and Chopin, for example." Traced from Tosi (1723) through Quantz, Türk, Baillot, Spohr,
  to Chopin, who "aligned the two hands in non-standard ways to show where the right hand
  should lag behind the left".
**The contrametric/agogic pair is Rosenblum's:** Rosenblum, Sandra P. (1994), "The Uses of
Rubato in Music, Eighteenth to Twentieth Centuries," *Performance Practice Review* 7(1),
DOI 10.5642/perfpr.199407.01.03, open access, read in full: "**Contrametric rubato**
involves a solo melody moving in subtly or equally redistributed note values (sometimes
with added notes) against a steady pulse in the accompaniment. **Structural or agogic
rubato** involves the simultaneous retardation or acceleration of tempo of the entire
performing body." She notes agogic derives from Riemann's *Agogik*, that "subtle agogic
inflections can, of course, be effected within **both**", and — the historically loaded
observation — "Although rubato now generally signified the agogic type…".
*Lesson:* this is the **most important type/token mapping in the whole survey**. Earlier
rubato = a *sustained divergence between the asynchrony channel and the tempo channel*;
later rubato = a *shared tempo deviation*. MPM separates these natively
(`asynchronyMap` + `rubatoMap` vs. `tempoMap`), and Goebl/Flossmann/Widmer (2010, §1.1)
already give a working detector. A module that can report "this pair differs mainly in
earlier rubato" is speaking the historians' language directly.

**Philip, Robert (1992). *Early Recordings and Musical Style: Changing Tastes in
Instrumental Performance, 1900–1950.* Cambridge University Press. ISBN 0-521-23528-6.
DOI 10.1017/CBO9780511470271.**
The structure *is* the taxonomy of twentieth-century change: **Part I Rhythm** — 1
Flexibility of Tempo (7–36); 2 Tempo Rubato (37–69); 3 Long and Short Notes (70–94);
**Part II Vibrato** — 4 String Vibrato (97–108); 5 Woodwind Vibrato (109–140);
**Part III Portamento** — 6 Solo Portamento (143–178); 7 Orchestral Portamento (179–204);
**Part IV Implications** (207–240). Method: comparative **aural** analysis of a very large
discography, descriptive rather than statistical. Leech-Wilkinson credits him with starting
the field.
**Philip, Robert (2004). *Performing Music in the Age of Recording.* Yale University Press.
ISBN 0-300-10246-1.** Central claim (per Charles Rosen's *NYRB* review, 3 Nov 2005):
recording "has directed performance style into a search for greater precision and
perfection, with a consequent loss of spontaneity and warmth", with **portamento,
dislocation, arpeggiation and tempo flexibility** becoming "almost outlawed". ⚠ Philip's
own sentences on evidential reliability and on early orchestral imprecision as style rather
than incompetence are **[unverified] — do not quote**.

**Bowen, José A. (1996). "Tempo, duration, and flexibility: Techniques in the analysis of
performance." *Journal of Musicological Research* 16(2), 111–156.
DOI 10.1080/01411899608574728.**
Whole-movement and sectional **durations** and derived average tempi for hundreds of
recordings in a computer database, plus bar-by-bar **tempo maps** from tap-along timing.
Two positions worth carrying: a work has not *a* tempo but a **tempo tolerance**,
"culturally and not mathematically determined"; and **overall duration is shaped less by
average tempo than by internal tempo modulation**, so duration is a poor proxy for tempo.
Programmatic claim: "the sound of music in performance, and not just the score, should be
the '**text**' of musicology." ⚠ The phrase "the tempo of the work" was **not found** in his
writing — do not quote it.
*Lesson:* **do not use total duration as a tempo feature.** And "tempo tolerance" is a
useful framing for a per-piece calibration band.

### Welte-Mignon and the roll-fidelity debate — see `survey-lit-welte.md`

The full verified bibliography for this strand (Hagmann 1984; Denis Hall's *Pianola
Journal* articles; Rex Lawson; Mark Reinhart; the Hänggi & Köpp *«Recording the Soul of
Music»* Seewen volume incl. Bärtsch on Busoni; Köpp 2023 on Debussy; Howat; Gottschewski;
Bausch; Dangel/Augustinermuseum) was produced by the Welte sub-survey and is **archived
verbatim at `comparison/survey-lit-welte.md`**. It is not duplicated here. What follows is
only what that strand *implies for the metric*, since those implications drive §4 and §5.

**W-1. Tempo uncertainty is structural, not incidental.** Red Welte rolls were cut for one
nominal speed, but over-long rolls were later cut with shortened perforations and labelled
"*Tempo langsamer stellen*" — telling the owner the speed is wrong but not by how much; and
the same roll on the same correctly-set instrument plays at different tempi (Hagmann's
Seewen measurements). Hall's formulation: "**If you do suspect the speed of a performance,
how do you tell if it is an eccentric old-fashioned interpretation playing at the correct
speed, or a more conventional approach at the wrong one?**"
⇒ **Level-invariant (shape-only) comparison is a musicological requirement for roll
corpora, not an optional product.** This independently confirms the conductor's
level/gain/shape decomposition (SURVEY.md A-Q2).

**W-2. Dynamics may be editorial.** Hall's position is that notes, timing and pedalling
were captured automatically but dynamics were not; Lawson argues the opposite; Reinhart
takes the middle — whatever was captured, "the raw data required a highly skilled editor to
interpret and translate it," and "**the role of the editor is one area which is never
addressed in any of the published accounts.**" The debate is unresolved.
⇒ **Dimension-selective comparison, including weight 0, must be first-class**, so an
analyst can run timing-only comparisons on roll corpora. A fixed weight vector that always
includes dynamics would produce results this community will reject on source-critical
grounds.

**W-3. Asynchrony may be an artefact of the mechanism.** Hagmann's "**künstliches
Arpeggio**": because the keyboard is split into two dynamic zones, melody/accompaniment
separation *must* be faked with microscopic time offsets, and Hagmann states the intentional
and the forced versions are **aurally indistinguishable**. Hall: "**this deception does take
place almost all the time in a reproducing piano roll recording.**"
⇒ Combined with Goebl (2001) in §1.1 — melody lead largely vanishes at the finger–key level
and is a **velocity artifact even on a real piano** — there are now **two independent
mechanisms** by which measured asynchrony is confounded with dynamics. An asynchrony
distance on roll data must be reported as a difference *in the encoding*, never as an
expressive finding, and the provenance must be attached to the number.

**W-4. Every roll copy and every transfer is a different object.** Gottschewski documented
substantial differences between copies of Welte roll No. 548 — the origin of the Global
Piano Roll Meeting rule that multiple copies of a title must be scanned
(`https://gprm.net/projects/roll-digitisation/`: "**Digitization is much more than just
capturing the punched holes**," and "**every roll is unique**").
⇒ **The noise floor is empirical and must be measured, not assumed** (see W-5 and V5).

**W-5. Howat's four-tier taxonomy for roll variants** — (1) clear corrections into the text;
(2) musically sensible variants; (3) barely plausible variants; (4) obvious fluffs —
⇒ is a **ready-made severity scale for the ranked deviation list** (charter U3). The module
does not have to invent a rhetoric for "how important is this difference"; this one is
already current in the source-critical literature.

**W-6. Bausch's three framing claims** — a roll is a *Tonsteuerungsträger* (control-command
carrier), not a *Tonträger*; roll and playback are two "Aggregatszustände" that must not be
equated; and conversion to MIDI is not transcription — with his methodological rule that
empirical procedure should be **restricted to the aspects that count as reliable,
"insbesondere die zeitliche Anordnung der Töne."**
⇒ **The trust mask is provenance-keyed and inverts the identity ranking.** For
studio-recorded MIDI, Stamatatos & Widmer rank articulation and asynchrony above tempo above
dynamics; **for roll-derived documents the ordering is nearly reversed** — trust note
ordering, distrust dynamics, treat asynchrony as confounded. This is §5 G7.


**Leech-Wilkinson, *The Changing Sound of Music*, §3.4 "Piano rolls"** (read in full) is
the best short statement of the fidelity problem in English:
- Reproducing rolls were marked "**assisted by an operator, the extent of whose musical (as
  opposed to technical) contribution remains unclear**," then "**the inked roll could be
  edited**… The mention of editing should already be raising concerns."
- Mechanisms could "**distinguish only two dynamic levels at once, one for the lower notes
  and one for the upper**."
- **The Grieg experiment:** Grieg's *Norwegian Bridal Procession* on a 1906 Welte roll
  (transferred by Denis Hall) vs. his 1903 G&T disc. "In general terms the performances
  within each pair are very similar; only a few details differ. **Grieg on disc tends to
  accent the second beat of the bar in the opening theme, whereas his roll does not.** He
  may have changed his approach… **or it may be that the assistant normalised what he
  perceived as an irregular accentuation.**" And: "**neither playing of the roll can match
  the subtleties of Grieg's rubato and dynamics.**"
- **The Paderewski control — the calibration experiment we must run.** Two transfers of the
  *same* Duo-Art roll 6566 (Chopin Mazurka Op. 24/4, Nov 1922) on different instruments
  differ by **eight seconds** in total duration and drift non-uniformly: "**it's impossible
  to know**… **Many of the things one might say about the pianist's response to the score at
  any specific moment would be different if one used the other recording.**"
- The governing conclusion (¶79): "**there is no way of knowing which details one hears
  faithfully reproduce what the pianist played. Consequently, for detailed work they cannot
  be relied upon**"; rolls "are well able to tell us about **general style**. **We must just
  be careful not to draw any conclusions from their details.**"
- The classic positive case is granted: Debussy's Welte roll of *La cathédrale engloutie*,
  where the roll doubles the speed at the minim-chord passages — "**the roll is thus the
  only evidence of Debussy's intention.**"
- **§6 supplies the measured dislocation datum:** Reinecke's 1905 Welte roll of Mozart
  K. 537 ii, where "**the notes of the melody are almost always delayed, sometimes by as
  much as 1/5 of a second**… the regularity of the arpeggiation and of the accompaniment
  beat lead us strongly to the sense that **the melody is late rather than the bass
  early**." He also flags the first quantitative study of the phenomenon: **Vernon, Leroy
  Ninde, "Synchronization of chords in artistic piano music," in Seashore (ed.), *Objective
  Analysis of Musical Performance* (Univ. of Iowa Studies in the Psychology of Music IV),
  1936, 306–345, at 322** — "the first systematic study of the phenomenon (though with data
  derived from piano rolls)."
*Lesson:* ⚠⚠ **the same-roll-different-transfer distance is the noise floor.** Any
distance smaller than it is meaningless. That calibration experiment is the first thing a
sceptical reader will demand, and we should run it ourselves.

### Digital roll scanning

**Shi, Z., Sapp, C. S., Arul, K., McBride, J. & Smith, J. O. III (2019). "SUPRA: Digitizing
the Stanford University Piano Roll Archive." *ISMIR 2019*, Delft, 517–523.
DOI 10.5281/zenodo.3527858; `https://supra.stanford.edu`; CC BY 4.0.**
[Full text read: `https://archives.ismir.net/ismir2019/paper/000062.pdf`]
Stanford holds "more than 16,000 rolls", mostly the Denis Condon Collection. SUPRA-RW is
**478 Welte T-100 "red Welte" rolls, ≈52 hours** — red Welte only. Pipeline: line-scan
camera at 300 DPI, green channel for hole extraction; **drift correction** (DFT, window
4096, zero-padded ×16); bridge removal (merge when spacing < 1.37× punch diameter);
expression emulation; audio rendering. **Best measured claim:** across 60 red rolls,
average total drift **20.8 ± 10.8 px** against a note-column spacing of 37.75 px; **five of
60 would produce wrong notes if played uncorrected**. Expression parameters: velocity min
35, mf 65, max 90, bass ≈5 levels below treble; slow crescendo as a non-linear one-pole
filter, fast as linear; roll speed 9.46 ft/min ± 0.5 giving **TPQ 568** with one MIDI tick
= one pixel row; **paper acceleration 0.22% per foot**. **Fidelity is asserted, not tested.**
⚠ **Terminology trap:** SUPRA's **raw MIDI** = one note per hole, expression holes as
audible notes, bridging retained; **expression MIDI** = de-bridged, velocities and pedals
applied, "suitable for listening and playback as well as for **computational performance
analysis**". Peter Phillips uses "raw MIDI" to mean the *opposite*. ⚠ **Count discrepancy:**
the paper says 478 rolls, the Stanford Digital Repository record 457, the GitHub repo 456
MIDI pairs — do not cite 478 as the number of downloadable pairs.

**Shi, Z., Arul, K. & Smith, J. O. (2017). "Modeling and Digitizing Reproducing Piano
Rolls." *ISMIR 2017*, 197–203.**
[`https://archives.ismir.net/ismir2017/paper/000025.pdf`]
**The field's only real fidelity experiment.** They recorded a push-up player driving a 9′
Steinway playing Chopin's Op. 42 Waltz (Welte Licensee, Katherine Bacon, 1924), then
compared that acoustic recording against their MIDI emulation using a **spectrogram
self-similarity matrix with DTW alignment** plus RMS energy. Results: alignment diagonal
"near straight… slope 1", **but the MIDI emulation runs 8 seconds longer**; "**the original
playback has a wider dynamic range than our synthesized MIDI file**"; pedal excluded;
**n = 1**.

**Sapp's tooling** — `https://github.com/pianoroll`: `roll-image-parser` (C++, TIFF →
musical data, emitting an **ATON** text report with ~35 roll-level fields including
`DRIFT_RANGE`, `BAD_HOLE_COUNT`, `EDGE_TEAR_COUNT`, `DUST_SCORE`, `BRIDGE_FACTOR`,
`MANUAL_EDITS`), `midi2exp` (raw → expression MIDI; flags `-w` red Welte, `-g` green,
`-l` Licensee, `-h` 88-note), `midiroll`, `piano-roll-analyses`, `pianolatron-data`.
Its `ROLL_TYPE` enumeration covers `welte_red`, `welte-green`, `welte-licensee`,
`ampico-a`, `ampico-b`, `duoart` — **software support is broader than the published
dataset.** No MusicXML exists anywhere in this ecosystem.
*Lesson:* those ATON quality fields are exactly the **per-document provenance and
confidence metadata** a comparison report needs to carry. Do not throw them away at import.

**Estrada Bascuñana, Carolina (2019). "Enrique Granados's Performance Style: Visualising
the Audible Evidence." In *Rund um Beethoven*, 150–179. DOI 10.26045/kp64-6178-008. Open
access; read in full.** The fullest published roll-vs-disc comparison: Granados recorded 17
works 1912–16 across both media — **38 piano rolls (10 Hupfeld, 9 Pleyela, 9 Welte-Mignon,
10 Duo-Art) + 4 Odeon 78s**. She **refused commercial CD transfers of rolls on
source-critical grounds**. Findings: for *Danza española* No. 10 "a similar dynamic pattern
in both versions in bars 74–78"; for Scarlatti K. 190 "**Welte and Odeon recordings
coincide in the overall time duration**".
⚠ **The caveat every computational project must carry**, quoted by Estrada from Phillips
(e-mail, 1 March 2018): "**MIDI files extracted from a roll scan do not give the accuracy
needed to compare tempos.** A scan requires the paper to move past the scanning element at
a constant speed… **There is really no way to determine the playing time of a MIDI file
derived this way.**" **Estrada's mitigation is the right methodological move:** "the tempo
fluctuations within the performance **are relative to the roll speed**, meaning that the
time distances between the notes and the expressive gestures will be **proportional** to
the speed of the roll. Nevertheless, **not being able to define the correct musical tempo
does not interfere in the performance analysis**."
*Lesson:* ⚠ **make every timing distance scale-invariant.** Absolute BPM is not recoverable
from a roll; ratios and curve *shape* are.

Also verified: **Phillips, Peter (2017). *Piano Rolls and Contemporary Player Pianos.* PhD
thesis, University of Sydney. `http://hdl.handle.net/2123/16939`** — his **pneumatic roll
reader** captures dynamics directly as MIDI velocities (>5,500 rolls read); his diagnosis
is that dismissals "have been formed through hearing rolls replayed on poorly adjusted
instruments; **the piano rolls themselves are not the problem**." **Colmenares, Escalante,
Sans & Surós (2011), "Computational Modeling of Reproducing-Piano Rolls," *CMJ* 35(1),
58–75, DOI 10.1162/COMJ_a_00040**; **Leikin, A. (2002), "Piano-Roll Recordings of Enrique
Granados," *Journal of Musicological Research* 21(1–2), 3–19,
DOI 10.1080/01411890290024333** — argues "**direct transcriptions of piano-roll
perforations may be more reliable than some latter-day piano-roll disc [transfers]**";
**Dangel & Schmitz (2006), *Welte-Mignon Klavierrollen: Gesamtkatalog…*,
ISBN 3-00-017110-X**, database at `http://www.welte-mignon.de/kat/`; **Lehner, Michael
(2019), "Das Orchester auf dem Klavier: Welte-Klavierrollen von Gustav Mahler und Richard
Strauss als interpretationsanalytische Quellen," in *Rund um Beethoven*, 413–430,
DOI 10.26045/kp64-6178-024** — analyses the Mahler/Strauss rolls under the categories
**Phrasierung, Tempogestaltung, Rhythmik, Dynamik**. **HKB Bern / Seewen "Wie von
Geisterhand (2)"** (2008–10, >1,000 rolls scanned) produced the crucial source-critical
finding "**dass die Oberflächen der Rollen vielfach manuell nachbearbeitet worden sind**";
**nothing is downloadable**.
⚠ **Dead or hijacked URLs still cited in this literature — do not cite:**
`trachtman.org/rollscans` (now casino spam), `rprf.org`, `iammp.org`, `mpronline.net`,
`terrysmythe.ca`, `library.stanford.edu/projects/player-piano-project` (404, cited by both
ISMIR papers). **Explicit negatives:** IMSLP holds no roll scans; DLfM has published nothing
on rolls; the Pianola Institute hosts no digitisation.
**Genuine gaps in the literature, not in the searching:** no dedicated peer-reviewed study
of the Grieg 1906 Welte rolls, none of the Reger Welte rolls, and **no published study
systematically comparing Rachmaninoff's Ampico rolls with his Victor discs**.

---

## §1.7 Distance and similarity precedents in symbolic music comparison

Included only for what their **metric-design choices** teach.

**Mongeau, M. & Sankoff, D. (1990). "Comparison of musical sequences." *Computers and the
Humanities* 24(3), 161–175. DOI 10.1007/BF00117340.** ⚠ **Full text is closed access**; the
recurrence below is verified from three independent restatements (Roy/Papadopoulos/Pachet
2017; Grachten et al. 2004; Rizo 2010), not from the original.

```
δ(i,j) = min {  δ(i−1, j)   + w_del(a_i)
                δ(i,   j−1) + w_ins(b_j)
                δ(i−1, j−1) + w_subst(a_i, b_j)
                δ(i−1, j−k) + w_frag(a_i, b_{j−k+1..j}),   2 ≤ k ≤ j
                δ(i−k, j−1) + w_cons(a_{i−k+1..i}, b_j),   2 ≤ k ≤ i  }
```

with substitution cost `w_subst(a_i, b_j) = w_pitch(a_i, b_j) + k₁ · w_len(a_i, b_j)`,
"where k₁ is the predefined relative contribution of length difference versus that of pitch
difference". The two extra operations — **fragmentation** (one note → several) and
**consolidation** (several → one) — are the design contribution: they model *real musical
transformations* rather than character edits. ⚠ **[unverified]:** the numeric `w_pitch`
consonance table and the numeric value of `k`. Do not cite either without the original PDF.
Roy et al. (2017) also document a real defect: **the original charges nothing for
fragmenting a note into shorter notes of the same pitch and same total duration**, so they
add a constant penalty `p`.
*Lesson:* add operations that model real transformations — and **charge for them**, or the
path will find zero-cost rewrites that are musically substantive. For MPM the analogue is
obvious: splitting one `dynamics` transition into two consecutive ones with the same
endpoints must not be free.

**Grachten, M., Arcos, J.-L. & López de Mántaras, R. (2004). "Melodic similarity: looking
for a good abstraction level." *ISMIR 2004*.**
[`https://archives.ismir.net/ismir2004/paper/000166.pdf`]
Four edit distances at four abstraction levels — notes, signed intervals, contour
directions, Narmour I/R structures. Their **note-level cost model is a *simplified*
Mongeau–Sankoff** with **no consonance weighting at all**. For contour sequences they drop
fragmentation/consolidation entirely ("there is no correspondence to
fragmentation/consolidation as musical phenomena") and use the **IOI-weighted interval
cost** `|P₂ − P₁| + k·|IOI₂ − IOI₁|` with deletion cost `1 + k·IOI₁`, using **k = 2.0**.
They are candid: "we do not claim these are the only right choices." Won MIREX 2005
Symbolic Melodic Similarity (ADR 65.98%).
**Their evaluation is notable for what it avoids:** they explicitly reject human-ratings
ground truth as impractical and instead measure (a) **discriminatory power as the entropy
of the distance distribution** and (b) **KL divergence between within-song and
between-song distance distributions**.
*Lesson:* the entropy/KL pair is a **cheap validation that needs no human ratings and no
retrieval ground truth** — ideal for rapid iteration before committing to an expensive
evaluation. Adopt it as the metric-property test suite's statistical half.

**Typke, R., Giannopoulos, P., Veltkamp, R. C., Wiering, F. & van Oostrum, R. (2003).
"Using Transportation Distances for Measuring Melodic Similarity." *ISMIR 2003*, 107–114.**
[`https://webspace.science.uu.nl/~veltk101/publications/art/ismir03.pdf`]
Notes become **weighted points in 2-D** (onset time, pitch; weight = duration), compared by
the **Earth Mover's Distance**. §3 is unusually explicit about metric axioms: EMD is a
metric only when the ground distance is a metric *and* total weights are equal; under
unequal weights it **violates the triangle inequality**, with a musical counterexample —
for melodies A, B and their concatenation AB, `d(A,B)=1` but `d(A,AB)=d(AB,B)=0`. They
therefore adopt the **Proportional Transportation Distance** (normalise each point set's
weights by its total, then take EMD) specifically to restore the triangle inequality for
indexing. Their stated requirements: "we need self-identity and symmetry. The triangle
inequality is useful for efficiently searching the database. **Positivity is not
necessarily always desired**" — losing positivity is what buys partial matching.
*Lesson:* **decide which axioms you need and for what.** If the triangle inequality is
needed only for indexing, there are two verified escape routes: normalise to restore it, or
keep the non-metric and decompose the space into metric subspaces (**Typke &
Walczak-Typke (2008), "A Tunneling-Vantage Indexing Method for Non-Metrics," *ISMIR 2008*,
683–688**, who name the general object a **prametric**).

**Rizo, D., Iñesta, J. M. & Moreno-Seco, F. (2003). "Tree-Structured Representation of
Musical Information." *IbPRIA 2003*, LNCS 2652, 838–846.** and **Rizo, D. (2010). *Symbolic
Music Comparison with Tree Data Structures.* PhD thesis, Universidad de Alicante, 269 pp.**
[`https://rua.ua.es/dspace/handle/10045/18331`]
⚠ **No paper titled "Melodic similarity through tree edit distance" exists** in this corpus.
**Duration lives in the tree structure, pitch in the node labels**: one subtree per measure,
split binarily (ternarily for ternary meters) until a node's implicit duration matches an
actual note; only leaves are labelled initially, then bottom-up propagation fills internal
nodes (harmonic tones always win; ties broken by metrical strength; notes always beat
rests). **The cost model, verbatim: "The weights used for the edit distance have (in all
experiments) been set to 1 for insertion and deletion. For substitution, the weight is 0 if
the interval/note is the same and 1 otherwise. Other tested weights did not improve the
results."** Recursive subtree indel: `c_t(v, λ) = c(label(v), λ) + Σ_{vᵢ ∈ children(v)}
c_t(vᵢ, λ)`. The thesis states outright: "**In this dissertation no fine tuning of edit
costs has been presented.**"
*Lesson:* ⭐ **prefer encoding musical knowledge in the representation over encoding it in
the costs.** Rizo puts rhythm in the tree *shape* and keeps costs at trivial unit values.
For MPM this suggests: normalise documents into a canonical, structure-aware form first
(resolve styles, canonicalise curve segmentation), then use simple costs — rather than
hand-tuning a large cost matrix over raw attributes.
Learned costs are a separate, later development: **Habrard, Iñesta, Rizo & Sebban (2008),
"Melody Recognition with Learned Edit Distances," SSPR/SPR, LNCS 5342, 86–96** — "both
learning models outperform fixed-costs systems"; ⚠ **the actual learned-cost formulas are
[unverified]** (paywalled).

**Dixon, S. & Widmer, G. (2005). "MATCH: A Music Alignment Tool Chest." *ISMIR 2005*.**
[`https://www.cp.jku.at/research/papers/dixon_ismir_2005.pdf`]
Aligns **two audio renditions directly**. Frames → windowed FFT → non-linear frequency
scale → **half-wave-rectified time derivative** `E'ₓ(f,t) = max(Eₓ(f,t) − Eₓ(f,t−1), 0)`
(the "positive spectral difference", which *emphasises note onsets*) → **Euclidean
distance**. A **forward path estimation** adaptively centres a fixed-width band (w = 500)
on the estimated path, giving linear time and space. Tested on 462 pairwise cases (22
performances, all pairs), **median error 20 ms**, <1% failures. Framed explicitly as a way
to transfer beat/phrase/note annotations from one recording to another. Companion:
**Dixon, S. (2005), "Live Tracking of Musical Performances Using On-Line Time Warping,"
*DAFx-05*.**

**Nakamura, E., Yoshii, K. & Katayose, H. (2017). "Performance Error Detection and
Post-Processing for Fast and Accurate Symbolic Music Alignment." *ISMIR 2017*, 347–353.**
[`https://eita-nakamura.github.io/articles/EN_etal_ErrorDetectionAndRealignment_ISMIR2017.pdf`]
Observation model: pitch errors via `ψ_pitch(δp)` over semitone deviation; onset-time
fluctuation `ψ_time(δt) = N(δt; 0, ρ²)`; inter-onset intervals **between chordal notes obey
an exponential distribution**; those **between onset clusters** are approximately the
product of local tempo and score-time interval. Notes within **35 ms** are clustered into a
chord. **The merged-output HMM** handles two-hand asynchrony: two per-voice Markov chains
whose outputs are merged, with `P(Yₘ|Yₘ₋₁) = ½(δ_{sL} χ^L δ + δ_{sR} χ^R δ)` — applied only
inside error regions after a cheap first pass. Alignment error rates: **0.18 ± 0.08 /
0.79 ± 0.06 / 0.48 ± 0.03 %** on three datasets, best on all three, ~5.5 s processing.
Design insight: **>90% of performance errors are contained in error regions as small as
Δ = 0.1 s, while those regions hold <20% of the notes**.
*Lesson:* spend expensive modelling only where it is needed — a cheap global pass plus an
expensive local one. Also: the 35 ms chord-clustering threshold is the field's operational
definition of "simultaneous", and it sits just above the 30 ms perceptual threshold used by
Goebl et al. (2010).

**Gadermaier, T. & Widmer, G. (2019). "A Study of Annotation and Alignment Accuracy for
Performance Comparison in Complex Orchestral Music." arXiv:1910.07394.**
[`https://arxiv.org/pdf/1910.07394`]
**The closest thing to an explicit treatment of the score-relative comparison question.**
The scenario studied *is* ours: "manually annotate only one performance, and then
automatically synchronize other performances", establishing "a common musical grid for a
number of performances". Seven recordings (Beethoven S9-1, Bruckner S9-3, Webern Op. 21-2),
21 complete manual annotations by three annotators. **Human annotation precision (median
SD): 27–32 ms for Beethoven, 52–68 ms for Bruckner, 47–63 ms for Webern** — the noise floor
is piece-dependent and can exceed 60 ms in dense texture. 312 alignment configurations
swept; **best mean absolute errors 38 / 116 / 62 ms**; MFCC and MFCC-mod won, chroma did
not; **l₁ was frequently best**. Conclusion: "transferring the score event markers to other
recordings of the same piece should yield not much worse accuracy than what is to be
expected from human annotations."
*Lesson:* **budget error against human annotation precision, not against zero.** A distance
whose input carries 60 ms of grid noise must not report differences at 10 ms resolution.

**On DTW-between-performances vs. score-relative comparison — an honest gap.** No paper was
found whose thesis is "score-relative comparison is preferable to DTW-between-performances."
What the literature supplies is converging *implicit* argument: Sapp (2007, 2008) compares
performances as feature vectors **indexed by beat number**, which is a score timeline by
construction, because Pearson correlation requires equal-length sequences; Dixon & Widmer
(2005) and Gadermaier & Widmer (2019) both use pairwise audio DTW *for the purpose of*
establishing a shared score-event grid — the DTW is instrumental, the grid is the product;
Desain & Honing (1993) supply the theoretical reason (timing is meaningful only relative to
structure, and interpolating between events is illegitimate — a DTW path has no structural
anchors); and Nakamura et al. (2017) show the score-relative route is now cheap and
accurate, removing the practical objection.
*Lesson for MPM:* this is settled in our favour by construction — **two MPM documents over
the same MSM already share a symbolic score timeline in ticks.** We inherit the shared grid
for free, which is the single hardest part of every audio-based study in this survey. Say
so; it is the module's structural advantage.

---

## §1.8 Evaluation practice — how the field validates a similarity metric

**(i) Agreement with human judgments.** The canonical fit-to-experts study is
**Müllensiefen, D. & Frieler, K. (2004), "Cognitive Adequacy in the Measurement of Melodic
Similarity," *Computing in Musicology* 13, 147–176**
(`http://www.doc.gold.ac.uk/~mas03dm/papers/CM_MullensiefenFrieler_2004.pdf`): 82 raters,
84 error-seeded variants, test–retest one week apart, **only 23 raters retained**
(Kendall τ_b ≥ 0.5); retained-expert reliability **Cronbach α = 0.962 / 0.978**; the
three-term **opti3** model reached **R² = 0.921**. **Pearce, M. & Müllensiefen, D. (2017),
*JNMR* 46(2), 135–155** correlate compression distances against the same ratings (best
r = −.892); their comparison table gives edit distance .797/.895/.802 vs. opti3
.911/.960/.859, and — important — **the symmetric variant fit human ratings better than
either asymmetric variant.**
**For performances specifically, Gingras et al. (2011)** (§1.4) is the model: **adjusted
Rand index** against the same-performer partition, plus a demonstration that the
computational within-vs-between correlation ratio *predicts* which performers listeners
group correctly. **No other verified paper closes that loop.**
**The sobering counterweight is Repp (1999, III)**: 9–18% of aesthetic rating variance.

**(ii) Performer identification as a proxy — the field's de facto standard for performance
distances.** Sapp (2008): S4 gives 3–4× better rankings than plain correlation. Saunders et
al. (2008): ~82.2% pairwise on tempo/loudness strings. But **report *n*-way as well as
pairwise** — pairwise is "easier for a classifier than the n-class problem" (their own
caveat), and ATEPP's 16-way CNN drops to 0.47. Modern calibration points: **Tang, Wiggins &
Fazekas (2023), arXiv:2310.00699** — 85.3% on 6-way; **Rafee et al. (2021)** — F1 = 0.807
with norm-deviation features; **Cheston et al. (2024), PMC11557239** — rhythm-only, 59%
over 10 jazz pianists (6× chance).

**(iii) Clustering against known ground truth — thinner than it looks.** The operational
ground truths actually used are **same performer** (Sapp 2008; Saunders et al.) and,
forensically, **same recording** (Sapp's Cortot case). **No verified study clusters
performances and evaluates against a documented pedagogical school or teacher-lineage
ground truth.** The closest are Repp (1998) — PCA over 115 recordings yielding four timing
strategies but the *negative* result that "there were no strong relationships between any of
these variables and sociocultural characteristics of the artists" — and Cook (2007), whose
teacher/pupil confirmation is presented as a single instance. Cancino-Chacón et al. (2018)
summarise the state as "**only weak evidence for the existence of 'performance schools'**".
*Lesson:* **if we want a school/lineage evaluation, the literature supplies no baseline.**
That is simultaneously a gap and a risk: a crisp clustering result will be read as
suspicious.

**(iv) Retrieval metrics.** MIREX Symbolic Melodic Similarity ran **2005, 2006, 2007,
2010–2015** (not 2008/2009, not after 2015); `https://music-ir.org/mirex/wiki/`. Four
measures side by side: **ADR, NRGB, AP, P@N** — ⚠ **AP, not MAP.** The ground truth is a
**partially ordered list** (Typke et al. 2005: experts rank all incipits showing any
similarity; group boundaries drawn by **Wilcoxon rank sum** at p < 0.25), evaluated by
**Average Dynamic Recall** (Typke, Veltkamp & Wiering, ICME 2006), whose relevant set grows
by a whole group at each boundary so that reordering within a tied group cannot change the
score. Design criterion: **no free parameters**, explicitly a jab at nDCG (swapping log₂ for
log₃ can *invert* system rankings). ⚠ **[unverified]:** no published formula for **NRGB**
could be found despite it being a headline column 2005–2015. Absolute scores are low and
unstable across collections (MIREX 2006 ADR spans 0.000 to 0.819).
*Lesson:* a **partially ordered ground truth** is the honest instrument when similarity is
continuous — musicologists will not give a total order over 60 mazurka performances, but
they will give groups.

**(v) Metric axioms — the field cares, but mostly for indexing.**
**Marsden, A. (2012), "Interrogating melodic similarity: a definitive phenomenon or the
product of interpretation?" *JNMR* 41(4), 323–335**
(`https://www.lancaster.ac.uk/staff/marsdena/publications/MarsdenJNMR2012.pdf`) is the
meta-discussion, verbatim: "**The literature on melodic similarity does not include
discussion of such asymmetry … and the published models do not account for it.**" On the
triangle inequality: "**The property most commonly questioned is triangle inequality** …
Despite such easily imagined counter-examples, **those who use systems of measurement with
the property of triangle inequality have not reported failure to match human judgements** …
Indeed **it is not uncommon to adapt a measure precisely so that it has the property of
triangle inequality** … **with the objective of facilitating the organisation and searching
of a database.**" His own empirical contribution: Monte Carlo re-analysis of the MIREX 2005
ground truth found **third-melody context effects 2–3× more common than chance**
(12.88%/10.31% at p<0.05 vs. 5% expected). **Tversky, A. (1977), "Features of Similarity,"
*Psychological Review* 84(4), 327–352, DOI 10.1037/0033-295X.84.4.327** is the standard
citation for human similarity being asymmetric and non-metric [full text closed; content
verified through page-numbered quotations in Marsden 2012 and Pearce & Müllensiefen 2017].
*Lesson:* "we checked the axioms and here is what our users actually do" would be a genuine
contribution — the melodic-similarity literature has an acknowledged open gap here.

**(vi) Desain & Honing — the normalisation constraints.**
**Desain, P. & Honing, H. (1993). "Tempo curves considered harmful." In J. D. Kramer (ed.),
*Time in Contemporary Music Thought*, *Contemporary Music Review* 7(2), 123–138.**
[Full text read: `https://www.mcg.uva.nl/mcg-2023/papers/DH-93.pdf`] **Central; get it
right.** The thesis, verbatim: "The notion of these tempo curves is dangerous, despite its
widespread use, because it lulls its users into the false impression that a continuous
concept of temporal flow has an independent existence, a musical or psychological reality,
and that time can be perceived independent of events carrying it. But if one bases a
transformation or manipulation of timing on the implied characteristics of such a notion,
one is doomed to fail."
The demonstrations: uniform 1.5× tempo scaling "sounds like a gramophone record played at
the wrong speed"; **copying the tempo track from the theme onto the first variation of
Beethoven's *Nel cor più non mi sento* fails in both directions** — "the timing made sudden
jumps, like a beginner sight-reading"; Clynes, Todd and Sundberg models each fail for a
different structural reason; **linear interpolation and even spline smoothing of the time
map still fail** — the pianist's verdict: "your numerical calculations have nothing to do
with the way I played it." Grounded in Gibson: "one cannot perceive timing without events
carrying it," so "'filling up' time by adding an event between two measured points is
problematic."
**The single most useful box for our purposes** ("Objective time, duration and tempo
measurements"), verbatim: "Because in such a representation it is difficult to compare
notes of different nominal duration, a proportional measure is better. It makes the step
from duration to relative duration by dividing two corresponding durations. In case a
performance duration is divided by a score duration, this forms a series of **duration
factors** (often misleadingly called tempo)." … "In both cases the measured points are
often filled in with line segments — implying the existence of a tempo measurement in
between events. **This is misleading — the more so because integration does not yield the
original time map again.**" … "**Tempo is sometimes presented on a logarithmic scale; this
is a first step towards the use of subjective magnitudes.**"
**Note the paper is not nihilistic:** measuring tempo curves for the *study* of expressive
timing is explicitly "encouraged"; what is condemned is treating them as an underlying
representation **for transformation**.

**Honing, H. (2001). "From Time to Time: The Representation of Timing and Tempo." *Computer
Music Journal* 25(3), 50–61. DOI 10.1162/014892601753189538.**
[Full text read: `https://www.mcg.uva.nl/mcg-2023/papers/mmm-1.pdf`]
Verbatim: tempo curves "have been shown to fall short as an underlying representation of
timing from a musical perspective … and a psychological perspective. For instance, some
types of timing, like **chord spread** (the asynchrony in performing a chord), **ornaments**
(like grace notes), or the **timing between parallel voices** simply cannot be measured or
represented as tempo deviations." His alternative, **timing functions**, splits expressive
timing into **a tempo component** and **a time-shift component**: "Mathematically, tempo
changes can be expressed as time-shifts and vice versa: they are equivalent under some
constraints … However, they are **musically very different notions** … **listeners do
perceive tempo relatively independently from timing**." He also insists timing be specified
**relative to temporal structure** (position in the phrase or bar), and that transformations
be objects *within* the representation so they can adapt when re-applied.
*Lesson:* this is a **direct endorsement of MPM's architecture** — MPM already separates
`tempoMap` (tempo component) from `rubatoMap` + `asynchronyMap` + `ornamentationMap`
(time-shift components), exactly the split Honing argues for and that a single tempo curve
cannot express.

**Honing, H. (2007). "Is expressive timing relational invariant under tempo
transformation?" *Psychology of Music* 35(2), 276–285. DOI 10.1177/0305735607070380.**
[Not OA; internal statistics **unverified**. The argument is verifiable from the author's
own earlier full text: **Honing (2005), "Timing is Tempo-Specific"**,
`https://www.mcg.uva.nl/mcg-2023/papers/Honing-2005c.pdf`, read in full: N = 307, jazz and
classical fragments, ±20% time-stretching, forced-choice "is this an original recording?" —
**listeners identified originals significantly above chance** (Classical, N = 175:
χ²(9) = 122.50, p < .0001).] This supports **tempo-specific timing** and is counter-evidence
for **relational invariance**. Verbatim on why it matters for representation: representing
timing as a tempo curve "suggests that the shape of a tempo curve is independent of the
number of events (or note density), the rhythmic structure … and the overall tempo of the
performance" — and it is not.
Companion pair: **Desain & Honing (1994), "Does expressive timing in music performance
scale proportionally with tempo?" *Psychological Research* 56(4), 285–292,
DOI 10.1007/BF00419658** and **Repp, B. H. (1994), "Relational invariance of expressive
microstructure across global tempo changes in music performance: An exploratory study,"
*Psychological Research* 56(4), 269–284, DOI 10.1007/BF00419657** — the two are an exchange
on the same question in the same issue.
*Lesson:* **do not assume expressive timing scales proportionally with tempo.** A
performance distance built by normalising out global tempo is discarding real, perceptible
signal — so global tempo difference must be reported as its own channel, not silently
divided out.

---

# §2 What the field compares — quantities × methods

Consolidated from §1. "MPM home" is where the quantity lives in an MPM document; a dash
means MPM has no native slot.

| Quantity | How measured | Normalisation used in the literature | How compared | MPM home | Key citations |
|---|---|---|---|---|---|
| **Global tempo** | total or sectional duration; average IBI | none (absolute BPM) | scalar difference; "tempo tolerance" band | `tempoMap` (`bpm`) | Bowen 1996; Hall 2012 (unrecoverable from rolls) |
| **Beat-level tempo / IOI** | beat onsets by tapping (Sapp), score–perf. alignment (Nakamura), audio DTW (Dixon) | **duration factor** = perf. dur ÷ score dur; **log₂ ratio to piece mean** (`y_log_bpr`); z-score per piece | Pearson correlation, at **all timescales** (scape); L2 on log-ratios; string kernel over clustered segments | `tempoMap` + `rubatoMap` | Repp 1992; Sapp 2007/2008; Desain & Honing 1993; Cancino-Chacón 2018 |
| **Smoothed tempo (phrase arch)** | low-pass of the beat-tempo curve | as above | correlation on the smoothed series; parametric arch fit | `tempoMap` transitions (`meanTempoAt`) | Todd 1985/1992/1995; Sapp 2008; Widmer & Tobudic 2003 |
| **Residual tempo (metrical accent)** | `c = a − b`, raw minus smoothed | as above | correlation on the residual — carries distinct performer identity | `metricalAccentuationMap` + `rubatoMap` | Sapp 2008 |
| **Local timing deviation** | onset minus its equivalent onset | **raw seconds**; sign conventions conflict (⚠ partitura `+ = late`, thesis `+ = anticipated`) | per-note deviation; KL divergence between deviation **distributions** | `imprecisionMap.timing`, `articulation/@absoluteDelay` | Rafee et al. 2021 (OT best single feature); Honing 2001 |
| **Final ritardando** | IOI series over the closing passage | mean-centred per piece; noise-filtered by local tempo | 2-parameter kinematic fit (curvature *w*, depth *q*); per-piece centroid subtraction | `tempoMap` transition + `meanTempoAt` | Grachten & Widmer 2009; Molina-Solana et al. 2010; Friberg & Sundberg |
| **Dynamics / loudness** | MIDI velocity; **sones** (Zwicker) for audio; raw power `10 log₁₀(…)` | ÷127; mean-centred per piece; z-scored per piece; ÷ recording max; log-ratio to performance mean — **four coexisting conventions** | correlation on the beat-level curve; interleaved with tempo after z-scoring | `dynamicsMap` (+ `articulation` velocity modifiers) | Langner & Goebl 2003; Sapp 2007; Grachten & Widmer 2012; Kosta et al. 2016 |
| **Articulation** | off-time duration (OTD); key-overlap; ratio of performed to notated duration | `log₂(dur_perf/(dur_notated·BP))`; thresholded classes (staccato <80%, legato >1.0) | per-note ratio difference; **ranked most informative for identity** | `articulationMap` (`relativeDuration`, `absoluteDurationMs`, …) | Stamatatos & Widmer 2005; Cancino-Chacón 2018; Widmer 2003 |
| **Chord asynchrony / melody lead** | onset offsets between voices; hammer-string **vs** finger-key | raw ms; 30 ms perceptual threshold; 35 ms chord-clustering window | signed/unsigned mean per voice pair; run detection for "earlier rubato"; ⚠ **largely a velocity artifact** | `asynchronyMap` | Vernon 1936; Palmer 1989/1996; Repp 1996; **Goebl 2001**; Goebl et al. 2010 |
| **Bass anticipation / dislocation** | left-hand onset minus right-hand onset | raw ms (≥70 ms typical) | signed asynchrony conditioned on metrical position | `asynchronyMap` (per-part) | Vernon 1936; Peres da Costa 2012 ch. 2; Goebl et al. 2010 |
| **Arpeggiation / chord spread** | onset spread within a chord; direction; hand combination | raw ms | spread magnitude, direction, per-hand pattern — **cannot be expressed as tempo deviation** | `ornamentationMap` | Peres da Costa 2012 ch. 3; Honing 2001 |
| **Metrical accentuation** | beat-position-conditioned timing/dynamics residual | residual after smoothing | pattern per metrical position | `metricalAccentuationMap` | Sapp 2008 (mazurka beat-2/3 lengthening) |
| **Rhythmic alteration (*inégale*, over-dotting)** | performed ratio of adjacent equal-notated values | ratio to notated ratio | ratio distribution; dotting-ratio as a category | `rubatoMap` (`intensity`) | Hähnel & Berndt 2011; Peres da Costa 2019; Philip 1992 ch. 3 |
| **Pedalling** | pedal on/off times from MIDI or roll | raw ms; tempo-dependent | onset/offset relative to note events | ⚠ **meico `movementMap` only — not in the MPM schema** | Repp 1996/1997; Hall 2001 |
| **Timing/dynamics imprecision** | SD of deviations across repetitions | per-note SD | distribution parameters | `imprecisionMap.*` (with `seed`) | Repp 1995; — no comparison precedent |
| **Vibrato, portamento, intonation** | f0 trace | — | descriptive/aural | ⚠ **none in MPM** (`detuneCents` only) | Philip 1992 Parts II–III; Molina-Solana et al. 2008 |
| **Trajectory in tempo–loudness space** | joint (tempo, loudness) per beat, Gaussian-smoothed | 5 forms swept: none / −mean / ÷mean, each global or local | visual comparison; SOM clustering; **string kernel over prototype alphabet** | `tempoMap` × `dynamicsMap` (derived) | Langner & Goebl 2003; Widmer et al. 2003; Goebl et al. 2004; Saunders et al. 2004 |
| **Whole-performance signature** | any of the above, aggregated | norm-deviation, then histogram/KDE/GMM | **KL divergence** (order-free); phylogenetic quartets over per-category distances | derived | Rafee et al. 2021; Liebman et al. 2012 |

Three cross-cutting observations from the table:

1. **MPM covers more of the column than any prior representation.** The audio-derived
   traditions can measure tempo and loudness well, articulation with difficulty, and
   asynchrony only with a monitored piano. MPM carries all of them symbolically, plus
   ornamentation and imprecision, which nothing else does.
2. **The two dimensions the literature ranks highest for identity — articulation and
   asynchrony — are exactly the two the dominant comparison tradition (the worm, the
   Mazurka Project) cannot see.** That is the module's opening.
3. **The normalisation column is where every incompatibility lives.** Four loudness
   conventions, two timing sign conventions, tempo-as-period vs. tempo-as-rate, log base 2
   vs. e. Pin them all, in writing, in the design document.

---

# §3 Research questions a comparison module should answer

Grouped by the kind of researcher asking. Each is attributable; the bracketed note says
what the module must compute to serve it.

### Practice-taxonomy questions (Peres da Costa; Philip; Hudson; Rosenblum)

1. Did pianist X dislocate melody from bass more than pianist Y, and in which textures and
   tempi? — *Peres da Costa 2012 ch. 2.* [signed per-voice asynchrony, conditioned on
   texture and local tempo]
2. Which chords are arpeggiated, in which direction, at what speed, and in which
   hand-combination? — *Peres da Costa 2019, feature vii.* [`ornamentationMap` spread
   magnitude + direction + hand assignment]
3. Is a given asynchrony "melody late" or "bass early"? — *Leech-Wilkinson ch. 6 ¶24, on
   Reinecke.* [signed asynchrony **relative to the accompaniment's own beat grid**, not to
   the score tick]
4. Does the performer play *inégale* (long–short) where equal values are notated, and
   over-dot notated dotted rhythms? — *Peres da Costa 2019, features iii–iv; Hähnel &
   Berndt 2011.* [`rubatoMap` intensity, plus performed-ratio distributions]
5. Does the performer modify tempo **for character**, **for structure**, **for cadence**,
   or **for a single affective transition**? — *Peres da Costa 2019, feature vi — a
   four-way functional typology, directly operationalisable.* [tempo deviations classified
   by the score context they coincide with]
6. Has "earlier"/contrametric rubato been replaced by "later"/agogic rubato, and when? —
   *Hudson 1994; Rosenblum 1994.* [**the flagship query**: ratio of asynchrony-channel
   energy to tempo-channel energy, per document, plotted against date — with Goebl et
   al.'s 30 ms + density run detector]
7. Which features changed most between 1900 and 1950? — *Philip 1992, the organising
   question of the whole book.* [per-dimension distance from a period centroid]

### Corpus-scale style-history questions (Bowen; Cook; Sapp; Leech-Wilkinson)

8. Do performances **cluster**, and do the clusters correspond to **documented teacher/pupil
   relationships**? Can a **performance genealogy** be proposed? — *Cook 2007.* [distance
   matrix + linkage, with lineage as an external overlay — and see §1.8(iii): no baseline
   exists]
9. Is it possible to draw musically meaningful conclusions **from tempo data alone**? —
   *Cook 2007.* [per-dimension distance, so the tempo-only answer is separable]
10. Did expressivity operate **moment-to-moment earlier in the century and phrase-to-phrase
    later** — i.e. is the phrase arch a **period style rather than a universal**? —
    *Leech-Wilkinson ch. 7 ¶12, citing Sapp.* [**the scape is the instrument**: which
    timescale carries the between-performance variance, as a function of date]
11. Where in the piece, and **at what timescale**, are two performances similar — since a
    single correlation number "is virtually meaningless"? — *Sapp, mazurka.org.uk/ana/hicor.*
    [multi-scale localised distance; this is U3 in the charter]
12. Which of a set of candidate performances is **nearest** to a target, region by region? —
    *Sapp's polycorrelation plots.* [per-region nearest-neighbour map over a corpus]
13. Are two recordings **the same performance** (a provenance/fraud question)? — *Cook &
    Sapp, "Purely coincidental?"* [the one claim a distance can make at full strength]
14. How do **three recordings by the same performer** differ, relative to how performers
    differ from each other? — *Spiro, Gold & Rink 2010; Repp 1992 on Cortot ×3 and Horowitz
    ×3.* [**the within-performer null model — no between-performer distance is
    interpretable without it**]
15. What is a work's **tempo tolerance**, and is that band culturally or mathematically
    determined? — *Bowen 1996.* [per-piece distribution of global tempo across the corpus]

### Empirical-psychology questions (Repp; Clarke; Todd; Honing)

16. Is there a **universal pulse or timing pattern** underlying all performances of a work?
    — *Repp 1990 (answer: no).*
17. What is common and what is individual, and can a reputed individuality (Cortot,
    Horowitz) be demonstrated **objectively**? — *Repp 1992; Widmer et al. 2003 (answer for
    the "Horowitz pattern": no).*
18. Can local expressive timing be captured by a **single parametric shape**? — *Repp 1992;
    Todd 1992/1995.* [shape-parameter comparison rather than sample comparison — which is
    what MPM natively stores]
19. Do performances fall into **discrete clusters** or sample a continuous space? —
    *Repp 1998 (answer: continuous, across 115 recordings).*
20. Do timing profiles correlate with **year of birth, recording date, age, gender,
    nationality/school**? — *Repp 1998 (answer: only weak trends).* [regression of distances
    against metadata — expect this demand immediately]
21. Are **students less individual than famous artists**? — *Repp 1995 (answer: yes).*
    [distance-to-centroid as a first-class statistic]
22. How much of listeners' **aesthetic judgement** can measured timing and dynamics explain?
    — *Repp 1999 III (answer: 9–18%).*
23. Should expression be defined as departure from the score, or as shared cultural norm
    plus individual input? — *Clarke 2004.* [the reference-selection API is a research
    decision, not an implementation detail]

### Source-critical questions specific to rolls (Hagmann; Hall; Lawson; Reinhart; Köpp; Howat; Bärtsch; Bausch; Phillips; Estrada; Shi et al.)

24. "*Getreue Wiedergabe des Künstlerspiels?*" — can the instrument deliver the fidelity
    claimed? — *Hagmann 1984, asked at p. 46 and again at p. 149.*
25. Does the **same roll on the same correctly-set instrument** play at the same tempo
    twice? — *Hagmann (answer: no).*
26. When notes are struck asynchronously, is that the performer's intention or the
    "**künstliches Arpeggio**" forced by the two-zone dynamic split — and **can the two ever
    be told apart**? — *Hagmann 1984; Hall 2001 ("this deception does take place almost all
    the time").* **This is the single most dangerous question for any dislocation metric
    computed from roll data.**
27. "**If you do suspect the speed of a performance, how do you tell if it is an eccentric
    old-fashioned interpretation playing at the correct speed, or a more conventional
    approach at the wrong one?**" — *Hall 2012.* [the argument for scale-invariant timing
    distances]
28. Which of the six factors (pitch, duration, placing, dynamics, sustaining pedal, una
    corda) survive the medium? — *Hall 2001.* [a per-dimension **trust mask** on
    roll-sourced documents]
29. Do Welte and disc recordings **of the same interpretation by the same pianist**
    converge? — *Bärtsch on Busoni; Estrada on Granados; Leech-Wilkinson on Grieg and Pugno;
    Hagmann relaying Flury's ~12% duration discrepancy.*
30. Is the observed stability general, or an artefact of always testing **slow, agogically
    rich music**? — *Bärtsch.*
31. Do **different copies of the same roll** agree? — *Gottschewski on Welte No. 548 (answer:
    they differ substantially).*
32. Do different **modern transfers of the same roll** agree? — *Leech-Wilkinson on Duo-Art
    6566: eight seconds apart, drifting non-uniformly.* [**the noise-floor calibration
    experiment**]
33. How should an editor sort roll variants — correction, considered revision, whim, or
    fluff? — *Howat's four-tier taxonomy.* [a **severity scale for the ranked deviation
    list**, U3]
34. Is scan-derived MIDI accurate enough to compare tempos? — *Phillips: **no**. Estrada:
    **yes for relative fluctuation**, since intervals stay proportional to roll speed.*

### What these scholars would DO with a distance matrix or edit path

This is not a hostile audience — the CHARM/Mazurka wing already computes exactly this. Four
things they would do:

1. **Ask where and at what timescale, not how much.** Sapp built scape plots precisely
   because a scalar "is virtually meaningless". An **edit path is well suited to this** — it
   is a *localised* object whose per-region cost profile is closer to a scape than a scalar
   is. This is the strongest argument for U2/U3 as designed.
2. **Regress the distances against dates and lineages.** Repp 1998 already did exactly this;
   Cook 2007 against documented teaching relationships. Expect the overlay demand
   immediately.
3. **Use within-performer distance as the yardstick.** "Is X closer to Y than X is to X on
   another occasion?" is the field's built-in null model.
4. **Use it to find things to listen to.** Leech-Wilkinson's stance throughout: the numbers
   earn their keep by **directing attention**, not by concluding.

### What they would distrust, in rough order of severity

- **The encoding is not the performance — and for rolls it is not even a recording.**
  Bausch: a roll is a *Tonsteuerungsträger*. A distance on roll-derived MPM is a distance
  between two **control encodings**; the sounding difference is a further unmodelled
  function of instrument, restoration, hall and transfer. **Any distance smaller than the
  same-roll-different-transfer distance is noise** (Leech-Wilkinson's Duo-Art 6566).
- **Dislocation may be an artefact of the machine** — and now doubly so, since Goebl (2001)
  shows melody lead is largely a velocity artifact *even on a real piano*, and Hagmann/Hall
  show reproducing pianos fake it deliberately.
- **Tempo is not recoverable from a roll**, so any distance with an absolute-time component
  is suspect. Work in ratios (Estrada).
- **Hall's explicit prohibition** against "attack[ing] a music roll with a ruler" — a method
  whose output is precisely fine-grained detail differences is on ground both Hall and
  Leech-Wilkinson fence off.
- **They will expect the clusters not to be there** (Repp 1998; Cancino-Chacón et al. 2018
  "only weak evidence for performance schools"). A dendrogram with crisp schools reads as
  suspicious until shown robust to linkage choice and to the within-performer baseline.
- **Distance under-determines what anyone cares about** — Repp 1999 III, 9–18%.
- **Clarke's reification charge**, which an edit path instantiates most literally: it treats
  two performances as two strings to be aligned, i.e. as two texts.
- **Averaging as an unmusical operation** (Clarke). Note the empirical counterweight: Repp
  1997 and Wolf et al. 2018 both find the average performance is rated *highly*. A **medoid**
  (an actual member, per Kosta et al. 2016) is the diplomatic compromise where a synthetic
  mean is resisted.

**The constructive version of all this** — what would satisfy the audience — is not a
smaller claim but a better-scaffolded one: report distances **localised in the score and
stratified by timescale**; make them **scale-invariant**; calibrate against a **noise floor**
measured from two transfers of the same roll and from repeat performances by the same
pianist; keep **provenance visible** for every document (the Mazurka discography's `PR` tag);
separate **timing evidence, which the sources support, from dynamic evidence, which for
Welte data they largely do not**; and present the output as a **finding aid pointing at
passages to listen to**.

---

# §4 Metric-design lessons

Concrete, attributed, actionable. These are the constraints the design document should
either adopt or explicitly argue against.

## 4.0 Perceptual thresholds and JND constants

Written to answer SURVEY.md **A-Q3** ("fixed JND-unit constants by default … JND values to
be grounded in survey-lit's perception citations where they exist, else labelled
[convention]"). Each row is tagged **[literature]** with a citation verified at source, or
**[convention]** where the literature does not supply a usable constant. **Nothing here is
invented; where a number could not be verified it says so.**

| Dimension | Threshold | Status | Source |
|---|---|---|---|
| **Timing / IOI perturbation** | **≈ 6 ms absolute** for IOI < ~240 ms; **≈ 2.5% relative** for IOI > ~240 ms | **[literature]** | Friberg & Sundberg 1995 |
| Timing, earlier estimate by the same authors | ~10 ms below ~240 ms; ~5% above | [literature, superseded] | Friberg & Sundberg 1993 (conference abstract) |
| **Onset asynchrony — temporal order** | **15–20 ms** to report *which* of two sounds came first | **[literature]** | Hirsh 1959 |
| **Onset asynchrony — musical working threshold** | **30 ms**, used as "the typical perceptual threshold" in corpus analysis | **[literature]** | Goebl, Flossmann & Widmer 2010 |
| **Chord simultaneity window** | **35 ms** — notes within it are clustered as one chord | **[literature]** | Nakamura, Yoshii & Katayose 2017 |
| **Dynamics / intensity** | no musically-validated JND constant found | **[convention]** | see note below |
| **Articulation (duration ratio)** | no JND constant found | **[convention]** | — |
| **Tempo-curve shape parameters** | no JND constant exists (shape parameters are not a perceptual scale) | **[convention]** | — |

**The timing constant, verbatim from the source** (Friberg, A. & Sundberg, J. (1995), "Time
discrimination in a monotonic, isochronous sequence," *JASA* 98(5), 2524–2531,
DOI 10.1121/1.413218): "The absolute jnd was found to be approximately constant at **6 ms**
for tone interonset intervals shorter than about 240 ms and the relative jnd constant at
**2.5% of the tone interonsets above 240 ms**. Subjects' musical training did not affect
these values. Comparison with previous work showed that a constant absolute jnd below
250 ms and constant relative jnd above 250 ms tend to appear regardless of the perturbation
type."
⇒ **This is the one solid constant we have**, and it has exactly the shape the metric needs:
**absolute below a breakpoint, relative above it.** A pure log/ratio timing metric (L2) is
correct in the region that dominates musical IOIs, but becomes over-sensitive at very short
IOIs (grace notes, ornaments, arpeggio spread), where the JND floors out at ~6 ms absolute.
Recommend a **soft floor at 6 ms** on timing differences rather than pure ratio all the way
down. Note also that musical training did **not** affect the threshold — so we cannot excuse
a looser threshold by appeal to a lay audience.

**The asynchrony band.** Three independently verified anchors bracket it: **15–20 ms**
(Hirsh 1959, verbatim: "a longer separation time of between 15 and 20 msec is required for
the listener to report correctly which of the two sounds preceded the other… independent of
the kinds of sounds used"), **30 ms** as the working analytic threshold (Goebl et al. 2010),
and **35 ms** as the chord-clustering window (Nakamura et al. 2017). **Recommend 30 ms** as
the default asynchrony unit: it is the value already used in the one corpus study that
detects a *musicological* category (earlier rubato) from asynchrony, so adopting it makes
our output directly comparable to theirs. Note for scale: typical melody lead is ~30 ms and
bass anticipation ≥70 ms (Goebl et al. 2010), so a 30 ms unit puts melody lead at ~1 JND and
dislocation at 2–3 JND — musically sensible.

**Dynamics — the honest position.** No verified, musically-validated dynamics JND was found.
What exists: the classic psychoacoustic intensity-discrimination reference is **Jesteadt,
W., Wier, C. C. & Green, D. M. (1977), "Intensity discrimination as a function of frequency
and sensation level," *JASA* 61(1), 169–177, DOI 10.1121/1.381278** — citation verified, but
**the numeric threshold could not be read at source [unverified]**, so no dB value is
asserted here. The musically-contextualised study is **Repp (1995)** (below), which reports
*positional variation* in detectability rather than a single threshold. The nearest usable
constraint from the performance literature is **Sundberg, Friberg & Frydén (1991)**, who
found musicians' preferred KTH rule quantities sit **close to the threshold of
perceptibility** — an argument that the perceptible range of an expressive parameter is
roughly the range performers actually use. ⇒ **Derive the dynamics unit from the corpus
(observed per-attribute spread), label it [convention], and stamp the derived constant into
the report** — which is exactly the opt-in corpus-normalisation path A-Q3 already provides.
Do not fabricate a dB-based JND.

### The critical caveat: the JND is not constant across the score

Two verified Repp studies show the detection threshold for a timing perturbation **varies
systematically with position in the music**, and varies in the worst possible way for us.

**Repp, B. H. (1992). "Probing the cognitive representation of musical time: structural
constraints on the perception of timing perturbations." *Cognition* 44(3), 241–281.
DOI 10.1016/0010-0277(92)90003-z.** Listeners heard physically regular eight-bar excerpts
with one or two intervals lengthened. Verbatim from the abstract: "**The resulting detection
accuracy profile across all positions in each musical excerpt showed pronounced dips in
places where lengthening would typically occur in an expressive (temporally modulated)
performance.**" Detection accuracy correlated significantly "with the temporal
microstructure of expert performances, as measured from sound recordings by famous artists".
Conclusion: "**the perception of musical time is not veridical but 'warped' by the
structural representation.**"

**Repp, B. H. (1995). "Detectability of duration and intensity increments in melody tones: a
partial connection between music perception and performance." *Perception & Psychophysics*
57(8), 1217–1232. DOI 10.3758/bf03208378.** Verbatim: "Percent correct scores for increments
in tone duration **correlated significantly with the average timing profile of pianists'
expressive performances**… For intensity increments, the analogous perception-performance
correlation was **weak**, and the bottom-up factors of relative pitch height and/or direction
of pitch change accounted for some of the perceptual variation." And again: "Subjects'
musical training increased overall detection accuracy but **did not affect the positional
variation**."

⇒ **Design consequences, and they are sharp:**
1. **A uniform JND weight systematically over-reports difference exactly where performances
   legitimately differ most** — at phrase ends and other sites of expected lengthening,
   where listeners are *least* able to detect deviation. A large computed distance at a
   phrase boundary may be perceptually invisible.
2. This is the perceptual mechanism behind Repp's structural finding in §1.1 (divergence
   grows down the hierarchy) and behind Sapp's smoothed/residual split: **the same physical
   deviation means different things at different structural positions.**
3. A position-weighted JND is the better-grounded design, but the literature gives a
   *correlation with the average performance profile*, not a formula. The honest, and
   cheap, implementation: **compare against the corpus norm** (L4) — the norm profile is
   itself an estimate of where deviation is expected, so norm-relative comparison partially
   absorbs the effect without needing a perceptual model.
4. At minimum, **report the phrase/structural position alongside each ranked deviation** so
   a reader can discount boundary-located differences themselves.
5. Timing and dynamics behave **differently** here — timing detectability is top-down
   (expectation-driven), dynamics detectability is bottom-up (pitch-related). Another
   argument against a single fused weight across dimensions.

**Related, verified, and useful for the smoothing decision:** Cambouropoulos, E., Dixon, S.,
Goebl, W. & Widmer, G. (2001), "Human preferences for tempo smoothness," *Proc. VII Int.
Symposium on Systematic and Comparative Musicology*, Jyväskylä, 18–26 — listener preference
data on how smooth a tempo curve should be. [Citation verified from Goebl's publication
list; **contents unverified**.]

**Also relevant but unverified:** Goebl, W. & Parncutt, R. (2001), "Perception of onset
asynchronies: Acoustic piano versus synthesized complex versus pure tones," SMPC 2001;
(2002), "The influence of loudness on the perception of onset asynchronies," ICMPC7,
613–616; (2003), "Asynchrony versus intensity as cues for melody perception in chords and
real music," ESCOM5, 376–380. **Titles and venues verified from Goebl's own publication
list; the PDFs 404'd and no threshold values are asserted [unverified].** These are the
right papers to obtain if a better asynchrony constant is wanted — in particular the 2003
paper directly addresses whether asynchrony or intensity carries melody perception, which is
the perceptual counterpart to Goebl (2001)'s production-side result.

## 4.1 Normalisation

**L1. Normalise timing as a ratio of performance duration to score duration ("duration
factors"), not as raw durations.** Raw durations cannot be compared across notes of
different nominal value. — *Desain & Honing 1993, "Objective time…" box* — with their own
warning that this quantity is "often misleadingly called tempo".

**L2. Put timing on a logarithmic scale, base 2.** Desain & Honing endorse log explicitly
as "a first step towards the use of subjective magnitudes" (1993). Combined with L1, **log₂
duration-factor / log₂ IOI-ratio** is the defensible primitive; it also makes speeding-up
and slowing-down symmetric, which raw ratios are not. Base 2 matches the partitura codec
and the Cancino-Chacón thesis — a natural-log document is off by ~1.44. — *Desain & Honing
1993; Cancino-Chacón 2018.*

**L3. Watch the sign and the direction of "tempo".** A **beat period** is a duration, so a
positive log value means *slower*; a **BPM** is a rate, so positive means *faster*. MPM
stores BPM. partitura stores seconds-per-beat. The two are reciprocal, and the literature
mixes them freely. Pin it once, in the type system. — *Cancino-Chacón et al. 2018 §4.3
names this exact incomparability; partitura source.*

**L4. Compare against a norm, not against the score.** The single most replicated
methodological result in this survey: Stamatatos 2002 (77.5% vs. 42.5%), Stamatatos &
Widmer 2005 (**82.5% norm vs. 52.5% score**), Grachten & Widmer 2009, Molina-Solana et al.
2010, Rafee et al. 2021 all find that deviation-from-average-performance discriminates where
deviation-from-score does not, because the score-relative signal is dominated by shared,
piece-driven structure. **Corollary: a meaningful comparison needs a corpus, not two
documents.**

**L5. Normalise per dimension against an empirical scale before any distance.** A 6 dB shift
and a 0.1 articulation-ratio change are otherwise incommensurable, and global tempo/loudness
offsets will swamp every structural parameter. Use JNDs where available — **Sundberg,
Friberg & Frydén (1991)** found musicians' preferred k values sit close to the threshold of
perceptibility, so **differences below one JND are not differences** — and observed
per-variable ranges otherwise. The espressivo attribute registry (82 rows, scale spaces with
musical neutral points) is the natural home for this.

**L6. Dynamics has no shared scale; choose one and declare it.** Four conventions coexist in
a single research group: ÷127, mean-centred per piece, z-scored per piece, log-ratio to
performance mean. Kosta et al. (2016) divide by the recording's own maximum "in this way we
are able to compare different recording environments." — *Grachten & Widmer 2012;
Cancino-Chacón 2018; Kosta et al. 2016.*

**L7. Do not use total duration as a tempo feature.** Overall duration is shaped less by
average tempo than by internal modulation. — *Bowen 1996.*

**L8. Make timing distances scale-invariant for roll-sourced documents.** Absolute BPM is
not recoverable from a roll scan, but "the time distances between the notes and the
expressive gestures will be **proportional** to the speed of the roll." — *Estrada 2019
quoting Phillips; Hall 2012; Hagmann 1984.*

**L9. But do not silently divide out global tempo.** Listeners reliably detect a ±20%
time-stretched performance, so tempo-invariant normalisation discards real, perceptible
signal. Report global tempo difference as **its own channel**, then compare the rest
scale-invariantly. — *Honing 2005/2007; Desain & Honing 1994; Repp 1994.*

## 4.2 Correlation versus magnitude

**L10. A raw correlation is not a portable number.** The modal correlation between two
*random* performances is 0.67 for Mazurka 17/4 and 0.87 for 68/3. Calibrate against a
per-piece reference distribution — Sapp's **noise floor** is the bottom half of the ranked
database. **Two MPM files alone cannot tell you whether 0.8 is close.** — *Sapp 2008.*

**L11. Never report a single L2/MSE distance as if it were the answer.** Its ranking flips
depending on which reference you pick, and it cannot reliably separate expert from
randomised performances. — *Peter et al. 2023 (DLfM), demonstrated experimentally with a
listening test.*

**L12. Do not concatenate heterogeneous parameter families into one vector.** Liebman et al.
quantified the damage: **r = 0.12 for the concatenated vector vs. 0.40–0.42 for the two
single best categories.** Compute per-family distances, convert each to ordinal evidence,
aggregate by consensus, and **report per-family agreement as a result**. — *Liebman, Ornoy &
Chor 2012.*

**L13. If the raw measure is asymmetric, symmetrise with the geometric mean, not the
arithmetic mean** — it penalises disagreement between forward and reverse (0.75/0.25 → 0.43
vs. 0.50). Independently, symmetric formulations fit human ratings better than asymmetric
ones. — *Sapp 2008 eq. (4); Pearce & Müllensiefen 2017.*

**L14. Guard against the near-duplicate flooding the neighbourhood** (the "Hatto effect"):
iteratively remove the dominant match and recompute. — *Sapp 2008, S2/S3.*

**L15. Include the corpus average as a pseudo-performance** — it absorbs "minor and random
relationships between performances" so only genuinely distinctive matches survive. —
*Sapp 2007.*

## 4.3 Windowing and multi-scale analysis

**L16. Compute similarity at every position and every timescale, not once globally.** "A
single global similarity measurement for this data could miss interesting smaller-scale
structures." The scape plot — all contiguous sub-sequences arranged as a triangle — is the
single most transferable construction in this literature, and it is independently motivated
by Repp's finding that divergence grows down the structural hierarchy, by Widmer & Tobudic's
multi-level shape model, and by VirtuosoNet's measure-then-note hierarchy. — *Sapp 2007;
Repp 1992; Widmer & Tobudic 2003; Jeong et al. 2019.*

**L17. Decompose timing into a tempo component and a time-shift component; do not model one
as the other.** They are mathematically interconvertible but "musically very different
notions", and "listeners do perceive tempo relatively independently from timing". Sapp
operationalises exactly this by splitting the tempo curve into **smoothed** (phrase
architecture) and **residual** (`c = a − b`, beat-level accentuation), and finds the
residual carries distinct performer identity. — *Honing 2001; Sapp 2008.*

**L18. Smoothing scale is a musical parameter, not a cosmetic one.** Set the Gaussian window
from the piece's own mode bar/beat duration per document (2.5–3.2 s in the published
examples), and compare at matched structural scales. Use a **symmetric (zero-phase)** filter
— Sapp's two-pass forward-and-reverse exponential, or the offline Gaussian — never a causal
exponential decay, which introduces a lag that appears as a spurious phase difference. —
*Langner & Goebl 2003; Dixon et al. 2002 (the causal variant); Sapp 2007.*

**L19. Treat normalisation level, smoothing width and inter-dimension weighting as explicit
swept parameters of the comparison**, not hidden constants: 5 normalisation forms × 5
smoothing levels × a continuous tempo↔loudness weighting. — *Goebl, Pampalk & Widmer 2004.*

**L20. Resample segments to a common length before comparing them** (1216 phrase segments,
each cubic-interpolated to exactly 25 data pairs) — **but only across event-anchored
samples.** Which leads directly to the next lesson.

## 4.4 Pitfalls

**P1. Never interpolate a timing value between two events.** "Filling up time by adding an
event between two measured points is problematic" (Gibson via Desain & Honing), and the
killer technical argument: "**integration does not yield the original time map again**."
Define distances only on event-anchored samples. **This rules out naively resampling two MPM
tempo curves onto a common continuous grid** — which is the obvious first implementation and
is wrong. — *Desain & Honing 1993.*

**P2. Discretisation is not distance-preserving.** Near-identical curves can land in
different clusters and score as maximally dissimilar. Widmer et al. found their flagship
"Horowitz pattern" was mostly inaudible, partly a **segment-boundary artifact**, and that
they had **no objective criterion for choosing the alphabet**. Validate every "characteristic
difference" against the underlying continuous rendering. — *Widmer et al. 2003.*

**P3. MPM is deliberately over-complete, so map-space and rendered-time comparison will
disagree.** The same audible performance decomposes many ways across
`tempoMap`/`rubatoMap`/`asynchronyMap`/`articulationMap`. Only the rendered result is
canonical. Corollaries: **resolve styles before diffing** (`bpm="Allegro"` and `bpm="133.0"`
may be identical); **articulation elements compound sequentially**; and **`imprecisionMap` is
stochastic — two documents differing only in `seed` describe the same performance.**

**P4. Shape parameters are not commensurable with value parameters.** `meanTempoAt` should
be compared via its exponent `ln(0.5)/ln(meanTempoAt)`, not raw; `curvature` and
`protraction` are Bézier control-point offsets on a different scale again. Two documents can
agree on "amount of ritard" and differ completely in **shape** — so the comparison must carry
the shape-function identity, not just its endpoints. — *MPM ODD; Friberg & Sundberg's ritard
work; Molina-Solana et al. 2010 (w, q).*

**P5. Comparing within a piece is a fundamentally easier problem than across pieces** —
expect roughly a 3× degradation (Molina-Solana et al. 2008: rank-1 52.2% within-piece vs.
15.8% cross-piece). Basis-function weights showed "significant effects of performer… within
pieces" but variance across pieces "too large to reveal any direct relationships". Design
the API so a cross-piece comparison is a *different*, clearly-labelled operation.

**P6. Repertoire leakage is the most dangerous confound.** A discriminator that seems to
read the performer may be reading the piece; Zeng et al. (2025) found a learned style
embedding predicts **composer at 77.5% but performer at only 42.1%**. ATEPP's
composer-stratified subsets are the control template. — *Zhang et al. 2022; Zeng et al.
2025.*

**P7. Filter differences against a measurement-noise model that is a function of local
tempo.** At slow tempi annotators agree far better, so a fixed absolute threshold
systematically over-reports differences in fast passages; Grachten & Widmer's filter
discards >95% of the scatter. And budget against **human annotation precision (27–68 ms,
piece-dependent), not against zero.** — *Grachten & Widmer 2009; Gadermaier & Widmer 2019.*

**P8. Adding more parameter channels can hurt.** Rafee et al.'s five-feature fusion scored
below the three-feature one. **Channel selection matters more than channel count.**

**P9. Weight articulation and asynchrony above tempo, and tempo above dynamics, for identity
questions** — the opposite of musicology's habitual focus. But **invert this for
roll-sourced documents**: Bausch's rule is to trust "insbesondere die zeitliche Anordnung
der Töne" and distrust the dynamics, and Goebl (2001) + Hagmann's *künstliches Arpeggio*
mean measured asynchrony on roll data is doubly confounded by dynamics. **The trust weights
are a function of provenance.** — *Stamatatos & Widmer 2005; Bausch 2019; Goebl 2001;
Hagmann 1984.*

**P10. Combine heterogeneous costs by an explicit weighted sum with one tunable constant,
and report the constant.** `w_subst = w_pitch + k₁·w_len` (Mongeau & Sankoff);
`|P₂−P₁| + k·|IOI₂−IOI₁|` with k = 2.0 (Grachten et al. 2004). Treat k as a swept
hyperparameter, not a natural constant — Rizo swept k ∈ {0.1, 0.5, 0.9} and got different
winners.

**P11. Prefer encoding musical knowledge in the representation over encoding it in the
costs.** Rizo & Iñesta put rhythm in the tree *shape* and keep costs at trivial unit values;
the thesis states outright that no cost tuning was needed. Canonicalise MPM documents first
(resolve styles, canonicalise curve segmentation, resolve part/global overrides), then use
simple costs.

**P12. Add edit operations that model real musical transformations — and charge for them.**
Fragmentation and consolidation are the Mongeau–Sankoff design contribution; the original's
defect is that it charges **nothing** for fragmenting a note into same-pitch notes of the
same total duration. In MPM terms: splitting one `dynamics` transition into two consecutive
ones with the same endpoints, or re-expressing a `tempo` transition as two, must carry a
structural cost even when the rendering is identical — otherwise the edit path will
prefer musically vacuous rewrites.

**P13. Allow gaps in matching.** A gap-weighted subsequence kernel beat exact n-grams,
"because the same expressive gesture recurs at shifted positions and with interpolated
material". This is a direct argument for an edit path over a positionwise diff. —
*Saunders et al. 2004/2008.*

**P14. Decide which metric axioms are needed and for what.** "We need self-identity and
symmetry. The triangle inequality is useful for efficiently searching the database.
Positivity is not necessarily always desired." Two verified escape routes if the triangle
inequality fails: normalise weights to restore it (PTD), or keep the non-metric and
decompose into metric subspaces (a **prametric**). And do not expect human similarity
judgments to satisfy the axioms anyway. — *Typke et al. 2003; Typke & Walczak-Typke 2008;
Tversky 1977; Marsden 2012.*

## 4.5 Validation

**V1. Validate against same-performer identification — the field's de facto standard, and it
discriminates well.** But report *n*-way as well as pairwise. — *Sapp 2008; Saunders et al.
2008; Zhang et al. 2022.*

**V2. A cheaper second validation needs no ground truth at all:** entropy of the distance
distribution (discriminatory power) and **KL divergence between within-class and
between-class distance distributions**. — *Grachten et al. 2004.*

**V3. The strongest available validation for a performance distance couples both:** measure
human sorting agreement by **adjusted Rand index** against the same-performer partition, then
show the computational within-vs-between correlation ratio *predicts* which performers
listeners get right. — *Gingras et al. 2011 — no other verified paper closes that loop.*

**V4. Use a partially ordered ground truth when similarity is continuous**, with group
boundaries established by a rank-sum test, and score by a measure with **no free
parameters** (ADR) rather than nDCG. — *Typke et al. 2005/2006.*

**V5. Run the noise-floor calibration first.** Two transfers of the same roll; two
performances by the same pianist; the same MPM round-tripped through the renderer. Any
reported distance must be interpreted against that floor. — *Leech-Wilkinson (Duo-Art 6566);
Gottschewski (roll No. 548); Repp 1992 (Cortot ×3, Horowitz ×3); Gadermaier & Widmer 2019.*

**V6. Calibrate the claims.** Timing and dynamics explain 9–18% of aesthetic judgement, and
timing strategy shows no strong relationship to performers' sociocultural background. A
performance distance measures identity moderately well and quality poorly. Do not conflate
them. — *Repp 1998, 1999.*

---

# §5 Gaps and opportunities — what an MPM-native tool could contribute

**G1. There is no MPM–MPM distance. There is no MPM-based analytical study at all.**
Verified in §1.5: no paper by Berndt or anyone else compares two MPM documents or defines a
distance in MPM parameter space; MPM Toolbox's extraction pipeline exists in code but is
unpublished and covers only tempo, asynchrony and residual articulation. Nothing to reuse,
nothing to be scooped by — and the Frontiers review confirms **no musical analogue of the
Structural Similarity Index exists for any performance representation**. ⚠ Caveat: no
keyword sweep for German-language theses was possible; treat as strongly supported, not
exhaustively proven.

**G2. Exact decomposition of difference by expressive dimension — which audio-based methods
structurally cannot do.** Every audio-derived tradition in this survey projects performance
onto tempo and loudness, because that is what can be measured from a recording. The worm's
own authors name the limitation: "the **absence of performance measures other than
expressive tempo and (overall) loudness**". Meanwhile the best evidence on *which* dimension
carries identity says **articulation and melody lead first, then tempo, then dynamics last**
— i.e. the two most informative dimensions are exactly the two the dominant tradition cannot
see. MPM carries all of them symbolically and losslessly. **This is the single strongest
scientific argument for the module.**

**G3. A parameter-space edit path as an analytical narrative.** No prior work produces an
*ordered, costed sequence of interpretive moves* from one performance to another. The
closest precedents are all one step short: Sapp's scape localises similarity but has no
operations; the performance alphabet gives a string but the discretisation is not
distance-preserving; Liebman's phylogeny gives topology but no path. The edit path directly
answers the field's own complaint that a scalar "is virtually meaningless" (Sapp) — and its
per-region cost profile *is* a scape with operations attached. **Howat's four-tier variant
taxonomy (correction / considered variant / whim / fluff) is a ready-made severity scale for
ranking the path's steps** (charter item U3).

**G4. "Earlier vs. later rubato" as a computable quantity.** Hudson's typology is one of the
most-cited distinctions in performance-practice scholarship, and it is *definitionally* a
statement about the relationship between the asynchrony channel and the tempo channel.
MPM separates them natively; Goebl, Flossmann & Widmer (2010) supply a working detector
(30 ms threshold + density-based run criterion). A tool that reports "these two performances
differ mainly in earlier rubato, localised at bars 17–24" speaks the historians' language in
a way no correlation coefficient does. **This is the highest-value single deliverable for
the Welte use case.**

**G5. Shape-parameter comparison rather than sample comparison.** MPM stores curves as
*parametric shapes* (`meanTempoAt` exponent; Bézier `curvature`/`protraction`; rubato
`intensity`), which is exactly the representation Todd's kinematic models, Repp's parabolic
ritard and Molina-Solana's (w, q) fitting all reach for — and which the rest of the field has
to *recover* by fitting. We get it for free. It also sidesteps P1: comparing two shape
functions requires no interpolation between events.

**G6. The shared symbolic timeline is free.** Every audio-based study in this survey spends
most of its engineering on establishing a common grid — Dixon's MATCH, Nakamura's HMM,
Gadermaier's 312-configuration sweep, Sapp's hand-tapped beat lists with 60–80 ms SD. Two
MPM documents over the same MSM **already share a tick timeline**. That removes the field's
dominant error source and lets the module report at a resolution nobody else can.

**G7. Provenance-aware trust weighting.** No existing tool models the fact that a
roll-derived document's dynamics are unreliable while its note ordering is not (Bausch;
Hall's six-factor decomposition), or that melody lead is confounded by velocity (Goebl 2001;
Hagmann's *künstliches Arpeggio*). A **per-dimension trust mask keyed to document
provenance** — meico export / hand-authored / roll-derived / alignment-fitted — would be
genuinely new, and it is exactly what makes the output defensible to the Welte scholars in
§1.6. The Mazurka discography's `PR` tag and SUPRA's ATON quality fields are the precedents
to build on.

**G8. Corpus-calibrated distances for a corpus that does not exist yet.** Sapp's core result
— raw correlation is not portable across pieces, and the fix is a per-piece noise floor —
means the module needs a corpus mode from the start (charter U4), not as an afterthought.
Conversely, **there is no public MPM corpus of multiple performances of the same piece.**
Building even a small one (e.g. several Welte rolls of one piece, plus modern recordings) is
itself a contribution, and MazurkaBL's layout (rows = score beats, columns = recording) is
the format precedent.

**G9. Metric-axiom honesty.** Marsden documents that the melodic-similarity literature
simply ignores asymmetry: "the published models do not account for it." A module that states
its axioms, tests them (identity, symmetry, triangle inequality) and reports where they fail
would be doing something the neighbouring field acknowledges it has not done.

**G10. A school/lineage evaluation has no baseline — which is both the opportunity and the
risk.** No verified study clusters performances against documented teacher lineage; Cook's
single confirming instance is the state of the art, and Repp found no clusters at all in 115
recordings. Publishing a negative or continuous result here would be a legitimate
contribution; publishing crisp schools without robustness checks would not survive review.

**What the module should NOT try to be:** a quality judge (Repp: 9–18%), a perceptual
similarity model (nothing in the literature supports one for performances), or a single
number (Peter et al. 2023; Sapp; Liebman et al.).

---

# §6 Recent trends, 2018–2026 (verified, with URLs)

## 6.0 Verdicts on the conductor's open questions

Direct answers to the three items SURVEY.md left open pending this survey.

### A-Q11 — Novelty claim: **CONFIRMED, in the narrow form.**

**Verdict: no prior work computes a distance between symbolic performance-*directive*
encodings.** The claim "first exact, additively-decomposable comparison of symbolic
performance-directive encodings" is supportable as stated.

What was searched, so the claim can be defended: the MPM specification repository and all
Berndt publications traceable through DBLP and Crossref (ISMIR 2021, *editio* 2018, Audio
Mostly 2010/2018, NIME 2010, ICMC 2011, Audio Mostly 2011); the MPM-Toolbox and meico source
trees; the Cancino-Chacón et al. (2018) review's §3.1.1.2, which is the field's own roll-call
of parameter-space comparison methods (Sapp 2007/2008; Liem & Hanjalic 2011/2015; Peperkamp
et al. 2017; Liebman et al. 2012; Grachten et al. 2017); the ISMIR/TISMIR/DLfM archives for
performance-similarity and performer-identification work; and the KTH rule-system literature
including forward-citation sweeps (~60 citing works each) of the two papers that come closest
to fitting rule parameters to real performances (Zanon & De Poli 2003).

**The distinction that carries the claim.** Everything found compares either (a) **rendered
parameter sequences** — per-onset or per-beat values of tempo, loudness, articulation
(Sapp; the performance worm; basis-function models; partitura's codec; Peter et al.'s
reconstruction error) — or (b) **audio**. Nothing compares the *directives*: the
instructions with their shape parameters, scopes, styles and defaults. The nearest misses,
and why each falls short:
- **Sapp 2007/2008** — rendered beat-level series; no instruction layer exists in his data.
- **Widmer's performance alphabet / Saunders' string kernels** — a symbolic *alphabet*, but
  derived by clustering rendered trajectory segments, and its authors state it is not
  distance-preserving and has no principled alphabet size.
- **KTH k-vectors** — genuinely a directive-space, and Bresin & Friberg (2000) even run PCA
  on rule parameters. But **no one has ever computed a distance on fitted k-vectors**
  (verified by forward-citation sweep), and the literature gives three reasons why it would
  be unsound: collinear dimensions, non-identifiable fits (Zanon & De Poli's k values differ
  substantially from Sundberg et al.'s *for the same performance of the same piece*), and
  region-scoped rather than global parameters. Notably, **fitted per-performer palettes do
  exist** as machine-readable `.pal` files shipped in Director Musices 3.1.6 (Friberg, Gulz
  & Wettebrandt 2023) — a set of k-vectors in a shared coordinate system that nobody has
  measured a distance on.
- **Liebman et al. 2012** — per-category distances over hand-coded performance features, but
  the features are analyst annotations, not a machine-readable directive encoding, and their
  headline result is that the *concatenated* distance fails (r = 0.12).
- **MPM-Toolbox** — has unpublished MPM *extraction* code but no comparison of any kind.

**Two honesty caveats to attach to any published version of the claim.** (1) The search
budget ran out before a sweep of German-language theses (Detmold/Paderborn
Hochschulschriften, Edirom Summer School reports) was possible; a student thesis doing MPM
analysis would not appear in DBLP or Crossref. (2) The 2025–26 ISMIR/TISMIR corner was not
systematically swept. Both are recorded in §7. Treat the claim as **strongly supported, not
exhaustively proven**, and re-sweep before publication.

### A-Q8 — Scape / multi-scale product: **CONFIRMED as central; promote from stretch.**

Multi-scale localised comparison is not a nice-to-have in this field; it is the field's own
answer to its own methodological crisis. Sapp built the scape *because* a scalar correlation
"is virtually meaningless, and two mostly random sequences could also generate a similar
correlation value"; Repp's foundational result is that divergence grows as you descend the
structural hierarchy; Widmer & Tobudic and VirtuosoNet both independently arrive at
multi-level decomposition; and — the strongest argument — **the live historiographical
question in the Welte/CHARM world is itself a multi-scale question**: Leech-Wilkinson's
claim, citing Sapp, that "expressivity operated typically from moment to moment earlier in
the 20th century, and at the next level up, from phrase to phrase more commonly later on."
That claim is *only* testable with a scape. Recommend committing it as a W4 deliverable.

### A-Q3 — Weights: **partially grounded; see §4.0.**

One dimension has a real, verified constant (timing: 6 ms absolute below ~240 ms IOI, 2.5%
relative above — Friberg & Sundberg 1995). One has a defensible working value with a corpus
precedent (asynchrony: 30 ms — Goebl et al. 2010, bracketed by Hirsh's 15–20 ms and
Nakamura's 35 ms). **Dynamics and articulation have none that could be verified**, and
§4.0 recommends deriving them from the corpus and labelling them [convention] rather than
fabricating a value. The most important finding for A-Q3 is not a constant at all: **the
timing JND is not uniform across the score** — detection accuracy dips exactly where
expressive lengthening is expected (Repp 1992, 1995), so a flat JND weight over-reports
difference at phrase boundaries. Norm-relative comparison partially absorbs this; §4.0 lists
the options.

## 6.1 Recent trends

**Large transcribed corpora replace hand-annotated ones.**
- ATEPP — 11,742 tracks, ~1,000 h, 49 pianists, automatically transcribed.
  `https://archives.ismir.net/ismir2022/paper/000053.pdf` · `https://github.com/BetsyTang/ATEPP`
- (n)ASAP note-level alignments — 1,062 performances, >7 M notes, "the largest available
  fully note-aligned dataset". `https://doi.org/10.5334/tismir.149`
- Batik-plays-Mozart (2023) — 36 movements, 102,421 notes, chained to musicological
  harmony/cadence/phrase annotations. `https://github.com/huispaty/batik_plays_mozart`
- MazurkaBL (2018) — 2,000 recordings, 44 mazurkas, beat and loudness matrices derived from
  the CHARM data. `https://github.com/katkost/MazurkaBL`
- SUPRA (2019) — 478 red Welte rolls digitised, CC BY 4.0. `https://supra.stanford.edu` ·
  `https://archives.ismir.net/ismir2019/paper/000062.pdf`

**Tooling consolidates around partitura and the match format.**
- partitura (MEC 2022). `https://arxiv.org/abs/2206.01071`
- The match file format (MEC 2022). `https://arxiv.org/abs/2206.01104`
- parangonar / Parangonada alignment checker. `https://github.com/sildater/parangonar` ·
  `https://sildater.github.io/parangonada/`

**Deep models of performance style — and a consistent honesty about their limits.**
- VirtuosoNet (ISMIR 2019): hierarchical RNN + CVAE, with a per-piece **performance style
  vector**; measure-level prediction refined at note level.
  `https://archives.ismir.net/ismir2019/paper/000112.pdf`
- Chowdhury & Widmer (ISMIR 2021): six pianists play the same 48 WTC I pieces; **mid-level
  perceptual features** (melodiousness, articulation, dissonance, rhythmic complexity…)
  contribute significantly to the *performance-wise* variation of arousal and valence.
  `https://archives.ismir.net/ismir2021/paper/000015.pdf`
- Zhang & Dixon, "Disentangling the Horowitz Factor" (ICASSP 2023): VQ-VAE content/style
  split, MINE disentanglement, evaluated by note error rate against an HMM alignment plus a
  40-way performer probe; explicitly only "partially successful".
- ScorePerformer (ISMIR 2023): multi-level MMD-VAE style heads at **global, bar, beat and
  onset levels**, with performance-direction-marking classifiers for interpretability.
  `https://archives.ismir.net/ismir2023/paper/000069.pdf`
- Zeng, Zhao & Wang (2025), joint rendering/transcription with a style-embedding probe:
  style → composer **77.46%** but style → performer only **42.07%**.
  `https://arxiv.org/pdf/2509.23878`
- RenderBox (Zhang, Maezawa & Dixon, arXiv:2502.07711, 11 Feb 2025): text-and-score
  controlled performance generation via a diffusion transformer, with curriculum training
  "from plain synthesis to expressive performance, gradually incorporating controllable
  factors such as speed, mistakes, and style diversity". `https://arxiv.org/abs/2502.07711`

**Evaluation becomes the explicit research topic — the most important trend for us.**
- Cancino-Chacón et al. (2018) name evaluation "a crucial (and still largely unsolved)
  problem that is hindering systematic progress".
  `https://doi.org/10.3389/fdigh.2018.00025`
- Lerch, Arthur, Pati & Gururani (2019), "Music Performance Analysis: A Survey", ISMIR
  2019, 33–43 — the MIR-side complement, covering assessment as well as analysis.
  `https://arxiv.org/pdf/1907.00178`
- Gadermaier & Widmer (2019) quantify the **human annotation noise floor** (27–68 ms).
  `https://arxiv.org/pdf/1910.07394`
- **Peter et al. (DLfM 2023) demonstrate experimentally that MSE-based comparison of
  performances is unreliable.** `https://arxiv.org/pdf/2401.00471`
- Con Espressione Game (ISMIR 2020): ~1,500 free-text descriptions of 45 performances of 9
  excerpts, released **with hand-corrected alignments and tempo/dynamics curves** — the only
  verified perceptual ground truth against which a parameter-space distance could be
  validated. `https://arxiv.org/abs/2008.02194` · `https://doi.org/10.5281/zenodo.3968828`
- Replication culture arrives: Wolf et al. (2018) replicate Repp's average-performance
  result with N = 205 across two countries. `https://doi.org/10.1525/mp.2018.36.1.98`

**Symbolic performance formats and timelines.**
- Berndt (ISMIR 2021), "The Music Performance Markup Format and Ecosystem".
  `https://archives.ismir.net/ismir2021/paper/000005.pdf`
- **Hentschel, J., Berndt, A., Cancino-Chacón, C., Dixon, S., Foo, A., Gotham, M. et al.
  (2026). "Time to Align! Modelling Musical Timelines for Music Information Retrieval and
  Digital Musicology." *TISMIR* 9(1), 384–404. DOI 10.5334/tismir.296.**
  `https://transactions.ismir.net/articles/10.5334/tismir.296`
  Directly relevant and co-authored by Berndt. Proposes a general model of musical timelines
  across three domains — **graphical** (pixels, mm: sheet music, **piano rolls**), **logical**
  (beats, ticks), **physical** (seconds, samples) — each continuous or discrete, giving six
  timeline types. Core structures: **Timeline** ("A positive coordinate axis defined by an
  origin and a measuring unit"), **ConversionMap**, **MatchClaim** ("A claim of equivalence
  between events on different timelines, **with provenance metadata (agent, method,
  certainty)**"), **TimelineGroup**, **AlignmentBundle**, plus Break/Jump events for repeats.
  It positions MPM as providing "a toolbox and exchange format for alignment and annotation
  data", while noting MPM specialises in fine-grained performance parameters that
  TimeToAlign! does not provide.
  *Why it matters here:* it is the current standard vocabulary for exactly the
  timeline/provenance layer G7 needs, and its **MatchClaim certainty metadata** is the
  citable precedent for a per-dimension trust mask.

**Piano-roll digitisation professionalises.** The Global Piano Roll Meeting is now the
organising venue (Leipzig 2018; Bern/Seewen 2022; Sydney 2024; **Stanford, 7–9 Aug 2026**),
and its stated standard is that "**Digitization is much more than just capturing the punched
holes**" and that because "**every roll is unique**", multiple copies of a title must be
scanned. `https://gprm.net/projects/roll-digitisation/`

⚠ **Coverage caveat for 2025–2026.** The search budget ran out before a systematic sweep of
2025–26 ISMIR/TISMIR could be completed. Items seen but **not verified**: "PianoBind" (ISMIR
2025) and "Pianist Transformer" (arXiv 2512.02652). Contrastive/metric-learning work on
performance renditions is the most likely place a directly competing method would appear,
and that corner should be re-swept before the design is frozen.

---

# §7 Unverified items and open discrepancies

Reported so they are not silently propagated.

**Could not verify at source:**
- Peres da Costa: **"overholding"** as a named category in *Off the Record* — not among the
  chapter titles.
- Peres da Costa's publication year: OUP/Crossref say 2012; *Nineteenth-Century Music
  Review*'s review header says 2011.
- Hudson, *Stolen Time*: pagination xiv vs. xv + 473.
- Cook, *Beyond the Score*: chapter titles and page ranges verified via Crossref; **chapter
  contents not verified** (OUP Academic Cloudflare-blocked). **No Cook passage critiquing the
  phrase arch was reachable** — the historicising claim is attributed to Leech-Wilkinson/Sapp.
- Leech-Wilkinson, *The Changing Sound of Music*: **two conflicting ISBNs on the CHARM site
  itself**.
- Cook 2007 pagination: CHARM gives 183–208; other indexes 183–207.
- Repp 1998 (*microcosm* I) DOI (page range verified).
- Philip: his own words on evidential reliability and on early ensemble imprecision — **do
  not quote**. Chapter page ranges for the 2004 book.
- Bowen: the phrase "the tempo of the work" **not found in his writing**.
- Mongeau & Sankoff: the numeric `w_pitch` consonance table and the numeric value of `k`
  (full text closed access).
- MIREX **NRGB** — no published formula found despite being a headline column 2005–2015.
- Saunders et al. accuracy figures in the ECML/IDA papers (only the preprint's are quoted);
  ⚠ page range disputed, DBLP 425–440 vs. Widmer's list 425–450.
- Grindlay & Helmbold evaluation numbers (abstract states no metric).
- Ramírez, Maestre & Serra 2010: method details, dataset size, accuracies.
- Kroiss (2000) MSc thesis on genetic k-fitting — no online copy located.
- Bresin & Friberg 2000: per-emotion k-values published only as bar graphs.
- Habrard et al. 2008: the learned-cost formulas (paywalled).
- Berndt (2015), "Formalizing Expressive Music Performance Phenomena" — verified only
  indirectly, as ref. 20 of the ISMIR 2021 paper. This is where the closed-form curve
  definitions live in citable prose, so it is worth obtaining.
- Bärtsch (2020) dissertation body (Anubis-walled); Lawson's Parts Two–Five page ranges;
  Hall's Scriabin article page range; *Recording the Soul of Music* year (2017 vs. 2018).
- Zeilinger corpus on-disk alignment format.
- Todd (1985) pagination: Crossref 33–57, some sources 33–58.
- SUPRA-RW count: paper 478, Stanford Digital Repository 457, GitHub 456 MIDI pairs.
- MazurkaBL licence: Zenodo says CC BY 4.0, GitHub says CC BY-NC-SA 4.0. Vienna 4x22 match
  repo and Batik corpus have **no LICENCE file**.
- Liebman et al. 2012 pagination: article's running header 215–242; several secondary
  sources including the Frontiers review give 195–222.
- **Jesteadt, Wier & Green (1977), *JASA* 61(1), 169–177, DOI 10.1121/1.381278** — citation
  verified (PubMed 833368) but **the numeric intensity-discrimination threshold could not be
  read at source**. No dB JND is asserted in §4.0.
- **Goebl & Parncutt (2001 SMPC; 2002 ICMPC7, 613–616; 2003 ESCOM5, 376–380)** on the
  perception of onset asynchronies — titles and venues verified from Goebl's own publication
  list, but **the PDFs 404'd and no threshold values are asserted.** These are the papers to
  obtain if a better-grounded asynchrony constant is wanted.
- **Cambouropoulos, Dixon, Goebl & Widmer (2001), "Human preferences for tempo smoothness"**
  — citation verified from Goebl's list; **contents unverified.**
- **Friberg & Sundberg (1993)**, JASA 94(3 Suppl.), 1859, DOI 10.1121/1.407650 gives ~10 ms /
  ~5%; the 1995 full paper gives ~6 ms / ~2.5%. **Cite the 1995 values**; the 1993 conference
  abstract is superseded by the same authors.
- ASAP internal inconsistencies: README totals 1067/519 vs. paper's 1068/520; prose says
  "236 distinct scores" vs. table's 222; prose 15 composers vs. table's 16.

**Searched for and not found — treat as non-existent unless someone produces them:**
- A Kyungyun Lee / Juhan Nam performer-identification paper (their verified joint work is on
  singing voice; the Nam-lab paper in this space is VirtuosoNet, which is rendering).
- A standalone Molina-Solana survey of performer identification (the real surveys are
  Cancino-Chacón et al. 2018 and Lerch et al. 2019).
- A Grachten & Cancino-Chacón paper on "distributions of expressive parameters across
  performers".
- A Repp paper using multidimensional scaling.
- A paper titled "Melodic similarity through tree edit distance" by Rizo/Iñesta.
- A paper arguing explicitly that score-relative comparison beats DTW-between-performances
  (only converging implicit arguments exist — see §1.7).
- Any peer-reviewed study of the Grieg 1906 Welte rolls, of the Reger Welte rolls, or
  systematically comparing Rachmaninoff's Ampico rolls with his Victor discs.
- Any published MPM–MPM distance, MPM comparison method, or analytical study using MPM.

**Dead or hijacked URLs still cited in the roll literature — do not cite:**
`trachtman.org/rollscans` (now casino spam), `rprf.org`, `iammp.org`, `mpronline.net`,
`terrysmythe.ca`, `mfm.uni-leipzig.de/dt/Forschung/Tastenprojekt.php`,
`organology.uni-leipzig.de`, `library.stanford.edu/projects/player-piano-project` (404,
cited by both SUPRA papers). `mazurka.org.uk` works but its TLS certificate has expired.
