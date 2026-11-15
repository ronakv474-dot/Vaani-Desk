// Task 6: intent accuracy + latency.
// Usage:
//   node tools/eval.js                       -> dataset sentences ko text se engine pe chalao (baseline)
//   node tools/eval.js transcripts.json      -> asli Prisma transcripts pe accuracy
//        format: [{ "text": "<Prisma transcript>", "intent": "<expected>" }]
//   node tools/eval.js --calls vaanidesk-calls.json  -> app ke exported log se latency (median / worst)
const fs = require('fs');
const path = require('path');
const E = require('../public/engine.js');

const args = process.argv.slice(2);
const median = (a) => { const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };

if (args[0] === '--calls') {
  const calls = JSON.parse(fs.readFileSync(args[1], 'utf8')).filter((c) => c.sttMs > 0);
  if (!calls.length) { console.log('Koi voice turn nahi mila (text turns skip hote hain).'); process.exit(0); }
  const stat = (k) => { const v = calls.map((c) => c[k]).filter((x) => x != null); return v.length ? `median ${median(v)} ms, worst ${Math.max(...v)} ms` : 'n/a'; };
  console.log(`Voice turns: ${calls.length}`);
  console.log(`STT   : ${stat('sttMs')}`);
  console.log(`TTS   : ${stat('ttsMs')}`);
  console.log(`Total : ${stat('totalMs')}`);
  process.exit(0);
}

const file = args[0] || path.join(__dirname, 'dataset.json');
const rows = JSON.parse(fs.readFileSync(file, 'utf8'));
let ok = 0;
for (const r of rows) {
  const text = (r.text || r.say).replace(/\s*\(.*?\)\s*$/, '');
  const got = E.parse(text).intent;
  const hit = got === r.intent;
  if (hit) ok++;
  else console.log(`MISS  "${text}"  want=${r.intent}  got=${got}`);
}
console.log(`\nIntent accuracy: ${ok}/${rows.length} = ${Math.round((ok / rows.length) * 100)}%`);
