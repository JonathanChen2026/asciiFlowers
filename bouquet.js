// ASCII lilies: the scene is painted with vector shapes onto a tiny offscreen
// canvas (one pixel per character cell), then every pixel is redrawn as a
// coloured ASCII glyph whose density follows the pixel's brightness.
//
// The bloom follows how cut lilies actually open: a bunch of tall leafy stems,
// each ending in a cluster of long green buds. Buds swell and blush, then split
// into six tepals that curl back to show the stamens. Some buds stay green.
(() => {
  'use strict';

  const RAMP = ' .:-=+*cxoaX#%&@';
  const WORLD_W = 1000;
  const WORLD_H = 1100;
  const FPS = 30;
  const PLAYBACK_RATE = 1.5;
  const INTRO_DURATION = 0.78;

  const PALETTES = [
    { // pink lilies, like the photos
      petal: '#f39ab2', edge: '#f9c3d2', blush: '#d99aa6', throat: '#c9dc78', vein: 'rgba(170,40,80,0.45)',
      anther: '#4a1d10', spots: true,
    },
    { // white oriental lilies
      petal: '#f6f2ea', edge: '#ffffff', blush: '#d8dcc0', throat: '#c8d87a', vein: 'rgba(120,130,90,0.4)',
      anther: '#8a3a16', spots: false,
    },
    { // mixed garden, like the ASCII video
      petal: ['#e3233a', '#d24aa9', '#f08a2a', '#e9c63c', '#f1e4c6', '#f39ab2'], edge: null,
      blush: '#c98a7a', throat: '#e8d070', vein: 'rgba(80,10,20,0.45)', anther: '#3a160a', spots: true,
    },
  ];

  // ---------- helpers ----------
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (T, start, dur) => clamp((T - start) / dur, 0, 1);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const smooth = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  const rad = (d) => (d * Math.PI) / 180;

  function rgbOf(c) {
    if (c[0] === '#') {
      const n = parseInt(c.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return c.match(/\d+/g).slice(0, 3).map(Number);
  }
  function mix(a, b, t) {
    const A = rgbOf(a), B = rgbOf(b);
    return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
  }

  function bez(p, t) {
    const u = 1 - t;
    return [
      u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
      u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1],
    ];
  }
  function bezAngle(p, t) {
    const a = bez(p, Math.max(0, t - 0.01)), b = bez(p, Math.min(1, t + 0.01));
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  }

  // Gentle breeze: higher points drift further, so the whole bunch bends together.
  let T = 0;
  function sway(x, y) {
    const lift = clamp((1090 - y) / 800, 0, 1);
    const spread = (x - WORLD_W / 2) * 0.12 * lift;
    return [x + spread + Math.sin(T * 0.9 + y * 0.006) * 8 * lift + Math.sin(T * 0.43 + x * 0.004) * 4 * lift, y];
  }

  // ---------- scene ----------
  // Timeline (seconds): stems rise, leaves unfurl, buds swell and blush, then open one by one.
  const STEM_START = 0, STEM_DUR = 2.6;
  const LEAF_START = 1.0;
  const BUD_START = 2.2;
  const BLUSH_START = 3.6;
  const OPEN_START = 5.0, OPEN_GAP = 0.85, OPEN_DUR = 3.2;
  const LAST_PINK_BLOOM = 6;
  const RED_BUD_TIPS = { 18: [28, -65, -78], 19: [90, -18, -38], 20: [-65, -12, -142] };

  function buildScene() {
    const r = rng(11);
    const S = { stems: [], leaves: [], buds: [] };

    // [top x, top y, side pedicels]
    const tops = [
      [310, 470, 2], [395, 360, 2], [500, 300, 3], [600, 350, 2],
      [700, 420, 2], [740, 500, 1], [350, 560, 1], [650, 560, 1],
    ];
    for (const [tx, ty, sides] of tops) {
      const bx = 485 + r() * 30;
      const stem = [[bx, 1090], [bx + (tx - bx) * 0.1, 860], [lerp(bx, tx, 0.7), ty + 220], [tx, ty]];
      const lean = (tx - 500) * 0.1;
      const stemRef = { pts: stem, start: STEM_START + r() * 0.4 };
      S.stems.push(stemRef);

      // lance-shaped leaves spiral up the middle of each stem
      const n = 5 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const t = 0.22 + (i / n) * 0.5 + r() * 0.04;
        const side = i % 2 ? 1 : -1;
        S.leaves.push({
          stem, t, side, len: 85 + r() * 55, w: 13 + r() * 6,
          spread: rad(28 + r() * 26), start: LEAF_START + t * 1.5 + r() * 0.3, tint: r(),
        });
      }

      // buds: one at the tip, the rest on short pedicels branching just below it
      S.buds.push({ stem, stemRef, at: 1, ped: null, dir: rad(-90 + lean + (r() - 0.5) * 10) });
      for (let k = 0; k < sides; k++) {
        const side = k % 2 ? 1 : -1;
        const at = 0.82 + r() * 0.12;
        const base = bez(stem, at);
        const ang = rad(-90 + lean + side * (30 + r() * 25));
        const len = 40 + r() * 45;
        const end = [base[0] + Math.cos(ang) * len, base[1] + Math.sin(ang) * len];
        const ped = [base, [lerp(base[0], end[0], 0.3), base[1] - len * 0.35], [lerp(base[0], end[0], 0.8), lerp(base[1], end[1], 0.7)], end];
        S.buds.push({ stem, stemRef, at, ped, dir: ang });
      }
    }

    // decide each bud's fate: about half open fully, a few only blush, the rest stay green
    const order = S.buds.map((_, i) => i).sort(() => r() - 0.5);
    order.forEach((idx, rank) => {
      const b = S.buds[idx];
      b.len = 120 + r() * 40;
      b.width = 19 + r() * 5;
      b.squash = 0.6 + r() * 0.25;
      b.twist = (r() - 0.5) * 0.8;
      b.droop = rad((b.dir > rad(-90) ? 1 : -1) * (15 + r() * 20));
      b.colorIdx = rank;
      b.rnd = Array.from({ length: 12 }, r);
      // The upper stem uses the final half of the cubic easing curve.
      const attach = 1 - Math.cbrt((1 - b.at) / 4);
      b.stalkStart = b.stemRef.start + STEM_DUR * attach;
      b.grow = Math.max(BUD_START + r() * 1.2, b.stalkStart + (b.ped ? 1 : 0));
      b.white = rank === 7 || rank === 8;
      const redTip = RED_BUD_TIPS[rank];
      b.red = Boolean(redTip);
      if (rank < 7) {
        b.maxOpen = 1; b.blush = 1; b.openAt = OPEN_START + rank * OPEN_GAP + r() * 0.3;
      } else if (rank < 11) {
        b.maxOpen = b.white ? 1 : 0.08;
        b.blush = 0.8;
        b.openAt = OPEN_START + 2 + r() * 4;
      } else {
        b.maxOpen = 0; b.blush = 0.1 + r() * 0.2; b.openAt = Infinity; b.len *= 0.75;
      }
      if (b.red) {
        b.blush = 1;
        b.len *= 0.75;
        b.width *= 0.8;
        if (b.ped) {
          const [dx, dy, angle] = redTip;
          b.ped[2][0] += dx * 0.5;
          b.ped[2][1] += dy * 0.5;
          b.ped[3][0] += dx;
          b.ped[3][1] += dy;
          b.dir = rad(angle);
        }
      }
    });
    // Use the mature depth order throughout the animation to avoid swapping overlaps mid-bloom.
    S.buds.sort((a, b) => a.maxOpen - b.maxOpen || a.openAt - b.openAt);
    addFillers(S);
    return S;
  }

  // Ruscus and baby's breath fill out the bunch around the lilies.
  const RUSCUS_START = 0.6;
  const GYP_START = 2.4;

  function addFillers(S) {
    const r = rng(29);
    S.ruscus = [];
    S.gyp = [];

    // ruscus: long arching sprigs with glossy leaves alternating up the stem
    const sprig = (base, ang, len, start, depth) => {
      const end = [base[0] + Math.cos(ang) * len, base[1] + Math.sin(ang) * len];
      const bend = (r() - 0.5) * len * 0.3;
      const pts = [base, [lerp(base[0], end[0], 0.33) + bend, lerp(base[1], end[1], 0.33)],
        [lerp(base[0], end[0], 0.7) + bend * 0.5, lerp(base[1], end[1], 0.7)], end];
      const leaves = [];
      for (let t = 0.2 + r() * 0.08, i = 0; t <= 1; t += 0.075 + r() * 0.035, i++) {
        leaves.push({ t, side: i % 2 ? 1 : -1, len: 34 + r() * 18, w: 10 + r() * 4, tint: r() });
      }
      leaves.push({ t: 1, side: 0, len: 46 + r() * 16, w: 11, tint: r() });
      S.ruscus.push({ pts, leaves, start });
      if (depth > 0) {
        for (let k = 0; k < 2; k++) {
          const t = 0.35 + r() * 0.35;
          const p = bez(pts, t);
          const side = k ? 1 : -1;
          sprig(p, ang + side * rad(25 + r() * 20), len * (0.4 + r() * 0.2), start + t * 1.4, depth - 1);
        }
      }
    };
    // a few sprigs tucked behind the lilies, ending just inside the bouquet's outline
    for (const end of [[210, 560], [270, 340], [420, 215], [600, 205], [750, 320], [810, 560]]) {
      const base = [490 + r() * 20, 820 - r() * 40];
      const ang = Math.atan2(end[1] - base[1], end[0] - base[0]);
      sprig(base, ang, Math.hypot(end[0] - base[0], end[1] - base[1]), RUSCUS_START + r() * 0.8, 0);
    }

    // baby's breath: thin stems that fork again and again into clouds of tiny white flowers
    // small sprays tucked between the lilies, as in a florist's bouquet
    const clouds = [
      [340, 460], [660, 430], [500, 330], [280, 610], [740, 610],
      [450, 610], [590, 640], [400, 340], [620, 340], [520, 520],
    ];
    clouds.forEach(([cx, cy], ci) => {
      const base = [485 + r() * 30, 1000 + r() * 60];
      const start = GYP_START + ci * 0.12 + r() * 0.4;
      const outward = Math.atan2(cy - 620, cx - 500);
      const segs = [], flowers = [];
      const branch = (x, y, ang, len, depth, t) => {
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        segs.push({ x, y, x2, y2, t, w: 1.5 + depth * 0.8 });
        const t2 = t + 0.18;
        if (depth === 0) {
          flowers.push({ x: x2, y: y2, s: 4.5 + r() * 3.5, t: t2 + r() * 0.3, puffs: 2 + Math.floor(r() * 2) });
          return;
        }
        if (depth < 3 && r() < 0.75) flowers.push({ x: x2, y: y2, s: 3.5 + r() * 2.5, t: t2 + r() * 0.3, puffs: 1 });
        const kids = 2 + (r() < 0.45 ? 1 : 0);
        for (let k = 0; k < kids; k++) {
          const spread = rad(lerp(-70, 70, kids === 1 ? 0.5 : k / (kids - 1)) + (r() - 0.5) * 30);
          // children lean back toward upward/outward so the cloud stays rounded
          const target = lerp(ang + spread, outward, 0.25);
          branch(x2, y2, target, len * (0.4 + r() * 0.45), depth - 1, t2);
        }
      };
      const main = [[base[0], base[1]], [lerp(base[0], cx, 0.2), lerp(base[1], cy, 0.5)], [lerp(base[0], cx, 0.8), cy + 60], [cx, cy + 40]];
      branch(cx, cy + 40, outward * 0.5 - Math.PI / 4, 40 + r() * 10, 4, 0.6);
      S.gyp.push({ main, segs, flowers, start, front: ci % 2 === 1 });
    });
  }

  // ---------- drawing ----------
  function strokeCurve(g, pts, from, upto, width, color) {
    if (upto <= from) return;
    const N = 36;
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const p = bez(pts, lerp(from, upto, i / N));
      const q = sway(p[0], p[1]);
      i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]);
    }
    g.lineWidth = width;
    g.strokeStyle = color;
    g.lineCap = 'round';
    g.stroke();
  }

  function stemProgress(st) {
    return easeInOut(prog(T, st.start, STEM_DUR));
  }

  function drawLeaf(g, lf) {
    const p = easeOut(prog(T, lf.start, 1.4));
    if (!p) return;
    const a = bez(lf.stem, lf.t);
    const [x, y] = sway(a[0], a[1]);
    const ang = bezAngle(lf.stem, lf.t) + lf.side * lf.spread * (0.4 + 0.6 * p);
    const L = lf.len * p, W = lf.w * (0.4 + 0.6 * p);
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    // the tip arches away from the stem
    const bend = lf.side * L * 0.18;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(L * 0.3, -W, L * 0.7, -W * 0.8 + bend * 0.5, L, bend);
    g.bezierCurveTo(L * 0.7, W * 0.8 + bend * 0.5, L * 0.3, W, 0, 0);
    const grad = g.createLinearGradient(0, 0, L, 0);
    grad.addColorStop(0, '#2e6e22');
    grad.addColorStop(0.5, lf.tint > 0.5 ? '#4c9a2e' : '#3f8a2a');
    grad.addColorStop(1, '#78bc44');
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 5;
    g.stroke();
    g.strokeStyle = 'rgba(20,60,15,0.8)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.6, bend * 0.3, L * 0.95, bend * 0.95); g.stroke();
    g.restore();
  }

  // One tepal along +x. Closed, six of these overlap into the club-shaped bud;
  // open, they fan out and their tips sag in the direction of gravity.
  function tepal(g, L, W, color, edge, throat, vein, open, curl, spots, rnd, shade, sagX, sagY) {
    const rc = smooth(0.45, 1, open);
    const bend = curl * W * 0.95 * rc;
    const tipX = L * (1 - 0.09 * rc) + sagX;
    const tipY = bend + sagY;
    const outerX = L * 0.72 + sagX * 0.42;
    const outerY = bend * 0.3 + sagY * 0.42;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(L * 0.3, -W * 0.85, outerX, outerY - W * 1.05, tipX, tipY);
    g.bezierCurveTo(outerX, outerY + W * 1.05, L * 0.3, W * 0.85, 0, 0);
    const grad = g.createLinearGradient(0, -W * shade, L, W * shade);
    grad.addColorStop(0, throat);
    grad.addColorStop(lerp(0.45, 0.22, open), shade ? mix(color, '#515b54', shade) : color);
    if (shade) grad.addColorStop(0.68, color);
    grad.addColorStop(1, edge);
    g.fillStyle = grad;
    g.fill();
    // seam on the bud, nectar groove on the open tepal
    g.strokeStyle = open > 0.2 ? vein : 'rgba(40,70,20,0.55)';
    g.lineWidth = lerp(5, 3, rc);
    g.beginPath(); g.moveTo(L * 0.05, 0); g.quadraticCurveTo(tipX * 0.42, tipY * 0.12, tipX * 0.68, tipY * 0.48); g.stroke();
    if (spots && open > 0.6) {
      g.fillStyle = `rgba(110,15,40,${(open - 0.6) * 2})`;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(L * (0.18 + rnd[i] * 0.22), (rnd[i + 4] - 0.5) * W * 0.8, 3.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  function budState(b) {
    const grow = easeOut(prog(T, b.grow, 2.2));
    const blush = smooth(0, 1, prog(T, BLUSH_START + (b.grow - BUD_START), 2.5)) * b.blush;
    const open = easeInOut(prog(T, b.openAt, OPEN_DUR)) * b.maxOpen;
    return { grow, blush, open };
  }

  function drawBud(g, b, pal) {
    if (b.ped) {
      const pp = easeOut(prog(T, b.stalkStart, 1));
      strokeCurve(g, b.ped, 0, pp, 5, '#5f9a34');
    }
    const { grow, blush, open } = budState(b);
    if (!grow) return;

    const base = b.ped ? b.ped[3] : bez(b.stem, 1);
    const [x, y] = sway(base[0], base[1]);
    if (pal === PALETTES[0] && b.white) pal = PALETTES[1];
    const white = pal === PALETTES[1];
    const multi = Array.isArray(pal.petal);
    const petal = multi ? pal.petal[b.colorIdx % pal.petal.length] : pal.petal;
    const edge = pal.edge || mix(petal, '#ffffff', 0.25);

    // bud colour: green → dusty pink as it matures → petal colour as it opens
    const budCol = mix('#9cc63e', b.red ? '#cb233c' : pal.blush, blush);
    const color = mix(budCol, petal, smooth(0.05, 0.45, open));
    const edgeCol = mix(mix('#b4d860', b.red ? '#ff655f' : pal.blush, blush), edge, smooth(0.05, 0.45, open));
    const throat = mix('#8fbf3a', white ? '#777a3e' : pal.throat, open);

    const L = b.len * (1 + 0.3 * open);
    const W = b.width * (1 + 1.4 * open);
    const weight = smooth(0.18, 1, open);
    const nod = Math.sin(T * 0.85 + b.colorIdx * 0.8) * rad(2.5) * weight;
    const headAngle = b.dir + b.droop * 1.22 * weight + nod;
    const squash = lerp(1, white ? Math.max(b.squash, 0.85) : b.squash, open);
    const twist = b.twist * open;

    g.save();
    g.translate(x, y);
    g.rotate(headAngle);
    g.scale(grow, grow * squash);
    // short green receptacle where the bud meets the pedicel
    g.fillStyle = '#5f9a34';
    g.beginPath(); g.ellipse(0, 0, 9, 7, 0, 0, Math.PI * 2); g.fill();
    g.rotate(twist);
    // Convert screen-down into the unscaled coordinates of the flower.
    const downX = Math.sin(headAngle);
    const downY = Math.cos(headAngle) / squash;
    const vein = white ? 'rgba(111,119,75,0.42)' : pal.vein;
    // back three tepals first, then the front three
    for (const k of [3, 1, -1, 2, -2, 0]) {
      g.save();
      const variation = b.rnd[k + 3] - 0.5;
      const unfurl = open + variation * 0.62 * open * (1 - open);
      const fan = rad(k * 60 * unfurl + variation * 17 * open);
      g.rotate(fan);
      const length = L * (1 + variation * 0.22 * open);
      const curl = k === 0 ? 0.3 : Math.sign(k);
      const shade = white ? weight * (Math.abs(k) % 2 ? 0.48 : 0.32) : 0;
      const droop = length * weight * (0.17 + b.rnd[k + 6] * 0.12);
      const angle = twist + fan;
      const sagX = droop * (downX * Math.cos(angle) + downY * Math.sin(angle));
      const sagY = droop * (downY * Math.cos(angle) - downX * Math.sin(angle));
      tepal(g, length, W, color, edgeCol, throat, vein, unfurl, curl, pal.spots, b.rnd, shade, sagX, sagY);
      g.restore();
    }
    // stamens and pistil reach out once the tepals have parted
    const st = smooth(0.55, 1, open);
    if (st > 0) {
      if (white) {
        g.fillStyle = '#a4a151';
        g.beginPath(); g.ellipse(0, 0, 16 * st, 13 * st, 0, 0, Math.PI * 2); g.fill();
      }
      for (let i = 0; i < 6; i++) {
        const a = rad(white ? -55 + i * 20 : -28 + i * 11);
        const l = L * (white ? 0.56 : 0.72) * st * (0.92 + b.rnd[i] * 0.16);
        g.strokeStyle = white ? '#9e9d44' : '#d6dca8';
        g.lineWidth = white ? 5 : 3;
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(l * 0.5, a * l * 0.3, Math.cos(a) * l, Math.sin(a) * l); g.stroke();
        g.fillStyle = white ? '#a7481c' : pal.anther;
        g.beginPath(); g.ellipse(Math.cos(a) * l, Math.sin(a) * l, 11, white ? 6.5 : 4.5, a + Math.PI / 2, 0, Math.PI * 2); g.fill();
      }
      const pl = L * 0.82 * st;
      g.strokeStyle = '#cfe0a0';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(pl, 0); g.stroke();
      g.fillStyle = '#86a83c';
      g.beginPath(); g.arc(pl, 0, 7, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  function leafShape(g, L, W, bend) {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(L * 0.25, -W, L * 0.7, -W * 0.8 + bend * 0.5, L, bend);
    g.bezierCurveTo(L * 0.7, W * 0.8 + bend * 0.5, L * 0.25, W, 0, 0);
  }

  function drawRuscus(g, S) {
    for (const sp of S.ruscus) {
      const p = easeOut(prog(T, sp.start, 2.2));
      if (!p) continue;
      strokeCurve(g, sp.pts, 0, p, 4, '#4f7a34');
      for (const lf of sp.leaves) {
        const lp = easeOut(prog(p, lf.t - 0.04, 0.22));
        if (!lp) continue;
        const a = bez(sp.pts, lf.t);
        const [x, y] = sway(a[0], a[1]);
        g.save();
        g.translate(x, y);
        g.rotate(bezAngle(sp.pts, lf.t) + lf.side * rad(38));
        const L = lf.len * lp, W = lf.w * lp;
        leafShape(g, L, W, lf.side * L * 0.08);
        const grad = g.createLinearGradient(0, -W, L, W);
        grad.addColorStop(0, lf.tint > 0.5 ? '#356a2c' : '#2c5f30');
        grad.addColorStop(0.55, lf.tint > 0.5 ? '#5aa046' : '#4c9240');
        grad.addColorStop(1, '#3a7436');
        g.fillStyle = grad;
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.6)';
        g.lineWidth = 4;
        g.stroke();
        g.strokeStyle = 'rgba(150,190,110,0.5)';
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.85, lf.side * L * 0.06); g.stroke();
        g.restore();
      }
    }
  }

  function drawGyp(g, S, front) {
    for (const c of S.gyp) {
      if (c.front !== front) continue;
      const p = prog(T, c.start, 3.2);
      if (!p) continue;
      strokeCurve(g, c.main, 0, easeOut(Math.min(1, p * 3)), 3, '#6b8a4a');
      const local = p * 3.2 - 0.6; // seconds since the branching began
      g.strokeStyle = '#6f8f50';
      for (const sg of c.segs) {
        const k = clamp((local - sg.t) / 0.25, 0, 1);
        if (!k) continue;
        const [x, y] = sway(sg.x, sg.y), [x2, y2] = sway(sg.x2, sg.y2);
        g.lineWidth = sg.w;
        g.beginPath(); g.moveTo(x, y); g.lineTo(lerp(x, x2, k), lerp(y, y2, k)); g.stroke();
      }
      for (const f of c.flowers) {
        const k = easeOut(clamp((local - f.t) / 0.5, 0, 1));
        if (!k) continue;
        const [x, y] = sway(f.x, f.y);
        const tw = 0.88 + 0.12 * Math.sin(T * 2.5 + f.x * 0.3);
        g.fillStyle = `rgba(252,250,244,${tw})`;
        for (let i = 0; i < f.puffs; i++) {
          g.beginPath();
          g.arc(x + (i - (f.puffs - 1) / 2) * f.s * 0.9, y - (i % 2) * f.s * 0.6, f.s * k, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }

  function drawScene(g, S, pal) {
    drawRuscus(g, S);
    drawGyp(g, S, false);
    for (const st of S.stems) strokeCurve(g, st.pts, 0, stemProgress(st), 9, '#5a9a30');
    for (const lf of S.leaves) drawLeaf(g, lf);
    for (const b of S.buds) {
      if (pal === PALETTES[0] && (b.white || b.colorIdx === LAST_PINK_BLOOM)) continue;
      drawBud(g, b, pal);
    }
    drawGyp(g, S, true);
    if (pal === PALETTES[0]) {
      for (const b of S.whiteLilies) drawBud(g, b, pal);
    }
  }

  // ---------- ascii renderer ----------
  const screen = document.getElementById('screen');
  const sctx = screen.getContext('2d');
  const off = document.createElement('canvas');
  const octx = off.getContext('2d', { willReadFrequently: true });

  function buildTitle(message) {
    const font = 'bold 96px Georgia, "Times New Roman", serif';
    const padding = 8;
    const tracking = 7;
    const mask = document.createElement('canvas');
    const ctx = mask.getContext('2d');
    ctx.font = font;
    const metrics = ctx.measureText(message);
    let x = padding;
    const letters = Array.from(message, letter => {
      const position = x;
      x += ctx.measureText(letter).width + tracking;
      return { letter, x: position };
    });
    const width = Math.ceil(x - tracking + padding);
    const baseline = Math.ceil(padding + metrics.actualBoundingBoxAscent);
    const height = Math.ceil(baseline + metrics.actualBoundingBoxDescent + padding);
    mask.width = width;
    mask.height = height;
    ctx.font = font;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#fff';

    // Use the font's own contours for both outlines, with a uniform gap.
    ctx.lineWidth = 10;
    for (const letter of letters) ctx.strokeText(letter.letter, letter.x, baseline);
    ctx.globalCompositeOperation = 'destination-out';
    ctx.lineWidth = 4;
    for (const letter of letters) ctx.strokeText(letter.letter, letter.x, baseline);

    const pixels = ctx.getImageData(0, 0, width, height).data;
    const cells = [];
    const stepX = 2.25;
    const stepY = 2.45;
    for (let y = stepY / 2; y < height; y += stepY) {
      for (let x = stepX / 2; x < width; x += stepX) {
        const i = (Math.floor(y) * width + Math.floor(x)) * 4 + 3;
        if (pixels[i] < 116) continue;
        const seed = Math.floor(x * 19 + y * 23);
        const delay = (1 - y / height) * 0.34 + (seed % 11) * 0.008;
        cells.push({ x, y, seed, delay });
      }
    }
    return { cells, width, height, stepX };
  }

  const title = buildTitle(screen.getAttribute('aria-label'));

  function drawTitle(elapsed, centerY, bouquetPixels) {
    const width = Math.min(viewportWidth * 0.94, Math.max(viewportWidth * 0.65, 500), viewportHeight * 1.19);
    const scaleX = width / title.width;
    const scaleY = scaleX * 1.28;
    const x0 = (viewportWidth - width) / 2;
    const y0 = centerY - title.height * scaleY / 2;
    const tick = Math.floor(elapsed * 22);
    sctx.save();
    sctx.font = `bold ${title.stepX * scaleX * 1.68}px Menlo, Consolas, "DejaVu Sans Mono", monospace`;
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillStyle = PALETTES[1].petal;
    for (const cell of title.cells) {
      const age = elapsed - cell.delay;
      if (age <= 0) continue;
      const x = x0 + cell.x * scaleX;
      const y = y0 + cell.y * scaleY;
      // Hide lit title cells wherever the bouquet passes in front.
      const i = (Math.floor(y / cellH) * cols + Math.floor(x / cellW)) * 4;
      if (Math.max(bouquetPixels[i], bouquetPixels[i + 1], bouquetPixels[i + 2]) >= 17) continue;
      sctx.globalAlpha = smooth(0, 0.24, age);
      const glyph = age < 0.2
        ? RAMP[1 + (cell.seed + tick * 7) % (RAMP.length - 1)]
        : '#';
      sctx.fillText(glyph, x, y);
    }
    sctx.restore();
  }

  let cols = 0, rows = 0, cellW = 0, cellH = 0, dpr = 1;
  let viewportWidth = 0, viewportHeight = 0;
  const styleCache = new Map();
  function style(r, g, b) {
    const key = (r << 16) | (g << 8) | b;
    let s = styleCache.get(key);
    if (!s) { s = `rgb(${r},${g},${b})`; styleCache.set(key, s); }
    return s;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    viewportWidth = window.innerWidth;
    viewportHeight = window.innerHeight;
    const fontSize = clamp(Math.floor(Math.min(viewportWidth / 130, viewportHeight / 110)), 5, 9);
    screen.width = Math.round(viewportWidth * dpr);
    screen.height = Math.round(viewportHeight * dpr);
    // Resizing the canvas resets the context, including the font.
    sctx.font = `bold ${fontSize}px Menlo, Consolas, "DejaVu Sans Mono", monospace`;
    sctx.textBaseline = 'top';
    cellW = sctx.measureText('M').width || fontSize * 0.6;
    cellH = fontSize;
    cols = Math.ceil(viewportWidth / cellW);
    rows = Math.ceil(viewportHeight / cellH);
    off.width = cols;
    off.height = rows;
  }

  function render(S, pal, elapsed) {
    // Fit the bouquet in CSS pixels so denser cells keep the same composition scale.
    const scale = Math.min(viewportWidth / WORLD_W, viewportHeight / WORLD_H) * 0.96;
    const dx = (viewportWidth - WORLD_W * scale) / 2;
    const dy = (viewportHeight - WORLD_H * scale) / 2;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.fillStyle = '#000';
    octx.fillRect(0, 0, cols, rows);
    octx.setTransform(scale / cellW, 0, 0, scale / cellH, dx / cellW, dy / cellH);

    if (T > 0) drawScene(octx, S, pal);

    const data = octx.getImageData(0, 0, cols, rows).data;
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, screen.width, screen.height);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // Keep the glow close to the glyphs so fine outlines stay legible.
    sctx.save();
    sctx.globalAlpha = 0.23;
    sctx.filter = `blur(${cellH * dpr * 0.24}px)`;
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(off, 0, 0, cols * cellW, rows * cellH);
    sctx.restore();
    drawTitle(elapsed, dy + 151 * scale, data);
    const n = RAMP.length - 1;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const m = Math.max(r, g, b);
        if (m < 17) continue;
        const v = m / 255;
        const idx = Math.max(1, Math.round(Math.pow(v, 0.79) * n));
        const k = 0.92 + 0.19 * v;
        sctx.fillStyle = style(Math.min(255, (r * k) | 0) & 0xf8, Math.min(255, (g * k) | 0) & 0xf8, Math.min(255, (b * k) | 0) & 0xf8);
        sctx.fillText(RAMP[idx], x * cellW, y * cellH);
      }
    }
  }

  // ---------- loop ----------
  const S = buildScene();
  S.whiteLilies = S.buds.filter(b => b.white);
  let palette = 0;
  let t0 = performance.now();
  let last = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const interval = 1000 / FPS;
    const elapsed = now - last;
    if (elapsed < interval) return;
    last = now - elapsed % interval;
    const seconds = (now - t0) / 1000;
    T = Math.max(0, (seconds - INTRO_DURATION) * PLAYBACK_RATE);
    render(S, PALETTES[palette], seconds);
  }

  const replay = () => { t0 = performance.now(); };
  window.addEventListener('resize', resize);
  screen.addEventListener('click', replay);
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'r') replay();
    if (e.key === 'p' || e.key === 'c') { palette = (palette + 1) % PALETTES.length; replay(); }
  });

  // ?t=8 starts 8s into the bloom, ?p=1 picks a palette
  const q = new URLSearchParams(location.search);
  if (q.has('p')) palette = clamp(+q.get('p') | 0, 0, PALETTES.length - 1);
  if (q.has('t')) t0 -= (INTRO_DURATION + +q.get('t') / PLAYBACK_RATE) * 1000;

  resize();
  requestAnimationFrame(frame);
})();
