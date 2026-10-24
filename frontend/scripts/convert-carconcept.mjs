// Konversi Khronos "Car Concept" (CC BY 4.0) ke GLB browser untuk Racing Gang.
// Pemakaian: node scripts/convert-carconcept.mjs <path/CarConcept.glb asli>
// Sumber: https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept
//
// Perubahan terhadap sumber (dicatat di LICENSES.md):
// - Varian material (KHR_materials_variants) dibuang; hanya cat default "Carmine" yang dipakai.
// - Logo Khronos/3D Commerce (merek dagang, dikecualikan dari CC BY) dihapus: tekstur yang memuatnya diganti warna polos.
// - Diputar agar depan menghadap -Z, pusat X/Z di 0, roda di Y=0, skala seragam ke panjang 4,5 m (CAR.l config).
// - Node di-flatten dan primitive digabung per material; geometri disederhanakan (meshopt), tekstur diperkecil ke ≤1024 px WebP, buffer dikompres EXT_meshopt_compression.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, prune, weld, simplify, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const SOURCE_URL = 'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/CarConcept/glTF-Binary/CarConcept.glb';
const TARGET_LENGTH = 4.5;
const input = resolve(process.argv[2] ?? 'CarConcept.glb');
const outDir = resolve('public/assets/carconcept');
const output = `${outDir}/CarConcept.glb`;

await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const sourceBytes = await readFile(input);
const doc = await io.readBinary(new Uint8Array(sourceBytes));
const root = doc.getRoot();

// 1. Buang varian material; material yang hanya dipakai varian ikut terhapus oleh prune().
for (const ext of root.listExtensionsUsed()) if (ext.extensionName === 'KHR_materials_variants') ext.dispose();

// 2. Hapus logo: tekstur base color material "License" (pelat + logo Khronos) dan "Tireside" (logo di dinding ban).
const solid = async (texture, rgb) => {
  const [width, height] = texture.getSize();
  texture.setImage(new Uint8Array(await sharp({ create: { width, height, channels: 3, background: rgb } }).png().toBuffer()));
  texture.setMimeType('image/png');
};
const logoTextures = new Map();
for (const material of root.listMaterials()) {
  const name = material.getName();
  const base = material.getBaseColorTexture();
  if (name === 'License' && base) logoTextures.set(base, { r: 12, g: 12, b: 14 });
  if (name === 'Tireside' && base) logoTextures.set(base, { r: 29, g: 29, b: 29 });
}
if (logoTextures.size !== 2) throw new Error(`Tekstur logo tidak ditemukan sesuai harapan (${logoTextures.size}/2); periksa versi sumber.`);
for (const [texture, rgb] of logoTextures) await solid(texture, rgb);

// 3. Orientasi, pusat, pivot tanah, skala.
const scene = root.getDefaultScene() ?? root.listScenes()[0];
const box = getBounds(scene);
const headlights = root.listNodes().find((n) => n.getName() === 'BodyHeadlights');
if (!headlights) throw new Error('Node BodyHeadlights tidak ada; tidak bisa menentukan arah depan.');
const front = getBounds(headlights);
const centerZ = (box.min[2] + box.max[2]) / 2;
const flip = (front.min[2] + front.max[2]) / 2 > centerZ; // depan di +Z → putar 180°
const scale = TARGET_LENGTH / (box.max[2] - box.min[2]);
const cx = (box.min[0] + box.max[0]) / 2;
const wrapper = doc.createNode('CarConcept')
  .setRotation(flip ? [0, 1, 0, 0] : [0, 0, 0, 1])
  .setScale([scale, scale, scale])
  .setTranslation(flip ? [scale * cx, -scale * box.min[1], scale * centerZ] : [-scale * cx, -scale * box.min[1], -scale * centerZ]);
for (const child of scene.listChildren()) { scene.removeChild(child); wrapper.addChild(child); }
scene.addChild(wrapper);

// 4. Optimasi untuk browser.
await doc.transform(
  prune(),
  dedup(),
  // Bake transform node lalu gabungkan primitive per material: ~250 draw call ? ~25 (penting untuk 60 fps di run).
  flatten(),
  join({ keepNamed: false }),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.4, error: 0.001 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

await mkdir(outDir, { recursive: true });
const outBytes = await io.writeBinary(doc);
await writeFile(output, outBytes);
const sha = (b) => createHash('sha256').update(b).digest('hex');
const after = getBounds(scene);
let triangles = 0;
for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) triangles += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
const manifest = {
  source: SOURCE_URL,
  sourceRepo: 'https://github.com/KhronosGroup/glTF-Sample-Assets/tree/main/Models/CarConcept',
  license: 'CC-BY-4.0 (Eric Chadwick, Darmstadt Graphics Group GmbH, 2024); Khronos/3D Commerce logos removed',
  sourceSha256: sha(sourceBytes),
  sourceBytes: sourceBytes.length,
  outputSha256: sha(outBytes),
  outputBytes: outBytes.length,
  triangles: Math.round(triangles),
  rotatedY180: flip,
  scale: Number(scale.toFixed(5)),
  boundsMeters: { min: after.min.map((v) => Number(v.toFixed(3))), max: after.max.map((v) => Number(v.toFixed(3))) },
};
await writeFile(`${outDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
const license = resolve(dirname(input), 'LICENSE.md');
await copyFile(license, `${outDir}/LICENSE.md`).catch(() => console.warn('LICENSE.md sumber tidak ada di samping GLB; salin manual.'));
console.log(JSON.stringify(manifest, null, 2));
