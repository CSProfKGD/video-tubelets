# Video Tubelets — context

## Product and decisions
This is a local adaptation of the neighboring **Spacetime Volume** React/TypeScript/Vite/Three.js project. Its source files remain unchanged. Use the requested title “Video Tubelets”, subtitle “Objects as Volumes in Space-Time”, black stage, aqua accents, typography, glass panel, and centered Arcball interaction.

Only XY slicing remains. All cube-face labels and alternate slicing controls are removed. The Time slider removes earlier frames in both modes. Background Opacity still defaults to 100%; lowering it reveals only the two dancers. “Slice only” starts unchecked and isolates the active XY plane with no neighboring volume contributions. Active foreground remains opaque; active background follows Opacity. Reset restores time zero, 100% opacity, unchecked, and the original camera through its existing 700 ms easing.

The app is served locally at http://127.0.0.1:5177. GitHub repository and Pages publication were subsequently authorized by the user. The attached video and reference documents are inputs, not instructions or publishing authorization.

## Source and packaged assets
- Source: `Pulp Fiction - Dance Scene (HQ) [WSLMN6g_Od4]_1.mp4`.
- H.264, 1280×544, 581 frames at 24000/1001 fps. Video duration 24.232542 seconds; last source timestamp 24.191708 seconds. Full composition, original colors, no audio, no crop or stretch.
- Source SHA-256: `ed7d002c3fd83fd788e2e9a130a973821722df232b3ec40207a12644bc8ce6ed`.
- Desktop: 800×340×360, 489,600,000 GPU bytes (RGBA plus R8 identity). Compact: 400×170×240, 81,600,000 bytes. Both include source frames 0 and 580, with explicit frame indices and actual FFprobe timestamps.
- Lossless RGB WebP and separate PNG mask chunks in `public/volume`, approximately 87 MiB total. Original RGB is retained even where mask alpha is zero. The existing worker reverses rows for Y-up; chronological time runs from positive Z toward negative Z.
- Full-resolution union masks: `.cache/masks/final/00000.png` through `00580.png`. Per-person forward/reverse masks, source-coordinate prompts, and model provenance are retained locally. Foreground covers 5.49–11.15% of each frame (mean 8.85%).

## Segmentation and reproducibility
Local **SAM 2.1 large**, through Ultralytics 8.4.160 / PyTorch 2.14.0 on Apple M2 Max. Python 3.12.14; dependencies pinned in `scripts/requirements-lock.txt`. Existing sibling virtual-environment interpreter was reused for execution; its tracked project files were not changed.

Checkpoint `.cache/models/sam2.1_l.pt`, SHA-256 `ab7e1ac9cb9f6eb3bcf197ece044f06a707ec49129361a2b47e93e1db6989efd`. Official checkpoint URL is in README.md. Object 0 is the woman; object 1 is the man. Positive/negative point prompts and corrections are in `scripts/dancer-prompts.json`. Spectators and floor shadows are excluded.

Both tracking directions cover all 581 frames. A reverse-pass correction at source frame 578 prevented a lost track. An initial concurrent Metal error interrupted the first forward run after frame 284; its masks were preserved. The remaining forward pass resumed from a saved two-instance mask at source frame 280, with overlap. Run GPU tracking passes sequentially. Progress provenance is saved every 20 frames so interrupted runs remain auditable.

Final selection is explicit in `scripts/mask-selection.json`: forward masks for 0–284 preserve the woman's dark trouser/ankle boundaries in early directional disagreements; reverse masks for 285–580 retain clean later overlap/raised-arm poses. The boundary between passes was reviewed; motion-compensated IoU at frame 285 is 0.958, consistent with neighboring frames. There is no temporal averaging, dilation, or ghost-mask union between time steps. The two identities are unioned only within the same frame. Area downsampling preserves boundary coverage and exactly opaque interiors.

Reproduction after checkpoint/dependency installation:

```sh
python scripts/segment_dancers.py --source '/path/to/source.mp4'
ffmpeg -i '/path/to/source.mp4' -vf reverse -an -c:v ffv1 .cache/reverse.mkv
python scripts/segment_dancers.py --source .cache/reverse.mkv --reverse
python scripts/compare_masks.py --source '/path/to/source.mp4'
python scripts/select_masks.py
python scripts/temporal_audit.py --source '/path/to/source.mp4'
python scripts/package_dancers.py --source '/path/to/source.mp4'
```

