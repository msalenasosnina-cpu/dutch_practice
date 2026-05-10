// api/_lib/output-guardrails.js

// Common Dutch function words that should always be allowed regardless of vocabulary.
// These are not "unknown" even if not in the user's word list.
const FUNCTION_WORDS = new Set([
  // Articles
  'de', 'het', 'een', "'n",
  // Subject pronouns
  'ik', 'jij', 'je', 'u', 'hij', 'zij', 'ze', 'wij', 'we', 'jullie',
  // Possessives
  'mijn', 'jouw', 'uw', 'zijn', 'haar', 'ons', 'onze', 'hun',
  // Demonstratives
  'deze', 'die', 'dit', 'dat',
  // Object/reflexive
  'me', 'mij', 'jou', 'hem', 'zich',
  // Auxiliary verbs (highly frequent — present and past forms)
  'is', 'ben', 'bent', 'zijn', 'was', 'waren',
  'heb', 'hebt', 'heeft', 'hebben', 'had', 'hadden',
  'word', 'wordt', 'worden', 'werd', 'werden',
  'zal', 'zult', 'zullen', 'zou', 'zouden',
  'kan', 'kun', 'kunt', 'kunnen', 'kon', 'konden',
  'mag', 'mogen', 'mocht', 'mochten',
  'moet', 'moeten', 'moest', 'moesten',
  'wil', 'wilt', 'willen', 'wilde', 'wilden', 'wou',
  'doe', 'doet', 'doen', 'deed', 'deden',
  'ga', 'gaat', 'gaan', 'ging', 'gingen',
  'kom', 'komt', 'komen', 'kwam', 'kwamen',
  // Negation
  'niet', 'geen', 'nooit',
  // Common conjunctions
  'en', 'of', 'maar', 'want', 'dus', 'omdat', 'als', 'dat', 'toen',
  // Common adverbs / particles
  'ook', 'al', 'nog', 'zo', 'zeer', 'heel', 'erg', 'wel', 'graag',
  'nu', 'dan', 'toen', 'hier', 'daar', 'er', 'waar', 'hoe', 'wat',
  'wie', 'wanneer', 'waarom', 'welke', 'welk',
  // Common prepositions
  'in', 'op', 'aan', 'bij', 'met', 'voor', 'achter', 'onder', 'boven',
  'naast', 'tussen', 'zonder', 'naar', 'van', 'uit', 'over', 'om',
  'tot', 'tegen', 'tijdens', 'na',
  // Common time / place
  'vandaag', 'morgen', 'gisteren', 'altijd', 'soms', 'vaak',
  // Numerals 0-20
  'nul', 'een', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht',
  'negen', 'tien', 'elf', 'twaalf', 'dertien', 'veertien', 'vijftien',
  'zestien', 'zeventien', 'achttien', 'negentien', 'twintig',
  // Particles for separable verbs
  'op', 'mee', 'aan', 'af', 'uit', 'door', 'over',
  // Te-infinitive marker
  'te',
]);

