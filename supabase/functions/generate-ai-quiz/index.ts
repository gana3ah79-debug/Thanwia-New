import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-3.5-flash-lite';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const schema = {
  type: 'object',
  properties: {
    questions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          stem: { type: 'string' },
          options: { type: 'array', items: { type: 'string' }, minItems: 4, maxItems: 4 },
          correct_option: { type: 'integer', minimum: 0, maximum: 3 },
          explanation: { type: 'string' },
          common_mistake: { type: 'string' },
          difficulty: { type: 'string', enum: ['easy','medium','hard','elite'] },
          cognitive_level: { type: 'string' },
          estimated_seconds: { type: 'integer', minimum: 20, maximum: 600 },
          unit: { type: 'string' },
          lesson: { type: 'string' },
          concept: { type: 'string' },
          skill: { type: 'string' },
          source_basis: { type: 'string' },
        },
        required: ['stem','options','correct_option','explanation','common_mistake','difficulty','cognitive_level','estimated_seconds','unit','lesson','concept','skill','source_basis'],
      },
    },
  },
  required: ['questions'],
};

function normalizeText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function fingerprint(q: any) {
  return [q.stem, ...(q.options || [])].join(' ').toLowerCase()
    .normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function validateQuestion(q: any) {
  if (!q || typeof q.stem !== 'string' || normalizeText(q.stem).length < 20) return false;
  if (!Array.isArray(q.options) || q.options.length !== 4) return false;
  const options = q.options.map(normalizeText);
  if (options.some((x: string) => x.length < 1 || x.length > 500)) return false;
  if (new Set(options.map((x: string) => x.toLowerCase().normalize('NFKC'))).size !== 4) return false;
  if (![0,1,2,3].includes(q.correct_option)) return false;
  if (typeof q.explanation !== 'string' || normalizeText(q.explanation).length < 20) return false;
  if (typeof q.common_mistake !== 'string' || normalizeText(q.common_mistake).length < 10) return false;
  if (!['easy','medium','hard','elite'].includes(q.difficulty)) return false;
  if (typeof q.unit !== 'string' || normalizeText(q.unit).length < 1) return false;
  if (typeof q.lesson !== 'string' || normalizeText(q.lesson).length < 1) return false;
  if (typeof q.concept !== 'string' || normalizeText(q.concept).length < 1) return false;
  if (typeof q.skill !== 'string' || normalizeText(q.skill).length < 1) return false;
  if (typeof q.source_basis !== 'string' || normalizeText(q.source_basis).length < 1) return false;
  if (!Number.isInteger(q.estimated_seconds) || q.estimated_seconds < 20 || q.estimated_seconds > 600) return false;
  return true;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

async function main(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return jsonResponse({ error: 'POST only' }, 405);

  const geminiKey = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('GOOGLE_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!geminiKey || !supabaseUrl || !serviceKey) {
    return jsonResponse({ error: 'AI service is not configured. Add GEMINI_API_KEY to Supabase Secrets.' }, 500);
  }

  const body = await req.json();
  const subject = normalizeText(body.subject);
  const branch = normalizeText(body.branch) || null;
  const unit = normalizeText(body.unit) || null;
  const lesson = normalizeText(body.lesson) || null;
  const difficulty = normalizeText(body.difficulty || 'medium');
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
    .in('status', ['approved', 'review'])
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
  const avoid = (existing || []).slice(0, 120).map((q: any) => normalizeText(q.stem)).filter(Boolean).join('\n- ');

  const instructions = `أنت محرك أسئلة احترافي لتطبيق "رحلة الثانوية" للصف الثالث الثانوي المصري.\n\n` +
    `الهدف: إنتاج أسئلة MCQ أصلية عالية الجودة، مطابقة للمنهج المصري الحالي، وليست أسئلة عامة مولدة عشوائياً.\n\n` +
    `قواعد إلزامية:\n` +
    `1) اعتمد أولاً على المصادر المرجعية المرسلة في الطلب، ثم على المعرفة المنهجية الموثوقة المتوافقة معها. إذا لم توجد معلومة كافية فلا تخترعها.\n` +
    `2) التزم بالصف الثالث الثانوي المصري وبالشعبة المحددة. ممنوع إدخال محتوى جامعي أو موضوعات من صفوف أخرى أو معلومات خارج نطاق المنهج.\n` +
    `3) قبل كتابة كل سؤال، حدد في ذهنك الدرس والمفهوم والمهارة التي يقيسها. يجب أن تكون هذه البيانات حقيقية ومطابقة لموضوع السؤال، وليست عناوين عامة مصطنعة.\n` +
    `4) كل سؤال له 4 اختيارات مختلفة، وإجابة صحيحة واحدة فقط. تحقق بنفسك أن الاختيارات الأخرى خاطئة أو أقل دقة بوضوح وفق المنهج. لا تستخدم اختياراً يمكن اعتباره صحيحاً أيضاً.\n` +
    `5) المشتتات يجب أن تمثل أخطاء شائعة أو خلطاً بين مفاهيم متقاربة، وليست إجابات عبثية أو مضحكة أو مكشوفة بسهولة.\n` +
    `6) لا تضع الإجابة الصحيحة دائماً في نفس الموضع. وزّع correct_option بين 0 و1 و2 و3 قدر الإمكان.\n` +
    `7) لا تكرر السؤال أو نفس الفكرة بصياغة سطحية مختلفة. غيّر السياق أو المعطيات أو زاوية القياس عند الحاجة. تجنب كل الأسئلة الموجودة في قائمة التجنب.\n` +
    `8) الشرح يجب أن يبرهن لماذا الإجابة الصحيحة صحيحة، ويذكر القاعدة أو الفكرة المنهجية ذات الصلة عند الحاجة. لا تكتب شرحاً عاماً لا يثبت الإجابة.\n` +
    `9) common_mistake يجب أن يصف خطأً حقيقياً قد يقع فيه طالب، وليس تعليقاً عاماً مثل "عدم فهم السؤال".\n` +
    `10) راجع اللغة العربية والإملاء والنحو وعلامات الترقيم قبل الإخراج. ممنوع أخطاء مثل: "اسم فعمل" أو كلمات مشوهة أو مصطلحات غير صحيحة.\n` +
    `11) في النحو والبلاغة والأدب، لا تعتمد على الانطباع؛ طبّق القاعدة العربية المحددة ثم راجعها مرة ثانية قبل اختيار الإجابة. إذا كان السؤال يحتمل أكثر من إجابة صحيحة فأعد صياغته.\n` +
    `12) في النصوص، لا تنسب اقتباساً حرفياً إلى مصدر إلا إذا ورد في المرجع المرسل. وإذا لم يتوفر النص الأصلي فلا تخترع أبياتاً أو نسباً أو أرقاماً.\n` +
    `13) difficulty يجب أن تعكس صعوبة الحل فعلياً، وcognitive_level يصف عملية التفكير المطلوبة مثل تذكر/فهم/تطبيق/تحليل/استنتاج.\n` +
    `14) نفّذ تدقيقاً نهائياً صامتاً لكل سؤال: هل هو من المنهج؟ هل له إجابة واحدة؟ هل الشرح صحيح؟ هل اللغة سليمة؟ هل لا يوجد تكرار؟ إذا فشل سؤال في أي بند، أصلحه قبل إخراجه.\n` +
    `أخرج JSON مطابقاً للمخطط فقط، دون أي نص إضافي.`;

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

  const prompt = `${instructions}\n\nبيانات الطلب والمراجع:\n${JSON.stringify(userInput, null, 2)}`;

  const ai = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: {
      'x-goog-api-key': geminiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        response_mime_type: 'application/json',
        response_schema: schema,
        temperature: 0.45,
      },
    }),
  });

  const raw = await ai.text();
  if (!ai.ok) {
    if (runId) await sb.from('ai_generation_runs').update({ status: 'failed', error_message: raw.slice(0, 2000) }).eq('id', runId);
    return jsonResponse({ error: 'Gemini generation failed', detail: raw.slice(0, 2000) }, 502);
  }

  let response: any;
  try {
    response = JSON.parse(raw);
  } catch {
    if (runId) await sb.from('ai_generation_runs').update({ status: 'failed', error_message: 'Invalid Gemini response JSON' }).eq('id', runId);
    return jsonResponse({ error: 'Invalid Gemini response' }, 502);
  }

  const outputText = response?.candidates?.[0]?.content?.parts
    ?.map((part: any) => part?.text || '')
    .join('')
    .trim();

  if (!outputText) {
    const detail = response?.promptFeedback || response?.candidates?.[0]?.finishReason || 'No text returned';
    if (runId) await sb.from('ai_generation_runs').update({ status: 'failed', error_message: JSON.stringify(detail).slice(0, 2000) }).eq('id', runId);
    return jsonResponse({ error: 'Gemini returned no usable output', detail }, 502);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(outputText);
  } catch {
    if (runId) await sb.from('ai_generation_runs').update({ status: 'failed', error_message: 'Invalid structured output from Gemini' }).eq('id', runId);
    return jsonResponse({ error: 'Invalid AI output' }, 502);
  }

  const clean = (parsed.questions || []).filter(validateQuestion).map((q: any) => ({
    ...q,
    stem: normalizeText(q.stem),
    options: q.options.map(normalizeText),
    explanation: normalizeText(q.explanation),
    common_mistake: normalizeText(q.common_mistake),
    unit: normalizeText(q.unit),
    lesson: normalizeText(q.lesson),
    concept: normalizeText(q.concept),
    skill: normalizeText(q.skill),
    source_basis: normalizeText(q.source_basis),
  }));

  const seen = new Set<string>();
  const existingFingerprints = new Set((existing || []).map((q: any) => q.fingerprint || fingerprint(q)));
  const fresh = clean.filter((q: any) => {
    const fp = fingerprint(q);
    if (seen.has(fp) || existingFingerprints.has(fp)) return false;
    seen.add(fp);
    return true;
  }).slice(0, count);

  for (const q of fresh) {
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
      quality_score: 100,
      status: 'approved',
      model: MODEL,
      generation_run_id: runId,
    });
  }

  if (runId) await sb.from('ai_generation_runs').update({ status: 'completed', count_generated: fresh.length }).eq('id', runId);

  return jsonResponse({ questions: fresh, model: MODEL, generated: fresh.length });
}

Deno.serve(main);
