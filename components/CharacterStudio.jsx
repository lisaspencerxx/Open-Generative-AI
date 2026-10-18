'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { imageLipSyncModels } from '../packages/studio/src/models.js';
import { processLipSync, uploadFile } from '../packages/studio/src/muapi.js';

const PROFILE_STORE = 'ur-character-profiles-v1';
const EPISODE_STORE = 'ur-character-episodes-v1';
const NEW_ID = () => (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
const INITIAL_PROFILES = [
  { id: 'uncle', name: 'Uncle', series: 'Uncle', kind: 'human', personality: 'Eccentric technology presenter. Keep the same approved appearance in every clip.', portraitId: null, voiceId: null, approved: false },
  { id: 'pookii-cat', name: 'Pookii Cat', series: 'Pookii Podcast', kind: 'cat', personality: 'Permanent feline co-host. Define personality and visual identity before recording.', portraitId: null, voiceId: null, approved: false },
  { id: 'pookii-dog', name: 'Pookii Dog', series: 'Pookii Podcast', kind: 'dog', personality: 'Permanent canine co-host. Define personality and visual identity before recording.', portraitId: null, voiceId: null, approved: false },
];
const INITIAL_EPISODES = [
  { id: 'pookii-pilot', name: 'Pookii Podcast / Pilot', series: 'Pookii Podcast', lines: [{ id: 'p-line-1', characterId: 'pookii-cat', text: '', audioId: null, resultUrl: null }] },
  { id: 'uncle-short', name: 'Uncle / First Short', series: 'Uncle', lines: [{ id: 'u-line-1', characterId: 'uncle', text: '', audioId: null, resultUrl: null }] },
];
const openDB = () => new Promise((resolve, reject) => {
  const req = indexedDB.open('ur-character-assets', 1);
  req.onupgradeneeded = () => req.result.createObjectStore('assets');
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
});
async function assetPut(id, file) {
  const db = await openDB();
  try { await new Promise((resolve, reject) => {
    const tx = db.transaction('assets', 'readwrite');
    tx.objectStore('assets').put(file, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  }); } finally { db.close(); }
}
async function assetGet(id) {
  if (!id) return null;
  const db = await openDB();
  try { return await new Promise((resolve, reject) => {
    const tx = db.transaction('assets', 'readonly');
    const req = tx.objectStore('assets').get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  }); } finally { db.close(); }
}
const downloadText = (filename, content, mime = 'text/plain') => {
  const url = URL.createObjectURL(new Blob([content], { type: mime }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};
const slug = (s) => (s || 'project').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const field = 'w-full rounded-xl border border-white/10 bg-white/[.045] px-3.5 py-3 text-sm text-white outline-none transition focus:border-[#f3518c]/70 placeholder:text-white/20';
const button = 'rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-40 disabled:cursor-not-allowed';
const panel = 'rounded-2xl border border-white/10 bg-[#101013]';
const pill = 'rounded-full border border-white/10 bg-white/[.04] px-3 py-1.5 text-xs text-white/55';

function MediaPreview({ id, type, label }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let dead = false, src;
    assetGet(id).then((file) => {
      if (dead || !file) return;
      src = URL.createObjectURL(file); setUrl(src);
    }).catch(() => setUrl(''));
    return () => { dead = true; if (src) URL.revokeObjectURL(src); };
  }, [id]);
  if (!url) return <div className="h-full min-h-[100px] flex items-center justify-center text-white/25 text-xs px-3 text-center">{label || 'No reference uploaded'}</div>;
  if (type === 'audio') return <audio src={url} controls className="w-full min-w-0" preload="metadata" />;
  return <img src={url} alt={label || 'Character reference'} className="h-full w-full object-cover" />;
}

export default function CharacterStudio({ apiKey, onOpenLipSync }) {
  const [profiles, setProfiles] = useState(INITIAL_PROFILES);
  const [episodes, setEpisodes] = useState(INITIAL_EPISODES);
  const [characterId, setCharacterId] = useState('uncle');
  const [episodeId, setEpisodeId] = useState('pookii-pilot');
  const [section, setSection] = useState('episodes');
  const [hydrated, setHydrated] = useState(false);
  const [busy, setBusy] = useState(null);
  const [message, setMessage] = useState('');
  const [mediaVersion, setMediaVersion] = useState(0);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const selected = profiles.find(p => p.id === characterId) || profiles[0];
  const episode = episodes.find(e => e.id === episodeId) || episodes[0];
  const lines = episode?.lines || [];
  const models = useMemo(() => imageLipSyncModels.filter(m => m && m.id), []);
  const [lipModel, setLipModel] = useState('');
  const [voiceText, setVoiceText] = useState('');
  const [cloning, setCloning] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState('');
  useEffect(() => { if (!lipModel && models.length) setLipModel(models[0].id); }, [lipModel, models]);
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(PROFILE_STORE));
      const e = JSON.parse(localStorage.getItem(EPISODE_STORE));
      if (Array.isArray(p) && p.length) setProfiles(p);
      if (Array.isArray(e) && e.length) setEpisodes(e);
    } catch { /* corrupted browser data should not block the studio */ }
    setHydrated(true);
  }, []);
  useEffect(() => { if (hydrated) {
    try { localStorage.setItem(PROFILE_STORE, JSON.stringify(profiles)); }
    catch { setMessage('Storage is full. Export your project before leaving.'); }
  } }, [profiles, hydrated]);
  useEffect(() => { if (hydrated) {
    try { localStorage.setItem(EPISODE_STORE, JSON.stringify(episodes)); }
    catch { setMessage('Storage is full. Export your project before leaving.'); }
  } }, [episodes, hydrated]);
  const editProfile = (patch) => setProfiles(items => items.map(p => p.id === characterId ? { ...p, ...patch } : p));
  const editEpisode = (patch) => setEpisodes(items => items.map(e => e.id === episodeId ? { ...e, ...patch } : e));
  const editLine = (id, patch) => editEpisode({ lines: lines.map(l => l.id === id ? { ...l, ...patch } : l) });
  const saveMedia = async (file, target, kind) => {
    if (!file) return;
    if (file.size > 35 * 1024 * 1024) { setMessage('File is too large. Maximum 35 MB per reference.'); return; }
    if (kind === 'portrait' && !file.type.startsWith('image/')) { setMessage('Choose a portrait image.'); return; }
    if (kind !== 'portrait' && !file.type.startsWith('audio/')) { setMessage('Choose an audio recording.'); return; }
    try {
      const id = NEW_ID(); await assetPut(id, file);
      if (target === 'character') editProfile({ [kind === 'portrait' ? 'portraitId' : 'voiceId']: id });
      else editLine(target, { audioId: id, resultUrl: null });
      setMediaVersion(x => x + 1); setMessage('Reference saved on this device.');
    } catch (err) { setMessage('Your browser could not save this file: ' + err.message); }
  };
  const newProfile = () => {
    const id = NEW_ID();
    setProfiles(p => [...p, { id, name: 'New Character', series: 'Original Series', kind: 'human', personality: '', portraitId: null, voiceId: null, approved: false }]);
    setCharacterId(id); setSection('characters');
  };
  const newEpisode = () => {
    const id = NEW_ID();
    const cid = profiles[0]?.id || 'uncle';
    setEpisodes(p => [...p, { id, name: 'Untitled Episode', series: selected?.series || 'New Series', lines: [{ id: NEW_ID(), characterId: cid, text: '', audioId: null, resultUrl: null }] }]);
    setEpisodeId(id); setSection('episodes');
  };
  const addLine = () => editEpisode({ lines: [...lines, { id: NEW_ID(), characterId: profiles[0]?.id || 'uncle', text: '', audioId: null, resultUrl: null }] });
  const deleteLine = (id) => { if (lines.length > 1) editEpisode({ lines: lines.filter(l => l.id !== id) }); };
  const startRecording = async (id) => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setMessage('Audio recording is not supported in this browser. Upload audio instead.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = e => { if (e.data?.size) chunksRef.current.push(e.data); };
      rec.onstop = async () => {
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
          const ext = (rec.mimeType || '').includes('mp4') ? 'm4a' : 'webm';
          await saveMedia(new File([blob], 'take-' + Date.now() + '.' + ext, { type: blob.type }), id, 'line');
        } finally { stream.getTracks().forEach(t => t.stop()); setBusy(null); recorderRef.current = null; }
      };
      recorderRef.current = rec; setBusy('record:' + id); rec.start();
    } catch (e) { setMessage('Microphone access was denied or unavailable: ' + e.message); }
  };
  const stopRecording = () => { if (recorderRef.current?.state === 'recording') recorderRef.current.stop(); };
  const animateLine = async (line) => {
    const speaker = profiles.find(c => c.id === line.characterId);
    if (!apiKey) { setMessage('Add your MuAPI key in U+R Studio Settings first.'); return; }
    if (!speaker?.portraitId || !line.audioId) { setMessage('Upload the speaker portrait and a recorded audio take for this line first.'); return; }
    if (!lipModel) { setMessage('No compatible image lip-sync model is available.'); return; }
    if (!window.confirm('This will send this portrait and audio to MuAPI and use paid generation credits. Continue?')) return;
    setBusy('render:' + line.id); setMessage('Uploading portrait and audio to MuAPI…');
    try {
      const portrait = await assetGet(speaker.portraitId), audio = await assetGet(line.audioId);
      if (!portrait || !audio) throw new Error('One of the reference files is missing from this browser.');
      const [image_url, audio_url] = await Promise.all([uploadFile(apiKey, portrait), uploadFile(apiKey, audio)]);
      setMessage('Generating lip-sync on MuAPI. This can take several minutes…');
      const result = await processLipSync(apiKey, { model: lipModel, image_url, audio_url });
      if (!result?.url || !/^https:\/\//.test(result.url)) throw new Error('MuAPI returned no usable video URL.');
      editLine(line.id, { resultUrl: result.url }); setMessage('Clip ready — play or open the video below.');
    } catch (err) { setMessage('Lip-sync failed: ' + (err?.message || String(err))); }
    finally { setBusy(null); }
  };
  const makeScript = () => lines.map((l, i) => {
    const p = profiles.find(c => c.id === l.characterId);
    return (i + 1) + '. ' + (p?.name || 'Unknown') + ': ' + (l.text || '[Write dialogue]');
  }).join('\n\n');
  const exportEpisode = () => {
    downloadText(slug(episode.name) + '-script.txt', episode.name + '\n\n' + makeScript());
  };
  const exportProject = () => downloadText('ur-characters-and-episodes.json', JSON.stringify({ version: 1, profiles, episodes, note: 'Media files are stored separately in this browser and are not included in this backup.' }, null, 2), 'application/json');
  const cloneVoice = async () => {
    if (!selected?.voiceId || !voiceText.trim()) { setVoiceStatus('Upload an authorised voice reference and enter some speech first.'); return; }
    setCloning(true); setVoiceStatus('Checking voice generation connection…');
    try {
      const audio = await assetGet(selected.voiceId);
      if (!audio) throw new Error('Voice reference is missing from this device.');
      const fd = new FormData();
      fd.append('reference', audio, audio.name || 'voice.wav');
      fd.append('text', voiceText.trim().slice(0, 1500));
      const res = await fetch('/api/characters/voice', { method: 'POST', body: fd });
      if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j.error || 'Voice service not available'); }
      const blob = await res.blob();
      const uri = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = uri; a.download = slug(selected.name) + '-generated.wav'; a.click();
      setTimeout(() => URL.revokeObjectURL(uri), 3000);
      setVoiceStatus('Voice generated and downloaded. Upload the WAV as an episode take to animate it.');
    } catch (err) { setVoiceStatus(err.message); }
    finally { setCloning(false); }
  };
  return (
    <div className="h-full overflow-y-auto bg-[#08080a] text-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-8 sm:py-9">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between mb-7">
          <div>
            <p className="text-[10px] tracking-[.32em] uppercase font-bold text-[#f3518c] mb-2">UNICORNS + ROBOTS / ORIGINAL IP</p>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">Character <span className="text-[#f3518c]">Studio.</span></h1>
            <p className="mt-2 text-sm text-white/45">Keep your characters consistent. Script, record, create a voice and animate each scene.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={pill}>Local browser library</span>
            <button className={button + ' bg-white/10 text-white hover:bg-white/20'} onClick={exportProject}>Export project JSON</button>
          </div>
        </div>
        <div className="mb-6 flex gap-2 flex-wrap" role="tablist" aria-label="Character Studio sections">
          {[['episodes', 'Episode builder'], ['characters', 'Characters & voices']].map(([id,label]) =>
            <button key={id} role="tab" aria-selected={section === id} className={button + ' ' + (section === id ? 'bg-[#f3518c] text-black' : 'border border-white/10 text-white/60 hover:text-white')} onClick={() => setSection(id)}>{label}</button>
          )}
        </div>
        {message && <div role="status" className="mb-5 flex justify-between gap-3 rounded-xl border border-[#f3518c]/30 bg-[#f3518c]/10 p-3 text-xs text-white/80"><span>{message}</span><button onClick={() => setMessage('')} aria-label="Dismiss">✕</button></div>}
        {section === 'characters' ? (
          <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
            <aside className={panel + ' p-3 h-fit'}>
              <div className="flex items-center justify-between px-2 py-2 mb-2"><span className="font-bold text-sm">Your cast</span><button className="text-xs font-semibold text-[#f3518c]" onClick={newProfile}>+ Add</button></div>
              {profiles.map(p => <button key={p.id} onClick={() => setCharacterId(p.id)} className={'w-full mb-1 rounded-xl p-3 text-left text-sm flex items-center gap-3 border ' + (characterId === p.id ? 'border-[#f3518c]/40 bg-[#f3518c]/10' : 'border-transparent hover:bg-white/5')}>
                <span className="h-9 w-9 rounded-lg bg-white/10 grid place-items-center text-lg">{p.kind === 'cat' ? '🐈' : p.kind === 'dog' ? '🐕' : '🎙'}</span><span className="min-w-0"><strong className="block truncate">{p.name}</strong><small className="text-white/40">{p.series}</small></span></button>)}
            </aside>
            {selected && <section className={panel + ' p-4 sm:p-6'}>
              <div className="grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
                <div>
                  <div className="aspect-[3/4] overflow-hidden rounded-2xl border border-white/10 bg-[#060609]"><MediaPreview key={selected.portraitId || 'blank'} id={selected.portraitId} type="image" label="Upload your approved character reference" /></div>
                  <label className={button + ' text-center block cursor-pointer mt-3 bg-white/10 hover:bg-white/20'}>Upload character image<input type="file" accept="image/*" className="hidden" onChange={e => { saveMedia(e.target.files?.[0], 'character', 'portrait'); e.target.value = ''; }} /></label>
                  <p className="text-[11px] text-white/35 mt-2">Use an approved portrait. Files stay in this browser until you submit a generation.</p>
                </div>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="text-xs text-white/50 block">Character name<input className={field + ' mt-1.5'} value={selected.name} onChange={e => editProfile({name:e.target.value})} /></label>
                    <label className="text-xs text-white/50 block">Series<input className={field + ' mt-1.5'} value={selected.series} onChange={e => editProfile({series:e.target.value})} /></label>
                  </div>
                  <label className="text-xs text-white/50 block">Character type<select className={field + ' mt-1.5'} value={selected.kind} onChange={e => editProfile({kind:e.target.value})}><option className="bg-black" value="human">Human</option><option className="bg-black" value="cat">Cat</option><option className="bg-black" value="dog">Dog</option><option className="bg-black" value="other">Other</option></select></label>
                  <label className="text-xs text-white/50 block">Personality & continuity notes<textarea rows={4} className={field + ' mt-1.5'} value={selected.personality} placeholder="Wardrobe, mannerisms, personality, visual rules…" onChange={e => editProfile({personality:e.target.value})} /></label>
                  <div className="flex flex-wrap items-center gap-2"><label className="text-xs text-white/50 flex gap-2 items-center"><input type="checkbox" checked={!!selected.approved} onChange={e => editProfile({approved:e.target.checked})} /> I have permission to use this character and its voice</label></div>
                  <div className="border-t border-white/10 pt-5">
                    <h3 className="font-bold mb-2">Voice reference</h3>
                    <p className="text-xs text-white/45 mb-3">Upload a recording of your own or a fully authorised voice. This isn't cloned until the Chatterbox GPU service is connected.</p>
                    <label className={button + ' inline-block cursor-pointer bg-white/10 hover:bg-white/20'}>Upload voice reference<input type="file" accept="audio/*" className="hidden" onChange={e => {saveMedia(e.target.files?.[0], 'character', 'voice'); e.target.value = '';}} /></label>
                    <div className="mt-3" key={selected.voiceId || 'none'}><MediaPreview id={selected.voiceId} type="audio" label="No voice reference uploaded" /></div>
                    <textarea className={field + ' mt-3'} rows={3} value={voiceText} onChange={e => setVoiceText(e.target.value)} placeholder="Type a sentence for this character's voice…" maxLength={1500} />
                    <button disabled={!selected.approved || cloning || !selected.voiceId || !voiceText.trim()} onClick={cloneVoice} className={button + ' w-full bg-[#f3518c] text-black mt-3'}>{cloning ? 'Generating…' : 'Generate voice (GPU connection required)'}</button>
                    {voiceStatus && <p role="status" className="text-xs text-white/60 mt-2">{voiceStatus}</p>}
                  </div>
                </div>
              </div>
            </section>}
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[270px_minmax(0,1fr)]">
            <aside className={panel + ' p-3 h-fit'}>
              <div className="flex items-center justify-between px-2 py-2 mb-2"><span className="font-bold text-sm">Your episodes</span><button className="text-xs font-semibold text-[#f3518c]" onClick={newEpisode}>+ Add</button></div>
              {episodes.map(ep => <button key={ep.id} onClick={() => setEpisodeId(ep.id)} className={'w-full text-left rounded-xl p-3 mb-1 border text-sm ' + (ep.id === episodeId ? 'border-[#f3518c]/40 bg-[#f3518c]/10' : 'border-transparent hover:bg-white/5')}><strong className="block truncate">{ep.name}</strong><span className="text-xs text-white/35">{ep.lines?.length || 0} lines</span></button>)}
              <div className="px-2 pt-3 border-t border-white/10 mt-3"><p className="text-xs text-white/40 leading-relaxed">Keep one line per speaker for podcast clips. Upload or record audio for each line before rendering.</p></div>
            </aside>
            {episode && <section className="min-w-0 space-y-4">
              <div className={panel + ' p-4 sm:p-5'}>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="w-full sm:max-w-md"><label className="text-xs text-white/40">Episode title</label><input className={field + ' mt-1.5 font-semibold'} value={episode.name} onChange={e => editEpisode({name: e.target.value})} /></div>
                  <button className={button + ' bg-white/10 hover:bg-white/20'} onClick={exportEpisode}>↓ Download script</button>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3"><label className="text-xs text-white/50">Lip-sync model</label><select value={lipModel} onChange={e => setLipModel(e.target.value)} className="rounded-lg bg-white/5 border border-white/10 text-xs p-2 max-w-full">{models.map(m => <option className="bg-[#111]" key={m.id} value={m.id}>{m.name || m.id}</option>)}</select><span className={pill}>MuAPI: paid per clip</span></div>
              </div>
              <div className="space-y-3">
                {lines.map((l,i) => {
                  const speaker = profiles.find(p => p.id === l.characterId);
                  return <article key={l.id} className={panel + ' p-4 sm:p-5'}>
                    <div className="flex gap-3 items-center mb-3 flex-wrap"><span className="text-[#f3518c] font-black text-xs">SCENE {String(i+1).padStart(2,'0')}</span><select value={l.characterId} onChange={e => editLine(l.id,{characterId:e.target.value,resultUrl:null})} className="rounded-lg border border-white/10 bg-[#151517] px-3 py-2 text-xs flex-1 max-w-64">{profiles.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select><button disabled={lines.length===1} className="ml-auto text-xs text-white/40 hover:text-red-300 disabled:opacity-20" onClick={()=>deleteLine(l.id)}>Remove</button></div>
                    <textarea className={field} rows={3} value={l.text} onChange={e => editLine(l.id,{text:e.target.value})} placeholder="Write exactly what this character says…" />
                    <div className="mt-3 flex gap-2 flex-wrap items-center">
                      <label className={button + ' cursor-pointer border border-white/15 bg-white/[.07] text-xs'}>↑ Audio take<input className="hidden" type="file" accept="audio/*" onChange={e => {saveMedia(e.target.files?.[0],l.id,'line');e.target.value='';}} /></label>
                      {busy === 'record:'+l.id ? <button className={button + ' text-xs bg-red-500/20 text-red-300'} onClick={stopRecording}>■ Stop recording</button> : <button className={button + ' text-xs border border-white/15'} disabled={!!busy} onClick={()=>startRecording(l.id)}>● Record voice</button>}
                      <span className="text-[11px] text-white/40">{l.audioId ? 'Audio ready' : 'No audio yet'} · {speaker?.portraitId ? 'Portrait ready' : 'Portrait missing'}</span>
                    </div>
                    {l.audioId && <div className="my-3" key={l.audioId}><MediaPreview id={l.audioId} type="audio" /></div>}
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4">
                      <button disabled={!!busy || !speaker?.portraitId || !l.audioId || !apiKey || !lipModel} className={button + ' bg-[#f3518c] text-black'} onClick={()=>animateLine(l)}>{busy === 'render:'+l.id ? 'Generating video…' : 'Create talking clip · Paid API'}</button>
                      <button className="text-xs text-white/50 hover:text-white underline" onClick={onOpenLipSync}>Open full Lip Sync Studio ↗</button>
                    </div>
                    {l.resultUrl && <div className="mt-4 space-y-2"><video src={l.resultUrl} controls playsInline className="rounded-xl max-h-[400px] w-full bg-black" /><a href={l.resultUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-[#f3518c] underline">Open generated video ↗</a></div>}
                  </article>;
                })}
              </div>
              <button onClick={addLine} className={button + ' w-full border border-dashed border-white/20 text-white/70 hover:border-[#f3518c]/60 hover:text-white'}>+ Add another scene / speaker</button>
            </section>}
          </div>
        )}
        <div className="mt-9 border-t border-white/10 pt-4 text-[11px] text-white/35 leading-relaxed flex flex-col sm:flex-row justify-between gap-2">
          <span>U+R Studio · Character workspace beta. Profiles, scripts and original media are stored only in this browser on this device.</span>
          <span>Cloud collaboration and Chatterbox GPU cloning are not enabled yet. MuAPI lip-sync uses paid credits.</span>
        </div>
      </div>
    </div>
  );
}
