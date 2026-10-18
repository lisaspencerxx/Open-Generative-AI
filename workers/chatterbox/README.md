# U+R Chatterbox GPU worker

This is a **separate optional inference service** for approved character voices.
The Vercel web app cannot run Chatterbox inference without a GPU worker.
Chatterbox's code and weights have their own terms; review these before deployment.

## Deploy privately
1. Deploy this directory to a suitable CUDA GPU host (for example a private container service with a GPU).
2. Set `WORKER_TOKEN` to a long unique random value.
3. Configure TLS at the hosting provider so the service is available at an **HTTPS** URL.
4. Restrict ingress to trusted traffic wherever possible; the worker checks a Bearer token.
5. Verify `GET /health` after the model has downloaded.
6. In **Vercel > open-generative-ai > Settings > Environment Variables**, add server-side ONLY:
   - `CHARACTER_VOICE_ENABLED=true`
   - `CHARACTER_VOICE_WORKER_URL=https://your-gpu-worker.example`
   - `CHARACTER_VOICE_WORKER_TOKEN=<same WORKER_TOKEN>`
7. Require **Vercel Authentication for all deployments** before enabling this feature.
8. Redeploy, then test a short authorised voice sample.

The endpoint is disabled by default and returns HTTP 503 until enabled.
The web app never writes the GPU token into its browser code.

## Limitations
- A GPU host has hourly and storage costs even when the model is open source.
- This first worker makes one short WAV file per request. Batch queues, pricing limits,
  rate limiting, team permissions, backups and background job retries are NOT implemented.
- The browser character library is local to one browser; this is not yet a shared team database.
- A reference clip should be the user's own voice or a voice used with explicit permission.
- Prompt audio is discarded after each request; a GPU provider may have independent logging policies.
- Confirm your deployed Chatterbox, Torch and Torchaudio versions are compatible.
