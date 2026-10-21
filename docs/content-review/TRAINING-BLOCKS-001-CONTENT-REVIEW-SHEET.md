# CONTENT-REVIEW-SHEET — TRAINING-BLOCKS-001 (6 Exercises + 13 workouts + 6 Training Blocks)

Status of every item below: **PENDING_HUMAN_REVIEW**. Nothing is published as approved until a human approves this sheet.

Contents: **6 new built-in Exercises** (schema v21, data only), **13 general-athletic Professional Workouts** (no sport) and **6 Training Blocks** (5 × 6 weeks, Explosive Power 8 weeks).

- A Training Block is an ordered multi-week programme made of Professional Workouts. Adding it to a Player creates one independent PlannedWorkout COPY per session (and, if the user chooses dates, one CalendarEvent per plan), all-or-nothing per Player. Nothing of the block is stored on the Player: there is no "Week 3 of 6" and no duplicate detection yet.
- Everything here is **Gals Coacher's own programming, informed by public sources**. Every dosage, the weekly arrangement and the progression are `ORIGINAL_RECOMMENDATION`.
- Evidence classes: `SOURCE_SUPPORTED` (an opened source states exactly the claim — abstract-only sources support only what the abstract says), `SYNTHESIZED` (our coaching synthesis), `ORIGINAL_RECOMMENDATION` (our own recommendation), `UNVERIFIED`.
- The programmes make no injury-prevention or medical claim. Difficulty is content progression, never an age or a readiness assessment; a coach or responsible adult adjusts the intensity.
- Landing-before-plyometrics, deceleration-before-sharp-change-of-direction, pre-planned-before-reactive, youth strength progression and single-sprint recovery are **SYNTHESIZED**: no source I could open states them.

## Source verification (what was actually opened)

- Lloyd RS, Oliver JL, Faigenbaum AD, et al. Long-term athletic development, Part 1: a pathway for all youth. J Strength Cond Res 2015 — https://eprints.glos.ac.uk/3535/1/Long-Term%20Athletic%20Development%20Part%201%20a%20pathway%20for%20all%20youth.pdf _(opened)_
- Thurlow F, McLaren SJ, Townshend A, Weakley J. The Application of Repeated-Sprint Training. NSCA Strength & Conditioning Journal — https://www.nsca.com/globalassets/certification/rscc/3--scj--application-of-repeat-sprint-training.pdf _(opened)_
- The effects of plyometric training on physical fitness in adolescent team sports: a systematic review and meta-analysis — https://pmc.ncbi.nlm.nih.gov/articles/PMC12867812/ _(opened)_
- Eddolls WTB, McNarry MA, Stratton G, et al. High-Intensity Interval Training Interventions in Children and Adolescents: A Systematic Review. Sports Med 2017 — https://pmc.ncbi.nlm.nih.gov/articles/PMC5633633/ _(opened)_
- Bathe et al. Training interventions to reduce the risk of injury to the lower limb during landing — systematic review and meta-analysis (adult athletes only). BMJ Open Sport Exerc Med 2023 — https://pmc.ncbi.nlm.nih.gov/articles/PMC10254820/ _(opened)_
- Ratamess NA, et al. ACSM position stand: Progression models in resistance training for healthy adults. Med Sci Sports Exerc 2009 (adults) — https://pubmed.ncbi.nlm.nih.gov/19204579/ _(abstract only)_
- Paul DJ, Gabbett TJ, Nassis GP. Agility in team sports: testing, training and factors affecting performance. Sports Med 2016 — https://pubmed.ncbi.nlm.nih.gov/26670456/ _(abstract only)_
- Bishop D, Girard O, Mendez-Villanueva A. Repeated-sprint ability — Part II: recommendations for training. Sports Med 2011 — https://pubmed.ncbi.nlm.nih.gov/21846163/ _(abstract only)_
- Faigenbaum AD, et al. Youth resistance training: updated position statement paper from the NSCA. J Strength Cond Res 2009 — full text blocked; NOT relied on for any specific claim — https://pubmed.ncbi.nlm.nih.gov/19620931/ _(not opened)_
- Lloyd RS, et al. Position statement on youth resistance training: the 2014 International Consensus. Br J Sports Med 2014 — full text not reachable; NOT relied on for any specific claim — https://doi.org/10.1136/bjsports-2013-092952 _(not opened)_
- McBurnie AJ, Harper DJ, Jones PA, Dos'Santos T. Deceleration training in team sports. Sports Med 2022 — full text blocked; NOT relied on for any specific claim — https://salford-repository.worktribe.com/output/1334048/deceleration-training-in-team-sports-another-potential-vaccine-for-sports-related-injury _(not opened)_

_Read status: **opened** = the full text was read; **abstract only** = only the abstract, so it supports only a claim written in it; **not opened** = access was blocked and NO claim relies on it._

**Corrections to the Phase 1 report:** a landing-progression source and a deceleration-training source could not be found or opened; the landing evidence that was opened is adult-only; the adolescent plyometric review makes no landing recommendation and links 8 to under 10 weeks with more consistent (exploratory) gains; the youth running-HIIT review leaves bout length and rest open and reports no safety data.

## Resolved human-review decisions (review round 1: CHANGES REQUIRED — SMALL CONTENT PATCH, applied)

**Decisions recorded as RESOLVED / APPROVED:**

- Explosive Power = 8 weeks / 16 sessions — APPROVED.
- Conditioning = 6 weeks / 12 sessions — APPROVED (our own recommendation; no source claims it is the optimal length).
- No age-specific blocks in V1 — APPROVED.
- Reactive agility requires a partner or coach; without one the session falls back to pre-planned work — APPROVED.
- Aerobic Base defaults to running; bike / rower remain edit-time options with no new dedicated exercise — APPROVED.
- Sprint and agility time values are recording CAPS, not goals — APPROVED, subject to the user-facing wording below.

**Corrections applied in this version:**

- Warm-up fatigue: the warm-up bodyweight squat is now 2 × 8 (was the default 3 × 15) in Strength B, Jump & Landing and Explosive Lower Body; in Strength A the warm-up glute bridge is 1 × 10 (the main 3 × 12 is unchanged, so there is no 6-set duplication).
- Movement Foundation: the Hebrew now says "גשר עכוז / יישור ירך", matching the glute bridge that is actually in the workout (no hip-hinge drill was added).
- The improvised "heavy basketball or football against a wall" substitute was removed: with no appropriate medicine ball, skip the throwing section or use another approved power exercise or workout.
- Time semantics (final content review, history-safe): what a seconds value MEANS belongs to the PRESCRIPTION and is stored with the copied plan item and with the session exercise (schema v22, `time_semantics`, NULL = legacy). `DURATION_TARGET` = work for this long; `PERFORMANCE_GOAL_TIME` = a goal time (what a stored TIME value meant before, so legacy TIME rows keep reading "Goal time"); `COMPLETION_TIME_CAP` = a fixed course or distance whose actual time is recorded, shown as "Time cap (seconds) — record your actual time" with the hint "Record your actual time. The value shown is only a recording cap, not a performance goal." A cap is NOT a pass / fail line: a real result above it is recorded as it is. Nothing is inferred from the exercise id, so the same exercise can be a goal time in an old plan and a cap in a block. The prescriptions below opt in explicitly: ATH-ACCELERATION-01: SPRINT_10M; ATH-ACCELERATION-01: SPRINT_20M; ATH-SPEED-01: SPRINT_20M; ATH-SPEED-01: SPRINT_30M_FLYING; ATH-DECEL-COD-01: T_DRILL; ATH-DECEL-COD-01: PRO_AGILITY_5_10_5; ATH-CONDITIONING-INTERVALS-01: ROW_500M (alternative); ATH-REPEATED-EFFORT-01: SPRINT_20M. Shuttle run and sled push alternatives are prescribed as work durations (DURATION_TARGET), the 500 m row as a completion-time cap.
- Hebrew: the awkward supervision sentence is replaced everywhere by "למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית."; "באותה משך" → "באותו משך"; names: ירידה ונחיתה מבוקרת, תרגיל מראה בזוגות, אינטרוולים בריצה.

**Still for the final human review:** native-speaker Hebrew review of the remaining text; then publication approval.

## A. New Exercises (6, schema v21)

### DROP_LANDING_STICK

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 |
| **HE name** | ירידה ונחיתה מבוקרת |
| **EN name** | Controlled Step-Off Landing |
| **Sport** |  |
| **Difficulty** | BEGINNER (content progression, not a readiness assessment) |
| **Measurement** | repetitions |
| **Dosage (ORIGINAL_RECOMMENDATION)** | 3 × 5 reps, rest 45s |
| **Equipment** | PLYO_BOX OR BENCH |
| **Evidence class** | topic: `SYNTHESIZED` · cues: `SYNTHESIZED` · dosage: `ORIGINAL_RECOMMENDATION` |

**Instructions — HE:** עומדים על קופסה נמוכה או ספסל, יורדים צעד קדימה אל הרצפה ונוחתים על שתי הרגליים בו־זמנית. נוחתים בשקט עם ברכיים וירכיים מכופפות, ומחזיקים את העמידה שתי שניות לפני שחוזרים לקופסה.

**Instructions — EN:** Stand on a low box or bench, step forward off it and land on both feet at the same time. Land quietly with the knees and hips bent, and hold the position for two seconds before stepping back up.

**Coaching cues — HE:**
  - נוחתים בשקט
  - ברכיים לכיוון האצבעות, חזה גבוה

**Coaching cues — EN:**
  - Land quietly
  - Knees over the toes, chest tall

**Safety — HE:** גובה נמוך, משטח יציב ולא חלק. מפסיקים אם הנחיתה מאבדת שליטה או יש כאב.

**Safety — EN:** Use a low height and a stable, non-slip surface. Stop if the landing loses control or there is pain.

**Source / provenance:**
- Lloyd RS, Oliver JL, Faigenbaum AD, et al. Long-term athletic development, Part 1: a pathway for all youth. J Strength Cond Res 2015 — https://eprints.glos.ac.uk/3535/1/Long-Term%20Athletic%20Development%20Part%201%20a%20pathway%20for%20all%20youth.pdf _(opened)_
- Bathe et al. Training interventions to reduce the risk of injury to the lower limb during landing — systematic review and meta-analysis (adult athletes only). BMJ Open Sport Exerc Med 2023 — https://pmc.ncbi.nlm.nih.gov/articles/PMC10254820/ _(opened)_

**Exactly what the source supports:** Competency (movement quality) should come before higher-intensity work (LTAD-1, opened). Instruction and feedback improved landing mechanics in ADULT athletes (LANDING-ADULTS, opened); no opened source covers youth or a landing progression.

**What is Gals Coacher synthesis:** Landing as its own first step before any jump, the step-off wording and the dosage. Landing-before-plyometrics is our professional synthesis. Technique cues, wording and every dosage are Gals Coacher's own.

**ORIGINAL_RECOMMENDATION:** every set, target and rest value above.

### SINGLE_LEG_HOP_STICK

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 |
| **HE name** | קפיצה ונחיתה על רגל אחת |
| **EN name** | Single-Leg Hop and Stick |
| **Sport** |  |
| **Difficulty** | INTERMEDIATE (content progression, not a readiness assessment) |
| **Measurement** | repetitions |
| **Dosage (ORIGINAL_RECOMMENDATION)** | 2 × 4 reps, rest 60s |
| **Equipment** | none (bodyweight) |
| **Evidence class** | topic: `SYNTHESIZED` · cues: `SYNTHESIZED` · dosage: `ORIGINAL_RECOMMENDATION` |

**Instructions — HE:** עומדים על רגל אחת וקופצים קדימה למרחק קצר, ונוחתים על אותה רגל. מחזיקים את הנחיתה שתי שניות ביציבות לפני שמתחילים שוב. עושים את מספר החזרות על כל רגל.

**Instructions — EN:** Stand on one leg and hop forward a short distance, landing on the same leg. Hold the landing steadily for two seconds before starting again. Do the repetitions on each leg.

**Coaching cues — HE:**
  - נוחתים ועוצרים
  - הברך ממוקמת מעל כף הרגל, הגו גבוה

**Coaching cues — EN:**
  - Land and stop
  - Knee over the foot, trunk tall

**Safety — HE:** רק אחרי שהנחיתה על שתי רגליים נקייה. מרחק קצר, משטח יציב ולא חלק, ומפסיקים אם יש כאב.

**Safety — EN:** Only once the two-leg landing is clean. Keep the distance short on a stable, non-slip surface, and stop if there is pain.

**Source / provenance:**
- Lloyd RS, Oliver JL, Faigenbaum AD, et al. Long-term athletic development, Part 1: a pathway for all youth. J Strength Cond Res 2015 — https://eprints.glos.ac.uk/3535/1/Long-Term%20Athletic%20Development%20Part%201%20a%20pathway%20for%20all%20youth.pdf _(opened)_
- Bathe et al. Training interventions to reduce the risk of injury to the lower limb during landing — systematic review and meta-analysis (adult athletes only). BMJ Open Sport Exerc Med 2023 — https://pmc.ncbi.nlm.nih.gov/articles/PMC10254820/ _(opened)_

**Exactly what the source supports:** Same limitation as the two-leg landing: competency before intensity (LTAD-1) and adult landing-technique evidence (LANDING-ADULTS). No opened source gives a single-leg progression.

**What is Gals Coacher synthesis:** Single-leg hop-and-stick as a later step after the two-leg landing, its distance and the dosage. Technique cues, wording and every dosage are Gals Coacher's own.

**ORIGINAL_RECOMMENDATION:** every set, target and rest value above.

