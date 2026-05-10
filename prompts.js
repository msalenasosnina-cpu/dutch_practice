// api/_lib/prompts.js
// All LLM prompts for exercise generation, centralized.
// v2.2.1
//   - Schema strictly matches guardrails.js: sentence / question / options / correct_index / translation_en
//   - English UI only — no translation_ru
//   - Topic-specific rules for 2.5 / 2.6 / 2.7 / 2.8
//   - avoidSentences injected into prompt to prevent intra-session repeats
//   - Fixed: scheidbare werkwoorden require TWO gaps and "stem | prefix" answer
//   - Fixed: vast voorzetsel — gap is the preposition only; distractors are single prepositions
//   - Fixed: multiple-choice distractors must be grammatically valid (no "Zouden jij" etc.)

export const PROMPT_VERSION = 'v2.2.1';

// ---------- Topic-specific guidance ----------

const TOPIC_RULES = {
  '2.5': `
TOPIC RULE — "Zou" (conditional "would"):
- Conjugation: ik zou / jij zou / hij/zij/het zou / u zou / wij zouden / jullie zouden / zij zouden.
- IMPORTANT: with "jij/je/u/hij/zij(sg)/het" the form is "zou" — NEVER "zouden".
- Used for polite requests: "Zou jij ... kunnen?" / "Zou u ... willen?"
- Used for hypotheticals: "Ik zou graag ..."

DISTRACTOR RULES (multiple choice):
- All four options MUST be grammatically valid Dutch on their own.
- Good distractor pool (single forms): "kan", "kun", "wil", "wilt", "moet", "mag", "ga".
- NEVER produce these broken forms as options:
  • "Zouden jij" / "Zouden je" / "Zouden hij" (subject-verb mismatch)
  • "Wil jij ... kunnen" / "Zal jij ... kunnen" (awkward modal stacking)
  • "Moeten hij" / "Willen jij" / "Kunnen u" (wrong agreement)
- Distractors are wrong because of MEANING in the specific sentence, not because the form itself is broken.
`,

  '2.6': `
TOPIC RULE — Modal verbs (kunnen, mogen, moeten, willen, zullen):
- Each modal has its own conjugation. Use only correct forms.
- Modal + INFINITIVE at end of clause: "Ik wil naar huis gaan."
- DO NOT chain two modals randomly: "wil kunnen helpen" is awkward; "kan helpen" is natural.

DISTRACTOR RULES (multiple choice):
- Each distractor must be a valid modal form on its own.
- NEVER mix subject-verb errors into distractors ("zouden jij", "moeten hij").
- Distractors should differ in MEANING (kan vs mag vs moet vs wil), not be broken grammar.
- All options must be UNIQUE.
`,

  '2.7': `
TOPIC RULE — Scheidbare werkwoorden (separable verbs: opbellen, meenemen, opstaan, aankomen, uitgaan, meegaan, opruimen, afmaken, etc.):
- In a main clause (present/past), the verb SPLITS: prefix goes to the END of the clause.
  Example: "opbellen" → "Ik bel mijn moeder op."

FILL-GAP RULES (CRITICAL — this is the whole point of the topic):
- The "sentence" field MUST contain EXACTLY TWO gaps "___":
  • first gap = conjugated stem (right after subject)
  • second gap = the prefix (at the end of the clause, before final punctuation)
- Example sentence: "Ik ___ mijn moeder elke avond ___."
- The "answer" field MUST be both parts joined by " | " in order of appearance.
  Example answer: "bel | op"
- NEVER produce a single-gap fill-gap exercise for this topic.

MULTIPLE-CHOICE RULES:
- "sentence" still has TWO gaps "___ ... ___".
- Each option is a "stem ... prefix" pair shown as one string with " ... " separator.
  Example options: ["bel ... op", "neem ... mee", "sta ... op", "kom ... aan"]
- The correct option is the one that fits the meaning.
`,

  '2.8': `
TOPIC RULE — Werkwoorden met vast voorzetsel (verbs with fixed preposition):
Common pairs: houden van, denken aan, wachten op, kijken naar, luisteren naar, praten over, vragen naar, zoeken naar, bang zijn voor, blij zijn met, geloven in, dromen van, lachen om, beginnen met, stoppen met.

FILL-GAP RULES (CRITICAL):
- The gap "___" is ALWAYS the PREPOSITION — never the verb, never the noun.
- The "sentence" MUST already contain the verb (conjugated) AND a noun/object. Only the preposition is missing.
- The "answer" is a SINGLE preposition: van, aan, op, naar, over, voor, met, in, uit, bij, door, om, tegen.
- The sentence MUST contain at least one word from the user's vocabulary list (use it as the object/topic).
- Try to use a DIFFERENT vocabulary word in each generated sentence (vary across the session).
- Example sentence: "Ik houd ___ muziek."  → answer: "van"
- Example sentence: "Wij wachten ___ de bus."  → answer: "op"

MULTIPLE-CHOICE RULES:
- All four options MUST be SINGLE prepositions from the list above.
- NEVER include verb+preposition combinations like "houden van" — only "van".
- NEVER include a preposition as a distractor if it ALREADY appears elsewhere in the sentence.
  Bad example: sentence "Zij ___ van muziek en van sport" with option "houden van" — both errors at once.
- All options must be UNIQUE.
`,
};

