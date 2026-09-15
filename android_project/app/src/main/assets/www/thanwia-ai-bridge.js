/* Thanwia-New — AI Quiz bridge
 * Loads the new AI question engine into the existing Rihla/Thanwia UI.
 */
(function () {
  'use strict';
  if (window.__thanwiaAIConnected) return;
  window.__thanwiaAIConnected = true;

  function callEngine(options) {
    if (!window.ThanwiaAIQuestionEngine?.generate) {
      return Promise.reject(new Error('محرك أسئلة AI غير محمل بعد.'));
    }
    return window.ThanwiaAIQuestionEngine.generate(options || {});
  }

  window.generateAIQuiz = callEngine;
  window.generateNewAIQuiz = callEngine;

  // Compatibility with the existing quiz UI.
  window.generateThanwiaQuiz = async function (options) {
    const quiz = await callEngine(options);
    try {
      window.rihlaState = window.rihlaState || {};
      window.rihlaState.lastAIQuiz = quiz;
      if (typeof window.writeState === 'function') window.writeState();
    } catch (_) {}
    if (typeof window.renderAIQuiz === 'function') window.renderAIQuiz();
    return quiz;
  };

  document.addEventListener('DOMContentLoaded', function () {
    // Expose the engine status for the UI/debug panel without changing the UI.
    window.__thanwiaAIStatus = 'connected';
  });
})();
