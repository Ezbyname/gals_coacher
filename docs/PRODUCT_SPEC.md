# PRODUCT SPEC — Basketball-First Sports Training App

> **Status: CONTROLLED.** This document is owned by the product owner.
> Claude (or any agent) must not redefine the product. Proposed changes go to the
> owner as a suggestion, never as a silent edit.

Android first — iPhone ready — multi-sport architecture.

---

## 1. Product vision

לבנות אפליקציית אימונים משפחתית שמטרתה לעזור להורה לאמן, למדוד ולעקוב אחרי התקדמות של ילדים בספורט.

בשלב הראשון: **BASKETBALL FIRST** — כל חוויית המשתמש, התרגילים המובנים, הנתונים וה־MVP יתמקדו בכדורסל.

אבל: **THE CORE ENGINE MUST NOT BE BASKETBALL-ONLY.**

בעתיד המערכת צריכה להיות מסוגלת לתמוך גם ב: Football, Surfing, Running, General Fitness, Swimming, Tennis, Other sports —
בלי שכתוב של: ילדים, אימונים, סטים, מדידות, סטופר, היסטוריה, Personal Records, גרפים, Schedule, Notifications, Offline storage.

## 2. Product principle

המטרה היא לא ליצור "Database של תוצאות כדורסל" אלא **DIGITAL TRAINING COMPANION**. האפליקציה צריכה להשתתף באימון עצמו:

```
בחר ילד → בחר אימון → Free Throws → 10 זריקות → MADE / MISS → Rest
→ 20m Sprint → 5 4 3 2 1 📣 → STOP → 4.38 sec → Save → Coach feedback → Next exercise
```

האפליקציה צריכה להרגיש קצת כמו מאמן נוסף שנמצא איתכם במגרש.

## 3. Coaching philosophy

המערכת נבנית מנקודת מבט של מאמן כדורסל וכושר לילדים.

- **Technique before ego** — לא לרדוף רק אחרי מספרים.
- **Consistency before perfection** — ילד שהגיע והתאמן באופן עקבי מקבל חיזוק גם אם האימון הספציפי היה פחות טוב.
- **Improvement relative to yourself** — לא משווים בין הילדים. משווים כל שחקן להיסטוריה שלו, ל־Personal Best שלו, ל־consistency שלו ול־baseline שלו.
- **Quality + effort + consistency** — ביצוע הוא רק חלק מהתמונה.
- **Recovery matters** — אימון טוב אינו רק "עוד ועוד ועוד".
- **Fun matters** — לעודד תחרותיות בריאה והתמדה בלי להפוך את האימון לעונש.

## 4. Coach personality

המאמן הדיגיטלי: תחרותי, חיובי, מצחיק, דורש, מפרגן, מעט שובב.
לעולם לא: משפיל, מעליב, מאיים, מבייש בגלל גוף/משקל, גורם לילד להרגיש כישלון.

| Situation | Example |
|---|---|
| שיפור | "יפה מאוד. הסל מתחיל להבין עם מי יש לו עסק. 🏀" |
| 8/10 | "8 מתוך 10. שתי הזריקות האחרות עדיין חייבות לנו כסף." |
| Personal Record | "זה כבר לא ויכוח עם השעון — שיא אישי. 🏆" |
| אימון חלש יחסית | "היום הסל ניצח כמה קרבות. המלחמה עוד ארוכה 😄" |
| consistency | "עוד אימון בספר. כישרון אוהב אנשים שמגיעים לעבודה." |

## 5. V1 basketball focus

| Area | Exercises | Measurement |
|---|---|---|
| Shooting | Free Throws, Mid Range, Three Pointers, Spot Shooting, Layups | MADE / ATTEMPTS |
| Speed | 10m Sprint, 20m Sprint, Court Sprint | TIME |
| Agility / Ball Handling | Slalom, Cone Dribble, Figure 8, Change of Direction | TIME or DURATION |
| Strength / Conditioning | Plank, Push Ups, Squats, Wall Sit, Shuttle Run | TIME / DURATION / REPETITIONS |
| Skills | e.g. Ball Handling Control 1–10 | RATING (not an MVP focus) |

## 6. Multi-sport design rule

