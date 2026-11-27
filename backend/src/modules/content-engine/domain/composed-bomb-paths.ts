import {
  GOLD,
  H,
  INK,
  PUZZLE_FONT_FAMILY,
  RED,
  W,
  frame,
  pick,
  round,
  shuffled,
} from './composed-kit';
import { DrawnThing, thingSvg } from './drawn-things';

/**
 * «وين توصل؟» — القنبلة in المسارات والحركة. Every template draws a way from
 * a start to one drawing among several, and the answer is that drawing's
 * name. The engine walks the way itself, so the drawing it names is the one
 * the walk ends on. The robot is the slow one: kept to a few a batch.
 */
export const PATH_BOMB_VARIANTS = [
  'threads',
  'arrows',
  'ball-drop',
  'red-path',
  'spinner',
  'elevator',
  'robot',
] as const;

export const SLOW_PATH_BOMB_VARIANTS = ['robot'] as const;

export const PATH_BOMB_PROMPTS: Record<string, string> = {
  arrows: 'ابدأ من المربع الأخضر وامشِ على الأسهم من اليمين. وين توقف؟',
  'ball-drop': 'الكورة تنزل، وكل لوح مايل يحولها لجهته. وين تطيح؟',
  'red-path': 'امشِ على المربعات الحمرا بس. وين توصل؟',
  spinner: 'لف السهم مثل ما هو مكتوب. على وش يأشر؟',
  elevator: 'المصعد الأصفر يتحرك بالترتيب. عند أي رسمة يوقف؟',
  robot: 'الروبوت وجهه على السهم الأحمر. نفّذ الأوامر بالترتيب. وين يوقف؟',
};

export interface PathBomb {
  variant: string;
  prompt: string;
  altText: string;
  concept: string;
  factualClaim: string;
  svg: string;
}

const GREEN = '#2FA866';

const text = (
  value: string,
  x: number,
  y: number,
  size: number,
  fill = INK,
): string =>
  `<text x="${round(x)}" y="${round(y)}" text-anchor="middle" font-family="${PUZZLE_FONT_FAMILY}" font-weight="700" font-size="${size}" fill="${fill}">${value}</text>`;

const badge = (n: number, cx: number, cy: number) =>
  `<circle cx="${round(cx)}" cy="${round(cy)}" r="24" fill="${INK}"/>` +
  text(String(n), cx, cy + 10, 28, '#FFFFFF');

/** The answer at `index`, the others drawn from the pool, all different. */
function cast(
  answer: DrawnThing,
  pool: readonly DrawnThing[],
  count: number,
  index: number,
  random: () => number,
): DrawnThing[] {
  const others = shuffled(
    pool.filter((thing) => thing.key !== answer.key),
    random,
  ).slice(0, count - 1);
  others.splice(index, 0, answer);
  return others;
}

// ---------------------------------------------------------------------------
// «امشِ على الأسهم»
// ---------------------------------------------------------------------------

const STEP: Record<string, [number, number]> = {
  '←': [-1, 0],
  '→': [1, 0],
  '↑': [0, -1],
  '↓': [0, 1],
};

/** Where the arrows take a walker from `start` on a grid; null off the grid. */
export function walkArrows(
  start: [number, number],
  moves: readonly string[],
  columns: number,
  rows: number,
): [number, number] | null {
  let [x, y] = start;
  for (const move of moves) {
    x += STEP[move][0];
    y += STEP[move][1];
    if (x < 0 || y < 0 || x >= columns || y >= rows) return null;
  }
  return [x, y];
}

