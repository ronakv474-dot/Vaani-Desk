// node tools/test-engine.js
const E = require('../public/engine.js');
const shopConfig = require('../public/config.js');
const config = shopConfig.clinic;

const NOW = new Date(2026, 10, 16, 11, 0); // Somvaar 16 Nov 2026, 11:00
let pass = 0, fail = 0;
function check(name, cond, info) {
  if (cond) pass++;
  else { fail++; console.log('FAIL:', name, info !== undefined ? JSON.stringify(info) : ''); }
}

// ---- intent cases ----
const intents = [
  // Hinglish
  ['kal shaam paanch baje appointment chahiye', 'book'],
  ['mujhe parso subah 10:30 ka appointment book karna hai', 'book'],
  ['doctor se milna hai kal 4 baje', 'book'],
  ['mera time parso kar do', 'reschedule'],
  ['appointment badal do please', 'reschedule'],
  ['appointment cancel karna hai', 'cancel'],
  ['main kal nahi aa paunga', 'cancel'],
  ['clinic kab khulta hai', 'faq_timing'],
  ['fees kitni hai', 'faq_fees'],
  ['clinic kahan hai', 'faq_address'],
  ['ravivar ko khula hai kya', 'faq_closed'],
  ['sunday ko chhutti hai?', 'faq_closed'],
  ['haan', 'yes'],
  ['ji sahi hai', 'yes'],
  ['nahi', 'no'],
  ['namaste', 'greeting'],
  ['mausam kaisa hai aaj', 'unknown'],
  ['fees kam kar do', 'discount'],
  ['bukhar ki kaunsi dawai lun', 'medical'],
  // typos
  ['kal sham 5 bje apointment chaiye', 'book'],
  ['appoinment cancle kar do', 'cancel'],
  ['clinik kab khulega', 'faq_timing'],
  // Devanagari
  ['कल शाम पांच बजे अपॉइंटमेंट चाहिए', 'book'],
  ['फीस कितनी है', 'faq_fees'],
  ['क्लिनिक कब खुलता है', 'faq_timing'],
  ['हाँ जी', 'yes'],
  ['नहीं', 'no'],
  // Emergency (5+)
  ['seene mein dard ho raha hai', 'emergency'],
  ['papa ko saans nahi aa rahi', 'emergency'],
  ['accident ho gaya hai jaldi', 'emergency'],
  ['सीने में दर्द है', 'emergency'],
  ['mummy behosh ho gayi', 'emergency'],
  ['chest pain bahut zyada hai', 'emergency'],
  ['khoon beh raha hai ruk nahi raha', 'emergency'],
  // Tamil
  ['கிளினிக் எப்போது திறக்கும்?', 'faq_timing'],
  ['நாளை மாலை ஐந்து மணிக்கு அப்பாயிண்ட்மெண்ட் வேண்டும்', 'book'],
  ['நெஞ்சு வலி இருக்கு', 'emergency'],
  ['ஆம்', 'yes'],
  // Asli Prisma v3.0 transcripts (live Worker se)
  ["नमस्ते मैं अन्वानी डेस्क हूँ कल शाम पाँच बजे अपॉइंटमेंट चाहिए।", 'book'],
  // Udhaari (owner)
  ['Sharma ji ke do hazaar baaki', 'udhaari_add'],
  ['Sharma ji ne de diye', 'udhaari_paid'],
  ['शर्मा जी के दो हज़ार बाकी', 'udhaari_add'],
];
for (const [text, want] of intents) {
  const p = E.parse(text);
  check(`intent "${text}"`, p.intent === want, { got: p.intent, want, norm: p.norm });
}

