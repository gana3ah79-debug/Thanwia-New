(function(){
'use strict';
if(window.__rihlaHardNavV3)return;
window.__rihlaHardNavV3=true;
window.__rihlaFinalNavigationReserved=true;
var intentUntil=0;
var ids=['onboarding','setup','auth','home','plan','session','quizzes','analysis','achievements','notifications','friends','friendChallenge','quiz'];
function user(){return !!window.__rihlaAuthUser||!!window.authUser}
function stateObj(){try{return typeof state!=='undefined'?state:(window.state||null)}catch(e){return null}}
function only(id){var el=document.getElementById(id);if(!el)return false;document.querySelectorAll('.screen').forEach(function(x){x.classList.remove('active');x.style.setProperty('display','none','important')});el.classList.add('active');el.style.setProperty('display','block','important');window.__rihlaCurrentScreen=id;var nav=document.getElementById('nav');if(nav)nav.style.setProperty('display',(user()&&!['auth','onboarding','setup'].includes(id))?'flex':'none','important');document.querySelectorAll('#nav button[data-screen]').forEach(function(b){b.classList.toggle('active',b.dataset.screen===id)});return true}
function render(id){try{if(id==='home'&&window.renderHome)window.renderHome();else if(id==='plan'&&window.renderPlan)window.renderPlan();else if(id==='session'&&window.updateTimer)window.updateTimer();else if(id==='quizzes'){window.initAIQuizUI&&window.initAIQuizUI();window.renderAIQuiz&&window.renderAIQuiz();window.renderQuizzes&&window.renderQuizzes()}else if(id==='analysis'&&window.renderAnalysis)window.renderAnalysis();else if(id==='achievements'&&window.renderAchievements)window.renderAchievements();else if(id==='notifications'&&window.renderNotifications)window.renderNotifications();else if(id==='friends'){window.initRealtime&&window.initRealtime();window.renderRealtimeFriends&&window.renderRealtimeFriends()}}catch(e){console.warn('hard nav render',e)}}
function go(id,kind){if(!ids.includes(id)||!document.getElementById(id))return false;if(!user()&&!['auth','onboarding','setup'].includes(id))return false;if(kind==='user')intentUntil=Date.now()+2500;if(kind!=='user'&&id==='home'&&Date.now()<intentUntil)return false;return only(id)&&(render(id),true)}
function show(id){return go(id,id==='home'?'user':'code')}
window.rihlaNavigateFinal=function(id){return go(id,'user')};window.show=show;window.showScreen=show;
window.rihlaRouteAfterAuth=function(){if(!user())return go('auth','system');var s=stateObj();if(s&&s.onboardingComplete===false)return go('onboarding','system');if(s&&s.onboardingComplete&&s.setupComplete===false)return go('setup','system');var a=window.__rihlaCurrentScreen||document.querySelector('.screen.active')?.id||'';if(!a||['auth','onboarding','setup'].includes(a))return go('home','system');return true};
function click(e){var b=e.target.closest('#nav button[data-screen],#nav button.plus');if(!b)return;var id=b.dataset.screen||(b.classList.contains('plus')?'session':'');if(!id)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();intentUntil=Date.now()+2500;go(id,'user')}
function install(){var n=document.getElementById('nav');if(!n)return;n.__rihlaV10=true;n.__v12=true;n.__rihlaFinalNav=true;n.querySelectorAll('button[data-screen],button.plus').forEach(function(b){b.removeAttribute('onclick')});if(!window.__rihlaHardNavBound){window.__rihlaHardNavBound=true;document.addEventListener('click',click,true)}}
function guard(){install();window.show=show;window.showScreen=show;window.rihlaNavigateFinal=function(id){return go(id,'user')}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',guard);else guard();[50,150,300,600,1000,1800,3000,5000].forEach(function(t){setTimeout(guard,t)});
})();