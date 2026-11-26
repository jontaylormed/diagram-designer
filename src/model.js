/* The diagram a teacher is drawing. No DOM here, so every rule can be tested.
   A diagram is points (each with an id, a place on the grid and a letter) and the things drawn
   from them: pieces (segments, rays and lines between two points; for a ray, a is the endpoint),
   angle marks, polygons, circles and free text labels. Grid: whole units, y pointing up; points
   stay at least one unit inside the edge. */
const Model = (() => {
  'use strict';
  const GRIDS = { small: { w: 20, h: 14, name: 'Small' }, medium: { w: 30, h: 20, name: 'Medium' }, large: { w: 40, h: 28, name: 'Large' }, xlarge: { w: 60, h: 40, name: 'Extra Large' } };
  // Where a point's letter sits, as a direction on screen (x right, y down).
  const SIDES = {
    n: { d: [0, -1], name: 'Above' }, ne: { d: [1, -1], name: 'Above Right' }, e: { d: [1, 0], name: 'Right' }, se: { d: [1, 1], name: 'Below Right' },
    s: { d: [0, 1], name: 'Below' }, sw: { d: [-1, 1], name: 'Below Left' }, w: { d: [-1, 0], name: 'Left' }, nw: { d: [-1, -1], name: 'Above Left' },
  };
  const KINDS = { segment: 'Segment', ray: 'Ray', line: 'Line' };
  // A polygon's inside: no shade, or one of four soft, warm shades that also differ in lightness.
  const SHADES = ['None', 'Sand', 'Peach', 'Clay', 'Rose'];
  // The note about scale on the picture: decided by the drawing (auto), always one of the two, or never.
  const SCALES = { auto: 'Automatic', not: 'Not Drawn to Scale', yes: 'Drawn to Scale', none: 'No Note' };
  const LISTS = ['points', 'pieces', 'angles', 'polys', 'circles', 'arcs', 'texts'];
  const EPS = 1e-7;
  const PULL = 1.2;            // squares a held point is dragged away from its piece or crossing before it lets go
  // A key the object itself has (so a name like "constructor" from a file is never mistaken for one).
  const own = (o, k) => typeof k === 'string' && Object.prototype.hasOwnProperty.call(o, k);

  const create = (grid = 'medium') => ({ v: 1, grid, points: [], pieces: [], angles: [], polys: [], circles: [], arcs: [], texts: [], marks: true, scale: 'auto', next: 1 });
  const size = doc => GRIDS[doc.grid];
  const find = (doc, list, id) => doc[list].find(o => o.id === id);
  const point = (doc, id) => find(doc, 'points', id);
  const piece = (doc, id) => find(doc, 'pieces', id);
  const angle = (doc, id) => find(doc, 'angles', id);
  const poly = (doc, id) => find(doc, 'polys', id);
  const circle = (doc, id) => find(doc, 'circles', id);
  const arc = (doc, id) => find(doc, 'arcs', id);
  const text = (doc, id) => find(doc, 'texts', id);
  const item = (doc, id) => { for (const l of LISTS) { const o = find(doc, l, id); if (o) return o; } return undefined; };
  // What kind of thing an id names: 'point', 'piece', 'angle', 'poly', 'circle', 'arc' or 'text'.
  const typeOf = (doc, id) => { for (const l of LISTS) if (find(doc, l, id)) return l === 'polys' ? 'poly' : l.slice(0, -1); return null; };
  const inGrid = (g, x, y) => x >= 1 - EPS && x <= g.w - 1 + EPS && y >= 1 - EPS && y <= g.h - 1 + EPS;
  const pointAt = (doc, x, y, not) => doc.points.find(p => p.id !== not && Math.abs(p.x - x) < 1e-6 && Math.abs(p.y - y) < 1e-6);
  const dist = (P, Q) => Math.hypot(P.x - Q.x, P.y - Q.y);
  const radius = (doc, c) => dist(point(doc, c.c), point(doc, c.on));

  // The circle a point rides on: the point is an end of an arc of that circle (and is not the
  // circle's own center or sizing point). Undefined for every other point.
  function rideOf(doc, id) {
    const r = id && doc.arcs.find(a => a.a === id || a.b === id), c = r && circle(doc, r.c);
    return c && c.c !== id && c.on !== id ? c : undefined;
  }
  /* ---------- Points that stay put on a piece ----------
     A point placed on a piece, or where two pieces cross, is HELD there (p.hold): when those
     pieces move, it moves with them, so a point on a line stays on the line and a crossing stays
     a crossing.  hold = { on: pieceId, t }: at fraction t of the way from the piece's a to its b
     (0.5 is the midpoint);  hold = { cross: [pieceId, pieceId] }: where the two pieces' lines meet. */
  function heldAt(doc, p) {
    const h = p.hold;
    if (!h) return null;
    if (h.on) {
      const k = piece(doc, h.on);
      if (!k || k.a === p.id || k.b === p.id) return null;
      const A = point(doc, k.a), B = point(doc, k.b);
      return { x: A.x + h.t * (B.x - A.x), y: A.y + h.t * (B.y - A.y) };
    }
    const k = piece(doc, h.cross[0]), m = piece(doc, h.cross[1]);
    if (!k || !m || [k.a, k.b, m.a, m.b].includes(p.id)) return null;
    const A = point(doc, k.a), B = point(doc, k.b), C = point(doc, m.a), D = point(doc, m.b);
    const rx = B.x - A.x, ry = B.y - A.y, sx = D.x - C.x, sy = D.y - C.y, den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return { x: p.x, y: p.y };          // the lines are parallel just now: stay put
    const t = ((C.x - A.x) * sy - (C.y - A.y) * sx) / den;
    return { x: A.x + t * rx, y: A.y + t * ry };
  }
  // Put every held point back where its pieces now are. A hold on a piece that is gone is let go.
  function settle(doc) {
    for (let pass = 0; pass < 3; pass++) for (const p of doc.points) {
      if (!p.hold) continue;
      const P = heldAt(doc, p);
      if (!P) { delete p.hold; continue; }
      p.x = P.x; p.y = P.y;
    }
    for (const k of doc.pieces) if (k.tan && !circle(doc, k.tan)) delete k.tan;
  }
  // Does point `id` get its place (through holds, however many steps) from point `target`?
  // Used so a point is never held on a piece that itself depends on that point: a loop.
  function dependsOn(doc, id, target, depth = 0) {
    if (id === target) return true;
    const p = point(doc, id);
    if (!p || !p.hold || depth > 8) return false;
    return (p.hold.on ? [p.hold.on] : p.hold.cross).some(kid => { const k = piece(doc, kid); return !!k && (dependsOn(doc, k.a, target, depth + 1) || dependsOn(doc, k.b, target, depth + 1)); });
  }
  /* Move several points at once, each to fn(point), carrying along the ends of arcs on their
     circles and every held point. False, with nothing changed, if the result would put anything
     off the grid or two points in one place. */
  function moveMany(doc, ids, fn) {
    const before = doc.points.map(q => ({ q, x: q.x, y: q.y, hold: q.hold }));
    const riders = [];
    for (const c of doc.circles) {
      if (!ids.includes(c.c) && !ids.includes(c.on)) continue;
      const C = point(doc, c.c);
      for (const r of doc.arcs) for (const e of r.c === c.id ? [r.a, r.b] : []) {
        const E = point(doc, e);
        if (e !== c.c && e !== c.on && !ids.includes(e) && !riders.some(q => q.E === E)) riders.push({ E, c, ang: Math.atan2(E.y - C.y, E.x - C.x) });
      }
    }
    for (const id of ids) { const p = point(doc, id), to = fn(p); p.x = to.x; p.y = to.y; }
    for (const q of riders) { const C = point(doc, q.c.c), r = radius(doc, q.c); q.E.x = C.x + r * Math.cos(q.ang); q.E.y = C.y + r * Math.sin(q.ang); }
    settle(doc);
    if (sound(doc)) return true;
    for (const b of before) { b.q.x = b.x; b.q.y = b.y; if (b.hold) b.q.hold = b.hold; else delete b.q.hold; }
    return false;
  }
  // Is every point on the grid, with no two in the same place?
  function sound(doc) {
    const g = size(doc);
    return doc.points.every(p => isFinite(p.x) && isFinite(p.y) && inGrid(g, p.x, p.y) && !pointAt(doc, p.x, p.y, p.id));
  }
  // The words for a hold, for the point's form and the list of pieces.
  function holdText(doc, p) {
    if (!p.hold) return '';
    return p.hold.on ? `on ${describe(doc, p.hold.on)}` : `where ${describe(doc, p.hold.cross[0])} and ${describe(doc, p.hold.cross[1])} cross`;
  }

  // ---------- Tangents ----------
  // The two points where a line from Q touches circle c (none when Q is on or inside it).
  function tangentPoints(doc, c, Q) {
    const C = point(doc, c.c), r = radius(doc, c), d = dist(Q, C);
    if (d <= r + 1e-6) return [];
    const base = Math.atan2(Q.y - C.y, Q.x - C.x), a = Math.acos(r / d);
    return [1, -1].map(s => ({ x: C.x + r * Math.cos(base + s * a), y: C.y + r * Math.sin(base + s * a) }));
  }
  // The points a moving point is joined to: the other ends of its pieces, and `from`, the first
  // point tapped for a piece that is still being drawn.
  function joined(doc, not, from) {
    const out = doc.pieces.filter(k => not && (k.a === not || k.b === not)).map(k => (k.a === not ? k.b : k.a));
    if (from && point(doc, from)) out.push(from);
    return out;
  }
  /* Where a point lands so that its piece is tangent to a circle, when the pointer is close to
     such a place (else null):
     - its piece comes from a point outside the circle: the exact tangent point, or a spot farther
       along that tangent line;
     - its piece comes from a point on the circle: a spot on the tangent line there (at a right
       angle to the radius). */
  function tangentSnap(doc, M, not, from) {
    const g = size(doc);
    for (const o of joined(doc, not, from)) {
      const O = point(doc, o);
      for (const c of doc.circles) {
        if (c.c === not || c.on === not) continue;
        const C = point(doc, c.c), r = radius(doc, c), dO = dist(O, C);
        if (o !== c.c && Math.abs(dO - r) < 1e-6) {
          const u = { x: -(O.y - C.y) / r, y: (O.x - C.x) / r }, s = (M.x - O.x) * u.x + (M.y - O.y) * u.y;
          const off = Math.hypot(M.x - O.x - s * u.x, M.y - O.y - s * u.y), n = Math.round(s) || Math.sign(s);
          const P = { x: O.x + n * u.x, y: O.y + n * u.y };
          if (off < 0.4 && Math.abs(s) > 0.5 && inGrid(g, P.x, P.y)) return P;
          continue;
        }
        for (const T of tangentPoints(doc, c, O)) {
          if (dist(M, T) < 0.5 && inGrid(g, T.x, T.y)) return T;
          const L = dist(O, T), u = { x: (T.x - O.x) / L, y: (T.y - O.y) / L }, s = (M.x - O.x) * u.x + (M.y - O.y) * u.y;
          const off = Math.hypot(M.x - O.x - s * u.x, M.y - O.y - s * u.y), P = { x: O.x + Math.round(s) * u.x, y: O.y + Math.round(s) * u.y };
          if (s > 0.5 && off < 0.3 && inGrid(g, P.x, P.y)) return P;
        }
      }
    }
    return null;
  }
  // The circle a piece is tangent to: its line passes exactly one radius from the center, and the
  // piece itself reaches the point where they touch. Undefined when it is tangent to none.
  function tangentTo(doc, id) {
    const k = piece(doc, id);
    if (!k) return undefined;
    const A = point(doc, k.a), B = point(doc, k.b), L = dist(A, B);
    return doc.circles.find(c => {
      const C = point(doc, c.c), r = radius(doc, c);
      const s = ((C.x - A.x) * (B.x - A.x) + (C.y - A.y) * (B.y - A.y)) / L, off = Math.abs((C.x - A.x) * (B.y - A.y) - (C.y - A.y) * (B.x - A.x)) / L;
      const reaches = k.kind === 'line' || (s >= -1e-6 && (k.kind === 'ray' || s <= L + 1e-6));
      return Math.abs(off - r) < 1e-6 && reaches;
    });
  }

  /* Where a point lands. It snaps to the nearest grid dot, unless the pointer is close to a drawn
     piece or circle: then it lands exactly on that piece (a grid dot on it, its midpoint, or a
     whole number of units along it) or on that circle. `not` is the id of the point being moved;
     `from` is the first point tapped for a piece still being drawn. The result may carry a `hold`
     (see above) for a spot on a piece or at a crossing. `loose` turns snapping off. `tight` is a
     smaller catch distance, used when a new point is added: it joins a piece, crossing or circle
     only when the tap is right on it, not just near it. */
  function snap(doc, M, not, from, loose, tight) {
    const g = size(doc), clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
    const G = loose ? { x: clamp(M.x, 1, g.w - 1), y: clamp(M.y, 1, g.h - 1) } : { x: clamp(Math.round(M.x), 1, g.w - 1), y: clamp(Math.round(M.y), 1, g.h - 1) };
    // A held point keeps its hold: on a piece it slides along that piece; at a crossing it stays.
    const me = not && point(doc, not);
    /* It can be pulled off: dragged well away from its piece or crossing (more than PULL squares), or
       dragged at all with snapping off, it lets go and lands like a free point. The arrow keys never
       pull it off (`loose` is 'slide' for them). */
    const pulled = (me && me.hold && heldAt(doc, me) && loose !== 'slide') ? (() => {
      if (loose) return true;
      if (me.hold.cross) return dist(M, me) > PULL;
      const k = piece(doc, me.hold.on), A = point(doc, k.a), B = point(doc, k.b), L = dist(A, B);
      let s = ((M.x - A.x) * (B.x - A.x) + (M.y - A.y) * (B.y - A.y)) / L;
      if (k.kind === 'segment') s = clamp(s, 0, L); else if (k.kind === 'ray') s = Math.max(0, s);
      return dist(M, { x: A.x + s * (B.x - A.x) / L, y: A.y + s * (B.y - A.y) / L }) > PULL;
    })() : false;
    if (me && me.hold && heldAt(doc, me) && !pulled) {
      if (me.hold.cross) return { x: me.x, y: me.y, hold: me.hold };
      const k = piece(doc, me.hold.on), A = point(doc, k.a), B = point(doc, k.b), L = dist(A, B);
      let s = ((M.x - A.x) * (B.x - A.x) + (M.y - A.y) * (B.y - A.y)) / L;
      if (k.kind === 'segment') s = clamp(s, 0, L); else if (k.kind === 'ray') s = Math.max(0, s);
      if (!loose) s = Math.abs(s - L / 2) < 0.3 ? L / 2 : Math.round(s * 2) / 2;                 // the midpoint, or half-square steps
      if (k.kind === 'segment') s = clamp(s, 0, L);
      const P = { x: A.x + s * (B.x - A.x) / L, y: A.y + s * (B.y - A.y) / L, hold: { on: k.id, t: s / L } };
      return inGrid(g, P.x, P.y) ? P : { x: me.x, y: me.y, hold: me.hold };
    }
    // The end of an arc stays on its circle: it slides around it, a whole degree at a time, so the
    // arc keeps a measure that is easy to read.
    const ride = rideOf(doc, not);
    if (ride) {
      const C = point(doc, ride.c), r = radius(doc, ride), a = Math.atan2(M.y - C.y, M.x - C.x) * 180 / Math.PI, deg = loose ? a : Math.round(a);
      // Close to where a piece from outside would be tangent, it takes that exact point instead.
      const dM = dist(M, C) || 1, onIt = { x: C.x + (M.x - C.x) * r / dM, y: C.y + (M.y - C.y) * r / dM };
      if (!loose) for (const o of joined(doc, not, from)) for (const T of tangentPoints(doc, ride, point(doc, o))) if (dist(onIt, T) < 0.3 && inGrid(g, T.x, T.y)) return T;
      const P = { x: C.x + r * Math.cos(deg * Math.PI / 180), y: C.y + r * Math.sin(deg * Math.PI / 180) };
      return inGrid(g, P.x, P.y) ? P : { x: point(doc, not).x, y: point(doc, not).y };
    }
    // With snapping off, a free point lands exactly where it is put: no grid dot, piece or circle pulls it in.
    if (loose) return G;
    // A tangent position comes next: it is the hardest spot to hit by eye.
    const tan = tangentSnap(doc, M, not, from);
    if (tan && !pointAt(doc, tan.x, tan.y, not)) return tan;
    // Where two pieces cross, so a point can sit exactly on the crossing.
    // Only pieces that do not themselves depend on the moving point can hold it.
    const free = doc.pieces.filter(k => !not || (!dependsOn(doc, k.a, not) && !dependsOn(doc, k.b, not)));
    for (let i = 0; i < free.length; i++) for (let j = i + 1; j < free.length; j++) {
      const X = crossing(doc, free[i], free[j]);
      if (X && dist(M, X) < (tight || 0.45) && inGrid(g, X.x, X.y)) return { x: X.x, y: X.y, hold: { cross: [free[i].id, free[j].id] } };
    }
    for (const k of free) {
      const A = point(doc, k.a), B = point(doc, k.b), L = dist(A, B), u = { x: (B.x - A.x) / L, y: (B.y - A.y) / L };
      let s = (M.x - A.x) * u.x + (M.y - A.y) * u.y;
      if (k.kind === 'segment') s = clamp(s, 0, L); else if (k.kind === 'ray') s = Math.max(0, s);
      const F = { x: A.x + s * u.x, y: A.y + s * u.y };
      if (dist(M, F) > (tight || 0.35)) continue;
      // The spot is held on the piece, so it stays on it when the piece's own points move.
      const held = P => ({ x: P.x, y: P.y, hold: { on: k.id, t: ((P.x - A.x) * u.x + (P.y - A.y) * u.y) / L } });
      const onLine = Math.abs((G.x - A.x) * u.y - (G.y - A.y) * u.x) < 1e-7;
      if (onLine && dist(G, M) < 0.75) return held(G);
      if (Math.abs(s - L / 2) < 0.3) return held({ x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 });
      let n = Math.round(s);
      if (k.kind === 'segment') n = clamp(n, 0, Math.floor(L + EPS));
      const P = { x: A.x + n * u.x, y: A.y + n * u.y };
      if (inGrid(g, P.x, P.y)) return held(P);
    }
    for (const c of doc.circles) {
      if (c.c === not || c.on === not) continue;
      const C = point(doc, c.c), r = radius(doc, c), d = dist(M, C);
      if (d < EPS || Math.abs(d - r) > (tight || 0.4)) continue;
      if (Math.abs(dist(G, C) - r) < 1e-7) return G;
      const P = { x: C.x + (M.x - C.x) * r / d, y: C.y + (M.y - C.y) * r / d };
      if (inGrid(g, P.x, P.y)) return P;
    }
    return G;
  }
  // The first capital letter no point uses yet; after Z, the point starts without a letter.
  function nextLetter(doc) {
    const used = new Set(doc.points.map(p => p.name));
    for (let c = 65; c <= 90; c++) if (!used.has(String.fromCharCode(c))) return String.fromCharCode(c);
    return '';
  }
  // Which side a point's letter sits on. Left on 'auto', it takes the side with the most room:
  // the one farthest (by angle) from every piece drawn at that point.
  function sideOf(doc, p) {
    if (p.side !== 'auto') return p.side;
    const dirs = [];
    for (const k of doc.pieces) {
      if (k.a !== p.id && k.b !== p.id) {
        // A piece that passes through the point (like a line the point was placed on) runs both ways from it.
        const A = point(doc, k.a), B = point(doc, k.b), L = dist(A, B), s = ((p.x - A.x) * (B.x - A.x) + (p.y - A.y) * (B.y - A.y)) / L;
        const off = Math.abs((p.x - A.x) * (B.y - A.y) - (p.y - A.y) * (B.x - A.x)) / L;
        const through = off < 1e-6 && (k.kind === 'line' || (k.kind === 'ray' ? s > 1e-6 : s > 1e-6 && s < L - 1e-6));
        if (through) { const a = Math.atan2(B.y - A.y, B.x - A.x); dirs.push(a, a + Math.PI); }
        continue;
      }
      const o = point(doc, k.a === p.id ? k.b : k.a), a = Math.atan2(o.y - p.y, o.x - p.x);
      dirs.push(a);
      // A line runs on past both of its points, and a ray past its second one.
      if (k.kind === 'line' || (k.kind === 'ray' && k.b === p.id)) dirs.push(a + Math.PI);
    }
    // An angle mark at the point fills the middle of its angle with arcs and a label.
    for (const g of doc.angles) {
      if (g.v !== p.id) continue;
      const A = point(doc, g.a), B = point(doc, g.b), ua = Math.atan2(A.y - p.y, A.x - p.x), ub = Math.atan2(B.y - p.y, B.x - p.x);
      dirs.push(Math.atan2(Math.sin(ua) + Math.sin(ub), Math.cos(ua) + Math.cos(ub)));
    }
    let best = 'ne', room = -1;
    for (const s of ['ne', 'nw', 'se', 'sw', 'n', 's', 'e', 'w']) {
      const a = Math.atan2(-SIDES[s].d[1], SIDES[s].d[0]);      // the grid's y points up, the screen's down
      const gap = Math.min(...dirs.map(b => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)))), Math.PI);
      if (gap > room + 1e-9) { room = gap; best = s; }
    }
    return best;
  }

  // ---------- Changes. Each returns the new id, true or false; false means nothing changed. ----------
  // `hold` (from snap) keeps the new point on its piece or crossing.
  function addPoint(doc, x, y, hold) {
    if (!inGrid(size(doc), x, y) || pointAt(doc, x, y)) return false;
    const id = 'p' + doc.next++, p = { id, x, y, name: nextLetter(doc), side: 'auto', dot: true };
    if (hold) p.hold = hold;
    doc.points.push(p);
    return id;
  }
  // Two names for the same figure: a segment or line either way round, a ray only endpoint first.
  const samePiece = (k, kind, a, b) => k.kind === kind && ((k.a === a && k.b === b) || (kind !== 'ray' && k.a === b && k.b === a));
  /* Where a piece's label sits: 'mid' (beside the middle of its two points), or by the arrowhead past
     point a or past point b. 'end' (a new line or ray) means the end a textbook would use: a ray's
     arrow, or a line's right-hand end (its top end when it is nearly upright). A segment's is the middle. */
  function labelAt(doc, k) {
    if (k.kind === 'segment' || !k.at || k.at === 'mid') return 'mid';
    if (k.kind === 'ray') return 'b';
    if (k.at === 'a' || k.at === 'b') return k.at;
    const A = point(doc, k.a), B = point(doc, k.b), dx = B.x - A.x, dy = B.y - A.y;
    return Math.abs(dx) > 0.2 * Math.hypot(dx, dy) ? (dx > 0 ? 'b' : 'a') : (dy > 0 ? 'b' : 'a');
  }
  function addPiece(doc, kind, a, b) {
    if (!KINDS[kind] || a === b || !point(doc, a) || !point(doc, b) || doc.pieces.some(k => samePiece(k, kind, a, b))) return false;
    const id = 'k' + doc.next++;
    doc.pieces.push({ id, kind, a, b, ticks: 0, arrows: 0, dashed: false, hl: false, label: '', auto: false, flip: false, at: 'end' });
    return id;
  }
  /* Move a point. Everything that depends on it follows: points held on its pieces, and the ends
     of arcs on its circle. The move is refused (false, nothing changed) if it or anything that
     follows would leave the grid or land on another point.
     `hold`: an object sets a new hold (from snap), null lets the point go free, and leaving it
     out keeps the hold it has: a point held on a piece slides to the nearest spot on that piece,
     and a point held at a crossing does not move. */
  function movePoint(doc, id, x, y, hold) {
    const p = point(doc, id);
    if (!p) return false;
    if (hold === undefined && p.hold && heldAt(doc, p)) {
      if (p.hold.cross) return false;
      const k = piece(doc, p.hold.on), A = point(doc, k.a), B = point(doc, k.b), L2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2;
      let t = ((x - A.x) * (B.x - A.x) + (y - A.y) * (B.y - A.y)) / L2;
      if (k.kind === 'segment') t = Math.min(1, Math.max(0, t)); else if (k.kind === 'ray') t = Math.max(0, t);
      hold = { on: k.id, t }; x = A.x + t * (B.x - A.x); y = A.y + t * (B.y - A.y);
    }
    if (!inGrid(size(doc), x, y) || pointAt(doc, x, y, id)) return false;
    if (Math.abs(p.x - x) < EPS && Math.abs(p.y - y) < EPS) return false;
    const before = doc.points.map(q => ({ q, x: q.x, y: q.y, hold: q.hold }));
    const undo = () => { for (const b of before) { b.q.x = b.x; b.q.y = b.y; if (b.hold) b.q.hold = b.hold; else delete b.q.hold; } return false; };
    if (hold) p.hold = hold; else if (hold === null) delete p.hold;
    // Moving a circle's center or sizing point carries the ends of its arcs along, each keeping
    // its direction from the center, so they stay on the circle.
    const riders = [];
    for (const c of doc.circles) {
      if (c.c !== id && c.on !== id) continue;
      const C = point(doc, c.c);
      for (const r of doc.arcs) for (const e of r.c === c.id ? [r.a, r.b] : []) {
        const E = point(doc, e);
        if (e !== c.c && e !== c.on && !riders.some(q => q.E === E)) riders.push({ E, c, ang: Math.atan2(E.y - C.y, E.x - C.x), x: E.x, y: E.y });
      }
    }
    p.x = x; p.y = y;
    for (const q of riders) { const C = point(doc, q.c.c), r = radius(doc, q.c); q.E.x = C.x + r * Math.cos(q.ang); q.E.y = C.y + r * Math.sin(q.ang); }
    settle(doc);
    return sound(doc) ? true : undo();
  }
  // The angle between ray v -> a and ray v -> b, in degrees (0 to 180).
  function degrees(doc, a, v, b) {
    const V = point(doc, v), A = point(doc, a), B = point(doc, b);
    const ux = A.x - V.x, uy = A.y - V.y, wx = B.x - V.x, wy = B.y - V.y;
    return Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) * 180 / Math.PI;
  }
  const angleDeg = (doc, g) => degrees(doc, g.a, g.v, g.b);
  // The measure as a teacher would write it: a whole number when it is one, else one decimal.
  function degText(deg) { const r = Math.round(deg); return (Math.abs(deg - r) < 0.05 ? String(r) : deg.toFixed(1)) + '°'; }
  // An angle mark at vertex v, between the sides through a and through b. A right angle starts
  // with its box; any other starts with one arc.
  function addAngle(doc, a, v, b) {
    if (new Set([a, v, b]).size < 3 || ![a, v, b].every(id => point(doc, id))) return false;
    if (degrees(doc, a, v, b) < 1e-6) return false;                       // both sides point the same way: no angle to mark
    if (doc.angles.some(g => g.v === v && ((g.a === a && g.b === b) || (g.a === b && g.b === a)))) return false;
    const id = 'g' + doc.next++, right = Math.abs(degrees(doc, a, v, b) - 90) < 1e-6;
    doc.angles.push({ id, a, v, b, arcs: right ? 0 : 1, right, set: false, hl: false, label: '', auto: false });
    return id;
  }
  // A polygon through the points in order. Its sides are ordinary segments, added where missing.
  function addPolygon(doc, ids) {
    if (ids.length < 3 || new Set(ids).size !== ids.length || !ids.every(id => point(doc, id))) return false;
    const key = l => l.slice().sort().join(',');
    if (doc.polys.some(y => key(y.pts) === key(ids))) return false;
    ids.forEach((a, i) => addPiece(doc, 'segment', a, ids[(i + 1) % ids.length]));
    const id = 'y' + doc.next++;
    doc.polys.push({ id, pts: ids.slice(), shade: 0 });
    return id;
  }
  // A circle with its center at c, through the point `on`. Moving either point resizes it.
  function addCircle(doc, c, on) {
    if (c === on || !point(doc, c) || !point(doc, on) || doc.circles.some(k => k.c === c && k.on === on)) return false;
    const id = 'c' + doc.next++;
    doc.circles.push({ id, c, on });
    return id;
  }
  // An arc of a circle between two points that lie on it. It starts as the shorter way round
  // (`other` picks the longer way), drawn highlighted so it stands out from the circle.
  function addArc(doc, a, b) {
    if (a === b || !point(doc, a) || !point(doc, b)) return false;
    const onIt = (c, id) => Math.abs(dist(point(doc, id), point(doc, c.c)) - radius(doc, c)) < 1e-6;
    const c = doc.circles.find(k => onIt(k, a) && onIt(k, b));
    if (!c) return false;
    // Two points bound two arcs. With one already drawn, a second is the other way round; a third is refused.
    const twins = doc.arcs.filter(r => r.c === c.id && ((r.a === a && r.b === b) || (r.a === b && r.b === a)));
    if (twins.length > 1) return false;
    const id = 'a' + doc.next++, r = { id, c: c.id, a, b, other: false, hl: true, ticks: 0, label: '', auto: false };
    doc.arcs.push(r);
    const from = q => ((arcSweep(doc, q).start % 360) + 360) % 360;
    if (twins.length && Math.abs(from(r) - from(twins[0])) < 1e-6) r.other = true;
    return id;
  }
  /* The arc of circle `c` from point m counterclockwise to point n: the one already drawn there, or
     a new one. Two points on a circle bound two arcs, and both can be drawn. Returns { id, made },
     or null when the two points are not both on that circle. With `look`, nothing is drawn: null
     when the arc is not there yet. */
  function arcBetween(doc, c, m, n, look) {
    const k = circle(doc, c), C = k && point(doc, k.c), M = point(doc, m), N = point(doc, n);
    if (!k || !M || !N || m === n) return null;
    if (![M, N].every(q => q.id !== k.c && Math.abs(dist(q, C) - radius(doc, k)) < 1e-6)) return null;
    const turn = q => Math.atan2(q.y - C.y, q.x - C.x) * 180 / Math.PI;
    const starts = r => Math.abs((((arcSweep(doc, r).start - turn(M)) % 360) + 540) % 360 - 180) < 1e-6;
    const have = doc.arcs.filter(r => r.c === c && ((r.a === m && r.b === n) || (r.a === n && r.b === m))).find(starts);
    if (have) return { id: have.id, made: false };
    if (look) return null;
    const id = 'a' + doc.next++, r = { id, c, a: m, b: n, other: false, hl: false, ticks: 0, label: '', auto: false };
    doc.arcs.push(r);
    if (!starts(r)) r.other = true;
    return { id, made: true };
  }
  // An arc as angles around its center, counterclockwise on the grid: from `start`, through `sweep` degrees.
  function arcSweep(doc, r) {
    const C = point(doc, circle(doc, r.c).c), A = point(doc, r.a), B = point(doc, r.b);
    const a0 = Math.atan2(A.y - C.y, A.x - C.x) * 180 / Math.PI, a1 = Math.atan2(B.y - C.y, B.x - C.x) * 180 / Math.PI;
    const ccw = ((a1 - a0) % 360 + 360) % 360;                 // a to b, counterclockwise
    const short = ccw <= 180;                                  // is that the shorter way round?
    return short !== r.other ? { start: a0, sweep: ccw } : { start: a1, sweep: 360 - ccw };
  }
  // An arc's two end points in the order it runs, counterclockwise: [start, end].
  function arcEnds(doc, r) {
    const C = point(doc, circle(doc, r.c).c), A = point(doc, r.a), B = point(doc, r.b);
    const ccw = (((Math.atan2(B.y - C.y, B.x - C.x) - Math.atan2(A.y - C.y, A.x - C.x)) * 180 / Math.PI) % 360 + 360) % 360;
    return (ccw <= 180) !== r.other ? [r.a, r.b] : [r.b, r.a];
  }
  /* How an arc is named: its kind ('minor', 'major' or 'semicircle') and the points that name it.
     A minor arc is named by its two ends. A major arc or semicircle is named with a third point in
     the middle, the first lettered point on it going counterclockwise; with no such point drawn,
     only the two ends are given and `short` says the name is not complete. */
  function arcName(doc, r) {
    const s = arcSweep(doc, r), e = arcEnds(doc, r), C = point(doc, circle(doc, r.c).c);
    const kind = Math.abs(s.sweep - 180) < 1e-6 ? 'semicircle' : s.sweep < 180 ? 'minor' : 'major';
    if (kind === 'minor') return { kind, pts: e, short: false };
    const from = q => (((Math.atan2(q.y - C.y, q.x - C.x) * 180 / Math.PI - s.start) % 360) + 360) % 360;
    const mid = pointsOnCircle(doc, r.c).filter(q => q.name && q.id !== e[0] && q.id !== e[1] && from(q) > 1e-6 && from(q) < s.sweep - 1e-6).sort((m, n) => from(m) - from(n))[0];
    return mid ? { kind, pts: [e[0], mid.id, e[1]], short: false } : { kind, pts: e, short: true };
  }
  // An arc's name in words: "Arc BC", "Major Arc BDC", "Semicircle BDC".
  function arcLabel(doc, r) {
    const a = arcName(doc, r), n = pid => (point(doc, pid) || {}).name || '?';
    return `${a.kind === 'major' ? 'Major Arc' : a.kind === 'semicircle' ? 'Semicircle' : 'Arc'} ${a.pts.map(n).join('')}`;
  }
  // The name the arc of circle `c` from point m counterclockwise to point n has, or would have once drawn.
  function arcLabelBetween(doc, c, m, n) {
    const r = { c, a: m, b: n, other: false };
    if (arcEnds(doc, r)[0] !== m) r.other = true;
    return arcLabel(doc, r);
  }
  /* Every point that lies on a piece, in order from its `a` toward its `b`: its own two points,
     points held on it or at a crossing with it, and any other point that happens to sit on it.
     A segment stops at its ends, a ray at its endpoint; a line runs on both ways. */
  function pointsOn(doc, id) {
    const k = piece(doc, id);
    if (!k) return [];
    const A = point(doc, k.a), B = point(doc, k.b), L2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2;
    const t = q => ((q.x - A.x) * (B.x - A.x) + (q.y - A.y) * (B.y - A.y)) / L2;
    const off = q => Math.abs((q.x - A.x) * (B.y - A.y) - (q.y - A.y) * (B.x - A.x)) / Math.sqrt(L2);
    return doc.points.filter(q => q.id === k.a || q.id === k.b || (off(q) < 1e-6 && (k.kind === 'line' || t(q) > -1e-9) && (k.kind !== 'segment' || t(q) < 1 + 1e-9)))
      .sort((m, n) => t(m) - t(n));
  }
  // The parts of a line or ray between neighboring points on it, as pairs of points. A segment has none.
  function partsOf(doc, id) {
    const k = piece(doc, id), on = k && k.kind !== 'segment' ? pointsOn(doc, id) : [];
    return on.slice(1).map((q, i) => [on[i], q]);
  }
  // Every point on a circle (not its center), in order counterclockwise from the positive x direction.
  function pointsOnCircle(doc, id) {
    const c = circle(doc, id), C = c && point(doc, c.c), r = c && radius(doc, c);
    const turn = q => (Math.atan2(q.y - C.y, q.x - C.x) * 180 / Math.PI + 360) % 360;
    return c ? doc.points.filter(q => q.id !== c.c && Math.abs(dist(q, C) - r) < 1e-6).sort((m, n) => turn(m) - turn(n)) : [];
  }
  // A segment with no mark, dash, highlight or label that lies along a line or ray: it cannot be told from that line in the picture.
  function unseen(doc, k) {
    if (k.kind !== 'segment' || k.ticks || k.arrows || k.dashed || k.hl || k.label) return false;
    return doc.pieces.some(m => m.kind !== 'segment' && (() => { const ids = pointsOn(doc, m.id).map(q => q.id); return ids.includes(k.a) && ids.includes(k.b); })());
  }
  /* Alt text: what a student would see in the picture, in sentences. It names what is drawn, the
     marks and labels on it, and how the pieces meet (which points are on which lines and circles,
     and where lines cross). It leaves out what the picture does not show: grid positions, measured
     values and whether a line is tangent, which would give answers away. */
  function altText(doc) {
    const marksOn = doc.marks !== false, nm = id => (point(doc, id) || {}).name || '';
    const list = a => (a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]);
    const count = (k, one) => `${['', 'one', 'two', 'three'][k] || k} ${one}${k === 1 ? '' : 's'}`;
    const lower = s => s.charAt(0).toLowerCase() + s.slice(1);
    // A piece by name ("line AC"), or by kind alone when a point has no letter ("a line").
    const A_KIND = { segment: 'a segment', ray: 'a ray', line: 'a line' };
    const pieceName = k => (nm(k.a) && nm(k.b) ? `${KINDS[k.kind].toLowerCase()} ${nm(k.a)}${nm(k.b)}` : A_KIND[k.kind]);
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    const out = [];
    const names = doc.points.map(p => p.name).filter(Boolean);
    if (names.length) out.push(`${names.length === 1 ? 'Point' : 'Points'} ${list(names)}`);
    // Polygons, by their usual names; their plain sides are not listed again.
    const sides = new Set();
    for (const y of doc.polys) {
      const kind = y.pts.length === 3 ? 'triangle' : y.pts.length === 4 ? 'quadrilateral' : 'polygon', letters = y.pts.map(nm);
      out.push(`${letters.every(Boolean) ? cap(kind) + ' ' + letters.join('') : 'A ' + kind}${y.shade ? ', shaded' : ''}`);
      y.pts.forEach((a, i) => { const b = y.pts[(i + 1) % y.pts.length]; doc.pieces.filter(k => k.kind === 'segment' && ((k.a === a && k.b === b) || (k.a === b && k.b === a))).forEach(k => sides.add(k.id)); });
    }
    const shown = doc.pieces.filter(k => !unseen(doc, k));
    for (const k of shown) {
      const bits = [cap(pieceName(k))];
      if (k.dashed) bits.push('dashed');
      if (k.hl) bits.push('highlighted');
      if (marksOn && k.ticks) bits.push(`marked with ${count(k.ticks, 'tick mark')}`);
      if (marksOn && k.arrows) bits.push(`marked with ${count(k.arrows, 'arrow mark')}`);
      if (k.label) bits.push(`labeled ${k.label}`);
      if (bits.length > 1 || !sides.has(k.id)) out.push(bits.join(', '));
    }
    // How the pieces meet: a lettered point strictly inside one piece is "on" it; inside two or more, they cross there.
    const inside = new Map();
    for (const k of shown) for (const q of pointsOn(doc, k.id)) if (q.id !== k.a && q.id !== k.b && q.name) inside.set(q.id, (inside.get(q.id) || []).concat(k));
    const lined = new Set();          // pieces with a lettered point somewhere along them
    const dir = k => { const A = point(doc, k.a), B = point(doc, k.b); return { x: B.x - A.x, y: B.y - A.y }; };
    const along = (k, m) => { const u = dir(k), v = dir(m); return Math.abs(u.x * v.y - u.y * v.x) < 1e-6 * Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y); };
    for (const [pid, all] of inside) {
      // Of pieces lying along one line through the point, the longest kind speaks for them (line, then ray, then segment).
      const rank = { line: 0, ray: 1, segment: 2 }, ks = [];
      for (const k of all.slice().sort((a, b) => rank[a.kind] - rank[b.kind])) if (!ks.some(m => along(k, m))) ks.push(k);
      if (ks.length > 1) out.push(`${cap(list(ks.map(pieceName)))} cross at point ${nm(pid)}`);
      ks.forEach(k => lined.add(k.id));
    }
    // The order of the points along such a piece tells a student which side of a crossing each point is on.
    for (const kid of lined) out.push(`On ${pieceName(piece(doc, kid))}, the points in order are ${list(pointsOn(doc, kid).map(q => q.name).filter(Boolean))}`);
    for (const c of doc.circles) {
      const center = nm(c.c) ? `with center ${nm(c.c)}` : '', ps = pointsOnCircle(doc, c.id).map(q => q.name).filter(Boolean);
      const where = ps.length ? `${ps.length > 2 ? 'Going counterclockwise, points' : ps.length === 1 ? 'Point' : 'Points'} ${list(ps)} ${ps.length === 1 ? 'is' : 'are'} on ` : '';
      if (!c.hide) { out.push(`A circle ${center}`.trim()); if (where) out.push(`${where}the circle`); }
      for (const a of doc.arcs.filter(q => q.c === c.id)) {
        const e = arcEnds(doc, a), named = nm(e[0]) && nm(e[1]);
        const bits = [(named ? describe(doc, a.id).replace('Major Arc', 'Major arc') : arcSweep(doc, a).sweep > 180 + 1e-6 ? 'A major arc' : 'An arc') + (named ? ` going counterclockwise from ${nm(e[0])} to ${nm(e[1])}` : '') + (c.hide ? `, part of a circle ${center}`.trimEnd() : '')];
        if (a.hl && !c.hide) bits.push('highlighted');
        if (marksOn && a.ticks) bits.push(`marked with ${count(a.ticks, 'tick mark')}`);
        if (a.label) bits.push(`labeled ${a.label}`);
        if (a.hl || a.label || (marksOn && a.ticks) || c.hide) out.push(bits.join(', '));
      }
    }
    for (const g of doc.angles) {
      const bits = [nm(g.a) && nm(g.v) && nm(g.b) ? describe(doc, g.id) : 'An angle'];
      if (marksOn && g.right) bits.push('marked with a right-angle box'); else if (marksOn && g.arcs) bits.push(`marked with ${count(g.arcs, 'arc')}`);
      if (g.hl) bits.push('highlighted');
      if (g.label) bits.push(`labeled ${g.label}`);
      if (bits.length > 1) out.push(bits.join(', '));
    }
    for (const t of doc.texts) if (t.text) out.push(`A label reads: ${t.text}`);
    const note = scaleNote(doc);
    if (note) out.push(`A note reads: ${note}`);
    return out.length ? 'A geometry diagram. ' + out.map(s => s + '.').join(' ') : '';
  }
  // A length as a teacher would write it: whole when it is whole, else one decimal.
  function lenText(v) { const r = Math.round(v); return Math.abs(v - r) < 0.005 ? String(r) : v.toFixed(1); }
  // What the drawing itself measures: a segment's length in grid squares, an angle's or an arc's degrees.
  function measured(doc, id) {
    const o = item(doc, id);
    switch (typeOf(doc, id)) {
      case 'piece': return lenText(dist(point(doc, o.a), point(doc, o.b)));
      case 'angle': return degText(angleDeg(doc, o));
      case 'arc': return degText(arcSweep(doc, o).sweep);
      default: return '';
    }
  }
  // A label set with Use Measured Value follows the drawing (auto): whenever a point moves, the
  // label is rewritten from the new measure, so it can never show a measure that is no longer true.
  function refresh(doc) {
    for (const o of doc.pieces.concat(doc.angles, doc.arcs)) if (o.auto) o.label = measured(doc, o.id);
    /* An angle mark the teacher has not chosen (set) follows the drawing: a box exactly when the
       angle is a right angle, and arcs otherwise. Angles of the same measure get the same number
       of arcs and different measures get different numbers (one arc for the first measure met,
       two for the next, and so on up to five; none after that), so matching arcs never claim
       angles are congruent when they are not. */
    const classes = [];
    for (const g of doc.angles) {
      if (g.set) continue;
      const deg = angleDeg(doc, g);
      g.right = Math.abs(deg - 90) < 1e-4;
      if (g.right) { g.arcs = 0; continue; }
      let i = classes.findIndex(d => Math.abs(d - deg) < 1e-4);
      if (i < 0) i = classes.push(deg) - 1;
      g.arcs = i < 5 ? i + 1 : 0;              // past five different measures there are no more arc counts, so no arc: never a false match
    }
  }

  /* ---------- Does the drawing still match what it says? ----------
     Each mismatch is one sentence for the teacher. They are what makes a picture "not drawn to
     scale": marks or labels that claim something the drawing itself does not show.
     - matching arrows on pieces that are not parallel;
     - matching tick marks on segments (or arcs) of different size;
     - a right-angle box, or matching arcs, chosen by the teacher on angles that do not measure so;
     - a number label on an angle or arc that is not its measure;
     - number labels on segments that are not in proportion to their drawn lengths (a figure from
       measures is drawn larger to fit, so only the proportions are compared);
     - a piece that was drawn tangent to a circle and no longer is. */
  function mismatches(doc) {
    const out = [], name = o => describe(doc, o.id);
    const num = s => { const m = /^\s*(\d+(?:\.\d+)?)\s*°?\s*$/.exec(s || ''); return m ? parseFloat(m[1]) : null; };
    const dir = k => { const A = point(doc, k.a), B = point(doc, k.b), L = dist(A, B); return { x: (B.x - A.x) / L, y: (B.y - A.y) / L, L }; };
    for (const n of [1, 2, 3, 4, 5]) {
      const par = doc.pieces.filter(k => k.arrows === n);
      for (const k of par.slice(1)) { const u = dir(par[0]), w = dir(k); if (Math.abs(u.x * w.y - u.y * w.x) > 1e-6) out.push(`${name(par[0])} and ${name(k)} have matching arrows but are not parallel.`); }
      const tick = doc.pieces.filter(k => k.ticks === n);
      for (const k of tick.slice(1)) if (Math.abs(dir(k).L - dir(tick[0]).L) > 1e-4 * Math.max(1, dir(tick[0]).L)) out.push(`${name(tick[0])} and ${name(k)} have matching tick marks but different lengths.`);
      const arcs = doc.arcs.filter(r => r.ticks === n);
      for (const r of arcs.slice(1)) if (Math.abs(arcSweep(doc, r).sweep - arcSweep(doc, arcs[0]).sweep) > 0.05) out.push(`${name(arcs[0])} and ${name(r)} have matching tick marks but different measures.`);
      // Every angle showing n arcs, chosen or automatic: automatic ones only share a count when they are equal.
      const ang = doc.angles.filter(g => !g.right && g.arcs === n);
      for (const g of ang.slice(1)) if (Math.abs(angleDeg(doc, g) - angleDeg(doc, ang[0])) > 0.05) out.push(`${name(ang[0])} and ${name(g)} have matching arcs but different measures.`);
    }
    for (const g of doc.angles) {
      const deg = angleDeg(doc, g), n = num(g.label);
      if (g.set && g.right && Math.abs(deg - 90) > 1e-4) out.push(`${name(g)} has a right-angle box but measures ${degText(deg)}.`);
      if (n !== null && Math.abs(n - deg) > 0.5) out.push(`${name(g)} is labeled ${g.label.trim()} but measures ${degText(deg)}.`);
    }
    for (const r of doc.arcs) {
      const deg = arcSweep(doc, r).sweep, n = num(r.label);
      if (n !== null && Math.abs(n - deg) > 0.5) out.push(`${name(r)} is labeled ${r.label.trim()} but measures ${degText(deg)}.`);
    }
    const sized = doc.pieces.filter(k => k.kind === 'segment' && num(k.label) > 0);
    for (const k of sized.slice(1)) {
      const want = num(k.label) / num(sized[0].label), got = dir(k).L / dir(sized[0]).L;
      if (Math.abs(want - got) > 0.01 * Math.max(want, got)) out.push(`${name(sized[0])} is labeled ${sized[0].label.trim()} and ${name(k)} is labeled ${k.label.trim()}, but they are not drawn in that proportion.`);
    }
    for (const k of doc.pieces) {
      const c = k.tan && circle(doc, k.tan);
      if (c && tangentTo(doc, k.id) !== c) out.push(`${name(k)} was drawn tangent to ${name(c)} and is no longer tangent.`);
    }
    return out;
  }
  // The note the picture carries about scale ('' for none).
  function scaleNote(doc) {
    const mode = own(SCALES, doc.scale) ? doc.scale : 'auto';
    if (mode === 'none') return '';
    if (mode === 'yes') return 'Drawn to scale';
    return mode === 'not' || mismatches(doc).length ? 'Not drawn to scale' : '';
  }
  // Where two pieces cross, or null when they are parallel or miss each other.
  function crossing(doc, k, m) {
    const A = point(doc, k.a), B = point(doc, k.b), C = point(doc, m.a), D = point(doc, m.b);
    const rx = B.x - A.x, ry = B.y - A.y, sx = D.x - C.x, sy = D.y - C.y, den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((C.x - A.x) * sy - (C.y - A.y) * sx) / den, u = ((C.x - A.x) * ry - (C.y - A.y) * rx) / den;
    const within = (kind, v) => kind === 'line' || (kind === 'ray' ? v >= -EPS : v >= -EPS && v <= 1 + EPS);
    return within(k.kind, t) && within(m.kind, u) ? { x: A.x + t * rx, y: A.y + t * ry } : null;
  }

  // A free label. It can sit anywhere on the grid, on half squares.
  const half = v => Math.round(v * 2) / 2;
  function addText(doc, x, y, str) {
    const g = size(doc);
    const id = 't' + doc.next++;
    doc.texts.push({ id, x: Math.min(g.w - 0.5, Math.max(0.5, half(x))), y: Math.min(g.h - 0.5, Math.max(0.5, half(y))), text: str });
    return id;
  }
  // Tilt a free label: degrees counterclockwise from level, kept between -180 and 180. Level labels carry no tilt.
  function tiltText(doc, id, deg) {
    const t = text(doc, id);
    if (!t || typeof deg !== 'number' || !isFinite(deg)) return false;
    const d = Math.round((((deg + 180) % 360 + 360) % 360 - 180) * 10) / 10;
    if (d === 0) delete t.tilt; else t.tilt = d;
    return true;
  }
  function moveText(doc, id, x, y) {
    const t = text(doc, id), g = size(doc);
    const nx = Math.min(g.w - 0.5, Math.max(0.5, half(x))), ny = Math.min(g.h - 0.5, Math.max(0.5, half(y)));
    if (!t || (t.x === nx && t.y === ny)) return false;
    t.x = nx; t.y = ny;
    return true;
  }
  // Deleting a point also deletes everything drawn from it. Deleting a polygon keeps its sides.
  function remove(doc, id) {
    const type = typeOf(doc, id);
    if (!type) return false;
    if (type === 'point') {
      doc.pieces = doc.pieces.filter(k => k.a !== id && k.b !== id);
      doc.angles = doc.angles.filter(g => g.a !== id && g.v !== id && g.b !== id);
      doc.polys = doc.polys.filter(y => !y.pts.includes(id));
      doc.arcs = doc.arcs.filter(r => r.a !== id && r.b !== id);
      doc.circles = doc.circles.filter(c => c.c !== id && c.on !== id);
    }
    if (type === 'circle' || type === 'point') doc.arcs = doc.arcs.filter(r => r.c !== id && circle(doc, r.c));
    // A polygon with a side deleted is no longer a closed figure, so it goes too (its other sides stay).
    if (type === 'piece') {
      const k = piece(doc, id);
      const side = y => y.pts.some((p, i) => { const q = y.pts[(i + 1) % y.pts.length]; return (p === k.a && q === k.b) || (p === k.b && q === k.a); });
      if (k.kind === 'segment') doc.polys = doc.polys.filter(y => !side(y));
    }
    const list = type === 'poly' ? 'polys' : type + 's';
    doc[list] = doc[list].filter(o => o.id !== id);
    settle(doc);                          // points held on a deleted piece are let go, where they are
    return true;
  }
  function setKind(doc, id, kind) {
    const k = piece(doc, id);
    if (!k || !KINDS[kind] || k.kind === kind || doc.pieces.some(o => o !== k && samePiece(o, kind, k.a, k.b))) return false;
    k.kind = kind;
    return true;
  }
  // A ray starts from its other point instead.
  function swapEnds(doc, id) {
    const k = piece(doc, id);
    if (!k || doc.pieces.some(o => o !== k && samePiece(o, k.kind, k.b, k.a))) return false;
    [k.a, k.b] = [k.b, k.a];
    return true;
  }
  // A smaller grid is allowed only when every point and label still fits on it.
  function setGrid(doc, grid) {
    const g = GRIDS[grid];
    if (!g || grid === doc.grid || !doc.points.every(p => inGrid(g, p.x, p.y)) || !doc.texts.every(t => t.x <= g.w - 0.5 && t.y <= g.h - 0.5)) return false;
    if (!doc.circles.every(c => { const C = point(doc, c.c), r = radius(doc, c); return C.x - r >= 0 && C.y - r >= 0 && C.x + r <= g.w && C.y + r <= g.h; })) return false;
    doc.grid = grid;
    return true;
  }
  // The box around everything drawn, or null for an empty diagram.
  function bounds(doc, seen, half) {
    const xs = [], ys = [];
    for (const p of doc.points) { xs.push(p.x); ys.push(p.y); }
    for (const t of doc.texts) {
      xs.push(t.x); ys.push(t.y);
      if (!half || !t.text) continue;
      // The label's box, turned by its tilt: how far it reaches across and up from its middle.
      const h = half(t), a = (t.tilt || 0) * Math.PI / 180, dx = Math.abs(h.w * Math.cos(a)) + Math.abs(h.h * Math.sin(a)), dy = Math.abs(h.w * Math.sin(a)) + Math.abs(h.h * Math.cos(a));
      xs.push(t.x - dx, t.x + dx); ys.push(t.y - dy, t.y + dy);
    }
    for (const c of doc.circles) {
      const C = point(doc, c.c), r = radius(doc, c);
      if (!(seen && c.hide)) { xs.push(C.x - r, C.x + r); ys.push(C.y - r, C.y + r); continue; }
      // A circle showing only its arcs takes up only the room its arcs do.
      for (const a of doc.arcs.filter(q => q.c === c.id)) {
        const s = arcSweep(doc, a);
        for (let d = 0; d <= s.sweep; d += 5) { const t = (s.start + d) * Math.PI / 180; xs.push(C.x + r * Math.cos(t)); ys.push(C.y + r * Math.sin(t)); }
      }
    }
    if (!xs.length) return null;
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
  }
  // What a screen reader hears for a thing, and what the Selected panel calls it.
  function describe(doc, id) {
    const n = pid => (point(doc, pid) || {}).name || '?';
    const o = item(doc, id);
    switch (typeOf(doc, id)) {
      case 'point': return `Point ${o.name || '(no letter)'}`;
      case 'piece': return `${KINDS[o.kind]} ${n(o.a)}${n(o.b)}`;
      case 'angle': return `Angle ${n(o.a)}${n(o.v)}${n(o.b)}`;
      case 'poly': return `Polygon ${o.pts.map(n).join('')}`;
      case 'circle': return `Circle ${n(o.c)}`;
      // An arc is named from its start to its end going counterclockwise, so the two arcs between
      // the same two points get different names; the longer one is called a major arc.
      // As G.I.N. teaches: two letters name a minor arc; a major arc or a semicircle takes a third letter, a point on it, in the middle.
      case 'arc': return arcLabel(doc, o);
      case 'text': return `Label ${o.text || '(empty)'}`;
      default: return '';
    }
  }

  /* A diagram read back from a saved picture. The data comes from a file, so nothing in it is
     trusted: every id, number and reference is checked, and anything unexpected means the whole
     file is refused (null). */
  function restore(data) {
    try {
      if (!data || data.v !== 1 || !own(GRIDS, data.grid)) return null;
      const doc = create(data.grid), g = GRIDS[data.grid], seen = new Set();
      let max = 0;
      const num = v => typeof v === 'number' && isFinite(v), cnt = v => ([1, 2, 3].includes(v) ? v : 0), cnt5 = v => ([1, 2, 3, 4, 5].includes(v) ? v : 0);
      const str = (v, n) => (typeof v === 'string' ? v.slice(0, n) : '');
      const list = v => { if (v === undefined) return []; if (!Array.isArray(v) || v.length > 500) throw new Error('list'); return v; };
      const take = (id, letter) => {
        if (typeof id !== 'string' || !new RegExp('^' + letter + '[0-9]{1,6}$').test(id) || seen.has(id)) throw new Error('id');
        seen.add(id); max = Math.max(max, +id.slice(1));
        return id;
      };
      const pt = id => { if (!point(doc, id)) throw new Error('point'); return id; };
      for (const p of list(data.points)) {
        if (!num(p.x) || !num(p.y) || !inGrid(g, p.x, p.y)) throw new Error('place');
        if (pointAt(doc, p.x, p.y)) throw new Error('same place');
        doc.points.push({ id: take(p.id, 'p'), x: p.x, y: p.y, name: str(p.name, 3), side: own(SIDES, p.side) ? p.side : 'auto', dot: p.dot !== false });
      }
      for (const k of list(data.pieces)) {
        if (!own(KINDS, k.kind) || k.a === k.b) throw new Error('piece');
        doc.pieces.push({ id: take(k.id, 'k'), kind: k.kind, a: pt(k.a), b: pt(k.b), ticks: cnt(k.ticks), arrows: cnt(k.arrows), dashed: !!k.dashed, hl: !!k.hl, label: str(k.label, 60), auto: !!k.auto, flip: !!k.flip, at: ['a', 'b', 'end'].includes(k.at) ? k.at : 'mid' });
      }
      // Holds name pieces, so they are read once the pieces are in. A hold that makes no sense is dropped.
      for (const p of list(data.points)) {
        const h = p.hold, me = point(doc, p.id), ok = id => typeof id === 'string' && piece(doc, id);
        if (!h || typeof h !== 'object') continue;
        if (ok(h.on) && num(h.t)) me.hold = { on: h.on, t: h.t };
        else if (Array.isArray(h.cross) && h.cross.length === 2 && h.cross[0] !== h.cross[1] && ok(h.cross[0]) && ok(h.cross[1])) me.hold = { cross: [h.cross[0], h.cross[1]] };
      }
      // A hold on a piece that itself depends on the held point is a loop: it is dropped.
      for (const p of doc.points) {
        if (p.hold && (p.hold.on ? [p.hold.on] : p.hold.cross).some(kid => { const k = piece(doc, kid); return dependsOn(doc, k.a, p.id) || dependsOn(doc, k.b, p.id); })) delete p.hold;
      }
      for (const a of list(data.angles)) {
        if (new Set([a.a, a.v, a.b]).size < 3) throw new Error('angle');
        doc.angles.push({ id: take(a.id, 'g'), a: pt(a.a), v: pt(a.v), b: pt(a.b), arcs: cnt5(a.arcs), right: !!a.right, set: !!a.set, hl: !!a.hl, label: str(a.label, 60), auto: !!a.auto });
      }
      for (const y of list(data.polys)) {
        if (!Array.isArray(y.pts) || y.pts.length < 3 || y.pts.length > 50 || new Set(y.pts).size !== y.pts.length) throw new Error('polygon');
        // Older pictures saved the shade as yes or no; yes is the first shade.
        doc.polys.push({ id: take(y.id, 'y'), pts: y.pts.map(pt), shade: y.shade === true ? 1 : [1, 2, 3, 4].includes(y.shade) ? y.shade : 0 });
      }
      for (const c of list(data.circles)) {
        if (c.c === c.on) throw new Error('circle');
        doc.circles.push(Object.assign({ id: take(c.id, 'c'), c: pt(c.c), on: pt(c.on) }, c.hide === true ? { hide: true } : {}));
      }
      for (const r of list(data.arcs)) {
        if (!circle(doc, r.c) || r.a === r.b) throw new Error('arc');
        doc.arcs.push({ id: take(r.id, 'a'), c: r.c, a: pt(r.a), b: pt(r.b), other: !!r.other, hl: !!r.hl, ticks: cnt(r.ticks), label: str(r.label, 60), auto: !!r.auto });
      }
      for (const t of list(data.texts)) {
        if (!num(t.x) || !num(t.y) || t.x < 0 || t.y < 0 || t.x > g.w || t.y > g.h) throw new Error('label');
        doc.texts.push(Object.assign({ id: take(t.id, 't'), x: t.x, y: t.y, text: str(t.text, 80) }, num(t.tilt) && t.tilt !== 0 && Math.abs(t.tilt) <= 180 ? { tilt: t.tilt } : {}));
      }
      for (const k of list(data.pieces)) if (typeof k.tan === 'string' && circle(doc, k.tan)) piece(doc, k.id).tan = k.tan;
      doc.marks = data.marks !== false;
      doc.scale = own(SCALES, data.scale) ? data.scale : 'auto';
      doc.next = max + 1;
      // The file must describe a drawing that can be shown: held points in place, everything on the grid.
      settle(doc);
      if (!sound(doc)) return null;
      return doc;
    } catch (e) { return null; }
  }

  // Undo and redo: a copy of the diagram is kept before every change.
  function history() {
    const past = [], future = [];
    return {
      save(doc) { past.push(JSON.stringify(doc)); future.length = 0; if (past.length > 200) past.shift(); },
      undo(doc) { if (!past.length) return null; future.push(JSON.stringify(doc)); return JSON.parse(past.pop()); },
      redo(doc) { if (!future.length) return null; past.push(JSON.stringify(doc)); return JSON.parse(future.pop()); },
      // A change that turned out to do nothing takes its saved copy back.
      drop() { past.pop(); },
      get canUndo() { return past.length > 0; },
      get canRedo() { return future.length > 0; },
    };
  }

  return { GRIDS, SIDES, KINDS, SHADES, SCALES, settle, sound, holdText, dependsOn, moveMany, mismatches, scaleNote, create, size, point, piece, angle, poly, circle, arc, text, item, typeOf, crossing, arcSweep, arcEnds, arcName, arcLabelBetween, pointsOn, partsOf, pointsOnCircle, altText, pointAt, radius, rideOf, tangentPoints, tangentTo, snap, nextLetter, sideOf,
    addPoint, addPiece, labelAt, movePoint, angleDeg, degText, addAngle, addPolygon, addCircle, addArc, arcBetween, addText, tiltText, moveText, remove, setKind, swapEnds, setGrid, bounds, describe, restore, lenText, measured, refresh, history };
})();
