/* Thanwia-New AI Question Engine
 * Connects the app to Supabase Edge Function: generate-ai-quiz.
 * The API key never belongs in this file.
 */
(function () {
  'use strict';

  const CFG = {
    functionName: 'generate-ai-quiz',
    timeoutMs: 45000,
    grade: 'الصف الثالث الثانوي'
  };

  function getSupabase() {
    try { return window.supabaseClient || window.db || window.supabase?.client || null; }
    catch (_) { return null; }
  }

  function getEndpoint() {
    const c = getSupabase();
    if (c?.functions?.invoke) return null;
    const url = window.THANWIA_SUPABASE_URL || localStorage.getItem('thanwiaSupabaseUrl');
    return url ? url.replace(/\/$/, '') + '/functions/v1/' + CFG.functionName : null;
  }

  async function invoke(payload) {
    const c = getSupabase();
    if (c?.functions?.invoke) {
      const { data, error } = await c.functions.invoke(CFG.functionName, { body: payload });
      if (error) throw error;
      return data;
    }

    const endpoint = getEndpoint();
    if (!endpoint) throw new Error('لم يتم إعداد اتصال Supabase الجديد بعد.');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CFG.timeoutMs);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'تعذر إنشاء الاختبار.');
      return data;
    } finally { clearTimeout(timer); }
  }

  function normalizeQuestion(q, i) {
    const options = Array.isArray(q.options) ? q.options.slice(0, 4) : [];
    return {
      id: q.id || `ai-${Date.now()}-${i}`,
      question: q.stem || '',
      options,
      answer: Number(q.correct_option),
      explanation: q.explanation || '',
      commonMistake: q.common_mistake || '',
      difficulty: q.difficulty || 'medium',
      cognitiveLevel: q.cognitive_level || '',
      estimatedSeconds: Number(q.estimated_seconds || 90),
      unit: q.unit || '',
      lesson: q.lesson || '',
      concept: q.concept || '',
      skill: q.skill || '',
      sourceBasis: q.source_basis || ''
    };
  }

  async function generate(options) {
    options = options || {};
    const payload = {
      subject: options.subject || '',
      branch: options.branch || null,
      unit: options.unit || null,
      lesson: options.lesson || null,
      difficulty: options.difficulty || 'medium',
      count: Math.min(Math.max(Number(options.count || 10), 1), 20),
      user_id: options.userId || window.__rihlaAuthUser?.id || null
    };
    if (!payload.subject) throw new Error('اختر المادة أولًا.');

    const result = await invoke(payload);
    const questions = (result.questions || []).map(normalizeQuestion);
    if (!questions.length) throw new Error('لم يتم توليد أسئلة صالحة. حاول مرة أخرى.');

    const quiz = {
      id: `ai-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      subject: payload.subject,
      branch: payload.branch,
      unit: payload.unit,
      lesson: payload.lesson,
      difficulty: payload.difficulty,
      questions,
      source: 'thanwia-ai-grounded-engine',
      model: result.model || null
    };

    try {
      window.rihlaState = window.rihlaState || {};
      window.rihlaState.lastAIQuiz = quiz;
      localStorage.setItem('thanwiaLastAIQuiz', JSON.stringify(quiz));
    } catch (_) {}

    return quiz;
  }

  window.ThanwiaAIQuestionEngine = { generate, invoke };
  window.generateThanwiaAIQuiz = generate;
})();