### DECEL_STOP

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 |
| **HE name** | האצה ועצירה מבוקרת |
| **EN name** | Accelerate and Decelerate to Stop |
| **Sport** |  |
| **Difficulty** | BEGINNER (content progression, not a readiness assessment) |
| **Measurement** | repetitions |
| **Dosage (ORIGINAL_RECOMMENDATION)** | 4 × 4 reps, rest 60s |
| **Equipment** | RUNNING_AREA |
| **Evidence class** | topic: `SYNTHESIZED` · cues: `SYNTHESIZED` · dosage: `ORIGINAL_RECOMMENDATION` |

**Instructions — HE:** מאיצים בקצב מבוקר לאורך כ־10 מטרים, ועוצרים בתוך אזור מסומן (בין שני קונוסים או קווים) בצעדים קצרים וירכיים נמוכות. מחזיקים את העצירה שתי שניות לפני שחוזרים.

**Instructions — EN:** Accelerate at a controlled pace for about 10 metres, then stop inside a marked zone (between two cones or lines) with short steps and low hips. Hold the stop for two seconds before returning.

**Coaching cues — HE:**
  - צעדים קצרים לפני העצירה
  - ירכיים נמוכות, גו קדימה מעט

**Coaching cues — EN:**
  - Short steps before the stop
  - Hips low, trunk slightly forward

**Safety — HE:** מתחילים בקצב מבוקר ומעלים מהירות רק כשהעצירה נקייה. משטח יבש ולא חלק, והתחממות לפני.

**Safety — EN:** Start at a controlled pace and add speed only when the stop is clean. Use a dry, non-slip surface and warm up first.

**Source / provenance:**
- McBurnie AJ, Harper DJ, Jones PA, Dos'Santos T. Deceleration training in team sports. Sports Med 2022 — full text blocked; NOT relied on for any specific claim — https://salford-repository.worktribe.com/output/1334048/deceleration-training-in-team-sports-another-potential-vaccine-for-sports-related-injury _(not opened)_

**Exactly what the source supports:** Nothing is claimed from a source: the deceleration-training paper could not be opened, so it supports no claim here.

**What is Gals Coacher synthesis:** The whole drill — a controlled acceleration into a marked stop — and putting deceleration before aggressive change of direction. Technique cues, wording and every dosage are Gals Coacher's own.

**ORIGINAL_RECOMMENDATION:** every set, target and rest value above.

### PARTNER_MIRROR_DRILL

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 |
| **HE name** | תרגיל מראה בזוגות |
| **EN name** | Partner Mirror Drill |
| **Sport** |  |
| **Difficulty** | INTERMEDIATE (content progression, not a readiness assessment) |
| **Measurement** | duration (seconds) |
| **Dosage (ORIGINAL_RECOMMENDATION)** | 4 × 15s, rest 45s |
| **Equipment** | CONES |
| **Evidence class** | topic: `SOURCE_SUPPORTED` · cues: `SYNTHESIZED` · dosage: `ORIGINAL_RECOMMENDATION` |

**Instructions — HE:** שניים עומדים זה מול זה בתוך מלבן קטן של כ־3 על 5 מטרים. הראשון זז לצדדים בחופשיות, והשני משקף את התנועה בעמידה נמוכה בלי להצליב רגליים. מחליפים תפקידים בכל סט.

**Instructions — EN:** Two people face each other inside a small rectangle of about 3 by 5 metres. One moves sideways freely and the other mirrors the movement from a low stance without crossing the feet. Swap roles each set.

**Coaching cues — HE:**
  - עיניים על האגן של בן הזוג
  - מגיבים, לא מנחשים

**Coaching cues — EN:**
  - Eyes on your partner’s hips
  - React, don’t guess

**Safety — HE:** מרחב נקי, משטח לא חלק, וקצב מתאים ליכולת. עוצרים אם יש כאב.

**Safety — EN:** Use clear space, a non-slip surface and a pace that suits the ability. Stop if there is pain.

**Source / provenance:**
- Paul DJ, Gabbett TJ, Nassis GP. Agility in team sports: testing, training and factors affecting performance. Sports Med 2016 — https://pubmed.ncbi.nlm.nih.gov/26670456/ _(abstract only)_

**Exactly what the source supports:** Only what the abstract states (AGILITY-2016, abstract only): agility depends on reacting to a stimulus, a human or video stimulus separates playing levels better, and small-sided games may be an effective way to train it.

**What is Gals Coacher synthesis:** The mirror drill itself, its box size, the work time and the dosage. Pre-planned work before reactive work is our synthesis. Technique cues, wording and every dosage are Gals Coacher's own.

**ORIGINAL_RECOMMENDATION:** every set, target and rest value above.

### COACH_CUE_REACTION_SPRINT

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 |
| **HE name** | ספרינט תגובה לאות |
| **EN name** | Cue-Reaction Sprint |
| **Sport** |  |
| **Difficulty** | BEGINNER (content progression, not a readiness assessment) |
| **Measurement** | repetitions |
| **Dosage (ORIGINAL_RECOMMENDATION)** | 6 × 1 reps, rest 60s |
| **Equipment** | RUNNING_AREA |
| **Evidence class** | topic: `SOURCE_SUPPORTED` · cues: `SYNTHESIZED` · dosage: `ORIGINAL_RECOMMENDATION` |

**Instructions — HE:** מתחילים בעמידת מוכנות. בן זוג או מאמן נותן אות לא צפוי — מילה, כיוון שהוא מצביע עליו או צבע של קונוס — והמתאמן מגיב ומאיץ כ־5 עד 10 מטרים בכיוון שנקבע. חוזרים לנקודת ההתחלה בהליכה.

**Instructions — EN:** Start in a ready stance. A partner or coach gives an unpredictable cue — a word, a pointed direction or a cone colour — and the athlete reacts and accelerates about 5 to 10 metres in the direction the cue sets. Walk back to the start.

**Coaching cues — HE:**
  - מתחילים רק אחרי האות
  - צעד ראשון חזק ונמוך

**Coaching cues — EN:**
  - Start only after the cue
  - A strong, low first step

**Safety — HE:** מרחק קצר, משטח יבש ולא חלק, ומנוחה מלאה בין החזרות. מפסיקים אם יש כאב.

**Safety — EN:** Keep the distance short on a dry, non-slip surface, with full rest between repetitions. Stop if there is pain.

**Source / provenance:**
- Paul DJ, Gabbett TJ, Nassis GP. Agility in team sports: testing, training and factors affecting performance. Sports Med 2016 — https://pubmed.ncbi.nlm.nih.gov/26670456/ _(abstract only)_

**Exactly what the source supports:** Only the abstract-level point that agility involves reacting to a stimulus, with a human stimulus a valid one (AGILITY-2016, abstract only).

**What is Gals Coacher synthesis:** The cue types, the 5–10 m distance and the dosage. Technique cues, wording and every dosage are Gals Coacher's own.

**ORIGINAL_RECOMMENDATION:** every set, target and rest value above.

### RUN_INTERVALS

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 |
| **HE name** | אינטרוולים בריצה |
| **EN name** | Run Intervals |
| **Sport** |  |
| **Difficulty** | BEGINNER (content progression, not a readiness assessment) |
| **Measurement** | duration (seconds) |
| **Dosage (ORIGINAL_RECOMMENDATION)** | 6 × 45s, rest 90s |
| **Equipment** | RUNNING_AREA OR TREADMILL |
| **Evidence class** | topic: `SYNTHESIZED` · cues: `SYNTHESIZED` · dosage: `ORIGINAL_RECOMMENDATION` |

**Instructions — HE:** מקטעי ריצה מהירה אך מבוקרת לפי זמן העבודה, ובין המקטעים הליכה או ריצה קלה מאוד לפי זמן המנוחה. הקצב בכל המקטעים דומה, בלי לפתוח מהר מדי.

**Instructions — EN:** Fast but controlled running for the work time, with walking or very easy jogging for the rest time between efforts. Keep the pace similar across the efforts and do not start too fast.

**Coaching cues — HE:**
  - קצב אחיד בכל המקטעים
  - נושמים ברור, גו גבוה

**Coaching cues — EN:**
  - An even pace in every effort
  - Breathe freely, run tall

**Safety — HE:** מתחממים לפני, רצים על משטח שטוח ולא חלק, והעצימות מתאימה ליכולת. מפסיקים אם יש כאב, סחרחורת או תסמין חריג.

**Safety — EN:** Warm up first, run on a flat, non-slip surface and keep the intensity to the person’s ability. Stop if there is pain, dizziness or any unusual symptom.

**Source / provenance:**
- Eddolls WTB, McNarry MA, Stratton G, et al. High-Intensity Interval Training Interventions in Children and Adolescents: A Systematic Review. Sports Med 2017 — https://pmc.ncbi.nlm.nih.gov/articles/PMC5633633/ _(opened)_

**Exactly what the source supports:** A review of running-based high-intensity interval training in children and adolescents suggests 2–3 sessions a week for about 7 weeks or more; it says bout duration and rest are still ambiguous and reports no safety data (HIIT-YOUTH, opened). It does not validate any exact work / rest.

**What is Gals Coacher synthesis:** The exercise and its default representation (6 efforts of 45 s with 90 s rest). Exact work, rest, rounds and intensity guidance are set by each workout. Technique cues, wording and every dosage are Gals Coacher's own.

**ORIGINAL_RECOMMENDATION:** every set, target and rest value above.

## B. General-athletic Professional Workouts (13)

### ATH-MOVEMENT-FOUNDATION-01 — Movement Foundation / יסודות תנועה

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 (new) |
| **Domain** | `GENERAL_ATHLETIC` (no sport) |
| **Difficulty** | BEGINNER (content progression, not a readiness assessment) |
| **Focus** | ATHLETIC_FOUNDATION |
| **Length** | about 30–40 minutes |
| **Review status** | `PENDING_HUMAN_REVIEW` |
| **Evidence class** | structure and sequencing: `SYNTHESIZED` · every dosage: `ORIGINAL_RECOMMENDATION` |

**Summary — HE:** היכרות עם דפוסי התנועה הבסיסיים — סקווט, לאנג׳, גשר עכוז / יישור ירך, דחיפה, משיכה ויציבות הגו — בעומס נמוך ובדגש על איכות התנועה.

**Summary — EN:** An introduction to the basic movement patterns — squat, lunge, hip bridge, push, pull and trunk stability — at low load, with the focus on movement quality.

**Section 1 — Warm-up / חימום**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | CAT_COW | Cat-Cow | חתול-פרה | 1 × 10 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | WORLDS_GREATEST_STRETCH | World’s Greatest Stretch | המתיחה הכי טובה בעולם | 1 × 5 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 3 | LEG_SWINGS | Leg Swings | נדנודי רגל | 1 × 12 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 4 | ANKLE_KNEE_TO_WALL | Ankle Mobility — Knee to Wall | ניידות קרסול — ברך לקיר | 1 × 10 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |

**Section 2 — Movement patterns / דפוסי תנועה**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | BODYWEIGHT_SQUAT | Bodyweight Squat | סקוואט במשקל גוף | 3 × 10 reps, rest 45s |
| 2 | REVERSE_LUNGE | Reverse Lunge | מכרע לאחור | 2 × 8 reps, rest 45s |
| 3 | GLUTE_BRIDGE | Glute Bridge | גשר עכוז | 3 × 12 reps, rest 45s |
| 4 | INCLINE_PUSH_UP | Incline Push-Up | שכיבות סמיכה בשיפוע | 3 × 8 reps, rest 45s |
| 5 | BAND_ROW | Band Row | חתירה בגומייה | 3 × 12 reps, rest 45s |

**Section 3 — Trunk stability / יציבות הגו**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | BIRD_DOG | Bird Dog | ציפור-כלב | 2 × 8 reps, rest 30s |
| 2 | DEAD_BUG | Dead Bug | חיפושית מתה | 2 × 8 reps, rest 30s |
| 3 | PLANK | Plank | פלאנק | 2 × 20s, rest 30s |

