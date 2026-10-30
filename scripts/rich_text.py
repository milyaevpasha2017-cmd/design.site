"""Safe inline formatting; kept in parity with rich-text.mjs by shared fixtures."""
import html
import re

def safe_text_link(value):
    return bool(re.fullmatch(r'''https://[a-zA-Z0-9.-]+(?::[0-9]+)?(?:[/?#][^\s<>"'\\]*)?''',value) or re.fullmatch(r'''mailto:[^\s@?&#<>"'\\]+@[^\s@?&#<>"'\\]+\.[^\s@?&#<>"'\\]+''',value) or re.fullmatch(r'''/(?!/)[^\s<>"'\\]*''',value))

def _format(value,links,plain,depth=0):
    text=str(value or '');out=[];i=0
    def literal(value): return value if plain else html.escape(value,quote=True).replace('\n','<br>')
    if depth>=8:return literal(text)
    while i<len(text):
        if text[i]=='\\' and i+1<len(text) and text[i+1] in '\\*_[]()':
            out.append(literal(text[i+1]));i+=2;continue
        if text[i]=='[':
            middle=text.find('](',i+1);end=text.find(')',middle+2) if middle>=0 else -1
            if middle>i+1 and end>middle+2:
                url=text[middle+2:end];label=text[i+1:middle]
                if safe_text_link(url):
                    body=_format(label,False,plain,depth+1)
                    out.append(body if plain or not links else '<a class="rich-link" href="'+html.escape(url,quote=True)+'">'+body+'</a>');i=end+1;continue
        marker='**' if text.startswith('**',i) else '__' if text.startswith('__',i) else '*' if text[i]=='*' else None
        if marker:
            end=text.find(marker,i+len(marker))
            if marker=='*':
                while end>=0 and text.startswith('**',end):
                    nested_end=text.find('**',end+2)
                    if nested_end<0:end=-1;break
                    end=text.find('*',nested_end+2)
            elif marker=='**' and end>=0:
                while end+2<len(text) and text[end+2]=='*':end+=1
            while end>=0 and text[end-1]=='\\':end=text.find(marker,end+len(marker))
            if end>i+len(marker):
                body=_format(text[i+len(marker):end],links,plain,depth+1);tag={'**':'strong','__':'u','*':'em'}[marker]
                out.append(body if plain else '<'+tag+'>'+body+'</'+tag+'>');i=end+len(marker);continue
        end=i+1
        while end<len(text) and text[end] not in '\\[*_':end+=1
        out.append(literal(text[i:end]));i=end
    return ''.join(out)

def rich_text(value,links=True):return _format(value,links,False)
def plain_text(value):return _format(value,False,True)