function arrows(
  answer: DrawnThing,
  pool: readonly DrawnThing[],
  random: () => number,
): PathBomb {
  const C = 5;
  const R = 3;
  const cell = 130;
  for (;;) {
    const start: [number, number] = [
      Math.floor(random() * C),
      Math.floor(random() * R),
    ];
    const moves = Array.from({ length: 6 }, () =>
      pick(Object.keys(STEP), random),
    );
    const end = walkArrows(start, moves, C, R);
    if (!end || (end[0] === start[0] && end[1] === start[1])) continue;
    // No step straight back: a walker who undoes a move has nothing to trace.
    if (
      moves.some(
        (m, i) =>
          i > 0 &&
          STEP[m][0] === -STEP[moves[i - 1]][0] &&
          STEP[m][1] === -STEP[moves[i - 1]][1],
      )
    )
      continue;
    const things = cast(answer, pool, C * R, end[1] * C + end[0], random);
    const x0 = (W - C * cell) / 2;
    const y0 = 40;
    let body = '';
    for (let j = 0; j < R; j += 1) {
      for (let i = 0; i < C; i += 1) {
        const px = x0 + i * cell;
        const py = y0 + j * cell;
        const first = i === start[0] && j === start[1];
        body +=
          `<rect data-cell="${i},${j}" x="${px + 5}" y="${py + 5}" width="${cell - 10}" height="${cell - 10}" rx="16" fill="${first ? '#BFE8CF' : '#FFFFFF'}" stroke="${first ? GREEN : INK}" stroke-width="${first ? 10 : 5}"/>` +
          thingSvg(things[j * C + i], px + cell / 2, py + cell / 2, 88);
      }
    }
    body += `<rect x="${W / 2 - 330}" y="${y0 + R * cell + 25}" width="660" height="110" rx="20" fill="#FFF4D6" stroke="${INK}" stroke-width="6"/>`;
    // Read from the right, as Arabic is.
    moves.forEach((move, k) => {
      body += text(move, W / 2 + 250 - k * 100, y0 + R * cell + 108, 72);
    });
    return {
      variant: `arrows:${start.join(',')}:${moves.join('')}`,
      prompt: PATH_BOMB_PROMPTS['arrows'],
      altText: 'شبكة رسمات فيها مربع أخضر، وتحتها صف أسهم',
      concept: 'Walk the arrows from the green square and name where they end.',
      factualClaim: `From ${start.join(',')} the arrows ${moves.join(' ')} end at ${end.join(',')}: «${answer.ar}».`,
      svg: frame(body),
    };
  }
}

// ---------------------------------------------------------------------------
// «الكورة وين تطيح؟»
// ---------------------------------------------------------------------------

/**
 * Where the ball ends. A board sends it one column over, into a space of its
 * row that the engine kept empty, and it falls on to the next row.
 */
export function dropBall(
  boards: readonly number[][],
  column: number,
): number[] {
  const trail = [column];
  let at = column;
  for (const row of boards) {
    at += row[at];
    trail.push(at);
  }
  return trail;
}

