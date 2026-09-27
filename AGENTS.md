<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules

- CivicFix API lives in TanStack server routes under `src/routes/api/public/reports*` (multipart + external callers), not server functions — the spec defines plain HTTP endpoints callable from outside the app.
- Media goes to the private `report-media` bucket and is stored as a long-lived signed URL, because public buckets are blocked in this workspace.
- Classification calls the Brev/NIM endpoint from `src/lib/civic.server.ts` and falls back to a `mock: true` result, so the app stays demoable when the GPU endpoint is down.
- Video frames are captured client-side (canvas) before upload, since the server runtime has no ffmpeg.

