import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const questionSchema = {
  type: 'object',
  properties: {
    stem: { type: 'string' },
    options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
    correct_option: { type: 'integer', minimum: 0, maximum: 3 },
    explanation: { type: 'string' },
    common_mistake: { type: 'string' },
    difficulty: { type: 'string', enum: ['easy', 'medium', 'hard', 'elite'] },
    cognitive_level: { type: 'string' },
    estimated_seconds: { type: 'integer', minimum: 20, maximum: 600 },
    unit: { type: 'string' },
    lesson: { type: 'string' },
    concept: { type: 'string' },
    skill: { type: 'string' },
    source_basis: { type: 'string' },
  },
  required: ['stem', 'options', 'correct_option', 'explanation', 'common_mistake', 'difficulty', 'cognitive_level', 'estimated_seconds', 'unit', 'lesson', 'concept', 'skill', 'source_basis'],
};

const generationSchema = {
  type: 'object',
  properties: { questions: { type: 'array', items: questionSchema } },
  required: ['questions'],
};

const reviewItemSchema = {
  type: 'object',
  properties: {
    index: { type: 'integer', minimum: 0 },
    approved: { type: 'boolean' },
    score: { type: 'integer', minimum: 0, maximum: 100 },
    issues: { type: 'array', items: { type: 'string' } },
  },
  required: ['index', 'approved', 'score', 'issues'],
};

const reviewSchema = {
  type: 'object',
  properties: { reviews: { type: 'array', items: reviewItemSchema } },
  required: ['reviews'],
};

function fingerprint(q: any) {
  return [q.stem, ...(q.options || [])].join(' ').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function validateQuestion(q: any) {
  if (!q || typeof q.stem !== 'string' || q.stem.trim().length < 15) return false;
  if (!Array.isArray(q.options) || q.options.length !== 4) return false;
  if (q.options.some((x: any) => typeof x !== 'string' || x.trim().length < 2)) return false;
  if (new Set(q.options.map((x: string) => x.trim().toLowerCase())).size !== 4) return false;
  if (![0, 1, 2, 3].includes(q.correct_option)) return false;
  if (typeof q.explanation !== 'string' || q.explanation.trim().length < 20) return false;
  if (typeof q.common_mistake !== 'string' || q.common_mistake.trim().length < 10) return false;
  if (typeof q.lesson !== 'string' || !q.lesson.trim()) return false;
  if (typeof q.concept !== 'string' || !q.concept.trim()) return false;
  return true;
}

function hasUncertainty(q: any) {
  const text = `${q.stem} ${q.explanation} ${q.source_basis}`;
  return /(إذا اعتبرنا|ربما|قد يكون|يمكن أن يكون|حسب السياق|على الأرجح|غالبًا|ربما يكون|يحتمل)/u.test(text);
}

function hasMetaExcuse(q: any) {
  return /(إذا كان البيت الأول|إن كان البيت الأول|نفترض أن|على افتراض|بحسب ما ورد|إذا اعتبرنا)/u.test(`${q.stem} ${q.explanation}`);
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
}

async function geminiJson(prompt: string, schema: any, key: string, temperature = 0.25) {
  const ai = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        response_mime_type: 'application/json',
        response_schema: schema,
        temperature,
      },
    }),
  });
  const raw = await ai.text();
  if (!ai.ok) throw new Error(raw.slice(0, 2000));
  let response: any;
  try { response = JSON.parse(raw); } catch { throw new Error('Invalid Gemini response JSON'); }
  const outputText = response?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text || '').join('').trim();
  if (!outputText) throw new Error(JSON.stringify(response?.promptFeedback || response?.candidates?.[0]?.finishReason || 'No text returned'));
  try { return JSON.parse(outputText); } catch { throw new Error('Invalid structured output from Gemini'); }
}

