// The little guy. Owns one DOM element and walks it on and off the bottom
// of the screen. States: away -> entering -> present -> leaving -> away.

const SIZE = 130; // px, keep in sync with --size in style.css
const WALK_SPEED = 170; // px per second
const MESSAGE_EVERY_MS = 6000;

const COMFORT = [
  'hey… you okay?',
  'unfurrow that brow :)',
  'deep breath in… and out',
  "you're doing great, really",
  '*pat pat*',
  'want to take a tiny break?',
  'i believe in you!',
  "it's gonna be okay",
  'have you had water today?',
  'whatever it is, you got this',
];
const CHEER = ['yay! that\'s better', 'there\'s that face :)', 'ok bye! ♡', 'my work here is done'];

const pick = (list, avoid) => {
  const options = list.length > 1 ? list.filter((m) => m !== avoid) : list;
  return options[Math.floor(Math.random() * options.length)];
};

const SVG = `
<svg viewBox="0 0 120 120" width="100%" height="100%" aria-hidden="true">
  <ellipse class="shadow" cx="60" cy="113" rx="34" ry="5" />
  <g class="legs">
    <path class="leg leg-back" d="M48 92 v16 a5 5 0 0 0 10 0 v-16" />
    <path class="leg leg-front" d="M64 92 v16 a5 5 0 0 0 10 0 v-16" />
  </g>
  <g class="body">
    <g class="sprout">
      <path class="stem" d="M60 30 C 60 22, 62 16, 64 12" />
      <path class="leaf" d="M64 12 C 70 4, 80 6, 82 10 C 76 16, 68 16, 64 12 Z" />
      <path class="leaf" d="M63 15 C 56 9, 48 11, 47 15 C 52 20, 59 19, 63 15 Z" />
    </g>
    <path class="arm arm-back" d="M24 66 q-12 -4 -14 -16" />
    <ellipse class="blob" cx="60" cy="64" rx="40" ry="36" />
    <ellipse class="belly" cx="62" cy="74" rx="24" ry="18" />
    <path class="arm arm-front" d="M96 66 q12 -4 14 -16" />
    <g class="eyes">
      <ellipse class="eye" cx="50" cy="56" rx="8" ry="9.5" />
      <ellipse class="eye" cx="76" cy="56" rx="8" ry="9.5" />
      <circle class="pupil" cx="52.5" cy="57" r="4.6" />
      <circle class="pupil" cx="78.5" cy="57" r="4.6" />
      <circle class="glint" cx="54.5" cy="54.5" r="1.7" />
      <circle class="glint" cx="80.5" cy="54.5" r="1.7" />
    </g>
    <ellipse class="cheek" cx="41" cy="69" rx="6" ry="3.5" />
    <ellipse class="cheek" cx="86" cy="69" rx="6" ry="3.5" />
    <path class="mouth" d="M59 70 q4 4 8 0" />
  </g>
</svg>`;

export class Creature {
  constructor(parent = document.body) {
    this.el = document.createElement('div');
    this.el.className = 'creature';
    this.el.hidden = true;
    this.el.innerHTML = `<div class="bubble"></div><div class="sprite">${SVG}</div>`;
    this.bubble = this.el.querySelector('.bubble');
    parent.appendChild(this.el);

    this.state = 'away';
    this.side = 'right';
    this.x = 0;
    this.facing = 1;
    this.message = null;
    this.timers = new Set();
    this.raf = null;
  }

  /** Come on screen (or turn around if already leaving). */
  summon() {
    if (this.state === 'present' && this.el.classList.contains('cheer')) {
      // Frowned again mid-celebration: stay put.
      this.#clearTimers();
      this.el.classList.remove('cheer');
      this.#arrive();
      return;
    }
    if (this.state === 'entering' || this.state === 'present') return;
    this.#clearTimers();
    if (this.state === 'away') {
      this.side = Math.random() < 0.5 ? 'left' : 'right';
      this.x = this.#offscreenX();
      this.el.hidden = false;
      this.#render();
    }
    this.#setState('entering');
    this.#say(null);
    this.#walkTo(this.#spotX(), () => this.#arrive());
  }

  /** Celebrate briefly, then walk back off the way it came. */
  dismiss() {
    if (this.state === 'away' || this.state === 'leaving') return;
    this.#clearTimers();
    if (this.state === 'entering') {
      this.#leave();
      return;
    }
    this.el.classList.add('cheer');
    this.#say(pick(CHEER));
    this.#later(1400, () => {
      this.el.classList.remove('cheer');
      this.#leave();
    });
  }

  get visible() {
    return this.state !== 'away';
  }

  // --- internals -----------------------------------------------------------

  #arrive() {
    this.#setState('present');
    this.#face(this.side === 'right' ? -1 : 1); // look toward the middle of the screen
    const chatter = () => {
      this.#say(pick(COMFORT, this.message));
      this.#later(MESSAGE_EVERY_MS, chatter);
    };
    this.#later(250, chatter);
  }

  #leave() {
    this.#setState('leaving');
    this.#later(900, () => this.#say(null));
    this.#walkTo(this.#offscreenX(), () => {
      this.#setState('away');
      this.el.hidden = true;
    });
  }

  #walkTo(targetX, onArrive) {
    cancelAnimationFrame(this.raf);
    this.#face(Math.sign(targetX - this.x) || this.facing);
    this.el.classList.add('walking');
    let last = performance.now();
    const step = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const remaining = targetX - this.x;
      const move = WALK_SPEED * dt;
      if (Math.abs(remaining) <= move) {
        this.x = targetX;
        this.#render();
        this.el.classList.remove('walking');
        this.raf = null;
        onArrive();
        return;
      }
      this.x += Math.sign(remaining) * move;
      this.#render();
      this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  #offscreenX() {
    return this.side === 'left' ? -SIZE - 20 : window.innerWidth + 20;
  }

  #spotX() {
    const margin = Math.max(24, window.innerWidth * 0.08);
    return this.side === 'left' ? margin : window.innerWidth - SIZE - margin;
  }

  #face(direction) {
    this.facing = direction;
    this.el.classList.toggle('facing-left', direction < 0);
  }

  #say(text) {
    this.message = text;
    if (!text) {
      this.bubble.classList.remove('show');
      return;
    }
    this.bubble.textContent = text;
    // Keep the bubble on screen when the creature is near an edge.
    const pad = 12;
    const bubbleWidth = 220;
    const center = this.x + SIZE / 2;
    const left = Math.min(
      window.innerWidth - pad - bubbleWidth / 2,
      Math.max(pad + bubbleWidth / 2, center),
    );
    this.bubble.style.setProperty('--nudge', `${left - center}px`);
    this.bubble.classList.remove('show');
    void this.bubble.offsetWidth; // restart the pop-in animation
    this.bubble.classList.add('show');
  }

  #setState(state) {
    this.el.classList.remove(this.state);
    this.state = state;
    this.el.classList.add(state);
  }

  #render() {
    this.el.style.transform = `translateX(${this.x}px)`;
  }

  #later(ms, fn) {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, ms);
    this.timers.add(id);
  }

  #clearTimers() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
  }
}
