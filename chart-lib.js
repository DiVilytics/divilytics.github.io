// ── CHARTS ─────────────────────────────────────────────────────────────────────
// Tiny hand-rolled SVG chart helpers for the charts page. No dependencies.
// Each returns an SVG string on a fixed viewBox; CSS scales it to the container
// width. Colours come from theme CSS variables so light/dark both work. Values
// interpolated into markup are escaped via _esc (db.js).

const Charts = (() => {
  const W = 440, H = 280;   // logical viewBox; CSS scales it to fit the card

  function wrap(inner, { w = W, h = H } = {}) {
    return `<svg class="chart-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" role="img">${inner}</svg>`;
  }
  function empty() {
    return wrap(`<text x="${W / 2}" y="${H / 2}" class="ch-empty" text-anchor="middle" dominant-baseline="middle">No data</text>`);
  }

  // Interactive shape attributes: a class + data-* the page reads to pin a
  // caption ("name | meta") on tap, with an optional link. Every clickable shape
  // (bar, dot, arc, cell) gets these so all charts behave like the scatter.
  function hit(name, meta, href) {
    let a = ` class="ch-hit" data-name="${_esc(name == null ? '' : name)}" data-meta="${_esc(meta == null ? '' : meta)}"`;
    if (href) a += ` data-href="${_esc(href)}"`;
    return a;
  }
  function titleText(name, meta) { return _esc(meta ? name + ': ' + meta : (name == null ? '' : String(name))); }

  // Sequential indigo ramp for ordinal categories (e.g. table sizes). Deliberately
  // avoids the pace colours (green/yellow/orange/red) so slices are not misread as
  // a pace band.
  const PALETTE = ['#a5b4fc', '#818cf8', '#6366f1', '#4f46e5', '#4338ca', '#3730a3', '#312e81', '#1e1b4b'];

  // Horizontal bars: data = [{ label, value, color?, ... }]. fmt(value, datum).
  function barsH(data, { fmt = v => v, labelW = 96, valW = 88, color = 'var(--accent)' } = {}) {
    if (!data.length) return empty();
    const max = Math.max(...data.map(d => d.value)) || 1;
    const top = 12, rowH = Math.min(36, (H - top - 12) / data.length), bw = W - labelW - valW;
    // Bars cap at W - valW, and the value text sits just after each bar, so the
    // number stays attached to its bar and still always has room to fit.
    const rows = data.map((d, i) => {
      const y = top + i * rowH, len = Math.max(2, (d.value / max) * bw);
      const name = d.name != null ? d.name : d.label;
      const meta = d.meta != null ? d.meta : String(fmt(d.value, d));
      return `
        <text x="${labelW - 8}" y="${y + rowH / 2}" class="ch-lbl" text-anchor="end" dominant-baseline="middle">${_esc(d.label)}</text>
        <rect${hit(name, meta, d.href)} x="${labelW}" y="${y + 5}" width="${len.toFixed(1)}" height="${rowH - 14}" rx="3" fill="${d.color || color}"><title>${titleText(name, meta)}</title></rect>
        <text x="${(labelW + len + 6).toFixed(1)}" y="${y + rowH / 2}" class="ch-val" dominant-baseline="middle">${_esc(fmt(d.value, d))}</text>`;
    }).join('');
    return wrap(rows);
  }

  // Vertical bars: data = [{ value, ... }]. xTick(i) optional axis label every xEvery.
  function barsV(data, { fmt = v => v, color = 'var(--accent)', xTick = null, xEvery = 1 } = {}) {
    if (!data.length) return empty();
    const L = 32, R = 10, T = 14, B = 26;
    const max = Math.max(...data.map(d => d.value)) || 1;
    const bw = (W - L - R) / data.length;
    const sy = v => (H - B) - v / max * (H - T - B);
    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const v = max * i / 4, yy = sy(v);
      grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" class="ch-grid"/><text x="${L - 5}" y="${yy.toFixed(1)}" class="ch-ax" text-anchor="end" dominant-baseline="middle">${Math.round(v)}</text>`;
    }
    const bars = data.map((d, i) => {
      const x = L + i * bw, yv = sy(d.value), h = (H - B) - yv;
      const tick = (xTick && i % xEvery === 0) ? `<text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" class="ch-ax" text-anchor="middle">${_esc(xTick(i))}</text>` : '';
      const name = d.name != null ? d.name : (xTick ? String(xTick(i)) : '');
      const meta = d.meta != null ? d.meta : String(fmt(d.value, d));
      return `<rect${hit(name, meta)} x="${(x + 1.5).toFixed(1)}" y="${yv.toFixed(1)}" width="${Math.max(1, bw - 3).toFixed(1)}" height="${Math.max(0, h).toFixed(1)}" rx="2" fill="${color}"><title>${titleText(name, meta)}</title></rect>${tick}`;
    }).join('');
    return wrap(grid + bars);
  }

  // Scatter: points = [{ x, y, label, color? }].
  function scatter(points, { xLabel = '', xFmt = v => v, yFmt = v => v, yMax = null } = {}) {
    if (!points.length) return empty();
    const L = 42, R = 14, T = 14, B = 40;
    const xs = points.map(p => p.x), ys = points.map(p => p.y);
    // Fit the axes to the data range (with a little padding) rather than forcing
    // a zero origin, so the cloud fills the plot instead of hugging a corner.
    // Clamp the low end at 0 (games/percent are non-negative) and the high end at
    // yMax when given (e.g. 100 for a percentage axis).
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const xpad = (x1 - x0) * 0.08 || 1, ypad = (y1 - y0) * 0.08 || 1;
    const xlo = Math.max(0, x0 - xpad), xhi = x1 + xpad;
    const ylo = Math.max(0, y0 - ypad), yhi = yMax != null ? Math.min(yMax, y1 + ypad) : y1 + ypad;
    const sx = x => L + (x - xlo) / (xhi - xlo) * (W - L - R);
    const sy = y => (H - B) - (y - ylo) / (yhi - ylo) * (H - T - B);
    let grid = '';
    // y gridlines + labels (left)
    for (let i = 0; i <= 4; i++) {
      const v = ylo + (yhi - ylo) * i / 4, yy = sy(v);
      grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" class="ch-grid"/><text x="${L - 6}" y="${yy.toFixed(1)}" class="ch-ax" text-anchor="end" dominant-baseline="middle">${_esc(yFmt(Math.round(v)))}</text>`;
    }
    // x gridlines + ticks (bottom)
    for (let i = 0; i <= 4; i++) {
      const v = xlo + (xhi - xlo) * i / 4, xx = sx(v);
      const anchor = i === 0 ? 'start' : i === 4 ? 'end' : 'middle';
      grid += `<line x1="${xx.toFixed(1)}" y1="${T}" x2="${xx.toFixed(1)}" y2="${(H - B).toFixed(1)}" class="ch-grid"/><text x="${xx.toFixed(1)}" y="${H - B + 14}" class="ch-ax" text-anchor="${anchor}">${_esc(xFmt(Math.round(v)))}</text>`;
    }
    // Dots carry the name + meta (+ optional href) so the page can show a
    // clickable caption on tap (the <title> hover tooltip does not fire on touch).
    const dots = points.map(p =>
      `<circle${hit(p.label, p.meta, p.href)} cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="5" fill="${p.color || 'var(--accent)'}" fill-opacity="0.85"><title>${titleText(p.label, p.meta)}</title></circle>`
    ).join('');
    const axis = xLabel ? `<text x="${((L + W - R) / 2).toFixed(1)}" y="${H - 6}" class="ch-axlbl" text-anchor="middle">${_esc(xLabel)}</text>` : '';
    return wrap(grid + dots + axis);
  }

  // Histogram from raw values; bins evenly across [min, max], then drawn as barsV.
  function histogram(values, { bins = 12, color = 'var(--accent)' } = {}) {
    values = values.filter(v => v != null && !isNaN(v));
    if (!values.length) return empty();
    const min = Math.min(...values), max = Math.max(...values);
    const step = ((max - min) || 1) / bins;
    const counts = new Array(bins).fill(0);
    for (const v of values) { let b = Math.floor((v - min) / step); if (b >= bins) b = bins - 1; if (b < 0) b = 0; counts[b]++; }
    const data = counts.map((c, i) => ({ value: c, lo: Math.round(min + i * step), hi: Math.round(min + (i + 1) * step) }));
    return barsV(data, {
      color,
      fmt: (v, d) => `${d.lo}-${d.hi}: ${v}`,
      xTick: i => Math.round(min + i * step),
      xEvery: Math.max(1, Math.ceil(bins / 6)),
    });
  }

  // Line + soft area over ordered points = [{ label, value }].
  function line(points, { fmt = v => v, color = 'var(--accent)' } = {}) {
    if (!points.length) return empty();
    const L = 34, R = 12, T = 14, B = 28;
    const max = Math.max(...points.map(p => p.value)) || 1;
    const n = points.length;
    const sx = i => L + (n === 1 ? (W - L - R) / 2 : i / (n - 1) * (W - L - R));
    const sy = v => (H - B) - v / max * (H - T - B);
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${sx(i).toFixed(1)} ${sy(p.value).toFixed(1)}`).join(' ');
    const area = `${path} L${sx(n - 1).toFixed(1)} ${H - B} L${sx(0).toFixed(1)} ${H - B} Z`;
    let grid = '';
    for (let i = 0; i <= 4; i++) {
      const v = max * i / 4, yy = sy(v);
      grid += `<line x1="${L}" y1="${yy.toFixed(1)}" x2="${W - R}" y2="${yy.toFixed(1)}" class="ch-grid"/><text x="${L - 5}" y="${yy.toFixed(1)}" class="ch-ax" text-anchor="end" dominant-baseline="middle">${Math.round(v)}</text>`;
    }
    // x ticks: cap the count by available width (~80px per label) so wide labels
    // like YYYY/MM never crowd, picked evenly and including both endpoints. First
    // and last are edge-anchored so they stay inside the viewBox.
    const maxLabels = Math.max(2, Math.min(n, Math.floor((W - L - R) / 80) + 1));
    const idxs = new Set();
    for (let j = 0; j < maxLabels; j++) idxs.add(Math.round(j * (n - 1) / (maxLabels - 1)));
    let ticks = '';
    points.forEach((p, i) => {
      if (!idxs.has(i)) return;
      const anchor = i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
      ticks += `<text x="${sx(i).toFixed(1)}" y="${H - 8}" class="ch-ax" text-anchor="${anchor}">${_esc(p.label)}</text>`;
    });
    const dots = points.map((p, i) => {
      const meta = p.meta != null ? p.meta : String(fmt(p.value));
      return `<circle${hit(p.label, meta, p.href)} cx="${sx(i).toFixed(1)}" cy="${sy(p.value).toFixed(1)}" r="4" fill="${color}"><title>${titleText(p.label, meta)}</title></circle>`;
    }).join('');
    return wrap(`<path d="${area}" fill="${color}" fill-opacity="0.12"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2"/>${grid}${ticks}${dots}`);
  }

  // Donut: segments = [{ label, value, color? }] + side legend.
  function donut(segments) {
    segments = segments.filter(s => s.value > 0);
    if (!segments.length) return empty();
    const total = segments.reduce((a, s) => a + s.value, 0);
    const cx = 132, cy = H / 2, r = 96, rin = 58;
    const p = (rad, ang) => `${(cx + rad * Math.cos(ang)).toFixed(2)} ${(cy + rad * Math.sin(ang)).toFixed(2)}`;
    let a0 = -Math.PI / 2, arcs = '';
    segments.forEach((s, i) => {
      const frac = s.value / total, a1 = a0 + frac * 2 * Math.PI, big = (a1 - a0) > Math.PI ? 1 : 0;
      const col = s.color || PALETTE[i % PALETTE.length];
      const meta = s.meta != null ? s.meta : `${s.value} (${Math.round(frac * 100)}%)`;
      // A stroke in the card colour gives every slice a uniform separator.
      arcs += `<path${hit(s.label, meta, s.href)} d="M${p(r, a0)} A${r} ${r} 0 ${big} 1 ${p(r, a1)} L${p(rin, a1)} A${rin} ${rin} 0 ${big} 0 ${p(rin, a0)} Z" fill="${col}" stroke="var(--s1)" stroke-width="2"><title>${titleText(s.label, meta)}</title></path>`;
      a0 = a1;
    });
    const lx = 264, ly = cy - segments.length * 12;
    const legend = segments.map((s, i) => {
      const col = s.color || PALETTE[i % PALETTE.length], y = ly + i * 26;
      return `<rect x="${lx}" y="${y}" width="13" height="13" rx="2" fill="${col}"/><text x="${lx + 19}" y="${y + 11}" class="ch-lbl">${_esc(s.label)} (${Math.round(s.value / total * 100)}%)</text>`;
    }).join('');
    return wrap(arcs + legend);
  }

  // Heatmap: rowLabels[], colLabels[], cell(ri, ci) -> { value: 0..1 | null, label, title }.
  function heatmap(rowLabels, colLabels, cell) {
    if (!rowLabels.length || !colLabels.length) return empty();
    const L = 46, T = 22, R = 12, B = 8;
    const cw = (W - L - R) / colLabels.length, chh = (H - T - B) / rowLabels.length;
    let out = '';
    colLabels.forEach((c, ci) => { out += `<text x="${(L + ci * cw + cw / 2).toFixed(1)}" y="${T - 7}" class="ch-ax" text-anchor="middle">${_esc(c)}</text>`; });
    rowLabels.forEach((rl, ri) => {
      out += `<text x="${L - 6}" y="${(T + ri * chh + chh / 2).toFixed(1)}" class="ch-ax" text-anchor="end" dominant-baseline="middle">${_esc(rl)}</text>`;
      colLabels.forEach((c, ci) => {
        const d = cell(ri, ci), x = L + ci * cw, y = T + ri * chh;
        if (!d || d.value == null) {
          out += `<rect x="${(x + 1).toFixed(1)}" y="${(y + 1).toFixed(1)}" width="${(cw - 2).toFixed(1)}" height="${(chh - 2).toFixed(1)}" rx="3" class="ch-cell-empty"/>`;
        } else {
          const meta = d.meta != null ? d.meta : (d.title || '');
          out += `<rect${hit(d.name, meta, d.href)} x="${(x + 1).toFixed(1)}" y="${(y + 1).toFixed(1)}" width="${(cw - 2).toFixed(1)}" height="${(chh - 2).toFixed(1)}" rx="3" fill="${heatColor(d.value)}"><title>${titleText(d.name, meta)}</title></rect>` +
                 `<text x="${(x + cw / 2).toFixed(1)}" y="${(y + chh / 2).toFixed(1)}" class="ch-cellval" text-anchor="middle" dominant-baseline="middle">${_esc(d.label || '')}</text>`;
        }
      });
    });
    return wrap(out);
  }
  // value 0..1 -> ramp from a dim blue (cool/low) to the accent purple (hot/high).
  function heatColor(t) {
    t = Math.max(0, Math.min(1, t));
    const lo = [38, 56, 110], hi = [124, 106, 247];
    const c = lo.map((l, i) => Math.round(l + (hi[i] - l) * t));
    return `rgb(${c[0]},${c[1]},${c[2]})`;
  }

  return { barsH, barsV, scatter, histogram, line, donut, heatmap, PALETTE };
})();