async function main(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!geminiKey || !supabaseUrl || !serviceKey) return jsonResponse({ error: 'AI service is not configured. Add GEMINI_API_KEY to Supabase Secrets.' }, 500);

  let body: any;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'Invalid JSON body' }, 400); }

  const subject = String(body.subject || '').trim();
  const branch = String(body.branch || '').trim() || null;
  const unit = String(body.unit || '').trim() || null;
  const lesson = String(body.lesson || '').trim() || null;
  const difficulty = String(body.difficulty || 'medium');
  const count = Math.min(Math.max(Number(body.count || 10), 1), 20);
  const userId = body.user_id || null;
  if (!subject) return jsonResponse({ error: 'subject is required' }, 400);

  const sb = createClient(supabaseUrl, serviceKey);
  const { data: sources } = await sb.from('ai_source_documents')
    .select('id,title,source_type,subject,grade,branch,school_year,url,content')
    .eq('is_active', true)
    .or(`subject.eq.${subject},subject.eq.عام`)
    .limit(30);

  const { data: existing } = await sb.from('ai_generated_questions')
    .select('stem,options,fingerprint')
    .eq('subject', subject)
    .eq('grade', 'الصف الثالث الثانوي')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(300);

  const sourceContext = (sources || []).map((s: any) => ({
    title: s.title,
    type: s.source_type,
    year: s.school_year,
    branch: s.branch,
    url: s.url,
    content: s.content ? s.content.slice(0, 12000) : null,
  }));
  const avoid = (existing || []).slice(0, 120).map((q: any) => q.stem).join('\n- ');

  const instructions = `أنت محرك أسئلة احترافي للصف الثالث الثانوي المصري.\n` +
    `أنشئ أسئلة اختيار من متعدد أصلية، واضحة وقابلة للامتحان، مبنية على المنهج المصري والمراجع المتاحة.\n` +
    `قواعد إلزامية: إجابة صحيحة واحدة فقط؛ لا تخترع قاعدة أو معلومة؛ لا تدخل محتوى جامعيًا أو خارج المنهج؛ المشتتات من أخطاء شائعة منطقية؛ العربية سليمة.\n` +
    `في النحو والبلاغة والأدب افحص المصطلح والقاعدة بدقة. لا تستنتج التصريع أو المحسن أو الصورة البيانية من نص ناقص، ولا تعتمد على افتراض غير مذكور.\n` +
    `لا تستخدم بيتًا أو نصًا منسوبًا لشاعر/كتاب إلا إذا كان النص موجودًا في المراجع المرسلة. عند عدم توفر النص، أنشئ مثالًا تطبيقيًا جديدًا ولا تنسبه لمصدر.\n` +
    `لا تكتب في الشرح عبارات احتمالية مثل: ربما، قد يكون، حسب السياق، إذا اعتبرنا، على الأرجح.\n` +
    `أعد JSON فقط.`;

  const userInput = {
    request: { subject, grade: 'الصف الثالث الثانوي', branch, unit, lesson, difficulty, count },
    reference_sources: sourceContext,
    already_generated_to_avoid: avoid,
  };

  const run = await sb.from('ai_generation_runs').insert({
    user_id: userId,
    subject,
    grade: 'الصف الثالث الثانوي',
    branch,
    unit,
    lesson,
    difficulty,
    count_requested: count,
    model: MODEL,
  }).select('id').single();
  const runId = run.data?.id || null;

  let parsed: any;
  try {
    parsed = await geminiJson(`${instructions}\n\nبيانات الطلب والمراجع:\n${JSON.stringify(userInput, null, 2)}`, generationSchema, geminiKey, 0.3);
  } catch (e) {
    if (runId) await sb.from('ai_generation_runs').update({ status: 'failed', error_message: String(e).slice(0, 2000) }).eq('id', runId);
    return jsonResponse({ error: 'Gemini generation failed', detail: String(e).slice(0, 2000) }, 502);
  }

  const clean = (parsed.questions || []).filter(validateQuestion);
  const seen = new Set<string>();
  const candidates = clean.filter((q: any) => {
    const fp = fingerprint(q);
    if (seen.has(fp)) return false;
    seen.add(fp);
    if (hasUncertainty(q) || hasMetaExcuse(q)) return false;
    return true;
  }).slice(0, count);

  const approved: any[] = [];
  const rejected: any[] = [];
  if (candidates.length) {
    const reviewPrompt = `أنت مراجع أكاديمي مستقل وصارم لأسئلة الثانوية العامة المصرية.\n` +
      `راجع كل سؤال في القائمة مقابل المراجع المرفقة وبشكل منفصل. لا تفترض أن السؤال صحيح لمجرد أن نموذجًا آخر أنشأه.\n` +
      `ارفض السؤال إذا: كانت المعلومة أو القاعدة غير مؤكدة؛ النص المنسوب غير موجود في المراجع؛ السؤال ناقص ويحتاج افتراضًا؛ توجد إجابتان محتملتان؛ الإجابة المحددة خطأ؛ الشرح لا يطابق الإجابة؛ يوجد خطأ نحوي/بلاغي/أدبي مؤثر؛ السؤال خارج المنهج؛ أو الصياغة مضللة.\n` +
      `في أسئلة النحو والبلاغة والأدب تحقق من القاعدة المقصودة نفسها، وليس من التشابه العام. لا تسمح بتبرير من نوع "إذا كان..." أو "حسب السياق".\n` +
      `لا تعتمد نصًا شعريًا أو أدبيًا من الذاكرة إذا لم يوجد في المراجع. إذا كانت المراجع مجرد عناوين بلا نص أو دليل كافٍ، فالسؤال الذي يتطلب إثباتًا نصيًا يُرفض.\n` +
      `القبول يتطلب score >= 95 وأن تكون approved=true. لا ترفع الدرجة للمجاملة.\n` +
      `المراجع:\n${JSON.stringify(sourceContext, null, 2)}\n\nالأسئلة:\n${JSON.stringify(candidates, null, 2)}\n\nأعد JSON فقط في صورة reviews، وعن كل سؤال أعد index وapproved وscore وissues.`;
    try {
      const review = await geminiJson(reviewPrompt, reviewSchema, geminiKey, 0.1);
      const reviews = Array.isArray(review?.reviews) ? review.reviews : [];
      for (let i = 0; i < candidates.length; i++) {
        const q = candidates[i];
        const r = reviews.find((x: any) => Number(x.index) === i);
        if (r?.approved === true && Number(r.score) >= 95) approved.push({ ...q, quality_score: Number(r.score) });
        else rejected.push({ stem: q.stem, issues: r?.issues || ['لم يجتز بوابة المراجعة الأكاديمية'] });
      }
    } catch (e) {
      for (const q of candidates) rejected.push({ stem: q.stem, issues: ['تعذر إتمام المراجعة الأكاديمية'] });
    }
  }

  for (const q of approved) {
    await sb.from('ai_generated_questions').insert({
      subject,
      grade: 'الصف الثالث الثانوي',
      branch,
      unit: q.unit || unit,
      lesson: q.lesson || lesson,
      concept: q.concept,
      skill: q.skill,
      question_type: 'mcq',
      difficulty: q.difficulty,
      cognitive_level: q.cognitive_level,
      stem: q.stem,
      options: q.options,
      correct_option: q.correct_option,
      explanation: q.explanation,
      common_mistake: q.common_mistake,
      estimated_seconds: q.estimated_seconds,
      fingerprint: fingerprint(q),
      quality_score: q.quality_score,
      status: 'approved',
      model: MODEL,
      generation_run_id: runId,
    });
  }

  if (runId) await sb.from('ai_generation_runs').update({
    status: 'completed',
    count_generated: approved.length,
    error_message: rejected.length ? `Rejected by quality gate: ${rejected.length}` : null,
  }).eq('id', runId);

  return jsonResponse({
    questions: approved,
    model: MODEL,
    generated: approved.length,
    candidates: candidates.length,
    rejected: rejected.length,
    quality_gate: 'strict-review-v2',
  });
}

Deno.serve(main);