function topicRuleFor(topicCode) {
  const code = String(topicCode || '').split(/[\s–-]/)[0].trim();
  return TOPIC_RULES[code] || '';
}

// ---------- Anti-repetition block ----------

function antiRepetitionBlock(avoidSentences = []) {
  if (!avoidSentences || avoidSentences.length === 0) return '';
  const list = avoidSentences
    .slice(0, 15)
    .map((s, i) => `  ${i + 1}. ${s}`)
    .join('\n');
  return `
DO NOT REPEAT — these sentences were ALREADY shown to the user.
Generate a SUBSTANTIALLY different sentence: different subject, different verb, different object, different structure.
Paraphrases are forbidden.

Already shown:
${list}
`;
}

// ---------- Builders ----------

function buildFillGap({ topic, topicTitle, vocabulary, grammarContext, avoidSentences }) {
  const code = String(topic || '').split(/[\s–-]/)[0].trim();
  const topicRule = topicRuleFor(code);
  const isScheidbaar = code === '2.7';
  const isVastVoorzetsel = code === '2.8';

  const gapInstruction = isScheidbaar
    ? `IMPORTANT — this topic is "scheidbare werkwoorden". The "sentence" MUST contain TWO gaps "___":
- first gap = conjugated verb stem (right after subject)
- second gap = the separable prefix (at the END of the clause)
The "answer" field MUST be both parts joined by " | " in order of appearance, e.g. "bel | op".
NEVER output a single-gap exercise for this topic.`
    : isVastVoorzetsel
    ? `IMPORTANT — this topic is "werkwoorden met vast voorzetsel". The gap "___" MUST be the preposition only.
The verb (conjugated) and the object MUST already be in the sentence. Only the preposition is missing.
The sentence MUST contain at least one word from the user's vocabulary list (use it as the object).
Try to vary the vocabulary word across exercises — pick a different one when possible.
The "answer" is a single preposition (van, aan, op, naar, over, voor, met, in, uit, bij, door, om, tegen).`
    : `The "sentence" field must contain exactly ONE gap "___" at the position the user must fill.
The "answer" field is the single word or short phrase that fits the gap.`;

  const system = `You are a Nederlandse taaldocent for A1-A2 learners. Generate ONE fill-in-the-gap exercise.

Output ONLY a JSON object — no prose, no markdown fences. Start with { and end with }.

Schema:
{
  "type": "fill_gap",
  "sentence": "<Dutch sentence with ___ for the gap(s)>",
  "answer": "<correct fill (or 'part1 | part2' for separable verbs)>",
  "translation_en": "<full English translation of the sentence>",
  "hint": "<short hint in English, max 12 words>"
}

${gapInstruction}

GENERAL RULES:
- A1–A2 vocabulary only.
- No perfectum / imperfectum / passief unless the topic explicitly requires it.
- Sentence must be natural Dutch.
- "answer" MUST NOT be empty.
- Do NOT include cyrillic characters anywhere.
${topicRule}`;

  const userMsg = `Grammaticaonderwerp: ${topic} – ${topicTitle}

User's vocabulary list (use words from here when natural):
${vocabulary || '(empty — use general A1 vocabulary)'}

Grammar reference:
${grammarContext || '(use general A1-A2 knowledge)'}
${antiRepetitionBlock(avoidSentences)}
Generate the JSON now.`;

  return { system, user: userMsg };
}