לא בונים כרגע Sport Plugin Engine ולא Universal Everything System — זה יהיה overengineering.
ה־domain הבסיסי כללי (Child, Sport, Exercise, Workout, Session, Set, Attempt, Result, Measurement) וה־Basketball UI יושב מעליו.

## 7. Exercise measurement types

כל Exercise מגדיר איך מודדים אותו. V1: `TIME`, `DURATION`, `REPETITIONS`, `MADE_ATTEMPTS`, `DISTANCE`, `RATING`, `COMPLETION`.

Free Throws = `MADE_ATTEMPTS` · 20m Sprint = `TIME` · Plank = `DURATION` · Push Ups = `REPETITIONS`.
כך בעתיד אפשר להוסיף Football Shooting Drill (`MADE_ATTEMPTS`) או Surf Ride (`DURATION`) בלי לשנות את מנוע התוצאות.

## 8. Important architecture rule

Basketball-specific behavior must not leak into generic result storage. לא ליצור `basketball_results`, `free_throw_results`, `three_pointer_results`. במקום זה: `Exercise → ExerciseAttempt → Measurement` (לדוגמה `made = 8, attempts = 10`).

## 9. Technology stack

- Mobile: React Native, Expo, TypeScript, Expo Router
- Cloud backend: Supabase, PostgreSQL, Supabase Auth, Row Level Security
- Local device: SQLite
- Build: EAS Build

Android is the primary development/test platform; the architecture must stay iOS-compatible.

## 10. Cross-platform hard rule

אסור ליצור implementation שתלוי ב־Android כאשר קיים פתרון cross-platform סביר.
AudioService, HapticsService, NotificationService, TimerService, LocalStorageRepository — abstracted.
`AudioCueService`, לא `AndroidWhistlePlayer`. אם יהיה הבדל אמיתי: `audio.ts` / `audio.android.ts` / `audio.ios.ts`.

## 11. iPhone readiness

לא מפתחים iPhone במקביל לכל שינוי, אבל אסור להגיע לסוף הפרויקט ולנסות iOS לראשונה. Minimum gates:
- Phase 0: iOS project/build configuration exists.
- After Training Engine: iOS development build verification.
- After Notifications: Android + iOS device validation.

## 12. Parent model

MVP: `Parent → Family → Children`. ההורה הוא מנהל המערכת. לכל ילד: name, avatar, dateOfBirth, sports, active/inactive.

## 13. Date of birth

לא לשמור `age = 11` כמקור אמת. שומרים `dateOfBirth` ומחשבים גיל.

## 14. Child profile — basketball V1

לדוגמה: NOAM · Age 11 · Sport: Basketball · Current focus: Shooting, Speed, Ball Handling · Training history · Personal Records.

Full V1 player profile fields: see §65. No weight in V1: see §66.

## 15. Exercise library

קטן ומדויק בהתחלה:
- Shooting: Free Throws, Mid Range, Three Pointers, Layups
- Speed: 10m Sprint, 20m Sprint, Baseline Sprint
- Ball Handling: Cone Slalom, Figure 8, Stationary Dribble
- Conditioning: Plank, Push Ups, Wall Sit, Shuttle Run

לא להכניס 200 תרגילים לפני שאנחנו יודעים שאנשים משתמשים ב־15.

## 16. Custom exercises

ההורה יכול ליצור Exercise: Name, Category, Measurement Type, Instructions, optional tutorial URL, optional defaults (sets, target, rest, countdown).

## 17. YouTube

לכל Exercise אפשר לשמור `tutorialUrl`. אין YouTube API ב־V1. כפתור **WATCH TECHNIQUE** פותח סרטון הדרכה.

## 18. Training engine

הלב של האפליקציה. מנהל: Countdown, Audio, Whistle, Timer, Rest, Sets, Attempts, Results, Transitions.

## 19. Start sequence

Countdown `5 4 3 2 1` ואז 📣 Start. הגדרה אפשרית: `countdownSeconds: 5`, `startCue: WHISTLE`, `endCue: DOUBLE_WHISTLE`.

## 20. Whistles

Start = שריקה אחת 📣. End = שתי שריקות 📣📣. האודיו הוא local asset — לא מורידים משרוקית מהאינטרנט בזמן אימון.

## 21. Timer architecture

