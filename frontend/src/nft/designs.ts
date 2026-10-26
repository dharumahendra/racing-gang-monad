import { COLLECTIBLES } from '@racing-gang/config';
import { collectibles, buildCollectibleMetadata } from './collection';

// ID kontrak bukan ID katalog aset lama: truk Starter tidak dijual sebagai desain RGX.
const assetSlugs: Record<number, string> = { 1: 'minecraft-minecart', 2: 'burger-car', 3: 'spongebob-boatmobile' };
export const designs = COLLECTIBLES.map(design => {
  const asset = collectibles.find(item => item.slug === assetSlugs[design.id]);
  if (!asset || asset.preview.kind !== 'local') throw new Error(`Missing artwork for RGX design ${design.id}`);
  return { ...design, asset };
});

export function designMetadata(id: number, publicFolder: string) {
  const design = designs.find(item => item.id === id);
  if (!design) throw new Error('Unknown RGX design');
  const metadata = buildCollectibleMetadata(design.asset, publicFolder);
  return {
    ...metadata,
    name: `Racing Gang Collectibles — ${design.name}`,
    attributes: [...metadata.attributes, { trait_type: 'Design', value: id }, { trait_type: 'Soulbound', value: 'Yes' }],
    properties: { ...metadata.properties, collectible_id: id, design_id: id, asset_catalogue_id: design.asset.id },
  };
}
