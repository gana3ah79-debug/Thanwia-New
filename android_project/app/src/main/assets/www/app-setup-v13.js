(function(){
'use strict';
if(window.__rihlaSetupV13)return;
window.__rihlaSetupV13=true;
function stateObj(){try{if(typeof state!=='undefined')return state;return null}catch(e){return null}}
function saveState(){try{if(typeof save==='function')save();else{var s=stateObj();if(s)localStorage.setItem('rihlaState',JSON.stringify(s))}}catch(e){}}
function authenticated(){return !!window.__rihlaAuthUser || (typeof authUser!=='undefined'&&!!authUser)}
function needsOnboarding(){var s=stateObj();return !!(authenticated()&&s&&!s.onboardingComplete)}
function needsSetup(){var s=stateObj();return !!(authenticated()&&s&&s.onboardingComplete&&!s.setupComplete)}
function fillSetup(){
 var s=stateObj();if(!s)return;
 var name=document.getElementById('name'),track=document.getElementById('track'),date=document.getElementById('examDate'),hours=document.getElementById('hours');
 if(name)name.value=s.name||'';if(track)track.value=s.track||'رياضة';if(date)date.value=s.examDate||'';if(hours)hours.value=s.hours||6;
 try{if(typeof renderSubjects==='function')renderSubjects()}catch(e){}
}
function go(id){try{if(typeof window.rihlaNavigateV12==='function')return window.rihlaNavigateV12(id);if(typeof window.show==='function')return window.show(id)}catch(e){}return false}
function openOnboarding(){if(!needsOnboarding())return;go('onboarding')}
function openSetup(){if(!needsSetup())return;fillSetup();setTimeout(function(){if(needsSetup())go('setup')},80)}
function markOnboardingDone(){var s=stateObj();if(!s)return false;s.onboardingComplete=true;saveState();return true}
function bindStart(){document.addEventListener('click',function(e){var b=e.target.closest('button,a,[role="button"]');if(!b)return;var t=(b.textContent||'').replace(/\s+/g,' ').trim();if(t.indexOf('ابدأ الآن')===-1)return;if(!needsOnboarding())return;e.preventDefault();e.stopImmediatePropagation();markOnboardingDone();openSetup()},true)}
function wrapFinishSetup(){if(typeof finishSetup!=='function'||finishSetup.__v13)return;var original=finishSetup;function wrapped(){var result=original.apply(this,arguments);var s=stateObj();setTimeout(function(){if(s&&s.name&&s.track&&Array.isArray(s.selected)&&s.selected.length){s.setupComplete=true;saveState();go('home')}else if(needsSetup())openSetup()},120);return result}wrapped.__v13=true;window.finishSetup=wrapped}
function guardNavigation(){
 if(typeof window.rihlaNavigateV12==='function'&&!window.rihlaNavigateV12.__v13){var nav=window.rihlaNavigateV12;function guarded(id){if(id==='home'){if(needsOnboarding()){openOnboarding();return true}if(needsSetup()){openSetup();return true}}return nav.apply(this,arguments)}guarded.__v13=true;window.rihlaNavigateV12=guarded}
 if(typeof window.show==='function'&&!window.show.__v13){var sh=window.show;function gs(id){if(id==='home'){if(needsOnboarding()){openOnboarding();return true}if(needsSetup()){openSetup();return true}}return sh.apply(this,arguments)}gs.__v13=true;window.show=gs;window.showScreen=gs}
}
function route(){guardNavigation();wrapFinishSetup();if(needsOnboarding())openOnboarding();else if(needsSetup())openSetup()}
function boot(){bindStart();route();setTimeout(route,100);setTimeout(route,500);setTimeout(route,1200);setTimeout(route,2500)}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
