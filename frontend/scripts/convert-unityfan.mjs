// Konversi mobil Unity Fan "FREE Concept Car" (CC0 menurut penulis) ke GLB browser.
// Pemakaian: node scripts/convert-unityfan.mjs <folder berisi UF002.glb, UF001.glb, ... dan UFxxx.license.json>
// Model diunduh dari Sketchfab lewat API resmi dengan akun pemilik proyek; berkas .license.json menyimpan
// salinan deskripsi penulis ("public domain (CC0) ... No attribution required") sebagai bukti lisensi.
//
// Perubahan terhadap sumber: arah depan ke -Z, pusat X/Z di 0, roda di Y=0, skala seragam ke panjang 4,5 m
// (CAR.l config), node di-flatten, primitive digabung per material, geometri disederhanakan meshopt,
// tekstur ≤1024 px WebP, kompresi EXT_meshopt_compression.
import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, flatten, join, prune, weld, simplify, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const TARGET_LENGTH = 4.5;
const TARGET_TRIANGLES = 90_000;
// `front`: sumbu tempat bagian depan mobil berada pada file sumber; verified dari posisi lampu
// (headlightCovers/taillights) dan render showroom.
const MODELS = [
  { id: 'UF002', front: '+z' }, // taillights di z = -1,76
  { id: 'UF001', front: '+z' }, // tanpa material lampu bernama; arah verified dari render showroom (lampu belakang merah di kaca belakang)
  { id: 'UF033', front: '+z' }, // headlightCovers di z = +0,05 (ujung +Z)
  { id: 'UF037', front: '-z' }, // headlightCovers di z = -3,84 (ujung -Z)
];

const source = resolve(process.argv[2] ?? '.');
const outDir = resolve('public/assets/unityfan');
await mkdir(outDir, { recursive: true });
await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const sha = (b) => createHash('sha256').update(b).digest('hex');
const triangles = (root) => {
  let n = 0;
  for (const mesh of root.listMeshes()) for (const p of mesh.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  return Math.round(n);
};
const only = process.argv.slice(3);
const inventory = [];

for (const spec of MODELS.filter((m) => !only.length || only.includes(m.id))) {
  const license = JSON.parse((await readFile(`${source}/${spec.id}.license.json`, 'utf8')).replace(/^\uFEFF/, ''));
  if (!/public domain \(CC0\)/i.test(license.description)) throw new Error(`${spec.id}: deskripsi tidak menyatakan CC0`);
  const sourceBytes = await readFile(`${source}/${spec.id}.glb`);
  const doc = await io.readBinary(new Uint8Array(sourceBytes));
  const root = doc.getRoot();
  const sourceTriangles = triangles(root);

  const scene = root.getDefaultScene() ?? root.listScenes()[0];
  const box = getBounds(scene);
  const flip = spec.front === '+z';
  const scale = TARGET_LENGTH / (box.max[2] - box.min[2]);
  const cx = (box.min[0] + box.max[0]) / 2;
  const cz = (box.min[2] + box.max[2]) / 2;
  const wrapper = doc.createNode(spec.id)
    .setRotation(flip ? [0, 1, 0, 0] : [0, 0, 0, 1])
    .setScale([scale, scale, scale])
    .setTranslation(flip ? [scale * cx, -scale * box.min[1], scale * cz] : [-scale * cx, -scale * box.min[1], -scale * cz]);
  for (const child of scene.listChildren()) { scene.removeChild(child); wrapper.addChild(child); }
  scene.addChild(wrapper);

  const ratio = Math.min(1, TARGET_TRIANGLES / sourceTriangles);
  await doc.transform(
    prune(),
    dedup(),
    flatten(),
    join({ keepNamed: false }),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );

  const outBytes = await io.writeBinary(doc);
  await writeFile(`${outDir}/${spec.id}.glb`, outBytes);
  await copyFile(`${source}/${spec.id}.license.json`, `${outDir}/${spec.id}.license.json`);
  const after = getBounds(scene);
  inventory.push({
    id: spec.id, name: license.name.trim(), source: license.url, author: license.author,
    license: 'CC0-1.0 (pernyataan penulis di deskripsi; label Sketchfab: ' + license.sketchfabLicenseLabel + ')',
    sourceSha256: sha(sourceBytes), sourceBytes: sourceBytes.length, sourceTriangles,
    outputSha256: sha(outBytes), outputBytes: outBytes.length, triangles: triangles(root),
    rotatedY180: flip, scale: Number(scale.toFixed(5)),
    boundsMeters: { min: after.min.map((v) => Number(v.toFixed(3))), max: after.max.map((v) => Number(v.toFixed(3))) },
  });
  console.log(spec.id, `${sourceTriangles} → ${triangles(root)} tri`, `${(outBytes.length / 1048576).toFixed(2)} MB`);
}

const manifestPath = `${outDir}/manifest.json`;
const previous = only.length ? JSON.parse(await readFile(manifestPath, 'utf8').catch(() => '{"models":[]}')).models : [];
const models = [...previous.filter((m) => !inventory.some((n) => n.id === m.id)), ...inventory].sort((a, b) => a.id.localeCompare(b.id));
await writeFile(manifestPath, `${JSON.stringify({ provider: 'Sketchfab / unityfan777', retrieved: '2026-10-22', models }, null, 2)}\n`);
