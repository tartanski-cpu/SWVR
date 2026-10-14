/**
 * A voice-like babble for when the browser can't speak (the Quest browser has the Web
 * Speech API but, as far as we can tell, no voices): syllables of a buzzy glottal source
 * (sawtooth) through two vowel formant filters that jump from syllable to syllable, with a
 * falling-then-rising pitch contour per phrase. It isn't words - the text is on the radio
 * screen and in the notice - but it sounds like someone talking, so the call is heard.
 */

/** Typical first and second formants (Hz) of a few vowels. */
const VOWELS: [number, number][] = [
  [730, 1090], // a
  [530, 1840], // e
  [270, 2290], // i
  [570, 840], // o
  [300, 870], // u
  [640, 1190], // er
];

/**
 * Babble the length of `text` into `out`, starting at `at` (context time). `pitch` is the
 * speaking pitch (Hz): ~110 a man on the radio, ~200 a shout. Returns the end time.
 */
export function babble(ctx: AudioContext, out: AudioNode, text: string, at: number, pitch: number, level = 0.5, maxSeconds = 7): number {
  const words = text.split(/\s+/).filter(Boolean);
  // About three syllables a second-and-a-bit, a short gap between words and at full stops.
  let syllables = 0;
  for (const w of words) syllables += Math.max(1, Math.round(w.replace(/[^a-z]/gi, '').length / 3));
  const syl = 0.15;
  const dur = Math.min(maxSeconds, syllables * syl + words.length * 0.04);

  const src = ctx.createOscillator();
  src.type = 'sawtooth';
  const f1 = ctx.createBiquadFilter();
  f1.type = 'bandpass';
  f1.Q.value = 6;
  const f2 = ctx.createBiquadFilter();
  f2.type = 'bandpass';
  f2.Q.value = 8;
  const g2 = ctx.createGain();
  g2.gain.value = 0.6;
  const env = ctx.createGain();
  env.gain.value = 0;
  src.connect(f1).connect(env);
  src.connect(f2).connect(g2).connect(env);
  env.connect(out);

  let t = at;
  let wi = 0;
  let inWord = 0;
  const wordSyl = (w: string) => Math.max(1, Math.round(w.replace(/[^a-z]/gi, '').length / 3));
  while (t < at + dur) {
    const [a, b] = VOWELS[Math.floor(Math.random() * VOWELS.length)];
    const len = syl * (0.75 + Math.random() * 0.5);
    // Phrase contour: starts up, drifts down; a lift on the last syllables of a phrase.
    const phase = (t - at) / dur;
    const p = pitch * (1.15 - 0.3 * phase + (Math.random() - 0.5) * 0.12);
    src.frequency.setTargetAtTime(p, t, 0.03);
    f1.frequency.setTargetAtTime(a, t, 0.02);
    f2.frequency.setTargetAtTime(b, t, 0.02);
    // Syllable envelope: quick onset, hold, decay (consonant-ish gap after).
    env.gain.setTargetAtTime(level, t, 0.012);
    env.gain.setTargetAtTime(0, t + len * 0.7, 0.02);
    t += len;
    if (++inWord >= wordSyl(words[wi % words.length] ?? 'a')) {
      inWord = 0;
      const w = words[wi % words.length] ?? '';
      wi++;
      t += /[.,!?]$/.test(w) ? 0.22 : 0.04;
    }
  }
  src.start(at);
  src.stop(t + 0.2);
  return t;
}

/**
 * Can the browser actually speak? True only if speechSynthesis exists and has voices
 * (it loads them asynchronously; call `watchVoices` early so the answer is up to date).
 */
export function speechVoices(): number {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return -1;
  return synth.getVoices().length;
}

/** Ask the browser to load its voices now (some only list them after this). */
export function watchVoices(): void {
  const synth = typeof window !== 'undefined' ? window.speechSynthesis : undefined;
  if (!synth) return;
  synth.getVoices();
  synth.addEventListener?.('voiceschanged', () => synth.getVoices());
}

/**
 * Speak `text`, or babble it if the browser can't: with no voices, or if the speech
 * hasn't started within a second (some browsers accept the utterance and stay silent).
 * `onFallback` plays the babble; `configure` sets rate / pitch / voice on the utterance.
 */
export function speakOrBabble(text: string, configure: (u: SpeechSynthesisUtterance) => void, onFallback: () => void, cancelFirst: boolean): void {
  if (speechVoices() <= 0) {
    onFallback();
    return;
  }
  const synth = window.speechSynthesis;
  if (cancelFirst) synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  configure(u);
  let started = false;
  u.onstart = () => (started = true);
  synth.speak(u);
  // Queued behind other speech counts as fine; only an idle, silent synth falls back.
  setTimeout(() => {
    if (!started && !synth.speaking) {
      synth.cancel();
      onFallback();
    }
  }, 1200);
  lastSpeech.tried++;
  u.addEventListener('start', () => lastSpeech.started++);
}

/** For the voice test: utterances tried and actually started this session. */
export const lastSpeech = { tried: 0, started: 0 };
