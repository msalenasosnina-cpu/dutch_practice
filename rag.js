// api/_lib/rag.js
// Retrieves grammar context by topic_code.
// Returns an exact rule + (optionally) related rules from same topic_main as enrichment.

import { getSupabase } from './supabase.js';

export async function retrieveGrammarContext({ topicCode }) {
  const supabase = getSupabase();

  // 1) Exact rule for the requested topic_code
  const { data: exact, error: e1 } = await supabase
    .from('grammar_rules')
    .select('id, topic_main, topic_code, level, title, rule_text, examples')
    .eq('topic_code', topicCode)
    .single();

  if (e1 || !exact) {
    return {
      rules: [],
      title: null,
      context: '(No specific rule found — generate from general A1-A2 knowledge.)',
    };
  }

  // 2) Optional: related rules from same main topic (for richer context, max 1-2 extras)
  const { data: related } = await supabase
    .from('grammar_rules')
    .select('id, topic_code, level, title, rule_text, examples')
    .eq('topic_main', exact.topic_main)
    .neq('topic_code', topicCode)
    .limit(2);

  const rules = [exact, ...(related || [])];

  const context =
    `[PRIMARY] ${exact.title} (${exact.level})\n${exact.rule_text}\nExamples:\n${exact.examples}` +
    (related && related.length > 0
      ? '\n\n[RELATED]\n' +
        related.map((r) => `${r.title}: ${r.rule_text}`).join('\n')
      : '');

  return { rules, title: exact.title, context };
}
