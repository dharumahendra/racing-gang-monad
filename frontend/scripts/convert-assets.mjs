import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Box3, MeshStandardMaterial } from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
// GLTFExporter uses FileReader for its binary buffer; Node supplies Blob, not FileReader.
globalThis.FileReader = class {
  readAsArrayBuffer(blob) { blob.arrayBuffer().then(result => { this.result = result; this.onloadend?.(); }); }
  readAsDataURL(blob) { blob.arrayBuffer().then(result => { this.result = `data:${blob.type};base64,${Buffer.from(result).toString('base64')}`; this.onloadend?.(); }); }
};
const source = resolve(process.argv[2] || '../assets');
const destination = resolve('public/assets/quaternius');
await mkdir(destination, { recursive: true });
const inventory = [];
for (const name of ['NormalCar1', 'NormalCar2', 'SUV', 'SportsCar', 'SportsCar2', 'Taxi', 'Cop']) {
  const obj = await readFile(`${source}/${name}.obj`, 'utf8');
  const mtl = await readFile(`${source}/${name}.mtl`, 'utf8');
  const materials = new MTLLoader().parse(mtl, ''); materials.preload();
  const group = new OBJLoader().setMaterials(materials).parse(obj);
  let frontZ = 0; let frontCount = 0;
  group.traverse(mesh => {
    if (!mesh.isMesh) return;
    mesh.castShadow = true; mesh.receiveShadow = true;
    const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const newer = old.map(mat => new MeshStandardMaterial({ name: mat.name, color: mat.color, roughness: .82, metalness: .03, flatShading: true }));
    const p = mesh.geometry.attributes.position;
    for (const part of mesh.geometry.groups) {
      if (/headlights/i.test(old[part.materialIndex]?.name || '')) {
        for (let i = part.start; i < part.start + part.count; i++) { const ix = mesh.geometry.index ? mesh.geometry.index.getX(i) : i; frontZ += p.getZ(ix); frontCount++; }
      }
    }
    mesh.material = Array.isArray(mesh.material) ? newer : newer[0];
  });
  let bounds = new Box3().setFromObject(group);
  if (frontCount && frontZ / frontCount > (bounds.min.z + bounds.max.z) / 2) group.rotation.y = Math.PI;
  group.updateMatrixWorld(true); bounds = new Box3().setFromObject(group);
  const size = { x: bounds.max.x - bounds.min.x, y: bounds.max.y - bounds.min.y, z: bounds.max.z - bounds.min.z };
  group.scale.set(1.8 / size.x, 1.8 / size.x, 4.5 / size.z);
  group.updateMatrixWorld(true); bounds = new Box3().setFromObject(group);
  group.position.set(-(bounds.min.x + bounds.max.x) / 2, -bounds.min.y, -(bounds.min.z + bounds.max.z) / 2);
  group.updateMatrixWorld(true);
  const binary = await new GLTFExporter().parseAsync(group, { binary: true });
  await writeFile(`${destination}/${name}.glb`, Buffer.from(binary));
  inventory.push({ name, file: `${name}.glb`, originalObjSha256: createHash('sha256').update(obj).digest('hex'), bytes: binary.byteLength, dimensions: { width: 1.8, length: 4.5 }, forward: '-Z' });
}
await writeFile(`${destination}/License.txt`, await readFile(`${source}/License.txt`));
await writeFile(`${destination}/manifest.json`, JSON.stringify({ creator: 'Quaternius', source: 'https://quaternius.com/packs/cars.html', license: 'CC0-1.0', converted: inventory }, null, 2));
console.log(JSON.stringify(inventory.map(({ name, bytes }) => ({ name, bytes })), null, 2));
