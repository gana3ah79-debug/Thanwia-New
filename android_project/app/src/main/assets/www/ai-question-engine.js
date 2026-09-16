/* Thanwia-New AI Question Engine v2
 * Uses the protected Supabase Edge Function generate-ai-quiz.
 * No Gemini/API secret is stored in the app.
 */
(function(){
  'use strict';
  const CFG={functionName:'generate-ai-quiz',timeoutMs:60000};
  function getSupabase(){try{return window.supabaseClient||window.db||null}catch(_){return null}}
  async function invoke(payload){
    const c=getSupabase();
    if(c?.functions?.invoke){
      const {data,error}=await c.functions.invoke(CFG.functionName,{body:payload});
      if(error) throw error;
      return data;
    }
    const base=(window.THANWIA_SUPABASE_URL||'').replace(/\/$/,'');
    if(!base) throw new Error('لم يتم إعداد اتصال Supabase.');
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),CFG.timeoutMs);
    try{
      const res=await fetch(base+'/functions/v1/'+CFG.functionName,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),signal:controller.signal});
      const data=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data.error||data.detail||'تعذر إنشاء الاختبار.');
      return data;
    }finally{clearTimeout(timer)}
  }
  function normalize(q,i){
    return {
      id:q.id||(`ai-${Date.now()}-${i}`),
      question:q.stem||'',
      options:Array.isArray(q.options)?q.options.slice(0,4):[],
      answer:Number(q.correct_option),
      explanation:q.explanation||'',
      commonMistake:q.common_mistake||'',
      difficulty:q.difficulty||'medium',
      cognitiveLevel:q.cognitive_level||'',
      estimatedSeconds:Number(q.estimated_seconds||90),
      unit:q.unit||'',lesson:q.lesson||'',concept:q.concept||'',skill:q.skill||'',
      sourceBasis:q.source_basis||''
    };
  }
  async function generate(options){
    options=options||{};
    const payload={
      subject:String(options.subject||'').replace(/^[^\p{L}\p{N}]+/u,'').trim(),
      branch:options.branch||null,
      unit:options.unit||null,
      lesson:options.lesson||null,
      difficulty:options.difficulty||'medium',
      count:Math.min(Math.max(Number(options.count||10),1),20),
      user_id:options.userId||window.__rihlaAuthUser?.id||null
    };
    if(!payload.subject) throw new Error('اختر المادة أولًا.');
    const result=await invoke(payload);
    const questions=(result.questions||[]).map(normalize);
    if(!questions.length) throw new Error('لم يعتمد محرك المراجعة أي سؤال صالح. جرّب تغيير الدرس أو عدد الأسئلة.');
    const quiz={id:`ai-${Date.now()}`,generatedAt:new Date().toISOString(),subject:payload.subject,branch:payload.branch,unit:payload.unit,lesson:payload.lesson,difficulty:payload.difficulty,questions,source:'thanwia-ai-grounded-engine-v2',model:result.model||null,qualityGate:result.quality_gate||null,webGrounding:!!result.web_grounding};
    try{window.rihlaState=window.rihlaState||{};window.rihlaState.lastAIQuiz=quiz;localStorage.setItem('thanwiaLastAIQuiz',JSON.stringify(quiz))}catch(_){}
    return quiz;
  }
  window.ThanwiaAIQuestionEngine={generate,invoke};
  window.generateThanwiaAIQuiz=generate;
})();