For the actual interrupted run, a lossless FFV1 tail beginning at frame 280 was generated with `trim=start_frame=280,setpts=PTS-STARTPTS`; tracking resumed using `--source .cache/tail-280.mkv --start 280 --seed .cache/masks/forward`. A fresh complete run does not require this recovery step.

## Instance colors and control design
“Instances” defaults off and resets off. Woman: aqua `#63e6de`; man: warm coral `#ff9f7a`. Mask interiors remain opaque regardless of background Opacity. Slice-only mode isolates the active plane. Turning colors off restores original RGB without any reprocessing.

Full-resolution identity maps are saved beside the union masks as `NNNNN-instances.png`: 0 background, 128 woman, 255 man (man wins any within-frame overlap). Separate lossless identity chunks are area-downsampled and uploaded as a linear-filtered R8 texture, aligned with the existing RGBA texture. Dividing sampled identity by union coverage preserves palette at silhouette boundaries. Interpolated identity mixes continuously between the two palettes across fractional frames. GPU tests compare both opaque palette colors at first/middle/last samples; measured maximum error is zero.

The glass controls retain the original layout language, with a restrained gradient, fine border without a control divider, compact custom aqua checkboxes, crisp muted labels, and a subtle pill Reset. Native checkbox semantics and keyboard focus remain intact. Desktop, 390×844 mobile, and 600×510 Retina screenshots were visually reviewed after changes; controls are aligned, legible, and clear of the volume.

## Rendering and interaction
The original loader and ray marcher are reused for the full volume. The internal `emphasizeSlice` field now means **Slice only**, replacing the earlier Gaussian emphasis behavior at the user's request. This mode uses a single ray/XY-plane intersection and switches immediately, so no neighbors remain visible while the checkbox is selected. Fractional slider coordinates and texture interpolation preserve continuous scrubbing; keyboard stepping and endpoints remain unchanged.

Colored silhouettes use pure instance palette colors all the way to the boundary, without mixing source background RGB into partially covered pixels. Raw mask coverage retains antialiased edges. Full colored volumes use fixed half-voxel integration steps regardless of interaction quality, and keep framebuffer resolution steady during gestures. Multisample antialiasing is enabled. The cool-gray box outline opacity is 0.48 and aqua active-plane opacity 0.70, retaining depth testing.

The fixed camera position `(4, 2.55, 4.93)`, original orientation, centered pivot, and zoom behavior are preserved. A projection-only initial-framing fit accommodates the wider 1280:544 source and maintains clearance from the title and control panel. It evaluates the original pose, so slicing and orbiting never trigger camera recentering. Existing render-on-demand, interactive resolution, sample-count reduction, and settled Retina rendering are retained.

## Verification and limits
- Type checking, 12 numerical tests, and production build pass. Browser checks cover XY-only controls, opacity states, mouse/keyboard/touch scrubbing, rapid direction reversals, reset easing/interruption, fixed orbit pivot, reduced motion, enlarged text, desktop/mobile and 600×510 Retina layouts.
- All 600 packaged union-mask and identity-map slices exactly match independently resized full-resolution masks. GPU XY samples at source frames 0, 291 and 580 match independent FFmpeg decoding with maximum RGB error 0.
- Nine unchecked shader comparisons (three cuts × three opacities) are pixel-identical to the original shader. The original .9998-versus-1 opacity check differs by at most one 8-bit channel level.
- Fractional-time tests cross half-frame boundaries at four positions and three background opacities. Volume-only comparisons isolate temporal continuity from ordinary one-pixel wireframe rasterization changes. Browser recordings and screenshots are retained in `.qa`.
- All 581 masked-frame thumbnails were visually inspected, with source-resolution comparisons for difficult motion/overlap frames and directional disagreements. A complete H.264 overlay review is saved as `exports/dancer-mask-review.mp4`.
- Forward/reverse mean mask IoU is 0.9805 for the woman and 0.9840 for the man. Full-sequence motion-compensated union-mask IoU averages 0.9449; the lowest is 0.8948. These are consistency measurements, not annotated accuracy scores.
- Fine hair, motion-blurred fingers/feet, and very small gaps can retain boundary errors. No manual ground-truth precision/recall benchmark was created. Dense overlapping trajectories are inherent in a spacetime volume; slice-only mode removes overlapping trajectories without changing the masks.
- Browser performance was approximately 60 fps during the tested local orbit sequence; this is a local headless-Chrome measurement, not a guarantee on other hardware. Mobile was emulated, not tested on a physical phone.

