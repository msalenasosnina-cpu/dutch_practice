// api/_lib/difficulty.js
// Rule-based difficulty guardrail.
// Flags markers that are clearly above the requested level.

// Patterns that should NOT appear in A1-only exercises.
// We keep this conservative — only flag things that are clearly B1+ in the textbook.
const B1_PLUS_PATTERNS = [
  // Subjunctive / conditional
  /\bzou(den)?\b/i,
  // Past perfect / pluperfect ("had + p.p." in non-past contexts)
  /\bhadden?\s+\w+ge\w+/i,
  // Passive voice with "worden"
  /\b(wordt|worden|werd|werden)\s+\w*ge\w+/i,
  // Future perfect / complex tenses
  /\bzal\s+hebben\s+ge/i,
  /\bzullen\s+(hebben|zijn)\s+ge/i,
];

// Topics that are A1-only — for these we apply the strict blacklist.
// Topics 2.2 (perfectum), 2.3 (verleden), 2.5 (zou), 2.10 (passief), 8.3+ (complex conjunctions),
// 9.4-9.8 are A2 and naturally use these constructions, so we don't flag them.
const A1_STRICT_TOPICS = new Set([
  '1.1', '1.2', '1.3',  // basic pronouns
  '2.1',                // present tense
  '2.6',                // modals (A1)
  '3.1', '3.2',         // articles, plurals
  '4',                  // adjectives
  '6.1', '6.2',         // prepositions
  '7.1',                // niet/geen
  '8.1', '8.2',         // en/of, want/maar (A1)
  '9.1', '9.2', '9.3',  // word order, inversion, questions
]);

/**
 * Check if exercise text contains B1+ markers when topic should be A1.
 * Returns { ok: boolean, violations: string[] }.
 */
export function checkDifficulty(topicCode, exercise) {
  if (!A1_STRICT_TOPICS.has(topicCode)) {
    return { ok: true, violations: [] };
  }

  const text = collectAllDutchText(exercise);
  const violations = [];

  for (const pattern of B1_PLUS_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      violations.push(`B1+ pattern found: "${m[0]}"`);
    }
  }

  return { ok: violations.length === 0, violations };
}

function collectAllDutchText(exercise) {
  if (!exercise) return '';
  const parts = [];
  if (exercise.sentence) parts.push(exercise.sentence);
  if (exercise.expected) parts.push(exercise.expected);
  if (exercise.prompt) parts.push(exercise.prompt);
  if (Array.isArray(exercise.options)) parts.push(exercise.options.join(' '));
  if (Array.isArray(exercise.alternatives)) parts.push(exercise.alternatives.join(' '));
  return parts.join(' ');
}
