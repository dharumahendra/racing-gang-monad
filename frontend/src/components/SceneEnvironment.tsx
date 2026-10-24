import { Component, Suspense, useEffect, type ReactNode } from 'react';
import { useLoader, useThree } from '@react-three/fiber';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';
import { EquirectangularReflectionMapping } from 'three';
/** HDRI Poly Haven "Derelict Highway (Midday)" (CC0). Pantulan cat/kaca mobil PBR; opsional sebagai langit. */
export const HDRI_URL = '/assets/polyhaven/derelict_highway_midday_1k.hdr';
/** HDRI Poly Haven "Garage" (CC0, Greg Zaal): lampu tabung neon, cocok dengan foto showroom Garasi. */
export const GARAGE_HDRI_URL = '/assets/polyhaven/garage_1k.hdr';
type EnvProps = { intensity?: number; background?: boolean; url?: string };
export function SceneEnvironment({ intensity = 1, background = false, url = HDRI_URL }: EnvProps) {
  const texture = useLoader(HDRLoader, url);
  const { scene, invalidate } = useThree();
  useEffect(() => {
    texture.mapping = EquirectangularReflectionMapping;
    const previous = { environment: scene.environment, intensity: scene.environmentIntensity, background: scene.background };
    scene.environment = texture;
    scene.environmentIntensity = intensity;
    if (background) scene.background = texture;
    invalidate();
    return () => {
      scene.environment = previous.environment;
      scene.environmentIntensity = previous.intensity;
      if (background) scene.background = previous.background;
    };
  }, [texture, scene, intensity, background, invalidate]);
  return null;
}

/** HDRI gagal dimuat tidak boleh menjatuhkan seluruh scene: tampil tanpa pantulan. */
export class Optional extends Component<{ children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? (this.props.fallback ?? null) : this.props.children; }
}
export function OptionalEnvironment(props: EnvProps) {
  return <Optional><Suspense fallback={null}><SceneEnvironment {...props}/></Suspense></Optional>;
}
