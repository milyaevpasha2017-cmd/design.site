# Автоматические обновления Timeweb

`.github/workflows/timeweb.yml` доставляет проверенный выпуск из `main` на VPS
83.217.202.208. До завершения настройки workflow выключен переменной
`TIMEWEB_DEPLOY_ENABLED`; работающий сайт не затрагивается.

## Однократная настройка

1. Администратор загружает из одного проверенного коммита `vps/deploy.py` и
   `vps/setup-deploy.py`, затем запускает на VPS:
   `python3 /tmp/setup-deploy.py --installer /tmp/deploy.py`.
   Пример загрузки: `curl -4 -fL --connect-timeout 10 --max-time 60 URL -o FILE`.
   Использовать URL с SHA коммита, а не изменяемый `main`.
2. Скрипт создаёт пользователя `epiphany-deploy`, отдельный ключ
   `/root/.ssh/epiphany-actions`, root-owned обработчик
   `/usr/local/sbin/epiphany-deploy` и правило sudo только для него без аргументов.
   SSH-ключ запускает только этот обработчик, без shell/PTY/port forwarding.
   Личный ключ администратора не используется в CI.
3. В GitHub → Settings → Secrets and variables → Actions добавить repository secrets:
   - `TIMEWEB_SSH_KEY`: содержимое `/root/.ssh/epiphany-actions` (закрытый ключ).
   - `TIMEWEB_KNOWN_HOSTS`: строка с публичным ключом **самого сервера**,
     которую напечатал установщик. Она получена непосредственно из
     `/etc/ssh/ssh_host_ed25519_key.pub`; не заменять её непроверенным ssh-keyscan.
   Закрытый ключ передавать только в GitHub Secrets, не в чат/коммиты/скриншоты.
4. Во вкладке Variables создать `TIMEWEB_DEPLOY_ENABLED` со значением `true`.
5. Actions → Publish Timeweb site → Run workflow → main. Проверить успешный лог,
   `/healthz`, `/deployment.json` (SHA должен совпасть), главную страницу, favicon и
   вход в админку. Только после успешного первого запуска доставка считается активной.

GitHub connector не умеет записывать Actions secrets/variables: эти действия
администратор выполняет непосредственно в GitHub. До их установки ничего не публикуется.

## Что делает выпуск

CI получает полную историю Git, проверяет проект, строит frontend и snapshot,
проверяет frontend на секреты. Архив содержит готовый frontend и необходимые
runtime-файлы, без `.git`, env, БД и закрытых ключей. SHA записан в release.json и
публичный `/deployment.json`. Устаревший queued commit пропускается, когда есть новый.

Сервер принимает архив на stdin, проверяет пути/типы/размер, запрещает symlinks,
создаёт отдельный root-owned выпуск и online backup действующей SQLite. После
атомарного переключения `current` перезапускает `epiphany`, проверяет `/healthz`,
SHA, главную и форму входа через loopback с правильными Host/HTTPS заголовками.
Если проверка не проходит, возвращает предыдущую ссылку и перезапускает сервис.
Снимок БД хранится в `/var/backups/epiphany/before-deploy-*.sqlite`.
Рабочая SQLite при откате кода не заменяется: новые сохранения и сессии остаются.

Новые тексты/фото из админки уже публикуются сразу; последующий CI-выпуск включает
CMS-коммиты. Сохранение не должно ждать завершения CI. Обновление не меняет
`/etc/epiphany/server.env`, Nginx, DNS, TLS и systemd unit.

## Ограничения и обслуживание

Поддерживается текущая схема SQLite v1 и стандартный DATABASE_PATH; миграции требуют
отдельной проверки. Старые выпуски и резервные копии перед обновлением автоматически
не удаляются: контролировать свободное место. Резервные копии вне VPS остаются
отдельной задачей. Обновление root-owned обработчика требует отдельного запуска
установщика администратором; код из нового архива не запускается с root-правами.

Проверка CI не заменяет проверки настоящего VPS/Nginx/связи с GitHub; до первого
успешного запуска они не подтверждены. Перезапуск приложения может кратко прервать
запросы. Отказ питания/kill -9 во время активации требует ручной проверки `current`.

Отключение доставки: `TIMEWEB_DEPLOY_ENABLED=false` (уже начатый выпуск завершится).
Логи находятся в GitHub Actions и `journalctl -u epiphany`; значения env не выводить.
Существующие Cloudflare/Pages workflows этим изменением не отключаются.

Официальная документация:
- https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/control-deployments
- https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets
