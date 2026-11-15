// VaaniDesk (dukaan): voice khata + customer line. mic -> WAV 16k -> /api/stt -> engine -> /api/tts
(function () {
  'use strict';
  const E = window.VaaniEngine, C = window.VaaniConfig, S = window.VaaniStore;
  const $ = (id) => document.getElementById(id);

  $('ownerName').textContent = C.business.owner || 'Owner';
  $('shopName').textContent = C.business.name;

  // ---------- audio ----------
  async function toWav16k(blob) {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    const rate = 16000;
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
    const src = off.createBufferSource();
    src.buffer = decoded; src.connect(off.destination); src.start();
    const pcm = (await off.startRendering()).getChannelData(0);
    const buf = new ArrayBuffer(44 + pcm.length * 2);
    const v = new DataView(buf);
    const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    str(0, 'RIFF'); v.setUint32(4, 36 + pcm.length * 2, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, 'data'); v.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) { const s = Math.max(-1, Math.min(1, pcm[i])); v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true); }
    return new Blob([buf], { type: 'audio/wav' });
  }

  function setStatus(el, msg, err) { el.textContent = msg; el.classList.toggle('err', !!err); }

  function makeRecorder(btn, statusEl, onBlob) {
    let rec = null, timer = null;
    async function start() {
      if (!navigator.mediaDevices || !window.MediaRecorder) { setStatus(statusEl, 'Mic is not supported in this browser. Please type instead.', true); return; }
      let stream;
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
      catch (e) { setStatus(statusEl, 'Mic permission denied. Click 🔒 in the address bar and allow the mic, or type instead.', true); return; }
      const chunks = [];
      rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      rec.onstop = () => {
        clearTimeout(timer);
        stream.getTracks().forEach((tr) => tr.stop());
        btn.classList.remove('rec');
        const blob = new Blob(chunks, { type: rec.mimeType });
        rec = null;
        onBlob(blob);
      };
      rec.start();
      btn.classList.add('rec');
      setStatus(statusEl, '● Listening… tap again when done');
      timer = setTimeout(() => rec && rec.stop(), 25000);
    }
    btn.addEventListener('click', () => { if (btn.disabled) return; if (rec && rec.state === 'recording') rec.stop(); else start(); });
  }

  // ---------- Gnani via Worker ----------
  class ApiError extends Error { constructor(m, s) { super(m); this.status = s; } }
  async function stt(wav) {
    const fd = new FormData(); fd.append('audio_file', wav, 'speech.wav');
    const res = await fetch('/api/stt', { method: 'POST', body: fd });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(d.error || 'STT fail', res.status);
    return d.transcript || '';
  }
  const ttsCache = new Map();
  async function tts(text) {
    const key = text.slice(0, 400);
    if (ttsCache.has(key)) return { url: ttsCache.get(key), cached: true };
    const res = await fetch('/api/tts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: key }) });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new ApiError(d.error || 'TTS fail', res.status); }
    const url = URL.createObjectURL(await res.blob());
    if (ttsCache.size > 40) { const [k, u] = ttsCache.entries().next().value; URL.revokeObjectURL(u); ttsCache.delete(k); }
    ttsCache.set(key, url);
    return { url, cached: false };
  }
  let cur = null;
  function play(url) {
    return new Promise((resolve) => { if (cur) cur.pause(); const a = new Audio(url); cur = a; a.onended = a.onerror = () => resolve(); a.play().catch(() => resolve()); });
  }
  async function playFiller() { const u = ttsCache.get(C.filler); if (u) await play(u); }
  let fillerTried = false;
  function prefetchFiller() { if (fillerTried) return; fillerTried = true; tts(C.filler).catch(() => { fillerTried = false; }); }

  async function speak(text, st) {
    setStatus(st, '🔊 Speaking…');
    const t1 = performance.now();
    try { const { url, cached } = await tts(text); const ms = Math.round(performance.now() - t1); await play(url); return { ttsMs: ms, cached }; }
    catch (e) { if (e.status === 429) await playFiller(); setStatus(st, 'Voice unavailable. The reply is shown above.', true); return { ttsMs: null }; }
  }

  function showLatency(sttMs, ttsMs, totalMs) {
    document.querySelectorAll('.lat').forEach((c) => {
      c.hidden = false;
      c.textContent = `⚡ STT ${sttMs || 0} · TTS ${ttsMs == null ? '—' : ttsMs} · ${totalMs} ms`;
      c.className = 'lat chip ' + (totalMs < 2500 ? 'fast' : totalMs > 5000 ? 'slow' : '');
    });
  }

  let busy = false;
  function setBusy(b) {
    busy = b;
    document.querySelectorAll('.mic, .textform button, .try, .try2').forEach((x) => { x.disabled = b; });
  }

  // generic voice/text runner
  async function runVoice(blob, st, turn) {
    if (busy) return;
    setBusy(true);
    const t0 = performance.now();
    try {
      setStatus(st, 'Understanding…');
      const wav = await toWav16k(blob);
      if (wav.size > 1.5 * 1024 * 1024) throw new ApiError('Please keep it under 25 seconds', 413);
      const text = await stt(wav);
      if (!text.trim()) { setStatus(st, 'Could not hear anything. Please try again.', true); return; }
      await turn(text, Math.round(performance.now() - t0), t0);
    } catch (e) {
      if (e.status === 429) { await playFiller(); setStatus(st, 'Server is busy. Try again in 2 seconds.', true); }
      else setStatus(st, 'Could not process audio. Please type instead.', true);
    } finally { setBusy(false); }
  }
  async function runText(text, turn) {
    if (busy || !text.trim()) return;
    setBusy(true);
    try { await turn(text.trim(), 0, performance.now()); } finally { setBusy(false); }
  }

  // ---------- owner: khata ----------
  let ownerState = { mode: 'owner' };
  async function ownerTurn(text, sttMs, t0) {
    const st = $('ownerStatus');
    const parsed = E.parse(text);
    const r = E.step(ownerState, parsed, C, S.get(), { now: new Date() });
    ownerState = r.state;
    S.apply(r.actions);
    $('ownerHeard').hidden = false; $('ownerHeard').textContent = text;
    $('ownerReply').hidden = false; $('ownerReply').textContent = r.reply.text;
    if (r.actions.length) { $('hTotal').parentElement.parentElement.classList.remove('bump'); void $('hTotal').offsetWidth; $('hTotal').parentElement.parentElement.classList.add('bump'); }
    const lat = await speak(r.reply.speak, st);
    const totalMs = Math.round(performance.now() - t0);
    S.logTurn({ session: 'owner', mode: 'owner', text, reply: r.reply.text, intent: parsed.intent, lang: parsed.lang, sttMs, ttsMs: lat.ttsMs, totalMs });
    showLatency(sttMs, lat.ttsMs, totalMs);
    if (lat.ttsMs != null) setStatus(st, 'Done ✓  Tap the mic for the next entry');
    prefetchFiller();
  }

  // ---------- customer line ----------
  let callerState = { mode: 'caller' };
  let session = 's' + Date.now().toString(36);
  function bubble(who, text, meta) {
    const el = document.createElement('div');
    el.className = 'bubble ' + who; el.textContent = text;
    if (meta) { const m = document.createElement('small'); m.textContent = meta; el.appendChild(m); }
    $('bubbles').appendChild(el); $('bubbles').scrollTop = $('bubbles').scrollHeight;
  }
  async function callerTurn(text, sttMs, t0) {
    const st = $('status');
    const parsed = E.parse(text);
    const r = E.step(callerState, parsed, C, S.get(), { now: new Date() });
    callerState = r.state;
    bubble('user', text);
    S.apply(r.actions);
    bubble('bot', r.reply.text, parsed.intent);
    const lat = await speak(r.reply.speak, st);
    const totalMs = Math.round(performance.now() - t0);
    S.logTurn({ session, mode: 'caller', text, reply: r.reply.text, intent: parsed.intent, lang: parsed.lang, sttMs, ttsMs: lat.ttsMs, totalMs });
    showLatency(sttMs, lat.ttsMs, totalMs);
    if (lat.ttsMs != null) setStatus(st, 'Ask the next question as the customer');
    prefetchFiller();
  }

  // ---------- reminder ----------
  let tone = 'soft';
  async function remind(row, el) {
    const box = el.querySelector('.r-actions');
    const msg = E.reminder(row.name, row.due, tone, C);
    box.innerHTML = '';
    const m = document.createElement('div'); m.className = 'r-msg'; m.textContent = msg.text; box.appendChild(m);
    const btns = document.createElement('div'); btns.className = 'r-btns';
    const wa = document.createElement('a'); wa.className = 'wa'; wa.target = '_blank'; wa.rel = 'noopener';
    wa.href = 'https://wa.me/?text=' + encodeURIComponent(msg.text); wa.textContent = 'WhatsApp';
    btns.appendChild(wa); box.appendChild(btns);
    try {
      const { url } = await tts(msg.speak);
      const audio = document.createElement('audio'); audio.controls = true; audio.src = url;
      box.insertBefore(audio, btns); audio.play().catch(() => {});
      if (navigator.canShare) {
        const blob = await (await fetch(url)).blob();
        const file = new File([blob], 'yaad-' + row.name.replace(/\W+/g, '-') + '.mp3', { type: blob.type || 'audio/mpeg' });
        if (navigator.canShare({ files: [file] })) {
          const b = document.createElement('button'); b.type = 'button'; b.className = 'share'; b.textContent = '🎧 Send voice note';
          b.onclick = () => navigator.share({ files: [file], text: msg.text }).catch(() => {});
          btns.appendChild(b);
        }
      }
    } catch (e) {
      const p = document.createElement('small'); p.textContent = 'Voice note failed. You can still send the text on WhatsApp.'; box.appendChild(p);
    }
  }

  // ---------- render ----------
  const rupee = (n) => '₹' + Math.abs(Number(n)).toLocaleString('en-IN');
  const isToday = (ts) => new Date(ts).toDateString() === new Date().toDateString();
  const hhmm = (ts) => new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const ago = (ts) => { const m = Math.round((Date.now() - ts) / 60000); if (m < 1) return 'just now'; if (m < 60) return m + ' min ago'; if (isToday(ts)) return 'today ' + hhmm(ts); return new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }); };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const COLORS = ['#22A06B', '#5B6CFF', '#F5A623', '#E5484D', '#0EA5E9', '#9B5DE5', '#16181D'];
  const avatar = (name) => { let h = 0; for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0; const ini = name.split(/\s+/).filter((w) => !/^ji$/i.test(w)).map((w) => w[0]).join('').slice(0, 2).toUpperCase() || name[0].toUpperCase(); return `<span class="av" style="background:${COLORS[h % COLORS.length]}">${esc(ini)}</span>`; };
  const empty = (t) => `<li class="row empty">${t}</li>`;

  function render() {
    const d = S.get();
    const rows = S.ledgerByName();
    const dueRows = rows.filter((r) => r.due > 0);
    const total = dueRows.reduce((a, r) => a + r.due, 0);
    $('hTotal').textContent = rupee(total);
    $('hCustomers').textContent = dueRows.length;
    const todays = d.ledger.filter((e) => isToday(e.ts));
    $('mEntries').textContent = todays.length;
    $('mJama').textContent = rupee(todays.filter((e) => e.amount < 0).reduce((a, e) => a - e.amount, 0));
    $('mCalls').textContent = new Set(d.calls.filter((c) => c.mode === 'caller' && isToday(c.ts)).map((c) => c.session)).size;

    $('recent').innerHTML = d.ledger.slice(-5).reverse().map((e) => `<li class="row">${avatar(e.name)}<div class="row-main"><b>${esc(e.name)}</b><small>${ago(e.ts)}</small></div>
      <div style="text-align:right"><div class="amt ${e.amount > 0 ? 'due' : 'paid'}">${e.amount > 0 ? '+' : '−'}${rupee(e.amount)}</div><span class="pill ${e.amount > 0 ? 'due' : 'paid'}">${e.amount > 0 ? 'Credit' : 'Paid'}</span></div></li>`).join('') || empty('No entries yet. Tap the mic and say: "Sharma ji ke 2000 baaki"');

    const q = ($('search').value || '').trim().toLowerCase();
    const list = $('ledgerRows'); list.innerHTML = '';
    const shown = rows.filter((r) => !q || r.name.toLowerCase().includes(q)).sort((a, b) => b.due - a.due);
    if (!shown.length) list.innerHTML = empty(q ? 'No customer found' : 'Ledger is empty');
    shown.forEach((r) => {
      const li = document.createElement('li'); li.className = 'row col';
      li.innerHTML = `${avatar(r.name)}<div class="row-main"><b>${esc(r.name)}</b><small>Last entry: ${ago(r.last)}</small></div>
        <div class="amt ${r.due > 0 ? 'due' : 'paid'}">${r.due > 0 ? rupee(r.due) : 'Settled ✓'}</div>
        ${r.due > 0 ? '<button class="remind" type="button">🔔 Remind</button>' : ''}<div class="r-actions"></div>`;
      const b = li.querySelector('.remind'); if (b) b.onclick = () => remind(r, li);
      list.appendChild(li);
    });

    $('callbacks').innerHTML = d.callbacks.slice(-8).reverse().map((c) => `<li class="row"><span class="av" style="background:#F5A623">📞</span><div class="row-main"><b>“${esc(c.text)}”</b><small>${ago(c.ts)}</small></div></li>`).join('') || empty('No callbacks');
    $('callLog').innerHTML = d.calls.filter((c) => c.mode !== 'owner').slice(-15).reverse().map((c) => `<li class="row"><div class="row-main"><b>“${esc(c.text)}”</b><small>${hhmm(c.ts)} · ${c.totalMs} ms</small></div><span class="tag ${esc(c.intent)}">${esc(c.intent)}</span></li>`).join('') || empty('No calls yet');

    const unseen = d.alerts.filter((a) => !a.seen);
    $('alertBanner').hidden = !unseen.length;
    if (unseen.length) $('alertText').textContent = unseen[unseen.length - 1].text;
    const n = unseen.length + d.callbacks.filter((c) => isToday(c.ts)).length;
    $('bellBadge').hidden = !n; $('bellBadge').textContent = n;
  }

  // ---------- navigation ----------
  function go(name) {
    ['home', 'khata', 'grahak'].forEach((s) => { $('screen-' + s).hidden = s !== name; });
    document.querySelectorAll('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.go === name));
    window.scrollTo({ top: 0 });
  }
  document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => go(b.dataset.go)));
  $('bell').addEventListener('click', () => go('grahak'));

  // ---------- wire ----------
  makeRecorder($('ownerMic'), $('ownerStatus'), (b) => runVoice(b, $('ownerStatus'), ownerTurn));
  makeRecorder($('mic'), $('status'), (b) => runVoice(b, $('status'), callerTurn));
  $('ownerForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('ownerInput').value; $('ownerInput').value = ''; runText(v, ownerTurn); });
  $('textForm').addEventListener('submit', (e) => { e.preventDefault(); const v = $('textInput').value; $('textInput').value = ''; runText(v, callerTurn); });
  document.querySelectorAll('.try').forEach((b) => b.addEventListener('click', () => runText(b.textContent, ownerTurn)));
  document.querySelectorAll('.try2').forEach((b) => b.addEventListener('click', () => runText(b.textContent, callerTurn)));
  $('newCall').addEventListener('click', () => { callerState = { mode: 'caller' }; session = 's' + Date.now().toString(36); $('bubbles').innerHTML = ''; setStatus($('status'), 'New call. Speak as the customer.'); });
  document.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => { tone = b.dataset.tone; document.querySelectorAll('.seg-btn').forEach((x) => x.classList.toggle('active', x === b)); }));
  $('search').addEventListener('input', render);
  $('alertDismiss').addEventListener('click', () => S.dismissAlerts());
  $('exportLog').addEventListener('click', () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(S.get().calls, null, 2)], { type: 'application/json' })); a.download = 'vaanidesk-calls.json'; a.click(); });
  $('resetData').addEventListener('click', () => { if (confirm('Delete all demo data?')) S.reset(); });

  S.subscribe(render);
  render();
})();
