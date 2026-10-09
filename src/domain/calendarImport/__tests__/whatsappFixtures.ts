/**
 * The owner's REAL WhatsApp weekly schedules (CAL-TEXT-IMPORT-001, 2026-10-09).
 * Permanent regression inputs for the parser (Jest) and, from 001C, for the
 * Python Product QA (CTI-01…04). Exact text — emoji, geresh / gershayim and
 * trailing spaces included. Never "tidy" them.
 */

/** Example 1 — four sessions, one message-wide location. */
export const WHATSAPP_EXAMPLE_1 = `חבר׳ה שבוע טובבב 🤩 אני חזרתי לארץ 🛬
מצרף לכם לו״ז לשבוע הקרוב 🏀
יום שני 18:40-20:10

יום רביעי 17:10-18:40

יום חמישי 18:40-20:10

יום שישי 14:30-16:00
כל האימונים בעין כרמל 💫
מחכה לראות אתכם 💪🏽💙`;

/** Example 2 — three sessions; Tuesday has a start time only (end must NOT be invented). */
export const WHATSAPP_EXAMPLE_2 = `שבוע מבורך

לו״ז שבועי

ראשון- אחרי בית ספר 15:00 עד 16:30

שלישי-משחק אימון נגד העומר בעין כרמל ב 16:30

רביעי- אחרי בית ספר 14:10 עד 15:40

בשורות טובות אמן.`;
