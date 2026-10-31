#!/usr/bin/env python3
"""Package only the built frontend and required runtime, never git/secrets/state."""
import json
from pathlib import Path
import subprocess
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[1]


def main():
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip()
    metadata = json.dumps({'commit': commit, 'schema': 1}) + '\n'
    (ROOT / '_site-vps/deployment.json').write_text(metadata)
    (ROOT / 'release.json').write_text(metadata)
    roots = ['_site-vps', 'site-worker/src', 'site-worker/generated/site.json',
             'vps', 'password-admin/schema.json', 'rich-text.mjs', 'release.json']
    with tarfile.open(sys.argv[1], 'w:gz') as archive:
        for name in roots:
            path = ROOT / name
            files = sorted(path.rglob('*')) if path.is_dir() else [path]
            for file in files:
                if not file.is_file() or '__pycache__' in file.parts:
                    continue
                if file.is_symlink():
                    raise ValueError('Symlinks are not permitted in release')
                # VPS needs only its runtime JavaScript and schema.
                if name == 'vps' and file.suffix not in ('.mjs', '.sql'):
                    continue
                archive.add(file, arcname=str(file.relative_to(ROOT)), recursive=False)
    print('Packaged commit ' + commit)


if __name__ == '__main__':
    main()
