import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from '../auth-worker/src/worker.mjs';
const env={GITHUB_CLIENT_ID:'test-client',GITHUB_CLIENT_SECRET:'test-secret-not-real',SITE_ORIGIN:'https://example.github.io',REPO:'owner/site'};
const authRequest=()=>new Request('https://auth.example.com/auth?provider=github&site_id=example.github.io');
async function begin(worker) {
  const response=await worker.fetch(authRequest(),env);
  const redirect=new URL(response.headers.get('Location'));
  return { response, state:redirect.searchParams.get('state'), cookie:response.headers.get('Set-Cookie').split(';')[0], redirect };
}
test('OAuth start binds random state to secure expiring HttpOnly cookie and fixed callback', async () => {
  const {response,state,redirect}=await begin(createWorker());
  assert.equal(response.status,302); assert.match(state,/^[a-f0-9]{64}$/);
  assert.equal(redirect.origin,'https://github.com'); assert.equal(redirect.searchParams.get('redirect_uri'),'https://auth.example.com/callback');
  assert.equal(redirect.searchParams.get('scope'),'public_repo');
  assert.match(response.headers.get('Set-Cookie'),/HttpOnly; Secure; SameSite=Lax; Max-Age=600/);
});
test('OAuth refuses wrong site and missing configuration', async () => {
  const worker=createWorker();
  assert.equal((await worker.fetch(new Request('https://auth.example.com/auth?provider=github&site_id=evil.example'),env)).status,400);
  assert.equal((await worker.fetch(authRequest(),{})).status,503);
});
test('OAuth rejects missing or mismatched state before any token exchange', async () => {
  let fetched=false; const worker=createWorker(async()=>{fetched=true;throw Error('must not fetch')});
  const {state,cookie}=await begin(worker);
  for (const headers of [{},{Cookie:cookie.replace(state,'0'.repeat(64))}]) {
    const response=await worker.fetch(new Request(`https://auth.example.com/callback?state=${state}&code=code`,{headers}),env); assert.equal(response.status,400);
  }
  assert.equal(fetched,false);
});
test('OAuth success checks write permission and returns origin-bound Decap handshake without secret', async () => {
  const calls=[];
  const worker=createWorker(async(url,options)=>{
    calls.push([url,options]);
    return Response.json(url.includes('access_token') ? {access_token:'test-token-not-real'} : {permissions:{push:true}});
  });
  const {state,cookie}=await begin(worker);
  const response=await worker.fetch(new Request(`https://auth.example.com/callback?state=${state}&code=valid`,{headers:{Cookie:cookie}}),env);
  const html=await response.text();
  assert.match(html,/authorization:github:success:/); assert.match(html,/test-token-not-real/);
  assert.ok(html.includes('event.origin !== origin')); assert.ok(html.includes('event.source !== window.opener'));
  assert.ok(html.includes('https://example.github.io')); assert.ok(!html.includes(env.GITHUB_CLIENT_SECRET));
  assert.match(response.headers.get('Content-Security-Policy'),/default-src 'none'/); assert.match(response.headers.get('Set-Cookie'),/Max-Age=0/);
  assert.equal(calls[1][0],'https://api.github.com/repos/owner/site');
  assert.equal(JSON.parse(calls[0][1].body).client_secret,env.GITHUB_CLIENT_SECRET);
});
test('OAuth does not expose a token to accounts without write access', async () => {
  const worker=createWorker(async url=>Response.json(url.includes('access_token') ? {access_token:'must-not-be-shown'} : {permissions:{push:false}}));
  const {state,cookie}=await begin(worker);
  const response=await worker.fetch(new Request(`https://auth.example.com/callback?state=${state}&code=valid`,{headers:{Cookie:cookie}}),env);
  const html=await response.text(); assert.match(html,/authorization:github:error:/); assert.ok(!html.includes('must-not-be-shown'));
});
test('OAuth cancellation and upstream failures return safe actionable errors', async () => {
  const worker=createWorker(async()=>{throw Error('secret-internal-error')});const {state,cookie}=await begin(worker);
  const response=await worker.fetch(new Request(`https://auth.example.com/callback?state=${state}&code=valid`,{headers:{Cookie:cookie}}),env);
  const html=await response.text();assert.match(html,/authorization:github:error:/);assert.ok(!html.includes('secret-internal-error'));
  const denied=await worker.fetch(new Request(`https://auth.example.com/callback?state=${state}&error=access_denied`,{headers:{Cookie:cookie}}),env);assert.match(await denied.text(),/Вход через GitHub отменён/);
});
