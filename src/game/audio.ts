export type GladeAudio = {
  unlock: () => void;
  play: (name: string) => void;
  toggle: () => boolean;
  muted: () => boolean;
};

export function createAudio(): GladeAudio {
  let ctx: AudioContext | null = null;
  let muted = false;

  const context = () => {
    if (!ctx) ctx = new AudioContext();
    return ctx;
  };

  const tone = (freq: number, dur: number, type: OscillatorType, gain: number, delay = 0) => {
    if (muted || !ctx) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  };

  return {
    unlock() {
      const audio = context();
      void audio.resume();
    },
    muted: () => muted,
    toggle() {
      muted = !muted;
      return muted;
    },
    play(name: string) {
      if (muted) return;
      context();
      if (name === "step") tone(180, 0.04, "square", 0.015);
      else if (name === "chart") {
        [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.12, "square", 0.04, i * 0.07));
      } else if (name === "dusk") tone(140, 0.4, "sawtooth", 0.03);
      else if (name === "night") {
        tone(90, 0.5, "sawtooth", 0.04);
        tone(70, 0.6, "square", 0.03, 0.08);
      } else if (name === "dawn") {
        [220, 277, 330].forEach((f, i) => tone(f, 0.18, "triangle", 0.04, i * 0.09));
      } else if (name === "sting") {
        tone(90, 0.2, "sawtooth", 0.07);
        tone(50, 0.28, "square", 0.05, 0.02);
      } else if (name === "exit") tone(880, 0.25, "square", 0.04);
      else if (name === "win") {
        [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.16, "square", 0.045, i * 0.08));
      } else if (name === "dead") {
        [330, 220, 110].forEach((f, i) => tone(f, 0.22, "sawtooth", 0.04, i * 0.12));
      } else if (name === "door") tone(70, 0.18, "square", 0.05);
    },
  };
}
