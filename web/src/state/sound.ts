import { useSyncExternalStore } from 'react';

/** Sonido de la mesa (dados que caen y sello), por persona y apagado por defecto. Se guarda en `rl-sound`.
 *  Los sonidos se sintetizan con WebAudio: nada que descargar y el mismo carácter que la interfaz (seco, corto). */

const KEY = 'rl-sound';
const listeners = new Set<() => void>();
let ctx: AudioContext | null = null;
let armed = false;

export function soundEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export function setSoundEnabled(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, 'on');
    else localStorage.removeItem(KEY);
  } catch {
    /* sin localStorage: solo esta sesión */
  }
  if (on) arm();
  listeners.forEach((l) => l());
}

export function useSound(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    soundEnabled,
    () => false,
  );
}

/** El navegador solo deja sonar tras un gesto: al activar el sonido se crea el contexto en el siguiente toque. */
function arm(): void {
  if (armed || typeof window === 'undefined') return;
  armed = true;
  const unlock = () => {
    audio();
  };
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock, { passive: true });
}
if (soundEnabled()) arm();

function audio(): AudioContext | null {
  if (!soundEnabled() || typeof window === 'undefined' || !('AudioContext' in window)) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx.state === 'running' ? ctx : null;
  } catch {
    return null;
  }
}

let noise: AudioBuffer | null = null;
function noiseBuffer(ac: AudioContext): AudioBuffer {
  if (noise && noise.sampleRate === ac.sampleRate) return noise;
  const n = Math.floor(ac.sampleRate * 0.08);
  noise = ac.createBuffer(1, n, ac.sampleRate);
  const data = noise.getChannelData(0);
  for (let i = 0; i < n; i++) data[i] = Math.random() * 2 - 1;
  return noise;
}

/** Un dado que cae: un clac corto de ruido filtrado, con un tono un poco distinto cada vez. */
export function playDie(): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const src = ac.createBufferSource();
  src.buffer = noiseBuffer(ac);
  const band = ac.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2200 + Math.random() * 1600;
  band.Q.value = 1.2;
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  src.connect(band).connect(gain).connect(ac.destination);
  src.start(t);
  src.stop(t + 0.08);
}

/** El sello: un golpe grave; con éxito, además, dos notas que suben (tres y más agudas con todos 6). */
export function playStamp(kind: 'exito' | 'fallo' | 'seis'): void {
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime;
  const thud = ac.createOscillator();
  thud.type = 'sine';
  thud.frequency.setValueAtTime(kind === 'fallo' ? 110 : 150, t);
  thud.frequency.exponentialRampToValueAtTime(45, t + 0.18);
  const tg = ac.createGain();
  tg.gain.setValueAtTime(0.0001, t);
  tg.gain.exponentialRampToValueAtTime(0.7, t + 0.006);
  tg.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  thud.connect(tg).connect(ac.destination);
  thud.start(t);
  thud.stop(t + 0.25);
  if (kind === 'fallo') return;

  const notes = kind === 'seis' ? [660, 880, 1320] : [523, 784];
  notes.forEach((f, i) => {
    const at = t + 0.08 + i * 0.09;
    const osc = ac.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.25, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.28);
    osc.connect(g).connect(ac.destination);
    osc.start(at);
    osc.stop(at + 0.3);
  });
}
