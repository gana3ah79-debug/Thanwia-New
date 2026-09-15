(function(){
'use strict';
if(window.__rihlaCoreV12)return;window.__rihlaCoreV12=true;
var navLockUntil=0;
var ids=['onboarding','setup','auth','home','plan','session','quizzes','analysis','achievements','notifications','friends','friendChallenge','quiz'];
function stateNeedsSetup(){try{return !!(window.__rihlaAuthUser&&window.state&&!window.state.setupComplete)}catch(e){return false}}
function activeScreen(){return window.__rihlaCurrentScreen||document.querySelector('.screen.active')?.id||''}
function go(id,explicit){
  if(!ids.includes(id)||!document.getElementById(id))return false;
  if(!window.__rihlaAuthUser&&!['onboarding','setup','auth'].includes(id))return false;
  if(id==='home'&&!explicit&&stateNeedsSetup())id='setup';
  if(!explicit&&id==='home'&&Date.now()<navLockUntil&&activeScreen()!=='home')return true;
  navLockUntil=Date.now()+1200;
  var all=document.querySelectorAll('.screen');
  all.forEach(function(e){e.classList.remove('active');e.style.setProperty('display','none','important');e.style.removeProperty('visibility');e.style.removeProperty('opacity')});
  var el=document.getElementById(id);el.classList.add('active');el.style.setProperty('display','block','important');
  window.__rihlaCurrentScreen=id;
  var nav=document.getElementById('nav');if(nav)nav.style.setProperty('display',(window.__rihlaAuthUser&&id!=='onboarding'&&id!=='setup'&&id!=='auth')?'flex':'none','important');
  document.querySelectorAll('#nav button[data-screen]').forEach(function(b){b.classList.toggle('active',b.dataset.screen===id)});
  try{
    if(id==='home'&&window.renderHome)window.renderHome();
    else if(id==='plan'&&window.renderPlan)window.renderPlan();
    else if(id==='session'&&window.updateTimer)window.updateTimer();
    else if(id==='quizzes'){window.initAIQuizUI&&window.initAIQuizUI();window.renderAIQuiz&&window.renderAIQuiz();window.renderQuizzes&&window.renderQuizzes()}
    else if(id==='analysis'&&window.renderAnalysis)window.renderAnalysis();
    else if(id==='achievements'&&window.renderAchievements)window.renderAchievements();
    else if(id==='notifications'&&window.renderNotifications)window.renderNotifications();
    else if(id==='friends'){window.initRealtime&&window.initRealtime();window.renderRealtimeFriends&&window.renderRealtimeFriends()}
  }catch(e){console.warn('navigation render',e)}
  return true;
}
window.rihlaNavigateV12=function(id){return go(id,true)};
window.show=function(id){return go(id,id==='home')};
window.showScreen=window.show;
function install(){
  var nav=document.getElementById('nav');
  if(nav&&!nav.__v12&&!window.__rihlaFinalNavigationReserved){
    nav.__v12=true;
    nav.querySelectorAll('button[data-screen],button.plus').forEach(function(b){b.removeAttribute('onclick')});
    nav.addEventListener('click',function(e){var b=e.target.closest('button[data-screen],button.plus');if(!b)return;var id=b.dataset.screen||(b.classList.contains('plus')?'session':'');if(!id)return;e.preventDefault();e.stopImmediatePropagation();go(id,true)},true);
  }
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
setTimeout(install,50);setTimeout(install,500);setTimeout(install,1500);
})();
