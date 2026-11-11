// Generates scanner.svg: a security-scanner beam sweeps the real GitHub
// contribution grid ONCE, then the signal jams/glitches and the commit
// dots spell "YOU HAVE BEEN HACKED" in red, then recovers and loops.
// No dependencies — Node 18+ (native fetch).
// Env: GITHUB_TOKEN (read-only), GH_LOGIN (user to render).
import { writeFileSync, mkdirSync } from 'node:fs';

const token = process.env.GITHUB_TOKEN;
const login = process.env.GH_LOGIN;
if (!token || !login) {
  console.error('Missing GITHUB_TOKEN or GH_LOGIN');
  process.exit(1);
}

const query = `query($login:String!){
  user(login:$login){
    contributionsCollection{
      contributionCalendar{
        weeks{ contributionDays{ contributionCount weekday contributionLevel } }
      }
    }
  }
}`;

const res = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: {
    Authorization: `bearer ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': 'scanner-generator',
  },
  body: JSON.stringify({ query, variables: { login } }),
});

if (!res.ok) {
  console.error('GraphQL HTTP', res.status, await res.text());
  process.exit(1);
}
const json = await res.json();
if (json.errors) {
  console.error('GraphQL errors', JSON.stringify(json.errors));
  process.exit(1);
}

const weeks = json.data.user.contributionsCollection.contributionCalendar.weeks;

// --- layout ---
const CELL = 11, GAP = 3, PITCH = CELL + GAP;
const MARGIN_X = 18, MARGIN_TOP = 40, MARGIN_BOTTOM = 16;
const cols = weeks.length;
const gridW = cols * PITCH - GAP;
const gridH = 7 * PITCH - GAP;
const W = gridW + MARGIN_X * 2;
const H = gridH + MARGIN_TOP + MARGIN_BOTTOM;

// black -> neon-green ramp
const LEVELS = {
  NONE: '#0e1612',
  FIRST_QUARTILE: '#0f3d2e',
  SECOND_QUARTILE: '#15935f',
  THIRD_QUARTILE: '#27e68a',
  FOURTH_QUARTILE: '#7dffb0',
};

let total = 0;
let cells = '';
weeks.forEach((wk, x) => {
  wk.contributionDays.forEach((d) => {
    total += d.contributionCount;
    const fill = LEVELS[d.contributionLevel] || LEVELS.NONE;
    const cx = MARGIN_X + x * PITCH;
    const cy = MARGIN_TOP + d.weekday * PITCH;
    cells += `<rect x="${cx}" y="${cy}" width="${CELL}" height="${CELL}" rx="2" fill="${fill}"/>`;
  });
});

// --- 5x7 pixel font for the breach message ---
const FONT = {
  'A': ['01110','10001','10001','11111','10001','10001','10001'],
  'B': ['11110','10001','10001','11110','10001','10001','11110'],
  'C': ['01110','10001','10000','10000','10000','10001','01110'],
  'D': ['11110','10001','10001','10001','10001','10001','11110'],
  'E': ['11111','10000','10000','11110','10000','10000','11111'],
  'H': ['10001','10001','10001','11111','10001','10001','10001'],
  'K': ['10001','10010','10100','11000','10100','10010','10001'],
  'N': ['10001','11001','10101','10011','10001','10001','10001'],
  'O': ['01110','10001','10001','10001','10001','10001','01110'],
  'U': ['10001','10001','10001','10001','10001','10001','01110'],
  'V': ['10001','10001','10001','10001','10001','01010','00100'],
  'Y': ['10001','10001','01010','00100','00100','00100','00100'],
  ' ': ['00000','00000','00000','00000','00000','00000','00000'],
};
const MSG = 'YOU HAVE BEEN HACKED';
let colCursor = 0;
let msgPixels = '';
for (const ch of MSG) {
  const g = FONT[ch] || FONT[' '];
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 5; c++) {
      if (g[r][c] === '1') {
        msgPixels += `<rect x="${(colCursor + c) * PITCH}" y="${r * PITCH}" width="${CELL}" height="${CELL}" rx="2" fill="#ff2b3a"/>`;
      }
    }
  }
  colCursor += 6; // 5 wide + 1 gap
}
const msgW = colCursor * PITCH;

// escape any dynamic value before embedding it in the SVG (defensive:
// login is a trusted GitHub owner today, but never trust-embed raw markup)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const beamW = PITCH * 2;
const DUR = 16; // full loop seconds
const startX = MARGIN_X - beamW;
const endX = MARGIN_X + gridW;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Security scanner sweeping the contribution graph, then a breach">
<title>contribution scan — ${esc(login)}</title>
<defs>
<linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#2ee66b" stop-opacity="0"/>
  <stop offset="0.5" stop-color="#9dffc6" stop-opacity="0.9"/>
  <stop offset="1" stop-color="#2ee66b" stop-opacity="0"/>
</linearGradient>
<clipPath id="vp"><rect x="${MARGIN_X}" y="${MARGIN_TOP}" width="${gridW}" height="${gridH}"/></clipPath>
<style>
  rect.bg{fill:#06090d}
  .lbl{font:600 12px 'JetBrains Mono',Consolas,Monaco,monospace}
  .scanlbl{fill:#2ee66b}
  .hacklbl{fill:#ff2b3a}
  .dim{font:12px 'JetBrains Mono',Consolas,Monaco,monospace;fill:#3a5c49}
  .lost{font:600 12px 'JetBrains Mono',Consolas,Monaco,monospace;fill:#ff2b3a}

  /* beam sweeps once (0-40%), then gone */
  .sweep{animation:scan ${DUR}s linear infinite}
  @keyframes scan{
    0%{transform:translateX(${startX}px);opacity:1}
    40%{transform:translateX(${endX}px);opacity:1}
    41%{opacity:0}100%{transform:translateX(${endX}px);opacity:0}
  }

  /* real grid: stable, then glitch-jitters, goes dark during breach, recovers */
  .grid{animation:gridlife ${DUR}s linear infinite}
  @keyframes gridlife{
    0%,41%{opacity:1;transform:translate(0,0)}
    42%{opacity:.6;transform:translate(3px,-2px)}
    43.5%{opacity:1;transform:translate(-4px,1px)}
    45%{opacity:.35;transform:translate(2px,3px)}
    46.5%{opacity:.8;transform:translate(-3px,-2px)}
    48%{opacity:.3;transform:translate(5px,1px)}
    49.5%{opacity:.5;transform:translate(-2px,0)}
    51%{opacity:.07;transform:translate(0,0)}
    89%{opacity:.07}
    92%{opacity:1}100%{opacity:1}
  }

  /* breach message marquee (red commit dots) scrolls across 52-90% */
  .scroll{animation:marquee ${DUR}s linear infinite}
  @keyframes marquee{
    0%,51%{transform:translateX(${gridW}px);opacity:0}
    52%{transform:translateX(${gridW}px);opacity:1}
    90%{transform:translateX(${-msgW}px);opacity:1}
    91%,100%{transform:translateX(${-msgW}px);opacity:0}
  }

  /* glitch bars flicker across during breach */
  .bar{opacity:0}
  .b1{animation:bar1 ${DUR}s steps(1,end) infinite}
  .b2{animation:bar2 ${DUR}s steps(1,end) infinite}
  @keyframes bar1{0%,42%{opacity:0;transform:translateY(0)}43%{opacity:.5;transform:translateY(14px)}44%{opacity:0}57%{opacity:.4;transform:translateY(52px)}58%{opacity:0}71%{opacity:.5;transform:translateY(26px)}72%{opacity:0}85%{opacity:.4;transform:translateY(68px)}86%,100%{opacity:0}}
  @keyframes bar2{0%,45%{opacity:0;transform:translateY(0)}46%{opacity:.4;transform:translateY(80px)}47%{opacity:0}63%{opacity:.5;transform:translateY(40px)}64%{opacity:0}78%{opacity:.4;transform:translateY(12px)}79%,100%{opacity:0}}

  /* label cross-fade: green scan -> red breach -> back */
  .scanlbl,.dim{animation:showScan ${DUR}s linear infinite}
  @keyframes showScan{0%,40%{opacity:1}41%,92%{opacity:0}95%,100%{opacity:1}}
  .hacklbl,.lost{animation:showHack ${DUR}s steps(1,end) infinite}
  @keyframes showHack{0%,41%{opacity:0}43%{opacity:1}50%{opacity:.4}51%{opacity:1}90%{opacity:1}91%,100%{opacity:0}}

  @media (prefers-reduced-motion:reduce){
    .sweep,.scroll,.bar{animation:none;opacity:0}
    .grid{animation:none;opacity:1}
    .scanlbl,.dim{animation:none;opacity:1}
    .hacklbl,.lost{animation:none;opacity:0}
  }
</style>
</defs>
<rect class="bg" x="0" y="0" width="${W}" height="${H}"/>

<text class="lbl scanlbl" x="${MARGIN_X}" y="24">rares@kali:~$ ./scan --target contributions</text>
<text class="dim" x="${W - MARGIN_X}" y="24" text-anchor="end">${total} hits [&#9679; LIVE]</text>
<text class="lbl hacklbl" x="${MARGIN_X}" y="24">!! SIGNAL JAMMED &#8212; BREACH DETECTED</text>
<text class="lost" x="${W - MARGIN_X}" y="24" text-anchor="end">[&#10007; SIGNAL LOST]</text>

<g class="grid">${cells}</g>

<g clip-path="url(#vp)">
  <g transform="translate(${MARGIN_X} ${MARGIN_TOP})"><g class="scroll">${msgPixels}</g></g>
  <rect class="bar b1" x="${MARGIN_X}" y="${MARGIN_TOP}" width="${gridW}" height="4" fill="#ff2b3a"/>
  <rect class="bar b2" x="${MARGIN_X}" y="${MARGIN_TOP}" width="${gridW}" height="3" fill="#9dffc6"/>
</g>

<g class="sweep">
  <rect x="0" y="${MARGIN_TOP - 3}" width="${beamW}" height="${gridH + 6}" fill="url(#beam)" style="mix-blend-mode:screen"/>
  <rect x="${beamW / 2 - 0.75}" y="${MARGIN_TOP - 6}" width="1.5" height="${gridH + 12}" fill="#e6fff1" style="mix-blend-mode:screen"/>
</g>
</svg>`;

mkdirSync('dist', { recursive: true });
writeFileSync('dist/scanner.svg', svg);
console.log(`Wrote dist/scanner.svg — ${cols} weeks, ${total} contributions, msg ${colCursor} cols, ${W}x${H}`);