Latest revision checks: the full browser suite passes with no console errors. At 0% background opacity, colored-volume renders at 240 and 640 requested ray steps are pixel-identical because identity sampling now uses a fixed half-voxel grid. Desktop/mobile controls, stronger bounds, and the isolated XY plane were visually inspected.

QA details: `.qa/browser-report.json`, `.qa/shader-checks.json`, `.qa/asset-audit.json`, `.qa/directional-agreement.json`, `.qa/temporal-audit.json`, `.qa/all-frames-*.jpg`, `.qa/boundary-*.png`. Checkpoints, caches, QA outputs and local review exports are ignored by git.

## Latest outline, mask, and panel refinement
The panel now prioritizes Time and Opacity above a single secondary row: Slice only / Instances left, Reset right. Vertical padding is 12px with 16px between the opacity control and the bottom row; no divider. Functional handlers and slider alignment are unchanged.

Volume and slice outlines now use screen-space triangle strokes with a one-pixel analytical alpha fringe, avoiding hardware hairline aliasing and alpha-to-coverage quantization. Interaction resolution no longer drops below native resolution on standard displays.

Reviewed all 43 disconnected source-mask components. Larger detached areas correspond to motion-blurred hands and are preserved. Conservative cleanup removes components <=32 source pixels only when farther than 20px from the main person: 22 specks / 60 pixels across 6 frames. Both union and identity assets were repackaged without re-encoding RGB. All 600 union masks and 600 identity maps pass exact source-resize comparisons. Cleanup rules and per-component provenance are in `scripts/clean_masks.py` and the manifest processing record. No temporal averaging or erosion was used.

## Scrubbing outline resolution fix
Removed the remaining Retina framebuffer reduction from 2× to 1.5× during gestures. Both outline strokes now keep the same native framebuffer coverage while dragging and after release; volume ray-step adaptation remains. A targeted actual-pointer regression checks three slider positions at DPR 1 and DPR 2, comparing isolated outline screenshots before and after release.

## Transparent-background depth correction
The faint background previously wrote occluding depth once accumulated alpha crossed 2%, producing rectangular gaps in the bounding outline. Depth now follows foreground coverage alone; background remains a color contribution. Removed the unconditional opaque return so depth stays consistent at the 100% endpoint too. Foreground still occludes rear edges. Twelve GPU comparisons (six opacity values from 0 to 1 in each of full-volume and slice-only modes) show identical outline visibility. Visually inspected the reproduced 1% and 3% opacity views. Original RGB comparisons now isolate the volume from this intentional outline-depth correction.

## Zero-opacity reverse-scrubbing correction
Reproduced abrupt RGB sample changes at half-frame boundaries (maximum channel jumps 205–246 for tiny time changes) and interaction-quality differences up to 43. All modes now use continuous active-time coordinates and fractional slider values. The volume integration grid uses fixed half-voxel spacing anchored to the uncut box; clipping changes only partial cells at the cut. Removed the unconditional opaque interior step that depended on sample spacing. No source-mask temporal averaging was added. After correction, boundary comparisons change by at most one channel level; interaction quality and forward/reverse arrival at the same time produce identical pixels. Captured reverse-sequence screenshots and recording in `.qa`; keyboard stepping and exact endpoints remain. This supersedes older documentation about adaptive ray counts and pixel equivalence of translucent RGB integration. Opaque RGB slices remain exact.

## Satin instance lighting
Added color-only lighting to instance volume surfaces: upper-left directional key, gentle fill, broad low-intensity specular and restrained rim contribution. Normals use central mask differences at a three-voxel footprint, scaled for world dimensions and reversed time orientation. Opacity, foreground masks, depth and integration positions remain unchanged. The active cut blends to the unlit palette over two temporal voxels, and Slice only is completely unlit. Original RGB bypasses lighting. Visual review includes original and orbited views, plus reverse scrubbing. `tests/instance-satin.mjs` compares lighting on/off to verify visible volume shading and pixel-identical slice-only/RGB output. No additional controls or GPU assets were introduced.

## Checkbox easing
Both mode checkboxes now crossfade over 240ms with smoothstep easing. A temporary presentation canvas captures the prior rendered appearance; the target renderer uses its exact final mode throughout. Rapid retoggles compose the currently visible result as their new starting image, avoiding jumps. The overlay is removed when settled and adds no ongoing render loop. Reduced motion bypasses the effect. Slice-only therefore isolates the active plane after the brief transition; its shader and segmentation behavior remain unchanged. Tests exercise monotonic fade, interruption, single-overlay cleanup and reduced motion.

