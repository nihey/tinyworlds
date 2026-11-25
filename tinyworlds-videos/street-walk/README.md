# Tiny Worlds Street Walk announcement

This HyperFrames project edits the real New York viewer footage into a 30-second, 1920 × 1080 film. The original Suno instrumental is in `assets/music/`. The short effects come from the bundled HyperFrames library.

Run the New York viewer with its generated tiles and walk cells.

```bash
cd tinyworlds-frontend
NEXT_PUBLIC_WORLD=tinynyc npm run dev -- --hostname 127.0.0.1 --port 3177
```

Capture from `tinyworlds-videos/`. Set `VIEWER_URL` if your development server uses a different address. Pass a shot name to replace a single take. The four driving takes are `drive-times`, `drive-world-trade`, `drive-vessel` and `drive-park`.

```bash
npm exec -- tsx scripts/street-walk.ts
mkdir -p street-walk/assets/sfx
cp node_modules/hyperframes/dist/skills/media-use/audio/assets/sfx/{whoosh-short,pop}.mp3 street-walk/assets/sfx/
```

Preview or render from `tinyworlds-videos/street-walk/`. The optional `address` render variable prints the New York map URL on the end card.

```bash
npx hyperframes preview
npx hyperframes check
npx hyperframes render --quality delivery --output ../out/street-walk/tinyworlds-street-walk.mp4
```
