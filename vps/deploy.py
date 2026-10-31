#!/usr/bin/env python3
"""Root-owned forced SSH command: install a CI-built release received on stdin."""
import fcntl
import grp
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

ROOT = Path('/opt/epiphany')
DATABASE = Path('/var/lib/epiphany/state.sqlite')
LIMIT = 512 * 1024 * 1024


def run(*args):
    subprocess.run(args, check=True, timeout=90)


def unpack(archive, release):
    """No links/devices, traversal, duplicate names or archive-selected permissions."""
    count = size = 0
    seen = set()
    with tarfile.open(fileobj=archive, mode='r:gz') as bundle:
        for entry in bundle:
            path = PurePosixPath(entry.name)
            if (path.is_absolute() or '..' in path.parts or '\\' in entry.name
                    or not path.parts or str(path) in seen):
                raise ValueError('Unsafe or duplicate archive path')
            seen.add(str(path))
            allowed = (path.parts[0] in ('_site-vps', 'site-worker', 'vps', 'password-admin')
                       or str(path) in ('rich-text.mjs', 'release.json'))
            if not allowed or not (entry.isfile() or entry.isdir()):
                raise ValueError('Unexpected archive entry')
            count += 1
            size += entry.size
            if count > 20000 or size > LIMIT:
                raise ValueError('Release exceeds size limit')
            target = release.joinpath(*path.parts)
            if entry.isdir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.extractfile(entry) as source, target.open('xb') as destination:
                    shutil.copyfileobj(source, destination)
    metadata = json.loads((release / 'release.json').read_text())
    if not re.fullmatch('[0-9a-f]{40}', metadata['commit']):
        raise ValueError('Invalid commit')
    if metadata.get('schema') != 1:
        raise ValueError('Schema migrations require a separate reviewed procedure')
    for name in ('vps/server.mjs', 'vps/backup.mjs', 'vps/sql/001-up.sql',
                 'site-worker/generated/site.json', 'password-admin/schema.json',
                 '_site-vps/index.html', '_site-vps/admin/login/index.html'):
        if not (release / name).is_file():
            raise ValueError('Release is incomplete: ' + name)
    return metadata


def switch(target):
    temporary = ROOT / ('.current-' + str(os.getpid()))
    temporary.symlink_to(target)
    os.replace(temporary, ROOT / 'current')


def healthy(commit):
    for route, expected in (('/healthz', b'ok\n'),
                            ('/deployment.json', commit.encode()),
                            ('/', b'<!doctype html'),
                            ('/admin/login/', b'<form')):
        request = urllib.request.Request('http://127.0.0.1:3000' + route,
            headers={'Host': 'epiphany-int.ru', 'X-Forwarded-Proto': 'https'})
        with urllib.request.urlopen(request, timeout=5) as response:
            if response.status != 200 or expected not in response.read().lower():
                raise RuntimeError('Release health check failed: ' + route)


def main():
    if os.geteuid() != 0 or len(sys.argv) != 1:
        raise RuntimeError('Run through the configured deploy SSH key, with no arguments')
    os.umask(0o077)
    with (ROOT / '.deploy.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        current = ROOT / 'current'
        if not current.is_symlink():
            raise RuntimeError('current must be a release symlink')
        previous = current.resolve(strict=True)
        if previous.parent != (ROOT / 'releases').resolve():
            raise RuntimeError('Unexpected current release location')
        # Configuration is systemd syntax, never source it as shell code.
        for line in Path('/etc/epiphany/server.env').read_text().splitlines():
            if line.strip().startswith('DATABASE_PATH=') and line.split('=', 1)[1].strip().strip('\"\'') != str(DATABASE):
                raise RuntimeError('Custom DATABASE_PATH needs explicit deployment configuration')
        release = Path(tempfile.mkdtemp(prefix='ci-', dir=ROOT / 'releases'))
        activated = False
        try:
            with tempfile.TemporaryFile() as archive:
                total = 0
                while chunk := sys.stdin.buffer.read(1024 * 1024):
                    total += len(chunk)
                    if total > LIMIT:
                        raise ValueError('Compressed archive exceeds size limit')
                    archive.write(chunk)
                archive.seek(0)
                metadata = unpack(archive, release)
            gid = grp.getgrnam('epiphany').gr_gid
            for parent, directories, files in os.walk(release):
                os.chown(parent, 0, gid)
                os.chmod(parent, 0o750)
                for name in files:
                    os.chown(Path(parent) / name, 0, gid)
                    os.chmod(Path(parent) / name, 0o640)
            stamp = time.strftime('%Y%m%dT%H%M%SZ', time.gmtime()) + '-' + str(os.getpid())
            backup_dir = Path('/var/backups/epiphany')
            backup_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
            # SQLite backup executes trusted installed code with application privileges.
            temporary_backup = DATABASE.parent / ('before-deploy-' + stamp + '.sqlite')
            try:
                run('/usr/sbin/runuser', '-u', 'epiphany', '--', '/usr/bin/node',
                    str(previous / 'vps/backup.mjs'), str(DATABASE), str(temporary_backup))
                os.replace(temporary_backup, backup_dir / temporary_backup.name)
                os.chown(backup_dir / temporary_backup.name, 0, 0)
            finally:
                temporary_backup.unlink(missing_ok=True)
            if current.resolve() != previous:
                raise RuntimeError('Current release changed during preparation')
            switch(release)
            activated = True
            run('/usr/bin/systemctl', 'restart', 'epiphany')
            for attempt in range(15):
                try:
                    healthy(metadata['commit'])
                    break
                except Exception:
                    if attempt == 14:
                        raise
                    time.sleep(1)
            print('Deployed commit ' + metadata['commit'], flush=True)
        except BaseException:
            if activated:
                switch(previous)
                run('/usr/bin/systemctl', 'restart', 'epiphany')
                print('Previous release restored; database retained', file=sys.stderr)
            shutil.rmtree(release)
            raise


if __name__ == '__main__':
    # Bound interrupted uploads too; normal activations finish in this window.
    signal.signal(signal.SIGTERM, lambda *_: (_ for _ in ()).throw(InterruptedError()))
    signal.signal(signal.SIGALRM, lambda *_: (_ for _ in ()).throw(TimeoutError()))
    signal.alarm(600)
    main()
