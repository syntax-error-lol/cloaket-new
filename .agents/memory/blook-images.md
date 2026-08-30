---
name: Blook image quirks
description: Baked-in card backgrounds, alpha film cleanup, and glow effects for blook art
---

# Blook image quirks

- ~105 of 225 blook webps are card-style: the rounded square card is baked into the artwork (character painted inside it). AI background removal keeps the card (it's the subject); do not attempt CSS removal. User accepted card style.
- **Why:** any "box around blooks" complaint is usually NOT the art — check effects first.
- Glow effects on blook images must use `filter: drop-shadow` (follows alpha silhouette), never `box-shadow` (draws a rectangle around the element) — `.animate-pulse-glow` was the "box" on reveals.
- Older images also had a faint ~10%-alpha square film; cleaned via ImageMagick `-channel A -level 25%,100%`. After any batch image edit, bump the `?v=N` cache-buster on every blook URL in the catalog data.
- Some blooks are animated webps (Phantom King, Rainbow Astronaut, Aurora Yeti, Spring Butterfly) — skip them in per-pixel batch scripts.
- Wing-flap style animations: build frames with `magick -resize "<pct>x100%" -gravity center -extent 288x288` (percent geometry, NOT `${s}x100!` which is pixels), then `magick -dispose background -delay 8 -loop 0 frame_*.png out.webp`. Hue-shift recolors of existing art via `-modulate 100,105,<hue>` (44≈spring green, 155≈pink) beat regenerating with AI for consistency.
- Text-on-art blooks (e.g. branded screens): author as SVG and render with `magick -density 144 in.svg out.webp` — librsvg honors fontconfig, so drop the TTF in `~/.fonts` + `fc-cache -f` first (Titan One is the game's display font; gradient text via SVG linearGradient works fine). Keep the .svg source next to working files for future tweaks.
- Batch AI background removal 429s when run in parallel — run removeImageBackground calls sequentially with retry/backoff. Standard finish per blook: trim, resize to fit 256, `-gravity center -extent 288x288`.

## Interior-hole white fill (Aug 2026)
Request: transparent gaps inside blook art read as holes; fill white but keep the real (border-connected) background transparent.
**Technique:** alpha-extract → threshold 10% → negate = transparent map; add 1px white border and flood-fill red from (0,0) = true background; remaining white = enclosed holes; dilate 1px; white underlay shaped by that mask; original composited OVER it; webp lossless out. Only Tech Laptop + Error had enclosed holes; open gaps (e.g. Microsoft logo cross) count as background by definition.
**ImageMagick trap (cost 2 retries):** IM auto-classifies white/gray canvases and mask PNGs as Grayscale — `xc:white` in memory AND any plain `.png` round-trip (writer re-minimizes type, ignoring `-type TrueColorAlpha`). Compositing color art over a gray dest smears the R channel into all channels (F56D90 → F5F5F5) on every opaque pixel. **Fix: write intermediates as `PNG32:file.png`.** Verify with: sample known-color pixel + count changed opaque pixels via two-image `-fx "(u.a>0.99 && Σ|u-v|>0.05)"` (must be 0).
**Companion trap:** the inverse applies to composite MASKS — a PNG32 mask carries an all-opaque alpha channel and IM7's 3-image `-composite` reads THAT as the mask (src applied everywhere, art washed out). Masks must be written `-alpha off` (grayscale PNG is correct for masks). Also `%[fx:mean]` on an RGBA mask averages alpha into the stat — check `%[channels]` says gray. Targeted recolors: fuzz-match the color family + rect-clip + exclusion rects, then masked `-modulate` (preserves shading, e.g. Switch bezel #33343C → #515158).
