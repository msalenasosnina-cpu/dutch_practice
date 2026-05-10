// api/_lib/topic-structure.js
// Topic-specific structural validation, layered on top of schema validation in guardrails.js.
// Catches issues that the LLM tends to get wrong despite prompt instructions:
//   - 2.7 (scheidbare werkwoorden) → must have TWO gaps and "stem | prefix" answer
//   - 2.8 (vast voorzetsel) → answer must be a preposition; distractors must be prepositions;
//                              no preposition repeated between sentence and options
//   - 2.5 / 2.6 (modale werkwoorden) → no broken distractors like "Zouden jij"
//
// Schema reference (from guardrails.js):
//   fill_gap:        { sentence, answer, translation_en, hint? }
//   multiple_choice: { question, sentence, options[], correct_index:int, translation_en, hint? }
//   sentence_building: { prompt, expected, translation_en, alternatives?, hint? }

const PREPS = new Set([
  'van', 'aan', 'op', 'naar', 'over', 'voor', 'met', 'in', 'uit',
  'bij', 'door', 'tegen', 'om',
]);

const SEPARABLE_PREFIXES = new Set([
  'op', 'aan', 'af', 'mee', 'uit', 'in', 'over', 'door', 'na', 'om',
  'voor', 'terug', 'weg', 'thuis', 'binnen', 'buiten', 'samen', 'klaar',
  'dicht', 'open', 'vast', 'los',
]);

// Subject-verb pairs that are NEVER valid in standard Dutch.
const INVALID_SUBJECT_VERB_PATTERNS = [
  /\bzouden\s+(jij|je|u|hij|ze|zij|het)\b/i, // zouden jij → wrong (should be zou)
  /\bmoeten\s+(jij|je|u|hij|ze|zij|het)\b/i, // singular subject takes moet
  /\bwillen\s+(jij|je|u|hij)\b/i,            // jij/hij takes wil/wilt
  /\bkunnen\s+(jij|je|u|hij)\b/i,            // jij takes kan/kun/kunt
];

// Awkward modal stacking — "wil ... kunnen", "zal ... kunnen"
const AWKWARD_MODAL_STACKS = [
  /\bwil(?:t|len)?\s+\w+(?:\s+\w+){0,4}\s+kunnen\b/i,
  /\bzal(?:len)?\s+\w+(?:\s+\w+){0,4}\s+kunnen\b/i,
];

/**
 * Check if a single option is grammatically plausible in isolation.
 */
export function isOptionGrammaticallyValid(option) {
  if (!option || typeof option !== 'string') return { ok: false, reason: 'empty option' };
  const opt = option.trim();
  if (opt.length === 0) return { ok: false, reason: 'empty option' };

  for (const pat of INVALID_SUBJECT_VERB_PATTERNS) {
    if (pat.test(opt)) {
      return { ok: false, reason: `invalid subject-verb pair: "${opt}"` };
    }
  }
  for (const pat of AWKWARD_MODAL_STACKS) {
    if (pat.test(opt)) {
      return { ok: false, reason: `awkward modal stacking: "${opt}"` };
    }
  }
  return { ok: true };
}

/**
 * Returns the canonical Dutch sentence from an exercise object, regardless of type.
 */
function getSentence(exercise) {
  return exercise.sentence || exercise.expected || '';
}

/**
 * Get the "correct option" string from a multiple-choice exercise (using correct_index).
 */
function correctOption(exercise) {
  if (
    typeof exercise.correct_index === 'number' &&
    Array.isArray(exercise.options) &&
    exercise.correct_index >= 0 &&
    exercise.correct_index < exercise.options.length
  ) {
    return String(exercise.options[exercise.correct_index] || '').trim();
  }
  return '';
}

