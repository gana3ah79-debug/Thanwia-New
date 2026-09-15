import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
const MODEL=Deno.env.get('GEMINI_MODEL')||'gemini-3.5-flash-lite';
const GEMINI_URL=`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;
const questionSchema={type:'object',properties:{stem:{type:'string'},options:{type:'array',items:{type:'string'},minItems:4,maxItems:4},correct_option:{type:'integer',minimum:0,maximum:3},explanation:{type:'string'},common_mistake:{type:'string'},difficulty:{type:'string',enum:['easy','medium','hard','elite']},cognitive_level:{type:'string'},estimated_seconds:{type:'integer',minimum:20,maximum:600},unit:{type:'string'},lesson:{type:'string'},concept:{type:'string'},skill:{type:'string'},source_basis:{type:'string'}},required:['stem','options','correct_option','explanation','common_mistake','difficulty','cognitive_level','estimated_seconds','unit','lesson','concept','skill','source_basis']};
const generationSchema={type:'object',properties:{questions:{type:'array',items:questionSchema}},required:['questions']};
const reviewItemSchema={type:'object',properties:{index:{type:'integer',minimum:0},approved:{type:'boolean'},score:{type:'integer',minimum:0,maximum:100},answer_verified:{type:'boolean'},explanation_verified:{type:'boolean'},curriculum_verified:{type:'boolean'},issues:{type:'array',items:{type:'string'}}},required:['index','approved','score','answer_verified','explanation_verified','curriculum_verified','issues']};
const reviewSchema={type:'object',properties:{reviews:{type:'array',items:reviewItemSchema}},required:['reviews']};
function fingerprint(q:any){return [q.stem,...(q.options||[])].join(' ').toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
function stemFingerprint(s:string){return s.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim()}
function valid(q:any){if(!q||typeof q.stem!=='string'||q.stem.trim().length<15)return false;if(!Array.isArray(q.options)||q.options.length!==4)return false;if(q.options.some((x:any)=>typeof x!=='string'||x.trim().length<2))return false;if(new Set(q.options.map((x:string)=>x.trim().toLowerCase())).size!==4)return false;if(!Number.isInteger(q.correct_option)||q.correct_option<0||q.correct_option>3)return false;if(typeof q.explanation!=='string'||q.explanation.trim().length<20)return false;if(typeof q.common_mistake!=='string'||q.common_mistake.trim().length<10)return false;if(!q.lesson?.trim()||!q.concept?.trim()||!q.skill?.trim())return false;return true}
function localReject(q:any){const t=`${q.stem} ${q.explanation} ${q.source_basis}`;if(/إذا اعتبرنا|ربما|قد يكون|يمكن أن يكون|حسب السياق|على الأرجح|غالبًا|يحتمل|نفترض أن|على افتراض/u.test(t))return'صياغة احتمالية أو افتراض غير مسموح';if(/إذا كان البيت الأول|إن كان البيت الأول|بحسب ما ورد/u.test(t))return'السؤال يعتمد على معلومة غير موجودة في النص';if(/الإسقاط والجديد|البصوص|النقجوم/u.test(t))return'مصطلح أو كلمة تبدو غير صحيحة منهجيًا/لغويًا';return null}
function jsonResponse(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}})}
async function geminiJson(prompt:string,schema:any,key:string,temp:number){const r=await fetch(GEMINI_URL,{method:'POST',headers:{'x-goog-api-key':key,'Content-Type':'application/json'},body:JSON.stringify({contents:[{parts:[{text:prompt}]}],generationConfig:{response_mime_type:'application/json',response_schema:schema,temperature:temp}})});const raw=await r.text();if(!r.ok)throw new Error(raw.slice(0,2000));let outer:any;try{outer=JSON.parse(raw)}catch{throw new Error('Invalid Gemini response JSON')}const text=outer?.candidates?.[0]?.content?.parts?.map((p:any)=>p?.text||'').join('').trim();if(!text)throw new Error(JSON.stringify(outer?.promptFeedback||outer?.candidates?.[0]?.finishReason||'No text returned'));try{return JSON.parse(text)}catch{throw new Error('Invalid structured output')}}
async function main(req:Request){
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return jsonResponse({error:'POST only'},405);
 const key=Deno.env.get('GEMINI_API_KEY')||Deno.env.get('GOOGLE_API_KEY');const url=Deno.env.get('SUPABASE_URL');const service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!key||!url||!service)return jsonResponse({error:'AI service is not configured. Add GEMINI_API_KEY to Supabase Secrets.'},500);
 let body:any;try{body=await req.json()}catch{return jsonResponse({error:'Invalid JSON body'},400)}
 const subject=String(body.subject||'').trim();const branch=String(body.branch||'').trim()||null;const unit=String(body.unit||'').trim()||null;const lesson=String(body.lesson||'').trim()||null;const difficulty=String(body.difficulty||'medium');const count=Math.min(Math.max(Number(body.count||10),1),20);const userId=body.user_id||null;
 if(!subject)return jsonResponse({error:'subject is required'},400);
 const sb=createClient(url,service);
 const {data:sources}=await sb.from('ai_source_documents').select('id,title,source_type,subject,grade,branch,school_year,url,content').eq('is_active',true).or(`subject.eq.${subject},subject.eq.عام`).limit(30);
 const {data:existing}=await sb.from('ai_generated_questions').select('stem,options,fingerprint').eq('subject',subject).eq('grade','الصف الثالث الثانوي').eq('status','approved').order('created_at',{ascending:false}).limit(300);
 const sourceContext=(sources||[]).map((s:any)=>({title:s.title,type:s.source_type,year:s.school_year,branch:s.branch,url:s.url,content:s.content?s.content.slice(0,12000):null}));
 const usedFingerprints=new Set<string>((existing||[]).map((q:any)=>q.fingerprint||fingerprint(q)));
 const usedStems=new Set<string>((existing||[]).map((q:any)=>stemFingerprint(q.stem||'')));
 const rejected:any[]=[];const approved:any[]=[];let attempts=0;const maxAttempts=4;
 const instructions=`أنت محرك أسئلة احترافي للصف الثالث الثانوي المصري. أنشئ أسئلة اختيار من متعدد أصلية قابلة للاستخدام في امتحان الثانوية العامة المصرية.\nالالتزام إلزامي بالمنهج والشعبة والدرس المطلوب. لا تخترع قاعدة أو معلومة. لا تستخدم نصًا أدبيًا منسوبًا لشاعر أو كتاب إلا إذا كان النص موجودًا في المراجع. إذا لم يوجد النص، أنشئ مثالًا جديدًا غير منسوب.\nلكل سؤال إجابة صحيحة واحدة فقط و4 اختيارات مختلفة. المشتتات أخطاء شائعة منطقية. الشرح يجب أن يثبت الإجابة المحددة مباشرة.\nفي النحو والبلاغة والأدب: تحقق من اسم القاعدة والمصطلح وشروطه. لا تعتمد على الافتراض أو الذاكرة. لا تكتب عبارات احتمالية مثل ربما أو حسب السياق أو إذا اعتبرنا. استخدم عربية سليمة. لا تستخدم أسماء مدارس أو مصطلحات غير مؤكدة.\nممنوع إعادة أي سؤال أو صياغة متطابقة أو شبه متطابقة مع قائمة التجنب. نوّع الفكرة والمهارة والسياق، وليس الكلمات فقط. أعد JSON فقط.`;
 const run=await sb.from('ai_generation_runs').insert({user_id:userId,subject,grade:'الصف الثالث الثانوي',branch,unit,lesson,difficulty,count_requested:count,model:MODEL}).select('id').single();const runId=run.data?.id||null;
 try{
  while(approved.length<count && attempts<maxAttempts){
   attempts++;
   const need=count-approved.length;const requestCount=Math.min(Math.max(need*2,5),20);
   const avoid=Array.from(usedStems).slice(-300).join('\n- ');
   let parsed:any;
   try{parsed=await geminiJson(`${instructions}\nبيانات الطلب والمراجع:\n${JSON.stringify({request:{subject,grade:'الصف الثالث الثانوي',branch,unit,lesson,difficulty,count:requestCount},reference_sources:sourceContext,already_used_stems:avoid},null,2)}`,generationSchema,key,.35)}catch(e){rejected.push({stem:'',issues:['فشل توليد دفعة جديدة',String(e).slice(0,300)]});continue}
   const batch:any[]=[];
   for(const q of(parsed.questions||[]){
    if(!valid(q)){rejected.push({stem:q?.stem||'',issues:['فشل الفحص البنيوي']});continue}
    const fp=fingerprint(q),sf=stemFingerprint(q.stem);
    if(usedFingerprints.has(fp)||usedStems.has(sf)){rejected.push({stem:q.stem,issues:['سؤال مكرر أو شديد التشابه']});continue}
    const reason=localReject(q);if(reason){rejected.push({stem:q.stem,issues:[reason]});continue}
    usedFingerprints.add(fp);usedStems.add(sf);batch.push(q);
    if(batch.length>=need)break;
   }
   if(!batch.length)continue;
   const reviewPrompt=`أنت مراجع أكاديمي مستقل وصارم لأسئلة الثانوية العامة المصرية. راجع كل سؤال في القائمة مراجعة امتحانية حقيقية. لا تفترض أن السؤال صحيح لمجرد أن نموذجًا آخر أنشأه.\nتحقق بشكل مستقل من صحة الإجابة، عدم وجود إجابة ثانية صحيحة، صحة الشرح، سلامة المصطلح، اكتمال المعطيات، الانتماء للمنهج المصري المطلوب، وسلامة الصياغة.\nارفض فورًا إذا احتاج السؤال إلى افتراض غير مكتوب، أو إذا كان النص المنسوب غير موجود في المراجع، أو إذا كان المصطلح الأدبي أو النحوي غير صحيح، أو إذا كان الشرح متناقضًا، أو إذا كانت الإجابة غير يقينية، أو إذا كان السؤال ناقصًا أو مبتورًا.\nالقبول فقط إذا approved=true وscore>=98 وanswer_verified=true وexplanation_verified=true وcurriculum_verified=true. يجب إرجاع مراجعة لكل index بدون استثناء.\nالمراجع:\n${JSON.stringify(sourceContext,null,2)}\nالأسئلة:\n${JSON.stringify(batch,null,2)}\nأعد JSON فقط.`;
   try{
    const result=await geminiJson(reviewPrompt,reviewSchema,key,.05);const reviews=Array.isArray(result?.reviews)?result.reviews:[];
    for(let i=0;i<batch.length;i++){const q=batch[i];const r=reviews.find((x:any)=>Number(x.index)===i);if(r?.approved===true&&Number(r.score)>=98&&r.answer_verified===true&&r.explanation_verified===true&&r.curriculum_verified===true){approved.push({...q,quality_score:Number(r.score)});if(approved.length>=count)break}else rejected.push({stem:q.stem,issues:r?.issues?.length?r.issues:['لم يجتز المراجعة الأكاديمية']})}
   }catch{for(const q of batch)rejected.push({stem:q.stem,issues:['تعذر إتمام المراجعة الأكاديمية']})}
  }
  for(const q of approved){await sb.from('ai_generated_questions').insert({subject,grade:'الصف الثالث الثانوي',branch,unit:q.unit||unit,lesson:q.lesson||lesson,concept:q.concept,skill:q.skill,question_type:'mcq',difficulty:q.difficulty,cognitive_level:q.cognitive_level,stem:q.stem,options:q.options,correct_option:q.correct_option,explanation:q.explanation,common_mistake:q.common_mistake,estimated_seconds:q.estimated_seconds,fingerprint:fingerprint(q),quality_score:q.quality_score,status:'approved',model:MODEL,generation_run_id:runId})}
  if(runId)await sb.from('ai_generation_runs').update({status:'completed',count_generated:approved.length,error_message:approved.length<count?`Quality gate could only approve ${approved.length}/${count} after ${attempts} attempts; rejected ${rejected.length}`:null}).eq('id',runId);
  return jsonResponse({questions:approved,model:MODEL,generated:approved.length,candidates:approved.length+rejected.length,rejected:rejected.length,attempts,quality_gate:'strict-review-v4',rejected_details:rejected.slice(0,20)});
 }catch(e){if(runId)await sb.from('ai_generation_runs').update({status:'failed',error_message:String(e).slice(0,2000)}).eq('id',runId);return jsonResponse({error:'AI generation failed',detail:String(e).slice(0,2000)},502)}
}
Deno.serve(main);
