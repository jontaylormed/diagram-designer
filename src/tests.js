/* Tests for the diagram model and the picture frame. Open diagram-designer-tests.html; results
   show on the page and in window.testSummary. */
(() => {
  'use strict';
  const results = [];
  const t = (name, fn) => {
    try { const r = fn(); results.push({ name, ok: r === true, info: r === true ? '' : String(r) }); }
    catch (e) { results.push({ name, ok: false, info: 'threw: ' + e.message }); }
  };
  // A(3,3) B(9,3) C(6,8), with segment AB, ray AC and line BC.
  const tri = () => {
    const d = Model.create('medium');
    const a = Model.addPoint(d, 3, 3), b = Model.addPoint(d, 9, 3), c = Model.addPoint(d, 6, 8);
    return { d, a, b, c, ab: Model.addPiece(d, 'segment', a, b), ac: Model.addPiece(d, 'ray', a, c), bc: Model.addPiece(d, 'line', b, c) };
  };

  t('a new diagram is empty on the medium grid', () => { const d = Model.create(); return d.grid === 'medium' && Model.size(d).w === 30 && Model.size(d).h === 20 && !d.points.length || JSON.stringify(d); });
  t('the medium and large grids are bigger than the small one', () => Model.GRIDS.medium.w > Model.GRIDS.small.w && Model.GRIDS.large.w > Model.GRIDS.medium.w && Model.GRIDS.large.h > Model.GRIDS.medium.h);
  t('points get the letters A, B, C in order', () => { const f = tri(); return f.d.points.map(p => p.name).join('') === 'ABC' || f.d.points.map(p => p.name).join(''); });
  t('a deleted letter is used again', () => { const f = tri(); Model.remove(f.d, f.b); Model.addPoint(f.d, 12, 12); return f.d.points.map(p => p.name).join('') === 'ACB' || f.d.points.map(p => p.name).join(''); });
  t('after Z a point starts with no letter', () => { const d = Model.create('large'); for (let i = 0; i < 27; i++) Model.addPoint(d, 1 + i, 1); return d.points[25].name === 'Z' && d.points[26].name === '' || d.points[26].name; });
  t('a lone point puts its letter above right', () => { const d = Model.create(); Model.addPoint(d, 5, 5); return Model.sideOf(d, d.points[0]) === 'ne'; });
  t('a letter moves away from the pieces at its point', () => {
    // A is the bottom left corner of the triangle: pieces leave it to the right and up right, so the letter goes below left.
    const f = tri(), sides = f.d.points.map(p => Model.sideOf(f.d, p));
    return sides[0] === 'sw' && sides[1] !== 'nw' && sides[1] !== 'w' && sides[2] === 'e' || sides.join(' ');   // at C the ray and the line cross like an X, so the letter goes beside it
  });
  t('a chosen letter side is kept', () => { const f = tri(); Model.point(f.d, f.a).side = 'e'; return Model.sideOf(f.d, Model.point(f.d, f.a)) === 'e'; });
  t('two points cannot share a grid dot', () => { const f = tri(); return Model.addPoint(f.d, 3, 3) === false && f.d.points.length === 3; });
  t('a point cannot sit on or past the grid edge', () => { const d = Model.create('small'); return Model.addPoint(d, 0, 5) === false && Model.addPoint(d, 20, 5) === false && Model.addPoint(d, 5, 14) === false && Model.addPoint(d, 19, 13) !== false; });
  t('snap picks the nearest grid dot and stays inside', () => { const d = Model.create('small'); const s = Model.snap(d, { x: 4.4, y: 7.6 }), e = Model.snap(d, { x: -3, y: 99 }); return s.x === 4 && s.y === 8 && e.x === 1 && e.y === 13 || JSON.stringify([s, e]); });
  t('snap reaches the far corner of every grid', () => Object.keys(Model.GRIDS).every(k => { const d = Model.create(k), g = Model.GRIDS[k], s = Model.snap(d, { x: g.w + 5, y: g.h + 5 }); return s.x === g.w - 1 && s.y === g.h - 1; }));
  // ---------- Snap to Grid switched off ----------
  t('with snap off a point lands exactly where it is put, still inside the grid', () => { const d = Model.create('small'); const s = Model.snap(d, { x: 4.37, y: 7.62 }, undefined, undefined, true), e = Model.snap(d, { x: -3, y: 99 }, undefined, undefined, true); return s.x === 4.37 && s.y === 7.62 && !s.hold && e.x === 1 && e.y === 13 || JSON.stringify([s, e]); });
  t('with snap off a nearby segment does not pull the point onto it', () => { const d = Model.create(); const a = Model.addPoint(d, 2, 2), b = Model.addPoint(d, 7, 5); Model.addPiece(d, 'segment', a, b); const S = Model.snap(d, { x: 4.6, y: 3.4 }, undefined, undefined, true); return S.x === 4.6 && S.y === 3.4 && !S.hold || JSON.stringify(S); });
  t('with snap off a moved point keeps its off-grid place', () => { const d = Model.create(); const a = Model.addPoint(d, 3, 3); const S = Model.snap(d, { x: 5.28, y: 6.91 }, a, undefined, true); Model.movePoint(d, a, S.x, S.y, S.hold || null); const p = Model.point(d, a); return p.x === 5.28 && p.y === 6.91 || JSON.stringify(p); });
  t('a new point tapped beside a segment, not on it, lands on the grid dot and is not joined to it', () => { const d = Model.create(); const a = Model.addPoint(d, 2, 2), b = Model.addPoint(d, 12, 2); Model.addPiece(d, 'segment', a, b); const S = Model.snap(d, { x: 6.1, y: 2.3 }, undefined, undefined, false, 0.2), T = Model.snap(d, { x: 6.1, y: 2.6 }, undefined, undefined, false, 0.2); return S.x === 6 && S.y === 2 && T.x === 6 && T.y === 3 && !T.hold || JSON.stringify([S, T]); });
  t('a new point tapped right on a segment is still joined to it', () => { const d = Model.create(); const a = Model.addPoint(d, 2, 2), b = Model.addPoint(d, 7, 5); const k = Model.addPiece(d, 'segment', a, b); const S = Model.snap(d, { x: 4.55, y: 3.45 }, undefined, undefined, false, 0.2), T = Model.snap(d, { x: 4.75, y: 3.2 }, undefined, undefined, false, 0.2); return S.hold && S.hold.on === k && !T.hold && T.x === 5 && T.y === 3 || JSON.stringify([S, T]); });
  t('a piece needs two different points', () => { const f = tri(); return Model.addPiece(f.d, 'segment', f.a, f.a) === false && Model.addPiece(f.d, 'segment', f.a, 'nope') === false; });
  t('segment BA is the same as segment AB', () => { const f = tri(); return Model.addPiece(f.d, 'segment', f.b, f.a) === false; });
  t('line CB is the same as line BC', () => { const f = tri(); return Model.addPiece(f.d, 'line', f.c, f.b) === false; });
  t('ray CA is a different ray from ray AC', () => { const f = tri(); return Model.addPiece(f.d, 'ray', f.a, f.c) === false && Model.addPiece(f.d, 'ray', f.c, f.a) !== false; });
  t('a segment and a line can share two points', () => { const f = tri(); return Model.addPiece(f.d, 'line', f.a, f.b) !== false; });
  t('moving a point keeps its pieces', () => { const f = tri(); return Model.movePoint(f.d, f.c, 7, 9) === true && Model.point(f.d, f.c).x === 7 && f.d.pieces.length === 3; });
  t('a point cannot move onto another point or off the grid', () => { const f = tri(); return Model.movePoint(f.d, f.c, 3, 3) === false && Model.movePoint(f.d, f.c, 30, 8) === false && Model.point(f.d, f.c).x === 6; });
  t('deleting a point deletes its pieces', () => { const f = tri(); Model.remove(f.d, f.a); return f.d.points.length === 2 && f.d.pieces.length === 1 && f.d.pieces[0].id === f.bc || JSON.stringify(f.d.pieces); });
  t('deleting a piece keeps its points', () => { const f = tri(); Model.remove(f.d, f.ab); return f.d.points.length === 3 && f.d.pieces.length === 2; });
  t('a segment can become a ray or a line', () => { const f = tri(); return Model.setKind(f.d, f.ab, 'ray') === true && Model.piece(f.d, f.ab).kind === 'ray' && Model.setKind(f.d, f.ab, 'line') === true; });
  t('a piece cannot become one that is already drawn', () => { const f = tri(); const l = Model.addPiece(f.d, 'line', f.a, f.b); return Model.setKind(f.d, l, 'segment') === false && Model.piece(f.d, l).kind === 'line'; });
  t('a ray can start from its other point', () => { const f = tri(); return Model.swapEnds(f.d, f.ac) === true && Model.piece(f.d, f.ac).a === f.c && Model.describe(f.d, f.ac) === 'Ray CA' || Model.describe(f.d, f.ac); });
  t('pieces are named by their letters', () => { const f = tri(); return Model.describe(f.d, f.ab) === 'Segment AB' && Model.describe(f.d, f.bc) === 'Line BC' && Model.describe(f.d, f.a) === 'Point A' || Model.describe(f.d, f.ab); });
  t('the grid can grow', () => { const f = tri(); return Model.setGrid(f.d, 'large') === true && f.d.grid === 'large' && Model.point(f.d, f.c).y === 8; });
  t('the grid shrinks only when every point still fits', () => { const f = tri(); Model.movePoint(f.d, f.c, 25, 8); const no = Model.setGrid(f.d, 'small'); Model.movePoint(f.d, f.c, 6, 8); return no === false && Model.setGrid(f.d, 'small') === true; });
  t('undo brings back a deleted point and its pieces', () => {
    const f = tri(), h = Model.history();
    h.save(f.d); Model.remove(f.d, f.a);
    const back = h.undo(f.d);
    return back.points.length === 3 && back.pieces.length === 3 && h.canRedo || JSON.stringify(back);
  });
  t('redo repeats the change, and a new change clears redo', () => {
    const f = tri(), h = Model.history();
    h.save(f.d); Model.remove(f.d, f.a);
    const back = h.undo(f.d), again = h.redo(back);
    if (again.points.length !== 2 || !h.canUndo || h.canRedo) return 'redo failed';
    const b2 = h.undo(again); h.save(b2);
    return h.canRedo === false;
  });
  t('a change that did nothing leaves no undo step', () => { const f = tri(), h = Model.history(); h.save(f.d); h.drop(); return h.canUndo === false; });
  t('the picture frame is the drawing plus room, inside the grid', () => {
    const f = tri(), fr = Export.frame(f.d);
    return fr.x0 === 1.5 && fr.x1 === 10.5 && fr.y0 === 1.5 && fr.y1 === 9.5 || JSON.stringify(fr);
  });
  t('the picture frame stops at the grid edge', () => { const d = Model.create('small'); Model.addPoint(d, 1, 1); Model.addPoint(d, 19, 13); const fr = Export.frame(d); return fr.x0 === 0 && fr.y0 === 0 && fr.x1 === 20 && fr.y1 === 14 || JSON.stringify(fr); });
  t('an empty diagram has no picture', () => Export.frame(Model.create()) === null);

  // ---------- Marks, angles, polygons, circles, arcs and labels ----------
  const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
  t('a new piece has no marks', () => { const f = tri(), k = Model.piece(f.d, f.ab); return k.ticks === 0 && k.arrows === 0 && !k.dashed && !k.hl && k.label === ''; });
  t('an angle mark measures the angle between its sides', () => { const f = tri(); const g = Model.addAngle(f.d, f.b, f.a, f.c); return near(Model.angleDeg(f.d, Model.angle(f.d, g)), Math.atan2(5, 3) * 180 / Math.PI) || Model.angleDeg(f.d, Model.angle(f.d, g)); });
  t('an angle mark starts with one arc', () => { const f = tri(); const g = Model.angle(f.d, Model.addAngle(f.d, f.b, f.a, f.c)); return g.arcs === 1 && g.right === false; });
  t('a right angle starts with its box', () => {
    const d = Model.create(); const v = Model.addPoint(d, 4, 4), a = Model.addPoint(d, 9, 4), b = Model.addPoint(d, 4, 8);
    const g = Model.angle(d, Model.addAngle(d, a, v, b));
    return g.right === true && g.arcs === 0;
  });
  t('angle ABC and angle CBA are the same mark', () => { const f = tri(); Model.addAngle(f.d, f.a, f.b, f.c); return Model.addAngle(f.d, f.c, f.b, f.a) === false; });
  t('an angle needs three different points', () => { const f = tri(); return Model.addAngle(f.d, f.a, f.a, f.c) === false; });
  t('measures are written whole when they are whole', () => Model.degText(90) === '90°' && Model.degText(59.036) === '59°' && Model.degText(53.13) === '53.1°' || Model.degText(59.036));
  t('a polygon adds the sides that are missing', () => {
    const d = Model.create(); const p = [[3, 3], [9, 3], [9, 8], [3, 8]].map(([x, y]) => Model.addPoint(d, x, y));
    Model.addPiece(d, 'segment', p[0], p[1]);
    const y = Model.addPolygon(d, p);
    return y !== false && d.pieces.length === 4 && d.pieces.every(k => k.kind === 'segment') && Model.describe(d, y) === 'Polygon ABCD' || d.pieces.length;
  });
  t('a polygon needs three corners, and is drawn once', () => { const f = tri(); return Model.addPolygon(f.d, [f.a, f.b]) === false && Model.addPolygon(f.d, [f.a, f.b, f.c]) !== false && Model.addPolygon(f.d, [f.c, f.a, f.b]) === false; });
  t('deleting a polygon keeps its sides', () => { const f = tri(); const n = f.d.pieces.length, y = Model.addPolygon(f.d, [f.a, f.b, f.c]); const sides = f.d.pieces.length; Model.remove(f.d, y); return sides >= n && f.d.pieces.length === sides && f.d.polys.length === 0; });
  const circ = () => { const d = Model.create(); const c = Model.addPoint(d, 10, 10), on = Model.addPoint(d, 15, 10); return { d, c, on, k: Model.addCircle(d, c, on) }; };
  t('a circle goes through its second point', () => { const f = circ(); return near(Model.radius(f.d, Model.circle(f.d, f.k)), 5) && Model.describe(f.d, f.k) === 'Circle A'; });
  t('moving the point on a circle resizes it', () => { const f = circ(); Model.movePoint(f.d, f.on, 13, 14); return near(Model.radius(f.d, Model.circle(f.d, f.k)), 5) && (Model.movePoint(f.d, f.on, 10, 13), near(Model.radius(f.d, Model.circle(f.d, f.k)), 3)); });
  t('a new point near a circle lands exactly on it', () => {
    const f = circ(), S = Model.snap(f.d, { x: 13.4, y: 13.7 });
    return near(Math.hypot(S.x - 10, S.y - 10), 5) || JSON.stringify(S);
  });
  t('a grid dot that is on the circle is used as it is', () => { const f = circ(), S = Model.snap(f.d, { x: 13.1, y: 14.1 }); return S.x === 13 && S.y === 14 || JSON.stringify(S); });
  t('an arc joins two points on one circle, the short way', () => {
    const f = circ(); const q = Model.addPoint(f.d, 10, 15), r = Model.addArc(f.d, f.on, q), s = Model.arcSweep(f.d, Model.arc(f.d, r));
    return near(s.sweep, 90) && near(s.start, 0) && Model.arc(f.d, r).hl === true || JSON.stringify(s);
  });
  t('the other arc goes the long way round', () => { const f = circ(); const q = Model.addPoint(f.d, 10, 15), r = Model.arc(f.d, Model.addArc(f.d, f.on, q)); r.other = true; const s = Model.arcSweep(f.d, r); return near(s.sweep, 270) && near(s.start, 90) || JSON.stringify(s); });
  t('an arc needs both points on a circle', () => { const f = circ(); const q = Model.addPoint(f.d, 12, 12); return Model.addArc(f.d, f.on, q) === false; });
  t('deleting a circle deletes its arcs', () => { const f = circ(); const q = Model.addPoint(f.d, 10, 15); Model.addArc(f.d, f.on, q); Model.remove(f.d, f.k); return f.d.circles.length === 0 && f.d.arcs.length === 0 && f.d.points.length === 3; });
  t('two points on a circle bound two arcs, and both can be drawn', () => {
    const f = circ(), q = Model.addPoint(f.d, 10, 15);
    const one = Model.arcBetween(f.d, f.k, f.on, q), two = Model.arcBetween(f.d, f.k, q, f.on), again = Model.arcBetween(f.d, f.k, f.on, q);
    const s1 = Model.arcSweep(f.d, Model.arc(f.d, one.id)).sweep, s2 = Model.arcSweep(f.d, Model.arc(f.d, two.id)).sweep;
    return one.made && two.made && !again.made && again.id === one.id && near(s1, 90) && near(s2, 270) && f.d.arcs.length === 2 || [s1, s2, f.d.arcs.length].join(' ');
  });
  t('a circle showing only its arcs is left out of the picture and its frame, and is kept when reopened', () => {
    const f = circ(), q = Model.addPoint(f.d, 10, 15); Model.arcBetween(f.d, f.k, f.on, q);
    const whole = Model.bounds(f.d, true); Model.circle(f.d, f.k).hide = true;
    const part = Model.bounds(f.d, true), svg = document.createElementNS('http:' + '//www.w3.org/2000/svg', 'svg'), back = Model.restore(JSON.parse(JSON.stringify(f.d)));
    Render.draw(svg, f.d, {});
    return whole.x0 === 5 && part.x0 === 10 && part.y0 === 10 && near(part.x1, 15) && near(part.y1, 15) && Model.bounds(f.d).x0 === 5 && svg.querySelectorAll('circle[fill="none"]').length === 0 && back.circles[0].hide === true || JSON.stringify(part);
  });
  t('the Arc tool draws the second arc between two points the other way round, and refuses a third', () => {
    const f = circ(), q = Model.addPoint(f.d, 10, 15), one = Model.addArc(f.d, f.on, q), two = Model.addArc(f.d, q, f.on), three = Model.addArc(f.d, f.on, q);
    const s = [one, two].map(id => Model.arcSweep(f.d, Model.arc(f.d, id)).sweep);
    return near(s[0], 90) && near(s[1], 270) && three === false || s.join(' ');
  });
  t('deleting a point deletes its angles, polygons, circles and arcs', () => {
    const f = circ(); const q = Model.addPoint(f.d, 10, 15);
    Model.addArc(f.d, f.on, q); Model.addAngle(f.d, f.on, f.c, q); Model.addPolygon(f.d, [f.c, f.on, q]);
    Model.remove(f.d, f.c);
    return f.d.circles.length === 0 && f.d.arcs.length === 0 && f.d.angles.length === 0 && f.d.polys.length === 0 && f.d.pieces.length === 1 || JSON.stringify([f.d.circles.length, f.d.arcs.length, f.d.angles.length, f.d.polys.length, f.d.pieces.length]);
  });
  // Two lines that cross at (6.5, 5.5), which is not a grid dot.
  const cross = () => { const d = Model.create(); const p = [[3, 2], [10, 9], [3, 9], [10, 2]].map(([x, y]) => Model.addPoint(d, x, y)); return { d, p, k: Model.addPiece(d, 'line', p[0], p[1]), m: Model.addPiece(d, 'line', p[2], p[3]) }; };
  t('a new point near a crossing lands exactly on it', () => { const f = cross(), S = Model.snap(f.d, { x: 6.3, y: 5.6 }); return near(S.x, 6.5) && near(S.y, 5.5) || JSON.stringify(S); });
  t('perpendicular lines get a right-angle box at their crossing', () => {
    const f = cross(), S = Model.snap(f.d, { x: 6.4, y: 5.4 }), x = Model.addPoint(f.d, S.x, S.y);
    const g = Model.angle(f.d, Model.addAngle(f.d, f.p[1], x, f.p[3]));
    return g.right === true;
  });
  t('segments that stop short do not cross', () => { const f = cross(); Model.setKind(f.d, f.k, 'segment'); Model.movePoint(f.d, f.p[1], 5, 4); return Model.crossing(f.d, Model.piece(f.d, f.k), Model.piece(f.d, f.m)) === null; });
  t('parallel lines do not cross', () => { const d = Model.create(); const p = [[2, 2], [8, 2], [2, 6], [8, 6]].map(([x, y]) => Model.addPoint(d, x, y)); const k = Model.addPiece(d, 'line', p[0], p[1]), m = Model.addPiece(d, 'line', p[2], p[3]); return Model.crossing(d, Model.piece(d, k), Model.piece(d, m)) === null; });
  t('a new point near the middle of a segment lands on its midpoint', () => { const d = Model.create(); const a = Model.addPoint(d, 2, 2), b = Model.addPoint(d, 7, 5); Model.addPiece(d, 'segment', a, b); const S = Model.snap(d, { x: 4.6, y: 3.4 }); return near(S.x, 4.5) && near(S.y, 3.5) || JSON.stringify(S); });
  t('a point being dragged does not snap to its own pieces', () => { const f = tri(), S = Model.snap(f.d, { x: 6.2, y: 3.1 }, f.a); return S.x === 6 && S.y === 3 || JSON.stringify(S); });
  t('a text label sits on half squares and can move', () => { const d = Model.create(); const id = Model.addText(d, 5.2, 7.8, 'x'); const tx = Model.text(d, id); return tx.x === 5 && tx.y === 8 && Model.moveText(d, id, 6.3, 8) === true && tx.x === 6.5 && Model.moveText(d, id, 6.4, 8.1) === false; });
  t('a text label tilts to any angle, turns on the picture, and keeps its tilt when reopened', () => {
    const d = Model.create(), id = Model.addText(d, 5, 7, 'x'), tx = Model.text(d, id);
    Model.tiltText(d, id, 37.5); const a = tx.tilt; Model.tiltText(d, id, 270); const b = tx.tilt;
    const s = document.createElementNS('http:' + '//www.w3.org/2000/svg', 'svg'); Render.draw(s, d, {});
    const turned = /^rotate\(90 /.test(s.querySelector('[transform]').getAttribute('transform') || ''), back = Model.restore(JSON.parse(JSON.stringify(d))).texts[0].tilt;
    Model.tiltText(d, id, 0);
    return a === 37.5 && b === -90 && turned && back === -90 && !('tilt' in tx) && Model.tiltText(d, id, NaN) === false || [a, b, turned, back].join(' ');
  });
  t('the picture frame includes circles and labels', () => { const f = circ(); Model.addText(f.d, 20, 3, 'note'); const b = Model.bounds(f.d); return b.x0 === 5 && b.x1 === 20 && b.y0 === 3 && b.y1 === 15 || JSON.stringify(b); });
  t('everything has a name to read aloud', () => { const f = circ(); const q = Model.addPoint(f.d, 10, 15); return Model.describe(f.d, Model.addArc(f.d, f.on, q)) === 'Arc BC' && Model.describe(f.d, Model.addAngle(f.d, f.on, f.c, q)) === 'Angle BAC' && Model.describe(f.d, Model.addText(f.d, 3, 3, 'hi')) === 'Label hi'; });

  // ---------- The tools that reshape the drawing ----------
  t('typed measures are read as numbers', () => Solve.number('40') === 40 && Solve.number(' 40° ') === 40 && Solve.number('7.5') === 7.5 && Solve.number('.5') === 0.5 && isNaN(Solve.number('x')) && isNaN(Solve.number('')) && isNaN(Solve.number('-3')));
  // An angle at V(8,5) with sides through P(14,5) and Q(11,9).
  const ang = () => { const d = Model.create(); const v = Model.addPoint(d, 8, 5), p = Model.addPoint(d, 14, 5), q = Model.addPoint(d, 11, 9); return { d, v, p, q, g: Model.addAngle(d, p, v, q) }; };
  t('Make This Angle draws exactly the measure typed', () => {
    const f = ang(); const r = Solve.setAngle(f.d, f.g, 40, f.q), Q = Model.point(f.d, f.q);
    return r === true && near(Model.angleDeg(f.d, Model.angle(f.d, f.g)), 40, 1e-9) && near(Math.hypot(Q.x - 8, Q.y - 5), 5, 1e-9) && Q.y > 5 || JSON.stringify([r, Q]);
  });
  t('Make This Angle can move either side', () => { const f = ang(); Solve.setAngle(f.d, f.g, 70, f.p); const P = Model.point(f.d, f.p), Q = Model.point(f.d, f.q); return near(Model.angleDeg(f.d, Model.angle(f.d, f.g)), 70, 1e-9) && Q.x === 11 && Q.y === 9 && near(Math.hypot(P.x - 8, P.y - 5), 6, 1e-9); });
  t('Make This Angle moves the point with less drawn from it', () => { const f = ang(); Model.addPiece(f.d, 'segment', f.q, f.v); Model.addPiece(f.d, 'segment', f.q, f.p); Solve.setAngle(f.d, f.g, 30); return Model.point(f.d, f.q).x === 11 && near(Model.angleDeg(f.d, Model.angle(f.d, f.g)), 30, 1e-9); });
  t('an impossible angle is refused with a reason', () => { const f = ang(), before = JSON.stringify(f.d); return !!Solve.setAngle(f.d, f.g, 0).error && !!Solve.setAngle(f.d, f.g, 181).error && JSON.stringify(f.d) === before; });
  t('an angle that would leave the grid is refused', () => { const d = Model.create('small'); const v = Model.addPoint(d, 2, 2), p = Model.addPoint(d, 18, 2), q = Model.addPoint(d, 18, 6); const g = Model.addAngle(d, q, v, p), before = JSON.stringify(d); return !!Solve.setAngle(d, g, 80, p).error && JSON.stringify(d) === before; });
  t('Make This Side sets the length and keeps the direction', () => {
    const f = tri(); const r = Solve.setLength(f.d, f.ab, 4.5, f.b), B = Model.point(f.d, f.b);
    return r === true && near(B.x, 7.5) && B.y === 3 && Solve.lenText(Solve.length(f.d, Model.piece(f.d, f.ab))) === '4.5' || JSON.stringify(B);
  });
  t('lengths are written whole when they are whole', () => Solve.lenText(5) === '5' && Solve.lenText(4.999999) === '5' && Solve.lenText(8.66) === '8.7');
  const T = m => Solve.triangle(m), one = m => T(m).triangles && T(m).triangles.length === 1 && T(m).triangles[0];
  t('three sides: 3, 4, 5 has a right angle across from 5', () => { const u = one({ a: 3, b: 4, c: 5 }); return u && near(u.C, 90) && near(u.A + u.B + u.C, 180) || JSON.stringify(T({ a: 3, b: 4, c: 5 })); });
  t('two sides and the angle between them', () => { const u = one({ a: 3, b: 4, C: 90 }); return u && near(u.c, 5) && near(u.A, Math.atan2(3, 4) * 180 / Math.PI) || JSON.stringify(u); });
  t('two angles and the side between them', () => { const u = one({ A: 30, B: 60, c: 10 }); return u && near(u.C, 90) && near(u.a, 5) && near(u.b, Math.sqrt(75)) || JSON.stringify(u); });
  t('two angles and a side not between them', () => { const u = one({ A: 30, B: 60, a: 5 }); return u && near(u.c, 10) && near(u.b, Math.sqrt(75)) || JSON.stringify(u); });
  t('two sides and an angle not between them can fit two triangles', () => {
    const r = T({ a: 7, b: 10, A: 30 });
    return r.triangles && r.triangles.length === 2 && near(r.triangles[0].B + r.triangles[1].B, 180) && r.triangles.every(u => near(u.A + u.B + u.C, 180) && near(u.a / Math.sin(u.A * Math.PI / 180), u.c / Math.sin(u.C * Math.PI / 180))) || JSON.stringify(r);
  });
  t('or one triangle, when the side across is the longer one', () => { const u = one({ a: 10, b: 7, A: 30 }); return u && u.B < 30 || JSON.stringify(T({ a: 10, b: 7, A: 30 })); });
  t('or none, when the side across is too short', () => !!T({ a: 3, b: 10, A: 30 }).error);
  t('three angles are not enough', () => /at least one side/.test(T({ A: 60, B: 60, C: 60 }).error || ''));
  t('sides that cannot meet are refused', () => !!T({ a: 1, b: 2, c: 5 }).error && !!T({ a: 2, b: 3, c: 5 }).error);
  t('two angles that add to 180 or more are refused', () => !!T({ A: 100, B: 80, c: 5 }).error && !!T({ A: 190, b: 4, c: 5 }).error);
  t('exactly three measures are needed', () => !!T({ a: 3, b: 4 }).error && !!T({ a: 3, b: 4, c: 5, A: 30 }).error && !!T({ a: 0, b: 4, c: 5 }).error);
  t('a drawn triangle matches every measure and is labeled', () => {
    const d = Model.create(), u = one({ A: 40, b: 7, c: 9 }), y = Solve.drawTriangle(d, u, ['A', 'b', 'c']);
    const [A, B, C] = d.points.map(p => p.id), deg = (p, v, q) => Model.angleDeg(d, { a: p, v, b: q });
    const len = (p, q) => Math.hypot(Model.point(d, p).x - Model.point(d, q).x, Model.point(d, p).y - Model.point(d, q).y);
    const g = Model.size(d), inside = d.points.every(p => p.x >= 1 && p.x <= g.w - 1 && p.y >= 1 && p.y <= g.h - 1);
    const labels = d.pieces.map(k => k.label).filter(Boolean).sort().join(',');
    return typeof y === 'string' && d.points.length === 3 && d.pieces.length === 3 && d.polys.length === 1 && inside
      && near(deg(B, A, C), 40, 1e-7) && near(deg(A, B, C), u.B, 1e-7) && near(len(A, C) / len(A, B), 7 / 9, 1e-9)
      && labels === '7,9' && d.angles.length === 1 && d.angles[0].label === '40°' || JSON.stringify([labels, d.angles, deg(B, A, C)]);
  });
  t('Fit to Frame keeps every angle and fills the grid', () => {
    const d = Model.create(); const a = Model.addPoint(d, 2, 2), b = Model.addPoint(d, 5, 2), c = Model.addPoint(d, 3, 4);
    const before = Model.angleDeg(d, { a: b, v: a, b: c }), r = Solve.fitToFrame(d), bd = Model.bounds(d);
    return r === true && near(Model.angleDeg(d, { a: b, v: a, b: c }), before, 1e-9) && bd.x1 - bd.x0 > 20 && bd.x0 >= 2 && bd.y0 >= 2 && bd.x1 <= 28 && bd.y1 <= 18 || JSON.stringify(bd);
  });
  t('Fit to Frame keeps a grid drawing on grid dots', () => { const d = Model.create(); Model.addPoint(d, 2, 2); Model.addPoint(d, 5, 2); Model.addPoint(d, 3, 4); Solve.fitToFrame(d); return d.points.every(p => Number.isInteger(p.x) && Number.isInteger(p.y)) || JSON.stringify(d.points); });
  t('Fit to Frame says so when there is nothing to do', () => { const d = Model.create(); Model.addPoint(d, 2, 2); Model.addPoint(d, 5, 2); Model.addPoint(d, 3, 4); Solve.fitToFrame(d); return !!Solve.fitToFrame(d).error && !!Solve.fitToFrame(Model.create()).error; });
  t('Fit to Frame shrinks a drawing that is too big for the room', () => { const d = Model.create('small'); Model.addPoint(d, 1, 1); Model.addPoint(d, 19, 1); Model.addPoint(d, 19, 13); const r = Solve.fitToFrame(d), b = Model.bounds(d); return r === true && near(b.y0, 2) && near(b.y1, 12) && near(b.x0, 2.5) && near(b.x1, 17.5) || JSON.stringify(b); });
  t('turning keeps every angle and length', () => {
    const f = ang(); Model.addPiece(f.d, 'segment', f.v, f.p); const k = f.d.pieces[0], a0 = Model.angleDeg(f.d, Model.angle(f.d, f.g)), l0 = Solve.length(f.d, k);
    const r = Solve.rotate(f.d, 15);
    return r === true && near(Model.angleDeg(f.d, Model.angle(f.d, f.g)), a0, 1e-9) && near(Solve.length(f.d, k), l0, 1e-9) && !Number.isInteger(Model.point(f.d, f.p).y);
  });
  t('a turn that needs more room makes the drawing smaller to fit', () => {
    const d = Model.create('small'); const a = Model.addPoint(d, 1, 7), b = Model.addPoint(d, 19, 7), c = Model.addPoint(d, 19, 10);
    const before = Model.angleDeg(d, { a, v: b, b: c }), r = Solve.rotate(d, 90), g = Model.size(d);
    return r === true && near(Model.angleDeg(d, { a, v: b, b: c }), before, 1e-9) && d.points.every(p => p.x >= 1 && p.x <= g.w - 1 && p.y >= 1 && p.y <= g.h - 1) && near(Model.point(d, a).x, Model.point(d, b).x) || JSON.stringify(d.points);
  });
  t('flipping twice brings the drawing back', () => { const f = tri(), before = JSON.stringify(f.d.points); Solve.flip(f.d, 'x'); const mid = JSON.stringify(f.d.points); Solve.flip(f.d, 'x'); return mid !== before && JSON.stringify(f.d.points) === before && Solve.flip(f.d, 'y') === true; });
  t('flipping left to right mirrors about the middle', () => { const f = tri(); Solve.flip(f.d, 'x'); const A = Model.point(f.d, f.a), B = Model.point(f.d, f.b); return A.x === 9 && B.x === 3 && A.y === 3; });

  t('a letter stays off a line that passes through its point', () => {
    // B sits on the top line and the transversal; its letter must not land along either one.
    const d = Model.create(); Solve.starter(d, 'transversal');
    const B = d.points.find(p => p.name === 'B'), s = Model.sideOf(d, B);
    return !['e', 'w', 'ne', 'sw'].includes(s) || s;
  });
  t('a letter moves out of the way of an angle mark', () => {
    const d = Model.create(); const v = Model.addPoint(d, 5, 5), a = Model.addPoint(d, 10, 5), b = Model.addPoint(d, 5, 10);
    Model.addPiece(d, 'segment', v, a); Model.addPiece(d, 'segment', v, b); Model.addAngle(d, a, v, b);
    return Model.sideOf(d, Model.point(d, v)) === 'sw' || Model.sideOf(d, Model.point(d, v));
  });
  // ---------- Labels follow their pieces ----------
  const drawn = d => { const s = document.createElementNS('http:' + '//www.w3.org/2000/svg', 'svg'); Render.draw(s, d, {}); return s; };
  const turnOf = (s, str) => { const e = Array.from(s.querySelectorAll('text')).find(x => x.textContent === str), m = e && /rotate\((-?[\d.]+)/.exec(e.getAttribute('transform') || ''); return e ? (m ? +m[1] : 0) : null; };
  t('a label runs parallel to its segment', () => {
    // From (4,4) to (9,9) the segment climbs at 45 degrees; on screen (y down) that is a turn of -45.
    const d = Model.create(); const a = Model.addPoint(d, 4, 4), b = Model.addPoint(d, 9, 9); Model.piece(d, Model.addPiece(d, 'segment', a, b)).label = 'x + 45';
    return near(turnOf(drawn(d), 'x + 45'), -45, 0.01) || turnOf(drawn(d), 'x + 45');
  });
  t('a label is never upside down, whichever way the piece was drawn', () => {
    // (A label beside the middle runs along the piece; one by an arrowhead is level.)
    const d = Model.create(); const a = Model.addPoint(d, 9, 9), b = Model.addPoint(d, 4, 4); Object.assign(Model.piece(d, Model.addPiece(d, 'ray', a, b)), { label: 'r', at: 'mid' });
    const e = Model.create(); const p = Model.addPoint(e, 4, 9), q = Model.addPoint(e, 9, 4); Object.assign(Model.piece(e, Model.addPiece(e, 'line', p, q)), { label: 's', at: 'mid' });
    return near(turnOf(drawn(d), 'r'), -45, 0.01) && near(turnOf(drawn(e), 's'), 45, 0.01);
  });
  t('a label on a level segment is not turned', () => { const f = tri(); Model.piece(f.d, f.ab).label = 'base'; return turnOf(drawn(f.d), 'base') === 0; });
  t('an arc label is centered on the arc and follows its curve', () => {
    // The arc from (15,10) to (10,15) about (10,10): its middle is at 45 degrees, where the circle runs at -45 on... 135 on the grid, 45 on screen.
    const f = circ(); const q = Model.addPoint(f.d, 10, 15); Model.arc(f.d, Model.addArc(f.d, f.on, q)).label = '90°';
    const s = drawn(f.d), e = Array.from(s.querySelectorAll('text')).find(x => x.textContent === '90°');
    const x = +e.getAttribute('x'), y = +e.getAttribute('y'), cx = 10 * Render.U, cy = (Model.size(f.d).h - 10) * Render.U;
    return near(Math.abs(turnOf(s, '90°')), 45, 0.01) && near(x - cx, cy - y, 0.01) && Math.hypot(x - cx, y - cy) > 5 * Render.U || JSON.stringify([turnOf(s, '90°'), x - cx, cy - y]);
  });
  // ---------- Measured labels follow the drawing ----------
  t('an arc measures the angle at the center between its ends', () => {
    const f = circ(); const q = Model.addPoint(f.d, 10, 15), r = Model.addArc(f.d, f.on, q);
    const short = Model.measured(f.d, r); Model.arc(f.d, r).other = true;
    return short === '90°' && Model.measured(f.d, r) === '270°' || short;
  });
  t('a segment and an angle report their own measures', () => { const f = tri(); const g = Model.addAngle(f.d, f.b, f.a, f.c); return Model.measured(f.d, f.ab) === '6' && Model.measured(f.d, g) === '59°' || Model.measured(f.d, g); });
  t('a measured label is rewritten when a point moves', () => {
    const f = circ(); const q = Model.addPoint(f.d, 10, 15), r = Model.arc(f.d, Model.addArc(f.d, f.on, q));
    r.auto = true; Model.refresh(f.d);
    const before = r.label;
    Model.movePoint(f.d, q, 14, 13); Model.refresh(f.d);       // (14,13) is on the circle too: 3-4-5
    return before === '90°' && r.label === '36.9°' || [before, r.label].join(' ');
  });
  t('a label the teacher typed is left alone', () => { const f = tri(); const k = Model.piece(f.d, f.ab); k.label = '3x − 1'; Model.movePoint(f.d, f.b, 12, 3); Model.refresh(f.d); return k.label === '3x − 1'; });
  t('a measured label still follows after the picture is reopened', () => {
    const f = tri(); const k = Model.piece(f.d, f.ab); k.auto = true; Model.refresh(f.d);
    const back = Model.restore(JSON.parse(JSON.stringify(f.d))), kb = back.pieces[0];
    Model.movePoint(back, back.points[1].id, 12, 3); Model.refresh(back);
    return k.label === '6' && kb.auto === true && kb.label === '9' || kb.label;
  });
  // ---------- A right angle gets its box, however it became one ----------
  t('an angle that becomes a right angle gets the box', () => {
    const f = ang(), g = Model.angle(f.d, f.g);                       // starts at about 53 degrees, with an arc
    const before = [g.right, g.arcs].join();
    Model.movePoint(f.d, f.q, 8, 9); Model.refresh(f.d);              // Q straight above V: a right angle
    return before === 'false,1' && g.right === true && g.arcs === 0 || [before, g.right, g.arcs].join(' ');
  });
  t('Make This Angle 90 gives the box, and a label of 90 degrees keeps it', () => { const f = ang(), g = Model.angle(f.d, f.g); g.auto = true; Solve.setAngle(f.d, f.g, 90, f.q); Model.refresh(f.d); return g.right === true && g.label === '90°'; });
  t('an angle that stops being a right angle goes back to an arc', () => { const f = ang(), g = Model.angle(f.d, f.g); Model.movePoint(f.d, f.q, 8, 9); Model.refresh(f.d); Model.movePoint(f.d, f.q, 11, 9); Model.refresh(f.d); return g.right === false && g.arcs === 1; });
  t('a mark the teacher chose is kept, whatever the angle measures', () => {
    const f = ang(), g = Model.angle(f.d, f.g); Object.assign(g, { set: true, right: false, arcs: 2 });
    Model.movePoint(f.d, f.q, 8, 9); Model.refresh(f.d);
    const kept = g.right === false && g.arcs === 2;
    Object.assign(g, { set: true, right: true, arcs: 0 }); Model.movePoint(f.d, f.q, 11, 9); Model.refresh(f.d);      // a box given on purpose, not drawn to scale
    return kept && g.right === true;
  });
  t('a right triangle drawn from measures shows its box', () => { const d = Model.create(), u = one({ a: 3, b: 4, C: 90 }); Solve.drawTriangle(d, u, ['a', 'b', 'C']); Model.refresh(d); return d.angles[0].right === true && d.angles[0].label === '90°'; });
  // ---------- An angle and a circle from measures ----------
  t('an angle from a measure is exact, labeled, and built from two rays', () => [40, 90, 135, 180, 12.5].every(deg => {
    const d = Model.create(), id = Solve.drawAngle(d, deg), g = Model.angle(d, id);
    return typeof id === 'string' && near(Model.angleDeg(d, g), deg, 1e-9) && g.label === Model.degText(deg) && g.auto === true
      && d.pieces.length === 2 && d.pieces.every(k => k.kind === 'ray' && k.a === g.v) && Model.describe(d, id) === 'Angle ABC';
  }));
  t('a right angle from a measure shows its box', () => { const d = Model.create(); return Model.angle(d, Solve.drawAngle(d, 90)).right === true; });
  t('an angle from a measure fits on every grid, vertex on a grid dot', () => Object.keys(Model.GRIDS).every(g => [10, 90, 170, 180].every(deg => {
    const d = Model.create(g), id = Solve.drawAngle(d, deg), V = typeof id === 'string' && Model.point(d, Model.angle(d, id).v);
    return V && Number.isInteger(V.x) && Number.isInteger(V.y);
  })));
  t('an angle measure must be more than 0 and at most 180', () => !!Solve.drawAngle(Model.create(), 0).error && !!Solve.drawAngle(Model.create(), 181).error && Model.create().points.length === 0);
  t('a circle from a radius labels the radius with the number typed', () => {
    const d = Model.create(), id = Solve.drawCircle(d, { radius: 12.5 });
    return typeof id === 'string' && d.circles.length === 1 && d.pieces.length === 1 && d.pieces[0].label === '12.5' && d.arcs.length === 0 && d.points.length === 2;
  });
  t('a circle from an arc measure draws that arc exactly, and labels it', () => [60, 120, 180, 250, 359].every(deg => {
    const d = Model.create(), id = Solve.drawCircle(d, { radius: 5, arc: deg }), r = d.arcs[0];
    return typeof id === 'string' && r && near(Model.arcSweep(d, r).sweep, deg, 1e-9) && r.label === Model.degText(deg) && r.hl === true && d.pieces.length === 2 && d.points.length === 3;
  }));
  t('a circle needs a radius or an arc, with sensible numbers', () => !!Solve.drawCircle(Model.create(), {}).error && !!Solve.drawCircle(Model.create(), { radius: 0 }).error && !!Solve.drawCircle(Model.create(), { arc: 360 }).error && !!Solve.drawCircle(Model.create(), { arc: 0 }).error);
  t('a circle from measures fits on every grid', () => Object.keys(Model.GRIDS).every(g => { const d = Model.create(g), id = Solve.drawCircle(d, { radius: 3, arc: 200 }), b = Model.bounds(d), s = Model.size(d); return typeof id === 'string' && b.x0 >= 0 && b.y0 >= 0 && b.x1 <= s.w && b.y1 <= s.h; }));
  // ---------- Marks on and off ----------
  // Marks are the red strokes: ticks, parallel arrows, angle arcs and right-angle boxes.
  const redMarks = d => drawn(d).querySelectorAll('[stroke="#94401c"]').length;
  const marked = () => { const f = tri(); Object.assign(Model.piece(f.d, f.ab), { ticks: 2, arrows: 1, label: '3x' }); Model.angle(f.d, Model.addAngle(f.d, f.b, f.a, f.c)).label = '59°'; return f.d; };
  t('a new diagram shows its marks', () => Model.create().marks === true && redMarks(marked()) === 4);
  t('with marks off, no tick, arrow, arc or box is drawn', () => { const d = marked(); d.marks = false; return redMarks(d) === 0 || redMarks(d); });
  t('labels still show with marks off', () => { const d = marked(); d.marks = false; const words = Array.from(drawn(d).querySelectorAll('text')).map(e => e.textContent); return words.includes('3x') && words.includes('59°'); });
  t('turning marks back on shows them all again', () => { const d = marked(); d.marks = false; d.marks = true; return redMarks(d) === 4; });
  t('a right-angle box hides and returns with the marks', () => {
    const d = Model.create(); const v = Model.addPoint(d, 4, 4), a = Model.addPoint(d, 9, 4), b = Model.addPoint(d, 4, 8); Model.addAngle(d, a, v, b);
    const on = redMarks(d); d.marks = false;
    return on === 1 && redMarks(d) === 0;
  });
  t('whether marks show is saved with the picture', () => { const d = marked(); d.marks = false; const back = Model.restore(JSON.parse(JSON.stringify(d))); return back.marks === false && Model.restore(JSON.parse(JSON.stringify(marked()))).marks === true; });
  // ---------- Tangent positions ----------
  // A circle of radius 3 about (10,10), and Q outside it at (15,10). That is a 3-4-5 right triangle,
  // so the tangent points are exactly (11.8, 12.4) and (11.8, 7.6), each 4 units from Q.
  const tanFig = () => { const d = Model.create(); const c = Model.addPoint(d, 10, 10), on = Model.addPoint(d, 13, 10), q = Model.addPoint(d, 15, 10); return { d, c, on, q, k: Model.addCircle(d, c, on) }; };
  t('a point outside a circle has two tangent points', () => {
    const f = tanFig(), T = Model.tangentPoints(f.d, Model.circle(f.d, f.k), Model.point(f.d, f.q));
    return T.length === 2 && near(T[0].x, 11.8) && near(T[0].y, 12.4) && near(T[1].x, 11.8) && near(T[1].y, 7.6) || JSON.stringify(T);
  });
  t('a point on or inside the circle has none', () => { const f = tanFig(), c = Model.circle(f.d, f.k); return Model.tangentPoints(f.d, c, { x: 13, y: 10 }).length === 0 && Model.tangentPoints(f.d, c, { x: 11, y: 10 }).length === 0; });
  t('a line being drawn from outside snaps to the tangent point', () => {
    const f = tanFig(), S = Model.snap(f.d, { x: 11.6, y: 12.2 }, undefined, f.q);
    return near(S.x, 11.8) && near(S.y, 12.4) || JSON.stringify(S);
  });
  t('the same spot without a line in progress is just a point on the circle', () => { const f = tanFig(), S = Model.snap(f.d, { x: 11.6, y: 12.2 }); return !(near(S.x, 11.8) && near(S.y, 12.4)); });
  t('dragging the end of a piece from outside snaps it tangent, and the tool knows', () => {
    const f = tanFig(), p = Model.addPoint(f.d, 12, 14), k = Model.addPiece(f.d, 'segment', f.q, p);
    const wasTangent = !!Model.tangentTo(f.d, k), S = Model.snap(f.d, { x: 11.7, y: 12.6 }, p);
    Model.movePoint(f.d, p, S.x, S.y);
    return !wasTangent && near(S.x, 11.8) && near(S.y, 12.4) && Model.tangentTo(f.d, k) === Model.circle(f.d, f.k) || JSON.stringify(S);
  });
  t('a point farther along the tangent line keeps a line tangent', () => {
    // From Q through the tangent point and beyond: 6 units from Q along the tangent line.
    const f = tanFig(), p = Model.addPoint(f.d, 9, 15), k = Model.addPiece(f.d, 'line', f.q, p);
    const S = Model.snap(f.d, { x: 10.3, y: 13.7 }, p);                  // 6 units out, the line is at (10.2, 13.6)
    Model.movePoint(f.d, p, S.x, S.y);
    return near(S.x, 10.2) && near(S.y, 13.6) && near(Math.hypot(S.x - 15, S.y - 10), 6) && !!Model.tangentTo(f.d, k) || JSON.stringify(S);
  });
  t('a piece from a point on the circle snaps to the tangent line there', () => {
    // At (13,10) the tangent line is straight up and down.
    const f = tanFig(), p = Model.addPoint(f.d, 14, 14), k = Model.addPiece(f.d, 'ray', f.on, p);
    const S = Model.snap(f.d, { x: 13.2, y: 14.1 }, p);
    Model.movePoint(f.d, p, S.x, S.y);
    return near(S.x, 13) && near(S.y, 14) && !!Model.tangentTo(f.d, k) || JSON.stringify(S);
  });
  t('a segment that stops short of the circle is not called tangent', () => {
    const f = tanFig(), p = Model.addPoint(f.d, 13.4, 11.2), k = Model.addPiece(f.d, 'segment', f.q, p);     // on the tangent line, 2 of the 4 units toward the tangent point
    const asLine = (Model.setKind(f.d, k, 'line'), !!Model.tangentTo(f.d, k));
    Model.setKind(f.d, k, 'segment');
    return asLine && !Model.tangentTo(f.d, k);
  });
  t('a secant and a line that misses are not tangent', () => {
    const f = tanFig(), a = Model.addPoint(f.d, 5, 11), b = Model.addPoint(f.d, 16, 11), c = Model.addPoint(f.d, 5, 15), e = Model.addPoint(f.d, 16, 15);
    return !Model.tangentTo(f.d, Model.addPiece(f.d, 'line', a, b)) && !Model.tangentTo(f.d, Model.addPiece(f.d, 'line', c, e));
  });
  t('a level line one radius above the center is tangent', () => { const f = tanFig(), a = Model.addPoint(f.d, 5, 13), b = Model.addPoint(f.d, 16, 13); return !!Model.tangentTo(f.d, Model.addPiece(f.d, 'line', a, b)); });
  t('an arc end slid near a tangent point takes it exactly', () => {
    const f = tanFig(), p = Model.addPoint(f.d, 10, 13); Model.addArc(f.d, f.on, p); const k = Model.addPiece(f.d, 'segment', f.q, p);
    const S = Model.snap(f.d, { x: 11.9, y: 12.6 }, p);
    Model.movePoint(f.d, p, S.x, S.y);
    return near(S.x, 11.8) && near(S.y, 12.4) && !!Model.tangentTo(f.d, k) || JSON.stringify(S);
  });
  // ---------- An arc's ends stay on its circle ----------
  const arcFig = () => { const f = circ(); const q = Model.addPoint(f.d, 10, 15); return Object.assign(f, { q, r: Model.addArc(f.d, f.on, q) }); };
  t('dragging the end of an arc slides it around the circle', () => {
    const f = arcFig(), S = Model.snap(f.d, { x: 16, y: 17 }, f.q);                 // pulled well outside the circle
    return near(Math.hypot(S.x - 10, S.y - 10), 5, 1e-9) || JSON.stringify(S);
  });
  t('an arc end lands on whole degrees, so the arc measures a whole number', () => {
    const f = arcFig(), S = Model.snap(f.d, { x: 13.3, y: 13.9 }, f.q);
    Model.movePoint(f.d, f.q, S.x, S.y);
    const deg = Model.arcSweep(f.d, Model.arc(f.d, f.r)).sweep;
    return near(deg, Math.round(deg), 1e-9) && Model.measured(f.d, f.r) === Math.round(deg) + '°' || deg;
  });
  t('a point that is not an arc end still snaps to the grid', () => { const f = arcFig(), p = Model.addPoint(f.d, 3, 3), S = Model.snap(f.d, { x: 3.4, y: 2.8 }, p); return S.x === 3 && S.y === 3; });
  t('resizing a circle carries its arc ends along', () => {
    const f = arcFig(); Model.movePoint(f.d, f.on, 13, 10);                           // radius 5 becomes 3
    const Q = Model.point(f.d, f.q);
    return near(Q.x, 10) && near(Q.y, 13) && Model.measured(f.d, f.r) === '90°' || JSON.stringify(Q);
  });
  t('moving a circle carries its arc ends along', () => { const f = arcFig(); Model.movePoint(f.d, f.c, 12, 10); const Q = Model.point(f.d, f.q), r = Model.radius(f.d, Model.circle(f.d, f.k)); return near(Math.hypot(Q.x - 12, Q.y - 10), r) || JSON.stringify(Q); });
  t('a resize that would push an arc end off the grid is refused', () => { const f = arcFig(), before = JSON.stringify(f.d); return Model.movePoint(f.d, f.on, 25, 10) === false && JSON.stringify(f.d) === before; });
  t('the extra large grid is the biggest', () => Model.GRIDS.xlarge.w > Model.GRIDS.large.w && Model.GRIDS.xlarge.h > Model.GRIDS.large.h && Model.setGrid(Model.create(), 'xlarge') === true);
  // ---------- Points that stay on their piece or crossing ----------
  const onLine = (d, p, a, b) => { const P = Model.point(d, p), A = Model.point(d, a), B = Model.point(d, b); return near((P.x - A.x) * (B.y - A.y) - (P.y - A.y) * (B.x - A.x), 0, 1e-7); };
  // A point placed on segment AB at its midpoint, the way a tap near it places one.
  const heldFig = () => { const d = Model.create(); const a = Model.addPoint(d, 2, 2), b = Model.addPoint(d, 8, 4), k = Model.addPiece(d, 'segment', a, b); const S = Model.snap(d, { x: 5.1, y: 3.1 }); return { d, a, b, k, m: Model.addPoint(d, S.x, S.y, S.hold) }; };
  t('a point placed on a piece is held on it', () => { const f = heldFig(), M = Model.point(f.d, f.m); return M.hold && M.hold.on === f.k && near(M.hold.t, 0.5) && M.x === 5 && M.y === 3 || JSON.stringify(M); });
  t('a midpoint stays the midpoint when an endpoint moves', () => { const f = heldFig(); Model.movePoint(f.d, f.b, 10, 8); const M = Model.point(f.d, f.m); return near(M.x, 6) && near(M.y, 5) || JSON.stringify(M); });
  t('a held point dragged a little off its piece slides along it and stays on it', () => {
    const f = heldFig(), S = Model.snap(f.d, { x: 5.6, y: 3.5 }, f.m);                 // under a square off the segment
    Model.movePoint(f.d, f.m, S.x, S.y, S.hold || null);
    return onLine(f.d, f.m, f.a, f.b) && !!Model.point(f.d, f.m).hold || JSON.stringify(Model.point(f.d, f.m));
  });
  t('typing a spot for a held point puts it at the nearest spot on its piece', () => { const f = heldFig(); Model.movePoint(f.d, f.m, 7, 2); return onLine(f.d, f.m, f.a, f.b); });
  t('letting a point go free lets it leave its piece', () => { const f = heldFig(); Model.movePoint(f.d, f.m, 5, 9, null); const M = Model.point(f.d, f.m); return !M.hold && M.x === 5 && M.y === 9; });
  t('deleting the piece lets its held points go, where they are', () => { const f = heldFig(); Model.remove(f.d, f.k); const M = Model.point(f.d, f.m); return !M.hold && M.x === 5 && M.y === 3 && f.d.points.length === 3; });
  t('a move that would push a held point off the grid is refused', () => {
    const d = Model.create('small'); const a = Model.addPoint(d, 2, 7), b = Model.addPoint(d, 10, 7), k = Model.addPiece(d, 'line', a, b);
    const far = Model.addPoint(d, 18, 7, { on: k, t: 2 }), before = JSON.stringify(d);
    return Model.movePoint(d, b, 10, 13) === false && JSON.stringify(d) === before && !!far;
  });
  t('a point placed where two lines cross is held at the crossing', () => {
    const f = cross(), S = Model.snap(f.d, { x: 6.4, y: 5.4 }), x = Model.addPoint(f.d, S.x, S.y, S.hold);
    Model.movePoint(f.d, f.p[1], 12, 9);                                              // tilt the first line
    return !!Model.point(f.d, x).hold.cross && onLine(f.d, x, f.p[0], f.p[1]) && onLine(f.d, x, f.p[2], f.p[3]) || JSON.stringify(Model.point(f.d, x));
  });
  t('a point at a crossing cannot be dragged off it', () => { const f = cross(), S = Model.snap(f.d, { x: 6.4, y: 5.4 }), x = Model.addPoint(f.d, S.x, S.y, S.hold); return Model.movePoint(f.d, x, 8, 8) === false && near(Model.point(f.d, x).x, 6.5); });
  // ---------- Pulling a held point off its line ----------
  const heldOn = () => { const d = Model.create(); const a = Model.addPoint(d, 2, 2), b = Model.addPoint(d, 10, 2); const k = Model.addPiece(d, 'segment', a, b); const H = Model.snap(d, { x: 6, y: 2.1 }), m = Model.addPoint(d, H.x, H.y, H.hold); return { d, k, m }; };
  t('a held point dragged a little off its segment stays on it', () => { const f = heldOn(), S = Model.snap(f.d, { x: 7.2, y: 2.9 }, f.m); return S.hold && S.hold.on === f.k && Math.abs(S.y - 2) < 1e-9 || JSON.stringify(S); });
  t('a held point dragged well away from its segment lets go and lands on the grid', () => { const f = heldOn(), S = Model.snap(f.d, { x: 7.2, y: 4.4 }, f.m); Model.movePoint(f.d, f.m, S.x, S.y, S.hold || null); const p = Model.point(f.d, f.m); return !S.hold && p.x === 7 && p.y === 4 && !p.hold || JSON.stringify([S, p]); });
  t('a point pulled off can be dragged back onto the segment and is held again', () => { const f = heldOn(); let S = Model.snap(f.d, { x: 7.2, y: 4.4 }, f.m); Model.movePoint(f.d, f.m, S.x, S.y, S.hold || null); S = Model.snap(f.d, { x: 5.1, y: 2.1 }, f.m); Model.movePoint(f.d, f.m, S.x, S.y, S.hold || null); const p = Model.point(f.d, f.m); return p.hold && p.hold.on === f.k && p.y === 2 || JSON.stringify(p); });
  t('with snap off, dragging a held point takes it off its segment at once', () => { const f = heldOn(), S = Model.snap(f.d, { x: 7.33, y: 2.4 }, f.m, undefined, true); return !S.hold && S.x === 7.33 && S.y === 2.4 || JSON.stringify(S); });
  t('the arrow keys never pull a held point off: with snap off they slide it smoothly along', () => { const f = heldOn(), S = Model.snap(f.d, { x: 6.1, y: 2 }, f.m, undefined, 'slide'), T = Model.snap(f.d, { x: 6, y: 2.1 }, f.m, undefined, 'slide'); return S.hold && Math.abs(S.x - 6.1) < 1e-9 && T.hold && Math.abs(T.y - 2) < 1e-9 || JSON.stringify([S, T]); });
  t('a point at a crossing lets go only when dragged well away', () => { const f = cross(), H = Model.snap(f.d, { x: 6.4, y: 5.4 }), x = Model.addPoint(f.d, H.x, H.y, H.hold); const near1 = Model.snap(f.d, { x: 7.2, y: 5.9 }, x), far = Model.snap(f.d, { x: 9.1, y: 8.2 }, x); return !!near1.hold && !!near1.hold.cross && !(far.hold && far.hold.cross) && Math.hypot(far.x - 6.5, far.y - 5.5) > 2 || JSON.stringify([near1, far]); });
  t('holds are saved with the picture and refused when they make no sense', () => {
    const f = heldFig(), back = Model.restore(JSON.parse(JSON.stringify(f.d)));
    const bad = JSON.parse(JSON.stringify(f.d)); bad.points[2].hold = { on: 'k999', t: 0.5 };
    const odd = JSON.parse(JSON.stringify(f.d)); odd.points[2].hold = { cross: ['k3', 'k3'] };
    return back.points[2].hold.on === f.k && !Model.restore(bad).points[2].hold && !Model.restore(odd).points[2].hold;
  });
  t('a point is never held on a piece that depends on it (no loops)', () => {
    // P is the midpoint of AB; segment PC hangs from it. Dragging A onto PC must not hold A on PC.
    const d = Model.create(); const a = Model.addPoint(d, 5, 5), b = Model.addPoint(d, 15, 5), ab = Model.addPiece(d, 'segment', a, b);
    const p = Model.addPoint(d, 10, 5, { on: ab, t: 0.5 }), c = Model.addPoint(d, 12, 14), pc = Model.addPiece(d, 'segment', p, c);
    const S = Model.snap(d, { x: 11, y: 9.5 }, a);
    Model.movePoint(d, a, S.x, S.y, S.hold || null);
    const A = Model.point(d, a), P = Model.point(d, p), B = Model.point(d, b);
    return !(S.hold && S.hold.on === pc) && Model.dependsOn(d, p, a) && !A.hold && near(P.x, (A.x + B.x) / 2) && near(P.y, (A.y + B.y) / 2) || JSON.stringify([S, A, P]);
  });
  t('a file with a hold loop opens with the loop dropped and nothing moved', () => {
    const d = Model.create(); const a = Model.addPoint(d, 5, 5), b = Model.addPoint(d, 15, 5), ab = Model.addPiece(d, 'segment', a, b);
    const p = Model.addPoint(d, 10, 5, { on: ab, t: 0.5 }), c = Model.addPoint(d, 12, 14), pc = Model.addPiece(d, 'segment', p, c);
    const o = JSON.parse(JSON.stringify(d)); o.points[0].hold = { on: pc, t: 0.5 };
    const back = Model.restore(o);
    return back && !back.points[0].hold && back.points[0].x === 5 && back.points[0].y === 5 && !!back.points[2].hold;
  });
  t('turning a line that carries a circle keeps the arc ends on the circle', () => {
    // Line MN runs through vertex V; a circle is centered at M with an arc on it.
    const d = Model.create(); const m = Model.addPoint(d, 8, 10), n = Model.addPoint(d, 20, 10), ln = Model.addPiece(d, 'line', m, n);
    const v = Model.addPoint(d, 14, 10, { on: ln, t: 0.5 }), on = Model.addPoint(d, 10, 10, null), top = Model.addPoint(d, 8, 12), w = Model.addPoint(d, 14, 16);
    const c = Model.circle(d, Model.addCircle(d, m, top)), q = Model.addPoint(d, 8, 8); Model.addArc(d, top, q);
    const g = Model.addAngle(d, m, v, w), r = Solve.setAngle(d, g, 60, m), M = Model.point(d, m), Q = Model.point(d, q);
    return r === true && near(Math.hypot(Q.x - M.x, Q.y - M.y), Model.radius(d, c), 1e-7) && near(Model.angleDeg(d, Model.angle(d, g)), 60, 1e-7) && !!on || JSON.stringify([r, Q, M]);
  });
  t('four different angles get 1, 2, 3 and 4 arcs', () => {
    const d = Model.create(), y = Solve.starter(d, 'quadrilateral'), ids = Model.poly(d, y).pts;
    ids.forEach((id, i) => Model.addAngle(d, ids[(i + 3) % 4], id, ids[(i + 1) % 4])); Model.refresh(d);
    const arcs = d.angles.map(g => g.arcs), degs = d.angles.map(g => Model.angleDeg(d, g).toFixed(1));
    return new Set(degs).size === 4 && arcs.slice().sort().join() === '1,2,3,4' && Model.mismatches(d).length === 0 || arcs.join() + ' ' + degs.join();
  });
  t('a small bold picture is wide enough for its scale note', () => {
    const d = Model.create(); const a = Model.addPoint(d, 5, 5), b = Model.addPoint(d, 6, 5); Model.addPiece(d, 'segment', a, b); d.scale = 'not';
    const plain = Export.frame(d), bold = Export.frame(d, true);
    return near(plain.x1 - plain.x0, 8) && near(bold.x1 - bold.x0, 11.5);
  });
  // ---------- The transversal keeps its crossings, whatever is typed ----------
  const tv = () => { const d = Model.create('small'); Solve.starter(d, 'transversal'); const P = n => d.points.find(p => p.name === n).id; return { d, P, g: Model.addAngle(d, P('C'), P('B'), P('G')) }; };
  t('the starting transversal holds B and E at their crossings', () => { const f = tv(); return !!Model.point(f.d, f.P('B')).hold.cross && !!Model.point(f.d, f.P('E')).hold.cross; });
  t('Make This Angle turns the whole transversal about its crossing point', () => {
    const f = tv(), B0 = Object.assign({}, Model.point(f.d, f.P('B'))), r = Solve.setAngle(f.d, f.g, 70, f.P('G')), B = Model.point(f.d, f.P('B'));
    const other = Model.angleDeg(f.d, { a: f.P('F'), v: f.P('E'), b: f.P('B') });
    return r === true && near(B.x, B0.x) && near(B.y, B0.y) && onLine(f.d, f.P('B'), f.P('G'), f.P('H')) && onLine(f.d, f.P('E'), f.P('G'), f.P('H')) && onLine(f.d, f.P('E'), f.P('D'), f.P('F'))
      && near(Model.angleDeg(f.d, Model.angle(f.d, f.g)), 70, 1e-7) && near(other, 70, 1e-7) && Model.mismatches(f.d).length === 0 || JSON.stringify([r, other, Model.mismatches(f.d)]);
  });
  t('turning the parallel line instead keeps the crossings and says the lines are no longer parallel', () => {
    const f = tv(), r = Solve.setAngle(f.d, f.g, 70, f.P('C')), why = Model.mismatches(f.d);
    return r === true && onLine(f.d, f.P('B'), f.P('A'), f.P('C')) && onLine(f.d, f.P('B'), f.P('G'), f.P('H')) && near(Model.angleDeg(f.d, Model.angle(f.d, f.g)), 70, 1e-7)
      && why.length === 1 && /matching arrows but are not parallel/.test(why[0]) && Model.scaleNote(f.d) === 'Not drawn to scale' || JSON.stringify([r, why]);
  });
  t('a held point is not moved off its line by a tool; the tool says why', () => {
    const f = heldFig(), c = Model.addPoint(f.d, 9, 9), g = Model.addAngle(f.d, f.m, f.a, c), before = JSON.stringify(f.d), r = Solve.setAngle(f.d, g, 20, f.m);
    return !!r.error && /Let It Move Freely/.test(r.error) && JSON.stringify(f.d) === before || JSON.stringify(r);
  });
  t('asking for the measure a thing already has changes nothing and is not an error', () => {
    const f = ang(), now = Model.angleDeg(f.d, Model.angle(f.d, f.g)), before = JSON.stringify(f.d), g = tri();
    return Solve.setAngle(f.d, f.g, now, f.q) === true && JSON.stringify(f.d) === before && Solve.setLength(g.d, g.ab, 6, g.b) === true;
  });
  // ---------- Does the drawing match its marks and labels? ----------
  t('a plain drawing has nothing to explain and no scale note', () => { const f = tri(); return Model.mismatches(f.d).length === 0 && Model.scaleNote(f.d) === ''; });
  t('matching ticks on sides of different lengths are called out', () => { const f = tri(); const bc = Model.addPiece(f.d, 'segment', f.b, f.c); Model.piece(f.d, f.ab).ticks = 1; Model.piece(f.d, bc).ticks = 1; const w = Model.mismatches(f.d); return w.length === 1 && /matching tick marks but different lengths/.test(w[0]) || JSON.stringify(w); });
  t('matching ticks on congruent sides are fine', () => { const d = Model.create(); const a = Model.addPoint(d, 3, 3), b = Model.addPoint(d, 9, 3), c = Model.addPoint(d, 6, 8); Model.piece(d, Model.addPiece(d, 'segment', a, c)).ticks = 1; Model.piece(d, Model.addPiece(d, 'segment', b, c)).ticks = 1; return Model.mismatches(d).length === 0; });
  t('an angle labeled with a number that is not its measure is called out', () => { const f = ang(); Model.angle(f.d, f.g).label = '70°'; const w = Model.mismatches(f.d); return w.length === 1 && /is labeled 70° but measures 53.1°/.test(w[0]) || JSON.stringify(w); });
  t('a label that is an expression is never called out', () => { const f = ang(); Model.angle(f.d, f.g).label = '(2x + 10)°'; return Model.mismatches(f.d).length === 0; });
  t('a triangle from measures is in proportion, so it is to scale', () => { const d = Model.create(), u = one({ a: 3, b: 4, c: 5 }); Solve.drawTriangle(d, u, ['a', 'b', 'c']); Model.refresh(d); return Model.mismatches(d).length === 0 || JSON.stringify(Model.mismatches(d)); });
  t('side labels out of proportion are called out', () => { const d = Model.create(), u = one({ a: 3, b: 4, c: 5 }); Solve.drawTriangle(d, u, ['a', 'b', 'c']); d.pieces[0].label = '50'; const w = Model.mismatches(d); return w.length >= 1 && /not drawn in that proportion/.test(w[0]) || JSON.stringify(w); });
  t('a chosen right-angle box on an angle that is not 90 is called out', () => { const f = ang(); Object.assign(Model.angle(f.d, f.g), { set: true, right: true, arcs: 0 }); const w = Model.mismatches(f.d); return w.length === 1 && /right-angle box but measures 53.1/.test(w[0]) || JSON.stringify(w); });
  t('a tangent line that is moved off is called out, until the teacher says it is not meant to be tangent', () => {
    const d = Model.create(); Solve.starter(d, 'tangents'); const D = d.points.find(p => p.name === 'D');
    const before = Model.mismatches(d).length; Model.movePoint(d, D.id, D.x, D.y + 1); Model.refresh(d);
    const w = Model.mismatches(d); for (const k of d.pieces) delete k.tan;
    return before === 0 && w.length === 2 && /was drawn tangent to Circle A and is no longer tangent/.test(w[0]) && Model.mismatches(d).length === 0 || JSON.stringify(w);
  });
  t('the scale note can be forced on, forced to say to scale, or turned off', () => {
    const f = ang(); Model.angle(f.d, f.g).label = '70°';
    const auto = Model.scaleNote(f.d); f.d.scale = 'none'; const none = Model.scaleNote(f.d); f.d.scale = 'yes'; const yes = Model.scaleNote(f.d);
    const g = tri(); g.d.scale = 'not';
    return auto === 'Not drawn to scale' && none === '' && yes === 'Drawn to scale' && Model.scaleNote(g.d) === 'Not drawn to scale';
  });
  t('the note is drawn on the picture, with room under the drawing', () => {
    const f = ang(), plain = Export.frame(f.d); Model.angle(f.d, f.g).label = '70°';
    const noted = Export.frame(f.d), words = Array.from(drawn(f.d).querySelectorAll('text')).map(e => e.textContent);
    return near(plain.y0 - noted.y0, 1.2) && words.includes('Not drawn to scale');
  });
  t('the scale choice is saved with the picture', () => { const f = tri(); f.d.scale = 'none'; const back = Model.restore(JSON.parse(JSON.stringify(f.d))); const odd = JSON.parse(JSON.stringify(f.d)); odd.scale = 'constructor'; return back.scale === 'none' && Model.restore(odd).scale === 'auto'; });
  // ---------- Angle marks tell unequal angles apart ----------
  t('angles of different measures get different numbers of arcs; equal ones match', () => {
    const d = Model.create(), u = one({ A: 40, B: 70, c: 8 }); Solve.drawTriangle(d, u, ['A', 'B']); const [A, B, C] = d.points.map(p => p.id); Model.addAngle(d, A, C, B); Model.refresh(d);
    const arcs = d.angles.map(g => g.arcs);                       // angles A (40), B (70), C (70)
    return arcs[0] !== arcs[1] && arcs[1] === arcs[2] && Model.mismatches(d).length === 0 || arcs.join();
  });
  t('a chosen arc count that matches an automatic one on a different angle is reported', () => {
    const d = Model.create(), y = Solve.starter(d, 'triangle'), [A, B, C] = Model.poly(d, y).pts;
    const g1 = Model.angle(d, Model.addAngle(d, C, A, B)), g2 = Model.angle(d, Model.addAngle(d, A, C, B)); Model.refresh(d);
    const auto = [g1.arcs, g2.arcs].join(), clean = Model.mismatches(d).length;
    Object.assign(g2, { set: true, right: false, arcs: 1 }); Model.refresh(d);
    const w = Model.mismatches(d);
    return auto === '1,2' && clean === 0 && w.length === 1 && /matching arcs but different measures/.test(w[0]) && Model.scaleNote(d) === 'Not drawn to scale' || JSON.stringify([auto, clean, w]);
  });
  t('five different measures get 1 to 5 arcs; a sixth gets none, never a false match', () => {
    const d = Model.create(), V = Model.addPoint(d, 15, 10), A = Model.addPoint(d, 20, 10);
    for (const [x, y] of [[19, 13], [18, 14], [16, 15], [13, 14], [12, 12], [11, 11]]) Model.addAngle(d, A, V, Model.addPoint(d, x, y));
    Model.refresh(d);
    const arcs = d.angles.map(g => g.arcs).join();
    return arcs === '1,2,3,4,5,0' && Model.mismatches(d).length === 0 || arcs;
  });
  t('a chosen 4 or 5 arcs is kept when reopened; more than 5 is not', () => {
    const f = tri(), g = Model.angle(f.d, Model.addAngle(f.d, f.a, f.b, f.c)); Object.assign(g, { set: true, arcs: 5 });
    const back = Model.restore(JSON.parse(JSON.stringify(f.d))), odd = JSON.parse(JSON.stringify(f.d)); odd.angles[0].arcs = 6;
    return back.angles[0].arcs === 5 && Model.restore(odd).angles[0].arcs === 0;
  });
  t('five arcs are drawn, with the label outside the last one', () => {
    const f = tri(), g = Model.angle(f.d, Model.addAngle(f.d, f.a, f.b, f.c)); Object.assign(g, { set: true, arcs: 5, label: 'x°' });
    const svg = drawn(f.d), grp = [...svg.querySelectorAll('g')].find(e => e.querySelectorAll('path').length >= 5 && [...e.querySelectorAll('text')].some(t => t.textContent === 'x°'));
    if (!grp) return 'no angle group with five arcs';
    const B = Model.point(f.d, f.b), t = grp.querySelector('text'), r = Math.hypot(+t.getAttribute('x') - B.x * 20, +t.getAttribute('y') - (Model.size(f.d).h - B.y) * 20);
    return r >= 50 - 1e-6 || r;
  });
  // ---------- Where a line's name goes ----------
  t('a new line names itself at its right-hand end; an upright one at its top', () => {
    const d = Model.create(), A = Model.addPoint(d, 10, 5), B = Model.addPoint(d, 4, 8), C = Model.addPoint(d, 15, 3), D = Model.addPoint(d, 15, 12);
    const k = Model.piece(d, Model.addPiece(d, 'line', A, B)), up = Model.piece(d, Model.addPiece(d, 'line', C, D)), r = Model.piece(d, Model.addPiece(d, 'ray', B, A)), s = Model.piece(d, Model.addPiece(d, 'segment', A, C));
    return k.at === 'end' && Model.labelAt(d, k) === 'a' && Model.labelAt(d, up) === 'b' && Model.labelAt(d, r) === 'b' && Model.labelAt(d, s) === 'mid';
  });
  t('a line saved before Label Position opens with its name in the middle, as it was', () => {
    const f = tri(), k = Model.piece(f.d, Model.addPiece(f.d, 'line', f.a, f.b)); k.label = 't';
    const o = JSON.parse(JSON.stringify(f.d)); delete o.pieces.find(p => p.kind === 'line').at;
    const back = Model.restore(o), kept = Model.restore(JSON.parse(JSON.stringify(f.d)));
    return Model.labelAt(back, back.pieces.find(p => p.kind === 'line')) === 'mid' && kept.pieces.find(p => p.kind === 'line').at === 'end';
  });
  t('a name at the end is level, beside the arrowhead and inside the picture', () => {
    const d = Model.create(), A = Model.addPoint(d, 8, 4), B = Model.addPoint(d, 12, 10), k = Model.piece(d, Model.addPiece(d, 'line', A, B)); k.label = 't';
    const svg = drawn(d), t = [...svg.querySelectorAll('text')].find(e => e.textContent === 't'), W = Model.size(d).w * 20, H = Model.size(d).h * 20;
    const x = +t.getAttribute('x'), y = +t.getAttribute('y'), tip = [...svg.querySelectorAll('polygon')].map(p => p.getAttribute('points').split(' ')[0].split(',').map(Number)).sort((p, q) => p[1] - q[1])[0];
    return !t.getAttribute('transform') && x > 0 && x < W && y > 0 && y < H && Math.hypot(x - tip[0], y - tip[1]) < 40 || JSON.stringify([x, y, tip]);
  });
  // ---------- Shades, and what a deleted side takes with it ----------
  t('a polygon has four shades, and an older yes-or-no shade still opens', () => {
    const d = Model.create(), y = Model.poly(d, Solve.starter(d, 'triangle')); y.shade = 3;
    const back = Model.restore(JSON.parse(JSON.stringify(d))), old = JSON.parse(JSON.stringify(d)); old.polys[0].shade = true; const bad = JSON.parse(JSON.stringify(d)); bad.polys[0].shade = 9;
    return Model.SHADES.length === 5 && back.polys[0].shade === 3 && Model.restore(old).polys[0].shade === 1 && Model.restore(bad).polys[0].shade === 0;
  });
  t('each shade is drawn in its own color, in color and in black and white', () => {
    const fills = bw => [1, 2, 3, 4].map(n => { const d = Model.create(), y = Model.poly(d, Solve.starter(d, 'triangle')); y.shade = n; const s = document.createElementNS('http:' + '//www.w3.org/2000/svg', 'svg'); Render.draw(s, d, { bw }); return s.querySelector('path').getAttribute('fill'); });
    return new Set(fills(false)).size === 4 && new Set(fills(true)).size === 4;
  });
  t('deleting a side deletes the polygon it closed, and keeps the other sides', () => { const d = Model.create(); Solve.starter(d, 'triangle'); Model.remove(d, d.pieces[0].id); return d.polys.length === 0 && d.pieces.length === 2 && d.points.length === 3; });
  // ---------- A file cannot break the tool ----------
  t('names like "constructor" in a file are not mistaken for real choices', () => {
    const f = tri(), make = change => { const o = JSON.parse(JSON.stringify(f.d)); change(o); return Model.restore(o); };
    const side = make(o => { o.points[0].side = 'constructor'; });
    return make(o => { o.grid = 'constructor'; }) === null && make(o => { o.grid = 'toString'; }) === null && make(o => { o.pieces[0].kind = 'constructor'; }) === null
      && make(o => { o.pieces[0].kind = '__proto__'; }) === null && side && side.points[0].side === 'auto' && make(o => { o.points[0].side = 'toString'; }).points[0].side === 'auto';
  });
  t('a restored drawing can always be drawn', () => { const f = tri(), o = JSON.parse(JSON.stringify(f.d)); o.points[0].side = 'constructor'; const d = Model.restore(o); drawn(d); return true; });
  t('two points in the same place are refused', () => { const f = tri(), o = JSON.parse(JSON.stringify(f.d)); o.points[1].x = o.points[0].x; o.points[1].y = o.points[0].y; return Model.restore(o) === null; });
  t('turning never makes the drawing bigger', () => {
    const d = Model.create(); const a = Model.addPoint(d, 1, 1), b = Model.addPoint(d, 3, 1); Model.addPoint(d, 1, 3); const k = Model.addPiece(d, 'segment', a, b);
    const r = Solve.rotate(d, 15), g = Model.size(d);
    return r === true && near(Solve.length(d, Model.piece(d, k)), 2, 1e-9) && d.points.every(p => p.x >= 1 && p.y >= 1 && p.x <= g.w - 1 && p.y <= g.h - 1) || Solve.length(d, Model.piece(d, k));
  });
  // ---------- Start With, and opening a saved picture ----------
  t('every starting figure fits on every grid', () => Object.keys(Model.GRIDS).every(g => ['triangle', 'quadrilateral', 'transversal', 'circle'].every(k => { const d = Model.create(g); return typeof Solve.starter(d, k) === 'string'; })));
  t('the starting triangle and quadrilateral are polygons with ordinary sides', () => {
    const d = Model.create(), y = Solve.starter(d, 'triangle'); const e = Model.create(), z = Solve.starter(e, 'quadrilateral');
    return Model.describe(d, y) === 'Polygon ABC' && d.pieces.length === 3 && Model.describe(e, z) === 'Polygon ABCD' && e.pieces.length === 4;
  });
  t('the starting transversal crosses two parallel lines at their points', () => {
    const d = Model.create(); Solve.starter(d, 'transversal');
    const [top, bottom, tv] = d.pieces, P = n => d.points.find(p => p.name === n), col = (a, b, c) => near((P(b).x - P(a).x) * (P(c).y - P(a).y) - (P(b).y - P(a).y) * (P(c).x - P(a).x), 0);
    return d.pieces.every(k => k.kind === 'line') && top.arrows === 1 && bottom.arrows === 1 && tv.arrows === 0 && Model.crossing(d, top, bottom) === null
      && col('A', 'B', 'C') && col('D', 'E', 'F') && col('G', 'B', 'H') && col('G', 'E', 'H') || JSON.stringify(d.points);
  });
  t('the starting angle is two rays from its vertex, with a mark', () => {
    const d = Model.create(), g = Solve.starter(d, 'angle');
    return Model.describe(d, g) === 'Angle ABC' && d.pieces.length === 2 && d.pieces.every(k => k.kind === 'ray' && Model.point(d, k.a).name === 'B') || Model.describe(d, g);
  });
  t('the starting tangent lines touch the circle at right angles', () => {
    const d = Model.create(); Solve.starter(d, 'tangents');
    const P = n => d.points.find(p => p.name === n), k = d.circles[0], r = Model.radius(d, k), from = n => Math.hypot(P(n).x - P('A').x, P(n).y - P('A').y);
    return near(r, 4) && near(from('B'), 4) && near(from('C'), 4) && near(from('D'), 5) && d.angles.length === 2 && d.angles.every(g => g.right && near(Model.angleDeg(d, g), 90))
      && d.pieces.filter(q => q.kind === 'line').length === 2 && d.pieces.filter(q => q.kind === 'segment').length === 2 || JSON.stringify(d.angles);
  });
  t('a starting regular polygon has equal sides and equal angles', () => [3, 4, 5, 6, 7, 8, 9, 10, 12].every(n => {
    const d = Model.create(); const y = Solve.starter(d, 'regular', n);
    if (typeof y !== 'string' || d.points.length !== n || d.pieces.length !== n) return false;
    const ids = Model.poly(d, y).pts, len = i => Solve.length(d, { a: ids[i], b: ids[(i + 1) % n] }), ang = i => Model.angleDeg(d, { a: ids[(i + n - 1) % n], v: ids[i], b: ids[(i + 1) % n] });
    return ids.every((id, i) => near(len(i), len(0), 1e-9) && near(ang(i), 180 - 360 / n, 1e-7));
  }));
  t('a regular polygon sits on a level side, on every grid', () => Object.keys(Model.GRIDS).every(g => { const d = Model.create(g); Solve.starter(d, 'regular', 5); const low = d.points.slice().sort((a, b) => a.y - b.y); return near(low[0].y, low[1].y); }));
  t('a regular polygon needs 3 to 12 sides', () => !!Solve.starter(Model.create(), 'regular', 2).error && !!Solve.starter(Model.create(), 'regular', 13).error && !!Solve.starter(Model.create(), 'regular').error);
  t('the new starting figures fit on every grid', () => Object.keys(Model.GRIDS).every(g => ['angle', 'tangents', 'regular'].every(k => typeof Solve.starter(Model.create(g), k, 12) === 'string')));
  t('a starting figure is refused when the middle is in use', () => { const d = Model.create(); Solve.starter(d, 'circle'); const before = JSON.stringify(d); return !!Solve.starter(d, 'circle').error && JSON.stringify(d) === before; });
  // A full diagram: every kind of thing, with marks and a label that uses symbols.
  const full = () => {
    const f = circ(); const q = Model.addPoint(f.d, 10, 15);
    Model.arc(f.d, Model.addArc(f.d, f.on, q)).ticks = 2;
    Model.angle(f.d, Model.addAngle(f.d, f.on, f.c, q)).label = '(2x + 10)°';
    Model.addPolygon(f.d, [f.c, f.on, q]);
    Object.assign(f.d.pieces[0], { ticks: 2, arrows: 1, dashed: true, hl: true, label: '3x − 1', flip: true });
    Model.addText(f.d, 20, 4, 'Not drawn to scale');
    Model.point(f.d, q).side = 'nw';
    return f.d;
  };
  t('a diagram read back is the same, piece for piece', () => { const d = full(), back = Model.restore(JSON.parse(JSON.stringify(d))); return JSON.stringify(back) === JSON.stringify(d) || JSON.stringify(back); });
  t('new pieces after reopening get fresh ids', () => { const back = Model.restore(JSON.parse(JSON.stringify(full()))), id = Model.addPoint(back, 2, 2); return new Set(back.points.map(p => p.id)).size === back.points.length && +id.slice(1) > 5; });
  t('a file with anything unexpected in it is refused', () => {
    const bad = change => { const o = JSON.parse(JSON.stringify(full())); change(o); return Model.restore(o) === null; };
    return Model.restore(null) === null && Model.restore({ v: 2, grid: 'medium' }) === null && Model.restore({ v: 1, grid: 'huge' }) === null
      && bad(o => { o.points[0].x = 'left'; }) && bad(o => { o.points[0].x = 500; }) && bad(o => { o.points[0].id = 'p1<b>'; }) && bad(o => { o.points[1].id = o.points[0].id; })
      && bad(o => { o.pieces[0].a = 'p999'; }) && bad(o => { o.pieces[0].kind = 'curve'; }) && bad(o => { o.arcs[0].c = 'c999'; }) && bad(o => { o.polys[0].pts = ['p1']; }) && bad(o => { o.points = 'none'; });
  });
  t('odd values in a file fall back to safe ones', () => {
    const o = JSON.parse(JSON.stringify(full())); o.pieces[0].ticks = 99; o.points[0].side = 'sideways'; o.points[0].name = 'ABCDEFG'; o.texts[0].text = 'x'.repeat(500);
    const d = Model.restore(o);
    return d && d.pieces[0].ticks === 0 && d.points[0].side === 'auto' && d.points[0].name === 'ABC' && d.texts[0].text.length === 80;
  });
  // The smallest PNG file: the signature, a header chunk and the closing chunk.
  const tinyPng = () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130]);
  t('a picture carries its diagram, symbols and all', () => {
    const d = full(), text = JSON.stringify(d), png = Export.embed(tinyPng(), text);
    return Export.extract(png) === text && JSON.stringify(Model.restore(JSON.parse(Export.extract(png)))) === text || Export.extract(png);
  });
  t('the picture is still a valid file: same start, same closing chunk', () => {
    const base = tinyPng(), png = Export.embed(base, '{"v":1}');
    const tail = a => Array.from(a.slice(a.length - 12)).join(), head = a => Array.from(a.slice(0, 33)).join();
    return png.length > base.length && head(png) === head(base) && tail(png) === tail(base);
  });
  t('a picture keeps its alt text, symbols and all, beside its diagram', () => {
    const words = 'Angle ABC, labeled (2x + 10)°. Segment AB ≅ segment CD.';
    const base = tinyPng(), png = Export.embedAlt(Export.embed(base, '{"v":1}'), words);
    const tail = a => Array.from(a.slice(a.length - 12)).join();
    return Export.alt(png) === words && Export.extract(png) === '{"v":1}' && tail(png) === tail(base) && Export.alt(base) === '' || Export.alt(png);
  });
  // ---------- Review round 2: parts of lines, alt text, tilt ----------
  const startWith = kind => { const d = Model.create(); Solve.starter(d, kind); return d; };
  const named = (d, n) => d.points.find(p => p.name === n).id;
  const lineOf = (d, a, b) => d.pieces.find(k => k.kind === 'line' && [k.a, k.b].includes(named(d, a)) && [k.a, k.b].includes(named(d, b))).id;
  t('the transversal is cut into parts at its crossing points', () => {
    const d = startWith('transversal'), parts = Model.partsOf(d, lineOf(d, 'G', 'H')).map(p => p.map(q => q.name).join('')).join(' ');
    const top = Model.partsOf(d, lineOf(d, 'A', 'C')).map(p => p.map(q => q.name).join('')).join(' ');
    return parts === 'GB BE EH' && top === 'AB BC' || parts + ' | ' + top;
  });
  t('a free point that sits on a line counts as on it; a segment has no parts', () => {
    const d = Model.create(), a = Model.addPoint(d, 4, 4), b = Model.addPoint(d, 12, 4), k = Model.addPiece(d, 'line', a, b); Model.addPoint(d, 16, 4); Model.addPoint(d, 8, 9);
    const s = Model.addPiece(d, 'segment', a, b);
    return Model.pointsOn(d, k).map(q => q.name).join('') === 'ABC' && Model.partsOf(d, s).length === 0 && Model.pointsOn(d, s).map(q => q.name).join('') === 'AB' || Model.pointsOn(d, k).map(q => q.name).join('');
  });
  t('alt text says where the lines cross, and gives no measures', () => {
    const txt = Model.altText(startWith('transversal'));
    return /Line AC and line GH cross at point B\./.test(txt) && /Line DF and line GH cross at point E\./.test(txt) && !/\d/.test(txt) || txt;
  });
  t('alt text leaves out a plain segment drawn over a line, and names it once it is marked', () => {
    const d = startWith('transversal'), before = Model.altText(d), s = Model.addPiece(d, 'segment', named(d, 'B'), named(d, 'E')), same = Model.altText(d) === before;
    Model.piece(d, s).ticks = 2;
    return same && /Segment BE, marked with two tick marks\./.test(Model.altText(d)) || Model.altText(d);
  });
  t('alt text says which points are on the circle, and never says tangent', () => {
    const txt = Model.altText(startWith('tangents'));
    return /A circle with center A\. Points B and C are on the circle\./.test(txt) && !/tangent/i.test(txt) && /Angle ABD, marked with a right-angle box\./.test(txt) || txt;
  });
  t('alt text has no question marks for points without letters, and calls a triangle a triangle', () => {
    const d = startWith('triangle'), lettered = Model.altText(d); d.points.forEach(p => { p.name = ''; }); Model.piece(d, d.pieces[0].id).label = '5';
    const txt = Model.altText(d);
    return lettered === 'A geometry diagram. Points A, B and C. Triangle ABC.' && !/\?/.test(txt) && /A triangle\./.test(txt) && /A segment, labeled 5\./.test(txt) || lettered + ' | ' + txt;
  });
  t('the two arcs between two points have different names, and the longer is a major arc', () => {
    const f = circ(), q = Model.addPoint(f.d, 10, 15), one = Model.describe(f.d, Model.addArc(f.d, f.on, q)), two = Model.describe(f.d, Model.addArc(f.d, f.on, q));
    return one === 'Arc BC' && two === 'Major Arc CB' || one + ' | ' + two;
  });
  t('a major arc or semicircle is named with a third point on it, as G.I.N. teaches', () => {
    const f = circ(), q = Model.addPoint(f.d, 10, 15), minor = Model.addArc(f.d, f.on, q), major = Model.addArc(f.d, f.on, q);
    const bare = Model.describe(f.d, major), short = Model.arcName(f.d, Model.arc(f.d, major)).short;
    const w = Model.addPoint(f.d, 5, 10), named = Model.describe(f.d, major), half = Model.describe(f.d, Model.addArc(f.d, f.on, w));
    return Model.describe(f.d, minor) === 'Arc BC' && bare === 'Major Arc CB' && short === true && named === 'Major Arc CDB' && half === 'Semicircle BCD' && Model.arcName(f.d, Model.arc(f.d, minor)).kind === 'minor' || [bare, named, half].join(' | ');
  });
  t('an arc is only drawn between two points on its circle', () => {
    const f = circ(), q = Model.addPoint(f.d, 10, 15), off = Model.addPoint(f.d, 3, 3);
    return Model.arcBetween(f.d, f.k, f.c, q) === null && Model.arcBetween(f.d, f.k, off, q) === null && Model.arcBetween(f.d, f.k, f.on, q, true) === null && f.d.arcs.length === 0 && Model.arcBetween(f.d, f.k, f.on, q).made === true;
  });
  t('a tilt can be typed with a minus sign or the word degrees; a length cannot be negative', () =>
    Solve.tilt('-30') === -30 && Solve.tilt('−30') === -30 && Solve.tilt('45 degrees') === 45 && Solve.tilt('12.5°') === 12.5 && isNaN(Solve.tilt('abc')) && isNaN(Solve.tilt('-')) && isNaN(Solve.number('-30')));
  t('alt text gives the order of the points along each line that has a point on it', () => {
    const txt = Model.altText(startWith('transversal'));
    return /On line GH, the points in order are G, B, E and H\./.test(txt) && /On line AC, the points in order are A, B and C\./.test(txt) && /On line DF, the points in order are D, E and F\./.test(txt) || txt;
  });
  t('alt text does not say that pieces along one line cross each other', () => {
    const d = startWith('transversal'), s = Model.addPiece(d, 'segment', named(d, 'A'), named(d, 'C')); Model.piece(d, s).ticks = 1;
    const txt = Model.altText(d);
    return /Line AC and line GH cross at point B\./.test(txt) && !/segment AC cross|and segment AC/.test(txt) && /Segment AC, marked with one tick mark\./.test(txt) || txt;
  });
  t('the picture frame makes room for a long label, level or tilted', () => {
    const d = Model.create('large'), a = Model.addPoint(d, 18, 14), b = Model.addPoint(d, 22, 14); Model.addPiece(d, 'segment', a, b);
    const id = Model.addText(d, 20, 16, "height = 12 cm, not drawn to scale"), level = Export.frame(d);
    Model.tiltText(d, id, 90); const up = Export.frame(d), U = 20, half = (34 * 15 * 0.72 + 10) / 2 / U - 1.1;
    return level.x1 - level.x0 >= 2 * half && up.y1 >= 16 + half && up.y0 <= 16 - half && up.x1 - up.x0 < level.x1 - level.x0 || JSON.stringify([level, up, half]);
  });
  t('a picture from anywhere else has no diagram', () => Export.extract(tinyPng()) === null && Export.extract(new Uint8Array([1, 2, 3])) === null && Export.extract(new Uint8Array(60)) === null);

  const pass = results.filter(r => r.ok).length;
  window.testSummary = { pass, fail: results.length - pass, failures: results.filter(r => !r.ok) };
  document.getElementById('results').innerHTML =
    `<p><strong>${pass} of ${results.length} passed</strong></p><ul>` +
    results.map(r => `<li style="color:${r.ok ? '#14532d' : '#7f1d1d'}">${r.ok ? '✓' : '✗'} ${r.name}${r.info ? ' — ' + r.info.replace(/</g, '&lt;') : ''}</li>`).join('') + '</ul>';
})();
