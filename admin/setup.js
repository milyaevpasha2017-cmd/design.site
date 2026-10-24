(async () => {
  const message = document.querySelector('#setup-message');
  try {
    const response = await fetch('./settings.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Не удалось загрузить настройки.');
    const { auth_base_url: base } = await response.json();
    if (!base) {
      message.textContent = 'Панель подготовлена. Для входа осталось подключить авторизацию GitHub. Выполните инструкцию ниже и укажите адрес сервиса в admin/settings.json.';
      return;
    }
    const url = new URL(base);
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('В настройках нужен HTTPS-адрес сервиса авторизации без пути.');
    if (!window.CMS) throw new Error('Не удалось загрузить Decap CMS. Обновите страницу.');
    document.querySelector('#setup').hidden = true;
    window.CMS.init({ config: { backend: { base_url: url.origin } } });
  } catch (error) { message.textContent = error.message || 'Ошибка загрузки админки. Обновите страницу.'; }
})();