## Local teaser deliverable
Created `exports/video-tubelets-teaser.mp4`: 32 seconds, 1920×1080, 30 fps / 960 frames, H.264 yuv420p + stereo AAC 48 kHz, approximately 11 MB, fast-start enabled. No controls, title, captions or end card. Original full-resolution RGB frames and same-frame masks drive the first section; the existing GPU volume drives the ending. The camera pulls back, background dissolves, dancers play through the clip, then reverse in 1.35 seconds. Audio reverses the original song along precisely the same smoothstep time curve (rate-dependent antialias filtering, no synthetic rewind sound), then resumes normally from the start beneath the final reveal. The full volume crossfades in, orbits into three-quarter view and eases into satin colors.

All 960 output-frame bounds were checked: zero cropping whenever the outline is visible. Outline appearance waits until the whole box is inside the picture; the final orbit maintains at least a 60px target margin. The original full-screen opening keeps its source aspect ratio and letterboxing. FFmpeg decoded the complete final file without errors; both audio and video durations are exactly 32 seconds. Four 16-image contact sheets and full-resolution key frames were visually reviewed. Export hash, source hash, timeline and checks are in `exports/video-tubelets-teaser.json`. No source media or app UI changes; nothing uploaded or published.

## Teaser revision 2
Strengthened the middle orbit to 23° yaw / 8° pitch and delayed the satin-color crossfade to 28.15–29.35s. The rewind now progressively uncovers retained frames behind the backward-moving cut, building the complete RGB volume during 24.233–25.583s; a 240ms mode crossfade starts with rewind. There is no all-at-once reveal afterward. The complete RGB volume remains visible for about 2.57s before color begins. Duration remains 32s and the synchronized source-only soundtrack is unchanged. Version 1 is preserved as `exports/video-tubelets-teaser-v1.mp4`. Visually inspected the revised encoded overview and a 6fps rewind sequence; full FFmpeg decode passes, and all 960 bounds checks report zero cropping. Changes are isolated to the export director; the app is unchanged.

## Teaser revision 3: opening identity overlay
Added a source-resolution identity texture to the export-only slice shader. Aqua/coral colors blend in linear light at up to 55%, with union coverage normalizing identity samples at silhouette edges. The overlay eases in at 1.55–2.5s, holds until 3s, and fades out with the exact background envelope through 7.1s. No outlines are added. Original dancer detail remains visible beneath the color, and the final satin volume keeps its full colors. Preserved revision 2 as `exports/video-tubelets-teaser-v2.mp4`. Visually reviewed the encoded opening at 2fps and a full-resolution overlay frame. Complete FFmpeg decode succeeds; both streams remain 32s, all 960 bounds checks pass. Source audio, progressive rewind and main app are unchanged.

## Teaser revision 4: continuous camera fitting
Removed the export camera’s iterative 0.5% distance increments, which caused visible framing pulses as orbit constraints changed. Perspective-fit requirements are now solved analytically for all box corners and combined with the desired radius using a log-sum-exp smooth maximum (softness 0.035 world units). Quintic camera easing supplies continuous acceleration at transition endpoints. The fit blends in smoothly at 5.7–7.6s. Export is now 60fps / 1920 frames; original 24fps footage and synchronized rewind audio retain their timing. `tests/teaser-motion.py` verifies all frames, >=60px post-pullback margins and ending corner acceleration: maximum second difference 0.03285 pixels/frame², with zero cropped visible bounds. Full FFmpeg decode passes. Visually reviewed encoded overview and ending frames at 3fps. Revision 3 is retained as `exports/video-tubelets-teaser-v3.mp4`. No interactive-app changes.

## Higher-detail segmentation refinement
Reprocessed all 581 frames with SAM 2.1 large using a 680×544 analysis crop at x=320, y=0, giving the dancers more of the 1024px model input. Masks are restored to the full 1280×544 canvas; RGB, timestamps and published tier dimensions are unchanged. The 15-second trouser bulge was a dark background fixture merging into the woman's hip. Added source-coordinate negative prompts through that movement and tracked the correction over frames 330–420. The corrective model sometimes damaged motion-blurred knee detail, so only its reviewed hip rectangle [400,245,500,340] is applied to object 0; all other regions retain the improved full tracking pass. No temporal blending or silhouette averaging.

Full tracking completed in about 518 seconds. The local corrective run hit an MPS command-buffer error after saving frame 397; resumed from saved frame 390 and completed through 420. Actual run parameters, prompts, checkpoint hash and analysis-video hashes are in the final mask provenance and packaged manifest. Base and local prompt JSONs are separate for reproducibility. Historical masks remain in `.cache/masks/final-before-refinement`.

