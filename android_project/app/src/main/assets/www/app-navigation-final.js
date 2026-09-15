(function(){
'use strict';
if(window.__rihlaNavigationFinal)return;
window.__rihlaNavigationFinal=true;
var current=window.__rihlaCurrentScreen||document.querySelector('.screen.active')?.id||'auth';
var transitionLock=0;
function stateObj(){try{return typeof state!=='undefined'?state:(window.state||null)}catch(e){return null}}
function hasUser(){return !!window.__rihlaAuthUser || (typeof authUser!=='undefined'&&!!authUser)}
function needsOnboarding(){var s=stateObj();return !!(hasUser()&&s&&!s.onboardingComplete)}
function needsSetup(){var s=stateObj();return !!(hasUser()&&s&&s.onboardingComplete&&!s.setupComplete)}
function actual(){return window.__rihlaCurrentScreen||document.querySelector('.screen.active')?.id||current||'auth'}
function exists(id){return !!id&&!!document.getElementById(id)}
function hideAll(){document.querySelectorAll('.screen').forEach(function(e){e.classList.remove('active');e.style.setProperty('display','none','important');e.style.removeProperty('visibility');e.style.removeProperty('opacity');e.removeAttribute('aria-hidden')})}
function setOnly(id){var e=document.getElementById(id);if(!e)return false;hideAll();e.classList.add('active');e.style.setProperty('display','block','important');e.setAttribute('aria-hidden','false');current=id;window.__rihlaCurrentScreen=id;var n=document.getElementById('nav');if(n)n.style.setProperty('display',(hasUser()&&!['auth','onboarding','setup'].includes(id))?'flex':'none','important');document.querySelectorAll('#nav button[data-screen]').forEach(function(b){b.classList.toggle('active',b.dataset.screen===id)});return true}
function render(id){try{if(id==='home'&&window.renderHome)window.renderHome();else if(id==='plan'&&window.renderPlan)window.renderPlan();else if(id==='session'&&window.updateTimer)window.updateTimer();else if(id==='quizzes'){window.initAIQuizUI&&window.initAIQuizUI();window.renderAIQuiz&&window.renderAIQuiz();window.renderQuizzes&&window.renderQuizzes()}else if(id==='analysis'&&window.renderAnalysis)window.renderAnalysis();else if(id==='achievements'&&window.renderAchievements)window.renderAchievements();else if(id==='notifications'&&window.renderNotifications)window.renderNotifications();else if(id==='friends'){window.initRealtime&&window.initRealtime();var c=document.getElementById('myFriendCode');if(c)c.textContent=window.friendCode||'';window.renderRealtimeFriends&&window.renderRealtimeFriends()}}catch(e){console.warn('navigation render',id,e)}return true}
function go(id,source){if(!exists(id))return false;if(!hasUser()&&!['auth','onboarding','setup'].includes(id))return false;if(id==='home'&&source!=='user'&&(needsOnboarding()||needsSetup()))id=needsOnboarding()?'onboarding':'setup';if(source!=='user'&&id==='home'&&Date.now()<transitionLock&&actual()!=='home')return true;transitionLock=Date.now()+350;if(!setOnly(id))return false;render(id);return true}
function routeAfterAuth(){if(!hasUser())return go('auth','system');if(needsOnboarding())return go('onboarding','system');if(needsSetup())return go('setup','system');var a=actual();if(['auth','onboarding','setup'].includes(a)||!a)return go('home','system');return true}
function show(id){if(id==='home'&&needsOnboarding())return go('onboarding','system');if(id==='home'&&needsSetup())return go('setup','system');return go(id,id==='home'?'user':'code')}
window.rihlaNavigateFinal=function(id){return go(id,'user')};window.show=show;window.showScreen=show;
window.rihlaBack=function(){var a=actual();if(hasUser()&&!['home','auth','onboarding','setup'].includes(a)){go('home','code');return'handled'}if(hasUser()&&['onboarding','setup'].includes(a)){return'handled'}return'exit'};
window.rihlaRouteAfterAuth=routeAfterAuth;
function navClick(e){var b=e.target.closest('#nav button[data-screen],#nav button.plus');if(!b)return;var id=b.dataset.screen||(b.classList.contains('plus')?'session':'');if(!id)return;e.preventDefault();e.stopImmediatePropagation();go(id,'user')}
function install(){var n=document.getElementById('nav');if(n){n.__rihlaV10=true;n.__v12=true}if(n&&!n.__rihlaFinalNav){n.__rihlaFinalNav=true;n.querySelectorAll('button[data-screen],button.plus').forEach(function(b){b.removeAttribute('onclick')});n.addEventListener('click',navClick,true)}}
function reassert(){window.show=show;window.showScreen=show;window.rihlaNavigateFinal=function(id){return go(id,'user')}}
function boot(){install();reassert();[50,150,350,700,1200,2000,3500].forEach(function(t){setTimeout(function(){install();reassert()},t)});setTimeout(function(){routeAfterAuth()},2200)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