**Section 4 — Cool-down / סיום ושחרור**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | HIP_FLEXOR_STRETCH | Kneeling Hip Flexor Stretch | מתיחת כופפי ירך בכריעה | 2 × 30s, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | CHILDS_POSE | Child’s Pose | תנוחת הילד | 1 × 45s, rest 0s _(the Exercise's own default — existing catalog content)_ |

**Coach notes (shown on the workout screen, NOT copied into a plan):**

- HE: מטרת האימון היא ללמוד תנועה נכונה, לא להתעייף. מעלים עומס רק כשהתנועה נקייה בכל החזרות.
- EN: The aim is to learn good movement, not to get tired. Add load only when the movement is clean on every repetition.
- HE: כל הציוד: משקל גוף ורצועת גומי. אפשר להחליף את הדחיפה בשיפוע בדחיפה רגילה כשהמתאמן מוכן.
- EN: Equipment: bodyweight and a resistance band. Swap the incline push-up for a regular push-up when the athlete is ready.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Sources:**
- Lloyd RS, Oliver JL, Faigenbaum AD, et al. Long-term athletic development, Part 1: a pathway for all youth. J Strength Cond Res 2015 — https://eprints.glos.ac.uk/3535/1/Long-Term%20Athletic%20Development%20Part%201%20a%20pathway%20for%20all%20youth.pdf _(opened)_

**Exactly what the sources support:** Movement competency before intensity, and building basic movement skill first (LTAD-1, opened). No source gives these exercises or dosages.

**What is Gals Coacher synthesis:** The choice of the basic patterns, their order and every set / repetition / rest.

**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.

### ATH-STRENGTH-FULLBODY-A-01 — Full-Body Strength A / כוח כל הגוף א׳

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 (new) |
| **Domain** | `GENERAL_ATHLETIC` (no sport) |
| **Difficulty** | BEGINNER (content progression, not a readiness assessment) |
| **Focus** | STRENGTH_FOUNDATION |
| **Length** | about 40–50 minutes |
| **Review status** | `PENDING_HUMAN_REVIEW` |
| **Evidence class** | structure and sequencing: `SYNTHESIZED` · every dosage: `ORIGINAL_RECOMMENDATION` |

**Summary — HE:** סקווט, דחיפה אופקית, משיכה אופקית, גשר עכוז ויציבות הגו — יום כוח בסיסי שמשלים את כוח ב׳.

**Summary — EN:** Squat, horizontal push, horizontal pull, hip bridge and trunk stability — a foundation strength day that pairs with Strength B.

**Section 1 — Warm-up / חימום**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | LEG_SWINGS | Leg Swings | נדנודי רגל | 1 × 12 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | WORLDS_GREATEST_STRETCH | World’s Greatest Stretch | המתיחה הכי טובה בעולם | 1 × 5 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 3 | BAND_PULL_APART | Band Pull-Apart | פתיחת גומייה לצדדים | 2 × 15 reps, rest 30s _(the Exercise's own default — existing catalog content)_ |
| 4 | GLUTE_BRIDGE | Glute Bridge | גשר עכוז | 1 × 10 reps, rest 30s |

**Section 2 — Strength / כוח**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | GOBLET_SQUAT | Goblet Squat | סקוואט גביע | 3 × 8 reps, rest 90s |
| 2 | PUSH_UP | Push-Up | שכיבות סמיכה | 3 × 8 reps, rest 60s |
| 3 | ONE_ARM_DUMBBELL_ROW | One-Arm Dumbbell Row | חתירה ביד אחת עם משקולת | 3 × 10 reps, rest 60s |
| 4 | GLUTE_BRIDGE | Glute Bridge | גשר עכוז | 3 × 12 reps, rest 45s |

**Section 3 — Trunk and shoulders / הגו והכתפיים**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | PLANK | Plank | פלאנק | 3 × 30s, rest 45s |
| 2 | FACE_PULL | Face Pull | משיכה לפנים | 2 × 15 reps, rest 45s |

**Coach notes (shown on the workout screen, NOT copied into a plan):**

- HE: בוחרים משקל שמאפשר את כל החזרות בטכניקה נקייה, עם עוד חזרה או שתיים בצד. מעלים לאט, לפי עיקרון ההתקדמות של התוכנית.
- EN: Pick a load that allows every repetition with clean technique and a rep or two in reserve. Progress gradually, following the programme.
- HE: ציוד: משקולת יד או קטלבל, ספסל (לא חובה), רצועה או כבל. אפשר לבצע שורות עם רצועה במקום משקולת.
- EN: Equipment: a dumbbell or kettlebell, a bench (optional), a band or cable. Band rows can replace the dumbbell row.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Sources:**
- Lloyd RS, Oliver JL, Faigenbaum AD, et al. Long-term athletic development, Part 1: a pathway for all youth. J Strength Cond Res 2015 — https://eprints.glos.ac.uk/3535/1/Long-Term%20Athletic%20Development%20Part%201%20a%20pathway%20for%20all%20youth.pdf _(opened)_
- Ratamess NA, et al. ACSM position stand: Progression models in resistance training for healthy adults. Med Sci Sports Exerc 2009 (adults) — https://pubmed.ncbi.nlm.nih.gov/19204579/ _(abstract only)_

**Exactly what the sources support:** Competency before intensity (LTAD-1, opened). Two to three sessions a week for novices and an 8–12 RM range come from ADULT guidance (ACSM-2009, abstract only).

**What is Gals Coacher synthesis:** The pattern split between A and B, the exercise choice and every dosage. Youth strength progression is our synthesis.

**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.

### ATH-STRENGTH-FULLBODY-B-01 — Full-Body Strength B / כוח כל הגוף ב׳

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 (new) |
| **Domain** | `GENERAL_ATHLETIC` (no sport) |
| **Difficulty** | BEGINNER (content progression, not a readiness assessment) |
| **Focus** | STRENGTH_FOUNDATION |
| **Length** | about 40–50 minutes |
| **Review status** | `PENDING_HUMAN_REVIEW` |
| **Evidence class** | structure and sequencing: `SYNTHESIZED` · every dosage: `ORIGINAL_RECOMMENDATION` |

**Summary — HE:** עבודה על רגל אחת, ציר ירך, משיכה, לחיצה מעל הראש ויציבות נגד סיבוב — משלים את כוח א׳.

**Summary — EN:** Single-leg work, hip hinge, pull, overhead press and anti-rotation — the complement to Strength A.

**Section 1 — Warm-up / חימום**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | LEG_SWINGS | Leg Swings | נדנודי רגל | 1 × 12 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | WORLDS_GREATEST_STRETCH | World’s Greatest Stretch | המתיחה הכי טובה בעולם | 1 × 5 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 3 | BAND_PULL_APART | Band Pull-Apart | פתיחת גומייה לצדדים | 2 × 15 reps, rest 30s _(the Exercise's own default — existing catalog content)_ |
| 4 | BODYWEIGHT_SQUAT | Bodyweight Squat | סקוואט במשקל גוף | 2 × 8 reps, rest 30s |

**Section 2 — Strength / כוח**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | STEP_UP | Step-Up | עלייה על קופסה | 3 × 8 reps, rest 60s |
| 2 | ROMANIAN_DEADLIFT | Romanian Deadlift | דדליפט רומני | 3 × 8 reps, rest 90s |
| 3 | BAND_ROW | Band Row | חתירה בגומייה | 3 × 12 reps, rest 45s |
| 4 | DUMBBELL_SHOULDER_PRESS | Dumbbell Shoulder Press | לחיצת כתפיים במשקולות | 3 × 8 reps, rest 60s |

**Section 3 — Trunk stability / יציבות הגו**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | PALLOF_PRESS | Pallof Press | לחיצת פאלוף | 3 × 10 reps, rest 45s |
| 2 | SIDE_PLANK | Side Plank | פלאנק צידי | 2 × 25s, rest 30s |

**Coach notes (shown on the workout screen, NOT copied into a plan):**

- HE: בציר הירך מתחילים עם משקל קל מאוד ועובדים על גב ישר ואגן שנע אחורה; מעלים עומס רק כשהתנועה נקייה.
- EN: On the hip hinge start very light, with a flat back and the hips moving back; add load only once the movement is clean.
- HE: חזרות בעליית הצעד ובעבודת הצד נספרות לכל רגל בנפרד.
- EN: Repetitions on the step-up and side work are counted for each side separately.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Sources:**
- Lloyd RS, Oliver JL, Faigenbaum AD, et al. Long-term athletic development, Part 1: a pathway for all youth. J Strength Cond Res 2015 — https://eprints.glos.ac.uk/3535/1/Long-Term%20Athletic%20Development%20Part%201%20a%20pathway%20for%20all%20youth.pdf _(opened)_
- Ratamess NA, et al. ACSM position stand: Progression models in resistance training for healthy adults. Med Sci Sports Exerc 2009 (adults) — https://pubmed.ncbi.nlm.nih.gov/19204579/ _(abstract only)_

**Exactly what the sources support:** As Strength A: competency before intensity (LTAD-1, opened); adult novice frequency (ACSM-2009, abstract only).

**What is Gals Coacher synthesis:** The complementary pattern split (single leg, hinge, vertical press, anti-rotation) and every dosage.

**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.

### ATH-JUMP-LANDING-01 — Jump & Landing / קפיצה ונחיתה

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 (new) |
| **Domain** | `GENERAL_ATHLETIC` (no sport) |
| **Difficulty** | BEGINNER (content progression, not a readiness assessment) |
| **Focus** | EXPLOSIVE_POWER |
| **Length** | about 30–40 minutes |
| **Review status** | `PENDING_HUMAN_REVIEW` |
| **Evidence class** | structure and sequencing: `SYNTHESIZED` · every dosage: `ORIGINAL_RECOMMENDATION` |

**Summary — HE:** נחיתה מבוקרת לפני קפיצות: ירידה מצעד, קפיצת סקווט עם החזקת הנחיתה וקפיצות קצרות — כמות נמוכה, איכות גבוהה.

**Summary — EN:** Controlled landing before jumping: a step-off landing, a squat jump with a held landing and short low jumps — low volume, high quality.

**Section 1 — Warm-up / חימום**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | LEG_SWINGS | Leg Swings | נדנודי רגל | 1 × 12 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | ANKLE_KNEE_TO_WALL | Ankle Mobility — Knee to Wall | ניידות קרסול — ברך לקיר | 1 × 10 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 3 | BODYWEIGHT_SQUAT | Bodyweight Squat | סקוואט במשקל גוף | 2 × 8 reps, rest 30s |

**Section 2 — Controlled landing / נחיתה מבוקרת**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | DROP_LANDING_STICK | Controlled Step-Off Landing | ירידה ונחיתה מבוקרת | 3 × 5 reps, rest 45s |

**Section 3 — Low-complexity jumps / קפיצות בסיסיות**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | SQUAT_JUMP | Squat Jump | קפיצות סקוואט | 3 × 5 reps, rest 60s |
| 2 | POGO_JUMPS | Pogo Jumps | קפיצות פוגו | 2 × 10 reps, rest 45s |

**Coach notes (shown on the workout screen, NOT copied into a plan):**

- HE: הנחיתה היא המיומנות: כל חזרה נגמרת בעצירה של שתי שניות בעמידה יציבה. אם הנחיתה רועשת או לא יציבה — מורידים גובה או עוצרים.
- EN: The landing is the skill: every repetition ends with a two-second stable hold. If the landing is noisy or unstable, lower the height or stop.
- HE: משטח יציב, יבש ולא חלק, ומרחב נקי סביב.
- EN: Use a stable, dry, non-slip surface with clear space around.
- HE: סך המגעים נמוך בכוונה. יותר קפיצות לא בהכרח נותנות יותר שיפור.
- EN: The number of ground contacts is deliberately low. More jumps do not necessarily give more improvement.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Sources:**
- Lloyd RS, Oliver JL, Faigenbaum AD, et al. Long-term athletic development, Part 1: a pathway for all youth. J Strength Cond Res 2015 — https://eprints.glos.ac.uk/3535/1/Long-Term%20Athletic%20Development%20Part%201%20a%20pathway%20for%20all%20youth.pdf _(opened)_
- Bathe et al. Training interventions to reduce the risk of injury to the lower limb during landing — systematic review and meta-analysis (adult athletes only). BMJ Open Sport Exerc Med 2023 — https://pmc.ncbi.nlm.nih.gov/articles/PMC10254820/ _(opened)_
- The effects of plyometric training on physical fitness in adolescent team sports: a systematic review and meta-analysis — https://pmc.ncbi.nlm.nih.gov/articles/PMC12867812/ _(opened)_

**Exactly what the sources support:** Competency before intensity (LTAD-1, opened). Instruction and feedback improved landing mechanics in ADULT athletes (LANDING-ADULTS, opened). The adolescent plyometric review found more jumps were not consistently better and made NO landing recommendation (PLYO-ADOLESCENT, opened).

**What is Gals Coacher synthesis:** Teaching the landing as its own first step before any jump, the step-off wording, and the low number of contacts. Landing-before-plyometrics is our professional synthesis, not a sourced progression.

**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.

### ATH-EXPLOSIVE-LOWER-01 — Explosive Lower Body / כוח מתפרץ לרגליים

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 (new) |
| **Domain** | `GENERAL_ATHLETIC` (no sport) |
| **Difficulty** | INTERMEDIATE (content progression, not a readiness assessment) |
| **Focus** | EXPLOSIVE_POWER |
| **Length** | about 35–45 minutes |
| **Review status** | `PENDING_HUMAN_REVIEW` |
| **Evidence class** | structure and sequencing: `SYNTHESIZED` · every dosage: `ORIGINAL_RECOMMENDATION` |

**Summary — HE:** נחיתה על רגל אחת, קפיצת קופסה, קפיצות צד וכוח מפרק הירך — פלט מתפרץ באיכות גבוהה עם מנוחות ארוכות.

**Summary — EN:** Single-leg landing, box jump, lateral bounds and hip power — high-quality explosive output with long rests.

**Section 1 — Warm-up / חימום**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | LEG_SWINGS | Leg Swings | נדנודי רגל | 1 × 12 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | WORLDS_GREATEST_STRETCH | World’s Greatest Stretch | המתיחה הכי טובה בעולם | 1 × 5 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 3 | BODYWEIGHT_SQUAT | Bodyweight Squat | סקוואט במשקל גוף | 2 × 8 reps, rest 30s |

**Section 2 — Landing primer / הכנת נחיתה**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | DROP_LANDING_STICK | Controlled Step-Off Landing | ירידה ונחיתה מבוקרת | 2 × 5 reps, rest 30s |
| 2 | SINGLE_LEG_HOP_STICK | Single-Leg Hop and Stick | קפיצה ונחיתה על רגל אחת | 2 × 4 reps, rest 45s |

**Section 3 — Explosive jumps / קפיצות עוצמה**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | BOX_JUMP | Box Jump | קפיצה לקופסה | 4 × 4 reps, rest 90s |
| 2 | LATERAL_BOUNDS | Lateral Bounds | ניתורים לצדדים | 3 × 6 reps, rest 60s |

**Section 4 — Hip power / כוח ירך**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | KETTLEBELL_SWING | Kettlebell Swing | נדנוד קטלבל | 3 × 10 reps, rest 60s |
| 2 | HIP_THRUST | Hip Thrust | דחיקת אגן | 3 × 6 reps, rest 90s |

**Coach notes (shown on the workout screen, NOT copied into a plan):**

- HE: איכות לפני עייפות: כל קפיצה במאמץ מלא עם מנוחה מלאה. אם הנחיתות מתדרדרות — מפסיקים את הקפיצות.
- EN: Quality over fatigue: every jump at full effort with full rest. If the landings deteriorate, stop the jumps.
- HE: ציוד: קופסה או ספסל יציב, קטלבל או משקולת, ספסל להיפ־ת׳ראסט. ללא קופסה אפשר להחליף בקפיצת סקווט.
- EN: Equipment: a stable box or bench, a kettlebell or dumbbell, a bench for the hip thrust. Without a box a squat jump can replace the box jump.
- HE: משטח יציב, יבש ולא חלק, ומרחב נקי סביב.
- EN: Use a stable, dry, non-slip surface with clear space around.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Sources:**
- Lloyd RS, Oliver JL, Faigenbaum AD, et al. Long-term athletic development, Part 1: a pathway for all youth. J Strength Cond Res 2015 — https://eprints.glos.ac.uk/3535/1/Long-Term%20Athletic%20Development%20Part%201%20a%20pathway%20for%20all%20youth.pdf _(opened)_
- Bathe et al. Training interventions to reduce the risk of injury to the lower limb during landing — systematic review and meta-analysis (adult athletes only). BMJ Open Sport Exerc Med 2023 — https://pmc.ncbi.nlm.nih.gov/articles/PMC10254820/ _(opened)_
- The effects of plyometric training on physical fitness in adolescent team sports: a systematic review and meta-analysis — https://pmc.ncbi.nlm.nih.gov/articles/PMC12867812/ _(opened)_

**Exactly what the sources support:** Moderate jump volume: more total jumps were not consistently better (PLYO-ADOLESCENT, opened). Nothing sourced about box-jump height, kettlebell swings or hip thrusts.

**What is Gals Coacher synthesis:** The selection, the landing primer, the long rests, and every dosage.

**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.

### ATH-ROTATIONAL-POWER-01 — Rotational Power & Throws / כוח סיבובי וזריקות

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 (new) |
| **Domain** | `GENERAL_ATHLETIC` (no sport) |
| **Difficulty** | INTERMEDIATE (content progression, not a readiness assessment) |
| **Focus** | EXPLOSIVE_POWER |
| **Length** | about 30–40 minutes |
| **Review status** | `PENDING_HUMAN_REVIEW` |
| **Evidence class** | structure and sequencing: `SYNTHESIZED` · every dosage: `ORIGINAL_RECOMMENDATION` |

**Summary — HE:** זריקות כדור כבד — סיבוב, הטחה ודחיפה — לצד יציבות נגד סיבוב. עומס נמוך יחסית על הרגליים, שימושי ביום שאחרי קפיצות.

**Summary — EN:** Medicine-ball throws — rotational, slam and chest pass — with anti-rotation stability. A light load on the legs, useful on a day away from jumping.

**Section 1 — Warm-up / חימום**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | LEG_SWINGS | Leg Swings | נדנודי רגל | 1 × 12 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | THORACIC_OPEN_BOOK | Thoracic Open Book | פתיחת ספר (גב עליון) | 1 × 8 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 3 | BAND_PULL_APART | Band Pull-Apart | פתיחת גומייה לצדדים | 2 × 15 reps, rest 30s _(the Exercise's own default — existing catalog content)_ |

**Section 2 — Throws / זריקות**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | MED_BALL_ROTATIONAL_THROW | Medicine Ball Rotational Throw | זריקת כדור כוח בסיבוב | 4 × 5 reps, rest 60s |
| 2 | MED_BALL_SLAM | Ball Slam | הטחת כדור לרצפה | 3 × 6 reps, rest 60s |
| 3 | MED_BALL_CHEST_PASS | Medicine Ball Chest Pass | מסירת חזה עם כדור כוח | 3 × 6 reps, rest 60s |

**Section 3 — Push and stability / דחיפה ויציבות**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | PUSH_UP | Push-Up | שכיבות סמיכה | 3 × 8 reps, rest 60s |
| 2 | PALLOF_PRESS | Pallof Press | לחיצת פאלוף | 3 × 10 reps, rest 45s |
| 3 | SIDE_PLANK | Side Plank | פלאנק צידי | 2 × 25s, rest 30s |

**Coach notes (shown on the workout screen, NOT copied into a plan):**

- HE: זריקות במהירות מרבית עם כדור שמאפשר תנועה מהירה ונקייה. חזרות הזריקה הסיבובית נספרות לכל צד.
- EN: Throw at maximum speed with a ball light enough to move fast and cleanly. Rotational-throw repetitions count for each side.
- HE: ציוד: כדור כבד, קיר או שותף לזריקות, רצועה לפאלוף.
- EN: Equipment: a medicine ball, a wall or partner, a band for the Pallof press.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Sources:**
- Lloyd RS, Oliver JL, Faigenbaum AD, et al. Long-term athletic development, Part 1: a pathway for all youth. J Strength Cond Res 2015 — https://eprints.glos.ac.uk/3535/1/Long-Term%20Athletic%20Development%20Part%201%20a%20pathway%20for%20all%20youth.pdf _(opened)_

**Exactly what the sources support:** Competency before intensity (LTAD-1, opened). No source gives medicine-ball throw dosages.

**What is Gals Coacher synthesis:** The throw selection, the anti-rotation pairing and every dosage.

**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.

### ATH-ACCELERATION-01 — Acceleration / האצה

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 (new) |
| **Domain** | `GENERAL_ATHLETIC` (no sport) |
| **Difficulty** | BEGINNER (content progression, not a readiness assessment) |
| **Focus** | SPEED_ACCELERATION |
| **Length** | about 30–40 minutes |
| **Review status** | `PENDING_HUMAN_REVIEW` |
| **Evidence class** | structure and sequencing: `SYNTHESIZED` · every dosage: `ORIGINAL_RECOMMENDATION` |

**Summary — HE:** מכניקת האצה ופרצי ספרינט קצרים (10–20 מטרים) באיכות גבוהה, עם מנוחה ארוכה בין החזרות.

**Summary — EN:** Acceleration mechanics and short, high-quality sprints (10–20 metres) with long rests between repetitions.

**Section 1 — Warm-up / חימום**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | LEG_SWINGS | Leg Swings | נדנודי רגל | 1 × 12 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | A_SKIP | A-Skip | דילוג A | 2 × 20 reps, rest 30s _(the Exercise's own default — existing catalog content)_ |
| 3 | HIGH_KNEES | High Knees | הרמת ברכיים במקום | 2 × 20s, rest 20s _(the Exercise's own default — existing catalog content)_ |

**Section 2 — Acceleration mechanics / מכניקת האצה**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | FALLING_START_ACCELERATION | Falling Start Acceleration | זינוק מנפילה | 4 × 1 reps, rest 60s |

**Section 3 — Short sprints / ספרינטים קצרים**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | SPRINT_10M | 10 m Sprint | ספרינט 10 מטר | 5 × 5s _(COMPLETION_TIME_CAP — a recording cap: record your actual time; not a goal)_, rest 90s |
| 2 | SPRINT_20M | 20 m Sprint | ספרינט 20 מטר | 3 × 7s _(COMPLETION_TIME_CAP — a recording cap: record your actual time; not a goal)_, rest 120s |

**Coach notes (shown on the workout screen, NOT copied into a plan):**

- HE: במאמץ מרבי חכו מנוחה מלאה בין החזרות ועצרו כשהמהירות או הטכניקה יורדות — איכות לפני כמות.
- EN: For maximal efforts take full rest between repetitions and stop when speed or technique drops — quality over quantity.
- HE: יעדי הזמן בספרינטים ובתרגילי הזריזות הם תקרה נדיבה בשניות — לא מטרה. המתאמן מתעד את הזמן בפועל.
- EN: The time targets on sprints and agility drills are generous caps in seconds, not goals — the athlete records the real time.
- HE: משטח יציב, יבש ולא חלק, ומרחב נקי סביב.
- EN: Use a stable, dry, non-slip surface with clear space around.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Sources:**
- No external source was consulted for this workout.

**Exactly what the sources support:** No opened source gives rest times for single maximal acceleration sprints; the rests here are our judgement.

**What is Gals Coacher synthesis:** The acceleration mechanics, the 10–20 m distances, the long rests and the time CAPS (the athlete records the real time).

**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.

### ATH-SPEED-01 — Maximum Velocity / מהירות מרבית

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 (new) |
| **Domain** | `GENERAL_ATHLETIC` (no sport) |
| **Difficulty** | INTERMEDIATE (content progression, not a readiness assessment) |
| **Focus** | SPEED_ACCELERATION |
| **Length** | about 35–45 minutes |
| **Review status** | `PENDING_HUMAN_REVIEW` |
| **Evidence class** | structure and sequencing: `SYNTHESIZED` · every dosage: `ORIGINAL_RECOMMENDATION` |

**Summary — HE:** ספרינט ארוך יותר עם ריצה מעופפת — פיתוח מהירות מרבית אחרי שבסיס ההאצה יציב. נפח נמוך ומנוחה מלאה.

**Summary — EN:** Longer sprinting with flying runs — maximum-velocity work once the acceleration base is solid. Low volume, full rest.

**Section 1 — Warm-up / חימום**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | LEG_SWINGS | Leg Swings | נדנודי רגל | 1 × 12 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | A_SKIP | A-Skip | דילוג A | 2 × 20 reps, rest 30s _(the Exercise's own default — existing catalog content)_ |
| 3 | HIGH_KNEES | High Knees | הרמת ברכיים במקום | 2 × 20s, rest 20s _(the Exercise's own default — existing catalog content)_ |

**Section 2 — Build-up / הכנה**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | FALLING_START_ACCELERATION | Falling Start Acceleration | זינוק מנפילה | 3 × 1 reps, rest 60s |
| 2 | SPRINT_20M | 20 m Sprint | ספרינט 20 מטר | 2 × 7s _(COMPLETION_TIME_CAP — a recording cap: record your actual time; not a goal)_, rest 120s |

**Section 3 — Flying runs / ריצה מעופפת**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | SPRINT_30M_FLYING | 30 m Flying Sprint | ספרינט מעופף 30 מטר | 4 × 6s _(COMPLETION_TIME_CAP — a recording cap: record your actual time; not a goal)_, rest 180s |

**Coach notes (shown on the workout screen, NOT copied into a plan):**

- HE: במאמץ מרבי חכו מנוחה מלאה בין החזרות ועצרו כשהמהירות או הטכניקה יורדות — איכות לפני כמות.
- EN: For maximal efforts take full rest between repetitions and stop when speed or technique drops — quality over quantity.
- HE: יעדי הזמן בספרינטים ובתרגילי הזריזות הם תקרה נדיבה בשניות — לא מטרה. המתאמן מתעד את הזמן בפועל.
- EN: The time targets on sprints and agility drills are generous caps in seconds, not goals — the athlete records the real time.
- HE: משטח יציב, יבש ולא חלק, ומרחב נקי סביב.
- EN: Use a stable, dry, non-slip surface with clear space around.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Sources:**
- No external source was consulted for this workout.

**Exactly what the sources support:** No opened source gives flying-sprint distance or rest.

**What is Gals Coacher synthesis:** The build-up, the 30 m flying runs, the 3-minute rests and the time caps.

**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.

### ATH-DECEL-COD-01 — Deceleration & Change of Direction / עצירה ושינויי כיוון

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 (new) |
| **Domain** | `GENERAL_ATHLETIC` (no sport) |
| **Difficulty** | INTERMEDIATE (content progression, not a readiness assessment) |
| **Focus** | AGILITY_COD |
| **Length** | about 35–45 minutes |
| **Review status** | `PENDING_HUMAN_REVIEW` |
| **Evidence class** | structure and sequencing: `SYNTHESIZED` · every dosage: `ORIGINAL_RECOMMENDATION` |

**Summary — HE:** קודם עצירה מבוקרת, אחר כך שינויי כיוון מתוכננים מראש: T-דריל ו־5-10-5, עם קפיצות צד.

**Summary — EN:** Controlled stopping first, then pre-planned changes of direction: the T-drill and 5-10-5, with lateral bounds.

**Section 1 — Warm-up / חימום**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | LEG_SWINGS | Leg Swings | נדנודי רגל | 1 × 12 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | LATERAL_LUNGE | Lateral Lunge | מכרע לצד | 3 × 8 reps, rest 60s _(the Exercise's own default — existing catalog content)_ |
| 3 | A_SKIP | A-Skip | דילוג A | 2 × 20 reps, rest 30s _(the Exercise's own default — existing catalog content)_ |

**Section 2 — Controlled deceleration / עצירה מבוקרת**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | DECEL_STOP | Accelerate and Decelerate to Stop | האצה ועצירה מבוקרת | 4 × 4 reps, rest 60s |

**Section 3 — Pre-planned changes of direction / שינויי כיוון מתוכננים**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | T_DRILL | T-Drill | תרגיל T | 3 × 16s _(COMPLETION_TIME_CAP — a recording cap: record your actual time; not a goal)_, rest 120s |
| 2 | PRO_AGILITY_5_10_5 | Pro Agility (5-10-5) | זריזות 5-10-5 | 3 × 8s _(COMPLETION_TIME_CAP — a recording cap: record your actual time; not a goal)_, rest 120s |

**Section 4 — Lateral bounds / קפיצות צד**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | LATERAL_BOUNDS | Lateral Bounds | ניתורים לצדדים | 3 × 6 reps, rest 60s |

**Coach notes (shown on the workout screen, NOT copied into a plan):**

- HE: מתחילים בקצב מבוקר: העצירה והיציאה מהכיוון צריכות להיות נקיות לפני שמוסיפים מהירות.
- EN: Start at a controlled pace: the stop and the exit from the turn must be clean before speed is added.
- HE: יעדי הזמן בספרינטים ובתרגילי הזריזות הם תקרה נדיבה בשניות — לא מטרה. המתאמן מתעד את הזמן בפועל.
- EN: The time targets on sprints and agility drills are generous caps in seconds, not goals — the athlete records the real time.
- HE: משטח יציב, יבש ולא חלק, ומרחב נקי סביב.
- EN: Use a stable, dry, non-slip surface with clear space around.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Sources:**
- McBurnie AJ, Harper DJ, Jones PA, Dos'Santos T. Deceleration training in team sports. Sports Med 2022 — full text blocked; NOT relied on for any specific claim — https://salford-repository.worktribe.com/output/1334048/deceleration-training-in-team-sports-another-potential-vaccine-for-sports-related-injury _(not opened)_

**Exactly what the sources support:** Nothing is claimed from a source: the deceleration-training paper could not be opened (DECEL-2022, not opened).

**What is Gals Coacher synthesis:** Controlled stopping first, then pre-planned change of direction (T-drill and 5-10-5), and every dosage and time cap.

**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.

### ATH-REACTIVE-AGILITY-01 — Reactive Agility / זריזות תגובתית

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 (new) |
| **Domain** | `GENERAL_ATHLETIC` (no sport) |
| **Difficulty** | INTERMEDIATE (content progression, not a readiness assessment) |
| **Focus** | AGILITY_COD |
| **Length** | about 30–40 minutes |
| **Review status** | `PENDING_HUMAN_REVIEW` |
| **Evidence class** | structure and sequencing: `SYNTHESIZED` · every dosage: `ORIGINAL_RECOMMENDATION` |

**Summary — HE:** תגובה לאות — מילה, כיוון או מראה של בן זוג — במקום מסלול ידוע מראש. דורש בן זוג או מאמן.

**Summary — EN:** Reacting to a cue — a word, a direction or a partner’s movement — instead of a known path. Needs a partner or coach.

**Section 1 — Warm-up / חימום**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | LEG_SWINGS | Leg Swings | נדנודי רגל | 1 × 12 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | LATERAL_LUNGE | Lateral Lunge | מכרע לצד | 3 × 8 reps, rest 60s _(the Exercise's own default — existing catalog content)_ |
| 3 | A_SKIP | A-Skip | דילוג A | 2 × 20 reps, rest 30s _(the Exercise's own default — existing catalog content)_ |

**Section 2 — Cue-based starts / התחלה לפי אות**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | COACH_CUE_REACTION_SPRINT | Cue-Reaction Sprint | ספרינט תגובה לאות | 6 × 1 reps, rest 60s |

**Section 3 — Partner mirror / תרגיל מראה בזוגות**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | PARTNER_MIRROR_DRILL | Partner Mirror Drill | תרגיל מראה בזוגות | 4 × 15s, rest 45s |

**Coach notes (shown on the workout screen, NOT copied into a plan):**

- HE: זריזות תגובתית נבנית אחרי שינויי כיוון מתוכננים. האות חייב להיות בלתי צפוי — לא להודיע מראש על הכיוון.
- EN: Reactive agility comes after pre-planned change of direction. The cue must be unpredictable — do not announce the direction in advance.
- HE: בלי בן זוג התרגיל לא עובד: אפשר להחליף בעצירה מבוקרת או בשינוי כיוון מתוכנן.
- EN: Without a partner the session does not work as designed: swap in the deceleration stop or a pre-planned change of direction.
- HE: משטח יציב, יבש ולא חלק, ומרחב נקי סביב.
- EN: Use a stable, dry, non-slip surface with clear space around.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Sources:**
- Paul DJ, Gabbett TJ, Nassis GP. Agility in team sports: testing, training and factors affecting performance. Sports Med 2016 — https://pubmed.ncbi.nlm.nih.gov/26670456/ _(abstract only)_

**Exactly what the sources support:** Only what the abstract states (AGILITY-2016, abstract only): agility involves reacting to a stimulus, and a human stimulus is a valid one.

**What is Gals Coacher synthesis:** The cue-based starts, the partner mirror drill, the box size, the work times and every dosage.

**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.

### ATH-CONDITIONING-BASE-01 — Aerobic Base / בסיס אירובי

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 (new) |
| **Domain** | `GENERAL_ATHLETIC` (no sport) |
| **Difficulty** | BEGINNER (content progression, not a readiness assessment) |
| **Focus** | CONDITIONING |
| **Length** | about 25–35 minutes |
| **Review status** | `PENDING_HUMAN_REVIEW` |
| **Evidence class** | structure and sequencing: `SYNTHESIZED` · every dosage: `ORIGINAL_RECOMMENDATION` |

**Summary — HE:** ריצה קלה ורציפה בקצב שמאפשר לדבר — בסיס סיבולת אירובית. שיטה אחת בכל אימון.

**Summary — EN:** Easy continuous running at a pace where you can talk — an aerobic base. One modality per session.

**Section 1 — Warm-up / חימום**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | LEG_SWINGS | Leg Swings | נדנודי רגל | 1 × 12 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | HIGH_KNEES | High Knees | הרמת ברכיים במקום | 2 × 20s, rest 20s _(the Exercise's own default — existing catalog content)_ |

**Section 2 — Easy run (or a bike or rower at a conversational pace) / ריצה קלה (או אופניים או חתירה בקצב שיחה)**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | EASY_RUN | Easy Run | ריצה קלה | 1 × 1200s, rest 0s |

**Section 3 — Cool-down / סיום ושחרור**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | CALF_STRETCH | Wall Calf Stretch | מתיחת שוק מול קיר | 2 × 30s, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | HIP_FLEXOR_STRETCH | Kneeling Hip Flexor Stretch | מתיחת כופפי ירך בכריעה | 2 × 30s, rest 0s _(the Exercise's own default — existing catalog content)_ |

**Coach notes (shown on the workout screen, NOT copied into a plan):**

- HE: בוחרים שיטה אחת: ריצה, אופניים או מכשיר חתירה, באותו משך ובקצב שיחה נוח. את ההחלפה עושים בעריכת האימון; הריצה היא ברירת המחדל.
- EN: Pick ONE modality: running, a bike or a rower, for the same duration at a comfortable conversational pace. Swap it when editing the workout; running is the default.
- HE: משטח יציב, יבש ולא חלק, ומרחב נקי סביב.
- EN: Use a stable, dry, non-slip surface with clear space around.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Sources:**
- Eddolls WTB, McNarry MA, Stratton G, et al. High-Intensity Interval Training Interventions in Children and Adolescents: A Systematic Review. Sports Med 2017 — https://pmc.ncbi.nlm.nih.gov/articles/PMC5633633/ _(opened)_

**Exactly what the sources support:** Running-based interval work in youth is reviewed (HIIT-YOUTH, opened); that review does not cover easy continuous running.

**What is Gals Coacher synthesis:** One continuous easy run as the aerobic base, its duration (progressed in the block) and the "bike or rower" swap, which has no dedicated exercise in the catalog.

**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.

### ATH-CONDITIONING-INTERVALS-01 — Intervals / אינטרוולים

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 (new) |
| **Domain** | `GENERAL_ATHLETIC` (no sport) |
| **Difficulty** | BEGINNER (content progression, not a readiness assessment) |
| **Focus** | CONDITIONING |
| **Length** | about 30–40 minutes |
| **Review status** | `PENDING_HUMAN_REVIEW` |
| **Evidence class** | structure and sequencing: `SYNTHESIZED` · every dosage: `ORIGINAL_RECOMMENDATION` |

**Summary — HE:** מקטעי ריצה מהירים אך מבוקרים עם מנוחה בין המקטעים. ללא ציוד מיוחד; לכל חלופה יש מינון משלה.

**Summary — EN:** Fast but controlled running efforts with rest between them. No special equipment; each alternative modality has its own prescription.

**Section 1 — Warm-up / חימום**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | LEG_SWINGS | Leg Swings | נדנודי רגל | 1 × 12 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | HIGH_KNEES | High Knees | הרמת ברכיים במקום | 2 × 20s, rest 20s _(the Exercise's own default — existing catalog content)_ |
| 3 | A_SKIP | A-Skip | דילוג A | 2 × 20 reps, rest 30s _(the Exercise's own default — existing catalog content)_ |

**Section 2 — Run intervals (or intervals on a bike, ski erg, rower or jump rope) / אינטרוולים בריצה (או אינטרוולים באופניים, בסקי ארג, בחתירה או בחבל קפיצה)**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | RUN_INTERVALS | Run Intervals | אינטרוולים בריצה | 6 × 45s, rest 90s |
| ↳ | alternative: BIKE_INTERVALS | Bike Intervals | אינטרוולים באופני כושר | 8 × 30s, rest 60s _(its own prescription)_ |
| ↳ | alternative: SKI_ERG_INTERVALS | Ski Erg Intervals | אינטרוולים בסקי ארג | 6 × 30s, rest 60s _(its own prescription)_ |
| ↳ | alternative: ROW_500M | 500 m Row | חתירה 500 מטר | 4 × 150s _(COMPLETION_TIME_CAP — a recording cap: record your actual time; not a goal)_, rest 120s _(its own prescription)_ |
| ↳ | alternative: JUMP_ROPE | Jump Rope | קפיצה בחבל | 6 × 40s, rest 60s _(its own prescription)_ |

**Section 3 — Cool-down / סיום ושחרור**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | CALF_STRETCH | Wall Calf Stretch | מתיחת שוק מול קיר | 2 × 30s, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | STANDING_HAMSTRING_STRETCH | Standing Hamstring Stretch | מתיחת ירך אחורית בעמידה | 2 × 30s, rest 0s _(the Exercise's own default — existing catalog content)_ |

**Coach notes (shown on the workout screen, NOT copied into a plan):**

- HE: שיטה אחת בלבד בכל אימון. כל חלופה מגיעה עם מינון משלה — לא מניחים שאותו מינון מתאים לכל מכשיר.
- EN: ONE modality per session. Each alternative comes with its own prescription — the same dosage is never assumed to suit every device.
- HE: הקצב אחיד בכל המקטעים. אם הקצב יורד בחדות — מקצרים את האימון.
- EN: Keep an even pace across the efforts. If the pace drops sharply, shorten the session.
- HE: משטח יציב, יבש ולא חלק, ומרחב נקי סביב.
- EN: Use a stable, dry, non-slip surface with clear space around.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Sources:**
- Eddolls WTB, McNarry MA, Stratton G, et al. High-Intensity Interval Training Interventions in Children and Adolescents: A Systematic Review. Sports Med 2017 — https://pmc.ncbi.nlm.nih.gov/articles/PMC5633633/ _(opened)_

**Exactly what the sources support:** A review of running-based HIIT in children and adolescents (HIIT-YOUTH, opened) suggests 2–3 sessions a week for about 7 weeks or more; it says bout duration and rest are still ambiguous and reports no safety data.

**What is Gals Coacher synthesis:** The 6 × 45 s / 90 s default and EVERY alternative prescription (bike, ski erg, rower, jump rope): each is ours, set separately, and none is validated.

**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.

### ATH-REPEATED-EFFORT-01 — Repeated Effort / מאמץ חוזר

| | |
|---|---|
| **Slice** | TRAINING-BLOCKS-001 (new) |
| **Domain** | `GENERAL_ATHLETIC` (no sport) |
| **Difficulty** | INTERMEDIATE (content progression, not a readiness assessment) |
| **Focus** | CONDITIONING |
| **Length** | about 30–40 minutes |
| **Review status** | `PENDING_HUMAN_REVIEW` |
| **Evidence class** | structure and sequencing: `SYNTHESIZED` · every dosage: `ORIGINAL_RECOMMENDATION` |

**Summary — HE:** ספרינטים קצרים חוזרים (20 מטרים) עם מנוחות קצרות, בשלושה סבבים — יכולת לחזור על מאמץ. גרסת שטח פשוטה.

**Summary — EN:** Repeated short sprints (20 metres) with short rests in three rounds — the ability to repeat an effort. A simple field version.

**Section 1 — Warm-up / חימום**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | LEG_SWINGS | Leg Swings | נדנודי רגל | 1 × 12 reps, rest 0s _(the Exercise's own default — existing catalog content)_ |
| 2 | A_SKIP | A-Skip | דילוג A | 2 × 20 reps, rest 30s _(the Exercise's own default — existing catalog content)_ |
| 3 | HIGH_KNEES | High Knees | הרמת ברכיים במקום | 2 × 20s, rest 20s _(the Exercise's own default — existing catalog content)_ |

**Section 2 — Round 1 / סבב 1**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | SPRINT_20M | 20 m Sprint | ספרינט 20 מטר | 6 × 7s _(COMPLETION_TIME_CAP — a recording cap: record your actual time; not a goal)_, rest 25s |
| ↳ | alternative: SHUTTLE_RUN | Shuttle Run | ריצה הלוך-חזור | 6 × 30s _(DURATION_TARGET — work for this long)_, rest 30s _(its own prescription)_ |
| ↳ | alternative: SLED_PUSH | Sled Push | דחיפת מזחלת | 6 × 10s _(DURATION_TARGET — work for this long)_, rest 30s _(its own prescription)_ |
| ↳ | alternative: BATTLE_ROPE_WAVES | Battle Rope Waves | גלים בחבלי קרב | 6 × 20s, rest 30s _(its own prescription)_ |

**Section 3 — Round 2 — after about two minutes of rest / סבב 2 — אחרי כשתי דקות מנוחה**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | SPRINT_20M | 20 m Sprint | ספרינט 20 מטר | 6 × 7s _(COMPLETION_TIME_CAP — a recording cap: record your actual time; not a goal)_, rest 25s |

**Section 4 — Round 3 — after about two minutes of rest / סבב 3 — אחרי כשתי דקות מנוחה**

| # | Exercise (ID) | EN | HE | Dosage |
|---|---|---|---|---|
| 1 | SPRINT_20M | 20 m Sprint | ספרינט 20 מטר | 6 × 7s _(COMPLETION_TIME_CAP — a recording cap: record your actual time; not a goal)_, rest 25s |

**Coach notes (shown on the workout screen, NOT copied into a plan):**

- HE: ספרינטים של עד 10 שניות עם מנוחה של עד 60 שניות; כשתי דקות בין הסבבים. מתחילים בשני סבבים אם צריך.
- EN: Sprints of up to 10 seconds with up to 60 seconds of rest, and about two minutes between rounds. Start with two rounds if needed.
- HE: אם אין מקום ל־20 מטרים: ריצת הלוך־וחזור (שאטל), או מזחלת וחבלי קרב לפי הציוד. לכל חלופה מינון משלה.
- EN: If there is no room for 20 metres: shuttle runs, or a sled or battle ropes if available. Each alternative has its own prescription.
- HE: יעדי הזמן בספרינטים ובתרגילי הזריזות הם תקרה נדיבה בשניות — לא מטרה. המתאמן מתעד את הזמן בפועל.
- EN: The time targets on sprints and agility drills are generous caps in seconds, not goals — the athlete records the real time.
- HE: משטח יציב, יבש ולא חלק, ומרחב נקי סביב.
- EN: Use a stable, dry, non-slip surface with clear space around.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Sources:**
- Thurlow F, McLaren SJ, Townshend A, Weakley J. The Application of Repeated-Sprint Training. NSCA Strength & Conditioning Journal — https://www.nsca.com/globalassets/certification/rscc/3--scj--application-of-repeat-sprint-training.pdf _(opened)_
- Bishop D, Girard O, Mendez-Villanueva A. Repeated-sprint ability — Part II: recommendations for training. Sports Med 2011 — https://pubmed.ncbi.nlm.nih.gov/21846163/ _(abstract only)_

**Exactly what the sources support:** Repeated-sprint training is sprints of up to 10 s with up to 60 s recovery; two to three sets a session is generally recommended; distances from 10 to 40 m; about 2 minutes between sets is an example (RST-NSCA, full text). Repeated-sprint training suggests including single-sprint training and some high-intensity interval training (RSA-2011, abstract only). Neither is a youth study.

**What is Gals Coacher synthesis:** Three rounds of 6 × 20 m with about 25 s between repetitions, the rest between rounds, and the sled / battle-rope / shuttle alternatives, each with its own prescription.

**ORIGINAL_RECOMMENDATION:** every set, target, rest and duration in the tables above.

## C. Training Blocks (6)

### ATHLETICISM-FOUNDATION-6W-01 — Athleticism Foundation / בסיס אתלטי

| | |
|---|---|
| **Difficulty** | BEGINNER (content progression — not an age or a readiness assessment) |
| **Duration** | 6 weeks · 2 sessions a week · 12 sessions |
| **Review status** | `PENDING_HUMAN_REVIEW` |

**Summary — HE:** שישה שבועות שמחברים כוח בסיסי, נחיתה וקפיצה, האצה ועצירה — בסיס תנועתי רחב לכל ספורט.

**Summary — EN:** Six weeks that combine foundation strength, landing and jumping, acceleration and deceleration — a broad movement base for any sport.

**Goal — HE / EN:** לשפר אתלטיות כללית: תנועה, כוח, שליטה בנחיתה, האצה ועצירה. / Improve general athleticism: movement, strength, landing control, acceleration and deceleration.

**Who it is for — HE / EN:** מתאמנים שמתחילים תוכנית מובנית, או רוצים בסיס רחב לפני התמחות. / Athletes starting a structured programme, or wanting a broad base before specialising.

**Prerequisites — HE / EN:** אין תנאי מוקדם. מתאים גם למתאמן חדש; מבוגר אחראי או מאמן מתאים את העצימות. / No prerequisite. Suitable for a new athlete; a coach or responsible adult adjusts the intensity.

**Equipment — HE / EN:** משקולת יד או קטלבל, ספסל או קופסה נמוכה, רצועה, קונוסים ושטח פתוח. / A dumbbell or kettlebell, a bench or low box, a band, cones and open space.

**Week by week** (adjustments are absolute values applied to a COPY; the source workout never changes):

| Week | Session 1 | Session 2 |
|---|---|---|
| 1 | ATH-MOVEMENT-FOUNDATION-01 | ATH-STRENGTH-FULLBODY-A-01 |
| 2 | ATH-STRENGTH-FULLBODY-B-01 | ATH-JUMP-LANDING-01 |
| 3 | ATH-STRENGTH-FULLBODY-A-01 — sets: GOBLET_SQUAT 4, PUSH_UP 4 — _Add a small load once every repetition is clean, and return the repetitions to the base number._ | ATH-ACCELERATION-01 |
| 4 | ATH-STRENGTH-FULLBODY-B-01 — sets: STEP_UP 4, ROMANIAN_DEADLIFT 4 — _Add a small load once every repetition is clean, and return the repetitions to the base number._ | ATH-JUMP-LANDING-01 — sets: DROP_LANDING_STICK 4, SQUAT_JUMP 4 |
| 5 | ATH-STRENGTH-FULLBODY-A-01 — sets: GOBLET_SQUAT 4, PUSH_UP 4 — _Add a small load once every repetition is clean, and return the repetitions to the base number._ | ATH-DECEL-COD-01 — without: PRO_AGILITY_5_10_5, LATERAL_BOUNDS |
| 6 | ATH-STRENGTH-FULLBODY-B-01 — sets: STEP_UP 2, ROMANIAN_DEADLIFT 2 — _Consolidation week: less volume, the same quality — do not add more work._ | ATH-ACCELERATION-01 — sets: SPRINT_10M 4, SPRINT_20M 2 — _Consolidation week: less volume, the same quality — do not add more work._ |

**Plan names created (EN / HE):**

- Athleticism 1.1 Movement / בסיס אתלטי 1.1 יסודות תנועה
- Athleticism 1.2 Strength A / בסיס אתלטי 1.2 כוח א׳
- Athleticism 2.1 Strength B / בסיס אתלטי 2.1 כוח ב׳
- Athleticism 2.2 Landing / בסיס אתלטי 2.2 קפיצה ונחיתה
- Athleticism 3.1 Strength A / בסיס אתלטי 3.1 כוח א׳
- Athleticism 3.2 Accel / בסיס אתלטי 3.2 האצה
- Athleticism 4.1 Strength B / בסיס אתלטי 4.1 כוח ב׳
- Athleticism 4.2 Landing / בסיס אתלטי 4.2 קפיצה ונחיתה
- Athleticism 5.1 Strength A / בסיס אתלטי 5.1 כוח א׳
- Athleticism 5.2 Decel & COD / בסיס אתלטי 5.2 עצירה וכיוון
- Athleticism 6.1 Strength B / בסיס אתלטי 6.1 כוח ב׳
- Athleticism 6.2 Accel / בסיס אתלטי 6.2 האצה

**Progression:**
- HE: שבועות 1–2: לומדים את התנועה. שבועות 3–5: מעט יותר נפח. שבוע 6: איחוד.
- EN: Weeks 1–2: learn the movement. Weeks 3–5: slightly more volume. Week 6: consolidate.
- HE: נחיתה לפני קפיצות, עצירה לפני שינויי כיוון חדים.
- EN: Landing before jumping, stopping before sharp changes of direction.

**Recovery — HE:** לפחות יום מנוחה בין שני אימונים; באימוני קפיצות וספרינטים עדיף יומיים בין אימונים דומים.

**Recovery — EN:** At least one rest day between sessions; after jumping and sprinting sessions two days is better between similar sessions.

**Substitutions:**
- HE: אין קופסה: ספסל יציב או מדרגה נמוכה בנחיתה.
- EN: No box: use a stable bench or a low step for the landing.
- HE: אין משקולות: בקבוק מים מלא כעומס קל, בזהירות.
- EN: No weights: a filled water bottle can be a light load, with care.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Programming decisions and their evidence class:**

| Decision (EN) | Evidence class | Sources |
|---|---|---|
| Technique and movement quality before intensity or load; progression by competence, not by age. | `SOURCE_SUPPORTED` | LTAD-1 |
| Two sessions a week, with at least one rest day between them. | `SYNTHESIZED` | ACSM-2009, PLYO-ADOLESCENT |
| Controlled landing before jumping, and stopping before changes of direction. | `SYNTHESIZED` | LANDING-ADULTS |
| Strength progression: sets and repetitions first, then a small load. The usual 2–10% load step comes from adults only. | `SYNTHESIZED` | ACSM-2009 |
| Every set, repetition, rest, weekly arrangement and progression is Gals Coacher’s own recommendation. | `ORIGINAL_RECOMMENDATION` | — |

**ORIGINAL_RECOMMENDATION:** every set, repetition, duration, rest, the weekly arrangement and the progression.

### EXPLOSIVE-POWER-8W-01 — Explosive Power / כוח מתפרץ

| | |
|---|---|
| **Difficulty** | INTERMEDIATE (content progression — not an age or a readiness assessment) |
| **Duration** | 8 weeks · 2 sessions a week · 16 sessions |
| **Review status** | `PENDING_HUMAN_REVIEW` |

**Summary — HE:** שמונה שבועות: קודם איכות נחיתה, אחר כך קפיצות פשוטות ועד פלט מתפרץ באיכות גבוהה, עם נפח קפיצות מתון ושבוע אחרון של איחוד.

**Summary — EN:** Eight weeks: landing quality first, then simple jumps up to high-quality explosive output, with moderate jump volume and a consolidation week at the end.

**Goal — HE / EN:** לשפר כוח מתפרץ — קפיצות וזריקות — בלי נפח מיותר. / Improve explosive power — jumping and throwing — without excess volume.

**Who it is for — HE / EN:** מתאמנים שכבר מרגישים בנוח בנחיתה ובתבניות הבסיס. / Athletes already comfortable with landing and the basic movement patterns.

**Prerequisites — HE / EN:** נחיתה מבוקרת נקייה על שתי רגליים, סקווט ולאנג׳ בטכניקה טובה — או השלמת "בסיס אתלטי". / A clean two-leg landing and good squat and lunge technique — or having completed "Athleticism Foundation".

**Equipment — HE / EN:** קופסה או ספסל יציב, קטלבל או משקולת, כדור כבד, ספסל, רצועה ומשטח יציב. / A stable box or bench, a kettlebell or dumbbell, a medicine ball, a bench, a band and a stable surface.

**Week by week** (adjustments are absolute values applied to a COPY; the source workout never changes):

| Week | Session 1 | Session 2 |
|---|---|---|
| 1 | ATH-JUMP-LANDING-01 | ATH-STRENGTH-FULLBODY-A-01 |
| 2 | ATH-STRENGTH-FULLBODY-B-01 | ATH-JUMP-LANDING-01 — sets: DROP_LANDING_STICK 4 |
| 3 | ATH-EXPLOSIVE-LOWER-01 — sets: BOX_JUMP 3; without: LATERAL_BOUNDS | ATH-ROTATIONAL-POWER-01 — sets: MED_BALL_ROTATIONAL_THROW 3 |
| 4 | ATH-STRENGTH-FULLBODY-A-01 — sets: GOBLET_SQUAT 4, PUSH_UP 4 — _Add a small load once every repetition is clean, and return the repetitions to the base number._ | ATH-EXPLOSIVE-LOWER-01 — without: LATERAL_BOUNDS |
| 5 | ATH-ROTATIONAL-POWER-01 | ATH-EXPLOSIVE-LOWER-01 |
| 6 | ATH-STRENGTH-FULLBODY-B-01 — sets: STEP_UP 4, ROMANIAN_DEADLIFT 4 — _Add a small load once every repetition is clean, and return the repetitions to the base number._ | ATH-EXPLOSIVE-LOWER-01 |
| 7 | ATH-ROTATIONAL-POWER-01 | ATH-EXPLOSIVE-LOWER-01 |
| 8 | ATH-STRENGTH-FULLBODY-A-01 — sets: GOBLET_SQUAT 2, PUSH_UP 2 — _Consolidation week: less volume, the same quality — do not add more work._ | ATH-EXPLOSIVE-LOWER-01 — sets: BOX_JUMP 3, LATERAL_BOUNDS 2, KETTLEBELL_SWING 2 — _Consolidation week: less volume, the same quality — do not add more work._ |

**Plan names created (EN / HE):**

- Explosive 1.1 Landing / כוח מתפרץ 1.1 קפיצה ונחיתה
- Explosive 1.2 Strength A / כוח מתפרץ 1.2 כוח א׳
- Explosive 2.1 Strength B / כוח מתפרץ 2.1 כוח ב׳
- Explosive 2.2 Landing / כוח מתפרץ 2.2 קפיצה ונחיתה
- Explosive 3.1 Jump power / כוח מתפרץ 3.1 כוח מתפרץ
- Explosive 3.2 Throws / כוח מתפרץ 3.2 זריקות וסיבוב
- Explosive 4.1 Strength A / כוח מתפרץ 4.1 כוח א׳
- Explosive 4.2 Jump power / כוח מתפרץ 4.2 כוח מתפרץ
- Explosive 5.1 Throws / כוח מתפרץ 5.1 זריקות וסיבוב
- Explosive 5.2 Jump power / כוח מתפרץ 5.2 כוח מתפרץ
- Explosive 6.1 Strength B / כוח מתפרץ 6.1 כוח ב׳
- Explosive 6.2 Jump power / כוח מתפרץ 6.2 כוח מתפרץ
- Explosive 7.1 Throws / כוח מתפרץ 7.1 זריקות וסיבוב
- Explosive 7.2 Jump power / כוח מתפרץ 7.2 כוח מתפרץ
- Explosive 8.1 Strength A / כוח מתפרץ 8.1 כוח א׳
- Explosive 8.2 Jump power / כוח מתפרץ 8.2 כוח מתפרץ

**Progression:**
- HE: שבועות 1–2: נחיתה ובסיס כוח. שבועות 3–4: קפיצות פשוטות. שבועות 5–7: פלט מתפרץ מלא. שבוע 8: איחוד.
- EN: Weeks 1–2: landing and a strength base. Weeks 3–4: simple jumps. Weeks 5–7: full explosive output. Week 8: consolidate.
- HE: נפח הקפיצות נשאר מתון בכוונה; איכות ומנוחה מלאה לפני כמות.
- EN: Jump volume stays moderate on purpose; quality and full rest before quantity.

**Recovery — HE:** לפחות יום מנוחה בין שני אימונים; באימוני קפיצות וספרינטים עדיף יומיים בין אימונים דומים.

**Recovery — EN:** At least one rest day between sessions; after jumping and sprinting sessions two days is better between similar sessions.

**Substitutions:**
- HE: אין קופסה: קפיצת סקווט במקום קפיצת קופסה.
- EN: No box: use the squat jump instead of the box jump.
- HE: אם אין כדור כבד מתאים — מדלגים על חלק הזריקות או משתמשים בתרגיל או באימון כוח מתפרץ מאושר אחר.
- EN: If no appropriate medicine ball is available, skip the throwing section or use another approved power exercise or workout.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Programming decisions and their evidence class:**

| Decision (EN) | Evidence class | Sources |
|---|---|---|
| Technique and movement quality before intensity or load; progression by competence, not by age. | `SOURCE_SUPPORTED` | LTAD-1 |
| Moderate jump volume — more jumps do not always give more improvement. | `SOURCE_SUPPORTED` | PLYO-ADOLESCENT |
| Eight weeks, twice a week: the review links 8 to under 10 weeks with more consistent gains (an exploratory finding). The programme itself is our own recommendation. | `ORIGINAL_RECOMMENDATION` | PLYO-ADOLESCENT |
| Landing before jumping, simple jumps before full explosive output. | `SYNTHESIZED` | LANDING-ADULTS |
| Strength progression: sets and repetitions first, then a small load. The usual 2–10% load step comes from adults only. | `SYNTHESIZED` | ACSM-2009 |
| Every set, repetition, rest, weekly arrangement and progression is Gals Coacher’s own recommendation. | `ORIGINAL_RECOMMENDATION` | — |

**ORIGINAL_RECOMMENDATION:** every set, repetition, duration, rest, the weekly arrangement and the progression.

### SPEED-ACCELERATION-6W-01 — Speed & Acceleration / מהירות והאצה

| | |
|---|---|
| **Difficulty** | INTERMEDIATE (content progression — not an age or a readiness assessment) |
| **Duration** | 6 weeks · 2 sessions a week · 12 sessions |
| **Review status** | `PENDING_HUMAN_REVIEW` |

**Summary — HE:** שישה שבועות של האצה באיכות גבוהה ומנוחה מלאה, ובסוף עבודת מהירות מרבית — לא ריצה רציפה.

**Summary — EN:** Six weeks of high-quality acceleration with full rest, finishing with maximum-velocity work — not continuous running.

**Goal — HE / EN:** לשפר האצה ומהירות מרבית בקו ישר. / Improve acceleration and straight-line maximum speed.

**Who it is for — HE / EN:** מתאמנים שרוצים להאיץ מהר יותר ויכולים לעבוד על משטח ריצה. / Athletes wanting to accelerate faster, with a running surface available.

**Prerequisites — HE / EN:** שבועות 1–4 מתאימים גם למתחילים; שבועות 5–6 דורשים נחיתה וריצה נקיות. / Weeks 1–4 suit beginners; weeks 5–6 need clean landing and running mechanics.

**Equipment — HE / EN:** קונוסים, שטח ריצה ישר של כ־40 מטרים, קופסה או ספסל, משקולת או קטלבל. / Cones, a straight running area of about 40 metres, a box or bench, a dumbbell or kettlebell.

**Week by week** (adjustments are absolute values applied to a COPY; the source workout never changes):

| Week | Session 1 | Session 2 |
|---|---|---|
| 1 | ATH-JUMP-LANDING-01 | ATH-ACCELERATION-01 |
| 2 | ATH-ACCELERATION-01 | ATH-STRENGTH-FULLBODY-B-01 |
| 3 | ATH-ACCELERATION-01 — sets: SPRINT_10M 6 | ATH-EXPLOSIVE-LOWER-01 — sets: BOX_JUMP 3; without: LATERAL_BOUNDS |
| 4 | ATH-ACCELERATION-01 — sets: SPRINT_20M 4 | ATH-STRENGTH-FULLBODY-A-01 — sets: GOBLET_SQUAT 4, PUSH_UP 4 — _Add a small load once every repetition is clean, and return the repetitions to the base number._ |
| 5 | ATH-SPEED-01 | ATH-EXPLOSIVE-LOWER-01 — without: LATERAL_BOUNDS |
| 6 | ATH-SPEED-01 — sets: SPRINT_30M_FLYING 3 — _Consolidation week: less volume, the same quality — do not add more work._ | ATH-ACCELERATION-01 — sets: SPRINT_10M 4, SPRINT_20M 2 — _Consolidation week: less volume, the same quality — do not add more work._ |

**Plan names created (EN / HE):**

- Speed 1.1 Landing / מהירות 1.1 קפיצה ונחיתה
- Speed 1.2 Accel / מהירות 1.2 האצה
- Speed 2.1 Accel / מהירות 2.1 האצה
- Speed 2.2 Strength B / מהירות 2.2 כוח ב׳
- Speed 3.1 Accel / מהירות 3.1 האצה
- Speed 3.2 Jump power / מהירות 3.2 כוח מתפרץ
- Speed 4.1 Accel / מהירות 4.1 האצה
- Speed 4.2 Strength A / מהירות 4.2 כוח א׳
- Speed 5.1 Max speed / מהירות 5.1 מהירות מרבית
- Speed 5.2 Jump power / מהירות 5.2 כוח מתפרץ
- Speed 6.1 Max speed / מהירות 6.1 מהירות מרבית
- Speed 6.2 Accel / מהירות 6.2 האצה

**Progression:**
- HE: שבועות 1–4: האצה ונפח ספרינט עולה בהדרגה. שבועות 5–6: מהירות מרבית ואיחוד.
- EN: Weeks 1–4: acceleration with gradually rising sprint volume. Weeks 5–6: maximum velocity and consolidation.
- HE: ימי ספרינט מתחילים רעננים, ואחריהם יום מנוחה אחד לפחות.
- EN: Sprint days start fresh and are followed by at least one rest day.

**Recovery — HE:** לפחות יום מנוחה בין שני אימונים; באימוני קפיצות וספרינטים עדיף יומיים בין אימונים דומים.

**Recovery — EN:** At least one rest day between sessions; after jumping and sprinting sessions two days is better between similar sessions.

**Substitutions:**
- HE: אין מקום ל־30 מטרים: ספרינט 20 מטרים בלבד.
- EN: No room for 30 metres: use 20-metre sprints only.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Programming decisions and their evidence class:**

| Decision (EN) | Evidence class | Sources |
|---|---|---|
| Technique and movement quality before intensity or load; progression by competence, not by age. | `SOURCE_SUPPORTED` | LTAD-1 |
| Acceleration before maximum velocity, with full rest between single sprints — the long rest is our judgement, not from a source. | `SYNTHESIZED` | — |
| Two sessions a week, with at least one rest day between them. | `SYNTHESIZED` | ACSM-2009, PLYO-ADOLESCENT |
| Every set, repetition, rest, weekly arrangement and progression is Gals Coacher’s own recommendation. | `ORIGINAL_RECOMMENDATION` | — |

**ORIGINAL_RECOMMENDATION:** every set, repetition, duration, rest, the weekly arrangement and the progression.

### AGILITY-COD-6W-01 — Agility & Change of Direction / זריזות ושינויי כיוון

| | |
|---|---|
| **Difficulty** | INTERMEDIATE (content progression — not an age or a readiness assessment) |
| **Duration** | 6 weeks · 2 sessions a week · 12 sessions |
| **Review status** | `PENDING_HUMAN_REVIEW` |

**Summary — HE:** שישה שבועות: עצירה מבוקרת, שינויי כיוון מתוכננים ואחר כך זריזות תגובתית לאות.

**Summary — EN:** Six weeks: controlled stopping, pre-planned changes of direction, and then reactive agility to a cue.

**Goal — HE / EN:** לשפר שליטה בעצירה ובשינויי כיוון, ויכולת להגיב לאות. / Improve control of stopping and changing direction, and the ability to react to a cue.

**Who it is for — HE / EN:** מתאמנים בענפי כדור ובענפי תנועה רב־כיוונית. / Athletes in ball and multi-directional sports.

**Prerequisites — HE / EN:** נחיתה מבוקרת וריצה נקייה. זריזות תגובתית דורשת בן זוג או מאמן. / A clean landing and running. Reactive agility needs a partner or coach.

**Equipment — HE / EN:** קונוסים, שטח ריצה, בן זוג או מאמן לאימוני התגובה, משקולת או קטלבל. / Cones, a running area, a partner or coach for the reactive sessions, a dumbbell or kettlebell.

**Week by week** (adjustments are absolute values applied to a COPY; the source workout never changes):

| Week | Session 1 | Session 2 |
|---|---|---|
| 1 | ATH-JUMP-LANDING-01 | ATH-DECEL-COD-01 — sets: T_DRILL 2; without: PRO_AGILITY_5_10_5 |
| 2 | ATH-DECEL-COD-01 | ATH-STRENGTH-FULLBODY-A-01 |
| 3 | ATH-DECEL-COD-01 | ATH-ACCELERATION-01 |
| 4 | ATH-REACTIVE-AGILITY-01 | ATH-STRENGTH-FULLBODY-B-01 |
| 5 | ATH-DECEL-COD-01 | ATH-REACTIVE-AGILITY-01 |
| 6 | ATH-REACTIVE-AGILITY-01 — sets: COACH_CUE_REACTION_SPRINT 4 — _Consolidation week: less volume, the same quality — do not add more work._ | ATH-DECEL-COD-01 — sets: DECEL_STOP 3, T_DRILL 2, PRO_AGILITY_5_10_5 2 — _Consolidation week: less volume, the same quality — do not add more work._ |

**Plan names created (EN / HE):**

- Agility 1.1 Landing / זריזות 1.1 קפיצה ונחיתה
- Agility 1.2 Decel & COD / זריזות 1.2 עצירה וכיוון
- Agility 2.1 Decel & COD / זריזות 2.1 עצירה וכיוון
- Agility 2.2 Strength A / זריזות 2.2 כוח א׳
- Agility 3.1 Decel & COD / זריזות 3.1 עצירה וכיוון
- Agility 3.2 Accel / זריזות 3.2 האצה
- Agility 4.1 Reactive / זריזות 4.1 זריזות תגובתית
- Agility 4.2 Strength B / זריזות 4.2 כוח ב׳
- Agility 5.1 Decel & COD / זריזות 5.1 עצירה וכיוון
- Agility 5.2 Reactive / זריזות 5.2 זריזות תגובתית
- Agility 6.1 Reactive / זריזות 6.1 זריזות תגובתית
- Agility 6.2 Decel & COD / זריזות 6.2 עצירה וכיוון

**Progression:**
- HE: שבועות 1–3: עצירה ושינויי כיוון מתוכננים. שבועות 4–6: זריזות תגובתית נכנסת, ושבוע אחרון של איחוד.
- EN: Weeks 1–3: stopping and pre-planned changes of direction. Weeks 4–6: reactive agility enters, and the last week consolidates.
- HE: האות תמיד בלתי צפוי; בלי בן זוג מחליפים בעבודה מתוכננת.
- EN: The cue is always unpredictable; without a partner, swap in pre-planned work.

**Recovery — HE:** לפחות יום מנוחה בין שני אימונים; באימוני קפיצות וספרינטים עדיף יומיים בין אימונים דומים.

**Recovery — EN:** At least one rest day between sessions; after jumping and sprinting sessions two days is better between similar sessions.

**Substitutions:**
- HE: אין בן זוג: במקום זריזות תגובתית — עצירה מבוקרת ושינוי כיוון מתוכנן.
- EN: No partner: replace reactive sessions with controlled stopping and pre-planned change of direction.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Programming decisions and their evidence class:**

| Decision (EN) | Evidence class | Sources |
|---|---|---|
| Technique and movement quality before intensity or load; progression by competence, not by age. | `SOURCE_SUPPORTED` | LTAD-1 |
| Reactive agility needs a stimulus: a human or video stimulus separates playing levels better (abstract only). | `SOURCE_SUPPORTED` | AGILITY-2016 |
| Stopping before sharp changes of direction, and pre-planned before reactive change of direction. | `SYNTHESIZED` | DECEL-2022 |
| Two sessions a week, with at least one rest day between them. | `SYNTHESIZED` | ACSM-2009, PLYO-ADOLESCENT |
| Every set, repetition, rest, weekly arrangement and progression is Gals Coacher’s own recommendation. | `ORIGINAL_RECOMMENDATION` | — |

**ORIGINAL_RECOMMENDATION:** every set, repetition, duration, rest, the weekly arrangement and the progression.

### STRENGTH-FOUNDATION-6W-01 — Strength Foundation / בסיס כוח

| | |
|---|---|
| **Difficulty** | BEGINNER (content progression — not an age or a readiness assessment) |
| **Duration** | 6 weeks · 2 sessions a week · 12 sessions |
| **Review status** | `PENDING_HUMAN_REVIEW` |

**Summary — HE:** שישה שבועות של כוח כל הגוף: סקווט, ציר ירך, רגל אחת, דחיפה, משיכה ויציבות הגו — בהתקדמות הדרגתית ושבוע איחוד.

**Summary — EN:** Six weeks of full-body strength: squat, hip hinge, single leg, push, pull and trunk stability — with gradual progression and a consolidation week.

**Goal — HE / EN:** לבנות בסיס כוח כללי בטכניקה טובה. / Build a general strength base with good technique.

**Who it is for — HE / EN:** מתאמנים חדשים או חוזרים לאימון, ומתאמנים שרוצים בסיס לפני אימון מתקדם. / New or returning athletes, and athletes wanting a base before advanced training.

**Prerequisites — HE / EN:** אין תנאי מוקדם. / No prerequisite.

**Equipment — HE / EN:** משקולת יד או קטלבל, רצועה וספסל או מדרגה. / A dumbbell or kettlebell, a band, and a bench or step.

**Week by week** (adjustments are absolute values applied to a COPY; the source workout never changes):

| Week | Session 1 | Session 2 |
|---|---|---|
| 1 | ATH-MOVEMENT-FOUNDATION-01 | ATH-STRENGTH-FULLBODY-A-01 |
| 2 | ATH-STRENGTH-FULLBODY-B-01 | ATH-STRENGTH-FULLBODY-A-01 |
| 3 | ATH-STRENGTH-FULLBODY-B-01 — sets: STEP_UP 4, ROMANIAN_DEADLIFT 4 — _Add a small load once every repetition is clean, and return the repetitions to the base number._ | ATH-STRENGTH-FULLBODY-A-01 — sets: GOBLET_SQUAT 4, PUSH_UP 4 — _Add a small load once every repetition is clean, and return the repetitions to the base number._ |
| 4 | ATH-STRENGTH-FULLBODY-B-01 — sets: STEP_UP 4, ROMANIAN_DEADLIFT 4; target: STEP_UP 10, ROMANIAN_DEADLIFT 10 | ATH-STRENGTH-FULLBODY-A-01 — sets: GOBLET_SQUAT 4, PUSH_UP 4; target: GOBLET_SQUAT 10, PUSH_UP 10 |
| 5 | ATH-STRENGTH-FULLBODY-B-01 — sets: STEP_UP 4, ROMANIAN_DEADLIFT 4 — _Add a small load once every repetition is clean, and return the repetitions to the base number._ | ATH-STRENGTH-FULLBODY-A-01 — sets: GOBLET_SQUAT 4, PUSH_UP 4 — _Add a small load once every repetition is clean, and return the repetitions to the base number._ |
| 6 | ATH-STRENGTH-FULLBODY-B-01 — sets: STEP_UP 2, ROMANIAN_DEADLIFT 2 — _Consolidation week: less volume, the same quality — do not add more work._ | ATH-STRENGTH-FULLBODY-A-01 — sets: GOBLET_SQUAT 2, PUSH_UP 2 — _Consolidation week: less volume, the same quality — do not add more work._ |

**Plan names created (EN / HE):**

- Strength 1.1 Movement / בסיס כוח 1.1 יסודות תנועה
- Strength 1.2 Strength A / בסיס כוח 1.2 כוח א׳
- Strength 2.1 Strength B / בסיס כוח 2.1 כוח ב׳
- Strength 2.2 Strength A / בסיס כוח 2.2 כוח א׳
- Strength 3.1 Strength B / בסיס כוח 3.1 כוח ב׳
- Strength 3.2 Strength A / בסיס כוח 3.2 כוח א׳
- Strength 4.1 Strength B / בסיס כוח 4.1 כוח ב׳
- Strength 4.2 Strength A / בסיס כוח 4.2 כוח א׳
- Strength 5.1 Strength B / בסיס כוח 5.1 כוח ב׳
- Strength 5.2 Strength A / בסיס כוח 5.2 כוח א׳
- Strength 6.1 Strength B / בסיס כוח 6.1 כוח ב׳
- Strength 6.2 Strength A / בסיס כוח 6.2 כוח א׳

**Progression:**
- HE: שבוע 1: לומדים. שבועות 2–5: יותר סטים, אחר כך יותר חזרות, אחר כך עומס קטן. שבוע 6: איחוד.
- EN: Week 1: learn. Weeks 2–5: more sets, then more repetitions, then a small load. Week 6: consolidate.

**Recovery — HE:** לפחות יום מנוחה בין שני אימונים; באימוני קפיצות וספרינטים עדיף יומיים בין אימונים דומים.

**Recovery — EN:** At least one rest day between sessions; after jumping and sprinting sessions two days is better between similar sessions.

**Substitutions:**
- HE: אין משקולות: רצועה או משקל גוף.
- EN: No weights: use a band or bodyweight.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Programming decisions and their evidence class:**

| Decision (EN) | Evidence class | Sources |
|---|---|---|
| Technique and movement quality before intensity or load; progression by competence, not by age. | `SOURCE_SUPPORTED` | LTAD-1 |
| Two strength sessions a week for novices (adult guidance, abstract only). | `SOURCE_SUPPORTED` | ACSM-2009 |
| Strength progression: sets and repetitions first, then a small load. The usual 2–10% load step comes from adults only. | `SYNTHESIZED` | ACSM-2009 |
| Every set, repetition, rest, weekly arrangement and progression is Gals Coacher’s own recommendation. | `ORIGINAL_RECOMMENDATION` | — |

**ORIGINAL_RECOMMENDATION:** every set, repetition, duration, rest, the weekly arrangement and the progression.

### CONDITIONING-6W-01 — Conditioning / כושר וסבולת

| | |
|---|---|
| **Difficulty** | BEGINNER (content progression — not an age or a readiness assessment) |
| **Duration** | 6 weeks · 2 sessions a week · 12 sessions |
| **Review status** | `PENDING_HUMAN_REVIEW` |

**Summary — HE:** שישה שבועות: בסיס אירובי, אינטרוולים בריצה ומאמץ חוזר בספרינטים קצרים. כושר כללי; כושר ספציפי לענף נשאר באימוני הענף.

**Summary — EN:** Six weeks: an aerobic base, run intervals and repeated short sprints. General conditioning; sport-specific conditioning stays in the sport workouts.

**Goal — HE / EN:** לשפר סבולת אירובית ויכולת לחזור על מאמץ. / Improve aerobic endurance and the ability to repeat an effort.

**Who it is for — HE / EN:** מתאמנים שצריכים כושר כללי בלי ציוד מיוחד — נעלי ספורט ושטח פתוח מספיקים. / Athletes needing general conditioning with no special equipment — trainers and open space are enough.

**Prerequisites — HE / EN:** אין תנאי מוקדם; שבועות 4–6 דורשים בסיס אירובי מהשבועות הראשונים. / No prerequisite; weeks 4–6 build on the aerobic base of the first weeks.

**Equipment — HE / EN:** נעלי ספורט ושטח פתוח. אופניים, מכשיר חתירה או סקי ארג — אופציונליים כחלופות. / Trainers and open space. A bike, rower or ski erg are optional alternatives.

**Week by week** (adjustments are absolute values applied to a COPY; the source workout never changes):

| Week | Session 1 | Session 2 |
|---|---|---|
| 1 | ATH-CONDITIONING-BASE-01 — target: EASY_RUN 900 | ATH-CONDITIONING-BASE-01 — target: EASY_RUN 900 |
| 2 | ATH-CONDITIONING-BASE-01 — target: EASY_RUN 1080 | ATH-CONDITIONING-INTERVALS-01 — sets: RUN_INTERVALS 5; target: RUN_INTERVALS 30 |
| 3 | ATH-CONDITIONING-BASE-01 — target: EASY_RUN 1200 | ATH-CONDITIONING-INTERVALS-01 — sets: RUN_INTERVALS 6; target: RUN_INTERVALS 30 |
| 4 | ATH-CONDITIONING-INTERVALS-01 — sets: RUN_INTERVALS 6; target: RUN_INTERVALS 45 | ATH-REPEATED-EFFORT-01 — without section(s): 4 |
| 5 | ATH-CONDITIONING-BASE-01 — target: EASY_RUN 1320 | ATH-REPEATED-EFFORT-01 |
| 6 | ATH-CONDITIONING-INTERVALS-01 — sets: RUN_INTERVALS 6; target: RUN_INTERVALS 45 — _Consolidation week: less volume, the same quality — do not add more work._ | ATH-CONDITIONING-BASE-01 — target: EASY_RUN 1200 — _Consolidation week: less volume, the same quality — do not add more work._ |

**Plan names created (EN / HE):**

- Conditioning 1.1 Aerobic base / כושר וסבולת 1.1 בסיס אירובי
- Conditioning 1.2 Aerobic base / כושר וסבולת 1.2 בסיס אירובי
- Conditioning 2.1 Aerobic base / כושר וסבולת 2.1 בסיס אירובי
- Conditioning 2.2 Intervals / כושר וסבולת 2.2 אינטרוולים
- Conditioning 3.1 Aerobic base / כושר וסבולת 3.1 בסיס אירובי
- Conditioning 3.2 Intervals / כושר וסבולת 3.2 אינטרוולים
- Conditioning 4.1 Intervals / כושר וסבולת 4.1 אינטרוולים
- Conditioning 4.2 Repeat effort / כושר וסבולת 4.2 מאמץ חוזר
- Conditioning 5.1 Aerobic base / כושר וסבולת 5.1 בסיס אירובי
- Conditioning 5.2 Repeat effort / כושר וסבולת 5.2 מאמץ חוזר
- Conditioning 6.1 Intervals / כושר וסבולת 6.1 אינטרוולים
- Conditioning 6.2 Aerobic base / כושר וסבולת 6.2 בסיס אירובי

**Progression:**
- HE: הסבולת האירובית מתארכת בהדרגה; האינטרוולים נעים מ־30 ל־45 שניות; המאמץ החוזר מתחיל בשני סבבים ועולה לשלושה.
- EN: The aerobic work lengthens gradually; the intervals go from 30 to 45 seconds; the repeated effort starts at two rounds and builds to three.

**Recovery — HE:** לפחות יום מנוחה בין שני אימונים; באימוני קפיצות וספרינטים עדיף יומיים בין אימונים דומים.

**Recovery — EN:** At least one rest day between sessions; after jumping and sprinting sessions two days is better between similar sessions.

**Substitutions:**
- HE: כל חלופה באינטרוולים והמאמץ החוזר מגיעה עם מינון משלה בתוך האימון.
- EN: Every alternative for the intervals and repeated effort comes with its own prescription inside the workout.

**Safety — HE:** מתחממים לפני, שומרים על טכניקה נקייה לפני שמוסיפים עומס או מהירות, ומפסיקים אם יש כאב, סחרחורת או תסמין חריג. למתאמנים צעירים מומלץ לבצע את האימון בליווי מאמן או מבוגר אחראי, ולהתאים את העצימות לגיל, לניסיון וליכולת הגופנית. התוכן הוא תוכנית אימון ולא ייעוץ רפואי.

**Safety — EN:** Warm up first, keep the technique clean before adding load or speed, and stop if there is pain, dizziness or any unusual symptom. For younger athletes a coach or responsible adult should supervise and match the intensity to age, experience and physical ability. This is a training programme, not medical advice.

**Programming decisions and their evidence class:**

| Decision (EN) | Evidence class | Sources |
|---|---|---|
| Technique and movement quality before intensity or load; progression by competence, not by age. | `SOURCE_SUPPORTED` | LTAD-1 |
| Running interval training two to three times a week for about seven weeks or more (a review in youth). This programme is six weeks — flagged for human judgement. | `SOURCE_SUPPORTED` | HIIT-YOUTH |
| Sprints of up to 10 seconds with up to 60 seconds of rest, two to three sets per session. | `SOURCE_SUPPORTED` | RST-NSCA |
| Order: aerobic base, then intervals, then repeated effort. | `SYNTHESIZED` | RSA-2011 |
| Every set, repetition, rest, weekly arrangement and progression is Gals Coacher’s own recommendation. | `ORIGINAL_RECOMMENDATION` | — |

**ORIGINAL_RECOMMENDATION:** every set, repetition, duration, rest, the weekly arrangement and the progression.

## D. Reuse matrix (which block uses which workout)

| Workout | Athleticism | Explosive | Speed | Agility | Strength | Conditioning |
|---|---|---|---|---|---|---|
| ATH-MOVEMENT-FOUNDATION-01 | 1 |  |  |  | 1 |  |
| ATH-STRENGTH-FULLBODY-A-01 | 3 | 3 | 1 | 1 | 6 |  |
| ATH-STRENGTH-FULLBODY-B-01 | 3 | 2 | 1 | 1 | 5 |  |
| ATH-JUMP-LANDING-01 | 2 | 2 | 1 | 1 |  |  |
| ATH-EXPLOSIVE-LOWER-01 |  | 6 | 2 |  |  |  |
| ATH-ROTATIONAL-POWER-01 |  | 3 |  |  |  |  |
| ATH-ACCELERATION-01 | 2 |  | 5 | 1 |  |  |
| ATH-SPEED-01 |  |  | 2 |  |  |  |
| ATH-DECEL-COD-01 | 1 |  |  | 5 |  |  |
| ATH-REACTIVE-AGILITY-01 |  |  |  | 3 |  |  |
| ATH-CONDITIONING-BASE-01 |  |  |  |  |  | 6 |
| ATH-CONDITIONING-INTERVALS-01 |  |  |  |  |  | 4 |
| ATH-REPEATED-EFFORT-01 |  |  |  |  |  | 2 |

_A number is how many sessions of that block use the workout; the same workout is never duplicated for another block._
