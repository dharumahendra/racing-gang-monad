import { expect, it, vi } from 'vitest';
import { EngineAudio } from './engine-audio';

function host() {
  const oscillators: any[] = [];
  const param = () => ({ value: 0, setValueAtTime: vi.fn(), setTargetAtTime: vi.fn(), linearRampToValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() });
  const context = {
    state: 'suspended', currentTime: 0, destination: {},
    resume: vi.fn(async () => { context.state = 'running'; }),
    close: vi.fn(async () => { context.state = 'closed'; }),
    createGain: () => ({ gain: param(), connect: vi.fn(), disconnect: vi.fn() }),
    createBiquadFilter: () => ({ type: '', frequency: param(), Q: param(), connect: vi.fn(), disconnect: vi.fn() }),
    createOscillator: () => { const osc = { type: '', frequency: param(), connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as null | (() => void) }; oscillators.push(osc); return osc; },
  };
  return { context, oscillators, factory: vi.fn(() => context as unknown as AudioContext) };
}

it('tidak membuat audio sebelum unlock gesture', () => {
  const h = host();
  const audio = new EngineAudio(h.factory);
  audio.engine(100, 148, true, true);
  audio.nearMiss(1);
  expect(h.factory).not.toHaveBeenCalled();
  expect(audio.state).toBe('locked');
});

it('menyalakan loop mesin hanya saat playing dan visible, dan mematikannya saat tidak', async () => {
  const h = host();
  const audio = new EngineAudio(h.factory);
  await audio.unlock();
  expect(audio.state).toBe('ready');
  audio.engine(100, 148, true, true);
  const engineOsc = h.oscillators.length; // osc + sub
  expect(engineOsc).toBe(2);
  // Frame berikutnya memperbarui loop yang sama, bukan membuat osc baru.
  audio.engine(120, 148, true, true);
  expect(h.oscillators).toHaveLength(2);
  // Tidak visible → loop berhenti.
  audio.engine(120, 148, true, false);
  expect(h.oscillators[0].stop).toHaveBeenCalled();
  audio.dispose();
});

it('membunyikan efek mepet sekali per index (dedup)', async () => {
  const h = host();
  const audio = new EngineAudio(h.factory);
  await audio.unlock();
  audio.nearMiss(1);
  audio.nearMiss(1); // index sama: tidak berbunyi lagi
  audio.nearMiss(2);
  expect(h.oscillators).toHaveLength(2);
  audio.dispose();
});

it('mute menghentikan suara dan mencegahnya sampai unmute', async () => {
  const h = host();
  const audio = new EngineAudio(h.factory);
  await audio.unlock();
  audio.engine(100, 148, true, true);
  audio.setMuted(true);
  expect(audio.state).toBe('muted');
  expect(h.oscillators[0].stop).toHaveBeenCalled();
  const n = h.oscillators.length;
  audio.engine(100, 148, true, true); // saat muted tidak membuat suara
  audio.nearMiss(5);
  expect(h.oscillators).toHaveLength(n);
  audio.dispose();
});

it('resetRun membersihkan dedup sehingga run baru bisa berbunyi lagi', async () => {
  const h = host();
  const audio = new EngineAudio(h.factory);
  await audio.unlock();
  audio.nearMiss(1);
  expect(h.oscillators).toHaveLength(1);
  audio.resetRun();
  audio.nearMiss(1); // index 1 lagi, tapi run baru
  expect(h.oscillators).toHaveLength(2);
  audio.dispose();
  expect(h.context.close).toHaveBeenCalledTimes(1);
});

it('mepet saat mute tidak diputar belakangan setelah unmute', async () => {
  const h = host();
  const audio = new EngineAudio(h.factory);
  await audio.unlock();
  audio.setMuted(true);
  audio.nearMiss(1);
  audio.setMuted(false);
  audio.nearMiss(1);
  expect(h.oscillators).toHaveLength(0);
  audio.nearMiss(2);
  expect(h.oscillators).toHaveLength(1);
  audio.dispose();
});

it('mepet saat tab tersembunyi tidak diputar saat tab dibuka lagi', async () => {
  const h = host();
  const audio = new EngineAudio(h.factory);
  await audio.unlock();
  audio.nearMiss(1, false);
  audio.nearMiss(1, true);
  expect(h.oscillators).toHaveLength(0);
  audio.nearMiss(2, true);
  expect(h.oscillators).toHaveLength(1);
  audio.dispose();
});

it('gagal dengan anggun saat audio tidak didukung atau resume diblokir', async () => {
  const unsupported = new EngineAudio(() => { throw new Error('no audio'); });
  await expect(unsupported.unlock()).resolves.toBeUndefined();
  expect(unsupported.state).toBe('unavailable');
  const h = host();
  h.context.resume.mockRejectedValueOnce(new Error('blocked'));
  const audio = new EngineAudio(h.factory);
  await audio.unlock();
  expect(audio.state).toBe('blocked');
  await audio.unlock();
  expect(audio.state).toBe('ready');
  audio.dispose();
});

it('unlock yang tertunda tidak membuka audio setelah dispose', async () => {
  const h = host();
  let finish!: () => void;
  h.context.resume.mockImplementationOnce(() => new Promise<void>((r) => { finish = r; }));
  const audio = new EngineAudio(h.factory);
  const pending = audio.unlock();
  audio.dispose();
  finish();
  await pending;
  expect(audio.state).toBe('locked');
  expect(h.context.close).toHaveBeenCalledTimes(1);
});
