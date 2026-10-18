import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

// This endpoint is DISABLED unless a GPU worker has been explicitly provisioned.
// Protect the full Vercel production deployment with Vercel Authentication
// before enabling. Never put this worker token in a client-side environment variable.
export async function POST(request) {
  if (process.env.CHARACTER_VOICE_ENABLED !== 'true') {
    return NextResponse.json({ error: 'Voice cloning is not connected yet. A private GPU worker must be configured first.' }, { status: 503 });
  }
  const baseUrl = process.env.CHARACTER_VOICE_WORKER_URL;
  const token = process.env.CHARACTER_VOICE_WORKER_TOKEN;
  if (!baseUrl || !token) {
    return NextResponse.json({ error: 'Voice GPU worker credentials are missing.' }, { status: 503 });
  }
  let url;
  try {
    url = new URL(baseUrl);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error('HTTPS worker URL required');
  } catch {
    return NextResponse.json({ error: 'Voice GPU worker URL is invalid.' }, { status: 503 });
  }
  const contentType = request.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return NextResponse.json({ error: 'Expected a voice reference and text.' }, { status: 400 });
  }
  const maxBytes = 25 * 1024 * 1024;
  if (Number(request.headers.get('content-length') || 0) > maxBytes) {
    return NextResponse.json({ error: 'Reference file exceeds the 25 MB request limit.' }, { status: 413 });
  }
  try {
    const form = await request.formData();
    const text = String(form.get('text') || '').trim();
    const reference = form.get('reference');
    if (!text || text.length > 1500) {
      return NextResponse.json({ error: 'Voice text must be 1–1500 characters.' }, { status: 400 });
    }
    if (!reference || typeof reference.arrayBuffer !== 'function' || reference.size < 1000 || reference.size > 20 * 1024 * 1024) {
      return NextResponse.json({ error: 'Upload a valid voice sample under 20 MB.' }, { status: 400 });
    }
    const allowed = ['audio/wav','audio/x-wav','audio/mpeg','audio/mp3','audio/mp4','audio/webm','audio/ogg','audio/aac','audio/flac'];
    if (!allowed.includes(reference.type)) {
      return NextResponse.json({ error: 'Unsupported voice sample format.' }, { status: 400 });
    }
    const outgoing = new FormData();
    outgoing.set('text', text);
    outgoing.set('reference', reference, 'reference-audio');
    const aborter = new AbortController();
    const timeout = setTimeout(() => aborter.abort(), 105000);
    let result;
    try {
      result = await fetch(new URL('/generate', url), {
        method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: outgoing,
        cache: 'no-store', signal: aborter.signal,
      });
    } finally { clearTimeout(timeout); }
    if (!result.ok) {
      return NextResponse.json({ error: 'Voice processor failed (HTTP ' + result.status + ').' }, { status: 502 });
    }
    const mime = result.headers.get('content-type') || '';
    if (!mime.includes('audio/')) {
      return NextResponse.json({ error: 'Voice processor returned an unexpected response.' }, { status: 502 });
    }
    const audio = await result.arrayBuffer();
    if (audio.byteLength > 30 * 1024 * 1024) {
      return NextResponse.json({ error: 'Generated audio was too large.' }, { status: 502 });
    }
    return new NextResponse(audio, { headers: { 'Content-Type': 'audio/wav', 'Cache-Control': 'private, no-store', 'Content-Disposition': 'attachment; filename="character-voice.wav"' } });
  } catch (err) {
    return NextResponse.json({ error: err?.name === 'AbortError' ? 'Voice generation timed out; try a shorter line.' : 'Voice generation service is unavailable.' }, { status: 502 });
  }
}