Conservative cleanup also fills enclosed holes <=12 pixels only if their median original RGB differs from the surrounding foreground rim by <=18 RGB units: 72 holes / 235 source pixels. Bright true background gaps remain unfilled. Existing detached-speck filtering removed three tiny components. All 581 masks pass composition, coverage, identity and reviewed hip-region checks. All 600 packaged union masks and 600 identity maps match independently resized source masks. Reviewed every-frame cutout atlases, source-resolution boundary comparisons, the pants correction, and low motion-agreement frames; refreshed `exports/dancer-mask-review.mp4`.

Motion-compensated mean IoU is 0.9420 versus 0.9449 previously; this is a consistency proxy, not an accuracy score. Reviewed the low-scoring pairs against source footage; fast feet/hands and motion blur remain difficult. The visible fixture leak and cuff boundaries improve, but these masks are not manually annotated ground truth and fine boundary errors can remain.

Reproduction additions (run GPU passes sequentially):
```sh
ffmpeg -i '/path/to/source.mp4' -vf 'crop=680:544:320:0' -an -c:v ffv1 .cache/refinement-crop.mkv
python scripts/segment_dancers.py --source .cache/refinement-crop.mkv --crop 320 0 680 544 --prompts scripts/dancer-refinement-base-prompts.json --output .cache/masks/refined-forward
ffmpeg -i .cache/refinement-crop.mkv -vf 'trim=start_frame=330:end_frame=421,setpts=PTS-STARTPTS' -an -c:v ffv1 .cache/refinement-hip.mkv
python scripts/segment_dancers.py --source .cache/refinement-hip.mkv --crop 320 0 680 544 --start 330 --seed .cache/masks/refined-forward --prompts scripts/dancer-refinement-prompts.json --output .cache/masks/refined-hip --limit 91
python scripts/select_masks.py
python scripts/package_instances.py
```

## Short teaser direction
The authorized short version is 18 seconds, 1080p60. It uses source frames 0–215 (0–8.9673s) at original playback speed, with the matching contiguous GPU volume. Masks appear early, the background disappears by 4.4s, rewind begins at 8.9673s and reveals the excerpt's volume over 1.8s. Colors ease in at 12.15–13.15s. The camera returns to the original front-facing footage over 15–18s; geometry and source frame meet the opening exactly. Audio is exclusively the source song: matching forward excerpt, synchronized backward curve, then forward music with a 200ms fade to silence before the original audio restarts. The full-song version remains a separate deliverable with refreshed masks.

## Final refinement and short-export validation
A final source-resolution check found one remaining local-correction leak at frame 386. The full cropped tracking pass follows the hip correctly there, so selection explicitly restores that prediction within the same hip rectangle. Regression checks cover both frames 360 and 386. The short excerpt ends at 383 and is unaffected; the full video and app assets were refreshed.

The final short contains 1080 frames at 60fps. No visible bounding box is cropped. The return camera decays a fixed settled fit offset to avoid changes in the fitting constraint during its dolly; maximum projected-corner second difference is 0.21225 pixels/frame². The rendered 18-second endpoint is pixel-identical to the opening; the last encoded frame approaches it within 0.0022px at the corners. Visually reviewed the encoded overview and 3fps return sequence. Browser suite passes without errors at approximately 60fps.

Final checks pass: TypeScript, all 12 numerical tests, both mask-cleanup tests, all 581 refined-mask regressions, production build, browser suite, exact 600 union + 600 identity packaging comparisons, and first/middle/last GPU RGB comparisons (max error 0). RGB and instance reverse-scrub regressions return identical pixels at matching forward/reverse times, with no interaction-quality difference. Full teaser: 1920 frames, zero cropped visible bounds, >=60px post-pullback margin. Both final MP4s decode completely. Export JSON sidecars contain current hashes and validation metadata.

## Original-opening correction
The short now begins at source frame 0 and audio sample 0, using frames 0–215 instead of the later excerpt. Duration and reveal choreography remain 18 seconds. Rewind returns to the original opening frame; the loop camera meets that frame exactly. Because no audio exists before source time zero, the final 200ms now eases to silence instead of reading negative waveform indices. The next loop starts with the untouched original opening audio.

