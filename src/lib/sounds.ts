/** Sons de notificação gerados via WebAudio (sem arquivos externos). */

export type SoundId = "padrao" | "sino" | "pop" | "alerta" | "nenhum";

export const SOUND_OPTIONS: { id: SoundId; label: string }[] = [
  { id: "padrao", label: "Padrão" },
  { id: "sino", label: "Sino" },
  { id: "pop", label: "Pop" },
  { id: "alerta", label: "Alerta" },
  { id: "nenhum", label: "Silencioso" },
];

type Note = { freq: number; at: number; dur: number; type: OscillatorType };

const PRESETS: Record<Exclude<SoundId, "nenhum">, Note[]> = {
  padrao: [
    { freq: 660, at: 0, dur: 0.12, type: "sine" },
    { freq: 880, at: 0.12, dur: 0.16, type: "sine" },
  ],
  sino: [
    { freq: 1320, at: 0, dur: 0.5, type: "triangle" },
    { freq: 1760, at: 0.02, dur: 0.4, type: "sine" },
  ],
  pop: [{ freq: 420, at: 0, dur: 0.09, type: "square" }],
  alerta: [
    { freq: 520, at: 0, dur: 0.1, type: "sawtooth" },
    { freq: 520, at: 0.16, dur: 0.1, type: "sawtooth" },
    { freq: 700, at: 0.32, dur: 0.14, type: "sawtooth" },
  ],
};

let ctx: AudioContext | null = null;

function audioContext() {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function playSound(id: SoundId | null | undefined) {
  const sound = (id ?? "padrao") as SoundId;
  if (sound === "nenhum") return;
  const ac = audioContext();
  if (!ac) return;
  const notes = PRESETS[sound as Exclude<SoundId, "nenhum">] ?? PRESETS.padrao;
  const start = ac.currentTime;
  for (const n of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = n.type;
    osc.frequency.value = n.freq;
    gain.gain.setValueAtTime(0.0001, start + n.at);
    gain.gain.exponentialRampToValueAtTime(0.18, start + n.at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + n.at + n.dur);
    osc.connect(gain).connect(ac.destination);
    osc.start(start + n.at);
    osc.stop(start + n.at + n.dur + 0.05);
  }
}
