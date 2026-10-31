import test from 'node:test';
import assert from 'node:assert/strict';
import {telegramRequestPlan} from '../vps/telegram.mjs';
test('Telegram curl plan keeps token/payload on stdin, verifies HTTPS and preserves Unicode/escaping',()=>{
  const token='12345:synthetic_secret',url='https://api.telegram.org/bot'+token+'/sendMessage';
  const body=JSON.stringify({text:'Клиент "quoted"\nsecond line \\ slash'});
  const plan=telegramRequestPlan(url,{body});
  assert.ok(!plan.args.join(' ').includes(token));assert.ok(!plan.args.includes('--insecure'));assert.ok(plan.args.includes('-4'));assert.ok(!plan.args.includes('--location'));
  const lines=plan.input.trimEnd().split('\n');assert.equal(JSON.parse(lines[0].split(' = ')[1]),url);assert.equal(JSON.parse(lines[3].slice(7)),body);
  assert.throws(()=>telegramRequestPlan('https://other.example/bot'+token),/Unexpected/);
});
