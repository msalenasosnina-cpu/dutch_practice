// api/_lib/guardrails.js

const INJECTION_PATTERNS = [
  /ignore\s+(previous|prior|all|above)\s+(instructions?|prompts?|rules?)/i,
  /disregard\s+(previous|prior|all|above)/i,
  /forget\s+(everything|all|previous|your)/i,
  /you\s+are\s+now\s+/i,
  /new\s+instructions?:?/i,
  /system\s*:\s*/i,
  /\[INST\]/i,
  /<\|.*?\|>/,
  /игнорируй\s+(все|предыдущие|инструкции)/i,
  /забудь\s+(все|предыдущие|инструкции)/i,
  /ты\s+теперь\s+/i,
  /новая\s+инструкция/i,
  /negeer\s+(alle|vorige)/i,
  /vergeet\s+(alle|vorige)/i,
];

const MAX_TOPIC_LENGTH = 30;
const MAX_WORD_LENGTH = 50;

// Whitelist of topic codes from grammar_rules (matches schema.sql)
const ALLOWED_TOPIC_CODES = new Set([
  '1.1', '1.2', '1.3', '1.4',
  '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '2.9', '2.10',
  '3.1', '3.2',
  '4',
  '5',
  '6.1', '6.2',
  '7.1', '7.2',
  '8.1', '8.2', '8.3', '8.5', '8.6', '8.7',
  '9.1', '9.2', '9.3', '9.4', '9.5', '9.6', '9.7', '9.8',
]);

const ALLOWED_MAIN_TOPICS = new Set([
  'voornaamwoorden',
  'werkwoorden',
  'zelfstandig_naamwoord',
  'bijvoeglijk_naamwoord',
  'vergelijken',
  'voorzetsels',
  'bijwoorden',
  'voegwoorden',
  'zinnen',
]);

export function sanitizeTopicCode(code) {
  if (typeof code !== 'string') {
    throw new GuardrailError('Topic code must be a string', 'INVALID_TYPE');
  }
  const trimmed = code.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TOPIC_LENGTH) {
    throw new GuardrailError('Topic code length out of range', 'INVALID_LENGTH');
  }
  if (!ALLOWED_TOPIC_CODES.has(trimmed)) {
    throw new GuardrailError(`Topic code "${trimmed}" not allowed`, 'TOPIC_NOT_ALLOWED');
  }
  return trimmed;
}

export function sanitizeMainTopic(topic) {
  if (typeof topic !== 'string') {
    throw new GuardrailError('Main topic must be a string', 'INVALID_TYPE');
  }
  const trimmed = topic.trim().toLowerCase();
  if (!ALLOWED_MAIN_TOPICS.has(trimmed)) {
    throw new GuardrailError(`Main topic "${trimmed}" not allowed`, 'TOPIC_NOT_ALLOWED');
  }
  return trimmed;
}

export function sanitizeWord(word) {
  if (typeof word !== 'string') {
    throw new GuardrailError('Word must be a string', 'INVALID_TYPE');
  }
  const trimmed = word.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_WORD_LENGTH) {
    throw new GuardrailError('Word length out of range', 'INVALID_LENGTH');
  }
  if (!/^[\p{L}\s\-']+$/u.test(trimmed)) {
    throw new GuardrailError('Word contains invalid characters', 'INVALID_CHARS');
  }
  // Reject obvious phrases (>3 tokens). Real entries are 1-3 words: "te zijn", "een kop koffie".
  const tokenCount = trimmed.split(/\s+/).length;
  if (tokenCount > 3) {
    throw new GuardrailError('Too many words — enter a single word or short phrase', 'INVALID_CHARS');
  }
  return trimmed;
}

export function detectInjection(text) {
  if (typeof text !== 'string') return false;
  return INJECTION_PATTERNS.some((p) => p.test(text));
}

export function sanitizeUserAnswer(answer) {
  if (typeof answer !== 'string') {
    throw new GuardrailError('Answer must be a string', 'INVALID_TYPE');
  }
  if (answer.length > 500) {
    throw new GuardrailError('Answer too long', 'INVALID_LENGTH');
  }
  if (detectInjection(answer)) {
    return `[user input]: ${answer}`;
  }
  return answer;
}

// ============================================
// OUTPUT GUARDRAILS
// ============================================

function isLikelyDutch(text) {
  if (!text || typeof text !== 'string') return false;
  const letters = text.match(/\p{L}/gu) || [];
  if (letters.length === 0) return false;
  const latin = text.match(/[a-zA-Z]/g) || [];
  return latin.length / letters.length >= 0.7;
}