function buildMultipleChoice({ topic, topicTitle, vocabulary, grammarContext, avoidSentences }) {
  const code = String(topic || '').split(/[\s–-]/)[0].trim();
  const topicRule = topicRuleFor(code);
  const isScheidbaar = code === '2.7';
  const isVastVoorzetsel = code === '2.8';

  const optionsInstruction = isScheidbaar
    ? `For separable verbs: each option is a "stem ... prefix" pair (e.g. "bel ... op", "neem ... mee").
The "sentence" must contain TWO gaps "___ ... ___" and the correct option fills BOTH.`
    : isVastVoorzetsel
    ? `For verbs with fixed preposition: ALL four options MUST be single prepositions (van, aan, op, naar, over, voor, met, in, uit, bij, door, om).
The gap is the preposition only. The verb and object MUST already be in the sentence.
NEVER include the verb in options. NEVER include verb+preposition combos like "houden van".
NEVER include a preposition as a distractor if it ALREADY appears elsewhere in the sentence.`
    : `Each option must be a SINGLE Dutch word or short phrase that could grammatically fit the gap.
Each option must be grammatically VALID on its own — distractors are wrong only because of MEANING for THIS sentence.
NEVER produce broken forms as distractors:
  • "Zouden jij" / "Zouden je" / "Zouden hij" (subject-verb mismatch — jij takes "zou")
  • "Wil jij ... kunnen" / "Zal jij ... kunnen" (awkward modal stacking)
  • "Moeten hij" / "Willen jij" / "Kunnen u" (wrong agreement)`;

  const system = `You are a Nederlandse taaldocent for A1-A2 learners. Generate ONE multiple-choice exercise.

Output ONLY a JSON object — no prose, no markdown fences. Start with { and end with }.

Schema:
{
  "type": "multiple_choice",
  "question": "<short instruction in English, e.g. 'Choose the correct form'>",
  "sentence": "<Dutch sentence with ___ for the gap>",
  "options": ["<opt1>", "<opt2>", "<opt3>", "<opt4>"],
  "correct_index": <integer 0-3 — the index in 'options' of the correct answer>,
  "translation_en": "<full English translation of the sentence with the correct answer filled in>",
  "hint": "<short hint in English, max 12 words>"
}

${optionsInstruction}

CRITICAL RULES:
- "correct_index" is a NUMBER (integer 0..options.length-1), NOT the answer text.
- All options must be UNIQUE.
- All options must be grammatically VALID Dutch in isolation.
- Do NOT include cyrillic characters anywhere.

GENERAL RULES:
- A1–A2 vocabulary only.
- "sentence" contains exactly ONE "___" gap (or two for scheidbare werkwoorden).
${topicRule}`;

  const userMsg = `Grammaticaonderwerp: ${topic} – ${topicTitle}

User's vocabulary list:
${vocabulary || '(empty — use general A1 vocabulary)'}

Grammar reference:
${grammarContext || '(use general A1-A2 knowledge)'}
${antiRepetitionBlock(avoidSentences)}
Generate the JSON now.`;

  return { system, user: userMsg };
}

function buildSentenceBuilding({ topic, topicTitle, vocabulary, grammarContext, avoidSentences }) {
  const code = String(topic || '').split(/[\s–-]/)[0].trim();
  const topicRule = topicRuleFor(code);

  const system = `You are a Nederlandse taaldocent for A1-A2 learners. Generate ONE sentence-building exercise.

Output ONLY a JSON object — no prose, no markdown fences. Start with { and end with }.

Schema:
{
  "type": "sentence_building",
  "prompt": "<word cues separated by ' / ', e.g. 'ik / gaan / school / elke dag'>",
  "expected": "<the full correct Dutch sentence, capitalized, ending with .!?>",
  "alternatives": ["<optional alternative correct sentences>"],
  "translation_en": "<full English translation of the expected sentence>",
  "hint": "<short hint in English, max 12 words>"
}

RULES:
- A1–A2 vocabulary only.
- "expected" must START with a capital and END with .!?
- "prompt" gives word cues in base form (infinitive verbs, no conjugation).
- Cues should imply ONE clear correct sentence.
- "alternatives" is optional but useful for free word-order Dutch sentences.
- Do NOT include cyrillic characters in any Dutch field.
${topicRule}`;

  const userMsg = `Grammaticaonderwerp: ${topic} – ${topicTitle}

User's vocabulary list:
${vocabulary || '(empty — use general A1 vocabulary)'}

Grammar reference:
${grammarContext || '(use general A1-A2 knowledge)'}
${antiRepetitionBlock(avoidSentences)}
Generate the JSON now.`;

  return { system, user: userMsg };
}

// ---------- Public API ----------

export const PROMPTS = {
  fill_gap: buildFillGap,
  multiple_choice: buildMultipleChoice,
  sentence_building: buildSentenceBuilding,
};