הסטופר לא מודד זמן באמצעות setInterval counter. מקור האמת: start timestamp ו־current timestamp; ה־UI רק מציג. אם React נתקע לרגע — תוצאת הזמן לא משתנה.

## 22. Sprint flow

`20M SPRINT → START → 5 4 3 2 1 → 📣 → timer starts → Parent presses STOP → 4.38` — אפשרויות: SAVE / EDIT / RETRY.

## 23. Manual correction

שומרים `measuredResult`, `finalResult`, `wasEdited` (לדוגמה Measured 4.38, Final 4.32, Edited true). סטטיסטיקות משתמשות ב־`finalResult`.

## 24. Manual timer precision

מדידה ידנית כוללת reaction time של מי שלוחץ STOP, לכן לא כל שיפור זעיר הוא PR משמעותי. מתכננים **PB improvement threshold** לפי סוג מדידה (4.35 → 4.32 עשוי להיות "שיפור קטן" ולא NEW PERSONAL RECORD). ה־threshold המדויק ייקבע כ־Product Rule לאחר בדיקות בשטח — לא ממציאים מספר שרירותי בשלב הראשון.

## 25. Shooting mode

ממשק מהיר מאוד: `FREE THROWS · 8 / 11 · 73%`, כפתורים גדולים ✅ MADE / ❌ MISS. כל לחיצה: attempts +1; אם Made: made +1.

## 26. Shooting sets

Set 1 8/10 · Set 2 7/10 · Set 3 9/10 → TOTAL 24/30 · 80%.

## 27. Personal record rule — shooting

אסור להכריז 1/1 (100%) כ־PB טוב יותר מ־18/20 (90%). PB באחוזי קליעה חייב לכלול minimum sample requirement; הכלל המדויק צריך להיות מוגדר ונבדק.

## 28. Rest timer

אחרי Set: 📣📣 REST 00:45 → 3 2 1 → 📣 NEXT SET. המטרה: כמה שפחות מגע בטלפון בזמן האימון.

## 29. Quick training

מהפיצ'רים החשובים ב־MVP: `Home → QUICK TRAINING → Select Child → Basketball → Shooting / Sprint / Ball Handling / Conditioning → START`. אפשר להתחיל אימון תוך שניות.

## 30. Quick shooting

`Quick Training → Noam → Free Throws → Target 20 → MADE / MISS → Finish → 18 / 20 · 90% → Save`.

## 31. Quick sprint

`Quick Training → Noam → 20m Sprint → 5-4-3-2-1 → 📣 → STOP → Save`.

## 32. Structured workout

Workout Template, לדוגמה SHOOTING SESSION: Warmup → Layups 20 → Free Throws 20 → Mid Range 5×5 → Three Pointers 5×5 → Conditioning.

## 33. Workout builder

ההורה מגדיר Exercises, Sets, Targets, Rest, Order. לא CMS מורכב — ליצור אימון בדקה-שתיים.

## 34. Active workout UX

כפתורים גדולים, מעט טקסט, מעט ניווט. המשתמש מחזיק כדור, מסתכל על הילד, עומד במגרש, לפעמים ביד אחת. פעולות מרכזיות: START, STOP, MADE, MISS, NEXT, DONE.

## 35. Local-first training

האימון הפעיל לא תלוי באינטרנט. כל Result נשמר קודם local ואחר כך sync.

## 36. SQLite responsibility

SQLite = Operational Source of Truth במהלך active workout / unsynced workout / pending result.
Supabase = Canonical Cloud Source לאחר sync מוצלח.

## 37. UUID

כל entity שמסתנכרן מקבל UUID במכשיר לפני הכתיבה הראשונה (WorkoutSession, Set, Attempt, Result) — retries לא יוצרים כפילויות.

## 38. Outbox

V1 לא בונה generic synchronization engine. `Local write → Outbox → Network available → Upload / Upsert → Mark synced`.

## 39. Sync dependencies

לא מעלים child entity לפני parent dependency (`Session → Exercise → Set → Attempt`). בהמשך: dependency-aware upload או aggregate workout sync. לא בונים sync מורכב לפני שנדרש.

## 40. Single-writer MVP

