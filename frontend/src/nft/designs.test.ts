import { describe, expect, it } from 'vitest';
import { designs, designMetadata } from './designs';

describe('metadata desain RGX', () => {
  it('memetakan ID kontrak ke aset yang benar dan mengecualikan Starter', () => {
    expect(designs.map(d => [d.id, d.asset.slug])).toEqual([
      [1, 'minecraft-minecart'], [2, 'burger-car'], [3, 'spongebob-boatmobile'],
    ]);
  });

  it('metadata desain 2 menunjuk Burger, bukan ID katalog truk', () => {
    const metadata = designMetadata(2, 'https://racing-gang-monad.vercel.app/collectibles/');
    expect(metadata.name).toContain('Burger');
    expect(metadata.image).toBe('https://racing-gang-monad.vercel.app/collectibles/images/burger-car.png');
    expect(metadata.animation_url).toBe('https://racing-gang-monad.vercel.app/collectibles/models/burger-car.glb');
    expect(metadata.properties.design_id).toBe(2);
    expect(metadata.attributes).toContainEqual({ trait_type: 'Soulbound', value: 'Yes' });
  });

  it('menjaga atribusi aset impor dan menolak ID/deskripsi domain tidak valid', () => {
    expect(designMetadata(1, 'https://example.test/collectibles/').properties.credits).toContain('Vlad94077');
    expect(designMetadata(3, 'https://example.test/collectibles/').properties.credits).toContain('TheoClarke');
    expect(() => designMetadata(4, 'https://example.test/collectibles/')).toThrow();
    expect(() => designMetadata(1, 'http://localhost/')).toThrow();
  });
});
