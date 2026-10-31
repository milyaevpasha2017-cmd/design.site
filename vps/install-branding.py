#!/usr/bin/env python3
"""Install only the supplied branding into a new VPS release, retaining live content.

Run from an unpacked trusted repository archive. No credentials are read or printed.
--prepare-only --root PATH prepares a disposable release without touching services.
"""
import argparse
from datetime import datetime, timezone
import fcntl
import os
from pathlib import Path
import re
import shutil
import subprocess
import time
import urllib.request

SOURCE=Path(__file__).resolve().parents[1]
VERSION='epiphany-1'
ICONS='<link rel="icon" type="image/x-icon" href="/favicon.ico?v=epiphany-1"><link rel="icon" type="image/png" sizes="32x32" href="/assets/branding/icon-32.png?v=epiphany-1"><link rel="icon" type="image/png" sizes="192x192" href="/assets/branding/icon-192.png?v=epiphany-1"><link rel="apple-touch-icon" sizes="180x180" href="/assets/branding/icon-180.png?v=epiphany-1">'
MARK='<img class="brand-mark" src="/assets/branding/logo-mark.png" width="64" height="74" alt="" aria-hidden="true">'

def prepare(current,release):
    shutil.copytree(current,release,symlinks=True,ignore=shutil.ignore_patterns('.git','node_modules','__pycache__'))
    static=release/'_site-vps'
    if not static.is_dir():raise RuntimeError('В текущем выпуске нет _site-vps. Обслуживаемый сайт не изменён.')
    renderer=release/'site-worker/src/render.mjs';text=renderer.read_text()
    fresh=(SOURCE/'site-worker/src/render.mjs').read_text()
    logo=re.search(r'^    const logo=.*;$',fresh,re.M)
    if not logo:raise RuntimeError('Не найден шаблон нового логотипа.')
    text,count=re.subn(r'^    const logo=.*;$',lambda _:logo.group(),text,count=1,flags=re.M)
    if count!=1:raise RuntimeError('Неизвестная версия шаблона VPS. Обслуживаемый сайт не изменён.')
    needle='<meta name="theme-color" content="#f5f3ee">'
    if VERSION not in text:
        if needle not in text:raise RuntimeError('Не найден заголовок страницы VPS.')
        text=text.replace(needle,needle+ICONS)
    renderer.write_text(text)
    css=(SOURCE/'assets/branding/branding.css').read_text()
    for target in [release/'style.css',static/'style.css']:
        if target.exists():
            old=target.read_text()
            if '.logo-with-mark{' not in old:target.write_text(old+'\n'+css)
    for folder in [release/'assets/branding',static/'assets/branding']:
        folder.mkdir(parents=True,exist_ok=True)
        folder.chmod(0o755)
        for file in (SOURCE/'assets/branding').iterdir():
            if file.is_file():shutil.copy2(file,folder/file.name)
    shutil.copy2(SOURCE/'assets/branding/favicon.ico',static/'favicon.ico')
    # Preserve built content and form-data JSON; only replace the existing logo anchors.
    pattern=re.compile(r'<a class="logo" href="([^"]*)"><span class="brand-name">(.*?)</span><span>(.*?)</span></a>',re.S)
    for target in list(static.rglob('*.html'))+list((release/'password-admin').glob('*.html')):
        text=target.read_text()
        if VERSION not in text:text=text.replace('</head>',ICONS+'</head>',1)
        text=pattern.sub(lambda m:'<a class="logo logo-with-mark" href="'+m[1]+'">'+MARK+'<span class="brand-wordmark"><span class="brand-name">'+m[2]+'</span><span class="brand-subtitle">'+m[3]+'</span></span></a>',text)
        target.write_text(text)
    subprocess.run(['node','--check',str(renderer)],check=True)
    if 'logo-with-mark' not in (static/'index.html').read_text():raise RuntimeError('Проверка логотипа в HTML не прошла.')
    return release

def switch(root,target):
    link=root/('.current-branding-'+str(os.getpid()))
    link.symlink_to(target)
    os.replace(link,root/'current')

def healthy():
    for attempt in range(12):
        try:
            headers={'Host':'epiphany-int.ru','X-Forwarded-Proto':'https'}
            req=urllib.request.Request('http://127.0.0.1:3000/healthz',headers=headers)
            with urllib.request.urlopen(req,timeout=3) as response:
                if response.read().strip()!=b'ok':raise RuntimeError('Health check failed')
            for path,expected in [('/',b'logo-with-mark'),('/style.css',b'.logo-with-mark{'),('/assets/branding/logo-mark.png',b'\x89PNG'),('/favicon.ico',b'\x00\x00\x01\x00')]:
                req=urllib.request.Request('http://127.0.0.1:3000'+path,headers=headers)
                with urllib.request.urlopen(req,timeout=3) as response:
                    if expected not in response.read():raise RuntimeError('Branding check failed: '+path)
            return
        except Exception:
            if attempt==11:raise
            time.sleep(1)

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=Path('/opt/epiphany'))
    parser.add_argument('--prepare-only',action='store_true')
    args=parser.parse_args();root=args.root.resolve();link=root/'current'
    if not args.prepare_only and os.geteuid()!=0:raise SystemExit('Запустите через sudo.')
    if not link.is_symlink():raise SystemExit('Ожидалась ссылка current на действующий выпуск. Сайт не изменён.')
    current=link.resolve(strict=True)
    if not current.is_relative_to(root/'releases'):raise SystemExit('Действующий выпуск вне releases. Сайт не изменён.')
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    release=root/'releases'/('branding-'+stamp+'-'+str(os.getpid()))
    lock_path=root/'.branding-update.lock'
    with lock_path.open('a') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        prepare(current,release)
        if args.prepare_only:
            print('Prepared:',release);return
        # Retain the service group's existing access after copying root-owned code.
        import grp
        group=grp.getgrnam('epiphany').gr_gid
        for base,dirs,files in os.walk(release,followlinks=False):
            os.chown(base,0,group)
            for name in files:
                target=Path(base)/name
                if not target.is_symlink():os.chown(target,0,group)
        backup_dir=Path('/var/backups/epiphany');backup_dir.mkdir(mode=0o700,parents=True,exist_ok=True)
        backup=backup_dir/('before-branding-'+stamp+'-'+str(os.getpid())+'.sqlite')
        subprocess.run(['/usr/bin/node',str(current/'vps/backup.mjs'),'/var/lib/epiphany/state.sqlite',str(backup)],check=True)
        if link.resolve()!=current:raise RuntimeError('Действующий выпуск изменился. Обновление отменено.')
        try:
            switch(root,release)
            subprocess.run(['systemctl','restart','epiphany'],check=True)
            healthy()
        except BaseException:
            switch(root,current)
            subprocess.run(['systemctl','restart','epiphany'],check=True)
            print('Новый выпуск не прошёл проверку. Восстановлен предыдущий выпуск.')
            raise
        print('Логотип и favicon установлены. Сайт и файлы иконок отвечают корректно.')
        print('Предыдущий выпуск сохранён:',current)
        print('Резервная копия SQLite:',backup)
        print('DNS, сертификат, пароль, токен и рабочая SQLite не изменялись.')

if __name__=='__main__':main()