function tokenize(text) {
  if (!text) return [];
  return text
    .toLowerCase()
    .replace(/[.,!?;:'"„""]/g, ' ')
    .replace(/[-/]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && /^[\p{L}]+$/u.test(w));
}

/**
 * Check what fraction of content words in the exercise are NOT in the
 * provided vocabulary or our function-word whitelist.
 *
 * Returns { ratio: 0..1, unknown: string[], total: number }.
 * High ratio = many words the user may not know = bad for A1.
 */
export function checkVocabularyUsage(exercise, vocabularyWords) {
  const vocabSet = new Set(
    (vocabularyWords || []).map((w) =>
      typeof w === 'string' ? w.toLowerCase() : (w.word_nl || '').toLowerCase()
    )
  );

  // Collect all Dutch surface text from the exercise.
  const text = [
    exercise?.sentence || '',
    exercise?.expected || '',
    Array.isArray(exercise?.options) ? exercise.options.join(' ') : '',
    Array.isArray(exercise?.alternatives) ? exercise.alternatives.join(' ') : '',
  ].join(' ');

  const tokens = tokenize(text).filter((t) => t !== '___');

  if (tokens.length === 0) {
    return { ratio: 0, unknown: [], total: 0 };
  }

  const unknown = [];
  for (const tok of tokens) {
    if (FUNCTION_WORDS.has(tok)) continue;
    if (vocabSet.has(tok)) continue;
    // Try lemma-ish match: strip trailing -en, -t, -e, -s for stems
    const stem = tok.replace(/(en|t|e|s)$/, '');
    if (stem.length >= 3 && (vocabSet.has(stem) || FUNCTION_WORDS.has(stem))) continue;
    // Try matching against root form (if vocab has the verb infinitive)
    let matchedAsForm = false;
    for (const v of vocabSet) {
      if (v.length >= 4 && (v.startsWith(tok) || tok.startsWith(v))) {
        matchedAsForm = true;
        break;
      }
    }
    if (matchedAsForm) continue;
    unknown.push(tok);
  }

  return {
    ratio: unknown.length / tokens.length,
    unknown,
    total: tokens.length,
  };
}

/**
 * Detect language mixing — if a Dutch field contains English words
 * (other than proper nouns) we flag it.
 */
// Note: we exclude 'is' and 'had' — these are valid Dutch words too:
// - "is" = 3rd person sg of "zijn" (to be): "Hij is student"
// - "had" = 1st/3rd person past of "hebben": "Ik had geen tijd"
const COMMON_ENGLISH_INTRUDERS = new Set([
  'the', 'are', 'and', 'or', 'but', 'with', 'for', 'this', 'that',
  'have', 'has', 'will', 'would', 'should', 'could', 'about',
  'from', 'into', 'they', 'them', 'their', 'there', 'these', 'those',
  'because', 'before', 'after', 'while',
]);

export function detectLanguageMix(exercise) {
  const dutchFields = [
    exercise?.sentence,
    exercise?.expected,
    exercise?.prompt,
    ...(Array.isArray(exercise?.options) ? exercise.options : []),
  ].filter(Boolean);

  const intruders = [];
  for (const field of dutchFields) {
    const tokens = tokenize(field);
    for (const tok of tokens) {
      if (COMMON_ENGLISH_INTRUDERS.has(tok)) {
        intruders.push(tok);
      }
    }
  }
  return { ok: intruders.length === 0, intruders };
}

/**
 * Compute a normalized stem for fast dedup lookup.
 * First 4 alphanumeric tokens of the canonical sentence/prompt.
 */
export function exerciseStem(exercise, type) {
  let text = '';
  if (type === 'fill_gap') text = exercise.sentence || '';
  else if (type === 'multiple_choice') text = exercise.sentence || '';
  else if (type === 'sentence_building') text = exercise.expected || exercise.prompt || '';
  return tokenize(text).slice(0, 4).join(' ');
}

/**
 * Levenshtein-based string similarity (0..1, higher = more similar).
 */
function lev(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  const dp = Array(b.length + 1)
    .fill(0)
    .map((_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = i;
    for (let j = 1; j <= b.length; j++) {
      const cur =
        a[i - 1] === b[j - 1] ? dp[j - 1] : Math.min(dp[j - 1], dp[j], prev) + 1;
      dp[j - 1] = prev;
      prev = cur;
    }
    dp[b.length] = prev;
  }
  return dp[b.length];
}

function similarity(a, b) {
  const longer = a.length > b.length ? a : b;
  const shorter = a.length > b.length ? b : a;
  if (longer.length === 0) return 1;
  return (longer.length - lev(longer, shorter)) / longer.length;
}

/**
 * Check if a new exercise is too similar to any in recentExercises[].
 * recentExercises: [{ stem, prompt_or_sentence }]
 * Returns { ok: boolean, similarTo: string|null, score: number }.
 */
export function checkDuplicate(newStem, newCanonical, recentExercises, threshold = 0.85) {
  if (!recentExercises || recentExercises.length === 0) {
    return { ok: true, similarTo: null, score: 0 };
  }
  // Cheap stem match first
  for (const r of recentExercises) {
    if (r.stem && r.stem === newStem) {
      return { ok: false, similarTo: r.prompt_or_sentence, score: 1 };
    }
  }
  // Then full string similarity (only against recent ~15)
  const candidates = recentExercises.slice(0, 15);
  let best = { score: 0, text: null };
  for (const r of candidates) {
    const s = similarity(
      (newCanonical || '').toLowerCase(),
      (r.prompt_or_sentence || '').toLowerCase()
    );
    if (s > best.score) best = { score: s, text: r.prompt_or_sentence };
  }
  return {
    ok: best.score < threshold,
    similarTo: best.score >= threshold ? best.text : null,
    score: best.score,
  };
}
