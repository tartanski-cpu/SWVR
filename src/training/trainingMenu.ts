/**
 * The menu's Training tab (training.html only; ui/mainMenu.ts puts it first): the exercises
 * to pick from, the one running with its step, and the last verdict's card: passed or try
 * again, the reason, the numbers, the faults. Plain closures over the world's training state
 * (training.ts); the buttons send the training intents, so crew see and press the same.
 */
import type { ButtonRow, MenuPage, MenuRow } from '../ui/menuPanel';
import { CONFIG } from '../config';
import { EXERCISES } from './exercises';
import type { TrainingState } from './training';
import { clock } from './review';
import type { TrainingRunsApi } from './trainingRuns';

export interface TrainingMenuHost {
  /** The world's training state (WorldState.training), or null before the host has made it. */
  training(): TrainingState | null;
  /** Send a training intent (training.ts applyTrainingIntent): to start one, `ref` is its id. */
  trainingSend(control: 'trainingStart' | 'trainingRetry' | 'trainingRestart' | 'trainingAbort', ref?: string): void;
  /** The runs recorded and kept on this page, and their review (trainingRuns.ts); null outside Training. */
  trainingRuns(): TrainingRunsApi | null;
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

  // The runs: the review's controls while one is open, then the list (newest first), each to review or save.
  const R = () => h.trainingRuns();
  const reviewing = () => !!R()?.reviewing();
  const listRow = (i: number): ButtonRow => {
    const head = () => R()?.list()[i];
    return {
      label: '',
      buttons: [
        {
          text: () => {
            const x = head();
            if (!x) return '';
            const v = x.passed === null ? 'no verdict' : x.passed ? 'PASSED' : 'TRY AGAIN';
            return `${x.name.split(' ')[0]} a${x.attempt}  ${v}  ${x.date.slice(11, 16)}  ${clock(x.duration)}`;
          },
          weight: 2.6,
          active: () => !!head() && R()?.reviewing()?.id === head()!.id,
        },
        { text: () => (head() ? 'Review' : ''), press: () => head() && R()?.review(head()!.id) },
        { text: () => (head() ? 'Save' : ''), press: () => head() && R()?.download(head()!.id) },
      ],
    };
  };
  const runs: MenuRow[] = [
    { heading: 'Review' },
    { label: '', when: () => !reviewing(), buttons: [{ text: 'Pick a run below: its track on the chart, coloured by speed, with its events', weight: 3 }] },
    { label: '', when: reviewing, buttons: [{ text: () => `${R()?.reviewing()?.name ?? ''}, attempt ${R()?.reviewing()?.attempt ?? ''}`, weight: 2.2 }, { text: 'Close', press: () => R()?.closeReview() }] },
    {
      label: '',
      when: reviewing,
      buttons: [
        { text: '−10 s', press: () => R()?.seekBy(-10) },
        { text: 'Prev event', press: () => R()?.seekEvent(-1) },
        { text: () => (R()?.playLine().includes('playing') ? 'Pause' : 'Play'), press: () => R()?.togglePlay() },
        { text: 'Next event', press: () => R()?.seekEvent(1) },
        { text: '+10 s', press: () => R()?.seekBy(10) },
      ],
    },
    { label: '', when: reviewing, buttons: [{ text: () => R()?.playLine() ?? '', weight: 2.2 }, { text: () => `Speed ×${R()?.rate() ?? 1}`, press: () => R()?.cycleRate() }] },
    { label: '', when: () => reviewing() && !!R()?.eventLine(), buttons: [{ text: () => R()?.eventLine() ?? '', weight: 3 }] },
    { heading: 'Runs' },
    { label: '', when: () => !!R()?.recording(), buttons: [{ text: 'Recording this attempt', weight: 3, active: () => true }] },
    { label: '', when: () => !R()?.list().length, buttons: [{ text: 'None yet: each attempt is recorded as you go', weight: 3 }] },
    { show: CONFIG.training.record.menuRows, when: () => !!R()?.list().length, scroll: Array.from({ length: CONFIG.training.record.keepRuns }, (_, i) => listRow(i)) },
    { label: '', when: () => !!R()?.canLoad(), buttons: [{ text: 'Load a recording from a file', press: () => R()?.load() }] },
    { label: '', when: () => !!R()?.note(), buttons: [{ text: () => R()?.note() ?? '', weight: 3 }] },
  ];

  return { name: 'Training', sections: [{ name: 'Exercises', rows: exercises }, { name: 'Result', rows: card }, { name: 'Runs', rows: runs }] };
}
