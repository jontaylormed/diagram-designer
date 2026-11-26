/* Turns the diagram into a picture file and hands it to the browser as a download. Nothing is
   sent anywhere and nothing is kept: the picture is made on this device. */
const Export = (() => {
  'use strict';
  const PAD = 1.5;   // grid squares of room around the drawing, so letters and arrowheads fit

  // The part of the grid a picture shows: the drawing plus some room, never past the grid's edge.
  function frame(doc, bold) {
    // Half a label's length and height in grid squares (the same sizes the drawing uses), less the room PAD already leaves.
    const fs = bold ? 20 : 15, half = t => ({ w: Math.max(0, (t.text.length * fs * 0.72 + 10) / 2 / Render.U - PAD + 0.4), h: Math.max(0, fs * 0.85 / Render.U - PAD + 0.4) });
    const b = Model.bounds(doc, true, half), g = Model.size(doc);
    if (!b) return null;
    // A scale note gets a strip of its own under the drawing, and enough width to be read.
    const note = Model.scaleNote(doc), f = { x0: Math.max(0, b.x0 - PAD), y0: Math.max(0, b.y0 - PAD), x1: Math.min(g.w, b.x1 + PAD), y1: Math.min(g.h, b.y1 + PAD) };
    if (note) {
      f.y0 -= 1.2;
      const short = (bold ? 11.5 : 8) - (f.x1 - f.x0);          // bold letters are wider
      if (short > 0) { f.x0 -= short / 2; f.x1 += short / 2; }
    }
    return f;
  }
  // The picture as SVG text. `ns` is the SVG namespace, read from the board.
  function svgText(doc, ns, o = {}) {
    const f = frame(doc, o.bold);
    if (!f) return null;
    const svg = document.createElementNS(ns, 'svg');
    const { W, H } = Render.draw(svg, doc, { frame: f, bw: o.bw, bold: o.bold });
    svg.setAttribute('width', W); svg.setAttribute('height', H);
    return { text: new XMLSerializer().serializeToString(svg), W, H };
  }
  /* A saved picture carries its own editable copy: the diagram, written as plain text in a text
     note inside the PNG file (a 'tEXt' chunk, which picture viewers ignore). Open a Diagram reads
     it back. It also carries its alt text in a second note (an 'iTXt' chunk, see embedAlt).
     A PNG is a signature, then chunks: length, type, data, checksum. */
  const KEY = 'diagram-designer';
  const CRC = (() => { const t = []; for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc(bytes) { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  const SIG = [137, 80, 78, 71, 13, 10, 26, 10];
  const isPng = b => b.length > 20 && SIG.every((v, i) => b[i] === v);
  const u32 = (b, i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  const SEP = String.fromCharCode(0);        // a PNG text note is its key, a zero byte, then the text
  // Add the diagram's text to a PNG, just before its closing chunk. Returns the new file's bytes.
  function embed(png, text) {
    const body = KEY + SEP + encodeURIComponent(text), n = body.length;
    const chunk = new Uint8Array(12 + n);
    chunk.set([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, 116, 69, 88, 116]);      // length, then 'tEXt'
    for (let i = 0; i < n; i++) chunk[8 + i] = body.charCodeAt(i);
    const sum = crc(chunk.subarray(4, 8 + n));
    chunk.set([sum >>> 24, (sum >>> 16) & 255, (sum >>> 8) & 255, sum & 255], 8 + n);
    const end = png.length - 12, out = new Uint8Array(png.length + chunk.length);            // the closing chunk is the last 12 bytes
    out.set(png.subarray(0, end)); out.set(chunk, end); out.set(png.subarray(end), end + chunk.length);
    return out;
  }
  /* The picture's description (its alt text), kept in the file under the standard name
     'Description' as an 'iTXt' chunk, which holds any letter or symbol. Most course sites do not read it;
     it is there so the description stays with the file. */
  function embedAlt(png, text) {
    const head = 'Description', words = new TextEncoder().encode(text), n = head.length + 5 + words.length;
    const chunk = new Uint8Array(12 + n);
    chunk.set([n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255, 105, 84, 88, 116]);     // length, then 'iTXt'
    for (let i = 0; i < head.length; i++) chunk[8 + i] = head.charCodeAt(i);
    chunk.set(words, 8 + head.length + 5);        // after the name: five zero bytes (not compressed, no language, no translated name)
    const sum = crc(chunk.subarray(4, 8 + n));
    chunk.set([sum >>> 24, (sum >>> 16) & 255, (sum >>> 8) & 255, sum & 255], 8 + n);
    const end = png.length - 12, out = new Uint8Array(png.length + chunk.length);
    out.set(png.subarray(0, end)); out.set(chunk, end); out.set(png.subarray(end), end + chunk.length);
    return out;
  }
  // The description saved in a PNG, or '' when it has none.
  function alt(png) {
    if (!isPng(png)) return '';
    for (let i = 8; i + 12 <= png.length;) {
      const n = u32(png, i), type = String.fromCharCode(png[i + 4], png[i + 5], png[i + 6], png[i + 7]);
      if (i + 12 + n > png.length) return '';
      if (type === 'iTXt' && n > 16 && String.fromCharCode(...png.subarray(i + 8, i + 19)) === 'Description') return new TextDecoder().decode(png.subarray(i + 8 + 16, i + 8 + n));
      i += 12 + n;
    }
    return '';
  }
  // The diagram's text from a PNG this designer saved, or null for any other file.
  function extract(png) {
    if (!isPng(png)) return null;
    for (let i = 8; i + 12 <= png.length;) {
      const n = u32(png, i), type = String.fromCharCode(png[i + 4], png[i + 5], png[i + 6], png[i + 7]);
      if (i + 12 + n > png.length) return null;
      if (type === 'tEXt') {
        let s = '';
        for (let k = 0; k < n; k++) s += String.fromCharCode(png[i + 8 + k]);
        if (s.startsWith(KEY + SEP)) { try { return decodeURIComponent(s.slice(KEY.length + 1)); } catch (e) { return null; } }
      }
      i += 12 + n;
    }
    return null;
  }
  /* Read a picture file the teacher chose. Resolves with { doc } (the diagram), or { why }:
     'none' when the file carries no diagram (any picture not saved by this designer), or
     'damaged' when it carries one that cannot be read or does not hold together. */
  function open(file) {
    return file.arrayBuffer().then(buf => {
      const text = extract(new Uint8Array(buf));
      if (!text) return { why: 'none' };
      let doc = null;
      try { doc = Model.restore(JSON.parse(text)); } catch (e) { doc = null; }
      return doc ? { doc } : { why: 'damaged' };
    });
  }

  // The picture as a PNG, `scale` times the drawing size (2 is sharp on a page or in a quiz).
  function png(doc, ns, o = {}) {
    return new Promise((resolve, reject) => {
      const s = svgText(doc, ns, o);
      if (!s) { reject(new Error('empty')); return; }
      const scale = o.scale || 2, img = new Image();
      img.onload = () => {
        const cv = document.createElement('canvas');
        cv.width = Math.round(s.W * scale); cv.height = Math.round(s.H * scale);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(b => {
          if (!b) { reject(new Error('picture')); return; }
          b.arrayBuffer().then(buf => {
            const bytes = embed(new Uint8Array(buf), JSON.stringify(doc));
            resolve(new Blob([o.alt ? embedAlt(bytes, o.alt) : bytes], { type: 'image/png' }));
          }, reject);
        }, 'image/png');
      };
      img.onerror = () => reject(new Error('picture'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s.text);
    });
  }
  function download(blob, name) {
    const a = document.createElement('a'), url = URL.createObjectURL(blob);
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  return { frame, svgText, png, download, embed, embedAlt, alt, extract, open };
})();
