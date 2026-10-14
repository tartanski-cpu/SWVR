/**
 * A keyboard for writing a note in VR (there's no system keyboard inside an immersive
 * session): a menu panel of keys in German QWERTZ layout, with Shift, Space, Backspace,
 * the note colour, Cancel and Post. It floats in front of you like the menu; point and
 * pull the trigger (or poke) to type.
 */
import { WristMenu } from '../ui/wristMenu';
import type { MenuButton, MenuRow } from '../ui/menuPanel';
import { MAX_TEXT } from './board';

const ROWS = ['1234567890ß', 'qwertzuiopü', 'asdfghjklöä', 'yxcvbnm,.-?'];
const COLOUR_NAMES = ['Yellow', 'Pink', 'Green', 'Blue'];

export class NoteKeyboard {
  readonly menu: WristMenu;
  private text = '';
  private shift = true;
  private colour = 0;
  private at: { x: number; y: number } | null = null;

  constructor(private readonly post: (text: string, x: number, y: number, colour: number) => void) {
    const key = (ch: string): MenuButton => ({
      text: () => (this.shift ? ch.toUpperCase() : ch),
      press: () => this.type(this.shift ? ch.toUpperCase() : ch),
    });
    const rows: MenuRow[] = [
      { label: '', buttons: [{ text: () => `${this.text}▏`, weight: 1 }] },
      ...ROWS.map((r) => ({ label: '', buttons: [...r].map(key) })),
      {
        label: '',
        buttons: [
          { text: '⇧ Shift', active: () => this.shift, press: () => (this.shift = !this.shift), weight: 1.4 },
          { text: 'Space', press: () => this.type(' '), weight: 3 },
          { text: '⌫', press: () => (this.text = this.text.slice(0, -1)), weight: 1.2 },
        ],
      },
      {
        label: '',
        buttons: COLOUR_NAMES.map((name, i) => ({ text: name, active: () => this.colour === i, press: () => (this.colour = i) })),
      },
      {
        label: '',
        buttons: [
          { text: 'Cancel', press: () => this.close() },
          { text: () => (this.text.trim() ? 'Post note ✓' : '(type a note)'), press: () => this.submit(), weight: 1.6 },
        ],
      },
    ];
    this.menu = new WristMenu({ header: [{ heading: 'New note for the whiteboard' }], pages: [{ name: 'Note', rows }] });
    this.menu.root.name = 'noteKeyboard';
  }

  get isOpen(): boolean {
    return this.menu.isOpen;
  }

  /** Start a note for board position (x, y). The caller places the panel (openInFront). */
  begin(x: number, y: number): void {
    this.at = { x, y };
    this.text = '';
    this.shift = true;
  }

  private type(ch: string): void {
    if (this.text.length >= MAX_TEXT) return;
    this.text += ch;
    // Capital after the start or a full stop, like a phone keyboard.
    this.shift = /[.!?]\s$/.test(this.text);
  }

  private submit(): void {
    if (!this.text.trim() || !this.at) return;
    this.post(this.text, this.at.x, this.at.y, this.colour);
    this.close();
  }

  close(): void {
    this.at = null;
    this.menu.close();
  }
}
