#!/usr/bin/env python3
"""Keep the documented style inventory in sync with both first-party UIs."""
import argparse
import re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DOCUMENT=ROOT/'docs/DESIGN-SYSTEM.md'
START='<!-- style-inventory:start -->'
END='<!-- style-inventory:end -->'

def inventory():
    declarations={};colors=set()
    for name in ['style.css','password-admin/admin.css']:
        css=(ROOT/name).read_text()
        colors.update(re.findall(r'#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)',css))
        colors.update(re.findall(r'\b(?:white|black|transparent|currentColor)\b',css))
        for prop,value in re.findall(r'(?:^|[;{])\s*([\w-]+)\s*:\s*([^;{}]+)(?=[;}])',css):
            if prop in ('font','font-size','font-family','line-height','letter-spacing','gap','row-gap','column-gap','inset','top','right','bottom','left','outline-offset') or re.fullmatch(r'(?:padding|margin|scroll-padding|scroll-margin)(?:-[a-z]+)?',prop):
                declarations.setdefault(prop,set()).add(value.strip())
    lines=['Проверяемые файлы: `style.css`, `password-admin/admin.css`. Сторонняя тема прежнего Decap и локальный генератор пароля в этот контракт не входят.','',
           'Цветовые литералы (включая прозрачные варианты и старые переопределяемые правила):','',', '.join('`'+v+'`' for v in sorted(colors)), '',
           '| Свойство | Допустимые значения текущей версии |','|---|---|']
    lines.extend('| `'+prop+'` | '+', '.join('`'+v.replace('|','\\|')+'`' for v in sorted(values))+' |' for prop,values in sorted(declarations.items()))
    return '\n'.join(lines)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    source=DOCUMENT.read_text();before,tail=source.split(START,1);_,after=tail.split(END,1)
    expected=before+START+'\n'+inventory()+'\n'+END+after
    if args.check:
        if expected!=source:raise SystemExit('Design inventory changed. Review docs/DESIGN-SYSTEM.md and regenerate with scripts/design-inventory.py.')
        print('Design inventory matches both first-party stylesheets.')
    else:DOCUMENT.write_text(expected)
