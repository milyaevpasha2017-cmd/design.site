// Small, bounded inline formatter shared by the CMS preview and live renderer.
// Raw HTML is always text. No user-provided tag or attribute reaches the DOM.
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#x27;');
export function safeTextLink(value){
  return /^https:\/\/[a-zA-Z0-9.-]+(?::[0-9]+)?(?:[/?#][^\s<>"'\\]*)?$/.test(value)||/^mailto:[^\s@?&#<>"'\\]+@[^\s@?&#<>"'\\]+\.[^\s@?&#<>"'\\]+$/.test(value)||/^\/(?!\/)[^\s<>"'\\]*$/.test(value);
}
function format(value,links,plain,depth=0){
  const text=String(value??'');const out=[];const literal=value=>plain?value:escape(value).replaceAll('\n','<br>');
  if(depth>=8)return literal(text);
  for(let i=0;i<text.length;){
    if(text[i]==='\\'&&i+1<text.length&&'\\*_[]()'.includes(text[i+1])){out.push(literal(text[i+1]));i+=2;continue;}
    if(text[i]==='['){
      const middle=text.indexOf('](',i+1),end=middle<0?-1:text.indexOf(')',middle+2);
      if(middle>i+1&&end>middle+2){
        const url=text.slice(middle+2,end),label=text.slice(i+1,middle);
        if(safeTextLink(url)){
          const body=format(label,false,plain,depth+1);
          out.push(plain||!links?body:`<a class="rich-link" href="${escape(url)}">${body}</a>`);i=end+1;continue;
        }
      }
    }
    const marker=text.startsWith('**',i)?'**':text.startsWith('__',i)?'__':text[i]==='*'?'*':null;
    if(marker){
      let end=text.indexOf(marker,i+marker.length);
      if(marker==='*'){
        while(end>=0&&text.startsWith('**',end)){
          const nestedEnd=text.indexOf('**',end+2);if(nestedEnd<0){end=-1;break;}
          end=text.indexOf('*',nestedEnd+2);
        }
      }else if(marker==='**'&&end>=0){while(text[end+2]==='*')end++;}
      while(end>=0&&text[end-1]==='\\')end=text.indexOf(marker,end+marker.length);
      if(end>i+marker.length){const body=format(text.slice(i+marker.length,end),links,plain,depth+1),tag=marker==='**'?'strong':marker==='__'?'u':'em';out.push(plain?body:`<${tag}>${body}</${tag}>`);i=end+marker.length;continue;}
    }
    // Copy runs at once, so long plain paragraphs remain inexpensive.
    let end=i+1;while(end<text.length&&!"\\[*_".includes(text[end]))end++;
    out.push(literal(text.slice(i,end)));i=end;
  }
  return out.join('');
}
export const richText=(value,{links=true}={})=>format(value,links,false);
export const plainText=value=>format(value,false,true);
