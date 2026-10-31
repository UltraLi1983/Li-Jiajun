const $ = id => document.getElementById(id);
const escapeHtml = text => String(text ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const state = { config: null, scenarioId: 'delivery', topic: '', phase: 'landing', mode: null, pc: null, channel: null, micStream: null, micTrack: null, messages: [], recording: false, busy: false, starting: false };
const icons = { delivery: '▦', meeting: '◇', customer: '◌', custom: '✎' };

function scenario() { return state.config?.scenarios.find(item => item.id === state.scenarioId); }
function showError(message) { $('errorBanner').textContent = message; $('errorBanner').hidden = false; }
function clearError() { $('errorBanner').hidden = true; $('errorBanner').textContent = ''; }
function setStatus(text, live = false) { $('connectionStatus').textContent = text; $('connectionStatus').classList.toggle('live', live); }
function showView(name) { state.phase = name; for (const id of ['landing', 'conversation', 'review']) $(`${id}View`).hidden = id !== name; $('endButton').hidden = name !== 'conversation'; if (state.config) renderScenarioList(); window.scrollTo(0, 0); }
function setBusy(value) { state.busy = value; $('sendText').disabled = value; $('textInput').disabled = value; $('micButton').disabled = value || state.mode !== 'voice'; }
function renderScenarioList() {
  $('scenarioList').innerHTML = state.config.scenarios.map(item => `<button type="button" class="scenario-button ${item.id === state.scenarioId ? 'active' : ''}" data-scenario="${item.id}" ${state.phase !== 'landing' ? 'disabled' : ''}><span class="scenario-icon">${icons[item.id]}</span>${escapeHtml(item.title)}</button>`).join('');
  document.querySelectorAll('[data-scenario]').forEach(button => button.onclick = () => { if (state.phase !== 'landing') return; state.scenarioId = button.dataset.scenario; renderScenarioList(); renderLanding(); });
}
function renderLanding() {
  const item = scenario(); if (!item) return;
  $('selectedCategory').textContent = item.category;
  $('selectedTitle').textContent = item.title;
  $('selectedBrief').textContent = item.brief;
  $('selectedCounterpart').textContent = item.counterpart;
  $('selectedMission').textContent = item.mission;
  $('topbarScene').textContent = item.title;
  $('customBox').hidden = item.id !== 'custom';
}
function addMessage(role, text, source = 'text', pending = false, itemId = '') {
  const message = { role, text, source, pending, itemId, id: crypto.randomUUID() };
  state.messages.push(message); renderMessages(); return message;
}
function renderMessages() {
  $('messages').innerHTML = state.messages.map(message => `<div class="message ${message.role}"><div class="message-who">${message.role === 'assistant' ? escapeHtml(scenario()?.counterpart.split('，')[0] || 'AI') : '你'}</div><div class="message-bubble">${escapeHtml(message.text)}</div>${message.source === 'voice' ? `<div class="message-note">${message.pending ? '语音识别中，复盘前可修改' : '语音转写 · 复盘前可修改'}</div>` : ''}</div>`).join('');
  $('messages').scrollTop = $('messages').scrollHeight;
}
function updateAssistantTranscript(event) {
  const text = String(event.transcript || event.text || '').trim(); if (!text) return;
  const id = event.item_id || event.response_id || '';
  const existing = id && state.messages.find(message => message.role === 'assistant' && message.itemId === id);
  if (existing) existing.text = text;
  else addMessage('assistant', text, 'voice', false, id);
  renderMessages();
}
function handleRealtimeEvent(event) {
  if (event.type === 'error') { showError(event.error?.message || 'AI 对话出现错误。'); setBusy(false); return; }
  if (event.type === 'response.created') { setBusy(true); setStatus('AI 正在回应…', true); }
  if (event.type === 'conversation.item.input_audio_transcription.completed') {
    const pending = state.messages.find(message => message.role === 'user' && message.pending);
    if (pending) { pending.text = event.transcript || '未能识别，请在复盘时补写'; pending.pending = false; pending.itemId = event.item_id || ''; renderMessages(); }
    else addMessage('user', event.transcript || '未能识别，请在复盘时补写', 'voice', false, event.item_id || '');
  }
  if (event.type === 'conversation.item.input_audio_transcription.failed') {
    const pending = state.messages.find(message => message.role === 'user' && message.pending);
    if (pending) { pending.text = '未能识别，请在复盘时补写'; pending.pending = false; renderMessages(); }
  }
  if (event.type === 'response.output_audio_transcript.done' || event.type === 'response.output_text.done') updateAssistantTranscript(event);
  if (event.type === 'response.done') {
    const output = event.response?.output || [];
    for (const item of output) for (const content of item.content || []) {
      if (content.transcript && !state.messages.some(message => message.role === 'assistant' && message.itemId === item.id)) updateAssistantTranscript({ transcript: content.transcript, item_id: item.id });
    }
    setBusy(false); setStatus(event.response?.status === 'failed' ? '回应失败' : '等待你发言', true);
    if (event.response?.status === 'failed') showError('AI 没有完成回复，可以再说一次或结束复盘。');
  }
}
function sendEvent(event) { if (state.channel?.readyState !== 'open') throw new Error('对话尚未连接。'); state.channel.send(JSON.stringify(event)); }
function cleanupConnection() {
  if (state.micTrack) state.micTrack.enabled = false;
  state.micStream?.getTracks().forEach(track => track.stop());
  state.channel?.close(); state.pc?.close();
  state.pc = null; state.channel = null; state.micStream = null; state.micTrack = null; state.recording = false;
  $('remoteAudio').srcObject = null; $('micButton').classList.remove('recording'); $('micButton').setAttribute('aria-pressed', 'false'); $('micLabel').textContent = '点击开始说话';
}
async function start(mode) {
  if (state.starting || state.pc) return;
  if (!state.config?.configured) { showError('尚未配置 API 密钥。请先在终端设置 OPENAI_API_KEY，再运行 npm start。'); return; }
  const topic = $('customTopic').value.trim();
  if (state.scenarioId === 'custom' && !topic) { showError('请先写下你想练习的场景。'); $('customTopic').focus(); return; }
  if (typeof RTCPeerConnection === 'undefined') { showError('当前浏览器不支持 WebRTC。请换用较新的浏览器。'); return; }
  clearError(); state.starting = true; state.mode = mode; state.topic = topic; state.messages = [];
  $('startVoice').disabled = $('startText').disabled = true; setStatus('正在连接…');
  try {
    const pc = new RTCPeerConnection(); state.pc = pc;
    pc.ontrack = event => { $('remoteAudio').srcObject = event.streams[0]; $('remoteAudio').play().catch(() => showError('浏览器阻止了自动播放，请检查页面的声音权限。')); };
    pc.onconnectionstatechange = () => { if (state.pc === pc && ['failed', 'disconnected'].includes(pc.connectionState)) { setStatus('连接中断'); showError('语音连接已中断。你可以结束并复盘当前内容。'); } };
    if (mode === 'voice') {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      state.micStream = stream; state.micTrack = stream.getAudioTracks()[0]; state.micTrack.enabled = false; pc.addTrack(state.micTrack, stream);
    } else pc.addTransceiver('audio', { direction: 'recvonly' });
    const channel = pc.createDataChannel('oai-events'); state.channel = channel;
    channel.onmessage = message => { try { handleRealtimeEvent(JSON.parse(message.data)); } catch (error) { console.error(error); } };
    channel.onclose = () => { if (state.pc === pc) { setStatus('连接已关闭'); setBusy(false); } };
    const offer = await pc.createOffer(); await pc.setLocalDescription(offer);
    const response = await fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sdp: offer.sdp, scenarioId: state.scenarioId, topic }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || '无法创建 AI 会话。');
    await pc.setRemoteDescription({ type: 'answer', sdp: result.sdp });
    await new Promise((resolve, reject) => { if (channel.readyState === 'open') return resolve(); channel.onopen = resolve; const timer = setTimeout(() => reject(new Error('语音连接超时。')), 18000); channel.addEventListener('open', () => clearTimeout(timer), { once: true }); });
    $('conversationTitle').textContent = scenario().title;
    $('conversationSubtitle').textContent = `${scenario().counterpart} · ${scenario().mission}`;
    $('voiceControls').hidden = mode !== 'voice';
    renderMessages(); showView('conversation'); setStatus('已连接', true); setBusy(false);
    sendEvent({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'Begin the role-play now. Speak as the counterpart and introduce the situation naturally.' }] } });
    sendEvent({ type: 'response.create' });
  } catch (error) {
    cleanupConnection(); showView('landing'); showError(error.name === 'NotAllowedError' ? '麦克风权限未开启。你可以改用文字体验，或在浏览器设置中允许麦克风。' : error.message || '连接失败。'); setStatus('未连接');
  } finally { state.starting = false; $('startVoice').disabled = $('startText').disabled = false; }
}
function sendText() {
  const text = $('textInput').value.trim(); if (!text || state.busy || !state.channel) return;
  $('textInput').value = ''; addMessage('user', text);
  try { sendEvent({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] } }); sendEvent({ type: 'response.create' }); setBusy(true); setStatus('AI 正在回应…', true); }
  catch (error) { showError(error.message); setBusy(false); }
}
function toggleMic() {
  if (state.mode !== 'voice' || !state.micTrack || state.busy) return;
  if (!state.recording) {
    try { sendEvent({ type: 'input_audio_buffer.clear' }); } catch (error) { showError(error.message); return; }
    state.micTrack.enabled = true; state.recording = true; $('textInput').disabled = $('sendText').disabled = true; $('micButton').classList.add('recording'); $('micButton').setAttribute('aria-pressed', 'true'); $('micLabel').textContent = '点击发送语音'; setStatus('正在听你说话…', true);
  } else {
    state.micTrack.enabled = false; state.recording = false; $('micButton').classList.remove('recording'); $('micButton').setAttribute('aria-pressed', 'false'); $('micLabel').textContent = '点击开始说话';
    addMessage('user', '正在识别语音…', 'voice', true);
    setBusy(true); setStatus('正在处理语音…', true);
    setTimeout(() => { try { sendEvent({ type: 'input_audio_buffer.commit' }); sendEvent({ type: 'response.create' }); } catch (error) { showError(error.message); setBusy(false); } }, 250);
  }
}
function endConversation() {
  cleanupConnection(); setBusy(false); setStatus('对话已结束');
  $('topbarScene').textContent = '对话复盘'; renderTranscript(); showView('review');
}
function renderTranscript() {
  const visible = state.messages.filter(message => message.role === 'assistant' || message.role === 'user');
  $('editableTranscript').innerHTML = visible.length ? visible.map((message, index) => `<div class="transcript-row ${message.role}" data-index="${index}"><div class="transcript-role">${message.role === 'user' ? '你' : escapeHtml(scenario()?.counterpart.split('，')[0] || 'AI')}</div>${message.role === 'user' ? `<textarea aria-label="修改第 ${index + 1} 段你的表达">${escapeHtml(message.pending ? '' : message.text.startsWith('未能识别') ? '' : message.text)}</textarea>` : `<p>${escapeHtml(message.text)}</p>`}</div>`).join('') : '<p class="transcript-note">这次还没有可复盘的对话。请先说或写一句英文。</p>';
  $('requestFeedback').disabled = !visible.some(message => message.role === 'user');
  if (visible.some(message => message.source === 'voice')) {
    const note = document.createElement('p'); note.className = 'transcript-note'; note.textContent = '语音转写可能与实际表达不同。请先改成你真正说过的话，再生成反馈。'; $('editableTranscript').append(note);
  }
}
function confirmedMessages() {
  return [...$('editableTranscript').querySelectorAll('.transcript-row')].map(row => ({ role: state.messages[Number(row.dataset.index)].role, text: row.querySelector('textarea')?.value.trim() || row.querySelector('p')?.textContent.trim() || '' })).filter(message => message.text);
}
async function requestFeedback() {
  const messages = confirmedMessages();
  if (!messages.some(message => message.role === 'user')) { showError('请先确认至少一句你说过的英文表达。'); return; }
  clearError(); $('requestFeedback').disabled = true; $('requestFeedback').textContent = '正在生成反馈…';
  try {
    const response = await fetch('/api/feedback', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenarioId: state.scenarioId, topic: state.topic, messages }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error || '生成反馈失败。');
    renderFeedback(result.feedback);
  } catch (error) { showError(error.message); $('requestFeedback').disabled = false; }
  finally { $('requestFeedback').textContent = '重新生成重点反馈 ↗'; }
}
function renderFeedback(feedback) {
  $('feedbackPanel').innerHTML = `<h2>本次重点反馈</h2><p>${escapeHtml(feedback.summary)}</p><div class="next-try"><strong>做得好：</strong>${escapeHtml(feedback.strength)}</div>${feedback.issues.length ? feedback.issues.map(issue => `<div class="feedback-item"><span class="kind">${escapeHtml(issue.category)}</span><blockquote>${escapeHtml(issue.original)}</blockquote><strong>${escapeHtml(issue.suggestion)}</strong><p>${escapeHtml(issue.reason)}</p></div>`).join('') : '<div class="feedback-item"><strong>这次没有需要强行纠正的表达。</strong></div>'}<div class="next-try"><strong>下次试试：</strong>${escapeHtml(feedback.nextTry)}</div>`;
  $('requestFeedback').disabled = false;
}
function startAgain() { cleanupConnection(); state.messages = []; state.mode = null; clearError(); renderLanding(); showView('landing'); setStatus('准备就绪'); }

$('startVoice').onclick = () => start('voice'); $('startText').onclick = () => start('text');
$('sendText').onclick = sendText; $('textInput').onkeydown = event => { if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); sendText(); } };
$('micButton').onclick = toggleMic; $('endButton').onclick = endConversation; $('requestFeedback').onclick = requestFeedback; $('startAgain').onclick = startAgain;
window.addEventListener('beforeunload', cleanupConnection);
fetch('/api/config').then(response => response.json()).then(config => {
  state.config = config; renderScenarioList(); renderLanding();
  if (!config.configured) showError('AI 对话尚未启用：启动前在终端设置 OPENAI_API_KEY，然后运行 npm start。密钥只保存在本地服务端。');
}).catch(() => showError('无法连接本地对话服务。请在项目目录运行 npm start。'));
