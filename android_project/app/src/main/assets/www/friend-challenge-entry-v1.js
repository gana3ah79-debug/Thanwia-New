(function(){
'use strict';
if(window.__rihlaFriendChallengeEntryV1)return;
window.__rihlaFriendChallengeEntryV1=true;
function addEntry(){
  var section=document.getElementById('friends');
  if(!section || document.getElementById('fc2EntryCard')) return;
  var content=section.querySelector('.content');
  if(!content) return;
  var card=document.createElement('div');
  card.id='fc2EntryCard';
  card.className='card';
  card.innerHTML='<div class="row"><div><b>🎯 تحدي الأسئلة مع الأصدقاء</b><div class="muted" style="margin-top:5px">منافسة جماعية بالأسئلة والذكاء الاصطناعي</div></div><span style="font-size:30px">🤖</span></div><p class="muted" style="margin:10px 0">اختار المادة، الدرس أو الفصل أو المنهج بالكامل، وحدد نوع الأسئلة: اختيار من متعدد أو مقالي أو الاثنين معًا.</p><button class="btn" type="button">🚀 إنشاء أو دخول تحدي الأسئلة</button>';
  var btn=card.querySelector('button');
  btn.addEventListener('click',function(e){e.preventDefault();e.stopPropagation();if(window.RIHLA_FC2&&typeof window.RIHLA_FC2.setup==='function')window.RIHLA_FC2.setup();else if(window.toast)window.toast('جاري تجهيز تحدي الأصدقاء...');});
  content.insertBefore(card,content.firstChild);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addEntry);else addEntry();
var obs=new MutationObserver(addEntry);obs.observe(document.documentElement,{childList:true,subtree:true});
setTimeout(addEntry,300);setTimeout(addEntry,1200);
})();
