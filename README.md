# VaaniDesk

**Dukaan waalon ka voice khata + AI phone assistant.** Bolke udhaari likho, polite voice reminder bhejo, aur customer ke sawaalon ka jawab VaaniDesk de. Aap kaam karo, VaaniDesk baat karega.

Live: https://vaanidesk.ronakv474.workers.dev · Demo video: `<link>`

## Problem
Clinic, salon, coaching ya repair shop ka owner busy hota hai. Call miss hoti hai aur customer kahin aur chala jaata hai, kyunki receptionist rakhna mehnga padta hai. Kirana aur medical store waale udhaari wapas maangne mein jhijhakte hain. Typing, English aur naye apps, ye sab owner ke liye bojh hain.

## Kaise use karein
- **Home:** mic dabao, bolo "Sharma ji ke 2000 baaki" → ledger entry + bolke confirm. "Sharma ji ne 500 de diye", "Sharma ji ka hisaab batao" bhi chalta hai.
- **Khata:** har customer ka baaki, search, Soft/Normal tone, "Yaad dilao" → Timbre voice note + WhatsApp.
- **Grahak:** customer ki call ka demo: timing, pata, order/delivery ka message owner ke callback list mein.

## Kaise kaam karta hai
```
Browser mic → WAV (16 kHz mono PCM16) → /api/stt (Worker) → Gnani Prisma v3.0 → transcript
→ engine.js (rules, LLM nahi) → {intent, slots} → state machine → reply + store update
→ /api/tts (Worker) → Gnani Timbre v3.0 → speaker
Dashboard (same page) ← localStorage (bookings, calls, ledger, alerts)
```
- **Model sunta hai, code decide karta hai.** Intents ke rules deterministic JS mein hain, isliye unke tests likhe ja sakte hain (`node tools/test-engine.js`).
- **Har booking pe confirm-back hota hai**, jaise "Kal shaam 5 baje, Dr. Meena ke saath. Sahi hai?". Isse STT ki galti pakdi jaati hai.
- Slot bhara ho, Ravivaar ho, ya clinic ka time na ho, to engine agla khaali slot offer karta hai.
- Engine ye intents samajhta hai: booking, reschedule, cancel, FAQ (timing / fees / address / chhutti), emergency (108/112 + red alert), aur unknown (owner ke liye callback).
- Bhasha: Hinglish, Devanagari aur Tamil. Tamil mein 5 core replies hain.
- **Udhaari:** owner bolta hai "Sharma ji ke 2000 baaki" → ledger mein entry → "Yaad dilao" → Timbre voice note + WhatsApp text (wa.me).
- Fallbacks: text input mode, 429 pe cached "Ji, ek second", aur mic permission na mile to saaf message.

## Gnani models used
| Kaam | Model | Endpoint |
|---|---|---|
| STT | Prisma v3.0 (`indic-auto`, `codemix`) | `POST api.vachana.ai/stt/v3` |
| TTS | Timbre v3.0 (voice: Avinash, `hi-en` / `ta-IN`) | `POST api.vachana.ai/api/v1/tts/inference` |

API key sirf Worker secret mein rehti hai. Browser ya git mein kabhi nahi jaati.

## Measured
> Task 6 ke baad asli numbers bharo. Ye numbers guess karke mat likhna.

| Metric | Value |
|---|---|
| Intent accuracy (20 recorded sentences, Prisma transcripts) | __ / 20 |
| Intent accuracy (same sentences as text, baseline) | 20 / 20 |
| Engine unit tests | 79 pass |
| STT latency median / worst | __ / __ ms |
| TTS latency median / worst | __ / __ ms |
| Total turn median / worst | __ / __ ms |

Numbers kaise nikalein:
1. App mein `tools/dataset.json` ke 20 sentences bolo. Udhaari wale 2 sentences Udhaari tab mein bolo.
2. Dashboard pe "Log export" dabao → `vaanidesk-calls.json` download hoga.
3. Latency ke liye: `node tools/eval.js --calls vaanidesk-calls.json`
4. Accuracy ke liye: transcripts ko `[{ "text": ..., "intent": ... }]` format mein save karo, phir `node tools/eval.js transcripts.json` chalao.

## Honest limitations
- Ye live phone call nahi hai. User ek turn bolta hai, phir jawab sunta hai (turn-by-turn). Beech mein bolke jawab nahi rok sakte (barge-in nahi hai).
- Ek demo business hai. Data sirf browser ke localStorage mein rehta hai, koi login nahi hai.
- Reschedule aur cancel sabse latest booking pe lagte hain, kyunki demo mein caller ki pehchaan (phone number) nahi hai.
- Rule-based engine naye ya ajeeb phrasing pe "unknown" bolta hai aur callback save kar deta hai.
- Tamil ke sirf 5 replies hain. Baaki jawab Hindi mein aate hain.
- Worker ka rate limit har isolate ka alag hai, globally lagu nahi hota.

## Roadmap
Real phone number (Exotel), clinic follow-up reminders, end-of-day voice summary, owner voice clone (Gnani mein ye API hai; owner ka consent aur delete option ke saath), Postgres + multi-business config, aur free-form FAQ ke liye LLM.

## Responsible AI
Har call ki pehli line mein AI disclosure hota hai. Engine medical advice nahi deta, aur emergency pe 108/112 bolta hai. Paise ka koi wada ya discount nahi karta. Audio store nahi hota. Koi outbound call nahi hoti. Reminder sirf owner ke share karne pe jaata hai, aur usme AI disclosure aur STOP (opt-out) line hoti hai. Saare naam made-up hain.

## Team
- **Ronak:** Worker/API integration, intent engine + tests, voice loop, latency measurement.
- **Abhilasha:** dashboard + udhaari UI, test dataset + accuracy evaluation, README, demo video.

## Local chalao
```
npm install
copy .dev.vars.example .dev.vars   # GNANI_API_KEY=...
npx wrangler dev                   # http://localhost:8787
node tools/test-engine.js
```
## Deploy
```
npx wrangler login
npx wrangler secret put GNANI_API_KEY
npx wrangler deploy
```