function ballDrop(
  answer: DrawnThing,
  pool: readonly DrawnThing[],
  random: () => number,
): PathBomb {
  const C = 5;
  const rows = 4;
  for (;;) {
    const boards: number[][] = [];
    for (let k = 0; k < rows; k += 1) {
      const row: number[] = Array(C).fill(0);
      for (const i of shuffled([0, 1, 2, 3, 4], random)) {
        if (random() < 0.45) continue;
        const d = random() < 0.5 ? -1 : 1;
        const n = i + d;
        if (n < 0 || n >= C || row[n] !== 0) continue;
        if (row.some((v, j) => v !== 0 && j + v === i)) continue;
        row[i] = d;
      }
      boards.push(row);
    }
    const start = Math.floor(random() * C);
    const trail = dropBall(boards, start);
    const end = trail[trail.length - 1];
    const turns = trail.filter((c, i) => i > 0 && c !== trail[i - 1]).length;
    if (end === start || turns < 2) continue;
    const things = cast(answer, pool, C, end, random);
    const cw = 170;
    const x0 = (W - C * cw) / 2;
    const y0 = 120;
    const rh = 95;
    const bx = x0 + start * cw + cw / 2;
    let body =
      `<circle data-ball="${start}" cx="${bx}" cy="60" r="30" fill="${RED}" stroke="${INK}" stroke-width="6"/>` +
      `<path d="M ${bx} 95 l 0 18 m -10 -10 l 10 10 l 10 -10" stroke="${INK}" stroke-width="5" fill="none"/>`;
    boards.forEach((row, k) =>
      row.forEach((d, i) => {
        const cx = x0 + i * cw + cw / 2;
        const cy = y0 + k * rh + rh / 2;
        body += d
          ? `<line data-board="${k},${i},${d}" x1="${cx - 45 * d}" y1="${cy - 30}" x2="${cx + (cw - 45) * d}" y2="${cy + 30}" stroke="${INK}" stroke-width="12" stroke-linecap="round"/>`
          : `<circle cx="${cx}" cy="${cy}" r="6" fill="#C9C2B4"/>`;
      }),
    );
    const floor = y0 + rows * rh + 150;
    for (let i = 0; i <= C; i += 1) {
      body += `<line x1="${x0 + i * cw}" y1="${y0 + rows * rh}" x2="${x0 + i * cw}" y2="${floor}" stroke="${INK}" stroke-width="8"/>`;
    }
    body += `<line x1="${x0}" y1="${floor}" x2="${x0 + C * cw}" y2="${floor}" stroke="${INK}" stroke-width="8"/>`;
    things.forEach((thing, i) => {
      body += thingSvg(thing, x0 + i * cw + cw / 2, y0 + rows * rh + 80, 100);
    });
    return {
      variant: `ball-drop:${start}:${boards.map((row) => row.join('')).join('/')}`,
      prompt: PATH_BOMB_PROMPTS['ball-drop'],
      altText: 'كورة فوق ألواح مايلة، وتحتها صناديق فيها رسمات',
      concept:
        'Follow a falling ball across the boards that turn it and name the box it lands in.',
      factualClaim: `The ball goes through columns ${trail.join('→')} and lands on «${answer.ar}».`,
      svg: frame(body),
    };
  }
}

// ---------------------------------------------------------------------------
// «امشِ على الأحمر»
// ---------------------------------------------------------------------------

function redPath(
  answer: DrawnThing,
  pool: readonly DrawnThing[],
  random: () => number,
): PathBomb {
  const C = 7;
  const R = 4;
  const cell = 110;
  for (;;) {
    let x = 0;
    let y = Math.floor(random() * R);
    const path: Array<[number, number]> = [[x, y]];
    const on = new Set([`${x},${y}`]);
    while (x < C - 1) {
      const options = (
        [
          [1, 0],
          [0, 1],
          [0, -1],
        ] as Array<[number, number]>
      ).filter(([dx, dy]) => {
        const nx = x + dx;
        const ny = y + dy;
        // Never beside an earlier square: the red way is one line, no forks.
        return (
          ny >= 0 &&
          ny < R &&
          !on.has(`${nx},${ny}`) &&
          !path
            .slice(0, -1)
            .some(([px, py]) => Math.abs(px - nx) + Math.abs(py - ny) === 1)
        );
      });
      if (!options.length) break;
      const [dx, dy] = pick(options, random);
      x += dx;
      y += dy;
      on.add(`${x},${y}`);
      path.push([x, y]);
    }
    if (x < C - 1 || path.length < 9) continue;
    const things = cast(answer, pool, R, y, random);
    const others = ['#2F6FE0', GREEN, GOLD];
    const x0 = (W - C * cell) / 2 - 40;
    const y0 = 90;
    let body = '';
    for (let j = 0; j < R; j += 1) {
      for (let i = 0; i < C; i += 1) {
        const red = on.has(`${i},${j}`);
        body += `<rect data-square="${i},${j}"${red ? ' data-red="1"' : ''} x="${x0 + i * cell + 4}" y="${y0 + j * cell + 4}" width="${cell - 8}" height="${cell - 8}" rx="12" fill="${red ? RED : pick(others, random)}" stroke="${INK}" stroke-width="4"/>`;
      }
    }
    things.forEach((thing, j) => {
      body +=
        `<circle cx="${x0 + C * cell + 75}" cy="${y0 + j * cell + cell / 2}" r="50" fill="#FFFFFF" stroke="${INK}" stroke-width="6"/>` +
        thingSvg(thing, x0 + C * cell + 75, y0 + j * cell + cell / 2, 70);
    });
    const sy = y0 + path[0][1] * cell + cell / 2;
    body += `<path d="M ${x0 - 110} ${sy} l 70 0 m -16 -16 l 16 16 l -16 16" stroke="${INK}" stroke-width="9" fill="none" stroke-linecap="round"/>`;
    return {
      variant: `red-path:${path.map((p) => p.join(',')).join(' ')}`,
      prompt: PATH_BOMB_PROMPTS['red-path'],
      altText: 'شبكة مربعات ملونة فيها طريق أحمر واحد، وعلى الطرف رسمات',
      concept:
        'Follow the one red way across the board and name what it reaches.',
      factualClaim: `The red way ends on row ${y}: «${answer.ar}».`,
      svg: frame(body),
    };
  }
}

