/* The tools that do the computer work: the teacher types the measure they want, and the drawing is
   reshaped to match. No DOM here, so every tool can be tested.
   Each tool changes the diagram and returns true, or returns { error } (a sentence for the
   teacher) and changes nothing. */
const Solve = (() => {
  'use strict';
  const RAD = Math.PI / 180;
  const OFF = 'That would go off the grid. Try Fit to Frame, or pick a bigger Grid Size.';
  const fits = (doc, x, y) => { const g = Model.size(doc); return x >= 1 - 1e-7 && x <= g.w - 1 + 1e-7 && y >= 1 - 1e-7 && y <= g.h - 1 + 1e-7; };
  // A typed measure as a number: "40", "40°" and " 7.5 " all work; anything else is not a number.
  function number(str) {
    const s = String(str).replace(/[°\s]/g, '').replace(',', '.');
    return /^\d*\.?\d+$/.test(s) ? parseFloat(s) : NaN;
  }
  // A typed tilt: like number(), but it may be negative ("-30", or with a true minus sign) and may end in "degrees".
  function tilt(str) {
    const s = String(str).replace(/degrees?|deg|[\u00b0\s]/gi, '').replace('\u2212', '-').replace(',', '.');
    return /^-?\d*\.?\d+$/.test(s) ? parseFloat(s) : NaN;
  }
  // How much is drawn from a point: the point with less attached is the one a tool moves by default.
  function attached(doc, id) {
    return doc.pieces.filter(k => k.a === id || k.b === id).length + doc.angles.filter(g => g.a === id || g.v === id || g.b === id).length +
      doc.circles.filter(c => c.c === id || c.on === id).length + doc.polys.filter(y => y.pts.includes(id)).length;
  }
  const lighter = (doc, a, b) => (attached(doc, a) < attached(doc, b) ? a : b);

  // Keep a copy of where every point is, to put the drawing back if a tool cannot finish.
  const keep = doc => { const was = JSON.stringify(doc.points); return () => { doc.points = JSON.parse(was); }; };
  // A point that is held on a piece or at a crossing cannot be moved off it by a tool.
  const stuck = (doc, p) => ({ error: `${Model.describe(doc, p.id)} is fixed ${Model.holdText(doc, p)}, so it can’t be moved that way. Choose the other point under By Moving, or select ${Model.describe(doc, p.id)} and choose Let It Move Freely.` });

  /* ---------- Make This Angle: turn one side around the vertex until the angle measures `deg` ----------
     When the side being turned is part of a line that runs through the vertex (a transversal
     through its crossing point, say), the whole line turns about the vertex, so the vertex stays
     on it and every point held on that line follows. Otherwise only the one point moves. */
  function setAngle(doc, id, deg, moveId) {
    const g = Model.angle(doc, id);
    if (!g) return { error: 'Select an angle mark first.' };
    if (!(deg > 0 && deg <= 180)) return { error: 'Type a measure greater than 0, up to 180.' };
    const now = Model.angleDeg(doc, g);
    if (Math.abs(now - deg) < 1e-6) return true;                     // it already measures that
    const mv = moveId === g.a || moveId === g.b ? moveId : lighter(doc, g.b, g.a), fixed = mv === g.a ? g.b : g.a;
    const V = Model.point(doc, g.v), F = Model.point(doc, fixed), M = Model.point(doc, mv);
    // The moving side stays on the same side of the fixed one as it is now.
    const turn = (F.x - V.x) * (M.y - V.y) - (F.y - V.y) * (M.x - V.x) >= 0 ? 1 : -1, by = turn * (deg - now) * RAD;
    const through = k => { const A = Model.point(doc, k.a), B = Model.point(doc, k.b); return Math.abs((V.x - A.x) * (B.y - A.y) - (V.y - A.y) * (B.x - A.x)) / Math.hypot(B.x - A.x, B.y - A.y) < 1e-6; };
    const line = doc.pieces.find(k => (k.a === mv || k.b === mv) && k.a !== g.v && k.b !== g.v && through(k));
    const movers = (line ? [line.a, line.b] : [mv]).map(i => Model.point(doc, i));
    const held = movers.find(p => p.hold);
    if (held) return stuck(doc, held);
    const back = keep(doc), cs = Math.cos(by), sn = Math.sin(by), v = { x: V.x, y: V.y };
    if (!line) {
      const x = v.x + (M.x - v.x) * cs - (M.y - v.y) * sn, y = v.y + (M.x - v.x) * sn + (M.y - v.y) * cs;
      if (Model.pointAt(doc, x, y, mv)) return { error: 'Another point is already there. Move one of them first.' };
      return Model.movePoint(doc, mv, x, y) ? true : { error: OFF };
    }
    // Both of the line's points turn together; arc ends and held points are carried along.
    return Model.moveMany(doc, movers.map(p => p.id), p => ({ x: v.x + (p.x - v.x) * cs - (p.y - v.y) * sn, y: v.y + (p.x - v.x) * sn + (p.y - v.y) * cs })) ? true : { error: OFF };
  }
  // ---------- Make This Side: slide one endpoint along the side until it is `len` units long ----------
  function setLength(doc, id, len, moveId) {
    const k = Model.piece(doc, id);
    if (!k) return { error: 'Select a segment first.' };
    if (!(len > 0)) return { error: 'Type a length greater than 0.' };
    const mv = moveId === k.a || moveId === k.b ? moveId : lighter(doc, k.b, k.a), fixed = mv === k.a ? k.b : k.a;
    const F = Model.point(doc, fixed), M = Model.point(doc, mv), d = Math.hypot(M.x - F.x, M.y - F.y);
    if (Math.abs(d - len) < 1e-6) return true;                       // it is already that long
    const x = F.x + (M.x - F.x) * len / d, y = F.y + (M.y - F.y) * len / d;
    if (!fits(doc, x, y)) return { error: OFF };
    if (Model.pointAt(doc, x, y, mv)) return { error: 'Another point is already there. Move one of them first.' };
    const back = keep(doc), ok = Model.movePoint(doc, mv, x, y);
    // A held point only slides along its own piece; if that did not give the length, nothing changes.
    if (ok && Math.abs(length(doc, k) - len) > 1e-6) { back(); return stuck(doc, Model.point(doc, mv)); }
    return ok ? true : (M.hold ? stuck(doc, M) : { error: OFF });
  }
  const length = (doc, k) => { const A = Model.point(doc, k.a), B = Model.point(doc, k.b); return Math.hypot(B.x - A.x, B.y - A.y); };
  // A length as a teacher would write it: whole when it is whole, else one decimal.
  const lenText = Model.lenText;

  /* ---------- Triangle from Measures ----------
     Sides a, b, c are across from angles A, B, C. Give any three measures, at least one a side
     (m = { a, b, c, A, B, C }, missing ones left out). Returns { triangles: [{a,b,c,A,B,C}] } with
     one triangle, or two when two sides and an angle not between them fit two triangles;
     or { error }. */
  function triangle(m) {
    const S = ['a', 'b', 'c'], G = ['A', 'B', 'C'], have = k => typeof m[k] === 'number' && !isNaN(m[k]);
    const sides = S.filter(have), angs = G.filter(have);
    if (sides.concat(angs).some(k => !(m[k] > 0))) return { error: 'Every measure must be greater than 0.' };
    if (sides.length + angs.length !== 3) return { error: 'Fill in exactly three measures.' };
    if (!sides.length) return { error: 'Three angles give the shape but not the size. Give at least one side.' };
    if (angs.some(k => m[k] >= 180)) return { error: 'An angle of a triangle is less than 180°.' };
    const sin = d => Math.sin(d * RAD), acos = v => Math.acos(Math.min(1, Math.max(-1, v))) / RAD;
    const t = Object.assign({}, m);
    const fromSides = () => { t.A = acos((t.b * t.b + t.c * t.c - t.a * t.a) / (2 * t.b * t.c)); t.B = acos((t.a * t.a + t.c * t.c - t.b * t.b) / (2 * t.a * t.c)); t.C = 180 - t.A - t.B; };
    if (sides.length === 3) {
      const [x, y, z] = [t.a, t.b, t.c].sort((p, q) => p - q);
      if (x + y <= z + 1e-9) return { error: 'Those sides can’t make a triangle: the two shorter sides together must be longer than the longest.' };
      fromSides();
      return { triangles: [t] };
    }
    if (angs.length === 2) {
      const third = G.find(k => !have(k));
      t[third] = 180 - t[angs[0]] - t[angs[1]];
      if (!(t[third] > 1e-9)) return { error: 'Those two angles already add to 180° or more, so there is no third angle.' };
      const s = sides[0], ratio = t[s] / sin(t[s.toUpperCase()]);       // law of sines
      for (const k of S) t[k] = ratio * sin(t[k.toUpperCase()]);
      return { triangles: [t] };
    }
    // Two sides and one angle.
    const ang = angs[0], across = ang.toLowerCase();
    if (!sides.includes(across)) {
      // The angle is between the two sides: one triangle, by the law of cosines.
      const [p, q] = sides;
      t[across] = Math.sqrt(t[p] * t[p] + t[q] * t[q] - 2 * t[p] * t[q] * Math.cos(t[ang] * RAD));
      fromSides();
      t[ang] = m[ang];
      return { triangles: [t] };
    }
    // The angle is across from one of the sides: none, one or two triangles (law of sines).
    const other = sides.find(k => k !== across), last = S.find(k => !sides.includes(k));
    const s = t[other] * sin(t[ang]) / t[across];
    if (s > 1 + 1e-9) return { error: `No triangle fits: side ${across} is too short to reach.` };
    const first = Math.asin(Math.min(1, s)) / RAD, out = [];
    for (const O of [first, 180 - first]) {
      const L = 180 - t[ang] - O;
      if (L <= 1e-9 || out.some(u => Math.abs(u[other.toUpperCase()] - O) < 1e-7)) continue;
      const u = Object.assign({}, t);
      u[other.toUpperCase()] = O; u[last.toUpperCase()] = L;
      u[last] = t[across] * sin(L) / sin(t[ang]);
      out.push(u);
    }
    return out.length ? { triangles: out } : { error: 'No triangle fits those measures.' };
  }
  /* Draw a solved triangle on the diagram: three new points, its sides, and a mark and label for
     each measure the teacher typed (`given` lists those keys). It is drawn as big as fits well,
     so the labels carry the numbers and the drawing carries the exact shape.
     Returns the new polygon's id. */
  function drawTriangle(doc, t, given) {
    const g = Model.size(doc);
    // A at the left of the base, B at the right, C above: side c is the base.
    let P = [{ x: 0, y: 0 }, { x: t.c, y: 0 }, { x: t.b * Math.cos(t.A * RAD), y: t.b * Math.sin(t.A * RAD) }];
    const xs = P.map(p => p.x), ys = P.map(p => p.y), w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    const k = Math.min((g.w - 8) / w, (g.h - 7) / h);
    const ox = (g.w - w * k) / 2 - Math.min(...xs) * k, oy = (g.h - h * k) / 2 - Math.min(...ys) * k;
    P = P.map(p => ({ x: p.x * k + ox, y: p.y * k + oy }));
    if (P.some(p => Model.pointAt(doc, p.x, p.y))) return { error: 'A point is already where the triangle would go. Move it or start over first.' };
    const ids = P.map(p => Model.addPoint(doc, p.x, p.y));
    const poly = Model.addPolygon(doc, ids);
    const side = (p, q) => doc.pieces.find(s => s.kind === 'segment' && ((s.a === p && s.b === q) || (s.a === q && s.b === p)));
    const SIDES = { a: [1, 2], b: [2, 0], c: [0, 1] }, ANGLES = { A: [1, 0, 2], B: [2, 1, 0], C: [0, 2, 1] };
    for (const key of given) {
      if (SIDES[key]) side(ids[SIDES[key][0]], ids[SIDES[key][1]]).label = lenText(t[key]);
      else { const [p, v, q] = ANGLES[key]; Model.angle(doc, Model.addAngle(doc, ids[p], ids[v], ids[q])).label = Model.degText(t[key]); }
    }
    return poly;
  }

  /* ---------- Angle From a Measure ----------
     Angle ABC of exactly `deg` degrees: vertex B, one side level, drawn as two rays with a mark.
     Its label shows the measure and follows the drawing. Returns the angle's id, or { error }. */
  function drawAngle(doc, deg) {
    if (!(deg > 0 && deg <= 180)) return { error: 'Type a measure greater than 0, up to 180.' };
    const g = Model.size(doc), L = Math.min(8, g.h / 2 - 2.5);
    let P = [{ x: L, y: 0 }, { x: 0, y: 0 }, { x: L * Math.cos(deg * RAD), y: L * Math.sin(deg * RAD) }];
    const xs = P.map(p => p.x), ys = P.map(p => p.y), ox = (g.w - Math.max(...xs) - Math.min(...xs)) / 2, oy = (g.h - Math.max(...ys) - Math.min(...ys)) / 2;
    // The vertex sits on a grid dot, so the level side lies along a row of dots.
    P = P.map(p => ({ x: p.x + Math.round(ox), y: p.y + Math.round(oy) }));
    if (P.some(p => !fits(doc, p.x, p.y))) return { error: OFF };
    if (P.some(p => Model.pointAt(doc, p.x, p.y))) return { error: 'A point is already where the angle would go. Move it or start over first.' };
    const [a, v, b] = P.map(p => Model.addPoint(doc, p.x, p.y));
    Model.addPiece(doc, 'ray', v, a); Model.addPiece(doc, 'ray', v, b);
    const id = Model.addAngle(doc, a, v, b);
    Model.angle(doc, id).auto = true;
    Model.refresh(doc);
    return id;
  }
  /* ---------- Circle From Measures ----------
     A circle about A through B, as large as fits well. With `radius`, radius AB is drawn and
     labeled with that number. With `arc` (degrees, more than 0 and less than 360), a second point
     C is placed that far around the circle, with radius AC and arc BC highlighted and labeled.
     Returns the circle's id, or { error }. */
  function drawCircle(doc, m) {
    const hasR = typeof m.radius === 'number' && !isNaN(m.radius), hasArc = typeof m.arc === 'number' && !isNaN(m.arc);
    if (!hasR && !hasArc) return { error: 'Type a radius, an arc measure, or both.' };
    if (hasR && !(m.radius > 0)) return { error: 'Type a radius greater than 0.' };
    if (hasArc && !(m.arc > 0 && m.arc < 360)) return { error: 'Type an arc measure greater than 0 and less than 360.' };
    const g = Model.size(doc), R = Math.min(6, Math.floor(g.h / 2 - 2)), cx = Math.round(g.w / 2), cy = Math.round(g.h / 2);
    const P = [{ x: cx, y: cy }, { x: cx + R, y: cy }];
    if (hasArc) P.push({ x: cx + R * Math.cos(m.arc * RAD), y: cy + R * Math.sin(m.arc * RAD) });
    if (P.some(p => Model.pointAt(doc, p.x, p.y))) return { error: 'A point is already where the circle would go. Move it or start over first.' };
    const [c, on, end] = P.map(p => Model.addPoint(doc, p.x, p.y));
    const id = Model.addCircle(doc, c, on);
    if (hasR || hasArc) { const k = Model.piece(doc, Model.addPiece(doc, 'segment', c, on)); if (hasR) k.label = lenText(m.radius); }
    if (hasArc) {
      Model.addPiece(doc, 'segment', c, end);
      const r = Model.arc(doc, Model.addArc(doc, on, end));
      r.other = m.arc > 180;                         // more than half way round is the long arc
      r.auto = true;
      Model.refresh(doc);
    }
    return id;
  }

  /* ---------- Start With: a common figure dropped in the middle of the grid ----------
     Everything it adds is an ordinary point or piece the teacher can move, mark and relabel.
     Returns the id to select, or { error } when the middle of the grid is already in use. */
  // The corners of a regular polygon about the middle of the grid, with its bottom side level.
  function regularSpots(g, sides) {
    const n = Math.round(sides);
    if (!(n >= 3 && n <= 12)) return null;
    const R = Math.min(6, g.h / 2 - 2), first = -90 + 180 / n;
    return Array.from({ length: n }, (v, i) => [R * Math.cos((first + i * 360 / n) * RAD), R * Math.sin((first + i * 360 / n) * RAD)]);
  }
  function starter(doc, kind, sides) {
    const g = Model.size(doc), cx = Math.round(g.w / 2), cy = Math.round(g.h / 2);
    const SPOTS = {
      triangle: [[-5, -3], [5, -3], [-1, 4]],
      quadrilateral: [[-6, -3], [5, -3], [6, 3], [-4, 4]],
      // Two lines with matching arrows, crossed by a third: A, B, C on the top line, D, E, F on the bottom, G and H on the transversal.
      // B and E sit off-center, so the arrows at each line's middle stay clear of them and of any angle mark there.
      transversal: [[-7, 3], [2, 3], [6, 3], [-6, -3], [-1, -3], [8, -3], [3, 5], [-2, -5]],
      circle: [[0, 0], [4, 0]],
      // Angle ABC: the vertex B, with A and C on its two sides.
      angle: [[5, -3], [-5, -3], [2, 4]],
      // A circle of radius 4 about A, and D five squares from the center: a 3-4-5 right triangle
      // puts the two tangent points B and C exactly at (3.2, 2.4) and (3.2, -2.4) from the center.
      tangents: [[-3, 0], [0.2, 2.4], [0.2, -2.4], [2, 0]],
    }[kind] || (kind === 'regular' ? regularSpots(g, sides) : null);
    if (!SPOTS) return { error: 'There is no such figure.' };
    const at = SPOTS.map(([dx, dy]) => ({ x: cx + dx, y: cy + dy }));
    if (at.some(p => Model.pointAt(doc, p.x, p.y))) return { error: 'There are points in the middle of the grid already. Move them, or choose Start Over first.' };
    const p = at.map(q => Model.addPoint(doc, q.x, q.y));
    if (kind === 'circle') return Model.addCircle(doc, p[0], p[1]);
    if (kind === 'angle') {
      Model.addPiece(doc, 'ray', p[1], p[0]); Model.addPiece(doc, 'ray', p[1], p[2]);
      return Model.addAngle(doc, p[0], p[1], p[2]);
    }
    if (kind === 'tangents') {
      // Each tangent line meets its radius at a right angle, marked with a box.
      const k = Model.addCircle(doc, p[0], p[1]);
      // Each line is remembered as tangent, so the scale note can say if it later stops being so.
      for (const t of [p[1], p[2]]) { Model.addPiece(doc, 'segment', p[0], t); Model.piece(doc, Model.addPiece(doc, 'line', p[3], t)).tan = k; Model.addAngle(doc, p[0], t, p[3]); }
      return k;
    }
    if (kind !== 'transversal') return Model.addPolygon(doc, p);
    const top = Model.addPiece(doc, 'line', p[0], p[2]), bottom = Model.addPiece(doc, 'line', p[3], p[5]);
    Model.piece(doc, top).arrows = 1; Model.piece(doc, bottom).arrows = 1;
    const across = Model.addPiece(doc, 'line', p[6], p[7]);
    // B and E are held where the transversal crosses each line, so they stay there however the lines are moved.
    Model.point(doc, p[1]).hold = { cross: [top, across] };
    Model.point(doc, p[4]).hold = { cross: [bottom, across] };
    return across;
  }

  // ---------- The whole drawing: fit it to the frame, turn it, flip it ----------
  // Move every point and label by the same rule; refuse if anything would leave the grid.
  function transform(doc, fn) {
    const g = Model.size(doc), pts = doc.points.map(p => fn(p)), txt = doc.texts.map(t => fn(t));
    if (!pts.every(p => fits(doc, p.x, p.y)) || !txt.every(t => t.x >= 0.5 && t.x <= g.w - 0.5 && t.y >= 0.5 && t.y <= g.h - 0.5)) return { error: OFF };
    doc.points.forEach((p, i) => { p.x = pts[i].x; p.y = pts[i].y; });
    doc.texts.forEach((t, i) => { t.x = txt[i].x; t.y = txt[i].y; });
    Model.settle(doc);
    if (!Model.sound(doc)) return { error: OFF };              // held points must still land on the grid, each in its own place
    for (const c of doc.circles) {
      const C = Model.point(doc, c.c), r = Model.radius(doc, c);
      if (C.x - r < 0 || C.y - r < 0 || C.x + r > g.w || C.y + r > g.h) return { error: OFF };
    }
    return true;
  }
  const guarded = (doc, fn) => { const keep = JSON.stringify(doc), r = transform(doc, fn); if (r !== true) Object.assign(doc, JSON.parse(keep)); return r; };
  // Resize and center the drawing so it fills the grid, with two squares of room around it. Every
  // angle stays the same. A drawing on grid dots stays on grid dots when it can.
  // With `shrinkOnly`, a drawing that already fits is only centered, never made bigger.
  function fitToFrame(doc, shrinkOnly) {
    const b = Model.bounds(doc), g = Model.size(doc), room = 2;
    if (!b) return { error: 'Draw something first.' };
    const w = b.x1 - b.x0, h = b.y1 - b.y0;
    let k = Math.min(w > 1e-9 ? (g.w - 2 * room) / w : Infinity, h > 1e-9 ? (g.h - 2 * room) / h : Infinity);
    if (!isFinite(k) || (shrinkOnly && k > 1)) k = 1;
    const whole = v => Math.abs(v - Math.round(v)) < 1e-9, onDots = doc.points.every(p => whole(p.x) && whole(p.y));
    if (onDots && k >= 1) k = Math.floor(k + 1e-9);
    let dx = (g.w - w * k) / 2 - b.x0 * k, dy = (g.h - h * k) / 2 - b.y0 * k;
    if (onDots && k >= 1) { dx = Math.round(dx); dy = Math.round(dy); }
    if (Math.abs(k - 1) < 1e-9 && Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return { error: 'It already fits the frame.' };
    return guarded(doc, p => ({ x: p.x * k + dx, y: p.y * k + dy }));
  }
  const center = doc => { const b = Model.bounds(doc); return b && { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 }; };
  // Turn the drawing about its middle; a positive turn is counterclockwise. If the turned drawing
  // would not fit on the grid, it is moved back onto the grid, and made smaller only if it must be
  // (every angle still the same). It is never made bigger.
  function rotate(doc, deg) {
    const c = center(doc);
    if (!c) return { error: 'Draw something first.' };
    const cs = Math.cos(deg * RAD), sn = Math.sin(deg * RAD);
    const turn = p => ({ x: c.x + (p.x - c.x) * cs - (p.y - c.y) * sn, y: c.y + (p.x - c.x) * sn + (p.y - c.y) * cs });
    const keep = JSON.stringify(doc);
    if (transform(doc, turn) === true) return true;
    Object.assign(doc, JSON.parse(keep));
    for (const p of doc.points.concat(doc.texts)) { const q = turn(p); p.x = q.x; p.y = q.y; }
    const r = fitToFrame(doc, true);
    if (r !== true) Object.assign(doc, JSON.parse(keep));
    return r === true ? true : { error: OFF };
  }
  // Mirror the drawing about its middle: 'x' flips left to right, 'y' top to bottom.
  function flip(doc, axis) {
    const c = center(doc);
    if (!c) return { error: 'Draw something first.' };
    return guarded(doc, p => (axis === 'x' ? { x: 2 * c.x - p.x, y: p.y } : { x: p.x, y: 2 * c.y - p.y }));
  }

  return { number, tilt, attached, setAngle, setLength, length, lenText, triangle, drawTriangle, drawAngle, drawCircle, starter, fitToFrame, rotate, flip };
})();
