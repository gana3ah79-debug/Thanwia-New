(function(){
'use strict';
/* Reserve navigation before the legacy core modules start.
   This prevents their capture listeners from taking control and also
   supplies the auth-route helpers that V10 expects during its async boot. */
window.__rihlaNavigationReserved=true;
function auth(){return !!window.__rihlaAuthUser || !!window.authUser}
function st(){try{return typeof state!=='undefined'?state:(window.state||null)}catch(e){return null}}
window.needsOnboarding=function(){var s=st();return !!(auth()&&s&&!s.onboardingComplete)};
window.needsSetup=function(){var s=st();return !!(auth()&&s&&s.onboardingComplete&&!s.setupComplete)};
function reserveNav(){var n=document.getElementById('nav');if(!n)return;n.__rihlaV10=true;n.__v12=true;n.__rihlaNavigationReserved=true;n.querySelectorAll('button[data-screen],button.plus').forEach(function(b){b.removeAttribute('onclick')})}
function boot(){reserveNav();setTimeout(reserveNav,0);setTimeout(reserveNav,50);setTimeout(reserveNav,250);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
