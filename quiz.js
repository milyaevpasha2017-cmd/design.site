import {quizResult} from './quiz-model.mjs';
const goal = name => { try { window.ym?.(113965901, 'reachGoal', name); } catch {} };
export function initQuiz() {
  const root = document.querySelector('#interior-quiz'); if (!root) return;
  const $ = selector => document.querySelector(selector);
  const config = JSON.parse($('#quiz-data').textContent), questions = $('#quiz-questions'), lead = $('#brief-form');
  const steps = [...questions.querySelectorAll('fieldset')], next = $('#quiz-next'), back = $('#quiz-back'), error = $('#quiz-error');
  let step = 0, started = false, completed = false;
  const focusStep = () => {
    steps.forEach((field, i) => { field.hidden = i !== step; });
    $('#quiz-count').textContent = `Шаг ${step + 1} из ${steps.length}`;
    $('#quiz-progress').value = step + 1;
    next.textContent = step === steps.length - 1 ? 'Показать результат →' : 'Далее →';
    back.disabled = step === 0; error.hidden = true;
    const legend = steps[step].querySelector('legend'); legend.tabIndex = -1;
    legend.focus({preventScroll:true}); $('#interior-quiz').scrollIntoView({block:'start'});
  };
  const answers = () => {
    const values = new FormData(questions), data = Object.fromEntries(values);
    data.priorities = values.getAll('priorities'); return data;
  };
  const text = (id, value) => { $(id).textContent = value; };
  questions.addEventListener('change', () => {
    if (!started) { started = true; goal('quiz_started'); }
    error.hidden = true;
  });
  questions.addEventListener('input', () => { error.hidden = true; });
  back.addEventListener('click', () => { if (step > 0) {step--; focusStep();} });
  questions.addEventListener('submit', event => {
    event.preventDefault();
    const q = config.questions[step], values = new FormData(questions);
    if (!values.getAll(q.id).length) {error.textContent = q.multiple ? 'Выберите хотя бы один вариант.' : 'Выберите вариант ответа.'; error.hidden = false; error.focus(); return;}
    if (step < steps.length - 1) {step++; focusStep(); return;}
    let result;
    try { result = quizResult(config, answers()); }
    catch (failure) {error.textContent = failure.message; error.hidden = false; error.focus(); return;}
    text('#quiz-result-title', result.profile.title); text('#quiz-result-text', result.profile.text);
    text('#quiz-format-title', result.format[0]); text('#quiz-format-text', result.format[1]);
    const tips = $('#quiz-tips'); tips.replaceChildren();
    for (const value of [...result.profile.tips, ...result.tips]) {const li = document.createElement('li'); li.textContent = value; tips.append(li);}
    const summary = $('#quiz-answer-list'); summary.replaceChildren();
    for (const [label, value] of result.summary) {const dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = label; dd.textContent = value; summary.append(dt, dd);}
    lead.dataset.quizSummary = result.message;
    // A new result is a new submission, including after a previously accepted request.
    lead.dispatchEvent(new Event('input', {bubbles:true}));
    questions.hidden = true; $('#quiz-result').hidden = false; $('#quiz-contact').hidden = false;
    $('#quiz-result-title').focus({preventScroll:true}); root.scrollIntoView({block:'start'});
    if (!completed) {completed = true; goal('quiz_completed');}
  });
  const edit = $('#quiz-edit');
  new MutationObserver(() => { edit.disabled = lead.getAttribute('aria-busy') === 'true'; }).observe(lead, {attributes:true, attributeFilter:['aria-busy']});
  edit.addEventListener('click', () => {
    if (lead.getAttribute('aria-busy') === 'true') return;
    $('#quiz-result').hidden = true; $('#quiz-contact').hidden = true;
    delete lead.dataset.quizSummary; questions.hidden = false; step = 0; focusStep();
  });
  // Quiz preferences stay in this page's memory until the visitor explicitly submits.
  lead.querySelector('[name="message"]').maxLength = 1500;
  root.hidden = false;
}
