// VaaniDesk intent engine. Pure functions, no DOM, no LLM.
// normalize(text) -> string, parse(text) -> {intent, slots, lang}, step(state, parsed, config, store, ctx) -> {state, reply, actions}
(function (root) {
  'use strict';

  // ---------- Hindi number words ----------
  const HI = ('shunya ek do teen chaar paanch chhah saat aath nau das gyaarah baarah terah chaudah pandrah solah satrah athaarah unnees ' +
    'bees ikkees baaees teyees chaubees pachchees chhabbees sattaees atthaaees untees tees ikattees battees taintees chauntees paintees ' +
    'chhattees saintees adtees untaalees chaalees iktaalees bayaalees taintaalees chavaalees paintaalees chhiyaalees saintaalees adtaalees ' +
    'unchaas pachaas ikyaavan baavan tirpan chauvan pachpan chhappan sattaavan atthaavan unsath saath iksath baasath tirsath chaunsath ' +
    'painsath chhiyaasath sadsath adsath unhattar sattar ikhattar bahattar tihattar chauhattar pachhattar chhihattar sathattar athhattar ' +
    'unaasi assi ikyaasi bayaasi tiraasi chauraasi pachaasi chhiyaasi sataasi athaasi navaasi nabbe ikyaanave baanave tiraanave ' +
    'chauraanave pachaanave chhiyaanave sattaanave atthaanave ninyaanave').split(' ');

  const NUM = {};
  HI.forEach((w, i) => { if (i > 0 && w !== 'saath' && w !== 'do') NUM[w] = i; });
  Object.assign(NUM, {
    panch: 5, paach: 5, char: 4, chhe: 6, chah: 6, chheh: 6, tin: 3, aat: 8, ath: 8, dus: 10,
    gyarah: 11, gyara: 11, gyaara: 11, barah: 12, baara: 12, bis: 20, pachas: 50, pachis: 25, pachees: 25,
    one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    fifteen: 15, twenty: 20, thirty: 30, forty: 40, fifty: 50,
  });
  const MULT = { sau: 100, hundred: 100, hazaar: 1000, hazar: 1000, hajar: 1000, hajaar: 1000, hazzar: 1000, thousand: 1000, lakh: 100000, lac: 100000, lakhs: 100000 };
  const FRAC = { dhai: 2.5, dhaai: 2.5, dhaee: 2.5, adhai: 2.5, dedh: 1.5, derh: 1.5, dedhh: 1.5 };
  const MOD = { sadhe: 0.5, saadhe: 0.5, sade: 0.5, saade: 0.5, sawa: 0.25, sava: 0.25, savaa: 0.25, sawaa: 0.25, paune: -0.25, pone: -0.25 };

  function hiNum(n) {
    n = Math.round(n);
    if (n < 100) return HI[n];
    const parts = [];
    if (n >= 100000) { parts.push(hiNum(Math.floor(n / 100000)) + ' lakh'); n %= 100000; }
    if (n >= 1000) { parts.push(hiNum(Math.floor(n / 1000)) + ' hazaar'); n %= 1000; }
    if (n >= 100) { parts.push(HI[Math.floor(n / 100)] + ' sau'); n %= 100; }
    if (n > 0) parts.push(HI[n]);
    return parts.join(' ');
  }

  // ---------- Devanagari -> Roman ----------
  const DV_CONS = {
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh',
    'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l', '\u0958': 'k', '\u0959': 'kh', '\u095A': 'g', '\u095B': 'z',
    '\u095C': 'r', '\u095D': 'rh', '\u095E': 'f', '\u095F': 'y',
  };
  const DV_VOW = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऋ': 'ri', 'ऑ': 'o', 'ऍ': 'e' };
  const DV_MATRA = { 'ा': 'aa', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ृ': 'ri', 'ॉ': 'o', 'ॅ': 'e' };

  function translit(s) {
    let out = '';
    let pending = false; // consonant ka inherent 'a' abhi likhna baaki
    for (const ch of s) {
      if (DV_CONS[ch]) { if (pending) out += 'a'; out += DV_CONS[ch]; pending = true; }
      else if (DV_MATRA[ch]) { out += DV_MATRA[ch]; pending = false; }
      else if (ch === '्') pending = false;
      else if (ch === '़') { if (pending) out = out.replace(/(ph|dh|j|d)$/, (m) => ({ ph: 'f', dh: 'rh', j: 'z', d: 'r' })[m]); }
      else if (ch === 'ं' || ch === 'ँ') { if (pending) out += 'a'; out += 'n'; pending = false; }
      else if (ch === 'ः') { if (pending) out += 'a'; out += 'h'; pending = false; }
      else if (DV_VOW[ch]) { if (pending) out += 'a'; out += DV_VOW[ch]; pending = false; }
      else if (ch >= '०' && ch <= '९') { pending = false; out += String(ch.charCodeAt(0) - 0x0966); }
      else if (ch === '।' || ch === '॥') { pending = false; out += ' '; }
      else { pending = false; out += ch; } // word khatam: aakhri schwa drop
    }
    return out;
  }

  // ---------- Tamil keywords -> Roman tokens ----------
  const TA_MAP = [
    ['பன்னிரண்டு', ' 12 '], ['பதினொன்று', ' 11 '], ['ஒன்பது', ' 9 '], ['பத்து', ' 10 '], ['ஒன்று', ' 1 '], ['இரண்டு', ' 2 '],
    ['மூன்று', ' 3 '], ['நான்கு', ' 4 '], ['ஐந்து', ' 5 '], ['ஆறு', ' 6 '], ['ஏழு', ' 7 '], ['எட்டு', ' 8 '],
    ['மணி', ' baje '], ['மாலை', ' shaam '], ['காலை', ' subah '], ['இரவு', ' raat '], ['மதியம்', ' dopahar '],
    ['நாளை மறுநாள்', ' parso '], ['நாளை', ' kal '], ['இன்று', ' aaj '],
    ['அப்பாய', ' appointment '], ['முன்பதிவு', ' appointment '], ['ரத்து', ' cancel '], ['மாற்ற', ' badal '],
    ['திறக்கும்', ' khulta '], ['திறந்திருக்கும்', ' khulta '], ['எப்போது', ' kab '], ['நேரம்', ' timing '],
    ['கட்டணம்', ' fees '], ['முகவரி', ' address '], ['எங்கே', ' kahan '],
    ['நெஞ்ச', ' seene '], ['வலி', ' dard '], ['மூச்சு', ' saans nahi '], ['விபத்து', ' accident '], ['மயக்கம்', ' behosh '], ['ரத்தம்', ' khoon beh '],
    ['ஆமா', ' haan '], ['ஆம்', ' haan '], ['சரி', ' haan '], ['இல்லை', ' nahi '], ['வேண்டாம்', ' nahi '], ['வணக்கம்', ' namaste '],
  ].sort((a, b) => b[0].length - a[0].length);

  const isTamil = (s) => /[\u0B80-\u0BFF]/.test(s);

  // ---------- normalize ----------
  function mergeNumbers(tokens) {
    const out = [];
    let i = 0;
    const isNumTok = (t, next, prev) =>
      /^\d+(\.\d+)?$/.test(t) || NUM[t] != null || MULT[t] != null || FRAC[t] != null ||
      (t === 'do' && (MULT[next] != null || /^(baje|bje|baj)$/.test(next || '') || MOD[prev] != null));
    while (i < tokens.length) {
      const t = tokens[i];
      const startsRun = (MOD[t] != null && tokens[i + 1] && isNumTok(tokens[i + 1], tokens[i + 2], t)) || isNumTok(t, tokens[i + 1], tokens[i - 1]);
      if (!startsRun) { out.push(t); i++; continue; }
      let total = 0, cur = null, mod = 0, any = false;
      while (i < tokens.length) {
        const w = tokens[i];
        if (MOD[w] != null && tokens[i + 1] && isNumTok(tokens[i + 1], tokens[i + 2], w)) { mod = MOD[w]; i++; continue; }
        if (!isNumTok(w, tokens[i + 1], tokens[i - 1])) break;
        if (MULT[w] != null) {
          cur = (cur == null ? 1 : cur) * MULT[w];
          if (MULT[w] >= 1000) { total += cur; cur = null; }
        } else {
          const v = /^\d/.test(w) ? parseFloat(w) : w === 'do' ? 2 : NUM[w] != null ? NUM[w] : FRAC[w];
          if (cur != null && cur < 100 && v < 100 && cur > 0 && any && MULT[tokens[i - 1]] == null) break; // "5 10" = do alag number
          cur = (cur || 0) + v + mod;
          mod = 0;
        }
        any = true;
        i++;
      }
      const val = total + (cur || 0);
      if (val % 1 !== 0 && val < 13) {
        const h = Math.floor(val), m = Math.round((val - h) * 60);
        out.push(h + ':' + String(m).padStart(2, '0'));
      } else out.push(String(Math.round(val)));
    }
    return out;
  }

  function normalize(text) {
    let s = String(text || '').toLowerCase();
    if (isTamil(s)) for (const [ta, ro] of TA_MAP) s = s.split(ta).join(ro);
    s = translit(s);
    s = s.replace(/aa\b/g, 'a');
    s = s.replace(/₹|\brs\.?|\binr\b|\brupaye\b|\brupees?\b|\brupay\b|\brupaiye\b/g, ' ');
    s = s.replace(/(\d),(?=\d{2,3}\b)/g, '$1');
    s = s.replace(/(\d+(?:\.\d+)?)\s?k\b/g, (_, n) => String(Math.round(parseFloat(n) * 1000)));
    s = s.replace(/(\d)([a-z])/g, '$1 $2').replace(/([a-z])(\d)/g, '$1 $2');
    s = s.replace(/(\d)\.(\d)/g, '$1\u0001$2').replace(/(\d):(\d)/g, '$1\u0002$2');
    s = s.replace(/[^a-z0-9\u0001\u0002\u0B80-\u0BFF']+/g, ' ').replace(/'/g, '');
    s = s.replace(/\u0001/g, '.').replace(/\u0002/g, ':');
    const tokens = s.split(/\s+/).filter(Boolean);
    return mergeNumbers(tokens).join(' ');
  }

  // ---------- fuzzy token match ----------
  function skel(w) {
    return w.replace(/ph/g, 'f').replace(/w/g, 'v').replace(/z/g, 'j').replace(/q/g, 'k').replace(/c(?!h)/g, 'k')
      .replace(/[aeiouy]/g, '').replace(/(.)\1+/g, '$1');
  }
  function tokMatch(tok, sk, w) {
    if (w.endsWith('*')) {
      const p = w.slice(0, -1);
      if (tok.startsWith(p)) return true;
      const ps = skel(p);
      return ps.length >= 3 && sk.startsWith(ps);
    }
    if (tok === w) return true;
    const ws = skel(w);
    return ws.length >= 3 && sk === ws;
  }

  function makeMatcher(norm) {
    const toks = norm.split(' ').filter(Boolean);
    const sks = toks.map(skel);
    const idx = (words) => {
      const r = [];
      toks.forEach((t, i) => { if (words.some((w) => tokMatch(t, sks[i], w))) r.push(i); });
      return r;
    };
    return {
      toks,
      has: (...words) => idx(words).length > 0,
      idx,
      near: (a, b, win = 3) => {
        const ia = idx(a), ib = idx(b);
        return ia.some((x) => ib.some((y) => y !== x && Math.abs(y - x) <= win));
      },
    };
  }

  // ---------- word lists ----------
  const W = {
    chest: ['seene', 'seena', 'sine', 'sina', 'seeney', 'chhati', 'chhaati', 'chati', 'chest', 'dil', 'heart'],
    pain: ['dard', 'darad', 'pain', 'dukh', 'dabaav', 'dabav', 'jakdan'],
    breath: ['saans', 'sans', 'saas', 'swas', 'shwas', 'svas', 'breath', 'breathing', 'saans'],
    breathBad: ['nahi', 'nahin', 'nhi', 'na', 'ruk*', 'phool*', 'problem', 'dikkat', 'taklif', 'takaliph', 'taklef', 'mushkil', 'lene', 'lena', 'nai'],
    emergSingle: ['accident', 'ekcident', 'eksident', 'aksident', 'haadsa', 'hadsa', 'behosh', 'behoshi', 'unconscious', 'faint',
      'bleeding', 'emergency', 'imergency', 'emergancy', 'poison', 'zeher', 'zahar', 'jahar', 'stroke', 'lakwa', 'paralysis', 'heartattack'],
    blood: ['khoon', 'khun', 'blood'],
    bloodBad: ['beh*', 'bah*', 'nikal*', 'ruk*', 'bahut'],
    attack: ['attack', 'atak', 'daura', 'dora'],
    medical: ['dawai', 'davai', 'davaai', 'dawa', 'dava', 'medicine', 'tablet', 'goli', 'ilaaj', 'ilaj', 'treatment', 'prescription'],
    discount: ['discount', 'diskaunt', 'concession', 'sasta', 'free'],
    discountKam: ['kam'],
    cancel: ['cancel*', 'cancle', 'cancil', 'kainsil', 'kensil', 'kansal', 'radd', 'rad', 'hata*'],
    notCome: ['a', 'aa', 'aaunga', 'aaungi', 'aaoonga', 'aa*'],
    resched: ['reschedule', 'reshedule', 'badal*', 'badl*', 'change', 'chenj', 'shift', 'postpone', 'prepone', 'move', 'khiska*', 'aage', 'aagey'],
    mine: ['mera', 'meri', 'mere', 'apna', 'apni', 'my'],
    timeWord: ['time', 'taim', 'taaim', 'timing', 'samay', 'appointment', 'booking'],
    book: ['appointment', 'apointment', 'appoinment', 'appointmnt', 'apoint*', 'appoint*', 'booking', 'book', 'buk', 'slot',
      'milna', 'milne', 'dikhana', 'dikhane', 'dikhaana', 'consult*', 'checkup', 'visit'],
    want: ['chahiye', 'chaahiye', 'chaiye', 'milega', 'milegi', 'dena', 'de', 'lena', 'mil', 'karna', 'karwana', 'karvana'],
    timeOnly: ['time', 'taim', 'taaim'],
    closedW: ['chhutti', 'chutti', 'chhuti', 'holiday', 'closed', 'off'],
    open: ['khul*', 'open*', 'timing*', 'taiming*', 'hours'],
    band: ['band'],
    kab: ['kab', 'kitne', 'kitna', 'when', 'tak'],
    fees: ['fees', 'fee', 'fis', 'phis', 'phees', 'fess', 'charge*', 'price', 'rate', 'shulk'],
    kitna: ['kitna', 'kitne', 'kitni', 'how'],
    paisa: ['paisa', 'paise', 'paisaa', 'kharcha', 'cost'],
    address: ['address', 'adress', 'addres', 'edres', 'kahan', 'kahaan', 'kaha', 'kidhar', 'location', 'lokeshan', 'rasta', 'raasta', 'located', 'map', 'landmark'],
    pata: ['pata'],
    notW: ['nahi', 'nahin', 'nhi', 'nai'],
    greet: ['namaste', 'namaskar', 'namskar', 'hello', 'helo', 'hi', 'hlo', 'hey', 'vanakkam', 'pranam', 'suniye'],
    yes: ['haan', 'han', 'haa', 'ha', 'ji', 'jee', 'jii', 'yes', 'yeah', 'yep', 'sahi', 'theek', 'thik', 'thek', 'ok', 'okay', 'okey', 'okk',
      'bilkul', 'confirm', 'done', 'chalega', 'hanji', 'haanji', 'sure'],
    no: ['nahi', 'nahin', 'nhi', 'nai', 'na', 'naa', 'no', 'nope', 'mat', 'galat', 'nako', 'wrong'],
    dues: ['baaki', 'baki', 'baqi', 'bakaya', 'udhaar', 'udhar', 'udhaari', 'udhari', 'dena', 'dene', 'likh*', 'khata', 'khaata', 'due'],
    paid: ['chuka*', 'wapas', 'vapas', 'lauta*', 'paid', 'jama', 'clear'],
    gave: ['de', 'diye', 'diya', 'di'],
    gave2: ['diye', 'diya', 'di', 'gaye', 'gaya', 'gayi', 'diye'],
  };

  const DAY = {
    today: ['aaj', 'aj', 'today', 'abhi'],
    tomorrow: ['kal', 'kl', 'kall', 'tomorrow', 'tmrw', 'tomorow'],
    dayAfter: ['parso', 'parson', 'parsoon', 'parsun', 'parason', 'parsho', 'parsoo', 'parsom'],
  };
  const WEEKDAYS = [
    ['ravivar', 'itvaar', 'etvaar', 'sunday'],
    ['somvar', 'monday'],
    ['mangalvar', 'mangal', 'tuesday'],
    ['budhvar', 'budh', 'wednesday'],
    ['guruvar', 'brihaspativar', 'veervar', 'thursday'],
    ['shukravar', 'shukra', 'friday'],
    ['shanivar', 'shani', 'saturday'],
  ];
  const PM = /\b(shaam|sham|evening|raat|night|dopahar|dopehar|dupahar|afternoon|pm)\b/;
  const AM = /\b(subah|subha|savere|sawere|morning|am)\b/;
  const PERIOD_WORDS = 'subah|subha|savere|sawere|morning|shaam|sham|evening|raat|night|dopahar|dopehar|dupahar|afternoon';

  function parseDay(m) {
    if (m.has(...DAY.dayAfter) || /day after tomorrow/.test(m.toks.join(' '))) return { offset: 2 };
    if (m.has(...DAY.tomorrow)) return { offset: 1 };
    if (m.has(...DAY.today)) return { offset: 0 };
    for (let d = 0; d < 7; d++) if (m.has(...WEEKDAYS[d])) return { weekday: d };
    return null;
  }

  function parseTime(norm) {
    let h = null, mi = 0, match = null, mm;
    if ((mm = norm.match(/\b(\d{1,2})[:.](\d{2})\b(?:\s*(am|pm))?/))) { h = +mm[1]; mi = +mm[2]; match = mm[0]; }
    else if ((mm = norm.match(/\b(\d{1,2})\s*(am|pm|baje|bje|baj|bajey|oclock)\b/))) { h = +mm[1]; match = mm[0]; }
    else if ((mm = norm.match(new RegExp('\\b(' + PERIOD_WORDS + ')\\s+(\\d{1,2})\\b')))) { h = +mm[2]; match = mm[0]; }
    if (h == null || h > 23 || mi > 59) return { time: null, match: null };
    const period = PM.test(norm) ? 'pm' : AM.test(norm) ? 'am' : null;
    return { time: { h, m: mi, period }, match };
  }

  function parseName(norm) {
    const mm = norm.match(/\b(?:mera|meri|my)\s+(?:naam|name)\s+(?:is\s+|hai\s+)?([a-z]{2,})/) || norm.match(/\b([a-z]{2,})\s+(?:naam|name)\s+hai\b/);
    if (!mm || /^(hai|is|kya|mera|aapka)$/.test(mm[1])) return null;
    return cap(mm[1]);
  }

  const cap = (s) => s.replace(/\b[a-z]/g, (c) => c.toUpperCase());

  function parseLedgerName(toks) {
    const markers = ['ke', 'ka', 'ki', 'ne', 'se', 'ko', 'par', 'pe'];
    const filler = ['aur', 'haan', 'ok', 'likho', 'likh', 'lo', 'bhai', 'please', 'ab'];
    const end = toks.findIndex((t) => markers.includes(t));
    if (end <= 0) return null;
    const words = toks.slice(0, end).filter((t) => !filler.includes(t) && !/^\d/.test(t));
    if (!words.length || words.length > 3) return null;
    return cap(words.join(' '));
  }

  function parseAmount(norm, timeMatch) {
    const s = timeMatch ? norm.replace(timeMatch, ' ') : norm;
    const nums = (s.match(/\b\d+(?:\.\d+)?\b/g) || []).map(Number).filter((n) => n > 0);
    return nums.length ? Math.max(...nums) : null;
  }

  // ---------- parse ----------
  function parse(text) {
    const raw = String(text || '');
    const lang = isTamil(raw) ? 'ta' : 'hi';
    const norm = normalize(raw);
    const m = makeMatcher(norm);
    const { time, match } = parseTime(norm);
    const day = parseDay(m);
    const slots = { day, time, name: parseName(norm), amount: parseAmount(norm, match) };
    const hasSlot = !!(day || time);
    let intent = 'unknown';

    const emergency =
      m.has(...W.emergSingle) ||
      m.near(W.chest, W.pain) ||
      m.near(W.breath, W.breathBad) ||
      m.near(W.blood, W.bloodBad) ||
      m.near(['heart', 'dil'], W.attack);

    const ledgerName = parseLedgerName(m.toks);
    const paid = m.has(...W.paid) || m.near(W.gave, W.gave2, 1) || /\bde (diye|diya|di|gaye|gaya)\b/.test(norm);

    const isCancel = m.has(...W.cancel) || (m.has(...W.notW) && m.near(W.notW, W.notCome, 1) && m.has('a', 'aa', 'aaunga', 'aaungi', 'paunga', 'paungi', 'sakta', 'sakti'));
    const isResched = m.has(...W.resched) || (m.has(...W.mine) && m.has(...W.timeWord) && hasSlot && m.has('kar', 'karo', 'kardo', 'karna'));
    const isBook = m.has(...W.book) || (m.has(...W.timeOnly) && m.has(...W.want));
    let faq = null;
    if (m.has(...W.closedW) || (day && day.weekday != null && (m.has(...W.open) || m.has(...W.band))) || (m.has(...W.band) && m.has('din', 'rehta', 'rahta', 'day'))) faq = 'faq_closed';
    else if (m.has(...W.fees) || (m.has(...W.kitna) && m.has(...W.paisa))) faq = 'faq_fees';
    else if (m.has(...W.address) || (m.has(...W.pata) && !m.has(...W.notW))) faq = 'faq_address';
    else if (m.has(...W.open) || (m.has(...W.kab) && m.has(...W.band))) faq = 'faq_timing';
    const isDiscount = m.has(...W.discount) || (m.has(...W.fees) && m.has(...W.discountKam));

    if (emergency) intent = 'emergency';
    else if (m.has(...W.medical)) intent = 'medical';
    else if (ledgerName && paid) intent = 'udhaari_paid';
    else if (ledgerName && slots.amount && m.has(...W.dues)) intent = 'udhaari_add';
    else if (isCancel) intent = 'cancel';
    else if (isResched) intent = 'reschedule';
    else if (m.has('order', 'ordar', 'aurdar', 'delivery', 'delivary', 'deliver*', 'saamaan', 'saman', 'samaan', 'mangwa*', 'mangva*')) intent = 'order';
    else if (isBook && hasSlot) intent = 'book';
    else if (isDiscount) intent = 'discount';
    else if (faq) intent = faq;
    else if (isBook) intent = 'book';
    else if (ledgerName && m.has('hisaab', 'hisab', 'kitna', 'kitne', 'baaki', 'baki', 'balance', 'khata', 'khaata')) intent = 'udhaari_query';
    else if (m.has(...W.no)) intent = 'no';
    else if (m.has(...W.yes)) intent = 'yes';
    else if (m.has(...W.greet)) intent = 'greeting';

    if (intent === 'udhaari_add' || intent === 'udhaari_paid' || intent === 'udhaari_query') slots.name = ledgerName;
    return { intent, slots, lang, text: raw, norm };
  }

  // ---------- time / date helpers ----------
  const toMin = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
  const fmtMin = (t) => String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  const dateKey = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const keyToDate = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const dayDiff = (k, now) => Math.round((keyToDate(k) - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);

  function resolveDate(day, now) {
    if (!day) return null;
    if (day.offset != null) return dateKey(addDays(now, day.offset));
    let diff = (day.weekday - now.getDay() + 7) % 7;
    if (diff === 0) diff = 7;
    return dateKey(addDays(now, diff));
  }

  function resolveMinutes(time, biz) {
    if (!time) return null;
    let h = time.h;
    if (time.period === 'pm' && h < 12) h += 12;
    else if (time.period === 'am' && h === 12) h = 0;
    else if (!time.period && h < 12) {
      const t = h * 60 + time.m;
      if (t < toMin(biz.open) && t + 720 < toMin(biz.close)) h += 12;
    }
    return h * 60 + time.m;
  }

  const HI_DAYS = ['Ravivaar', 'Somvaar', 'Mangalvaar', 'Budhvaar', 'Guruvaar', 'Shukravaar', 'Shanivaar'];
  const TA_DAYS = ['ஞாயிறு', 'திங்கள்', 'செவ்வாய்', 'புதன்', 'வியாழன்', 'வெள்ளி', 'சனி'];
  const TA_NUM = ['', 'ஒன்று', 'இரண்டு', 'மூன்று', 'நான்கு', 'ஐந்து', 'ஆறு', 'ஏழு', 'எட்டு', 'ஒன்பது', 'பத்து', 'பதினொன்று', 'பன்னிரண்டு'];

  function clock(t, lang) {
    const H = Math.floor(t / 60), M = t % 60;
    const h12 = H % 12 === 0 ? 12 : H % 12;
    if (lang === 'ta') {
      const p = H < 12 ? 'காலை' : H < 16 ? 'மதியம்' : H < 20 ? 'மாலை' : 'இரவு';
      const disp = M ? `${h12}:${String(M).padStart(2, '0')}` : `${h12}`;
      return { text: `${p} ${disp} மணி`, speak: `${p} ${TA_NUM[h12]} மணி${M ? ' ' + M + ' நிமிடம்' : ''}` };
    }
    const p = H < 12 ? 'subah' : H < 16 ? 'dopahar' : H < 20 ? 'shaam' : 'raat';
    const disp = M ? `${h12}:${String(M).padStart(2, '0')}` : `${h12}`;
    let sp;
    if (M === 0) sp = `${HI[h12]} baje`;
    else if (M === 30) sp = h12 === 1 ? 'dedh baje' : h12 === 2 ? 'dhaai baje' : `saadhe ${HI[h12]} baje`;
    else if (M === 15) sp = `savaa ${HI[h12]} baje`;
    else if (M === 45) sp = `paune ${HI[h12 % 12 + 1]} baje`;
    else sp = `${HI[h12]} baj kar ${HI[M]} minute`;
    return { text: `${p} ${disp} baje`, speak: `${p} ${sp}` };
  }

  function dayWord(key, now, lang) {
    const diff = dayDiff(key, now);
    const wd = keyToDate(key).getDay();
    if (lang === 'ta') return diff === 0 ? 'இன்று' : diff === 1 ? 'நாளை' : diff === 2 ? 'நாளை மறுநாள்' : TA_DAYS[wd];
    if (diff === 0) return 'aaj';
    if (diff === 1) return 'kal';
    if (diff === 2) return 'parso';
    const d = keyToDate(key);
    return { text: `${HI_DAYS[wd]} (${d.getDate()}/${d.getMonth() + 1})`, speak: HI_DAYS[wd] };
  }

  function when(key, t, now, lang) {
    const d = dayWord(key, now, lang);
    const c = clock(t, lang);
    const dt = typeof d === 'string' ? d : d.text, ds = typeof d === 'string' ? d : d.speak;
    return lang === 'ta'
      ? { text: `${dt} ${c.text}க்கு`, speak: `${ds} ${c.speak}க்கு` }
      : { text: `${dt} ${c.text}`, speak: `${ds} ${c.speak}` };
  }

  // ---------- templates ----------
  function render(tpl, vars) {
    const base = typeof tpl === 'string' ? { text: tpl, speak: tpl } : tpl;
    const fill = (s, k) => s.replace(/\{(\w+)\}/g, (_, key) => {
      const v = vars[key];
      if (v == null) return '';
      return typeof v === 'object' ? v[k] : String(v);
    });
    return { text: fill(base.text, 'text').trim(), speak: fill(base.speak, 'speak').trim() };
  }

  function bizVars(biz, lang) {
    const L = lang === 'ta' ? 'ta' : 'hi';
    return {
      business: { text: biz.name, speak: biz.nameSpeak || biz.name },
      doctor: { text: biz.doctor, speak: biz.doctorSpeak || biz.doctor },
      open: clock(toMin(biz.open), L),
      close: clock(toMin(biz.close), L),
      closedDay: L === 'ta' ? TA_DAYS[biz.closedDay] : HI_DAYS[biz.closedDay],
      fees: { text: String(biz.fees), speak: hiNum(biz.fees) },
      address: biz.address,
    };
  }

  const capFirst = (s) => s.replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());

  // ---------- slot logic ----------
  function activeBookings(store) { return ((store && store.bookings) || []).filter((b) => b.status === 'booked'); }

  function isTaken(store, date, t, exceptId) {
    const tm = fmtMin(t);
    return activeBookings(store).some((b) => b.date === date && b.time === tm && b.id !== exceptId);
  }

  function findNext(store, biz, date, fromMin, now, exceptId) {
    const open = toMin(biz.open), close = toMin(biz.close), slot = biz.slotMinutes;
    const today = dateKey(now), nowMin = now.getHours() * 60 + now.getMinutes();
    let d = keyToDate(date);
    for (let i = 0; i < 21; i++, d = addDays(d, 1)) {
      const key = dateKey(d);
      if (d.getDay() === biz.closedDay || key < today) { fromMin = open; continue; }
      let t = Math.max(fromMin, open);
      t = Math.ceil((t - open) / slot) * slot + open;
      for (; t + slot <= close; t += slot) {
        if (key === today && t <= nowMin) continue;
        if (!isTaken(store, key, t, exceptId)) return { date: key, t };
      }
      fromMin = open;
    }
    return null;
  }

  function latestBooking(store, now) {
    const today = dateKey(now);
    return activeBookings(store).filter((b) => b.date >= today).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0] || null;
  }

  // ---------- step ----------
  const DEFAULT_STATE = { stage: 'idle', mode: 'caller', greeted: false, pending: null, retries: 0, name: null };

  function step(state, parsed, config, store, ctx) {
    const now = (ctx && ctx.now) || new Date();
    const biz = config.business;
    const s = Object.assign({}, DEFAULT_STATE, state);
    const lang = parsed.lang === 'ta' ? 'ta' : 'hi';
    const T = config.templates;
    const tpl = (key) => (lang === 'ta' && T.ta[key]) || T.hi[key];
    const vars = bizVars(biz, lang);
    const parts = [];
    const actions = [];
    let replyLang = lang;
    const say = (key, extra) => {
      if (lang === 'ta' && !T.ta[key]) replyLang = 'hi';
      parts.push(render(tpl(key), Object.assign({}, vars, extra)));
    };
    const slots = parsed.slots || {};
    const intent = parsed.intent;
    if (slots.name) s.name = slots.name;

    if (!s.greeted && s.mode === 'caller') { say('intro'); s.greeted = true; }

    const finish = () => {
      const text = parts.map((p) => capFirst(p.text)).filter(Boolean).join(' ');
      const speak = parts.map((p) => capFirst(p.speak)).filter(Boolean).join(' ');
      return { state: s, reply: { text, speak, lang: replyLang }, actions };
    };
    const reset = () => { s.pending = null; s.retries = 0; };

    // ---- owner mode: udhaari ----
    if (s.mode === 'owner') {
      const ledger = (store && store.ledger) || [];
      const dueOf = (name) => ledger.filter((e) => e.name.toLowerCase() === name.toLowerCase()).reduce((a, e) => a + e.amount, 0);
      if (intent === 'udhaari_add') {
        const due = dueOf(slots.name) + slots.amount;
        actions.push({ type: 'ledger_add', name: slots.name, amount: slots.amount });
        say('ledgerAdded', { name: slots.name, amount: amt(slots.amount), due: amt(due) });
      } else if (intent === 'udhaari_paid') {
        const cur = dueOf(slots.name);
        const paid = slots.amount || cur;
        if (!paid) say('ledgerNoDue', { name: slots.name });
        else {
          actions.push({ type: 'ledger_paid', name: slots.name, amount: paid });
          say('ledgerPaid', { name: slots.name, amount: amt(paid), due: amt(Math.max(0, cur - paid)) });
        }
      } else if (intent === 'udhaari_query') {
        const cur = dueOf(slots.name);
        if (cur > 0) say('ledgerQuery', { name: slots.name, due: amt(cur) });
        else say('ledgerNoDue', { name: slots.name });
      } else if (slots.amount) say('ledgerNeedAmount');
      else say('ownerHelp');
      return finish();
    }

    // ---- caller mode ----
    if (intent === 'emergency') {
      reset(); s.stage = 'idle';
      actions.push({ type: 'alert_add', text: parsed.text });
      say('emergency');
      return finish();
    }
    if (intent === 'medical') { say('medical'); return finish(); }

    const hasSlot = !!(slots.day || slots.time);

    // Dukaan: booking nahi hoti; order/booking jaisi baat = owner ke liye callback
    if (intent === 'order' || (biz.bookings === false && (['book', 'reschedule', 'cancel'].includes(intent) || (intent === 'unknown' && hasSlot)))) {
      actions.push({ type: 'callback_add', text: parsed.text });
      say('orderCallback');
      s.pending = null; s.retries = 0; s.stage = 'idle';
      return finish();
    }

    const offerSlot = (type, booking) => {
      // booking: existing booking for reschedule
      let date = resolveDate(slots.day, now);
      let t = resolveMinutes(slots.time, biz);
      if (type === 'reschedule' && booking) {
        if (!date) date = booking.date;
        if (t == null) t = toMin(booking.time);
      }
      if (!date && t == null) {
        s.stage = 'awaiting_slot';
        s.pending = { type, bookingId: booking && booking.id };
        say(type === 'reschedule' ? 'askNewSlot' : 'askSlot');
        return;
      }
      const nowMin = now.getHours() * 60 + now.getMinutes();
      if (!date) date = dateKey(t != null && t > nowMin ? now : addDays(now, 1));
      const open = toMin(biz.open), close = toMin(biz.close);
      const exceptId = booking && booking.id;
      let reason = null, found;
      const d = keyToDate(date);
      if (d.getDay() === biz.closedDay) { reason = ['reasonClosed', { dayName: lang === 'ta' ? TA_DAYS[d.getDay()] : HI_DAYS[d.getDay()] }]; found = findNext(store, biz, dateKey(addDays(d, 1)), open, now, exceptId); }
      else if (t == null) { reason = ['reasonNone', {}]; found = findNext(store, biz, date, open, now, exceptId); }
      else if (t < open || t + biz.slotMinutes > close) { reason = ['reasonHours', {}]; found = findNext(store, biz, t < open ? date : dateKey(addDays(d, 1)), open, now, exceptId); }
      else if (date === dateKey(now) && t <= nowMin) { reason = ['reasonPast', {}]; found = findNext(store, biz, date, nowMin + 1, now, exceptId); }
      else if (isTaken(store, date, Math.ceil((t - open) / biz.slotMinutes) * biz.slotMinutes + open, exceptId)) {
        reason = ['reasonTaken', { reqWhen: when(date, t, now, lang) }];
        found = findNext(store, biz, date, t + biz.slotMinutes, now, exceptId);
      } else found = { date, t: Math.ceil((t - open) / biz.slotMinutes) * biz.slotMinutes + open };

      if (!found) { s.stage = 'idle'; reset(); say('unknown'); actions.push({ type: 'callback_add', text: parsed.text }); return; }
      const w = when(found.date, found.t, now, lang);
      s.stage = 'awaiting_confirm';
      s.retries = 0;
      s.pending = { type, date: found.date, time: fmtMin(found.t), bookingId: booking && booking.id };
      if (type === 'reschedule' && booking && !reason) {
        say('rescheduleConfirm', { oldWhen: when(booking.date, toMin(booking.time), now, lang), when: w });
      } else if (reason) {
        const r = render(T.hi[reason[0]] || '', Object.assign({}, vars, reason[1]));
        if (lang === 'ta') replyLang = 'hi';
        parts.push(render(T.hi.offer, Object.assign({}, bizVars(biz, 'hi'), { reason: r, when: when(found.date, found.t, now, 'hi') })));
      } else say('confirm', { when: w });
      s.pending.question = parts[parts.length - 1];
    };

    const commit = () => {
      const p = s.pending;
      const w = p.date ? when(p.date, toMin(p.time), now, lang) : null;
      if (p.type === 'book') {
        actions.push({ type: 'booking_add', booking: { date: p.date, time: p.time, name: s.name || 'Caller', status: 'booked' } });
        say('booked', { when: w });
      } else if (p.type === 'reschedule') {
        actions.push({ type: 'booking_move', id: p.bookingId, date: p.date, time: p.time });
        say('rescheduled', { when: w });
      } else if (p.type === 'cancel') {
        actions.push({ type: 'booking_cancel', id: p.bookingId });
        say('cancelled');
      }
      reset(); s.stage = 'done';
    };

    const callback = (key) => {
      actions.push({ type: 'callback_add', text: parsed.text });
      say(key || 'unknown');
      reset(); s.stage = 'idle';
    };

    const pendingBooking = () => s.pending && s.pending.bookingId ? activeBookings(store).find((b) => b.id === s.pending.bookingId) : null;

    if (s.stage === 'awaiting_confirm' && s.pending) {
      const p = s.pending;
      if (hasSlot && p.type !== 'cancel' && ['book', 'reschedule', 'unknown', 'yes', 'no'].includes(intent)) {
        const date = resolveDate(slots.day, now) || p.date;
        const t = slots.time ? resolveMinutes(slots.time, biz) : toMin(p.time);
        if (date === p.date && fmtMin(t) === p.time) { commit(); return finish(); }
        if (!slots.day) slots.day = { offset: dayDiff(p.date, now) };
        offerSlot(p.type, pendingBooking());
        return finish();
      }
      if (intent === 'yes') { commit(); return finish(); }
      if (intent === 'no' || intent === 'cancel') {
        if (p.type === 'cancel') { say('cancelKept'); reset(); s.stage = 'done'; }
        else { say('declined'); s.stage = 'awaiting_slot'; s.pending = { type: p.type, bookingId: p.bookingId }; }
        return finish();
      }
      if (intent.startsWith('faq_')) { say(intent.slice(4)); parts.push(p.question); return finish(); }
      if (s.retries < 1) { s.retries++; say('repeatConfirm', { question: p.question }); return finish(); }
      callback(); return finish();
    }

    if (s.stage === 'awaiting_slot' && s.pending && hasSlot && !['cancel', 'faq_timing', 'faq_fees', 'faq_address', 'faq_closed'].includes(intent)) {
      offerSlot(s.pending.type, pendingBooking());
      return finish();
    }

    switch (intent) {
      case 'book':
        offerSlot('book', null);
        break;
      case 'reschedule': {
        const b = latestBooking(store, now);
        if (!b) { say('noBooking'); s.stage = 'awaiting_slot'; s.pending = { type: 'book' }; break; }
        offerSlot('reschedule', b);
        break;
      }
      case 'cancel': {
        const b = latestBooking(store, now);
        if (!b) { say('noBooking'); s.stage = 'awaiting_slot'; s.pending = { type: 'book' }; break; }
        s.stage = 'awaiting_confirm'; s.retries = 0;
        s.pending = { type: 'cancel', bookingId: b.id };
        say('cancelConfirm', { oldWhen: when(b.date, toMin(b.time), now, lang) });
        s.pending.question = parts[parts.length - 1];
        break;
      }
      case 'faq_timing': say('timing'); break;
      case 'faq_fees': say('fees'); break;
      case 'faq_address': say('address'); break;
      case 'faq_closed': say('closed'); break;
      case 'discount': callback('discount'); break;
      case 'greeting': say('greeting'); break;
      case 'yes': say('yesIdle'); break;
      case 'no': say('bye'); s.stage = 'done'; reset(); break;
      default:
        if (hasSlot) offerSlot('book', null);
        else callback();
    }
    return finish();
  }

  function amt(n) {
    return { text: Number(n).toLocaleString('en-IN'), speak: hiNum(n) };
  }

  // Udhaari reminder: fixed template + AI disclosure + opt-out
  function reminder(name, amount, tone, config) {
    const R = config.reminders;
    const r = render(R[tone === 'normal' ? 'normal' : 'soft'], { name, shop: config.shop.name, amount: amt(amount) });
    return { text: r.text + ' ' + R.footer, speak: r.speak + ' Ye message AI se bana hai.' };
  }

  const api = { normalize, parse, step, reminder, hiNum, translit, resolveMinutes, DEFAULT_STATE };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VaaniEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
