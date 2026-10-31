import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { SCENARIOS, getScenario, buildRealtimeInstructions } from './conversation/scenarios.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const FILES = new Map([
  ['/', ['conversation/index.html', 'text/html; charset=utf-8']],
  ['/client.js', ['conversation/client.js', 'text/javascript; charset=utf-8']],
  ['/style.css', ['conversation/style.css', 'text/css; charset=utf-8']],
  ['/icon.svg', ['icon.svg', 'image/svg+xml']]
]);
const MAX_BODY = 120_000;

function json(res, status, value) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); }
async function readJson(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > MAX_BODY) { const error = new Error('请求内容过长'); error.status = 413; throw error; } chunks.push(chunk); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { const error = new Error('请求格式无效'); error.status = 400; throw error; }
}
function outputText(response) { return (response.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text).join(''); }
function upstreamError(status) { if (status === 401 || status === 403) return 'API 密钥无效，或账户尚未获得所需模型权限。'; if (status === 429) return '请求过多或额度不足，请稍后再试。'; return `AI 服务暂时不可用（${status}）。`; }

const feedbackSchema = {
  type: 'object', additionalProperties: false,
  properties: {
    summary: { type: 'string' },
    strength: { type: 'string' },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
      category: { type: 'string', enum: ['表达自然度', '语法与意思', '沟通策略'] },
      original: { type: 'string' }, suggestion: { type: 'string' }, reason: { type: 'string' }
    }, required: ['category', 'original', 'suggestion', 'reason'] } },
    nextTry: { type: 'string' }
  }, required: ['summary', 'strength', 'issues', 'nextTry']
};

export function createAppServer({ apiKey = process.env.OPENAI_API_KEY, realtimeModel = process.env.REALTIME_MODEL || 'gpt-realtime-2.1-mini', feedbackModel = process.env.FEEDBACK_MODEL || 'gpt-6.1-terra', fetchImpl = fetch } = {}) {
  return createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/api/config') return json(res, 200, { configured: Boolean(apiKey), realtimeModel, feedbackModel, scenarios: Object.values(SCENARIOS).map(({ id, category, title, brief, mission, counterpart }) => ({ id, category, title, brief, mission, counterpart })) });
      if (req.method === 'POST' && url.pathname === '/api/session') {
        if (!apiKey) return json(res, 503, { error: '尚未配置 OPENAI_API_KEY。请在启动服务前设置环境变量。' });
        const body = await readJson(req);
        if (typeof body.sdp !== 'string' || !body.sdp.startsWith('v=0') || body.sdp.length > 100_000) return json(res, 400, { error: 'WebRTC 连接数据无效。' });
        if (!Object.hasOwn(SCENARIOS, body.scenarioId)) return json(res, 400, { error: '场景不存在。' });
        const scenario = getScenario(body.scenarioId, body.topic);
        if (scenario.id === 'custom' && !scenario.topic) return json(res, 400, { error: '请先填写自定义场景。' });
        const config = { type: 'realtime', model: realtimeModel, output_modalities: ['audio'], reasoning: { effort: 'low' }, instructions: buildRealtimeInstructions(scenario), audio: { input: { transcription: { model: 'gpt-transcribe' }, turn_detection: null }, output: { voice: 'marin' } } };
        const form = new FormData(); form.set('sdp', body.sdp); form.set('session', JSON.stringify(config));
        const upstream = await fetchImpl('https://api.openai.com/v1/realtime/calls', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}` }, body: form, signal: AbortSignal.timeout(25_000) });
        if (!upstream.ok) return json(res, 502, { error: upstreamError(upstream.status) });
        const answer = await upstream.text();
        if (!answer.startsWith('v=0')) return json(res, 502, { error: 'AI 服务未返回有效的语音连接。' });
        return json(res, 200, { sdp: answer });
      }
      if (req.method === 'POST' && url.pathname === '/api/feedback') {
        if (!apiKey) return json(res, 503, { error: '尚未配置 OPENAI_API_KEY。' });
        const body = await readJson(req);
        if (!Object.hasOwn(SCENARIOS, body.scenarioId)) return json(res, 400, { error: '场景不存在。' });
        const scenario = getScenario(body.scenarioId, body.topic);
        const messages = Array.isArray(body.messages) ? body.messages.slice(0, 40).filter(x => ['user', 'assistant'].includes(x?.role) && typeof x?.text === 'string' && x.text.trim()).map(x => ({ role: x.role, text: x.text.trim().slice(0, 1200) })) : [];
        const userTexts = messages.filter(x => x.role === 'user').map(x => x.text);
        if (!userTexts.length) return json(res, 400, { error: '至少需要一段你确认过的英文表达。' });
        const payload = { model: feedbackModel, store: false,
          instructions: `You are a careful English conversation coach for a B1–B2 Chinese-speaking professional. Analyze only the confirmed transcript. Reply in concise Chinese except for English examples. Judge communicative effectiveness and language use, not accent or pronunciation. Select at most three high-impact issues. For every issue, original must be an exact, contiguous quote from a USER turn, never from an assistant turn. Do not invent errors. If a sentence is acceptable, do not correct it just to fill a quota. Distinguish ASR uncertainty: do not claim an error if the transcript itself is unclear. End with one concrete next-practice suggestion.`,
          input: JSON.stringify({ scenario: { title: scenario.title, mission: scenario.mission, topic: scenario.topic }, messages }),
          text: { format: { type: 'json_schema', name: 'english_coach_feedback', strict: true, schema: feedbackSchema } }
        };
        const upstream = await fetchImpl('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30_000) });
        if (!upstream.ok) return json(res, 502, { error: upstreamError(upstream.status) });
        const result = await upstream.json();
        let feedback; try { feedback = JSON.parse(outputText(result)); } catch { return json(res, 502, { error: '反馈格式无效，请重试。' }); }
        if (!feedback || typeof feedback.summary !== 'string' || !Array.isArray(feedback.issues)) return json(res, 502, { error: '反馈内容不完整，请重试。' });
        feedback.issues = feedback.issues.filter(issue => issue && typeof issue.original === 'string' && userTexts.some(text => text.includes(issue.original)) && typeof issue.suggestion === 'string' && typeof issue.reason === 'string').slice(0, 3);
        return json(res, 200, { feedback });
      }
      if (req.method === 'GET' && FILES.has(url.pathname)) {
        const [path, type] = FILES.get(url.pathname);
        const file = join(ROOT, path); const info = await stat(file);
        res.writeHead(200, { 'Content-Type': type, 'Content-Length': info.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.end(await readFile(file));
      }
      json(res, 404, { error: '页面不存在。' });
    } catch (error) {
      console.error(error);
      json(res, error.status || 500, { error: error.status ? error.message : '服务发生错误，请稍后重试。' });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 4174);
  createAppServer().listen(port, '127.0.0.1', () => console.log(`English Coach conversation app: http://localhost:${port}`));
}