// ---------------------------------------------------------------------------
// «السهم الدوار»
// ---------------------------------------------------------------------------

const TURNS: Array<[string, number]> = [
  ['ثُمن لفة', 1],
  ['ربع لفة', 2],
  ['ثلاث أثمان لفة', 3],
  ['نص لفة', 4],
  ['ثلاث أرباع لفة', 6],
  ['لفة وربع', 10],
];

function spinner(
  answer: DrawnThing,
  pool: readonly DrawnThing[],
  random: () => number,
): PathBomb {
  const N = 8;
  const start = Math.floor(random() * N);
  const [label, steps] = pick(TURNS, random);
  const clockwise = random() < 0.5;
  const end = (((start + (clockwise ? steps : -steps)) % N) + N) % N;
  const things = cast(answer, pool, N, end, random);
  const cx = W / 2 - 120;
  const cy = H / 2;
  const r0 = 230;
  let body = `<circle cx="${cx}" cy="${cy}" r="${r0 + 70}" fill="#FFFFFF" stroke="${INK}" stroke-width="8"/>`;
  things.forEach((thing, k) => {
    const a = (k * 2 * Math.PI) / N - Math.PI / 2;
    body += thingSvg(thing, cx + r0 * Math.cos(a), cy + r0 * Math.sin(a), 84);
  });
  const a = (start * 2 * Math.PI) / N - Math.PI / 2;
  const tip = (r: number, da = 0) =>
    `${round(cx + r * Math.cos(a + da))},${round(cy + r * Math.sin(a + da))}`;
  body +=
    `<line data-points="${start}" x1="${cx}" y1="${cy}" x2="${round(cx + 150 * Math.cos(a))}" y2="${round(cy + 150 * Math.sin(a))}" stroke="${RED}" stroke-width="16" stroke-linecap="round"/>` +
    `<polygon points="${tip(176)} ${tip(140, -0.13)} ${tip(140, 0.13)}" fill="${RED}"/>` +
    `<circle cx="${cx}" cy="${cy}" r="22" fill="${INK}"/>` +
    `<rect x="${W / 2 + 210}" y="${cy - 110}" width="340" height="220" rx="24" fill="#FFF4D6" stroke="${INK}" stroke-width="6"/>` +
    text(label, W / 2 + 380, cy - 10, label.length > 10 ? 34 : 42) +
    text(
      clockwise ? '↻ مع عقارب الساعة' : '↺ عكس عقارب الساعة',
      W / 2 + 380,
      cy + 60,
      28,
    );
  return {
    variant: `spinner:${start}:${clockwise ? '+' : '-'}${steps}`,
    prompt: PATH_BOMB_PROMPTS['spinner'],
    altText: 'دائرة حولها ثمان رسمات وسهم في النص، وجنبها كم يلف',
    concept:
      'Turn the arrow by the stated share of a turn and name what it points at.',
    factualClaim: `${label} ${clockwise ? 'clockwise' : 'anticlockwise'} from position ${start} points at «${answer.ar}».`,
    svg: frame(body),
  };
}

