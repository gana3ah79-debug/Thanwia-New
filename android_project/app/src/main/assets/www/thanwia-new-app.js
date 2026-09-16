(function(){
'use strict';
const SUPABASE_URL='https://aenuzbaqskhyqwatrggg.supabase.co';
const SUPABASE_KEY='sb_publishable_FqI5heK77syr-3QHh2LPHg_E82vbq-0';
window.THANWIA_SUPABASE_URL=SUPABASE_URL;
let mode='login';
let client=null;

function init(){
  if(window.supabase&&window.supabase.createClient){
    client=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY);
    window.supabaseClient=client;
    client.auth.onAuthStateChange(function(_event,session){
      if(session){window.__rihlaAuthUser=session.user;showHome(session.user);}
      else showAuth();
    });
    client.auth.getSession().then(function(r){
      if(r.data&&r.data.session){window.__rihlaAuthUser=r.data.session.user;showHome(r.data.session.user);}
    });
  }else setStatus('تعذر تحميل مكتبة الاتصال. تحقق من الإنترنت.');
}

window.setMode=function(next){
  mode=next;
  document.getElementById('loginTab').classList.toggle('active',mode==='login');
  document.getElementById('signupTab').classList.toggle('active',mode==='signup');
  document.getElementById('nameField').classList.toggle('hidden',mode!=='signup');
  document.getElementById('mainBtn').textContent=mode==='login'?'تسجيل الدخول':'إنشاء الحساب';
  document.getElementById('forgot').classList.toggle('hidden',mode!=='login');
  setStatus('');
};

window.submitAuth=async function(){
  if(!client)return setStatus('الاتصال غير جاهز.');
  const email=document.getElementById('email').value.trim();
  const password=document.getElementById('password').value;
  const name=document.getElementById('name').value.trim();
  if(!email||!password)return setStatus('اكتب البريد وكلمة المرور.');
  if(password.length<6)return setStatus('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');
  setBusy(true);
  try{
    if(mode==='login'){
      const r=await client.auth.signInWithPassword({email,password});
      if(r.error)throw r.error;
    }else{
      const r=await client.auth.signUp({email,password,options:{data:{full_name:name||'طالب Thanwia-New'}}});
      if(r.error)throw r.error;
      if(r.data.session){showHome(r.data.user);}else setStatus('تم إنشاء الحساب. إذا طُلب تأكيد البريد، أكّد البريد ثم سجّل الدخول.');
    }
  }catch(e){setStatus(authMessage(e));}
  finally{setBusy(false);}
};

window.resetPassword=async function(){
  if(!client)return;
  const email=document.getElementById('email').value.trim();
  if(!email)return setStatus('اكتب بريدك الإلكتروني أولًا.');
  setBusy(true);
  try{
    const r=await client.auth.resetPasswordForEmail(email);
    if(r.error)throw r.error;
    setStatus('تم إرسال رابط استعادة كلمة المرور إلى بريدك.');
  }catch(e){setStatus(authMessage(e));}
  finally{setBusy(false);}
};

window.logout=async function(){if(client)await client.auth.signOut();};

function showHome(user){
  document.getElementById('auth').classList.add('hidden');
  document.getElementById('home').classList.add('show');
  const name=(user.user_metadata&&user.user_metadata.full_name)||user.email.split('@')[0];
  document.getElementById('hello').textContent='أهلاً يا '+name;
};
function showAuth(){document.getElementById('auth').classList.remove('hidden');document.getElementById('home').classList.remove('show');}
function setBusy(v){const b=document.getElementById('mainBtn');b.disabled=v;b.textContent=v?'جارٍ التنفيذ...':(mode==='login'?'تسجيل الدخول':'إنشاء الحساب');}
function setStatus(t){document.getElementById('status').textContent=t||'';}
function authMessage(e){
  const m=String(e&&e.message||e);
  if(m.toLowerCase().includes('invalid login credentials'))return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  if(m.toLowerCase().includes('already registered'))return 'هذا البريد مسجل بالفعل.';
  return m;
}

window.generateQuiz=async function(){
  const result=document.getElementById('result');
  result.innerHTML='<div class="q">جاري إنشاء الاختبار من محرك AI الجديد...</div>';
  try{
    const quiz=await window.ThanwiaAIQuestionEngine.generate({subject:document.getElementById('subject').value,count:Number(document.getElementById('count').value),userId:window.__rihlaAuthUser?.id||null});
    result.innerHTML=quiz.questions.map(function(q,i){return '<div class="q"><strong>س'+(i+1)+': '+escapeHtml(q.question)+'</strong>'+q.options.map(function(o,j){return '<button class="opt" onclick="this.parentElement.querySelectorAll(\'.opt\').forEach(x=>x.disabled=true);this.style.borderColor=\''+(j===q.answer?'#19a974':'#e34d63')+'\';">'+escapeHtml(o)+'</button>';}).join('')+'</div>';}).join('');
  }catch(e){result.innerHTML='<div class="q">تعذر إنشاء الاختبار: '+escapeHtml(e.message||String(e))+'</div>';}
};
function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

document.addEventListener('DOMContentLoaded',init);
})();