/**
 * Topic-specific structural validation.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function checkTopicStructure(exercise, topicCode) {
  const errors = [];
  const code = String(topicCode || '').split(/[\s–-]/)[0].trim();
  const sentence = getSentence(exercise);
  const options = Array.isArray(exercise.options) ? exercise.options : [];

  // ---- 2.7 — Scheidbare werkwoorden ----
  if (code === '2.7' && exercise.type === 'fill_gap') {
    const gapCount = (sentence.match(/___/g) || []).length;
    if (gapCount !== 2) {
      errors.push(
        `scheidbare_werkwoorden_two_gaps: expected exactly 2 "___" in sentence, got ${gapCount}`
      );
    }
    const answer = String(exercise.answer || '').trim();
    if (!answer.includes('|')) {
      errors.push(
        `scheidbare_werkwoorden_answer_format: answer must be "stem | prefix", got "${answer}"`
      );
    } else {
      const parts = answer.split('|').map((p) => p.trim()).filter(Boolean);
      if (parts.length !== 2) {
        errors.push(
          `scheidbare_werkwoorden_answer_parts: expected 2 parts joined by " | ", got ${parts.length}`
        );
      } else {
        const prefix = parts[1].toLowerCase();
        if (!SEPARABLE_PREFIXES.has(prefix)) {
          errors.push(
            `scheidbare_werkwoorden_unknown_prefix: "${prefix}" is not a recognized separable prefix`
          );
        }
      }
    }
  }

  if (code === '2.7' && exercise.type === 'multiple_choice') {
    const gapCount = (sentence.match(/___/g) || []).length;
    if (gapCount !== 2) {
      errors.push(
        `scheidbare_werkwoorden_mc_two_gaps: expected 2 "___" in sentence, got ${gapCount}`
      );
    }
  }

  // ---- 2.8 — Werkwoorden met vast voorzetsel ----
  if (code === '2.8' && exercise.type === 'fill_gap') {
    const ans = String(exercise.answer || '').trim().toLowerCase();
    if (!PREPS.has(ans)) {
      errors.push(
        `vast_voorzetsel_answer_must_be_preposition: expected one of [${[...PREPS].join(', ')}], got "${exercise.answer}"`
      );
    }
    // Make sure the answer-preposition isn't already in the sentence elsewhere
    const sentenceTokens = sentence
      .toLowerCase()
      .replace(/___/g, ' ')
      .replace(/[.,!?;:'"()]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    if (sentenceTokens.includes(ans)) {
      errors.push(
        `vast_voorzetsel_preposition_in_sentence: "${ans}" already appears in the sentence`
      );
    }
  }

  if (code === '2.8' && exercise.type === 'multiple_choice') {
    // All options must be single prepositions
    for (const opt of options) {
      const o = String(opt).trim().toLowerCase();
      if (!PREPS.has(o)) {
        errors.push(
          `vast_voorzetsel_option_not_preposition: option "${opt}" is not a single preposition from the allowed list`
        );
      }
    }
    // No distractor may already appear in the sentence
    const sentenceTokens = sentence
      .toLowerCase()
      .replace(/___/g, ' ')
      .replace(/[.,!?;:'"()]/g, ' ')
      .split(/\s+/)
      .filter(Boolean);
    const correct = correctOption(exercise).toLowerCase();
    for (const opt of options) {
      const o = String(opt).trim().toLowerCase();
      if (o !== correct && sentenceTokens.includes(o)) {
        errors.push(
          `vast_voorzetsel_distractor_in_sentence: distractor "${opt}" already appears in the sentence`
        );
      }
    }
  }

  // ---- 2.5 / 2.6 — Modale werkwoorden ----
  if ((code === '2.5' || code === '2.6') && exercise.type === 'multiple_choice') {
    for (const opt of options) {
      const check = isOptionGrammaticallyValid(opt);
      if (!check.ok) {
        errors.push(`modal_distractor_invalid: ${check.reason}`);
      }
    }
    // If the sentence has a singular subject, no plural modal form may appear as an option
    const subjectMatch = sentence.match(/\b(jij|je|u|hij|wij|we|jullie)\b/i);
    if (subjectMatch) {
      const subj = subjectMatch[1].toLowerCase();
      const isSingular = ['jij', 'je', 'u', 'hij'].includes(subj);
      if (isSingular) {
        for (const opt of options) {
          const o = String(opt).trim().toLowerCase();
          if (['zouden', 'moeten', 'willen', 'kunnen'].includes(o)) {
            errors.push(
              `modal_plural_form_with_singular_subject: option "${opt}" doesn't agree with subject "${subj}"`
            );
          }
        }
      }
    }
  }

  return { ok: errors.length === 0, errors };
}
