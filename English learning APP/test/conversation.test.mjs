import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createAppServer } from '../server.mjs';

async function withServer(options, run) {
  const server = createAppServer(options); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally { await new Promise(resolve => server.close(resolve)); }
}

test('without a key the app serves the UI but refuses an AI session', async () => {
  await withServer({ apiKey: '' }, async base => {
    const page = await fetch(base); assert.equal(page.status, 200); assert.match(await page.text(), /开始语音对话/);
    const config = await (await fetch(`${base}/api/config`)).json(); assert.equal(config.configured, false);
    const session = await fetch(`${base}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: 'v=0', scenarioId: 'delivery' }) });
    assert.equal(session.status, 503);
  });
});

test('session uses server-side key and a scenario-specific realtime prompt', async () => {
  let called = false;
  const mockFetch = async (url, options) => {
    called = true;
    assert.equal(url, 'https://api.openai.com/v1/realtime/calls');
    assert.equal(options.headers.Authorization, 'Bearer test-key');
    const config = JSON.parse(options.body.get('session'));
    assert.equal(config.model, 'gpt-realtime-2.1-mini');
    assert.match(config.instructions, /交期/);
    assert.equal(config.audio.output.voice, 'marin');
    return new Response('v=0\r\ns=answer', { status: 201 });
  };
  await withServer({ apiKey: 'test-key', fetchImpl: mockFetch }, async base => {
    const response = await fetch(`${base}/api/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: 'v=0\r\ns=offer', scenarioId: 'delivery' }) });
    assert.equal(response.status, 200); assert.equal((await response.json()).sdp, 'v=0\r\ns=answer');
    assert.equal(called, true);
  });
});

test('feedback accepts only exact quotes from confirmed user turns', async () => {
  const mockFetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    const body = JSON.parse(options.body); assert.equal(body.store, false);
    assert.equal(body.text.format.type, 'json_schema');
    const feedback = { summary: '基本说清了问题。', strength: '主动追问。', issues: [
      { category: '语法与意思', original: 'The shipment delay make our line stop.', suggestion: 'The shipment delay may stop our production line.', reason: '主谓一致与语气。' },
      { category: '语法与意思', original: 'This sentence was never said.', suggestion: 'Anything.', reason: '应被过滤。' }
    ], nextTry: '再次说明业务影响。' };
    return Response.json({ output: [{ content: [{ type: 'output_text', text: JSON.stringify(feedback) }] }] });
  };
  await withServer({ apiKey: 'test-key', fetchImpl: mockFetch }, async base => {
    const response = await fetch(`${base}/api/feedback`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: 'delivery', messages: [{ role: 'user', text: 'The shipment delay make our line stop.' }, { role: 'assistant', text: 'I understand.' }] }) });
    assert.equal(response.status, 200);
    const result = await response.json(); assert.equal(result.feedback.issues.length, 1);
    assert.equal(result.feedback.issues[0].original, 'The shipment delay make our line stop.');
  });
});
