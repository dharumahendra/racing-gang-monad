# Racing Gang â€” Independent NFT Collectibles

This asset collection is separate from the playable Tier 1â€“4 cars. Collectible IDs 1â€“4 are catalogue IDs, not tier IDs and not minted token IDs. No contract address or minting flow has been configured.

| ID | Collectible | Included assets |
|---|---|---|
| 1 | Minecraft Minecart | Credited Sketchfab thumbnail and external 3D embed; original GLB pending download |
| 2 | SPPG Delivery Truck | Code-built model, embedded textures, GLB, 1024px PNG |
| 3 | Burger Car | Code-built model, embedded textures, GLB, 1024px PNG |
| 4 | SpongeBob Boatmobile | Credited Sketchfab thumbnail and external 3D embed; original GLB pending download |

Open `/collectibles/index.html` on the frontend server. This workbench is public and performs no wallet/backend operations. Local models can be rotated and downloaded; external previews load only after clicking the Sketchfab button. Metadata under `drafts/` uses relative asset paths and is explicitly marked as a draft, not a final token URI.

## Build / edit the assets

Run from `frontend/`, using the existing workspace dependencies:

```powershell
node scripts/collectibles/build.mjs
node scripts/collectibles/fetch-sources.mjs
node scripts/collectibles/export.mjs
node --import tsx scripts/collectibles/prepare.mjs
node --import tsx scripts/collectibles/verify.mjs
```

The exporter starts its own temporary localhost static server and uses installed Microsoft Edge to produce the actual PNG/GLB files. It does not require the development server, call Privy, make transactions, or perform visual QA. The generated viewer.js is a standalone bundle used only by this workbench; it is not imported by the racing application.

Source code: `src/nft/models.ts` (geometry/materials), `src/nft/viewer.ts` (decals, camera, lighting, preview/export), `src/nft/collection.ts` (catalogue and metadata).

## Prepare for public hosting

After choosing a permanent domain, run for example (replace the example domain):

```powershell
node --import tsx scripts/collectibles/prepare.mjs https://YOUR-PUBLIC-DOMAIN/collectibles/
```

This writes final absolute HTTPS URLs to `metadata/1.json` through `metadata/4.json`. It does not publish them or mint tokens. Proposed base URI is `https://YOUR-PUBLIC-DOMAIN/collectibles/metadata/`. Have Bayu verify it against the separate collection's tokenURI implementation. Existing `public/cars` metadata belongs to the tier contract and must not be replaced.

## Attribution

- **Simplified Minecraft Minecart** by **Vlad94077** â€” [source](https://sketchfab.com/3d-models/simplified-minecraft-minecart-e23fb7a1bfca43f881bb8140465873f7), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Image is the source's public preview thumbnail; it was re-encoded as PNG without modifying its composition. Original model is not bundled. No affiliation/endorsement is implied.
- **Spongebob Boatmobile | #SketchfabWeeklyChallenge** by **TheoClarke** â€” [source](https://sketchfab.com/3d-models/spongebob-boatmobile-sketchfabweeklychallenge-abdca2ced413486b9c943111621d6f39), [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Image is the source's public preview thumbnail; it was re-encoded as PNG without modifying its composition. Original model is not bundled. No affiliation/endorsement is implied.
- **SPPG Delivery Truck** and **Burger Car** are procedural interpretations built in Three.js from the references provided by the user on 2026-10-24. They are not the original manufacturer/artist 3D files. Reference branding/characters are not claimed as original Racing Gang intellectual property. The SPPG badge is a simplified text badge, not an official Garuda/BGN seal.

Source metadata is in `sources.json`. Exported file sizes and SHA-256 checksums are in `manifest.json`.

## Obtain the missing originals

Open the linked Sketchfab source pages, sign in, choose **Download 3D Model**, and use the provided glTF/GLB download. Keep accompanying textures and attribution. The official download API returned 401 without authentication. No private viewer files were extracted. Once downloaded, add originals under `models/`, extend the catalogue local-model mapping/loader, regenerate metadata and update the manifest. The current exporter deliberately exports only the two procedural models.
