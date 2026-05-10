// api/_lib/topic-relevance.js
// Topic-relevance guardrail — RELAXED version.
// Only catches obviously wrong answers (e.g. noun where verb expected).

const VERB_AUX = new Set([
  'heeft', 'hebt', 'heb', 'hebben', 'is', 'zijn', 'ben', 'bent',
  'was', 'waren', 'had', 'hadden', 'word', 'wordt', 'worden',
  'zal', 'zult', 'zullen', 'zou', 'zouden',
]);

const COMMON_NOUNS = new Set([
  'huis', 'boek', 'tafel', 'stoel', 'auto', 'fiets', 'hond', 'kat',
  'man', 'vrouw', 'kind', 'tijd', 'dag', 'jaar', 'week', 'school',
  'water', 'koffie', 'thee', 'brood', 'kaas', 'feest', 'werk',
]);

/**
 * Extract the "answer" from an exercise regardless of type.
 * - fill_gap: ex.answer (the gap word)
 * - multiple_choice: ex.options[ex.correct_index] (the correct option)
 * Returns the answer string (lowercased, trimmed) or '' if extraction fails.
 */
function extractAnswer(type, exercise) {
  if (!exercise) return '';
  if (type === 'fill_gap') {
    return (exercise.answer || '').toString().toLowerCase().trim();
  }
  if (type === 'multiple_choice') {
    if (
      Array.isArray(exercise.options) &&
      Number.isInteger(exercise.correct_index) &&
      exercise.correct_index >= 0 &&
      exercise.correct_index < exercise.options.length
    ) {
      return String(exercise.options[exercise.correct_index] || '').toLowerCase().trim();
    }
    return '';
  }
  return '';
}

const RULES = {
  // 2.1 Tegenwoordige tijd — answer should be a verb form, not a noun.
  '2.1': {
    label: 'Present tense — answer must be a verb form',
    check: (type, exercise) => {
      const a = extractAnswer(type, exercise);
      if (!a) return { ok: true }; // can't verify — pass rather than block
      if (COMMON_NOUNS.has(a)) return { ok: false, reason: `"${a}" is a noun, not a verb` };
      if (a === 'de' || a === 'het' || a === 'een') return { ok: false, reason: `"${a}" is an article, not a verb` };
      return { ok: true };
    },
  },

  // 2.2 Voltooide tijd — answer is participle or auxiliary
  '2.2': {
    label: 'Perfect tense — answer must be participle or auxiliary',
    check: (type, exercise) => {
      const a = extractAnswer(type, exercise);
      if (!a) return { ok: true };
      if (VERB_AUX.has(a)) return { ok: true };
      if (/^ge[a-z]+/.test(a)) return { ok: true };
      if (/^(be|ver|ont|her|er)[a-z]+/.test(a) && /(d|t|en)$/.test(a)) return { ok: true };
      if (/[a-z]+(en|t|d)$/.test(a) && a.length >= 5) return { ok: true };
      if (COMMON_NOUNS.has(a)) return { ok: false, reason: `"${a}" is a noun` };
      return { ok: true };
    },
  },

  // 3.1 Lidwoord — must be "de" or "het"
  '3.1': {
    label: 'Article — answer must be "de" or "het"',
    check: (type, exercise) => {
      const a = extractAnswer(type, exercise);
      if (!a) return { ok: true };
      if (a === 'de' || a === 'het') return { ok: true };
      // For multiple_choice — at least the options should be article-related
      if (type === 'multiple_choice' && Array.isArray(exercise.options)) {
        const allArticle = exercise.options.every((o) => {
          const ol = String(o).toLowerCase().trim();
          return ol === 'de' || ol === 'het';
        });
        if (allArticle) return { ok: true };
      }
      return { ok: false, reason: `answer "${a}" must be "de" or "het"` };
    },
  },

  // 7.1 Niet/geen
  '7.1': {
    label: 'Negation — answer must be "niet" or "geen"',
    check: (type, exercise) => {
      const a = extractAnswer(type, exercise);
      if (!a) return { ok: true };
      if (a === 'niet' || a === 'geen') return { ok: true };
      if (type === 'multiple_choice' && Array.isArray(exercise.options)) {
        const both = exercise.options.map((o) => String(o).toLowerCase().trim());
        if (both.includes('niet') || both.includes('geen')) return { ok: true };
      }
      return { ok: false, reason: `answer "${a}" must be "niet" or "geen"` };
    },
  },

  // 8.1 En/of
  '8.1': {
    label: 'Conjunction — answer must be "en" or "of"',
    check: (type, exercise) => {
      const a = extractAnswer(type, exercise);
      if (!a) return { ok: true };
      if (a === 'en' || a === 'of') return { ok: true };
      if (type === 'multiple_choice' && Array.isArray(exercise.options)) {
        const lows = exercise.options.map((o) => String(o).toLowerCase().trim());
        if (lows.some((o) => o === 'en' || o === 'of')) return { ok: true };
      }
      return { ok: false, reason: `answer "${a}" must be "en" or "of"` };
    },
  },

  // 8.2 Want/maar
  '8.2': {
    label: 'Conjunction — answer must be "want" or "maar"',
    check: (type, exercise) => {
      const a = extractAnswer(type, exercise);
      if (!a) return { ok: true };
      if (a === 'want' || a === 'maar') return { ok: true };
      if (type === 'multiple_choice' && Array.isArray(exercise.options)) {
        const lows = exercise.options.map((o) => String(o).toLowerCase().trim());
        if (lows.some((o) => o === 'want' || o === 'maar')) return { ok: true };
      }
      return { ok: false, reason: `answer "${a}" must be "want" or "maar"` };
    },
  },

  // 8.3 Omdat/als
  '8.3': {
    label: 'Conjunction — answer must be "omdat" or "als"',
    check: (type, exercise) => {
      const a = extractAnswer(type, exercise);
      if (!a) return { ok: true };
      if (a === 'omdat' || a === 'als') return { ok: true };
      if (type === 'multiple_choice' && Array.isArray(exercise.options)) {
        const lows = exercise.options.map((o) => String(o).toLowerCase().trim());
        if (lows.some((o) => o === 'omdat' || o === 'als')) return { ok: true };
      }
      return { ok: false, reason: `answer "${a}" must be "omdat" or "als"` };
    },
  },
};

/**
 * Check whether an exercise actually tests the grammar phenomenon for its topic.
 * Only fill_gap and multiple_choice are checked.
 *
 * Philosophy: false negatives (passing bad exercise) are better than false positives
 * (rejecting good ones), because rejection causes user-facing latency.
 */
export function checkTopicRelevance(topicCode, type, exercise) {
  if (type === 'sentence_building') return { ok: true };
  const rule = RULES[topicCode];
  if (!rule) return { ok: true };
  const result = rule.check(type, exercise);
  return { ...result, label: rule.label };
}

export const TOPIC_RELEVANCE_RULES = Object.keys(RULES);
