# U+R Studio — Vercel deployment

This repository is the full Open Generative AI fork, tailored for Unicorns + Robots. The upstream MIT licence is retained.

## Import

1. In Vercel, choose **Add New → Project → Import Git Repository**.
2. Select `lisaspencerxx/Open-Generative-AI` and the correct Vercel team (**Lisa's projects**).
3. Leave **Root Directory** as `./`. Vercel should recognise **Next.js**.
4. Import/deploy. `vercel.json` initializes the public Git submodules, installs dependencies, builds the workspace packages, and builds Next.js.

Do not upload a ZIP for this version: the studio depends on Git submodules for the workflow and agent packages.

## Access and API costs

**Before adding any paid model key**, enable **Vercel Authentication** in Settings → Deployment Protection, ensuring the production URL and deployment URLs you intend to use are protected. Test in a private/incognito browser window.

This upstream application requests a **MuAPI key in its own interface**. `FAL_KEY` from the old smaller studio does not enable MuAPI models, and `STUDIO_PASSWORD` / `STUDIO_SESSION_SECRET` are not used by this application.

The upstream UI stores the MuAPI key in the browser's local storage and connects to MuAPI via its routes. This is **not** centrally managed server-side key storage and shouldn't be presented as such. Never commit keys to this repository or paste them into chat.

Cloud inference is metered by MuAPI; most advanced models are not free. Check provider pricing before submitting a job.

## Platform limitations

- Desktop browser and mobile browser both use the hosted Next.js web app; review mobile controls and test each module.
- Local Stable Diffusion / Wan2GP inference is provided by the **desktop Electron version**, **not** by Vercel.
- The listed model catalogue is not proof every model is currently available or licensed by its provider.
- No production build, MuAPI payment flow, or model generation has been validated in this fork yet.

## Troubleshooting

If build fails, inspect Vercel build logs for git submodule cloning, workspace package build errors, or Node dependency compatibility. Avoid exposing secrets in logs/screenshots.

Original project: https://github.com/Anil-matcha/Open-Generative-AI
