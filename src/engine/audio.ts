// Sons synthétisés (WebAudio) : aucun fichier audio nécessaire.
// Bips de dialogue par personnage, interface, sifflet, frappe, foule, but…
type Sfx = 'blip' | 'select' | 'confirm' | 'back' | 'positif' | 'negatif' | 'souvenir' | 'sifflet' | 'frappe' | 'passe'
  | 'foule' | 'deception' | 'but' | 'porte' | 'pas' | 'page' | 'notif' | 'flash' | 'coeur' | 'cloche' | 'telephone' | 'tension';

class AudioEngine {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  volume = 0.6;
  muted = false;
  private noiseBuf: AudioBuffer | null = null;
  private ambient: { stop: () => void; kind: string } | null = null;

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    try {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : this.volume;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    } catch { this.ctx = null; }
  }

  setVolume(v: number) { this.volume = v; if (this.master) this.master.gain.value = this.muted ? 0 : v; }
  setMuted(m: boolean) { this.muted = m; if (this.master) this.master.gain.value = m ? 0 : this.volume; }

  private tone(freq: number, dur: number, type: OscillatorType = 'square', vol = 0.15, when = 0, slide = 0) {
    const c = this.ctx; if (!c || !this.master) return;
    const t = c.currentTime + when;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  private noise(dur: number, vol = 0.2, filter = 1200, when = 0, q = 0.7, type: BiquadFilterType = 'bandpass') {
    const c = this.ctx; if (!c || !this.master || !this.noiseBuf) return;
    const t = c.currentTime + when;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = type; f.frequency.value = filter; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.2, dur * 0.3)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.05);
  }

  blip(voice = 1) { this.tone(220 * voice + Math.random() * 30, 0.045, 'square', 0.035); }

  play(name: Sfx | string) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'select': this.tone(660, 0.05, 'square', 0.05); break;
      case 'confirm': this.tone(523, 0.06, 'square', 0.06); this.tone(784, 0.08, 'square', 0.06, 0.06); break;
      case 'back': this.tone(392, 0.07, 'square', 0.05, 0, 0.7); break;
      case 'positif': this.tone(659, 0.07, 'triangle', 0.1); this.tone(988, 0.12, 'triangle', 0.1, 0.07); break;
      case 'negatif': this.tone(330, 0.1, 'triangle', 0.1); this.tone(247, 0.16, 'triangle', 0.1, 0.09); break;
      case 'souvenir': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.18, 'sine', 0.07, i * 0.07)); break;
      case 'sifflet': { const c = this.ctx; const t = c.currentTime; const o = c.createOscillator(); const g = c.createGain(); const lfo = c.createOscillator(); const lg = c.createGain(); o.frequency.value = 2400; lfo.frequency.value = 28; lg.gain.value = 120; lfo.connect(lg); lg.connect(o.frequency); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.03); g.gain.setValueAtTime(0.08, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7); o.connect(g); g.connect(this.master!); o.start(t); lfo.start(t); o.stop(t + 0.75); lfo.stop(t + 0.75); break; }
      case 'frappe': this.tone(110, 0.12, 'sine', 0.3, 0, 0.4); this.noise(0.08, 0.25, 2200); break;
      case 'passe': this.tone(160, 0.08, 'sine', 0.18, 0, 0.5); this.noise(0.05, 0.12, 2000); break;
      case 'foule': this.noise(2.2, 0.28, 900, 0, 0.4); this.noise(2.0, 0.18, 1800, 0.1, 0.5); break;
      case 'deception': this.noise(1.4, 0.2, 500, 0, 0.6, 'lowpass'); this.tone(180, 0.8, 'sawtooth', 0.03, 0, 0.6); break;
      case 'but': this.noise(2.8, 0.35, 1000, 0, 0.3); [392, 523, 659, 784].forEach((f, i) => this.tone(f, 0.25, 'square', 0.06, 0.2 + i * 0.1)); break;
      case 'porte': this.noise(0.15, 0.2, 400); this.tone(90, 0.12, 'sine', 0.15, 0.08); break;
      case 'pas': this.noise(0.04, 0.05, 700); break;
      case 'page': this.noise(0.12, 0.08, 3000); break;
      case 'notif': this.tone(880, 0.06, 'sine', 0.06); this.tone(1320, 0.1, 'sine', 0.05, 0.06); break;
      case 'flash': this.noise(0.06, 0.15, 4000); break;
      case 'coeur': this.tone(70, 0.12, 'sine', 0.3); this.tone(70, 0.12, 'sine', 0.25, 0.22); break;
      case 'cloche': this.tone(1046, 0.6, 'sine', 0.08); this.tone(1568, 0.5, 'sine', 0.04); break;
      case 'telephone': for (let i = 0; i < 4; i++) this.tone(i % 2 ? 1200 : 1500, 0.08, 'square', 0.04, i * 0.09); break;
      case 'tension': this.tone(110, 1.2, 'sawtooth', 0.04, 0, 1.06); this.tone(116, 1.2, 'sawtooth', 0.03); break;
    }
  }

  /** Ambiance continue légère selon le lieu (foule, ville, nature, club). */
  setAmbient(kind: string | undefined) {
    if (!this.ctx || !this.master || !this.noiseBuf) return;
    if (this.ambient?.kind === kind) return;
    this.ambient?.stop();
    this.ambient = null;
    if (!kind || kind === 'aucun') return;
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter();
    const g = c.createGain();
    const cfg: Record<string, [BiquadFilterType, number, number]> = { foule: ['bandpass', 800, 0.05], ville: ['lowpass', 500, 0.035], nature: ['highpass', 4000, 0.012], club: ['lowpass', 180, 0.06], interieur: ['lowpass', 300, 0.012], pluie: ['highpass', 2500, 0.04] };
    const [type, freq, vol] = cfg[kind] ?? cfg.interieur;
    f.type = type; f.frequency.value = freq; g.gain.value = 0;
    g.gain.linearRampToValueAtTime(vol, c.currentTime + 1.5);
    s.connect(f); f.connect(g); g.connect(this.master); s.start();
    let beat: number | undefined;
    if (kind === 'club') beat = window.setInterval(() => { this.tone(55, 0.15, 'sine', 0.12); }, 500);
    this.ambient = { kind, stop: () => { try { g.gain.linearRampToValueAtTime(0, c.currentTime + 0.5); s.stop(c.currentTime + 0.6); } catch { /* */ } if (beat) clearInterval(beat); } };
  }
}

export const audio = new AudioEngine();
