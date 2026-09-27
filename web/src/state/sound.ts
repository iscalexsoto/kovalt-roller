import { useSyncExternalStore } from 'react';

/** Sonido de la mesa (kovalt-medieval-skill § Sonido): por persona, apagado por defecto y nunca antes de un gesto.
 *  Se guarda en `rl-sound`. Sintetizado con WebAudio, sin archivos: dados, un tic por paso del total y el sello. */

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

/** Nada suena con la pestaña oculta ni con movimiento reducido (el sonido va atado a los golpes de la animación). */
function muted(): boolean {
  return document.hidden || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ready(): AudioContext | null {
  if (typeof document === 'undefined' || muted()) return null;
  return audio();
}

/** Dados: seis ráfagas de ruido pasabanda (1.4–3 kHz, 35 ms, cada 55 ms), al empezar a rodar. */
export function playDice(): void {
  const ac = ready();
  if (!ac) return;
  const len = Math.floor(ac.sampleRate * 0.035);
  for (let i = 0; i < 6; i++) {
    const t = ac.currentTime + i * 0.055 + Math.random() * 0.03;
    const buf = ac.createBuffer(1, len, ac.sampleRate);
    const data = buf.getChannelData(0);
    for (let j = 0; j < len; j++) data[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / len, 4);
    const src = ac.createBufferSource();
    src.buffer = buf;
    const band = ac.createBiquadFilter();
    band.type = 'bandpass';
    band.frequency.value = 1400 + Math.random() * 1600;
    band.Q.value = 3;
    const gain = ac.createGain();
    gain.gain.value = 0.7;
    src.connect(band).connect(gain).connect(ac.destination);
    src.start(t);
  }
}

/** Un paso del total al aplicar un estado: triángulo de 880 Hz, 80 ms. */
export function playTick(): void {
  const ac = ready();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.type = 'triangle';
  osc.frequency.setValueAtTime(880, t);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.25, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.1);
}

/** El sello al caer: seno de 150 a 45 Hz, 300 ms. */
export function playSeal(): void {
  const ac = ready();
  if (!ac) return;
  const t = ac.currentTime;
  const osc = ac.createOscillator();
  osc.frequency.setValueAtTime(150, t);
  osc.frequency.exponentialRampToValueAtTime(45, t + 0.2);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.6, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
  osc.connect(gain).connect(ac.destination);
  osc.start(t);
  osc.stop(t + 0.32);
}