// ---------------------------------------------------------------------------
// «المصعد»
// ---------------------------------------------------------------------------

function elevator(
  answer: DrawnThing,
  pool: readonly DrawnThing[],
  random: () => number,
): PathBomb {
  const floors = 7;
  for (;;) {
    let floor = Math.floor(random() * floors);
    const start = floor;
    const moves: number[] = [];
    while (moves.length < 3) {
      const d = (random() < 0.5 ? -1 : 1) * (1 + Math.floor(random() * 5));
      if (floor + d < 0 || floor + d >= floors) continue;
      if (moves.length && Math.sign(d) === Math.sign(moves[moves.length - 1]))
        continue;
      floor += d;
      moves.push(d);
    }
    if (floor === start) continue;
    const things = cast(answer, pool, floors, floor, random);
    const fh = 84;
    const bx = W / 2 - 220;
    const by = 40;
    let body = `<rect x="${bx}" y="${by}" width="340" height="${floors * fh + 20}" fill="#E7DFD0" stroke="${INK}" stroke-width="8"/>`;
    for (let k = 0; k < floors; k += 1) {
      const y = by + 10 + (floors - 1 - k) * fh;
      body +=
        `<rect data-floor="${k}" x="${bx + 20}" y="${y + 4}" width="200" height="${fh - 8}" rx="10" fill="#FFFFFF" stroke="${INK}" stroke-width="4"/>` +
        thingSvg(things[k], bx + 120, y + fh / 2, 78);
    }
    const ey = by + 10 + (floors - 1 - start) * fh;
    body +=
      `<rect data-lift="${start}" x="${bx + 236}" y="${ey + 4}" width="88" height="${fh - 8}" rx="10" fill="${GOLD}" stroke="${INK}" stroke-width="5"/>` +
      text('▲▼', bx + 280, ey + fh / 2 + 10, 28);
    moves.forEach((d, i) => {
      const y = 170 + i * 150;
      body +=
        `<rect x="${W / 2 + 190}" y="${y - 52}" width="300" height="100" rx="22" fill="#FFF4D6" stroke="${INK}" stroke-width="6"/>` +
        badge(i + 1, W / 2 + 460, y - 2) +
        text(d > 0 ? `يطلع ${d}` : `ينزل ${-d}`, W / 2 + 320, y + 14, 40);
    });
    return {
      variant: `elevator:${start}:${moves.join(',')}`,
      prompt: PATH_BOMB_PROMPTS['elevator'],
      altText: 'عمارة كل دور فيها رسمة، ومصعد أصفر، وجنبها ثلاث حركات',
      concept:
        'Move the lift floor by floor as listed and name the floor it stops at.',
      factualClaim: `From floor ${start}, ${moves.join(', ')} reaches floor ${floor}: «${answer.ar}».`,
      svg: frame(body),
    };
  }
}

// ---------------------------------------------------------------------------
// «الروبوت» — commands relative to where it faces
// ---------------------------------------------------------------------------

const FACING: Array<[number, number]> = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export function runRobot(
  start: [number, number],
  facing: number,
  commands: readonly string[],
  columns: number,
  rows: number,
): [number, number] | null {
  let [x, y] = start;
  let d = facing;
  for (const command of commands) {
    if (command === 'لف يمين') d = (d + 1) % 4;
    else if (command === 'لف يسار') d = (d + 3) % 4;
    else {
      const n = Number(command.split(' ')[1]);
      x += FACING[d][0] * n;
      y += FACING[d][1] * n;
      if (x < 0 || y < 0 || x >= columns || y >= rows) return null;
    }
  }
  return [x, y];
}

