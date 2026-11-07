#!/usr/bin/env python3
"""Add HTTPS and canonical redirects for www without editing the live site vhost."""
import fcntl
import http.client
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import ssl
import subprocess
import sys
import tempfile
import time

DOMAIN = 'epiphany-int.ru'
ALIAS = 'www.' + DOMAIN
ADDRESS = '83.217.202.208'
CONFIG = Path('/etc/nginx/conf.d/epiphany-www.conf')
WEBROOT = Path('/var/www/letsencrypt')
CERT = Path('/etc/letsencrypt/live/epiphany-int-www')
HOOK = Path('/etc/letsencrypt/renewal-hooks/deploy/epiphany-www-nginx')
MARKER = '# Managed by Epiphany setup-www.py\n'


def command(*args, timeout=30):
    result = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    if result.returncode:
        # Nginx config and Certbot diagnostics may include local configuration.
        raise RuntimeError('Не выполнена команда ' + Path(args[0]).name +
                           '. Проверьте журналы Nginx/Certbot. Настройка остановлена.')
    return result.stdout


def configuration(tls=False):
    text = MARKER + f'''server {{
    listen 80;
    server_name {ALIAS};
    location ^~ /.well-known/acme-challenge/ {{
        root {WEBROOT};
        default_type text/plain;
        try_files $uri =404;
    }}
    location / {{ return 301 https://{DOMAIN}$request_uri; }}
}}
'''
    if tls:
        text += f'''server {{
    listen 443 ssl;
    server_name {ALIAS};
    ssl_certificate {CERT}/fullchain.pem;
    ssl_certificate_key {CERT}/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    return 301 https://{DOMAIN}$request_uri;
}}
'''
    return text


