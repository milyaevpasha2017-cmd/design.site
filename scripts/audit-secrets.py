#!/usr/bin/env python3
"""Scan reachable Git blobs and optional built frontend; never print matches.

This detects known credential formats and literal assignments, not every
possible secret. Revoked keys, external logs, forks and chat are outside scope.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PATTERNS = {
    'private-key': rb'-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
    'github-token': rb'(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{60,})',
    'aws-access-id': rb'(?:AKIA|ASIA)[A-Z0-9]{16}',
    'google-api-key': rb'AIza[0-9A-Za-z_-]{35}',
    'slack-token': rb'xox[baprs]-[0-9A-Za-z-]{20,}',
    'stripe-secret': rb'sk_live_[0-9A-Za-z]{20,}',
    'literal-server-secret': rb'''(?i)(?:GITHUB_CLIENT_SECRET|GITHUB_CONTENT_TOKEN|CLOUDFLARE_API_TOKEN|ADMIN_PASSWORD_HASH|service_role_key|supabase_service_role_key)\s*["']?\s*[:=]\s*["']([A-Za-z0-9_/$+=.-]{24,})["']''',
}

def git(*args, input=None):
    return subprocess.check_output(['git', *args], cwd=ROOT, input=input)

def findings(data, location):
    return [dict(**location, rule=rule, line=data[:match.start()].count(b'\n')+1)
            for rule, pattern in PATTERNS.items() for match in re.finditer(pattern, data)]

def audit(frontend=None):
    objects={}
    for row in git('rev-list','--objects','--all').decode().splitlines():
        sha, _, path=row.partition(' ');objects[sha]=path
    meta=git('cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)',input=('\n'.join(objects)+'\n').encode())
    matches=[];count=0;size=0
    for row in meta.decode().splitlines():
        sha,kind,_=row.split()
        if kind!='blob':continue
        data=git('cat-file','blob',sha);count+=1;size+=len(data)
        matches.extend(findings(data,dict(object=sha,path=objects[sha])))
    built_count=0
    if frontend:
        folder=Path(frontend)
        if not folder.is_dir():raise ValueError('Frontend directory does not exist')
        for file in folder.rglob('*'):
            if file.is_file():
                built_count+=1;matches.extend(findings(file.read_bytes(),dict(frontend=str(file.relative_to(folder)))))
    return dict(revision=git('rev-parse','HEAD').decode().strip(),commits=int(git('rev-list','--all','--count')),
                refs=git('for-each-ref','--format=%(refname)').decode().splitlines(),blobs_scanned=count,
                bytes_scanned=size,frontend_files_scanned=built_count,findings=matches,
                limits='Pattern scan of reachable local refs and supplied frontend; external history, provider secrets and rotation not verified.')

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--frontend');parser.add_argument('--output');args=parser.parse_args()
    result=audit(args.frontend);text=json.dumps(result,ensure_ascii=False,indent=2)+'\n'
    if args.output:Path(args.output).write_text(text)
    print(text,end='');raise SystemExit(bool(result['findings']))
