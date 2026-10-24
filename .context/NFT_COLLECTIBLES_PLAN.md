# NFT Collectibles Implementation Plan

> **For agentic workers:** Use executing-plans inline. No subagents; visual review belongs to the user.

**Goal:** Prepare four NFT-only vehicles without changing playable Tier 1Ã¢â‚¬â€œ4.

**Architecture:** An independent catalogue and Three.js asset builder produce two original procedural interpretations and two credited Sketchfab preview entries. A static asset workbench lives under public/collectibles, outside gameplay, login, purchases and the existing cars metadata. Export portable GLB/PNG files and ERC-721 metadata separately from the existing deployed contract.

**Tech Stack:** Existing Three.js, Vite, TypeScript, Vitest and Playwright (asset export only).

## Global Constraints

- Requested order: Minecraft minecart; white SPPG box truck; burger car; SpongeBob boatmobile.
- These vehicles do not replace or extend game tiers, stats, ownership or purchase rules.
- Existing CarNFT only supports tiers 1Ã¢â‚¬â€œ4. Bayu must design/deploy a separate collection before minting these assets. No contract changes, wallet operations, minting or deployment are authorized by this asset task.
- Preview is public. It never declares a user owns an NFT and never enables minting.
- Sketchfab API confirms both sources downloadable, CC BY 4.0, but archive download returns HTTP 401. Do not scrape viewer internals. Preserve names, authors, source URLs and attribution; use external embeds while local model files are missing.
- References for SPPG/burger supplied by user on 2026-10-24. Procedural interpretations are not the original photographed/rendered 3D models. Do not claim official affiliation or ownership of reference branding.
- Existing untracked frontend/scripts/test-cam.mjs and test-results/ are outside scope.
- Remote inspected: main advanced to 84b6d6c, current raka/foundation db4d9d5 remains synchronized with its remote. No merge requested; all implementation files are new.

## Tasks

- [x] 1. Catalogue and metadata: stable independent collectible IDs, source/attribution, HTTPS metadata builder. Test URLs and tier independence.
- [x] 2. Code-built SPPG and burger models, static preview workbench, GLB/PNG export. Validate geometry and generated assets, not visual appearance.
- [x] 3. Fetch credited Sketchfab thumbnails; generate drafts and hosting-preparation command; document remaining originals/contract/domain requirements.

## Verification ledger

- Initial: baseline git clean except the two existing untracked paths above.
- Catalogue tests: witnessed RED (missing modules), then GREEN, 5/5 tests.
- Frontend typecheck: PASS.
- Export: SPPG GLB 318,028 bytes; burger GLB 662,900 bytes; both PNG artworks 1024x1024.
- Export verification: four PNG/draft pairs and two GLBs validated through NodeIO, finite accessors and SHA-256 manifest. Two original Sketchfab GLBs remain a user-download dependency.
- Self-review: all changes are new asset/workbench files. No application routes, tier config, existing metadata, contracts, auth or purchases changed.
- Ruling: keep work in the existing user workspace/branch, as requested throughout this task; do not create another checkout while submission migration is in progress.
- Ruling: the standalone preview uses neutral existing Racing Gang branding and real asset data. No design direction exercise or visual QA: the user explicitly reserves visual verification. Automated browser use is only the asset export pipeline.
- Frontend production build: PASS (exit 0). Standalone asset preview responds HTTP 200.
- No visual browser QA, contracts, minting, publishing, commits or pushes performed.