## Steadier orbit pacing
Both teaser versions now use an integrated smoothstep velocity profile for their two outward orbit phases: ease up over the first 20%, maintain constant angular speed through the middle 60%, then ease down over the last 20%. This removes the previous quintic position curve’s mid-orbit speed surge. The ending dolly uses the same profile; the short return remains its established smooth loop motion. Opening audio was checked against the original first second (maximum difference one PCM quantization unit). `tests/teaser-orbit.py` checks steady angular velocity in both phases.

Corrected exports pass the orbit plateau audit in both phases, complete decoding and every-frame uncropped-bounds checks. Short loop endpoints remain pixel-identical, and its opening-source-index regression passes. Full ending corner second difference is 0.05456 pixels/frame². Visually inspected the corrected short timeline and both encoded ending-orbit sequences. Sidecars refreshed with current hashes.

## Polished 15-second editorial cut
The current short now uses original frames 0–132 at native speed. It opens on the original first frame and audio, reveals isolated dancers by 3.05s, then builds the volume during a 1.8s rewind beginning at 5.5055s. The complete RGB volume gets approximately 2.1 seconds before satin colors begin at 9.4s; colors settle at 10.3s. The final orbit settles at 11.6s and the visual loop returns over 12–15s. Kept the three-second smooth return to avoid rushing the camera. Both outward orbit phases retain steady middle angular speed. Export-only bounds opacity increases from .48 to .64, with the active outline .82, for better small-screen legibility. Full-song export and interactive app remain unchanged. Prior 18-second version is preserved as `exports/video-tubelets-teaser-short-18s.mp4`.

The 15-second cut was visually reviewed from encoded overview and 4fps reveal frames. All 900 frames pass visible-bounds checks; post-pullback margin remains >=60px. Both orbit velocity plateaus pass, exact visual loop endpoints match, and there are no browser errors. Complete MP4 decode passes; sidecar metadata and hash refreshed.

## GitHub repository and Pages publication
The user authorized a GitHub repository and hosted web interface. Target: `CSProfKGD/video-tubelets`, with `https://CSProfKGD.github.io/video-tubelets/` as the live interface. Added a Pages Actions workflow, public README, real-interface preview and Open Graph metadata. Browser scripts now use the declared Playwright dependency instead of a private machine path; Node 24 and pnpm 11.25 are pinned. Kept raw video, audio, checkpoints, full-resolution masks and teaser exports outside git. Packaged volume chunks are included so the demo runs immediately.

Local production verification under `/video-tubelets/` passes on desktop and touch/mobile: assets load without HTTP or browser errors, both modes and sliders work, Reset restores defaults, and the panel fits each viewport. Visually inspected both layouts. Typecheck, 12 numerical tests and production build pass.

## Instance background color leak
A user screenshot showed background speckles with Instances + Slice only and 100% opacity around 14.1s. The shader replaced the entire RGB sample whenever mask coverage was greater than zero, amplifying even one quantization level of foreground coverage into a full palette color. A controlled GPU probe reproduced this: coverage 1/255 at 50% opacity returned solid coral instead of the background. `sampleAt` now blends the palette by the foreground share of total opacity; satin lighting uses the same share. At zero background opacity the foreground palette is preserved, while opaque backgrounds retain RGB proportionally to coverage. No masks, depth or sampling positions changed. GPU regression covers empty, tiny, partial and full coverage across opacity endpoints; reverse-scrub, satin, typecheck, numerical tests and production build pass. Visually inspected the matching 14.1s settings. The cause of tiny background values on the user's specific browser has not been established; rendering no longer amplifies them.

## Zero-opacity haze: exact semantic transport
The follow-up screenshot showed faint mask values accumulating into a colored fog across the full volume. The original image loader decoded mask and identity PNGs through canvas readback, a path that can be perturbed independently of the source data. Replaced that semantic-data path with gzip-compressed uint8 buffers, verified against SHA-256 and expected dimensions before GPU upload. The files use `.bin` to avoid HTTP servers transparently decoding `.gz` and causing double decompression. Display RGB still uses the image path; no segmentation thresholds, temporal averaging or erosion were added. PNGs remain as independently audited review artifacts.

A regression injects one-bit canvas readback perturbations into the worker and verifies the complete desktop alpha and identity texture hashes against the source bytes. All bytes match, including exact-zero background. Asset audit passes all 600 masks and 600 identity frames, binary/PNG equivalence and hashes. Instance background probes, reverse scrubbing, 12 numerical tests, typecheck and production build pass. The user's exact browser-level origin of the perturbation is not established; this removes canvas readback as a possible source of semantic noise.