// ---- slots ----
const p1 = E.parse('kal shaam paanch baje appointment chahiye');
check('slot day kal', p1.slots.day && p1.slots.day.offset === 1, p1.slots);
check('slot time 5 pm', p1.slots.time && p1.slots.time.h === 5 && p1.slots.time.period === 'pm', p1.slots);
check('5 baje -> 17:00 (clinic hours)', E.resolveMinutes({ h: 5, m: 0, period: null }, config.business) === 17 * 60);
check('10 baje -> 10:00', E.resolveMinutes({ h: 10, m: 0, period: null }, config.business) === 600);
const p2 = E.parse('subah 10:30');
check('subah 10:30', p2.slots.time && p2.slots.time.h === 10 && p2.slots.time.m === 30 && p2.slots.time.period === 'am', p2.slots);
const p3 = E.parse('sadhe paanch baje');
check('sadhe paanch = 5:30', p3.slots.time && p3.slots.time.h === 5 && p3.slots.time.m === 30, p3.norm);
const p4 = E.parse('shaam 6');
check('shaam 6', p4.slots.time && p4.slots.time.h === 6 && p4.slots.time.period === 'pm', p4.slots);
check('guruvar weekday', (E.parse('guruvar ko appointment').slots.day || {}).weekday === 4);
check('kar do is not 2', !/\b2\b/.test(E.normalize('time parso kar do')), E.normalize('time parso kar do'));

// ---- amounts (Task 5) ----
const amounts = [['Sharma ji ke do hazaar baaki', 2000], ['Sharma ji ke 2k baaki', 2000], ['Sharma ji ke 2000 baaki', 2000],
  ['Sharma ji ke dhai hazaar baaki', 2500], ['Gupta ji ke paanch sau baaki', 500], ['Verma ke 2,500 baaki', 2500], ['Ravi ke five hundred baaki', 500]];
for (const [t, want] of amounts) {
  const p = E.parse(t);
  check(`amount "${t}"`, p.slots.amount === want, { got: p.slots.amount, norm: p.norm });
}
check('ledger name', E.parse('Sharma ji ke do hazaar baaki').slots.name === 'Sharma Ji', E.parse('Sharma ji ke do hazaar baaki').slots.name);

// ---- flows ----
function run(lines, store, mode) {
  let state = { mode: mode || 'caller' };
  store = store || { bookings: [], ledger: [] };
  const out = [];
  for (const line of lines) {
    const r = E.step(state, E.parse(line), config, store, { now: NOW });
    state = r.state;
    for (const a of r.actions) {
      if (a.type === 'booking_add') store.bookings.push(Object.assign({ id: 'b' + (store.bookings.length + 1), createdAt: Date.now() }, a.booking));
      if (a.type === 'booking_move') Object.assign(store.bookings.find((b) => b.id === a.id), { date: a.date, time: a.time });
      if (a.type === 'booking_cancel') store.bookings.find((b) => b.id === a.id).status = 'cancelled';
      if (a.type === 'ledger_add') store.ledger.push({ name: a.name, amount: a.amount });
      if (a.type === 'ledger_paid') store.ledger.push({ name: a.name, amount: -a.amount });
    }
    out.push(r);
  }
  return { out, state, store };
}

// Done criterion: book -> confirm-back -> haan -> saved
let f = run(['Kal shaam 5 baje appointment', 'haan']);
check('intro first line', f.out[0].reply.text.startsWith('Namaste, main VaaniDesk hoon, Dr. Meena Clinic ka AI assistant.'), f.out[0].reply.text);
check('confirm-back text', /Kal shaam 5 baje, Dr\. Meena ke saath\. Sahi hai\?/.test(f.out[0].reply.text), f.out[0].reply.text);
check('confirm-back speak words', /kal shaam paanch baje/i.test(f.out[0].reply.speak), f.out[0].reply.speak);
check('awaiting_confirm', f.out[0].state.stage === 'awaiting_confirm');
check('booking saved', f.store.bookings.length === 1 && f.store.bookings[0].date === '2026-11-17' && f.store.bookings[0].time === '17:00', f.store.bookings);
check('booked reply', /pakki/.test(f.out[1].reply.text) && f.state.stage === 'done', f.out[1].reply.text);

// Slot taken -> next free offered
f = run(['kal shaam 5 baje appointment', 'haan']);
const g = run(['kal shaam 5 baje appointment chahiye'], f.store);
check('taken -> offer 5:15', /bhar chuka/.test(g.out[0].reply.text) && g.state.pending.time === '17:15', g.out[0].reply.text);