Parent device הוא הכותב העיקרי. לא פותרים עכשיו multi-device conflict resolution. Child Mode מגיע מאוחר יותר.

## 41. History

לכל ילד Workout History, לדוגמה: Oct 2 · Basketball · Shooting + Sprint · 42 min · Free Throws 16/20 · 20m 4.31.

## 42. Exercise history

Free Throws: Sep 10 61% · Sep 15 66% · Sep 22 71% · Sep 29 75% · Oct 2 80%.

## 43. Personal records

מסך MY RECORDS: Free Throws 18/20 90% 🏆 · 20m Sprint 4.31 sec 🏆 · Plank 1:48 🏆.

## 44. Progress — V1

לא Dashboard ענק. גרף ראשון: בחר Child, Exercise, Time range → progression (Free Throw % over time, 20m sprint over time).

## 45. Progress score

לא ב־MVP. בעתיד Progress Score מודד Improvement, Consistency, Training Completion, Recovery — אבל לעולם לא "How good is this child?".

## 46. Coach message engine

לפני AI: **Deterministic Coach Engine**. Input: exercise type, current result, previous result, PB, completion, streak. Output: message.

## 47. Coach engine examples

- PB: "כנראה שהשעון היום הגיע לעבוד. 🏆"
- Improvement: "זה כבר נראה הרבה יותר מסוכן להגנה."
- Consistency: "שלושה אימונים רצופים. ככה כישרון הופך להרגל."
- Poor session: "לא כל יום הכדור משתף פעולה. אנחנו מגיעים שוב מחר."

## 48. AI coach

AI לא dependency של V1. רק אחרי שיש training history, results, consistency, sleep/recovery data — AI יוכל לענות "What improved this month?", "What should we focus on?", "Where is performance plateauing?".

## 49. Future child mode

`Parent → Generate pairing code → Child device → Anonymous Supabase account → Secure pairing → Child profile`. הילד לא צריך email, password, forgot password.

## 50. Child mode UX

הילד רואה בעיקר: Today's Training, Upcoming Practice, Personal Records, Progress, Coach Message. פחות: Admin, Settings, Workout construction.

## 51. Schedule / Calendar

Team Practice, Personal Workout, Game, Recovery Day, recurring events.

**Part of the True MVP (approved 2026-10-04):** Calendar Foundation and a usable Calendar UI with Calendar ↔ Training integration (see §71 and ROADMAP). Not "later" any more; notifications (§52) stay later.

### Slice 1.3 — Calendar Foundation contract (approved 2026-10-04 — not implemented)

- **Each Player has their own schedule** of one-off events, with or without a sport. A calendar event is a plan, never a training session or result (§71): it does not create, complete or skip training.
- **Event types:** Team training, Personal training, Game, Gym, Recovery, Other (stable codes `TEAM_TRAINING`, `PERSONAL_TRAINING`, `GAME`, `GYM`, `RECOVERY`, `OTHER`; labels in Hebrew / English). School and Unavailable time come later.
- **Sport** is optional and independent of the type (e.g. a gym session may have none); only a sport the Player is assigned to (today Basketball).
- **Time:** a start date and time, and an optional end time after the start. Entered and shown in the device's local time, in the active app language; times keep their left-to-right order in Hebrew. No all-day events yet.
- **Title** is optional — the type name is shown instead — except for **Other**, which needs a title. **Notes** are optional.
- **Create, view, edit and delete** (delete asks for confirmation).
- **Where:** from Player Edit, a Schedule section opens the Player's list: **Current & upcoming** (an event stays here until it ends, or until it starts when it has no end), nearest first, and **Past**, most recent first.
- **Not yet:** recurring events and their exceptions (with the Calendar UI in 2.2), month / week / day views, reminders, Coach views or sharing, the phone's own calendar.

## 52. Notifications — later

- 07:30 — "🏀 יש היום אימון ב־18:00."
- 16:30 — "עוד שעה וחצי. מים, נעליים וגישה. תירוצים אפשר להשאיר בבית 😄"

## 53. Future sports

כשיתווסף ענף שני לא משנים core architecture.
- Football: Penalty Shooting (`MADE_ATTEMPTS`), 20m Sprint (`TIME`), Passing Accuracy (`MADE_ATTEMPTS`)
- Surfing: Ride Duration (`DURATION`), Wave Count (`REPETITIONS`), Maneuver (`RATING`)

