# NOTES — Gnani API findings (Task 1)

Source: https://docs.gnani.ai (TTS REST + STT REST pages), checked 14 Nov.

## STT — Prisma v3.0
- `POST https://api.vachana.ai/stt/v3`, multipart, header `X-API-Key-ID`.
- Fields: `audio_file`, `model=prisma-v3.0` (**zaroori** — bina iske v2.5 chalta hai), `language_code=indic-auto`, `format=codemix`.
- Max 30 sec audio. Response: `{ transcript, detected_language_code, processing_time }`.
- Extra options (baad mein kaam aa sakte): `keyterms` (jaise "Dr. Meena", "appointment"), `topic`.

## TTS — Timbre v3.0
- `POST https://api.vachana.ai/api/v1/tts/inference`, JSON, header `X-API-Key-ID`.
- Body: `text, model="timbre-v3.0", voice, language, speed (0.85–1.15), audio_config`.
- Language: `hi-en` (Hinglish), `ta-IN`, `hi-IN`, `auto` + 8 aur.
- Voices (v3.0, 13, har voice 10 languages bolti hai): Avinash, Shivani, Lakshmi, Kalpana, Shubham, Prakash, Devansh, Yashraj, Chetana, Vasudha, Riyaa, Tarika, Harshad.
- Output: wav / mp3 / ogg. Hum mp3 64k, 24 kHz le rahe (chhota, jaldi aata hai).
- Numbers ko words mein bhejo, warna galat bolta hai.
- Audio tags (`<pauses>` etc.) v3.0 pe chalte hain.

## Voice cloning
- **Support hai**: `POST /api/v1/tts/voice-clone/embeddings` (audio se embedding) + model `vachana-vc-v1` with `speaker_embedding`.
- Plan ke hisaab se: build nahi kar rahe, sirf roadmap (consent + delete option ke saath).

## Errors / limits
- 429 `RATE_LIMITED`: "1 active request at a time". `Retry-After` nahi aata → Worker 400/800/1600 ms backoff karta hai.
- Worker mein apne limits: audio 1.5 MB, TTS 400 chars, 20 req/min per IP (per-isolate, best effort).

## Abhi verify karna baaki (key se)
- `format=codemix` asli mein chalta hai ya fallback lagta hai.
- Avinash vs Shivani — kaunsi awaaz Hinglish mein better lagti hai.