// No -> ask again -> new slot
f = run(['kal 4 baje appointment', 'nahi', 'parso subah 11 baje', 'haan']);
check('no -> declined', /Kaunsa din/.test(f.out[1].reply.text), f.out[1].reply.text);
check('new slot saved', f.store.bookings.length === 1 && f.store.bookings[0].date === '2026-11-18' && f.store.bookings[0].time === '11:00', f.store.bookings);

// Reschedule
f = run(['kal shaam 5 baje appointment', 'haan']);
const r = run(['mera time parso kar do', 'haan'], f.store);
check('reschedule moved to parso 17:00', f.store.bookings[0].date === '2026-11-18' && f.store.bookings[0].time === '17:00', f.store.bookings);
check('reschedule confirm text', /wali appointment/.test(r.out[0].reply.text), r.out[0].reply.text);

// Cancel
f = run(['kal shaam 5 baje appointment', 'haan']);
run(['appointment cancel karna hai', 'haan'], f.store);
check('cancelled', f.store.bookings[0].status === 'cancelled');

// Closed day
f = run(['ravivar ko 11 baje appointment']);
check('sunday closed -> offer monday', /band rehta/.test(f.out[0].reply.text) && f.state.pending.date === '2026-11-23', f.out[0].reply.text);

// Emergency
f = run(['seene mein dard ho raha hai']);
check('emergency 108', /108 ya 112/.test(f.out[0].reply.text) && f.out[0].actions.some((a) => a.type === 'alert_add'));

// Unknown -> callback
f = run(['mausam kaisa hai']);
check('unknown callback', /owner ko message/.test(f.out[0].reply.text) && f.out[0].actions.some((a) => a.type === 'callback_add'));

// FAQ
f = run(['fees kitni hai']);
check('fees reply', /500 rupaye/.test(f.out[0].reply.text) && /paanch sau rupaye/.test(f.out[0].reply.speak), f.out[0].reply);

// Tamil timing -> Tamil reply
f = run(['கிளினிக் எப்போது திறக்கும்?']);
check('tamil reply', f.out[0].reply.lang === 'ta' && /திறந்திருக்கும்/.test(f.out[0].reply.text), f.out[0].reply);

// Udhaari flow
f = run(['Sharma ji ke do hazaar baaki', 'Sharma ji ke 500 baaki', 'Sharma ji ne 1000 de diye'], null, 'owner');
const due = f.store.ledger.reduce((a, e) => a + e.amount, 0);
check('ledger total 1500', due === 1500, f.store.ledger);
check('ledger reply', /kul baaki 2,500/.test(f.out[1].reply.text), f.out[1].reply.text);

// Reminder
const rem = E.reminder('Sharma Ji', 2500, 'soft', config);
check('reminder text', /2,500 rupaye/.test(rem.text) && /AI/.test(rem.text) && /STOP/.test(rem.text), rem.text);
check('reminder speak words', /do hazaar paanch sau rupaye/.test(rem.speak) && rem.speak.length <= 400, rem.speak);

// Shop mode (default app)
{
  let st = { mode: 'owner' }; const store = { bookings: [], ledger: [{ name: 'Sharma Ji', amount: 2000 }] };
  const q = E.step(st, E.parse('Sharma ji ka hisaab batao'), shopConfig, store, { now: NOW });
  check('shop query intent+reply', /2,000 rupaye/.test(q.reply.text), q.reply.text);
  const c1 = E.step({ mode: 'caller' }, E.parse('kal 5 baje home delivery chahiye'), shopConfig, store, { now: NOW });
  check('shop order -> callback', /Ramesh ji ko message/.test(c1.reply.text) && c1.actions.some((a) => a.type === 'callback_add'), c1.reply.text);
  const c2 = E.step({ mode: 'caller' }, E.parse('dukaan kab khulti hai'), shopConfig, store, { now: NOW });
  check('shop timing', /subah 8 baje se raat 9 baje/.test(c2.reply.text) && /Ramesh Kirana Store/.test(c2.reply.text), c2.reply.text);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