function hasNoCyrillic(text) {
  if (typeof text !== 'string') return true;
  return !/[\u0400-\u04FF]/.test(text);
}

export function validateExercise(type, data) {
  const errors = [];

  if (!data || typeof data !== 'object') {
    return { valid: false, errors: ['Not an object'] };
  }

  switch (type) {
    case 'fill_gap': {
      const required = ['sentence', 'answer', 'translation_en'];
      for (const f of required) {
        if (!data[f]) errors.push(`Missing field: ${f}`);
      }
      if (data.sentence && !data.sentence.includes('___')) {
        errors.push('sentence must contain "___" placeholder');
      }
      if (data.sentence && !isLikelyDutch(data.sentence.replace('___', ''))) {
        errors.push('sentence is not in Dutch');
      }
      if (data.answer && !hasNoCyrillic(data.answer)) {
        errors.push('answer contains cyrillic — must be Dutch');
      }
      break;
    }
    case 'multiple_choice': {
      const required = ['question', 'sentence', 'options', 'correct_index', 'translation_en'];
      for (const f of required) {
        if (data[f] === undefined || data[f] === null) errors.push(`Missing field: ${f}`);
      }
      if (!Array.isArray(data.options) || data.options.length < 2 || data.options.length > 6) {
        errors.push('options must be array of 2-6 items');
      }
      if (
        typeof data.correct_index !== 'number' ||
        data.correct_index < 0 ||
        (Array.isArray(data.options) && data.correct_index >= data.options.length)
      ) {
        errors.push('correct_index out of range');
      }
      if (Array.isArray(data.options)) {
        // Unique check (normalized: lowercase, no punctuation, trimmed)
        const norm = data.options.map((o) =>
          String(o).toLowerCase().replace(/[.,!?;:]/g, '').trim()
        );
        const set = new Set(norm);
        if (set.size !== norm.length) {
          errors.push('options must be unique (after normalization)');
        }
        for (const opt of data.options) {
          if (!hasNoCyrillic(opt)) {
            errors.push(`option "${opt}" contains cyrillic — must be Dutch`);
            break;
          }
        }
      }
      // Check that no option is just the question/sentence text repeated
      if (data.question && Array.isArray(data.options)) {
        for (const opt of data.options) {
          if (
            String(opt).length > 20 &&
            data.question.toLowerCase().includes(String(opt).toLowerCase())
          ) {
            errors.push(`option "${opt}" appears to contain question text`);
            break;
          }
        }
      }
      break;
    }
    case 'sentence_building': {
      const required = ['prompt', 'expected', 'translation_en'];
      for (const f of required) {
        if (!data[f]) errors.push(`Missing field: ${f}`);
      }
      if (data.expected && !isLikelyDutch(data.expected)) {
        errors.push('expected answer is not in Dutch');
      }
      if (data.alternatives && !Array.isArray(data.alternatives)) {
        errors.push('alternatives must be array');
      }
      break;
    }
    default:
      errors.push(`Unknown exercise type: ${type}`);
  }

  return { valid: errors.length === 0, errors };
}

export function validateTranslation(data) {
  const errors = [];
  if (!data || typeof data !== 'object') return { valid: false, errors: ['Not an object'] };
  if (!data.word_nl || !hasNoCyrillic(data.word_nl)) {
    errors.push('word_nl missing or contains cyrillic');
  }
  if (!data.word_en) {
    errors.push('word_en missing');
  }
  if (!data.word_ru) {
    errors.push('word_ru missing');
  }
  if (data.part_of_speech === 'noun' && !['de', 'het'].includes(data.article)) {
    errors.push('noun must have article "de" or "het"');
  }
  if (data.example_sentence && !isLikelyDutch(data.example_sentence)) {
    errors.push('example_sentence not in Dutch');
  }
  if (data.level && !['A1', 'A2'].includes(data.level)) {
    errors.push('level must be A1 or A2');
  }
  return { valid: errors.length === 0, errors };
}

// ============================================
// JSON parsing
// ============================================

export function parseJsonStrict(text) {
  if (typeof text !== 'string') throw new Error('Not a string');
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const first = cleaned.indexOf('{');
  const last = cleaned.lastIndexOf('}');
  if (first >= 0 && last > first) {
    cleaned = cleaned.slice(first, last + 1);
  }
  return JSON.parse(cleaned);
}

export class GuardrailError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'GuardrailError';
    this.code = code;
  }
}
