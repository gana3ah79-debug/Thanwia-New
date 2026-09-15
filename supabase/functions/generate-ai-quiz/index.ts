import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Gemini 2.5 Flash-Lite has a free tier and supports structured JSON output.
const MODEL = Deno.env.get('GEMINI_MODEL') || 'gemini-2.5-flash-lite';
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

function fingerprint(q: any) {
  return [q.stem, ...(q.options || [])].join(' ').toLowerCase()
    .normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function validateQuestion(q: any) {
  if (!q || typeof q.stem !== 'string' || q.stem.length < 15) return false;
  if (!Array.isArray(q.options) || q.options.length !== 4) return false;
  if (new Set(q.options.map((x: string) => x.trim().toLowerCase())).size !== 4) return false;
  if (![0,1,2,3].includes(q.correct_option)) return false;
  if (typeof q.explanation !== 'string' || q.explanation.length < 10) return false;
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
    .limit(200);

  const sourceContext = (sources || []).map((s: any) => ({
    title: s.title,
    type: s.source_type,
    year: s.school_year,
    branch: s.branch,
    url: s.url,
    content: s.content ? s.content.slice(0, 12000) : null,
  }));
  const avoid = (existing || []).slice(0, 80).map((q: any) => q.stem).join('\n- ');

  const instructions = `أنت محرك أسئلة لتطبيق "رحلة الثانوية" للصف الثالث الثانوي المصري.

` +
    `مهمتك: إنشاء أسئلة أصلية جديدة، وليست نسخًا حرفيًا من أي كتاب أو منصة أو امتحان.
` +
    `ابنِ السؤال من المفهوم والمهارة ونمط التقييم الموجود في المصادر المرجعية. لا تنسب نصًا محميًا أو سؤالًا بعينه إلى مصدر.
` +
    `الالتزام الصارم بمنهج الصف الثالث الثانوي المصري والشعبة المطلوبة. ممنوع إدخال معلومات جامعية أو خارج المنهج.
` +
    `كل سؤال MCQ له 4 اختيارات وإجابة صحيحة واحدة فقط. المشتتات يجب أن تكون أخطاء شائعة منطقية وليست عشوائية.
` +
    `نوّع الصعوبة ومستوى التفكير، وغيّر السياق والأرقام والترتيب حتى لا تتكرر الأسئلة.
` +
    `إذا كانت المصادر غير كافية لتحديد معلومة منهجية، لا تخترعها؛ استخدم فقط ما يمكن دعمه بالمراجع المتاحة.
` +
    `أعد JSON مطابقًا للمخطط المطلوب فقط.`;

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
        temperature: 0.7,
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

  const clean = (parsed.questions || []).filter(validateQuestion);
  const seen = new Set<string>();
  const fresh = clean.filter((q: any) => {
    const fp = fingerprint(q);
    if (seen.has(fp)) return false;
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
      quality_score: 95,
      status: 'approved',
      model: MODEL,
      generation_run_id: runId,
    });
  }

  if (runId) await sb.from('ai_generation_runs').update({ status: 'completed', count_generated: fresh.length }).eq('id', runId);

  return jsonResponse({ questions: fresh, model: MODEL, generated: fresh.length });
}

Deno.serve(main);
