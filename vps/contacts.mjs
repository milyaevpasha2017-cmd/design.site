// Read only settings from the current publication, including edits newer than the build.
export async function currentContacts(namespace,snapshot){
  return namespace.storage('epiphany-published-content').transaction(async store=>{
    const meta=await store.get('content:content/settings.json');
    if(meta&&!snapshot.commits.includes(meta.commit)){
      const chunks=[];for(let i=0;i<meta.chunks;i++)chunks.push(await store.get('document:content/settings.json:'+i));
      return JSON.parse(chunks.join('')).contacts;
    }
    return snapshot.content['content/settings.json'].contacts;
  });
}
