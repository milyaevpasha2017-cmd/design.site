"""Shared one-time setup helpers. Read current contacts without exposing credentials."""
import json
import os
from pathlib import Path
import sqlite3
import tempfile

CONFIG = Path('/etc/epiphany/server.env')
ROOT = Path('/opt/epiphany/current')


def contacts():
    snapshot = json.loads((ROOT / 'site-worker/generated/site.json').read_text())
    values = snapshot['content']['content/settings.json']['contacts']
    with sqlite3.connect('file:/var/lib/epiphany/state.sqlite?mode=ro', uri=True) as db:
        db.execute('BEGIN')
        row = db.execute('SELECT value FROM kv WHERE namespace=? AND key=?',
                         ('epiphany-published-content', 'content:content/settings.json')).fetchone()
        if row:
            meta = json.loads(row[0])
            if meta['commit'] not in snapshot['commits']:
                chunks = [json.loads(db.execute('SELECT value FROM kv WHERE namespace=? AND key=?',
                    ('epiphany-published-content', 'document:content/settings.json:' + str(i))).fetchone()[0])
                    for i in range(meta['chunks'])]
                values = json.loads(''.join(chunks))['contacts']
    return values


def save(changes):
    if CONFIG.is_symlink(): raise RuntimeError('Unexpected configuration symlink')
    lines = [line for line in CONFIG.read_text().splitlines() if line.split('=', 1)[0] not in changes]
    for key, value in changes.items():
        if any(c in value for c in '\r\n'): raise RuntimeError('Invalid configuration value')
        lines.append(key + '=' + value)
    fd, temporary = tempfile.mkstemp(prefix='.notifications-', dir=CONFIG.parent)
    try:
        with os.fdopen(fd, 'w') as output:
            output.write('\n'.join(lines) + '\n'); output.flush(); os.fsync(output.fileno())
        os.chmod(temporary, 0o600); os.chown(temporary, 0, 0); os.replace(temporary, CONFIG)
    finally:
        Path(temporary).unlink(missing_ok=True)
