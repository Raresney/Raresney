// Generates scanner.svg: a security-scanner beam sweeps the real GitHub
// contribution grid, looping. No dependencies — Node 18+ (native fetch).
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

// escape any dynamic value before embedding it in the SVG (defensive:
// login is a trusted GitHub owner today, but never trust-embed raw markup)
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const beamW = PITCH * 2;
const DUR = 8; // full sweep loop seconds
const startX = MARGIN_X - beamW;
const endX = MARGIN_X + gridW;

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="Security scanner sweeping the contribution graph">
<title>contribution scan — ${esc(login)}</title>
<defs>
<linearGradient id="beam" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#2ee66b" stop-opacity="0"/>
  <stop offset="0.5" stop-color="#9dffc6" stop-opacity="0.9"/>
  <stop offset="1" stop-color="#2ee66b" stop-opacity="0"/>
</linearGradient>
<style>
  rect.bg{fill:#06090d}
  .lbl{font:600 12px 'JetBrains Mono',Consolas,Monaco,monospace;fill:#2ee66b}
  .dim{font:12px 'JetBrains Mono',Consolas,Monaco,monospace;fill:#3a5c49}

  /* beam sweeps left to right, loops */
  .sweep{animation:scan ${DUR}s linear infinite}
  @keyframes scan{
    0%{transform:translateX(${startX}px)}
    100%{transform:translateX(${endX}px)}
  }

  @media (prefers-reduced-motion:reduce){
    .sweep{animation:none;opacity:0}
  }
</style>
</defs>
<rect class="bg" x="0" y="0" width="${W}" height="${H}"/>

<text class="lbl" x="${MARGIN_X}" y="24">rares@kali:~$ ./scan --target contributions</text>
<text class="dim" x="${W - MARGIN_X}" y="24" text-anchor="end">${total} hits [&#9679; LIVE]</text>

<g>${cells}</g>

<g class="sweep">
  <rect x="0" y="${MARGIN_TOP - 3}" width="${beamW}" height="${gridH + 6}" fill="url(#beam)" style="mix-blend-mode:screen"/>
  <rect x="${beamW / 2 - 0.75}" y="${MARGIN_TOP - 6}" width="1.5" height="${gridH + 12}" fill="#e6fff1" style="mix-blend-mode:screen"/>
</g>
</svg>`;

mkdirSync('dist', { recursive: true });
writeFileSync('dist/scanner.svg', svg);
console.log(`Wrote dist/scanner.svg — ${cols} weeks, ${total} contributions, ${W}x${H}`);
