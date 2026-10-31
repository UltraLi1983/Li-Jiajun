const SCENARIOS = [
  {
    id: 'delivery', type: '供应链沟通', title: '交付延期，如何推进恢复计划',
    description: '听懂供应商的延期信息，说明业务影响，并确认下一步。', duration: '约 12 分钟',
    dialogue: [
      ['Maya', 'Hi Alex. I need to update you on the shipment for order 247. Our packaging line stopped yesterday afternoon.'],
      ['Alex', 'Thanks for letting me know. How does that affect Friday’s delivery?'],
      ['Maya', 'We can ship half the units on Friday. The rest will be ready next Tuesday, provided the replacement parts arrive tomorrow.'],
      ['Alex', 'Our customer needs the full quantity for Monday’s production. Could you check an alternative packaging line and send a recovery plan by 3 p.m.?'],
      ['Maya', 'Yes. I’ll speak to operations and confirm the options before 3 p.m. today.']
    ],
    questions: [
      { q: '供应商遇到了什么问题？', choices: ['包装线停机', '原材料涨价', '运输车辆延误', '订单数量错误'], answer: 0 },
      { q: '周五能发出多少货？', choices: ['全部', '一半', '四分之一', '无法发货'], answer: 1 },
      { q: '剩余货物预计何时准备好？', choices: ['周一', '下周二', '下周五', '尚无时间'], answer: 1 },
      { q: '客户为何需要完整数量？', choices: ['周一生产', '月底盘点', '展会展示', '价格审核'], answer: 0 },
      { q: '恢复计划应在何时提供？', choices: ['今天下午 3 点前', '明早 9 点前', '周五中午前', '下周二'], answer: 0 }
    ],
    role: '你是采购经理，正在与供应商 Maya 通话。',
    turns: [
      { line: 'We have a problem with Friday’s shipment. We can send only half the units on time.', hint: '先确认剩余货物的预计时间，以及这个时间是否确定。' },
      { line: 'The remaining units should be ready next Tuesday, if the replacement parts arrive tomorrow.', hint: '说明客户生产所受影响，并询问替代方案。' },
      { line: 'I will check with operations. What would you like me to confirm in the recovery plan?', hint: '明确恢复计划需要包含什么，以及何时给你答复。' }
    ],
    criteria: [
      { id: 'eta', label: '确认剩余货物的时间', test: /\b(eta|tuesday|delivery date|arrival date|when will|when can|revised date|revised time)\b/i, quote: 'Could you confirm the revised ETA for the remaining units?', prompt: '向供应商确认剩余货物的预计交付时间。' },
      { id: 'impact', label: '说明客户的生产影响', test: /\b(customer|production|line|impact|monday|schedule|stop|delay)\b/i, quote: 'Our customer needs the full quantity for Monday’s production.', prompt: '解释延期对客户生产的影响。' },
      { id: 'alternative', label: '询问可行的替代方案', test: /\b(alternative|other option|another option|backup|expedite|solution)\b/i, quote: 'Could you check an alternative packaging line?', prompt: '询问是否有替代包装线或加急方案。' },
      { id: 'plan', label: '约定恢复计划与答复时间', test: /\b(recovery plan|action plan|send (me |us )?(a |the )?plan|provide (me |us )?(a |the )?plan|by 3|before 3|deadline)\b/i, quote: 'Please send a recovery plan by 3 p.m. today.', prompt: '约定恢复计划的内容和交付时间。' }
    ]
  },
  {
    id: 'meeting', type: '国际商务', title: '会议中澄清模糊的需求',
    description: '听懂项目变更，澄清范围、时间与负责人。', duration: '约 12 分钟',
    dialogue: [
      ['Jordan', 'The customer wants to bring the product launch forward by two weeks.'],
      ['Sam', 'Does that change the testing scope or only the final delivery date?'],
      ['Jordan', 'The testing scope stays the same. We need the first validation report by next Thursday.'],
      ['Sam', 'Who will confirm the sample quantities and the updated timeline?'],
      ['Jordan', 'I will confirm the quantities today. Priya will share the updated timeline tomorrow morning.']
    ],
    questions: [
      { q: '客户希望怎样调整上市时间？', choices: ['提前两周', '推迟两周', '提前一个月', '保持不变'], answer: 0 },
      { q: '测试范围有什么变化？', choices: ['增加一倍', '缩小一半', '保持不变', '暂时取消'], answer: 2 },
      { q: '首份验证报告何时需要提交？', choices: ['今天', '明天早上', '下周四', '月底'], answer: 2 },
      { q: '谁确认样品数量？', choices: ['Sam', 'Jordan', 'Priya', '客户'], answer: 1 },
      { q: '更新时间表何时分享？', choices: ['今天中午', '明天早上', '下周四', '尚未决定'], answer: 1 }
    ],
    role: '你是项目负责人，正在参加一次跨团队协调会议。',
    turns: [
      { line: 'The customer wants to launch two weeks earlier. Can we make it work?', hint: '澄清变更是否影响测试范围。' },
      { line: 'The scope stays the same, but we need the first validation report by next Thursday.', hint: '确认报告时间，并询问样品数量。' },
      { line: 'I will confirm the sample quantities today. Priya has the timeline.', hint: '总结负责人及下一步，并要求更新时间表。' }
    ],
    criteria: [
      { id: 'scope', label: '澄清工作范围', test: /\b(scope|testing|change|same|include|requirement)\b/i, quote: 'Does the earlier launch change the testing scope?', prompt: '澄清提前上市是否改变测试范围。' },
      { id: 'date', label: '确认报告日期', test: /\b(thursday|report|deadline|when|date|confirm)\b/i, quote: 'Could you confirm that the first report is due next Thursday?', prompt: '确认首份验证报告的截止日期。' },
      { id: 'quantity', label: '询问样品数量', test: /\b(sample|quantity|quantities|how many|number)\b/i, quote: 'When will we have the confirmed sample quantities?', prompt: '询问样品数量何时确认。' },
      { id: 'owner', label: '明确负责人和下一步', test: /\b(priya|you|who|owner|timeline|tomorrow|share|next)\b/i, quote: 'Priya will share the updated timeline tomorrow morning.', prompt: '总结谁会提供更新时间表及时间。' }
    ]
  }
];