אותם Child, Exercise, Session, Set, Attempt, Result, Graphs, History.

## 54. Important multi-sport rule

לא להפוך את האפליקציה לכללית מדי עכשיו. Basketball-specific screens מותר ואף רצוי לבנות (Shooting Screen עם MADE / MISS עדיף בהרבה על GenericMeasurementForm).

**GENERIC DOMAIN — SPECIALIZED UX.**

## 55. Development roadmap

See [ROADMAP.md](./ROADMAP.md).

## 56. True MVP

`Child → Basketball Exercise → Quick Training → 5-4-3-2-1 → Whistle → Timer OR Shooting → Result → Edit → Save → History → Graph` — זה כבר מוצר שאפשר לקחת למגרש.

**Revised 2026-10-04:** the True MVP is defined by capabilities, not slice numbers, in Hebrew and English. Required MVP product capabilities: Player Profile, Self-Assessment, Calendar Foundation, Exercise Model / Library, Training Engine, usable Calendar UI + Calendar ↔ Training, Basketball Measurements & Shooting, Quick Training, Baseline, Reassessment, Basic Progress. Required enabling infrastructure (not a user-facing capability): Cloud Foundation. The authoritative lists are in ROADMAP ("True MVP").

## 57. What we are not building yet

AI, Wearables, Apple Health, Health Connect, Camera analysis, Automatic shot detection, Automatic sprint detection, Social network, Leaderboards, Coach marketplace, Advanced nutrition, Complex recovery algorithm, Video analysis, Cloud AI speech.

Also not building (approved 2026-10-02): weight collection in V1, ideal-weight / weight scores / weight-loss targets / calorie goals, body-comparison messaging, normative age-percentile scoring or labels such as "elite" / "below average", a self-assessment "gap score", separate U9/U12/U15 baseline engines, a sport plugin system.

## 58. Development quality rule

כל Phase: `Implement → Test → Run → Prove → Update PROJECT_STATE.md → STOP`. אין מעבר אוטומטי לשלב הבא.

## 59. Repository documents

