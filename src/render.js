/* Draws a diagram as SVG. The same drawing serves the board (with the grid, tap targets and the
   selection shown) and a downloaded picture (clean, cropped to a frame). Every color and size is
   written on the shapes themselves, so a saved picture needs no style sheet.
   Marks follow the Geometric Interactive Notes look: ticks, arcs, right-angle boxes and parallel
   arrows in red, highlights in thicker red. */
const Render = (() => {
  'use strict';
  const U = 20;   // drawing units for one grid square
  const COLOR = { ink: '#3b2f25', hl: '#94401c', halo: '#f3d9c4', grid: '#c9b89c', paper: '#fffdf8', shades: ['#f6ead2', '#f0d6bb', '#e8c3a6', '#dcb0a0'] };     // sand, peach, clay, rose: warm, and each a step darker
  const BW = { ink: '#000000', hl: '#000000', halo: '#dddddd', grid: '#999999', paper: '#ffffff', shades: ['#eeeeee', '#dcdcdc', '#c8c8c8', '#b4b4b4'] };
  const FONT = 'Lato, Helvetica, Arial, sans-serif';

  function el(ns, name, attrs, parent) {
    const e = document.createElementNS(ns, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  // Where the path from P in direction d meets the frame, a little inside its edge.
  function edge(P, d, f, m) {
    let t = Infinity;
    if (d.x > 0) t = Math.min(t, (f.x1 - m - P.x) / d.x);
    if (d.x < 0) t = Math.min(t, (f.x0 + m - P.x) / d.x);
    if (d.y > 0) t = Math.min(t, (f.y1 - m - P.y) / d.y);
    if (d.y < 0) t = Math.min(t, (f.y0 + m - P.y) / d.y);
    t = Math.max(0, t);
    return { x: P.x + d.x * t, y: P.y + d.y * t };
  }
  // The two ends a piece is drawn between, and which ends carry an arrowhead.
  function ends(doc, k, f) {
    const A = Model.point(doc, k.a), B = Model.point(doc, k.b), d = { x: B.x - A.x, y: B.y - A.y };
    if (k.kind === 'segment') return { P: A, Q: B, arrows: [false, false] };
    if (k.kind === 'ray') return { P: A, Q: edge(B, d, f, 0.3), arrows: [false, true] };
    return { P: edge(A, { x: -d.x, y: -d.y }, f, 0.3), Q: edge(B, d, f, 0.3), arrows: [true, true] };
  }

  /* o.frame: the part of the grid to show, in grid units (default: all of it).
     o.grid: show the grid dots.   o.bw: black and white.   o.bold: thicker lines and bigger letters.
     o.edit: add tap targets, keyboard focus and the selection.   o.selected: an id.
     o.pending: ids of points already tapped for the piece being drawn.   o.hitR: tap-target radius. */
  function draw(svg, doc, o = {}) {
    const ns = svg.namespaceURI, g = Model.size(doc), c = o.bw ? BW : COLOR;
    const f = o.frame || { x0: 0, y0: 0, x1: g.w, y1: g.h };
    const X = x => (x - f.x0) * U, Y = y => (f.y1 - y) * U;
    const W = (f.x1 - f.x0) * U, H = (f.y1 - f.y0) * U;
    const m = o.bold ? 1.4 : 1;                       // marks and labels grow with the bold look
    const sw = o.bold ? 3.4 : 2.2, head = o.bold ? 12 : 9, dotR = o.bold ? 4.8 : 3.6, fs = o.bold ? 21 : 17, off = o.bold ? 18 : 14, fsL = o.bold ? 20 : 15;
    const pending = o.pending || [];
    const marksOn = doc.marks !== false;             // Show Marks: tick marks, parallel arrows, angle arcs and right-angle boxes
    const px = id => { const p = Model.point(doc, id); return { x: X(p.x), y: Y(p.y) }; };
    const unit = (A, B) => { const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1; return { x: dx / l, y: dy / l }; };
    // A group for one thing. On the board it can be tapped, focused and read aloud.
    const group = (parent, id, cls, extra) => el(ns, 'g', o.edit ? Object.assign({ 'data-id': id, tabindex: '0', role: 'button', 'aria-label': Model.describe(doc, id), class: cls }, extra || {}) : {}, parent);
    // A label centered at (x, y). With `along` (a direction on screen) it is turned to run parallel
    // to that direction, the right way up.
    const label = (parent, x, y, str, along) => {
      const t = el(ns, 'text', { x, y, dy: '0.35em', 'text-anchor': 'middle', 'font-family': FONT, 'font-size': fsL, fill: c.ink, stroke: 'none' }, parent);
      if (along) {
        const deg = Math.atan2(along.y, along.x) * 180 / Math.PI, turn = ((deg + 90) % 180 + 180) % 180 - 90;
        if (Math.abs(turn) > 0.01) t.setAttribute('transform', `rotate(${Math.round(turn * 100) / 100} ${x} ${y})`);
      }
      if (o.edit) t.setAttribute('aria-hidden', 'true');
      t.textContent = str;
      return t;
    };
    const mark = { fill: 'none', stroke: c.hl, 'stroke-width': 2 * m, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };

    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    el(ns, 'rect', { x: 0, y: 0, width: W, height: H, fill: c.paper }, svg);
    if (o.grid) {
      const dots = el(ns, 'g', { 'aria-hidden': 'true', fill: c.grid }, svg);
      for (let x = 1; x < g.w; x++) for (let y = 1; y < g.h; y++) el(ns, 'circle', { cx: X(x), cy: Y(y), r: 1.2 }, dots);
    }

    // ---------- Polygons: a shaded inside (their sides are ordinary segments, drawn below) ----------
    for (const y of doc.polys) {
      if (!o.edit && !y.shade) continue;
      const d = y.pts.map((id, i) => `${i ? 'L' : 'M'}${px(id).x},${px(id).y}`).join(' ') + ' Z';
      const grp = group(svg, y.id, 'poly');
      el(ns, 'path', Object.assign({ d, fill: y.shade ? c.shades[y.shade - 1] : 'transparent', class: 'hit' }, o.edit && o.selected === y.id ? { stroke: c.hl, 'stroke-width': 2, 'stroke-dasharray': '5 4' } : { stroke: 'none' }), grp);
    }

    // ---------- Circles and their arcs ----------
    for (const k of doc.circles) {
      const C = px(k.c), r = Model.radius(doc, k) * U, grp = group(svg, k.id, 'circ');
      if (o.edit) el(ns, 'circle', { cx: C.x, cy: C.y, r, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(14, (o.hitR || 0) * 0.9), class: 'hit' }, grp);
      if (o.edit && o.selected === k.id) el(ns, 'circle', { cx: C.x, cy: C.y, r, fill: 'none', stroke: c.halo, 'stroke-width': sw + 7 }, grp);
      if (!k.hide) el(ns, 'circle', { cx: C.x, cy: C.y, r, fill: 'none', stroke: c.ink, 'stroke-width': sw }, grp);
      else if (o.edit) el(ns, 'circle', { cx: C.x, cy: C.y, r, fill: 'none', stroke: c.ink, 'stroke-opacity': 0.66, 'stroke-width': 1.5, 'stroke-dasharray': '3 5' }, grp);
    }
    for (const a of doc.arcs) {
      const k = Model.circle(doc, a.c), C = px(k.c), r = Model.radius(doc, k) * U, s = Model.arcSweep(doc, a);
      // Angles run counterclockwise on the grid, which is counterclockwise on screen too (y is flipped once).
      const at = deg => ({ x: C.x + r * Math.cos(deg * Math.PI / 180), y: C.y - r * Math.sin(deg * Math.PI / 180) });
      const S = at(s.start), E = at(s.start + s.sweep), mid = s.start + s.sweep / 2;
      const d = `M${S.x},${S.y} A${r},${r} 0 ${s.sweep > 180 ? 1 : 0} 0 ${E.x},${E.y}`;
      const grp = group(svg, a.id, 'arc');
      if (o.edit) el(ns, 'path', { d, fill: 'none', stroke: 'transparent', 'stroke-width': Math.max(16, (o.hitR || 0) * 0.9), class: 'hit' }, grp);
      if (o.edit && o.selected === a.id) el(ns, 'path', { d, fill: 'none', stroke: c.halo, 'stroke-width': sw + 9 }, grp);
      el(ns, 'path', { d, fill: 'none', stroke: a.hl ? c.hl : c.ink, 'stroke-width': a.hl ? sw + 2 : sw, 'stroke-linecap': 'round' }, grp);
      // Ticks cross the arc at its middle, fanned a little apart: arcs with the same ticks are congruent.
      for (let i = 0; i < (marksOn ? a.ticks : 0); i++) {
        const t = mid + (i - (a.ticks - 1) / 2) * (6 * m / r) * 180 / Math.PI, v = { x: Math.cos(t * Math.PI / 180), y: -Math.sin(t * Math.PI / 180) };
        el(ns, 'line', Object.assign({ x1: C.x + v.x * (r - 7 * m), y1: C.y + v.y * (r - 7 * m), x2: C.x + v.x * (r + 7 * m), y2: C.y + v.y * (r + 7 * m) }, mark, a.hl ? { stroke: c.ink } : {}), grp);
      }
      // The label is centered on the arc's middle, just outside it, and follows the curve there.
      if (a.label) { const v = at(mid), u = unit(C, v), d = (14 + (a.ticks ? 5 : 0)) * m; label(grp, v.x + u.x * d, v.y + u.y * d, a.label, { x: -u.y, y: u.x }); }
    }

    // ---------- Segments, rays and lines, with their marks ----------
    const pieces = el(ns, 'g', { fill: 'none', 'stroke-linecap': 'round' }, svg);
    for (const k of doc.pieces) {
      const { P, Q, arrows } = ends(doc, k, f);
      const x1 = X(P.x), y1 = Y(P.y), x2 = X(Q.x), y2 = Y(Q.y), L = Math.hypot(x2 - x1, y2 - y1) || 1;
      const ux = (x2 - x1) / L, uy = (y2 - y1) / L, ink = k.hl ? c.hl : c.ink, w = k.hl ? sw + 1.4 : sw;
      const grp = group(pieces, k.id, 'piece');
      if (o.edit) el(ns, 'line', { x1, y1, x2, y2, stroke: 'transparent', 'stroke-width': Math.max(14, (o.hitR || 0) * 0.9), class: 'hit' }, grp);
      if (o.edit && o.selected === k.id) el(ns, 'line', { x1, y1, x2, y2, stroke: c.halo, 'stroke-width': w + 7 }, grp);
      // The line stops inside each arrowhead, so its round end never pokes through the tip.
      const cut = head * 0.6;
      el(ns, 'line', Object.assign({ x1: x1 + (arrows[0] ? ux * cut : 0), y1: y1 + (arrows[0] ? uy * cut : 0), x2: x2 - (arrows[1] ? ux * cut : 0), y2: y2 - (arrows[1] ? uy * cut : 0), stroke: ink, 'stroke-width': w },
        k.dashed ? { 'stroke-dasharray': `${7 * m} ${6 * m}`, 'stroke-linecap': 'butt' } : {}), grp);
      const tip = (tx, ty, dx, dy) => el(ns, 'polygon', {
        points: `${tx},${ty} ${tx - dx * head - dy * head * 0.42},${ty - dy * head + dx * head * 0.42} ${tx - dx * head + dy * head * 0.42},${ty - dy * head - dx * head * 0.42}`,
        fill: ink, stroke: 'none',
      }, grp);
      if (arrows[0]) tip(x1, y1, -ux, -uy);
      if (arrows[1]) tip(x2, y2, ux, uy);
      // Marks sit between the piece's two points: ticks at the middle; parallel arrows at the middle
      // too, or a little farther along when there are ticks to make room for.
      const A = px(k.a), B = px(k.b), u = unit(A, B), n = { x: -u.y, y: u.x };
      const along = t => ({ x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t });
      const marks = k.hl ? Object.assign({}, mark, { stroke: c.ink }) : mark;   // on a red piece, marks turn dark so they still show
      for (let i = 0; i < (marksOn ? k.ticks : 0); i++) {
        const s = (i - (k.ticks - 1) / 2) * 6 * m, p = along(0.5);
        el(ns, 'line', Object.assign({ x1: p.x + u.x * s + n.x * 8 * m, y1: p.y + u.y * s + n.y * 8 * m, x2: p.x + u.x * s - n.x * 8 * m, y2: p.y + u.y * s - n.y * 8 * m }, marks), grp);
      }
      for (let i = 0; i < (marksOn ? k.arrows : 0); i++) {
        const p = along(k.ticks ? 0.72 : 0.5), s = (i - (k.arrows - 1) / 2) * 7 * m + 4 * m, cx = p.x + u.x * s, cy = p.y + u.y * s;
        el(ns, 'path', Object.assign({ d: `M${cx - u.x * 8 * m + n.x * 6 * m},${cy - u.y * 8 * m + n.y * 6 * m} L${cx},${cy} L${cx - u.x * 8 * m - n.x * 6 * m},${cy - u.y * 8 * m - n.y * 6 * m}` }, marks), grp);
      }
      if (k.label) {
        // The label sits beside the middle of the piece: outside the polygon when the piece is one
        // of its sides, otherwise above the piece. The teacher can flip it to the other side.
        let nx = n.x, ny = n.y;
        const p = along(0.5), y = doc.polys.find(q => q.pts.includes(k.a) && q.pts.includes(k.b));
        if (y) {
          const cx = y.pts.reduce((s, id) => s + px(id).x, 0) / y.pts.length, cy = y.pts.reduce((s, id) => s + px(id).y, 0) / y.pts.length;
          if ((cx - p.x) * nx + (cy - p.y) * ny > 0) { nx = -nx; ny = -ny; }
        } else if (ny > 0 || (ny === 0 && nx > 0)) { nx = -nx; ny = -ny; }
        const side = k.flip ? -1 : 1, at = Model.labelAt(doc, k);
        if (at === 'mid') {
          // It runs parallel to the piece, just clear of it (and of any tick marks).
          const d = (13 + (k.ticks ? 5 : 0)) * m;
          label(grp, p.x + nx * d * side, p.y + ny * d * side, k.label, u);
        } else {
          /* A name by an arrowhead (line t, line k), as textbooks print it: level, beside the arrow,
             just clear of the line whatever its slope, and kept inside the picture. */
          const T = at === 'b' ? { x: x2, y: y2 } : { x: x1, y: y1 }, back = at === 'b' ? -1 : 1;
          const w = k.label.length * fsL * 0.58 + 4, h = fsL, sx = nx * side, sy = ny * side;
          const d = (Math.abs(sx) * w + Math.abs(sy) * h) / 2 + 6 * m;
          // Nothing may hide a name: if a point or its letter is in the way, the label slides back along
          // the line (on its chosen side first, then the other) until it is clear.
          const busy = doc.points.flatMap(q => {
            const qx = X(q.x), qy = Y(q.y), dd = Model.SIDES[Model.sideOf(doc, q)].d, nn = Math.hypot(dd[0], dd[1]), r = dotR + 3;
            const out = [{ x0: qx - r, y0: qy - r, x1: qx + r, y1: qy + r }];
            if (q.name) { const lx = qx + dd[0] / nn * off, ly = qy + dd[1] / nn * off, lw = q.name.length * fs * 0.62 / 2 + 2, lh = fs / 2 + 2; out.push({ x0: lx - lw, y0: ly - lh, x1: lx + lw, y1: ly + lh }); }
            return out;
          });
          const spot = (j, sgn) => {
            const b = head + (6 + j * 12) * m;
            return { x: Math.min(W - w / 2 - 3, Math.max(w / 2 + 3, T.x + ux * b * back + sx * sgn * d)), y: Math.min(H - h / 2 - 3, Math.max(h / 2 + 3, T.y + uy * b * back + sy * sgn * d)) };
          };
          const clear = s => busy.every(r => s.x + w / 2 < r.x0 || s.x - w / 2 > r.x1 || s.y + h / 2 < r.y0 || s.y - h / 2 > r.y1);
          let best = spot(0, 1);
          search: for (let j = 0; j < 12; j++) for (const sgn of [1, -1]) { const s = spot(j, sgn); if (clear(s)) { best = s; break search; } }
          label(grp, best.x, best.y, k.label);
        }
      }
    }

    // A polygon being drawn: its sides so far, dashed, so each tap shows something.
    if (o.edit && o.preview && pending.length > 1) {
      el(ns, 'path', { d: pending.map((id, i) => `${i ? 'L' : 'M'}${px(id).x},${px(id).y}`).join(' '), fill: 'none', stroke: c.hl, 'stroke-width': 2, 'stroke-dasharray': '6 5', 'aria-hidden': 'true' }, svg);
    }

    // ---------- Angle marks ----------
    for (const a of doc.angles) {
      const V = px(a.v), u = unit(V, px(a.a)), w = unit(V, px(a.b));
      const arc = r => `M${V.x + u.x * r},${V.y + u.y * r} A${r},${r} 0 0 ${u.x * w.y - u.y * w.x > 0 ? 1 : 0} ${V.x + w.x * r},${V.y + w.y * r}`;
      const wedge = r => `M${V.x},${V.y} L${V.x + u.x * r},${V.y + u.y * r} ` + arc(r).replace(/^M[^A]*/, '') + ' Z';
      const grp = group(svg, a.id, 'angle'), picked = o.edit && o.selected === a.id;
      // Four or five arcs reach farther out, so the highlight and the label move out with them.
      const many = marksOn && !a.right && a.arcs > 3 ? 30 + (a.arcs - 1) * 5 : 0;
      if (a.hl || picked) el(ns, 'path', Object.assign({ d: wedge((many ? many - 6 : 34) * m), fill: a.hl ? c.halo : 'none' }, picked ? { stroke: c.hl, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' } : { stroke: 'none' }), grp);
      if (o.edit) el(ns, 'path', { d: wedge(Math.max(30, o.hitR || 0)), fill: 'transparent', stroke: 'none', class: 'hit' }, grp);
      const s = 12 * m;
      if (!marksOn) { /* the angle keeps its label and highlight; only its mark is hidden */ }
      else if (a.right) el(ns, 'path', Object.assign({ d: `M${V.x + u.x * s},${V.y + u.y * s} L${V.x + (u.x + w.x) * s},${V.y + (u.y + w.y) * s} L${V.x + w.x * s},${V.y + w.y * s}` }, mark), grp);
      else for (let i = 0; i < a.arcs; i++) el(ns, 'path', Object.assign({ d: arc((22 + i * 5) * m) }, mark), grp);
      if (a.label) {
        // Along the middle of the angle, just outside its arcs; longer labels sit farther out, where there is more room.
        let bx = u.x + w.x, by = u.y + w.y;
        const bl = Math.hypot(bx, by);
        if (bl < 1e-6) { bx = u.y; by = -u.x; } else { bx /= bl; by /= bl; }
        const r = Math.max(40, 28 + a.label.length * 4.5, many) * m;
        label(grp, V.x + bx * r, V.y + by * r, a.label);
      }
    }

    // ---------- Points and their letters ----------
    for (const p of doc.points) {
      const cx = X(p.x), cy = Y(p.y), d = Model.SIDES[Model.sideOf(doc, p)].d, n = Math.hypot(d[0], d[1]);
      const isPending = pending.includes(p.id), marked = o.edit && (o.selected === p.id || isPending);
      const grp = group(svg, p.id, 'pt', { 'data-pt': '', 'aria-label': `${Model.describe(doc, p.id)}, at ${Math.round(p.x * 100) / 100}, ${Math.round(p.y * 100) / 100}` });
      if (o.edit) el(ns, 'circle', { cx, cy, r: o.hitR || 18, fill: 'transparent', class: 'hit' }, grp);
      if (marked) el(ns, 'circle', { cx, cy, r: dotR + 6, fill: c.halo, stroke: c.hl, 'stroke-width': 2, 'stroke-dasharray': isPending ? '4 3' : 'none' }, grp);
      if (p.dot) el(ns, 'circle', { cx, cy, r: dotR, fill: c.ink }, grp);
      // A hidden dot still shows faintly on the board, so the point can be found and moved.
      else if (o.edit) el(ns, 'circle', { cx, cy, r: dotR, fill: 'none', stroke: c.grid, 'stroke-width': 1.5 }, grp);
      if (p.name) {
        const t = el(ns, 'text', {
          x: cx + d[0] / n * off, y: cy + d[1] / n * off, dy: '0.35em', 'text-anchor': 'middle',
          'font-family': FONT, 'font-size': fs, 'font-weight': 'bold', fill: c.ink,
        }, grp);
        if (o.edit) t.setAttribute('aria-hidden', 'true');
        t.textContent = p.name;
      }
    }

    // ---------- Free labels ----------
    for (const t of doc.texts) {
      const x = X(t.x), y = Y(t.y), shown = t.text || (o.edit ? 'Label' : ''), wide = Math.max(24, shown.length * fsL * 0.58 + 10);
      const grp = group(svg, t.id, 'txt', { 'data-txt': '' });
      if (t.tilt) grp.setAttribute('transform', `rotate(${-t.tilt} ${x} ${y})`);   // on screen, a positive turn is clockwise
      if (o.edit) el(ns, 'rect', Object.assign({ x: x - wide / 2, y: y - fsL * 0.85, width: wide, height: fsL * 1.7, rx: 4, fill: 'transparent', class: 'hit' },
        o.selected === t.id ? { stroke: c.hl, 'stroke-width': 1.5, 'stroke-dasharray': '4 3' } : { stroke: 'none' }), grp);
      if (shown) { const e = label(grp, x, y, shown); if (!t.text) e.setAttribute('fill', c.grid); }
    }
    // The note about scale sits at the bottom of the picture, in the room the frame leaves for it.
    const note = Model.scaleNote(doc);
    if (note) {
      const t = label(svg, W / 2, H - 11 * m, note);
      t.setAttribute('font-style', 'italic');
      t.setAttribute('class', 'scale-note');
    }
    return { W, H };
  }

  return { U, draw };
})();