const STORAGE_KEY = 'english-coach-mvp-v2';
const byId = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const localDay = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const addDays = (date, n) => { const d = new Date(date); d.setDate(d.getDate() + n); return localDay(d); };
const defaultData = () => ({ version: 1, sessions: [], reviews: [] });
function loadData() { try { const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY)); return parsed?.version === 1 && Array.isArray(parsed.sessions) && Array.isArray(parsed.reviews) ? parsed : defaultData(); } catch { return defaultData(); } }
let data = loadData();
let view = 'today';
let session = null;
let recognizing = null;
let playingAudio = null;
let noticeTimer;

function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); updateBadge(); }
function notify(message) { const el = byId('status'); el.textContent = message; el.hidden = false; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => el.hidden = true, 4600); }
function updateBadge() { const due = data.reviews.filter(r => r.due <= localDay()).length; byId('reviewBadge').textContent = due; byId('reviewBadge').hidden = !due; }
function stopAudio() { if (playingAudio) { playingAudio.pause(); playingAudio.currentTime = 0; playingAudio = null; } if (recognizing) { recognizing.stop(); recognizing = null; } }
function playAudioFile(path, onStarted = () => {}, onEnded = () => {}) {
  stopAudio();
  const audio = new Audio(path);
  audio.playbackRate = session?.rate || 1;
  playingAudio = audio;
  audio.onended = () => { if (playingAudio !== audio) return; playingAudio = null; onEnded(); };
  audio.onerror = () => { if (playingAudio !== audio) return; playingAudio = null; notify('音频加载失败。请重试或切换阅读模式。'); };
  audio.play().then(() => { if (playingAudio === audio) onStarted(); }).catch(() => { if (playingAudio !== audio) return; playingAudio = null; notify('无法播放音频。请重试或切换阅读模式。'); });
}
function showView(name) {
  stopAudio(); view = name;
  for (const name of ['today', 'session', 'review', 'progress', 'settings']) byId(`${name}View`).hidden = name !== view;
  document.querySelectorAll('.nav-item').forEach(el => el.classList.toggle('active', el.dataset.view === name || (name === 'session' && el.dataset.view === 'today')));
  byId('breadcrumb').textContent = ({ today: '今日训练', session: '今日训练 / 场景练习', review: '表达复习', progress: '训练记录', settings: '数据设置' })[name];
  if (name === 'today') renderHome(); if (name === 'review') renderReview(); if (name === 'progress') renderProgress();
  window.scrollTo(0, 0);
}
function renderHome() {
  byId('scenarioGrid').innerHTML = SCENARIOS.map(s => `<button class="scenario-card" type="button" data-scenario="${s.id}"><span class="category">${s.type}</span><h3>${s.title}</h3><p>${s.description}</p><div class="card-foot"><span>${s.duration} · 听力 + 对话</span><strong>开始练习　→</strong></div></button>`).join('');
  document.querySelectorAll('[data-scenario]').forEach(btn => btn.onclick = () => startSession(btn.dataset.scenario));
}
function startSession(id) {
  const scenario = SCENARIOS.find(s => s.id === id); if (!scenario) return;
  session = { scenario, stage: 'listen', answers: Array(scenario.questions.length).fill(null), listeningSubmitted: false, readingMode: false, audioCompleted: false, plays: 0, rate: 1, turn: 0, utterances: [], transcriptDraft: '' };
  showView('session'); renderSession();
}
function renderSession() {
  if (!session) return;
  const { scenario, stage } = session;
  byId('sessionTitle').textContent = scenario.title;
  byId('sessionScenarioType').textContent = scenario.type;
  byId('stepKicker').textContent = ({ listen: '第 1 步 · 盲听', roleplay: '第 2 步 · 对话', feedback: '第 3 步 · 复盘' })[stage];
  byId('sessionSubtitle').textContent = ({ listen: '先听再作答。提交前不会显示原文。', roleplay: scenario.role, feedback: '根据你确认的表达，检查任务要点。' })[stage];
  byId('stepIndicator').innerHTML = [0, 1, 2].map((n) => `<i class="${n < ['listen', 'roleplay', 'feedback'].indexOf(stage) ? 'done' : n === ['listen', 'roleplay', 'feedback'].indexOf(stage) ? 'active' : ''}"></i>`).join('');
  if (stage === 'listen') renderListening(); if (stage === 'roleplay') renderRoleplay(); if (stage === 'feedback') renderFeedback();
}
function speakDialogue() {
  const currentSession = session;
  currentSession.audioCompleted = false;
  playAudioFile(`audio/${currentSession.scenario.id}-dialogue.m4a`,
    () => { currentSession.plays++; renderListening(); notify('正在播放。请听完整段对话后答题。'); },
    () => { currentSession.audioCompleted = true; renderListening(); notify('播放结束，可以提交答案。'); });
}
function renderListening() {
  const s = session, submitted = s.listeningSubmitted;
  const transcript = s.scenario.dialogue.map(([name, line]) => `${esc(name)}: ${esc(line)}`).join('\n\n');
  const score = s.scenario.questions.filter((q, i) => q.answer === s.answers[i]).length;
  const scoreNote = s.readingMode ? '阅读模式结果，不计入听力正确率。' : s.plays > 1 ? `共播放 ${s.plays} 次，结果不作为严格首次听力分数。` : '首次播放后的答题结果。';
  byId('sessionContent').innerHTML = `<p class="content-lead">听一段英文商务对话，尽量在第一次播放后回答。你可以重播；原文会在提交答案后解锁。</p><div class="audio-panel"><div class="audio-icon" aria-hidden="true">♫</div><div><strong>场景对话</strong><small>${s.scenario.dialogue.length} 轮对话 · 固定双人英文音频</small></div><button id="playAudio" type="button" class="button">${s.plays ? '重新播放' : '播放对话'}</button></div><label class="audio-speed" for="playbackRate">播放速度 <select id="playbackRate"><option value="0.9" ${s.rate === .9 ? 'selected' : ''}>慢速</option><option value="1" ${s.rate === 1 ? 'selected' : ''}>正常</option><option value="1.1" ${s.rate === 1.1 ? 'selected' : ''}>稍快</option></select></label>${!submitted ? `<button class="text-button" id="readingMode" type="button">${s.readingMode ? '已切换阅读模式' : '无法播放？改用阅读模式'}</button>${s.readingMode ? `<p class="answer-note">阅读模式仅用于体验流程，不计入听力正确率。</p><div class="transcript">${transcript}</div>` : ''}` : ''}${s.scenario.questions.map((q, i) => `<div class="question"><strong>${i + 1}. ${esc(q.q)}</strong><div class="choice-row">${q.choices.map((c, j) => `<button type="button" class="choice ${s.answers[i] === j ? 'selected' : ''} ${submitted && j === q.answer ? 'correct' : ''} ${submitted && s.answers[i] === j && j !== q.answer ? 'incorrect' : ''}" data-question="${i}" data-choice="${j}" ${submitted ? 'disabled' : ''}>${esc(c)}</button>`).join('')}</div></div>`).join('')}${submitted ? `<p class="answer-note">答对 ${score} / ${s.scenario.questions.length}。${scoreNote}</p><h3>对话原文</h3><div class="transcript">${transcript}</div><div class="button-row"><button class="button" id="toRoleplay" type="button">进入角色扮演</button></div>` : `<div class="button-row"><button class="button" id="submitListening" type="button" ${s.answers.some(a => a === null) || (!s.audioCompleted && !s.readingMode) ? 'disabled' : ''}>提交答案，解锁原文</button></div>`}`;
  byId('playAudio').onclick = speakDialogue;
  byId('playbackRate').onchange = event => { s.rate = Number(event.target.value); if (playingAudio) playingAudio.playbackRate = s.rate; };
  if (!submitted) {
    byId('readingMode').onclick = () => { s.readingMode = true; stopAudio(); renderListening(); };
    document.querySelectorAll('[data-question]').forEach(el => el.onclick = () => { s.answers[Number(el.dataset.question)] = Number(el.dataset.choice); renderListening(); });
    byId('submitListening').onclick = () => { if (s.answers.some(a => a === null) || (!s.audioCompleted && !s.readingMode)) return; s.listeningSubmitted = true; stopAudio(); renderListening(); };
  } else byId('toRoleplay').onclick = () => { s.stage = 'roleplay'; renderSession(); window.scrollTo(0, 0); };
}
function renderRoleplay() {
  const s = session, turn = s.scenario.turns[s.turn];
  byId('sessionContent').innerHTML = `<p class="content-lead">对方会逐轮提出情况。你可以说话或打字；请检查转写后再确认。当前第 ${s.turn + 1} / ${s.scenario.turns.length} 轮。</p><div class="roleplay-card"><div class="role-label">对方说</div><p>${esc(turn.line)}</p></div><p class="prompt-help">沟通目标：${esc(turn.hint)}</p><label for="utterance" class="role-label">你的英文回复</label><textarea id="utterance" class="utterance-input" placeholder="在这里输入英文，或点击语音输入…">${esc(s.transcriptDraft)}</textarea><p class="input-hint">语音识别可能出错。请修改为你实际说出的内容，再确认提交。</p><div class="button-row"><button class="button secondary" id="hearPrompt" type="button">听对方说</button><button class="button ghost" id="voiceInput" type="button">语音输入</button><button class="button" id="confirmUtterance" type="button">确认这段表达</button></div>`;
  byId('hearPrompt').onclick = () => playAudioFile(`audio/${s.scenario.id}-role-${s.turn}.m4a`);
  byId('voiceInput').onclick = startRecognition;
  byId('utterance').oninput = e => { s.transcriptDraft = e.target.value; };
  byId('confirmUtterance').onclick = () => {
    const text = byId('utterance').value.trim();
    if (text.length < 5) { notify('请先输入或说出至少一句英文回复。'); return; }
    s.utterances.push({ prompt: turn.line, text }); s.transcriptDraft = '';
    if (s.turn < s.scenario.turns.length - 1) { s.turn++; renderRoleplay(); window.scrollTo(0, 0); }
    else finishSession();
  };
}
function startRecognition() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Recognition) { notify('此浏览器不支持语音识别。请在文本框输入，或使用支持该功能的浏览器。'); return; }
  if (recognizing) { recognizing.stop(); return; }
  stopAudio();
  const recognition = new Recognition(); recognition.lang = 'en-US'; recognition.interimResults = false; recognition.continuous = false;
  recognizing = recognition; byId('voiceInput').textContent = '正在听… 点击结束';
  recognition.onresult = event => { const transcript = event.results[0][0].transcript; const field = byId('utterance'); if (field) { field.value = `${field.value.trim()} ${transcript}`.trim(); session.transcriptDraft = field.value; field.focus(); } notify('已转写。请检查文字，再确认提交。'); };
  recognition.onerror = event => notify(event.error === 'not-allowed' ? '麦克风权限被拒绝。请在浏览器设置中允许，或改用文字输入。' : '语音识别未完成。请重试或改用文字输入。');
  recognition.onend = () => { recognizing = null; const btn = byId('voiceInput'); if (btn) btn.textContent = '语音输入'; };
  try { recognition.start(); } catch { recognizing = null; notify('语音识别无法启动。请改用文字输入。'); }
}
function evaluate(s) {
  const allText = s.utterances.map(u => u.text).join(' ');
  return s.scenario.criteria.map(c => ({ ...c, met: c.test.test(allText), evidence: s.utterances.find(u => c.test.test(u.text))?.text || null }));
}
function finishSession() {
  stopAudio();
  const checks = evaluate(session), now = new Date();
  session.checks = checks; session.stage = 'feedback';
  const record = { id: `s-${now.getTime()}`, scenarioId: session.scenario.id, scenarioTitle: session.scenario.title, date: now.toISOString(), day: localDay(now), answers: [...session.answers], correct: session.scenario.questions.filter((q, i) => q.answer === session.answers[i]).length, plays: session.plays, readingMode: session.readingMode, utterances: session.utterances.map(u => ({ ...u })), checks: checks.map(({ id, label, met, evidence, quote }) => ({ id, label, met, evidence, quote })) };
  data.sessions.unshift(record);
  for (const c of checks.filter(c => !c.met)) {
    const existing = data.reviews.find(r => r.scenarioId === session.scenario.id && r.criterionId === c.id);
    if (existing) { existing.due = addDays(now, 1); existing.interval = 1; }
    else data.reviews.push({ id: `r-${now.getTime()}-${c.id}`, scenarioId: session.scenario.id, criterionId: c.id, prompt: c.prompt, answer: c.quote, due: addDays(now, 1), interval: 1, attempts: 0 });
  }
  saveData(); renderSession(); window.scrollTo(0, 0);
}
function renderFeedback() {
  const s = session, met = s.checks.filter(c => c.met).length, missing = s.checks.filter(c => !c.met).slice(0, 3);
  byId('sessionContent').innerHTML = `<div class="feedback-summary"><div class="score-ring">${met}/${s.checks.length}</div><div><strong>任务要点覆盖 ${met} 项</strong><p>仅依据你确认过的文字和预设关键词判断。可能漏判或误判；这不是口语能力评分。</p></div></div><h2>本次沟通复盘</h2>${s.checks.filter(c => c.met).map(c => `<div class="feedback-item good"><h3>✓ ${esc(c.label)}</h3><p>你说过：</p><blockquote>${esc(c.evidence)}</blockquote></div>`).join('')}${missing.map(c => `<div class="feedback-item"><h3>可补充：${esc(c.label)}</h3><p>当前对话中未识别到相关表达。你可以试着说：</p><blockquote>${esc(c.quote)}</blockquote></div>`).join('')}${missing.length ? `<p class="answer-note">以上 ${missing.length} 条表达已加入隔天复习。你也可以现在重新说一遍。</p><label for="respeak" class="role-label">现在复述一条改进表达</label><textarea id="respeak" class="utterance-input" placeholder="例如：${esc(missing[0].quote)}"></textarea><div class="button-row"><button id="saveRespeak" class="button secondary" type="button">保存本次复述</button></div>` : '<p class="answer-note">本次任务要点均有覆盖。下一次试试另一个场景。</p>'}<div class="button-row"><button class="button" id="finishToHome" type="button">完成训练</button></div>`;
  byId('finishToHome').onclick = () => { session = null; showView('today'); };
  if (missing.length) byId('saveRespeak').onclick = () => { const text = byId('respeak').value.trim(); if (text.length < 5) { notify('请先写下一句英文表达。'); return; } const record = data.sessions[0]; if (record?.scenarioId === s.scenario.id) { record.respeak = text; saveData(); } notify('已保存复述。明天可在表达复习中再次练习。'); byId('saveRespeak').disabled = true; };
}
function renderReview() {
  const due = data.reviews.filter(r => r.due <= localDay()), upcoming = data.reviews.filter(r => r.due > localDay());
  byId('reviewContent').innerHTML = due.length ? `<div class="review-list">${due.map(r => `<div class="review-card" data-review="${esc(r.id)}"><h2>${esc(SCENARIOS.find(s => s.id === r.scenarioId)?.title || '表达复习')}</h2><p class="review-prompt">${esc(r.prompt)}</p><textarea class="utterance-input" aria-label="写下你的英文表达" placeholder="先自己说出或写下英文，再查看参考表达…"></textarea><button class="button secondary reveal-review" type="button">查看参考表达</button><div class="review-answer" hidden><strong>参考表达：</strong>${esc(r.answer)}<div class="button-row"><button class="button mastered" type="button">我能独立表达</button><button class="button ghost retry" type="button">还需练习</button></div></div></div>`).join('')}</div>` : `<div class="empty-state"><strong>今天没有待复习的表达</strong><p>${upcoming.length ? `已有 ${upcoming.length} 条表达会在之后出现。` : '完成一次场景训练后，遗漏的沟通要点会进入复习。'}</p><button class="button" id="reviewGoToday" type="button">开始今日训练</button></div>`;
  byId('reviewGoToday')?.addEventListener('click', () => showView('today'));
  document.querySelectorAll('[data-review]').forEach(card => {
    const r = data.reviews.find(x => x.id === card.dataset.review); if (!r) return;
    card.querySelector('.reveal-review').onclick = () => { card.querySelector('.review-answer').hidden = false; card.querySelector('.reveal-review').hidden = true; };
    card.querySelector('.mastered').onclick = () => completeReview(r, true);
    card.querySelector('.retry').onclick = () => completeReview(r, false);
  });
}
function completeReview(r, mastered) { r.attempts++; r.interval = mastered ? Math.min(r.interval * 2 + 1, 30) : 1; r.due = addDays(new Date(), r.interval); saveData(); notify(mastered ? `已记录，下次 ${r.interval} 天后复习。` : '已记录，明天再练。'); renderReview(); }
function renderProgress() {
  const records = data.sessions, today = localDay(), last7 = records.filter(r => r.day >= addDays(new Date(), -6) && r.day <= today);
  const firstPass = records.filter(r => r.plays === 1 && !r.readingMode);
  const totalCorrect = firstPass.reduce((n, r) => n + r.correct, 0), totalQuestions = firstPass.reduce((n, r) => n + r.answers.length, 0);
  byId('progressContent').innerHTML = `<div class="metric-row"><div class="metric-card"><span>累计训练</span><strong>${records.length} 次</strong></div><div class="metric-card"><span>近 7 天训练</span><strong>${new Set(last7.map(r => r.day)).size} 天</strong></div><div class="metric-card"><span>首次听力答题正确</span><strong>${totalQuestions ? `${Math.round(totalCorrect / totalQuestions * 100)}%` : '—'}</strong></div></div>${records.length ? `<div class="record-list">${records.map(r => `<div class="record-card"><div><h3>${esc(r.scenarioTitle)}</h3><p>${esc(r.day)} · ${r.readingMode ? '阅读模式' : `听力 ${r.correct}/${r.answers.length} · 播放 ${r.plays} 次`}</p></div><strong>任务要点 ${r.checks.filter(c => c.met).length}/${r.checks.length}</strong></div>`).join('')}</div>` : '<div class="empty-state"><strong>还没有训练记录</strong><p>完成第一轮听说训练后，这里会显示具体结果。</p><button class="button" id="progressGoToday" type="button">开始今日训练</button></div>'}`;
  byId('progressGoToday')?.addEventListener('click', () => showView('today'));
}
function exportData() { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `english-coach-${localDay()}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); notify('已导出本地练习记录。'); }
function deleteData() { if (!confirm('确定删除此浏览器里的全部训练和复习记录吗？此操作无法撤销。')) return; localStorage.removeItem(STORAGE_KEY); data = defaultData(); session = null; updateBadge(); notify('本地记录已删除。'); showView('today'); }

document.querySelectorAll('.nav-item').forEach(el => el.onclick = () => showView(el.dataset.view));
byId('backHome').onclick = () => { if (session && session.stage !== 'feedback' && !confirm('返回后，本次未完成的训练不会保存。确定返回吗？')) return; session = null; showView('today'); };
byId('exportData').onclick = exportData; byId('deleteData').onclick = deleteData;
byId('todayDate').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date());
updateBadge(); renderHome();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
