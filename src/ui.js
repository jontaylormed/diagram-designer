/* The screen: the drawing tools, the board, the Selected panel and the downloads.
   Every action works by touch, mouse and keyboard: Tab to a point or piece, Enter picks it,
   arrow keys move a selected point or label, Delete removes it. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const snapOn = () => $('snap').checked;
  const svg = $('board'), NS = svg.namespaceURI;
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // A phone starts on the small grid, where the dots are far enough apart to tap; the teacher can still pick a bigger one.
  let doc = Model.create(window.innerWidth < 520 ? 'small' : 'medium'), hist = Model.history();
  let tool = 'select', sel = null, picks = [], drag = null, dragged = false, typing = false;

  // How many points each drawing tool needs, and what to say while they are tapped.
  const TOOLS = {
    select: { hint: ['Tap a piece to change it. Drag a point or a label to move it.'] },
    point: { hint: ['Tap the grid to add a point.'] },
    segment: { need: 2, hint: ['Tap one endpoint, then the other.', 'Now tap the other endpoint.'] },
    ray: { need: 2, hint: ['Tap the endpoint first, then a point the ray goes through.', 'Now tap a point the ray goes through.'] },
    line: { need: 2, hint: ['Tap two points on the line.', 'Now tap another point on the line.'] },
    circle: { need: 2, hint: ['Tap the center, then a point on the circle.', 'Now tap a point on the circle.'] },
    arc: { need: 2, existing: true, hint: ['Tap two points that are on one circle.', 'Now tap the other end of the arc.'] },
    polygon: { hint: ['Tap each corner in order.', 'Tap the next corner.', 'Tap the next corner.', 'Tap the next corner. To finish, tap the first corner again or choose Finish Polygon.'] },
    angle: { need: 3, existing: true, hint: ['Tap a point on one side, then the vertex, then a point on the other side.', 'Now tap the vertex.', 'Now tap a point on the other side.'] },
    text: { hint: ['Tap a segment, angle or arc to label it, or tap open grid for a free label you can drag.'] },
  };
  // A message shows under the board, and also in the Selected card when that is where the teacher is working.
  const say = msg => {
    $('status').textContent = msg;
    const inCard = (document.activeElement && $('sel-card').contains(document.activeElement)) || Date.now() - cardUsed < 600;
    $('sel-note').textContent = inCard ? msg : '';
  };
  let cardUsed = 0;
  for (const type of ['click', 'change', 'keydown']) $('sel-card').addEventListener(type, () => { cardUsed = Date.now(); }, true);

  // ---------- Drawing the screen ----------
  // Tap targets stay about a fingertip wide however small the board is on screen.
  function hitR() {
    const w = svg.getBoundingClientRect().width, scale = w / (Model.size(doc).w * Render.U);
    return scale ? Math.min(42, Math.max(12, 22 / scale)) : 18;
  }
  function redraw(panel = true) {
    const focused = document.activeElement && svg.contains(document.activeElement) ? document.activeElement.getAttribute('data-id') : null;
    const inForm = panel && document.activeElement && $('selected').contains(document.activeElement) ? document.activeElement.id : null;
    Model.refresh(doc);                    // labels that follow the drawing get their current measure
    if (sel && !Model.item(doc, sel)) sel = null;
    picks = picks.filter(id => Model.point(doc, id));
    Render.draw(svg, doc, { grid: true, edit: true, selected: sel, pending: picks, preview: tool === 'polygon', hitR: hitR() });
    if (focused) { const e = svg.querySelector(`[data-id="${focused}"]`); if (e) e.focus({ preventScroll: true }); }
    svg.classList.toggle('adding', tool !== 'select');
    document.querySelectorAll('#tools button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    const h = TOOLS[tool].hint;
    $('hint').textContent = h[Math.min(picks.length, h.length - 1)];
    $('add-center').hidden = tool === 'text' || !!TOOLS[tool].existing;
    $('finish-poly').hidden = !(tool === 'polygon' && picks.length >= 3);
    $('undo').disabled = !hist.canUndo; $('redo').disabled = !hist.canRedo; $('delete').disabled = !sel;
    $('grid').value = doc.grid;
    $('marks').setAttribute('aria-pressed', String(doc.marks !== false));
    $('marks').textContent = doc.marks !== false ? 'Marks Are On' : 'Marks Are Off';
    $('scale').value = Model.SCALES[doc.scale] ? doc.scale : 'auto';
    // What the marks and labels claim that the drawing does not show: the reasons for "Not drawn to scale".
    const why = Model.mismatches(doc);
    $('scale-why').hidden = !why.length;
    const mode = Model.SCALES[doc.scale] ? doc.scale : 'auto';
    $('scale-lead').textContent = mode === 'yes' ? 'The picture will say "Drawn to scale", but these do not match the drawing:'
      : mode === 'none' ? 'The picture will carry no note, but these do not match the drawing:' : 'The picture will say "Not drawn to scale" because:';
    $('scale-how').textContent = mode === 'auto' ? 'Fix these and the note goes away, or keep them and the note stays. Scale Note lets you choose the note yourself.'
      : 'Scale Note is set by hand. Choose Automatic to let the drawing decide.';
    $('scale-list').innerHTML = why.map(w => `<li>${esc(w)}</li>`).join('');
    if (panel) {
      drawPanel();
      // The form was rebuilt: put the keyboard back on the same control, or on the form's title.
      if (inForm !== null) { const e = $(inForm) || $('sel-name'); if (e) e.focus({ preventScroll: true }); }
    }
    drawWords();
  }
  // ---------- Alt Text, and every piece as a list a screen reader can walk ----------
  function words(id) {
    const type = Model.typeOf(doc, id), o = Model.item(doc, id), bits = [Model.describe(doc, id)];
    const count = (n, one, many) => { if (n) bits.push(`${n} ${n === 1 ? one : many}`); };
    if (type === 'point') { if (o.hold) bits.push(Model.holdText(doc, o)); }       // no grid position: the list shows only what the picture shows
    if (type === 'piece') { count(o.ticks, 'tick mark', 'tick marks'); count(o.arrows, 'parallel arrow', 'parallel arrows'); if (o.dashed) bits.push('dashed'); }
    if (type === 'angle') { if (o.right) bits.push('right-angle box'); else count(o.arcs, 'arc', 'arcs'); }
    if (type === 'poly' && o.shade) bits.push(`shaded ${Model.SHADES[o.shade].toLowerCase()}`);
    if (type === 'circle') bits.push(`through point ${(Model.point(doc, o.on) || {}).name || '(no letter)'}`);
    if (type === 'circle' && o.hide) bits.push('only its arcs shown');
    if (type === 'arc') count(o.ticks, 'tick mark', 'tick marks');
    if (o.hl) bits.push('highlighted');
    if (o.label) bits.push(`labeled ${o.label}`);
    if (type === 'text' && o.tilt) bits.push(`tilted ${o.tilt} degrees`);
    return bits.join(', ');
  }
  /* A figure's name in notation, as G.I.N. teaches it: a bar over a segment's letters, an arrow
     over a ray's (endpoint first), a two-headed arrow over a line's, a curve over an arc's, and
     the angle, triangle and circle signs. Screen readers get the name in words instead. */
  function ntMark(kind, n) {
    const W = n * 68, mid = 15, head = 17;
    if (kind === 'arc') return `<svg class="nt-svg" viewBox="0 0 ${W} 30" style="width:${n * 0.68}em" focusable="false"><path d="M4,26 Q${W / 2},-8 ${W - 4},26" stroke="currentColor" stroke-width="6" fill="none" stroke-linecap="round"></path></svg>`;
    const x1 = kind === 'line' ? head - 2 : 2, x2 = kind === 'segment' ? W - 2 : W - head + 2;
    let d = `<path d="M${x1},${mid} L${x2},${mid}" stroke="currentColor" stroke-width="7" stroke-linecap="butt" fill="none"></path>`;
    if (kind !== 'segment') d += `<path d="M${W - head},${mid - 11} L${W},${mid} L${W - head},${mid + 11} Z" fill="currentColor"></path>`;
    if (kind === 'line') d += `<path d="M${head},${mid - 11} L0,${mid} L${head},${mid + 11} Z" fill="currentColor"></path>`;
    return `<svg class="nt-svg" viewBox="0 0 ${W} 30" style="width:${n * 0.68}em" focusable="false">${d}</svg>`;
  }
  function notation(id) {
    const type = Model.typeOf(doc, id), o = Model.item(doc, id), spoken = Model.describe(doc, id);
    const nm = pid => (Model.point(doc, pid) || {}).name || '';
    const both = (seen, heard) => `<span aria-hidden="true">${seen}</span><span class="sr">${esc(heard)}</span>`;
    const over = (kind, letters) => `<span class="nt">${ntMark(kind, letters.length)}<span class="nt-pts">${esc(letters)}</span></span>`;
    // Without a letter on every point there is nothing to write the notation with: the name stays in words.
    const ids = type === 'piece' ? [o.a, o.b] : type === 'angle' ? [o.a, o.v, o.b] : type === 'poly' ? o.pts : type === 'circle' ? [o.c] : type === 'arc' ? Model.arcEnds(doc, o) : [];
    const letters = ids.map(nm);
    if (type === 'point') return o.name ? both(`point <span class="nt-pts">${esc(o.name)}</span>`, `Point ${o.name}`) : '<span class="el-none">(no letter)</span>';
    if (type === 'text') return o.text ? `<span class="nt-pts">${esc(o.text)}</span>` : '<span class="el-none">(empty)</span>';
    if (!letters.every(Boolean)) return '<span class="el-none">(no letters)</span>';
    if (type === 'piece') return both(over(o.kind, letters.join('')), spoken);
    if (type === 'angle') return both(`\u2220<span class="nt-pts">${esc(letters.join(''))}</span>`, spoken);
    if (type === 'poly') return o.pts.length === 3 ? both(`\u25b3<span class="nt-pts">${esc(letters.join(''))}</span>`, `Triangle ${letters.join('')}`) : both(`${o.pts.length === 4 ? 'quadrilateral' : 'polygon'} <span class="nt-pts">${esc(letters.join(''))}</span>`, spoken);
    if (type === 'circle') return both(`\u2299<span class="nt-pts">${esc(letters.join(''))}</span>`, spoken);
    const arc = Model.arcName(doc, o), named = arc.pts.map(nm);
    if (!arc.short) return both(over('arc', named.join('')), spoken);
    // A major arc or semicircle with no lettered point on it has no full name yet: say so rather than show a minor arc's label.
    return both(`<span class="el-none">${arc.kind === 'major' ? 'major arc' : 'semicircle'}</span> <span class="nt-pts">${esc(named.join(''))}</span>`, spoken);
  }
  // What the diagram shows for an element: the kind of figure, then its marks, measure and label.
  function drawnAs(id) {
    const type = Model.typeOf(doc, id), o = Model.item(doc, id);
    const kind = type === 'piece' ? o.kind : type === 'poly' ? (o.pts.length === 3 ? 'triangle' : o.pts.length === 4 ? 'quadrilateral' : 'polygon')
      : type === 'arc' ? ({ major: 'major arc', semicircle: 'semicircle', minor: 'minor arc' })[Model.arcName(doc, o).kind] + (Model.arcName(doc, o).short ? ' (add a point on it to name it with three letters)' : '') : type === 'text' ? 'text label' : type;
    return kind + words(id).slice(Model.describe(doc, id).length);
  }
  // Fit the Alt Text box to its text, so a short description is a short box.
  function fitAlt() {
    const box = $('alt');
    if (!box.offsetParent) return;                    // hidden while its section is closed
    box.style.height = 'auto';
    box.style.height = (box.scrollHeight + 4) + 'px';
  }
  function drawWords() {
    const alt = Model.altText(doc);
    if ($('alt').value !== alt) { $('alt').value = alt; $('alt-note').textContent = ''; }
    fitAlt();
    $('alt-copy').disabled = !alt;
    const ids = [].concat(...['points', 'pieces', 'angles', 'polys', 'circles', 'arcs', 'texts'].map(l => doc[l].map(o => o.id)));
    $('words').innerHTML = ids.length ? ids.map(id => `<li><button type="button" class="word" data-id="${id}"${id === sel ? ' aria-current="true"' : ''}><span class="el-name">${notation(id)}</span><span class="sr">. In the diagram: </span><span class="el-draw">${esc(drawnAs(id))}</span></button></li>`).join('')
      : '<li class="muted">Nothing is drawn yet.</li>';
  }

  // Make a change that Undo can take back. `fn` returns false when nothing changed.
  function change(fn) {
    hist.save(doc);
    const r = fn();
    if (r === false) hist.drop();
    return r;
  }
  function select(id, panel = true) { sel = id; redraw(panel); }
  function setTool(t) { tool = t; picks = []; say(''); redraw(); }

  // ---------- The Selected panel: one short form for the thing that was tapped ----------
  const field = (id, label, inner) => `<label class="field" for="${id}">${label}${inner}</label>`;
  const pick = (id, label, value, options) => field(id, label, `<select id="${id}">${options.map(([v, name]) => `<option value="${v}"${String(v) === String(value) ? ' selected' : ''}>${esc(name)}</option>`).join('')}</select>`);
  const check = (id, label, on) => `<label class="check" for="${id}"><input type="checkbox" id="${id}"${on ? ' checked' : ''}> ${label}</label>`;
  const COUNTS = [[0, 'None'], [1, '1'], [2, '2'], [3, '3']];
  // Where a line's or ray's label goes: beside the middle, or by an arrowhead (named by the point it is past).
  const atPick = o => {
    if (o.kind === 'segment') return '';
    const nm = id => (Model.point(doc, id).name || '').trim(), end = (id, blank) => (nm(id) ? `End Past ${nm(id)}` : blank);
    const opts = o.kind === 'ray' ? [['mid', 'Middle'], ['b', 'At the Arrow End']] : [['mid', 'Middle'], ['a', end(o.a, 'At One End')], ['b', end(o.b, 'At the Other End')]];
    return pick('f-at', 'Label Position', Model.labelAt(doc, o), opts);
  };
  // A label box with the symbols a keyboard doesn't have, one tap each.
  const SYMBOLS = [['°', 'degree sign'], ['−', 'minus sign'], ['√', 'square root sign'], ['π', 'pi'], ['²', 'squared'], ['θ', 'theta'], ['≅', 'is congruent to'], ['∠', 'angle sign']];
  const labelBox = (id, label, value) => field(id, label, `<input type="text" id="${id}" autocomplete="off" autocapitalize="off" spellcheck="false" value="${esc(value)}">`) +
    `<div class="symbols" role="group" aria-label="Symbols to add to the label">${SYMBOLS.map(([ch, name]) => `<button type="button" class="sym" data-for="${id}" data-sym="${ch}" aria-label="${name}">${ch}</button>`).join('')}</div>`;

  // A text box that edits one property; a whole burst of typing is one Undo step.
  function bindText(id, set, after) {
    const box = $(id);
    box.addEventListener('input', () => {
      if (!typing) { hist.save(doc); typing = true; }
      set(box.value);
      if (after) after();
      redraw(false);
    });
    box.addEventListener('blur', () => { typing = false; });
  }
  const bindChange = (id, set) => $(id).addEventListener('change', e => { change(() => set(e.target.type === 'checkbox' ? e.target.checked : e.target.value)); redraw(); const again = $(id); if (again) again.focus(); });

  // Run a tool that reshapes the drawing. It either works (one Undo step) or says why not and changes nothing.
  function reshape(fn, note) {
    const was = JSON.stringify(doc);
    hist.save(doc);
    const r = fn();
    if (r === true || typeof r === 'string') { if (JSON.stringify(doc) === was) hist.drop(); say(''); redraw(); return r; }
    hist.drop();
    (note || say)(r.error);
    return false;
  }
  // 'Make this ... [measure], by moving [point]': the teacher types the measure, the tool moves the point.
  const exactBox = (label, button, example, a, b) => {
    const first = Solve.attached(doc, b) <= Solve.attached(doc, a) ? b : a, second = first === a ? b : a;
    return `<div class="exact">${field('f-exact', label, `<input type="text" id="f-exact" inputmode="decimal" autocomplete="off" placeholder="${example}">`)}` +
      pick('f-move', 'By Moving', first, [first, second].map(id => [id, Model.describe(doc, id)])) + `<button type="button" id="f-set" class="small">${button}</button></div>`;
  };
  function bindExact(run, askFor) {
    const go = () => {
      const v = Solve.number($('f-exact').value);
      if (isNaN(v)) { say(askFor); $('f-exact').focus(); return; }
      reshape(() => run(v, $('f-move').value));
    };
    $('f-set').addEventListener('click', go);
    $('f-exact').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  }

  // A measured label: typing in the box sets it by hand; Use Measured Value makes it follow the drawing.
  const followNote = o => (o.auto ? '<p class="muted note">This label follows the drawing. Type in the box to set it yourself.</p>' : '');
  function bindLabel(o) {
    bindText('f-label', v => { o.label = v; o.auto = false; });
    if ($('f-measure')) $('f-measure').addEventListener('click', () => { change(() => { o.auto = true; }); redraw(); $('f-measure').focus(); });
  }

  const partsOf = o => (o ? Model.partsOf(doc, o.id) : []);
  // Choose the segment between two points on a line, drawing it over the line first if it is not there yet.
  function choosePart(o, m, n) {
    const have = doc.pieces.find(k => k.kind === 'segment' && ((k.a === m.id && k.b === n.id) || (k.a === n.id && k.b === m.id)));
    const id = have ? have.id : change(() => Model.addPiece(doc, 'segment', m.id, n.id));
    if (!id) return false;
    select(id);
    say(have ? '' : `${Model.describe(doc, id)} is drawn over the ${Model.KINDS[o.kind].toLowerCase()}. Mark or label it here.`);
    return true;
  }
  // Choose the arc of a circle from point m counterclockwise to point n, drawing it over the circle first if it is not there yet.
  function chooseArc(ring, m, n) {
    const have = Model.arcBetween(doc, ring.id, m.id, n.id, true);
    const id = have ? have.id : change(() => { const got = Model.arcBetween(doc, ring.id, m.id, n.id); return got ? got.id : false; });
    if (!id) return false;
    cardUsed = Date.now();
    select(id);
    say(have ? '' : `${Model.describe(doc, id)} is drawn over the circle. Mark or label it here, or erase the rest of the circle.`);
    return true;
  }
  // The arcs of a circle between neighboring points on it, each as [from, to] going counterclockwise.
  function arcsOf(ring) {
    const on = Model.pointsOnCircle(doc, ring.id);
    return on.length < 2 ? [] : on.map((q, i) => [q, on[(i + 1) % on.length]]);
  }
  function drawPanel() {
    const box = $('selected'), type = sel && Model.typeOf(doc, sel), o = sel && Model.item(doc, sel);
    typing = false;
    const title = `<p class="lead-sm" id="sel-name" tabindex="-1">${sel ? esc(Model.describe(doc, sel)) : ''}</p>`;
    const del = '<button type="button" id="f-del" class="small">Delete</button>';
    if (type === 'point') {
      box.innerHTML = title + field('f-name', 'Letter', `<input type="text" id="f-name" maxlength="3" autocomplete="off" autocapitalize="characters" spellcheck="false" value="${esc(o.name)}">`) +
        pick('f-side', 'Letter Position', o.side, [['auto', 'Automatic']].concat(Object.keys(Model.SIDES).map(s => [s, Model.SIDES[s].name]))) +
        check('f-dot', 'Show the Dot', o.dot) +
        (o.hold ? `<p class="muted note">It stays ${esc(Model.holdText(doc, o))}, and moves with ${o.hold.on ? 'it' : 'them'}.</p><button type="button" id="f-free" class="small">Let It Move Freely</button>` : '') +
        `<div class="exact"><div class="tri-grid">${field('f-x', 'Squares Across', `<input type="text" id="f-x" inputmode="decimal" autocomplete="off" value="${esc(Solve.lenText(o.x))}">`)}${field('f-y', 'Squares Up', `<input type="text" id="f-y" inputmode="decimal" autocomplete="off" value="${esc(Solve.lenText(o.y))}">`)}</div>
        <button type="button" id="f-place" class="small">Move the Point</button></div>` + del;
      bindText('f-name', v => { o.name = v.trim(); }, () => { $('sel-name').textContent = Model.describe(doc, sel); });
      bindChange('f-side', v => { o.side = v; });
      bindChange('f-dot', v => { o.dot = v; });
      if ($('f-free')) $('f-free').addEventListener('click', () => { change(() => { delete o.hold; }); say('It can be moved anywhere now.'); redraw(); });
      // Placing a point by typing where it goes: the way to move one without dragging.
      $('f-place').addEventListener('click', () => {
        const x = Solve.number($('f-x').value), y = Solve.number($('f-y').value);
        if (isNaN(x) || isNaN(y)) { say('Type two numbers, like 4 and 7.'); return; }
        reshape(() => (Model.movePoint(doc, sel, x, y) ? true : { error: o.hold && o.hold.cross ? 'It stays where its two lines cross. Choose Let It Move Freely first.' : 'It can\u2019t go there: that spot is off the grid, already taken, or where the point is now.' }));
      });
    } else if (type === 'piece') {
      /* A line or ray is one piece, however many points lie on it. The part between two neighboring
         points is a segment of its own: these buttons choose it (drawing it first if need be), so it
         can be labeled, ticked or highlighted by itself. */
      const parts = partsOf(o);
      const partRow = parts.length ? `<p class="field" id="parts-title">Segments on This ${Model.KINDS[o.kind]}</p><div class="field-row parts" role="group" aria-labelledby="parts-title">${parts.map(([m, n], i) => `<button type="button" class="small" data-part="${i}">Segment ${esc(m.name || '?')}${esc(n.name || '?')}</button>`).join('')}</div>` : '';
      box.innerHTML = title + partRow + pick('f-kind', 'Kind', o.kind, Object.keys(Model.KINDS).map(v => [v, Model.KINDS[v]])) +
        pick('f-ticks', 'Tick Marks (Congruent)', o.ticks, COUNTS) + pick('f-arrows', 'Arrow Marks (Parallel)', o.arrows, COUNTS) +
        check('f-dashed', 'Dashed', o.dashed) + check('f-hl', 'Highlight', o.hl) +
        (o.tan && Model.circle(doc, o.tan) ? check('f-tan', `Meant to Be Tangent to ${esc(Model.describe(doc, o.tan))}`, true) : '') +
        labelBox('f-label', 'Label', o.label) + followNote(o) + atPick(o) +
        (o.kind === 'segment' ? `<p class="muted measure">It is ${esc(Solve.lenText(Solve.length(doc, o)))} grid squares long in this drawing.</p>` + exactBox('Make This Side', 'Set the Length', '5', o.a, o.b) : '') +
        `<div class="field-row">${o.kind === 'segment' ? '<button type="button" id="f-measure" class="small">Use Measured Length</button>' : ''}${o.label ? '<button type="button" id="f-flip" class="small">Move Label to the Other Side</button>' : ''}
        ${o.kind === 'ray' ? '<button type="button" id="f-swap" class="small">Start From the Other Point</button>' : ''}${del}</div>`;
      $('f-kind').addEventListener('change', e => { if (change(() => Model.setKind(doc, sel, e.target.value)) === false) say('That one is already drawn.'); redraw(); });
      box.querySelectorAll('[data-part]').forEach(b => b.addEventListener('click', () => {
        const [m, n] = parts[+b.dataset.part];
        cardUsed = Date.now();
        if (choosePart(o, m, n)) $('sel-name').focus();
      }));
      bindChange('f-ticks', v => { o.ticks = +v; });
      bindChange('f-arrows', v => { o.arrows = +v; });
      bindChange('f-dashed', v => { o.dashed = v; });
      if ($('f-tan')) bindChange('f-tan', v => { if (!v) delete o.tan; });
      bindChange('f-hl', v => { o.hl = v; });
      if ($('f-at')) bindChange('f-at', v => { o.at = v; });
      bindLabel(o);
      if (o.kind === 'segment') {
        bindExact((v, mv) => { const old = Solve.lenText(Solve.length(doc, o)), r = Solve.setLength(doc, sel, v, mv); if (r === true && o.label === old) o.label = Solve.lenText(v); return r; }, 'Type a length, like 5.');
      }
      if ($('f-flip')) $('f-flip').addEventListener('click', () => { change(() => { o.flip = !o.flip; }); redraw(); $('f-flip').focus(); });
      if ($('f-swap')) $('f-swap').addEventListener('click', () => { if (change(() => Model.swapEnds(doc, sel)) === false) say('That ray is already drawn.'); redraw(); if ($('f-swap')) $('f-swap').focus(); });
    } else if (type === 'angle') {
      box.innerHTML = title + `<p class="muted measure">It measures ${esc(Model.degText(Model.angleDeg(doc, o)))} in this drawing.</p>` +
        pick('f-mark', 'Mark', !o.set ? 'auto' : o.right ? 'box' : o.arcs, [['auto', 'Automatic (a Box at 90\u00b0)'], [0, 'None'], [1, '1 Arc'], [2, '2 Arcs'], [3, '3 Arcs'], [4, '4 Arcs'], [5, '5 Arcs'], ['box', 'Right-Angle Box (Perpendicular)']]) +
        check('f-hl', 'Highlight', o.hl) + labelBox('f-label', 'Label', o.label) + followNote(o) + exactBox('Make This Angle', 'Set the Angle', '40', o.a, o.b) +
        `<div class="field-row"><button type="button" id="f-measure" class="small">Use Measured Value</button>${del}</div>`;
      // Choosing a mark keeps it, whatever the angle measures; Automatic hands the choice back to the drawing.
      bindChange('f-mark', v => { o.set = v !== 'auto'; if (o.set) { o.right = v === 'box'; o.arcs = v === 'box' ? 0 : +v; } });
      bindChange('f-hl', v => { o.hl = v; });
      bindLabel(o);
      // A label that showed the old measure follows the new one.
      bindExact((v, mv) => { const old = Model.degText(Model.angleDeg(doc, o)), r = Solve.setAngle(doc, sel, v, mv); if (r === true && o.label === old) o.label = Model.degText(v); return r; }, 'Type a measure, like 40.');
    } else if (type === 'poly') {
      box.innerHTML = title + pick('f-shade', 'Shade the Inside', o.shade || 0, Model.SHADES.map((name, i) => [i, name])) + '<p class="muted note">Deleting the polygon keeps its sides.</p>' + del;
      bindChange('f-shade', v => { o.shade = +v; });
    } else if (type === 'circle') {
      const has = doc.pieces.some(k => k.kind === 'segment' && ((k.a === o.c && k.b === o.on) || (k.a === o.on && k.b === o.c)));
      box.innerHTML = title + '<p class="muted note">Drag its center or the point on it to move or resize it. New points snap onto the circle.</p>' +
        (arcsOf(o).length ? `<p class="field" id="arcs-title">Arcs on This Circle</p><div class="field-row parts" role="group" aria-labelledby="arcs-title">${arcsOf(o).map(([m, n], i) => {
          return `<button type="button" class="small" data-arc="${i}">${esc(Model.arcLabelBetween(doc, o.id, m.id, n.id))}</button>`;
        }).join('')}</div><p class="muted note">Choosing the circle again on the board, between two points on it, chooses that arc too.</p>` : '') +
        check('f-hide', 'Show Only Its Arcs', o.hide) + (o.hide ? '<p class="muted note">The dotted circle is a guide. It is not in the picture you download.</p>' : '') +
        `<div class="field-row">${has ? '' : '<button type="button" id="f-radius" class="small">Draw the Radius</button>'}${del}</div>`;
      box.querySelectorAll('[data-arc]').forEach(b => b.addEventListener('click', () => {
        const [m, n] = arcsOf(o)[+b.dataset.arc];
        if (chooseArc(o, m, n)) $('sel-name').focus();
      }));
      $('f-hide').addEventListener('change', e => { change(() => { if (e.target.checked) o.hide = true; else delete o.hide; }); redraw(); $('f-hide').focus(); });
      if ($('f-radius')) $('f-radius').addEventListener('click', () => { change(() => Model.addPiece(doc, 'segment', o.c, o.on)); redraw(); });
    } else if (type === 'arc') {
      box.innerHTML = title + `<p class="muted measure">It measures ${esc(Model.measured(doc, sel))} in this drawing.</p>` +
        check('f-hl', 'Highlight', o.hl) + pick('f-ticks', 'Tick Marks (Congruent)', o.ticks, COUNTS) + labelBox('f-label', 'Label', o.label) + followNote(o) +
        `<div class="field-row"><button type="button" id="f-measure" class="small">Use Measured Value</button><button type="button" id="f-other" class="small">Use the Other Arc</button><button type="button" id="f-rest" class="small">${Model.circle(doc, o.c).hide ? 'Show the Whole Circle' : 'Erase the Rest of the Circle'}</button>${del}</div>`;
      bindChange('f-hl', v => { o.hl = v; });
      bindChange('f-ticks', v => { o.ticks = +v; });
      bindLabel(o);
      $('f-other').addEventListener('click', () => {
        if (doc.arcs.some(r => r !== o && r.c === o.c && ((r.a === o.a && r.b === o.b) || (r.a === o.b && r.b === o.a)))) { say('The other arc is already drawn. Choose the circle, then choose it under Arcs on This Circle.'); return; }
        change(() => { o.other = !o.other; }); say(''); redraw(); $('f-other').focus();
      });
      $('f-rest').addEventListener('click', () => { const k = Model.circle(doc, o.c); change(() => {
          if (k.hide) { delete k.hide; return; }
          k.hide = true;
          // Plain arcs on the rest of the circle (no highlight, ticks or label) could not be seen before, so they go too.
          doc.arcs.filter(r => r !== o && r.c === o.c && !r.hl && !r.ticks && !r.label).forEach(r => Model.remove(doc, r.id));
        }); say(''); redraw(); $('f-rest').focus(); });
    } else if (type === 'text') {
      box.innerHTML = title + labelBox('f-label', 'Words or Math', o.text) +
        field('f-tilt', 'Tilt (Degrees, Counterclockwise)', `<input type="text" id="f-tilt" inputmode="text" autocomplete="off" value="${esc(String(o.tilt || 0))}">`) +
        `<div class="field-row"><button type="button" id="f-tilt-l" class="small">Tilt Left</button><button type="button" id="f-tilt-r" class="small">Tilt Right</button><button type="button" id="f-tilt-0" class="small">Make It Level</button>${del}</div>` +
        '<p class="muted note">Type any angle: 90 reads up the page, and a negative angle tilts the other way. Tilt Left and Tilt Right turn it 15 degrees at a time.</p>';
      bindText('f-label', v => { o.text = v; }, () => { $('sel-name').textContent = Model.describe(doc, sel); });
      // Typing an angle turns the label as each digit lands; anything that is not a number is left alone.
      bindText('f-tilt', v => {
        const n = v.trim() === '' ? 0 : Solve.tilt(v), half = /^\s*[-\u2212]?\s*\.?\s*$/.test(v);      // half-typed: just a minus or a point so far
        if (!isNaN(n)) Model.tiltText(doc, sel, n);
        cardUsed = Date.now();
        say(isNaN(n) && !half ? 'Type the tilt as a number of degrees, like 30 or -45.' : '');
      });
      const tiltBy = (id, to) => $(id).addEventListener('click', () => { change(() => Model.tiltText(doc, sel, to(o.tilt || 0))); redraw(); $(id).focus(); });
      tiltBy('f-tilt-l', d => d + 15); tiltBy('f-tilt-r', d => d - 15); tiltBy('f-tilt-0', () => 0);
    } else {
      box.innerHTML = '<p class="muted none" id="sel-name" tabindex="-1">Nothing is selected.<br>Choose Select,<br>then tap a point or a piece.</p>';
    }
    if ($('f-del')) $('f-del').addEventListener('click', removeSelected);
  }
  // A symbol button types its symbol where the cursor is.
  $('selected').addEventListener('click', e => {
    const b = e.target.closest('button.sym');
    if (!b) return;
    const box = $(b.dataset.for), at = box.selectionStart == null ? box.value.length : box.selectionStart, end = box.selectionEnd == null ? at : box.selectionEnd;
    box.value = box.value.slice(0, at) + b.dataset.sym + box.value.slice(end);
    box.focus();
    box.setSelectionRange(at + b.dataset.sym.length, at + b.dataset.sym.length);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  function removeSelected() {
    if (!sel) return;
    const what = Model.describe(doc, sel);
    change(() => Model.remove(doc, sel));
    sel = null;
    const onBoard = document.activeElement && (svg.contains(document.activeElement) || document.activeElement === document.body || document.activeElement === $('delete'));
    redraw();
    if (onBoard) svg.focus({ preventScroll: true });
    say(`${what} deleted.`);
  }

  // ---------- Using a tool on the board ----------
  function toModel(e) {
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(svg.getScreenCTM().inverse()), g = Model.size(doc);
    return { x: p.x / Render.U, y: g.h - p.y / Render.U };
  }
  // Say so when a piece has landed exactly tangent to a circle: it is hard to tell by eye.
  function sayTangent(ids) {
    for (const id of ids) {
      const c = Model.tangentTo(doc, id);
      if (c) { Model.piece(doc, id).tan = c.id; say(`${Model.describe(doc, id)} is tangent to ${Model.describe(doc, c.id)}.`); return; }
    }
  }
  // The tapped points are enough: draw the piece.
  function finish() {
    const [a, b, c] = picks;
    const made = change(() => (tool === 'circle' ? Model.addCircle(doc, a, b) : tool === 'arc' ? Model.addArc(doc, a, b)
      : tool === 'angle' ? Model.addAngle(doc, a, b, c) : tool === 'polygon' ? Model.addPolygon(doc, picks) : Model.addPiece(doc, tool, a, b)));
    picks = [];
    const both = tool === 'arc' && doc.arcs.filter(r => (r.a === a && r.b === b) || (r.a === b && r.b === a)).length > 1;
    if (made === false) say(both ? 'Both arcs between those two points are already drawn. Tap one on the board to choose it.' : tool === 'arc' ? 'Those two points are not on one circle. Draw a circle, then add points on it.' : tool === 'angle' ? 'Those points don’t make an angle to mark.' : 'That one is already drawn.');
    else { sel = made; say(''); sayTangent([made]); }
    redraw();
  }
  // A tap on a thing (id), or on the open grid at M.
  function act(id, M) {
    say('');
    if (tool === 'select') { select(id && Model.item(doc, id) ? id : null); return; }
    if (tool === 'text') {
      // Tapping a segment, ray, line, angle or arc labels that piece: its label then stays with it,
      // parallel to a line or centered on an arc. Open grid gets a free label.
      if (id && ['piece', 'angle', 'arc'].includes(Model.typeOf(doc, id))) {
        tool = 'select'; picks = [];
        select(id);
        if ($('f-label')) $('f-label').focus();
        say(`Type the label for ${Model.describe(doc, id)}.`);
        return;
      }
      if (!M) return;
      const made = change(() => Model.addText(doc, M.x, M.y, ''));
      tool = 'select'; picks = [];
      select(made);
      if ($('f-label')) $('f-label').focus();
      return;
    }
    let pid = id && Model.point(doc, id) ? id : null;
    if (!pid && M) {
      // While a segment, ray or line is being drawn, its second point can snap to where the piece would be tangent.
      const from = ['segment', 'ray', 'line'].includes(tool) && picks.length === 1 ? picks[0] : undefined;
      // A new point joins a line, crossing or circle only when the tap is right on it (about 4 pixels), so a tap beside a line stays beside it.
      const tight = Math.max(0.12, Math.min(0.35, 4 * Model.size(doc).w / svg.getBoundingClientRect().width));
      const S = Model.snap(doc, M, undefined, from, !snapOn(), tight), there = Model.pointAt(doc, S.x, S.y);
      if (there) pid = there.id;
      else if (TOOLS[tool].existing) { say('Tap a point that is already drawn.'); return; }
      else { pid = change(() => Model.addPoint(doc, S.x, S.y, S.hold)); if (pid === false) return; }
    }
    if (!pid) return;                       // a tap on a piece while adding does nothing
    if (tool === 'point') { select(pid); return; }
    if (tool === 'polygon') {
      if (pid === picks[0] && picks.length >= 3) { finish(); return; }
      if (!picks.includes(pid)) picks.push(pid);
      sel = null; redraw();
      return;
    }
    if (picks.includes(pid)) { picks = picks.filter(p => p !== pid); redraw(); return; }   // tapping a picked point again lets go of it
    picks.push(pid); sel = null;
    if (picks.length === TOOLS[tool].need) finish(); else redraw();
  }
  let pressSel = null;
  svg.addEventListener('pointerdown', e => {
    const g = e.target.closest('[data-pt], [data-txt]');
    dragged = false;
    pressSel = sel;                 // what was chosen before this press: pressing a point chooses it at once
    if (!g || tool !== 'select') return;
    e.preventDefault();
    const id = g.getAttribute('data-id');
    if (sel !== id) select(id);
    drag = { id, pid: e.pointerId, saved: false, text: g.hasAttribute('data-txt') };
    const held = Model.point(doc, id);
    if (held && held.hold && held.hold.cross) say(`${Model.describe(doc, id)} stays ${Model.holdText(doc, held)}. Drag it more than a square away to pull it off.`);
    try { svg.setPointerCapture(e.pointerId); } catch (err) { /* the board still follows the drag */ }
  });
  svg.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.pid) return;
    const M = toModel(e);
    if (!drag.saved) { hist.save(doc); drag.saved = true; }
    let moved;
    if (drag.text) moved = Model.moveText(doc, drag.id, M.x, M.y);
    else {
      const was = Model.point(doc, drag.id), held = was && was.hold ? Model.holdText(doc, was) : '';
      const S = Model.snap(doc, M, drag.id, undefined, !snapOn()); moved = Model.movePoint(doc, drag.id, S.x, S.y, S.hold || null);
      // Pulled off its line or crossing: say so, and how to put it back.
      if (moved && held && !Model.point(doc, drag.id).hold) say(`${Model.describe(doc, drag.id)} is no longer held ${held}. Drag it back there to join it again.`);
    }
    if (moved) { dragged = true; redraw(false); }
  });
  const endDrag = e => {
    if (!drag || e.pointerId !== drag.pid) return;
    if (drag.saved && !dragged) hist.drop();
    const moved = dragged && !drag.text ? drag.id : null;
    drag = null;
    redraw();
    if (moved) sayTangent(doc.pieces.filter(k => k.a === moved || k.b === moved).map(k => k.id));
  };
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointercancel', endDrag);
  svg.addEventListener('click', e => {
    if (dragged) { dragged = false; return; }
    // The board is redrawn when a point is pressed, so look up what is under the pointer now.
    const at = document.elementFromPoint(e.clientX, e.clientY), g = at && svg.contains(at) ? at.closest('[data-id]') : null;
    let id = g ? g.getAttribute('data-id') : null;
    /* A point's tap area is a fingertip wide, so on a short piece the two end points' areas cover
       the whole piece. When choosing or labeling (not drawing), a tap that is on a piece, arc or
       circle and not right on the dot means that piece. */
    const p = id && Model.point(doc, id), onAngle = id && Model.angle(doc, id);
    if ((p || onAngle) && (tool === 'select' || tool === 'text')) {
      const M = toModel(e), toPx = Render.U * svg.getBoundingClientRect().width / (Model.size(doc).w * Render.U);
      const under = document.elementsFromPoint(e.clientX, e.clientY).map(x => (svg.contains(x) ? x.closest('.piece, .arc, .circ') : null)).find(Boolean);
      const uid = under && under.getAttribute('data-id'), k = uid && Model.piece(doc, uid);
      // How far the tap is, on screen, from the dot and from the line the piece lies on.
      const fromDot = p ? Math.hypot(M.x - p.x, M.y - p.y) * toPx : Infinity;
      const A = k && Model.point(doc, k.a), B = k && Model.point(doc, k.b);
      const fromLine = k ? Math.abs((M.x - A.x) * (B.y - A.y) - (M.y - A.y) * (B.x - A.x)) / Math.hypot(B.x - A.x, B.y - A.y) * toPx : Infinity;
      // Off the dot: a tap right on a line means the line; a tap inside an angle mark means the mark;
      // otherwise whatever piece, arc or circle is there.
      const mark = document.elementsFromPoint(e.clientX, e.clientY).map(x => (svg.contains(x) ? x.closest('.angle') : null)).find(Boolean);
      if (p && fromDot > 9) id = uid && fromLine < 6 ? uid : mark ? mark.getAttribute('data-id') : uid || id;
      // An angle mark's tap area lies over the pieces that form it: a tap right on a line means the line.
      else if (onAngle && uid && fromLine < 6) id = uid;
    }
    /* Tapping the piece that is already chosen steps to the next thing at that spot: on a line or
       ray, the segment between the two points the tap falls between; on a segment drawn over a line
       or ray, back to that line or ray. */
    const was = pressSel; pressSel = null;
    const again = tool === 'select' && id && (id === sel || id === was);
    const cur = again ? Model.piece(doc, id) : null;
    if (cur) {
      const M = toModel(e), A = Model.point(doc, cur.a), B = Model.point(doc, cur.b);
      const t = q => ((q.x - A.x) * (B.x - A.x) + (q.y - A.y) * (B.y - A.y)) / ((B.x - A.x) ** 2 + (B.y - A.y) ** 2);
      if (cur.kind !== 'segment') {
        const part = partsOf(cur).find(([m, n]) => t(M) >= t(m) && t(M) <= t(n));
        if (part) { cardUsed = Date.now(); if (choosePart(cur, part[0], part[1])) return; }
      } else {
        const onIt = k => { const ids = Model.pointsOn(doc, k.id).map(q => q.id); return ids.includes(cur.a) && ids.includes(cur.b); };
        const below = doc.pieces.find(k => k.kind !== 'segment' && onIt(k));
        if (below) { say(''); select(below.id); return; }
      }
    }
    /* The same for a circle: tapping the chosen circle between two points on it chooses the arc
       between them (drawing it first if need be), and tapping the chosen arc goes back to the circle. */
    const ring = again ? Model.circle(doc, id) : null;
    const bow = again ? Model.arc(doc, id) : null;
    if (bow && Model.circle(doc, bow.c)) { say(''); select(bow.c); return; }
    if (ring) {
      const M = toModel(e), C = Model.point(doc, ring.c);
      const turn = q => ((Math.atan2(q.y - C.y, q.x - C.x) * 180 / Math.PI) % 360 + 360) % 360;
      const on = Model.pointsOnCircle(doc, ring.id);
      if (on.length >= 2) {
        // The two points on either side of the tap, going counterclockwise from m to n.
        const tm = turn(M), i = on.findIndex(q => turn(q) > tm), n = on[i < 0 ? 0 : i], m = on[(i < 0 ? on.length : i) - 1] || on[on.length - 1];
        if (chooseArc(ring, m, n)) return;
      }
    }
    act(id, toModel(e));
  });
  svg.addEventListener('keydown', e => {
    const g = e.target.closest('[data-id]');
    if (!g) return;
    const id = g.getAttribute('data-id'), p = Model.point(doc, id), t = Model.text(doc, id);
    const dirs = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] };
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(id, null); }
    else if (dirs[e.key] && (p || t) && tool === 'select') {
      e.preventDefault();
      const step = snapOn() ? 1 : 0.1, dx = dirs[e.key][0] * step, dy = dirs[e.key][1] * step;   // with snapping off, the arrows nudge
      sel = id;
      const ok = change(() => {
        if (!p) return Model.moveText(doc, id, t.x + dx / 2, t.y + dy / 2);
        const fine = snapOn() ? false : 'slide';   // the arrow keys slide a held point along its piece; they never pull it off
        if (!Model.rideOf(doc, id) && !p.hold) return Model.movePoint(doc, id, p.x + dx, p.y + dy);
        const S = Model.snap(doc, { x: p.x + dx, y: p.y + dy }, id, undefined, fine);       // an arc's end steps around its circle; a held point along its piece
        return Model.movePoint(doc, id, S.x, S.y, S.hold || null);
      });
      say(ok !== false ? '' : p && p.hold && p.hold.cross ? `${Model.describe(doc, id)} stays ${Model.holdText(doc, p)}. To move it by itself, choose Let It Move Freely in its form.` : 'It can’t move there. Try another direction.');
      redraw();                 // the form and the list of pieces show the new measures
    }
  });

  // ---------- Buttons and keys ----------
  $('tools').addEventListener('click', e => { const b = e.target.closest('button[data-tool]'); if (b) setTool(b.dataset.tool); });
  // The keyboard way to add a point: it lands on the free grid dot nearest the middle, selected and ready to move.
  $('add-center').addEventListener('click', () => {
    const g = Model.size(doc), cx = Math.round(g.w / 2), cy = Math.round(g.h / 2);
    let best = null;
    for (let x = 1; x < g.w; x++) for (let y = 1; y < g.h; y++) {
      if (Model.pointAt(doc, x, y)) continue;
      const d = (x - cx) ** 2 + (y - cy) ** 2;
      if (!best || d < best.d) best = { x, y, d };
    }
    if (!best) return;
    const id = change(() => Model.addPoint(doc, best.x, best.y));
    tool = 'select'; picks = [];
    select(id);
    const e = svg.querySelector(`[data-id="${id}"]`);
    if (e) e.focus();
    say(`${Model.describe(doc, id)} added and selected. Use the arrow keys to move it, then choose your drawing tool again.`);
  });
  function undo() { const d = hist.undo(doc); if (d) { doc = d; picks = []; say('Undone.'); redraw(); } }
  function redo() { const d = hist.redo(doc); if (d) { doc = d; picks = []; say('Redone.'); redraw(); } }
  $('undo').addEventListener('click', undo);
  $('redo').addEventListener('click', redo);
  $('delete').addEventListener('click', removeSelected);
  $('clear').addEventListener('click', () => {
    if (!Model.bounds(doc)) return;
    hist.save(doc);
    doc = Model.create(doc.grid); sel = null; picks = [];
    say('Cleared. Undo brings it back.');
    redraw();
  });
  // Snap to Grid is a way of working, not part of the drawing: it is not saved with the picture.
  $('snap').addEventListener('change', () => say(snapOn() ? 'Snap is on. Points land on grid dots, and on lines and circles they are close to.' : 'Snap is off. Points land exactly where you put them, and the arrow keys move them in small steps.'));
  $('grid').addEventListener('change', e => {
    if (change(() => Model.setGrid(doc, e.target.value)) === false) say('Some of the drawing would be off that grid. Move it toward the bottom left corner first.');
    else say('');
    redraw();
  });
  document.addEventListener('keydown', e => {
    const inField = /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
    if ((e.ctrlKey || e.metaKey) && !inField && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
    else if ((e.ctrlKey || e.metaKey) && !inField && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && !inField && sel) { e.preventDefault(); removeSelected(); }
    else if (e.key === 'Escape' && picks.length) { picks = []; redraw(); }
  });

  $('finish-poly').addEventListener('click', () => { if (tool === 'polygon' && picks.length >= 3) finish(); });

  // The note about scale: decided by the drawing, or set by the teacher.
  $('scale').addEventListener('change', e => { change(() => { doc.scale = e.target.value; }); redraw(); $('scale').focus(); });

  // ---------- The whole drawing ----------
  // One switch for every mark, so the same diagram can be saved with and without them.
  $('marks').addEventListener('click', () => {
    change(() => { doc.marks = doc.marks === false; });
    say(doc.marks ? 'Tick marks, arrows, arcs and boxes are showing.' : 'Tick marks, arrows, arcs and boxes are hidden. Labels and highlights still show.');
    redraw();
  });
  $('fit').addEventListener('click', () => reshape(() => Solve.fitToFrame(doc)));
  $('turn-left').addEventListener('click', () => reshape(() => Solve.rotate(doc, 15)));
  $('turn-right').addEventListener('click', () => reshape(() => Solve.rotate(doc, -15)));
  $('flip-x').addEventListener('click', () => reshape(() => Solve.flip(doc, 'x')));
  $('flip-y').addEventListener('click', () => reshape(() => Solve.flip(doc, 'y')));

  // ---------- Triangle From Measures ----------
  const TRI = ['a', 'b', 'c', 'A', 'B', 'C'];
  const triNote = msg => { $('tri-note').textContent = msg; };
  function drawTri(t, given) {
    $('tri-choice').innerHTML = '';
    const made = reshape(() => Solve.drawTriangle(doc, t, given), triNote);
    if (made === false) return;
    tool = 'select'; picks = [];
    select(made);
    triNote('Drawn. The measures you gave are labeled.');
  }
  // The form shows the fields for the chosen figure.
  const FIRST = { triangle: 'tri-a', angle: 'ang-deg', circle: 'cir-r' };
  function showMeasures(kind) {
    $('m-kind').value = kind;
    for (const k of Object.keys(FIRST)) $('m-' + k).hidden = k !== kind;
    $('tri-choice').innerHTML = ''; triNote('');
  }
  $('m-kind').addEventListener('change', e => showMeasures(e.target.value));
  // An angle or a circle from what was typed; an empty box is left out, anything else must be a number.
  function drawOther(kind) {
    const read = id => { const raw = $(id).value.trim(); return raw ? Solve.number(raw) : undefined; };
    const vals = kind === 'angle' ? { deg: read('ang-deg') } : { radius: read('cir-r'), arc: read('cir-arc') };
    if (Object.values(vals).some(v => v !== undefined && isNaN(v))) { triNote('Use numbers only, like 7.5 or 40.'); return; }
    if (kind === 'angle' && vals.deg === undefined) { triNote('Type the angle measure first.'); $('ang-deg').focus(); return; }
    const made = reshape(() => (kind === 'angle' ? Solve.drawAngle(doc, vals.deg) : Solve.drawCircle(doc, vals)), triNote);
    if (made === false) return;
    tool = 'select'; picks = [];
    select(made);
    triNote('Drawn. The measures you gave are labeled.');
  }
  $('tri-draw').addEventListener('click', () => {
    if ($('m-kind').value !== 'triangle') { drawOther($('m-kind').value); return; }
    const m = {}, given = [];
    $('tri-choice').innerHTML = '';
    for (const k of TRI) {
      const raw = $('tri-' + k).value.trim();
      if (!raw) continue;
      m[k] = Solve.number(raw);
      if (isNaN(m[k])) { triNote('Use numbers only, like 7.5 or 40.'); $('tri-' + k).focus(); return; }
      given.push(k);
    }
    const r = Solve.triangle(m);
    if (r.error) { triNote(r.error); return; }
    if (r.triangles.length === 1) { drawTri(r.triangles[0], given); return; }
    // Two sides and an angle not between them can fit two triangles: the teacher picks.
    const open = ['A', 'B', 'C'].find(k => !given.includes(k) && Math.abs(r.triangles[0][k] - r.triangles[1][k]) > 1e-6 && given.includes(k.toLowerCase()));
    triNote('Two triangles fit those measures. Choose one.');
    $('tri-choice').innerHTML = r.triangles.map((t, i) => `<button type="button" class="small" data-i="${i}">Draw the One With Angle ${open} = ${esc(Model.degText(t[open]))}</button>`).join('');
    $('tri-choice').querySelectorAll('button').forEach(b => b.addEventListener('click', () => drawTri(r.triangles[+b.dataset.i], given)));
  });

  // Copy Alt Text. If the browser refuses to copy, the text in the box is selected so Ctrl+C still works.
  // Put text on the clipboard. It only works during a click, so it is done before anything slow. True when it worked.
  function copyText(str) {
    const back = document.activeElement, t = document.createElement('textarea');
    t.value = str; t.setAttribute('readonly', ''); t.setAttribute('aria-hidden', 'true');
    t.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;';
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    t.remove();
    if (back && back.focus) back.focus({ preventScroll: true });
    return ok;
  }
  $('alt-copy').addEventListener('click', () => {
    const box = $('alt'), ok = copyText(box.value);
    if (!ok) { box.focus(); box.select(); }
    $('alt-note').textContent = ok ? 'Copied. Paste it into the Alt Text box when you add the picture to your page.' : 'The text is selected. Press Ctrl+C (or Command+C) to copy it.';
  });
  // Choosing a line in the list of pieces selects that piece and opens its form.
  $('words').addEventListener('click', e => {
    const b = e.target.closest('button.word');
    if (!b) return;
    tool = 'select'; picks = [];
    select(b.dataset.id);
    const first = $('selected').querySelector('input, select, button');
    if (first) first.focus();
  });

  // ---------- Start With: a common figure, dropped on the grid as ordinary pieces ----------
  document.querySelectorAll('#starters button[data-start]').forEach(b => b.addEventListener('click', () => {
    const made = reshape(() => Solve.starter(doc, b.dataset.start, +$('start-sides').value));
    if (made === false) return;
    tool = 'select'; picks = [];
    select(made);
  }));

  // ---------- Open a Diagram: read back a picture this designer saved ----------
  $('open').addEventListener('click', () => $('open-file').click());
  $('open-file').addEventListener('change', e => {
    const file = e.target.files[0], note = msg => { $('open-note').textContent = msg; };
    // A picture that cannot be opened: the reasons, then what to do, in the same box as the scale reasons.
    const WHY = {
      none: ['It has no diagram inside it.', 'A screenshot, a photo, or a copy saved from a web page or a document does not keep the diagram.'],
      damaged: ['It came from this designer, but its diagram cannot be read.', 'The file may have been edited or saved again by another program.'],
      big: ['It is too big to be a picture from this designer.'],
      unreadable: ['The file could not be read from this device.'],
    };
    const refuse = why => {
      note('');
      $('open-lead').textContent = `The picture "${file.name.slice(0, 60)}" was not opened because:`;
      $('open-list').innerHTML = WHY[why].map(w => `<li>${esc(w)}</li>`).join('');
      $('open-how').textContent = why === 'unreadable' ? 'Try choosing the file again.' : 'Choose a picture you saved with Download Picture, and keep that file as it is. Your drawing on the board has not changed.';
      $('open-why').hidden = false;
    };
    e.target.value = '';
    $('open-why').hidden = true;
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { refuse('big'); return; }
    Export.open(file).then(r => {
      let d = r.doc || null;
      if (d) { try { Model.refresh(d); Render.draw(document.createElementNS(NS, 'svg'), d, {}); } catch (err) { d = null; } }
      if (!d) { refuse(r.why || 'damaged'); return; }
      hist.save(doc);
      doc = d; sel = null; picks = []; tool = 'select';
      redraw();
      note('Opened. Undo brings back what was here before.');
    }).catch(() => refuse('unreadable'));
  });

  // ---------- Download: one picture, sharp enough for a screen and for paper ----------
  $('dl').addEventListener('click', () => {
    if (!Model.bounds(doc)) { $('dl-note').textContent = 'Draw something first.'; return; }
    // The alt text is copied at the click, and also saved inside the picture.
    const alt = Model.altText(doc), copied = !!alt && copyText(alt);
    Export.png(doc, NS, { scale: 3, bold: $('dl-bold').checked, bw: $('dl-bw').checked, alt }).then(blob => {
      Export.download(blob, 'diagram.png');
      $('dl-note').textContent = 'Saved as diagram.png in your downloads. ' + (copied ? 'Its alt text is copied: paste it into the Alt Text box when you add the picture to your page.'
        : 'For its alt text, choose Copy Alt Text under the board, then paste it into the Alt Text box when you add the picture to your page.');
    }).catch(() => { $('dl-note').textContent = 'The picture could not be made. Try again.'; });
  });

  document.querySelector('details.words').addEventListener('toggle', fitAlt);
  window.addEventListener('resize', () => redraw(false));
  redraw();
})();
