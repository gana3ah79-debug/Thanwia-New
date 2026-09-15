(function(){
'use strict';
if(window.__rihlaFriendChallengeButtonsFixV1)return;
window.__rihlaFriendChallengeButtonsFixV1=true;
function invoke(btn){
  if(!btn||!btn.closest('#fc2Overlay'))return false;
  var oc=btn.getAttribute('onclick')||'';
  var m=oc.match(/window\.RIHLA_FC2\.([A-Za-z0-9_]+)\(([^)]*)\)/);
  if(!m||!window.RIHLA_FC2||typeof window.RIHLA_FC2[m[1]]!=='function')return false;
  var raw=(m[2]||'').trim(),args=[];
  if(raw){
    if(/^[-+]?\d+(?:\.\d+)?$/.test(raw))args=[Number(raw)];
    else if((raw[0]==='"'&&raw[raw.length-1]==='"')||(raw[0]==="'"&&raw[raw.length-1]==="'"))args=[raw.slice(1,-1)];
    else return false;
  }
  try{btn.setAttribute('data-fc2-action-used','1');window.RIHLA_FC2[m[1]].apply(window.RIHLA_FC2,args);return true}catch(e){console.warn('friend challenge button',e);return false}
}
function bind(){
  var o=document.getElementById('fc2Overlay');
  if(!o||o.__rihlaButtonsBound)return;
  o.__rihlaButtonsBound=true;
  o.addEventListener('click',function(e){
    var b=e.target.closest('button');
    if(!b||!b.closest('#fc2Overlay'))return;
    var oc=b.getAttribute('onclick')||'';
    if(!/window\.RIHLA_FC2\./.test(oc))return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();invoke(b);
  },true);
}
function scan(){bind()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();
[50,150,300,600,1000,2000,4000].forEach(function(t){setTimeout(scan,t)});
try{new MutationObserver(scan).observe(document.documentElement,{childList:true,subtree:true})}catch(e){}
})();
