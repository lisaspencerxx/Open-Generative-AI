"""U+R Chatterbox voice worker — run on a dedicated GPU host, never on Vercel."""
import asyncio
import io
import os
import secrets
import subprocess
import tempfile
from pathlib import Path

import torch
import torchaudio
from chatterbox.tts import ChatterboxTTS
from fastapi import FastAPI, UploadFile, File, Form, Header, HTTPException
from fastapi.responses import Response

app = FastAPI(title="U+R Voice GPU Worker", docs_url=None, redoc_url=None, openapi_url=None)
MODEL = None
LOCK = asyncio.Lock()
MAX_AUDIO_BYTES = 20 * 1024 * 1024

@app.on_event("startup")
def start():
    global MODEL
    if not os.environ.get("WORKER_TOKEN"):
        raise RuntimeError("WORKER_TOKEN must be configured")
    if not torch.cuda.is_available():
        raise RuntimeError("This deployment requires a CUDA GPU")
    MODEL = ChatterboxTTS.from_pretrained(device="cuda")

@app.get("/health")
def health():
    return {"ready": MODEL is not None}

@app.post("/generate")
async def generate(
    text: str = Form(..., min_length=1, max_length=1500),
    reference: UploadFile = File(...),
    authorization: str = Header(default=""),
):
    token = os.environ["WORKER_TOKEN"]
    if not secrets.compare_digest(authorization, "Bearer " + token):
        raise HTTPException(status_code=401, detail="Unauthorized")
    content_type = reference.content_type or ""
    if not content_type.startswith("audio/"):
        raise HTTPException(status_code=400, detail="An audio reference is required")
    raw = await reference.read(MAX_AUDIO_BYTES + 1)
    if len(raw) > MAX_AUDIO_BYTES or len(raw) < 1000:
        raise HTTPException(status_code=413, detail="Invalid reference size")
    async with LOCK:
        with tempfile.TemporaryDirectory(prefix="ur_voice_") as folder:
            src = Path(folder) / "input.audio"
            out = Path(folder) / "prompt.wav"
            dst = Path(folder) / "result.wav"
            src.write_bytes(raw)
            # Handles mobile webm/m4a uploads safely; shell=False and no user file paths.
            convert = subprocess.run([
                "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(src), "-ac", "1", "-ar", "24000", "-t", "30", str(out),
            ], capture_output=True, timeout=30)
            if convert.returncode != 0 or not out.exists():
                raise HTTPException(status_code=400, detail="Could not decode reference audio")
            try:
                with torch.inference_mode():
                    wav = await asyncio.to_thread(MODEL.generate, text, audio_prompt_path=str(out))
                torchaudio.save(str(dst), wav.detach().cpu(), MODEL.sr)
                return Response(dst.read_bytes(), media_type="audio/wav", headers={"Cache-Control": "no-store"})
            except Exception:
                # Never include reference audio or original text in logs.
                raise HTTPException(status_code=500, detail="Voice generation failed")