function robot(
  answer: DrawnThing,
  pool: readonly DrawnThing[],
  random: () => number,
): PathBomb {
  const C = 5;
  const R = 3;
  const cell = 130;
  for (;;) {
    const start: [number, number] = [
      Math.floor(random() * C),
      Math.floor(random() * R),
    ];
    const facing = Math.floor(random() * 4);
    const commands: string[] = [];
    for (let k = 0; k < 4; k += 1) {
      const turn = k % 2 === 1 && random() < 0.85;
      commands.push(
        turn
          ? pick(['لف يمين', 'لف يسار'], random)
          : `قدّام ${1 + Math.floor(random() * 2)}`,
      );
    }
    if (
      !commands.some((c) => c.startsWith('لف')) ||
      commands[3].startsWith('لف')
    )
      continue;
    const end = runRobot(start, facing, commands, C, R);
    if (!end || (end[0] === start[0] && end[1] === start[1])) continue;
    const things = cast(answer, pool, C * R, end[1] * C + end[0], random);
    const x0 = 110;
    const y0 = 80;
    let body = '';
    for (let j = 0; j < R; j += 1) {
      for (let i = 0; i < C; i += 1) {
        const px = x0 + i * cell;
        const py = y0 + j * cell;
        const here = i === start[0] && j === start[1];
        body +=
          `<rect x="${px + 5}" y="${py + 5}" width="${cell - 10}" height="${cell - 10}" rx="16" fill="#FFFFFF" stroke="${INK}" stroke-width="5"/>` +
          (here
            ? ''
            : thingSvg(things[j * C + i], px + cell / 2, py + cell / 2, 84));
      }
    }
    const rx = x0 + start[0] * cell + cell / 2;
    const ry = y0 + start[1] * cell + cell / 2;
    body +=
      `<g data-robot="${start.join(',')}:${facing}" transform="rotate(${facing * 90} ${rx} ${ry})">` +
      `<circle cx="${rx}" cy="${ry}" r="40" fill="#8C93A8" stroke="${INK}" stroke-width="6"/>` +
      `<polygon points="${rx},${ry - 60} ${rx - 20},${ry - 32} ${rx + 20},${ry - 32}" fill="${RED}" stroke="${INK}" stroke-width="4"/>` +
      `<circle cx="${rx - 13}" cy="${ry - 8}" r="6" fill="${INK}"/><circle cx="${rx + 13}" cy="${ry - 8}" r="6" fill="${INK}"/></g>`;
    commands.forEach((command, i) => {
      const y = 100 + i * 115;
      body +=
        `<rect x="${x0 + C * cell + 50}" y="${y - 44}" width="300" height="90" rx="18" fill="#FFF4D6" stroke="${INK}" stroke-width="6"/>` +
        badge(i + 1, x0 + C * cell + 320, y) +
        text(command, x0 + C * cell + 180, y + 14, 36);
    });
    return {
      variant: `robot:${start.join(',')}:${facing}:${commands.join('|')}`,
      prompt: PATH_BOMB_PROMPTS['robot'],
      altText: 'روبوت في شبكة رسمات، وجنبها أربع أوامر',
      concept:
        'Carry out moves and turns relative to the robot and name where it stops.',
      factualClaim: `Robot at ${start.join(',')} facing ${facing}; ${commands.join(', ')} ends at ${end.join(',')}: «${answer.ar}».`,
      svg: frame(body),
    };
  }
}

export function composePathBomb(
  variantKey: string,
  answer: DrawnThing,
  pool: readonly DrawnThing[],
  random: () => number,
): PathBomb {
  switch (variantKey) {
    case 'arrows':
      return arrows(answer, pool, random);
    case 'ball-drop':
      return ballDrop(answer, pool, random);
    case 'red-path':
      return redPath(answer, pool, random);
    case 'spinner':
      return spinner(answer, pool, random);
    case 'elevator':
      return elevator(answer, pool, random);
    default:
      return robot(answer, pool, random);
  }
}
