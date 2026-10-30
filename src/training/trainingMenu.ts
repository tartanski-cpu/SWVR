/**
 * The menu's Training tab (training.html only; ui/mainMenu.ts puts it first): the exercises
 * to pick from, the one running with its step, and the last verdict's card: passed or try
 * again, the reason, the numbers, the faults. Plain closures over the world's training state
 * (training.ts); the buttons send the training intents, so crew see and press the same.
 */
import type { MenuPage, MenuRow } from '../ui/menuPanel';
import { CONFIG } from '../config';
import { EXERCISES } from './exercises';
import type { TrainingState } from './training';

export interface TrainingMenuHost {
  /** The world's training state (WorldState.training), or null before the host has made it. */
  training(): TrainingState | null;
  /** Send a training intent (training.ts applyTrainingIntent): to start one, `ref` is its id. */
  trainingSend(control: 'trainingStart' | 'trainingRetry' | 'trainingRestart' | 'trainingAbort', ref?: string): void;
}

/** The card's lines: up to this many numbers, and faults. */
const NUMBER_ROWS = 4;
const FAULT_ROWS = 4;

export function trainingPage(h: TrainingMenuHost): MenuPage {
  const t = () => h.training();
  const running = () => !!t()?.id;
  const result = () => t()?.result ?? null;
  const ex = () => EXERCISES.find((e) => e.id === t()?.id);
  /** The next attempt's button: the second after a first "try again", else the same exercise again. */
  const retryText = () => (result() && !result()!.passed && result()!.attempt < CONFIG.training.attempts ? 'Second attempt' : 'Do it again');

  const exercises: MenuRow[] = [
    { heading: 'Harbour practice' },
    { label: '', buttons: [{ text: 'Practice modelled on the RYA and SBF schemes: not a course, no certificate' }] },
    { label: 'Now', buttons: [{ text: () => (ex() ? `${ex()!.code} ${ex()!.name}, attempt ${t()!.attempt} of ${CONFIG.training.attempts}` : 'Pick an exercise below'), weight: 3 }] },
    {
      label: '',
      when: running,
      buttons: [
        { text: 'Start again', press: () => h.trainingSend('trainingRestart') },
        { text: 'Stop', press: () => h.trainingSend('trainingAbort') },
      ],
    },
    ...EXERCISES.map(
      (e): MenuRow => ({
        label: e.code,
        buttons: [
          { text: () => `${e.name}${t()?.passed.includes(e.id) ? '  ✓ passed' : ''}`, weight: 2.4 },
          { text: 'Start', active: () => t()?.id === e.id, press: () => h.trainingSend('trainingStart', e.id) },
        ],
      }),
    ),
    // The last verdict in short, with the next attempt (the whole card: the Result section).
    {
      label: 'Last',
      when: () => !!result() && !running(),
      buttons: [
        { text: () => `${result()!.passed ? 'PASSED' : 'TRY AGAIN'}: ${result()!.reason}`, weight: 3, active: () => !!result()?.passed },
        { text: retryText, press: () => h.trainingSend('trainingRetry') },
      ],
    },
    { label: '', when: () => !running(), buttons: [{ text: () => EXERCISES.find((e) => e.id === result()?.id)?.practises ?? 'Each one is a few minutes afloat. The steps come over the VHF and on the duty board in the wheelhouse.' }] },
  ];

  const card: MenuRow[] = [
    { heading: 'Last attempt' },
    { label: '', when: () => !result(), buttons: [{ text: 'Nothing finished yet' }] },
    {
      label: '',
      when: () => !!result(),
      buttons: [
        { text: () => (result()!.passed ? 'PASSED' : 'TRY AGAIN'), active: () => !!result()?.passed },
        { text: () => `${result()!.name}, attempt ${result()!.attempt}`, weight: 2.2 },
      ],
    },
    { label: 'Why', when: () => !!result(), buttons: [{ text: () => result()!.reason, weight: 3 }] },
    ...Array.from({ length: NUMBER_ROWS }, (_, i): MenuRow => ({
      label: '',
      when: () => !!result()?.numbers[i],
      buttons: [{ text: () => result()?.numbers[i]?.[0] ?? '', weight: 1.4 }, { text: () => result()?.numbers[i]?.[1] ?? '' }],
    })),
    {
      label: 'Faults',
      when: () => !!result(),
      buttons: [{ text: () => (result()!.faults.length ? `${result()!.faults.length}, weighing ${result()!.total} in all` : 'None'), weight: 3 }],
    },
    ...Array.from({ length: FAULT_ROWS }, (_, i): MenuRow => ({
      label: '',
      when: () => !!result()?.faults[i],
      buttons: [{ text: () => {
        const f = result()?.faults[i];
        return f ? `${f.t} s: ${f.text} (${f.weight === 3 ? 'fail' : `weight ${f.weight}`})` : '';
      }, weight: 3 }],
    })),
    {
      label: '',
      when: () => !!result() && !running(),
      buttons: [
        {
          text: retryText,
          press: () => h.trainingSend('trainingRetry'),
        },
      ],
    },
  ];

  return { name: 'Training', sections: [{ name: 'Exercises', rows: exercises }, { name: 'Result', rows: card }] };
}