def atomic_write(path, content, mode=0o644):
    path.parent.mkdir(parents=True, exist_ok=True)
    handle, temporary = tempfile.mkstemp(prefix='.' + path.name + '-', dir=path.parent)
    try:
        with os.fdopen(handle, 'wb') as output:
            output.write(content)
            output.flush()
            os.fsync(output.fileno())
        os.chmod(temporary, mode)
        os.replace(temporary, path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def preflight(dump):
    # Refuse to overwrite an unrelated config or duplicate an existing www vhost.
    if CONFIG.is_symlink() or (CONFIG.exists() and not CONFIG.read_text().startswith(MARKER)):
        raise RuntimeError('Файл epiphany-www.conf уже занят другой настройкой.')
    included = False
    chunks = re.split(r'^# configuration file (.+):\s*$', dump, flags=re.M)
    for index in range(1, len(chunks), 2):
        source, text = chunks[index:index + 2]
        text = re.sub(r'#.*', '', text)
        included |= bool(re.search(r'include\s+/etc/nginx/conf\.d/\*\.conf\s*;', text))
        for names in re.findall(r'\bserver_name\s+([^;]+);', text):
            if ALIAS in [name.strip('\"\'') for name in names.split()] and source != str(CONFIG):
                raise RuntimeError('www уже настроен в другом файле Nginx; нужен разбор конфигурации.')
    if not included:
        raise RuntimeError('Nginx не подключает /etc/nginx/conf.d/*.conf. Ничего не изменено.')
    for name in (DOMAIN, ALIAS):
        addresses = {row[4][0] for row in socket.getaddrinfo(name, 443, type=socket.SOCK_STREAM)}
        if addresses != {ADDRESS}:
            raise RuntimeError('DNS ' + name + ' не указывает только на текущий VPS. Ничего не изменено.')


def local_request(host, path, tls=False):
    if tls:
        connection = http.client.HTTPSConnection(host, timeout=10, context=ssl.create_default_context())
        # Keep hostname/SNI/certificate validation; connect directly to this VPS.
        connection._create_connection = lambda address, timeout, source_address=None: socket.create_connection(('127.0.0.1', 443), timeout)
    else:
        connection = http.client.HTTPConnection('127.0.0.1', timeout=10)
    try:
        connection.request('GET', path, headers={'Host': host})
        response = connection.getresponse()
        return response.status, response.getheader('Location'), response.read(1024)
    finally:
        connection.close()


def reload_nginx(nginx):
    command(nginx, '-t')
    command('systemctl', 'reload', 'nginx')


def check_redirect(tls=False):
    path = '/projects/modernretro/?source=www-check'
    # A reload returns before old Nginx workers have finished retiring.
    for attempt in range(10):
        try:
            status, location, _ = local_request(ALIAS, path, tls)
            if status == 301 and location == 'https://' + DOMAIN + path:
                return
        except (OSError, http.client.HTTPException):
            pass
        if attempt != 9:
            time.sleep(0.2)
    raise RuntimeError('Не прошла проверка перенаправления www.')


def configure(nginx, certbot, openssl):
    preflight(command(nginx, '-T'))
    status, _, body = local_request(DOMAIN, '/healthz', True)
    if status != 200 or body.strip() != b'ok':
        raise RuntimeError('Основной сайт не прошёл проверку. Ничего не изменено.')
    hook_text = ('#!/bin/sh\n# Epiphany certificate renewal hook\nset -eu\n' +
                 nginx + ' -t\nsystemctl reload nginx\n').encode()
    if HOOK.is_symlink() or (HOOK.exists() and HOOK.read_bytes() != hook_text):
        raise RuntimeError('Файл обработчика продления уже занят другой настройкой.')
    previous = CONFIG.read_bytes() if CONFIG.exists() else None
    previous_hook = HOOK.read_bytes() if HOOK.exists() else None
    backup = None
    if previous is not None:
        backup = CONFIG.with_name(CONFIG.name + '.backup-' + secrets.token_hex(6))
        atomic_write(backup, previous, 0o600)
    try:
        # On a repeat run keep the already working HTTPS alias while renewing.
        keep_tls = previous is not None and 'listen 443 ssl;' in previous.decode()
        atomic_write(CONFIG, configuration(keep_tls).encode())
        reload_nginx(nginx)
        check_redirect()
        challenge = WEBROOT / '.well-known/acme-challenge' / ('epiphany-' + secrets.token_hex(16))
        challenge.parent.mkdir(parents=True, exist_ok=True)
        try:
            atomic_write(challenge, b'epiphany-domain-check\n')
            status, _, body = local_request(ALIAS, '/.well-known/acme-challenge/' + challenge.name)
            if status != 200 or body.strip() != b'epiphany-domain-check':
                raise RuntimeError('Путь проверки сертификата недоступен. Ничего не активировано.')
        finally:
            challenge.unlink(missing_ok=True)
        # Separate certificate: the working main-domain certificate stays intact.
        command(certbot, 'certonly', '--webroot', '--webroot-path', str(WEBROOT),
                '--cert-name', CERT.name, '-d', ALIAS,
                '--non-interactive', '--keep-until-expiring', timeout=240)
        for name in ('fullchain.pem', 'privkey.pem'):
            if not (CERT / name).is_file():
                raise RuntimeError('Certbot не создал сертификат для www.')
        matched = command(openssl, 'x509', '-in', str(CERT / 'fullchain.pem'), '-noout', '-checkhost', ALIAS)
        # OpenSSL x509 may return exit code 0 even when the hostname differs.
        if 'Hostname ' + ALIAS + ' does match certificate' not in matched:
            raise RuntimeError('Сертификат не подтверждает домен www.')
        command(openssl, 'x509', '-in', str(CERT / 'fullchain.pem'), '-noout', '-checkend', '86400')
        atomic_write(HOOK, hook_text, 0o755)
        atomic_write(CONFIG, configuration(True).encode())
        reload_nginx(nginx)
        check_redirect(True)
        status, _, body = local_request(DOMAIN, '/healthz', True)
        if status != 200 or body.strip() != b'ok':
            raise RuntimeError('Основной сайт не прошёл итоговую проверку.')
    except BaseException:
        if previous is None:
            CONFIG.unlink(missing_ok=True)
        else:
            atomic_write(CONFIG, previous)
        if previous_hook is None:
            HOOK.unlink(missing_ok=True)
        else:
            atomic_write(HOOK, previous_hook, 0o755)
        reload_nginx(nginx)
        raise
    print('Готово: HTTP и HTTPS www перенаправляются на https://' + DOMAIN + '/ с сохранением пути и параметров.')
    print('Основной сайт проверен. Обработчик обновления сертификата установлен.')
    if backup:
        print('Предыдущая настройка сохранена: ' + str(backup))


def main():
    if os.geteuid() != 0:
        raise RuntimeError('Запустите от root или через sudo.')
    executables = [shutil.which(name) for name in ('nginx', 'certbot', 'openssl')]
    if not all(executables):
        raise RuntimeError('На сервере нужны nginx, certbot и openssl. Ничего не изменено.')
    os.umask(0o022)
    with Path('/run/lock/epiphany-www.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        configure(*executables)


if __name__ == '__main__':
    try:
        main()
    except (Exception, KeyboardInterrupt) as error:
        print(str(error) if isinstance(error, RuntimeError) else
              'Настройка остановлена. Проверьте Nginx и журнал Certbot; секреты не выводились.', file=sys.stderr)
        raise SystemExit(1)
