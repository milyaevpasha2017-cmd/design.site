// Pure quiz rules: recommendations describe preferences, never a diagnosis or a quote.
export function quizResult(config, answers) {
  const selected = {};
  for (const question of config.questions) {
    const value = answers[question.id];
    if (question.multiple) {
      if (!Array.isArray(value) || !value.length || new Set(value).size !== value.length || value.some(id => !question.options.some(o => o[0] === id))) throw new Error('Выберите хотя бы один вариант.');
      selected[question.id] = question.options.filter(o => value.includes(o[0])).map(o => o[1]);
    } else {
      const option = question.options.find(o => o[0] === value);
      if (!option) throw new Error('Выберите вариант ответа.');
      selected[question.id] = option[1];
    }
  }
  const area = String(answers.area ?? '').trim();
  if (area && (!/^\d{1,5}(?:[.,]\d{1,2})?$/.test(area) || +area.replace(',', '.') < 10 || +area.replace(',', '.') > 10000)) throw new Error('Укажите площадь от 10 до 10 000 м² или оставьте поле пустым.');
  const profile = config.profiles[answers.mood], format = config.formats[answers.stage];
  const summary = config.questions.map(q => [q.title, Array.isArray(selected[q.id]) ? selected[q.id].join(', ') : selected[q.id]]);
  summary.push(['Примерная площадь', area ? area.replace(',', '.') + ' м²' : 'Пока не указана']);
  return {profile, format, summary, tips: answers.priorities.map(id => config.priorityTips[id]), message: 'Заявка из квиза «Какой интерьер вам близок?»\n' + summary.map(([label, value]) => label.replace(/\?$/, '') + ': ' + value).join('\n') + '\nНаправление: ' + profile.title + '\nПредварительный формат: ' + format[0]};
}
export function quizLeadMessage(summary, note = '') {
  if (!summary) throw new Error('Сначала завершите квиз.');
  return summary + (note.trim() ? '\n\nКомментарий клиента:\n' + note.trim() : '');
}
