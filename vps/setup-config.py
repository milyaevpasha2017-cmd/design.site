#!/usr/bin/env python3
"""Interactive first-time configuration. Never accept secrets as CLI arguments."""
import getpass
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import sys
import tempfile
import urllib.error
import urllib.request

TARGET = Path('/etc/epiphany/server.env')
REPO = 'milyaevpasha2017-cmd/design.site'


def password_hash(password):
    if not isinstance(password, str) or not 12 <= len(password) <= 512:
        raise ValueError('Пароль должен содержать от 12 до 512 символов.')
    salt = secrets.token_bytes(32)
    derived = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 100000)
    return f'pbkdf2-sha256$100000${salt.hex()}${derived.hex()}'


def valid_token(token):
    return isinstance(token, str) and re.fullmatch(r'(?:github_pat_[A-Za-z0-9_]{20,450}|ghp_[A-Za-z0-9]{20,100})', token) is not None


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, *args, **kwargs):
        return None


def check_repository(token):
    request = urllib.request.Request(
        f'https://api.github.com/repos/{REPO}/contents/content/settings.json?ref=main',
        headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json',
                 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Epiphany-VPS-Setup'})
    try:
        with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
            result = json.loads(response.read(1000000))
        if not isinstance(result, dict) or result.get('type') != 'file' or not result.get('sha'):
            raise ValueError('Хранилище вернуло неожиданный ответ. Конфигурация не создана.')
    except (urllib.error.URLError, TimeoutError, OSError, json.JSONDecodeError):
        raise ValueError('Не удалось прочитать репозиторий через GitHub API. Проверьте токен и соединение VPS с GitHub. Конфигурация не создана.') from None


def configuration(hashed, token):
    if re.fullmatch(r'pbkdf2-sha256\$100000\$[a-f0-9]{64}\$[a-f0-9]{64}', hashed or '') is None or not valid_token(token):
        raise ValueError('Некорректная конфигурация.')
    # systemd EnvironmentFile reads $ literally; this is not a shell script.
    return '\n'.join([
        'SITE_ORIGIN=https://epiphany-int.ru', 'ADMIN_USERNAME=admin',
        'ADMIN_PASSWORD_HASH=' + hashed, 'GITHUB_CONTENT_TOKEN=' + token,
        'CONTENT_REPO=' + REPO, 'CONTENT_BRANCH=main',
        'DATABASE_PATH=/var/lib/epiphany/state.sqlite', 'PORT=3000', ''])


def write_once(target, contents):
    parent = target.parent
    if parent.is_symlink():
        raise ValueError('Каталог конфигурации не должен быть символической ссылкой.')
    parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if parent.stat().st_uid != os.geteuid():
        raise ValueError('Некорректный владелец каталога конфигурации.')
    parent.chmod(0o700)
    descriptor, temporary = tempfile.mkstemp(prefix='.setup-', dir=parent)
    try:
        with os.fdopen(descriptor, 'w', encoding='utf-8') as stream:
            os.fchmod(stream.fileno(), 0o600)
            stream.write(contents)
            stream.flush()
            os.fsync(stream.fileno())
        # Atomic and exclusive: an existing configuration/symlink is never replaced.
        os.link(temporary, target)
    finally:
        os.unlink(temporary)


def main():
    if len(sys.argv) != 1 or os.geteuid() != 0 or not sys.stdin.isatty():
        raise ValueError('Запустите python3 vps/setup-config.py от root в интерактивной консоли. Не передавайте пароль или токен в командной строке.')
    if TARGET.exists() or TARGET.is_symlink():
        raise ValueError('Конфигурация уже существует. Она не изменена; повторная первоначальная настройка не требуется.')
    print('Первоначальная настройка Epiphany Interior. Логин админки: admin.')
    print('Пароль и токен при вводе не отображаются. Вставка в Timeweb: Ctrl+Shift+V.')
    print('Можно задать прежний пароль админки, если он содержит не менее 12 символов.')
    password = getpass.getpass('Пароль админки сайта (12–512 символов): ')
    hashed = password_hash(password)
    if getpass.getpass('Повторите пароль админки: ') != password:
        raise ValueError('Пароли не совпали. Конфигурация не создана.')
    del password
    token = getpass.getpass('GitHub-токен для design.site: ').strip()
    if not valid_token(token):
        raise ValueError('Формат токена не распознан. Конфигурация не создана.')
    print('Проверяю чтение репозитория через GitHub API…')
    check_repository(token)
    write_once(TARGET, configuration(hashed, token))
    print('Готово: /etc/epiphany/server.env создан с правами 600. Пароль сохранён только как солёный хеш.')
    print('Чтение GitHub проверено. Право Contents: Read and write должно быть выбрано при создании токена; запись этим скриптом не выполняется.')
    print('Сервис ещё не запущен, DNS и действующий сайт не изменены.')


if __name__ == '__main__':
    try:
        main()
    except (ValueError, OSError) as error:
        # Do not print raw exception details, filenames or upstream responses:
        # they can accidentally include credentials supplied by the operator.
        message = str(error) if isinstance(error, ValueError) else 'Не удалось записать конфигурацию. Проверьте права и свободное место; секреты не выводились.'
        print(message, file=sys.stderr)
        sys.exit(1)
    except (KeyboardInterrupt, EOFError):
        print('\nНастройка отменена. Сервис и DNS не изменены.', file=sys.stderr)
        sys.exit(1)