`CLAUDE.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, `docs/ROADMAP.md`, `docs/PROJECT_STATE.md`.

## 60. Document governance

- **PRODUCT_SPEC** — Controlled. Claude does not redefine the product.
- **ARCHITECTURE** — Controlled. Claude may propose changes when evidence requires them; must not silently change approved architecture.
- **ROADMAP** — Controlled. Where the project is going. Not rewritten after every phase.
- **PROJECT_STATE** — Living document. Updated after every completed slice. Where we are now.

## 61. Project state report

After every phase record: Status, Files changed, DB changes, Tests, Commands, PASS / FAIL counts, Runtime validation, Android validation, iOS impact, Known limitations, Next proposed phase.

## 62. Proof first

Never report "Works." Report evidence, e.g. `Unit Tests: 46 / 46 PASS`, `Android runtime: Verified on device`, `Sprint: 5-4-3-2-1 → whistle → timer → stop → edit → save verified`, `Persistence: App restarted and result remained`, `Sync: Offline entry uploaded once after network restoration`.

## 63. Product north star

פתח את האפליקציה. בחר ילד. Quick Training. Free Throws. MADE. MISS. MADE… Save.
Coach: "16/20. יפה. ארבע הזריקות החסרות רשומות לאימון הבא. 🏀"
ואז 20m Sprint. 5 4 3 2 1 📣 RUN. STOP. 4.31. 🏆 "עכשיו כבר אין מה להתווכח עם השעון."

זה המוצר שאנחנו בונים. לא מערכת ניהול ספורט. **כלי אימון אמיתי.**

---

# Approved additions — 2026-10-02

> Owner-approved product decisions. Same CONTROLLED status as the sections above.

## 64. Languages and direction

- V1 supports **Hebrew** and **English**.
- **Default language: Hebrew.** A fresh install starts in Hebrew even when the device OS is English.
- Hebrew UI is **RTL**; English UI is **LTR**. One screen implementation serves both — no separate Hebrew/English screens.
- If switching between RTL and LTR requires an app reload, that is acceptable. No brittle layout hacks to force instant switching.
- All user-facing strings go through one localization layer; no visible text hard-coded in feature screens. Both languages stay key-compatible.
- Sports measurements stay naturally readable in Hebrew: `18/20`, `80%`, `4.38`, `00:45`, `20m` keep their left-to-right logical order inside RTL text.
- RTL must be validated on a physical Android device; iOS inherits the same localization architecture.

## 65. Player profile — V1 (revised 2026-10-04)

**Principle:** create the athlete quickly. The profile records *who the athlete is* and *which sport(s) they play*; detailed performance information comes later from Self-Assessment (§67), Baseline (§68) and real training results — Player creation is never an assessment.

**Personal information (every player):**

- Name — required
- Date of birth — required; source of truth → calculated age (never stored as the truth — §13). Entered manually as day / month / year, or with a native date picker that fills the same day / month / year fields (one value, not two). Future dates are not allowed.
- Height — optional, whole centimetres, current value only

**Sport:**

- A player **may exist without any sport.** Sport assignment is optional and can be added later.
- Basketball is currently the only selectable sport. No other sport is offered, listed or advertised until it has a real implemented experience. (The data model may support several sports before the product exposes them.)
- Once Basketball has been saved for a player it cannot be removed in Slice 1.1 (no sport removal / archive workflow yet).

**Basketball details** (only when Basketball is selected; every field optional; "You can update these details later"):

- Primary position — PG · רכז, SG · קלע, SF · סמול פורוורד, PF · פאוור פורוורד, C · סנטר, כמה עמדות (Multiple), לא בטוח (Not sure)
- Secondary position — shown only when the primary is PG, SG, SF, PF or C; choices are PG, SG, SF, PF, C plus an explicit **ללא / None** (= no secondary position, stored as empty — not a separate code). When the primary becomes empty, Multiple or Not sure, the secondary is cleared and hidden. It must differ from the primary.
- Dominant hand — Right / Left / Both

**Not collected by the V1 Player form:** Basketball experience and approximate weekly training frequency (removed 2026-10-04; weekly training is expected to come from the future Calendar, experience from Self-Assessment / Baseline). Values already stored by earlier builds are preserved, not deleted. Also not in V1: weight (§66), avatar and active/inactive (§12; deferred).

**Known limitation:** the native date picker follows the device language, not the app language. Accepted for V1.

## 66. Weight — not collected in V1

The product is used with children. Weight is intentionally **not** part of the V1 profile or onboarding.

If ever added later it must be optional, parent-only, never part of a performance score and never a body/weight target. Never: ideal weight, weight score, weight-loss target, calorie goal, body-comparison messaging.

Possible future optional metric: wingspan (not in V1).

## 67. Self-assessment

- After the player profile, the player completes a **short** structured self-assessment: about 5–6 basketball categories. Initial candidates: Shooting, Ball Handling, Passing, Finishing, Defense, Athleticism / Speed (final list decided 2026-10-04, below).
- Each category rated **1–5** with large radio/button-style choices. No free text in V1.
- Meaning: **how the player sees themselves.** It is not objective performance and is stored separately from measured results.
- **Repeatable:** taken again at reassessment, history preserved (e.g. Ball Handling 2/5 → 4/5) and may be shown *alongside* measured improvement.
- Never: automatic performance scores from self-assessment, converting objective measurements to 1–5, or a "gap score" between self-view and measurements.

### Slice 1.2 contract (approved 2026-10-04 — not implemented)

**Categories** (Basketball, subjective; never objective measurements):

| Code | Hebrew | English |
|---|---|---|
| `SHOOTING` | קליעה | Shooting |
| `BALL_HANDLING` | כדרור | Ball Handling |
| `PASSING` | מסירות | Passing |
| `FINISHING` | סיומת ליד הסל | Finishing |
| `DEFENSE` | הגנה | Defense |
| `SPEED` | מהירות ותנועה | Speed & Movement |

**Answers:**

- Every category must be answered. The scale is exactly **1–5** (whole numbers); 0 and an empty answer are not valid. No "Not sure" option in Slice 1.2.
- A partially completed assessment is **never saved.** Saving with unanswered categories shows a gentle localized message, keeps every rating already chosen and writes nothing.

**Scale and wording:**

- Large, accessible buttons `1 2 3 4 5`. The numeric row stays **left-to-right in both languages** (1 on the left, 5 on the right), like other sports values (§64); the rest of a Hebrew screen stays RTL. Accessibility reads the category, the selected rating and the maximum.
- Explanatory anchors at the two ends only — 1: "יש לי הרבה מקום להשתפר" / "Lots of room to improve"; 5: "זו אחת החוזקות שלי" / "One of my strengths".
- The athlete is addressed in gender-neutral first person where possible (e.g. "הקליעה שלי"), not masculine/feminine second person. Never "bad", "weak", "beginner", body comparison or shame-based wording (§69).

**Entry point:** the existing Player Edit screen. A Basketball player gets a separate Self-Assessment section, outside the personal and sport profile fields. A player without Basketball sees no Self-Assessment at all (no disabled placeholder, no non-Basketball categories). No "take the assessment now?" prompt after creating a player in Slice 1.2.

**Saved assessments are immutable:** no edit, no delete. Taking another assessment creates a new one; older ones never change. Several assessments on the same day are allowed, so a mistaken one is followed by a new one and history is kept.

**History:** newest first; each assessment shows its **local date and local time** (device timezone, never UTC) and every category with its `n/5`. No total, average, overall grade, arrows, good/bad colours, side-by-side comparison or AI interpretation in Slice 1.2 — comparison belongs to later Progress work.

**Not in Slice 1.2:** player deletion (a recorded product gap), cloud / sync, non-Basketball assessments.

## 68. Baseline and reassessment

- **Baseline is a use of the Training Engine, not a second measurement system.** Baseline, normal training, Quick Training and reassessment all record results through the same session → exercise → set → attempt → result pipeline and feed the same history and graphs. Same timer, same MADE/MISS, same manual input.
- Session purposes are **Training, Baseline, Reassessment**. Quick Training is a fast way to *start* a session, not a separate purpose — it records ordinary training.
- Baseline V1 is **small** (not a combine). Candidate areas: standing vertical jump (manual input), 10m or 20m sprint (multiple attempts), one timed dribble/slalom test, one or two shooting tests such as free throws. Exact test set is an open decision.
- **Order matters** — high-intensity tests while fresh: 1. Jump · 2. Sprint · 3. Agility · 4. Ball Handling · 5. Shooting.
- A baseline may be completed in **one or several sessions** (younger players, fatigue).
- **One** basketball baseline template; small configurable variations by age (shot count, distance, drill duration, rest). No normative percentiles, no "elite / below average" labels.
- **Player vs. their own baseline** is the primary comparison.
- The original baseline is **never overwritten**. Reassessment repeats the same baseline; progress can show baseline, training progression and reassessment from the same result stream (e.g. 20m sprint: baseline 4.34 → training 4.27, 4.20 → reassessment 4.08).

## 69. Coaching guardrails

Encourage: consistency, effort, technique, gradual progress, confidence, recovery, healthy competition, enjoyment.

Never encourage: shame, punishment, body comparison, sibling ranking, extreme training, training through pain, unsafe conditioning.

## 70. Open product decisions

Not decided yet — implementation must keep these configurable and ask the owner:

- Exact Baseline V1 exercises, attempt counts and rest.
- Baseline split rules by age (when to split across sessions; per-age variations).
- Shooting PB minimum attempt volume (§27).
- Sprint / manual-timer PB significance threshold (§24).
- App theme behaviour (light only / dark / follow system).

Decided 2026-10-04 (moved out of this list): final self-assessment categories and their Hebrew/English wording (§67).

## 71. Planning around real life (approved 2026-10-04 — not implemented)

- **Available time is not automatically appropriate training time.** Gals Coacher plans around the athlete's real life: school, team practices, games, personal training, unavailable time, sleep / recovery and training load are inputs to planning — not just empty calendar slots. A free slot alone must never imply "do a hard workout now"; this matters especially for young athletes.
- **What was planned is not what happened.** A calendar entry (planned) and a training session (actual) are different things: planned + completed, planned + skipped and unplanned + completed must all be representable.
- **Facts come first.** Recommendations and any future AI explain, suggest and summarize; they never redefine facts such as the schedule, game times, availability, the player's identity or recorded results.
