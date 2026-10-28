// Ảnh phong cảnh minh họa (SVG tự vẽ) cho ảnh chụp màn hình trên Chrome Web Store.
// Không dùng ảnh thật của người dùng.
(() => {
  const PALETTES = [
    { sky: ['#ffb38a', '#ff6f91', '#845ec2'], sun: '#ffe6a7', hills: ['#8a4f7d', '#5b3a6e', '#2e1f45'], water: true },
    { sky: ['#9ad8f5', '#cdeefb', '#fff1d0'], sun: '#fffbe6', hills: ['#8cc084', '#55985f', '#2f6440'] },
    { sky: ['#0b1d3a', '#1d3b6b', '#46629e'], sun: '#f6f1d1', hills: ['#1c2f52', '#13223d', '#0a1426'], stars: true },
    { sky: ['#ffd194', '#ffa36c', '#e2725b'], sun: '#fff3c4', hills: ['#b4643a', '#844629', '#52301f'] },
    { sky: ['#cfe6f2', '#e9f4f9', '#fdfdfd'], sun: '#ffffff', hills: ['#b7c7d4', '#869db0', '#56708a'], snow: true },
    { sky: ['#fbd3e9', '#c94b8a', '#4b1d52'], sun: '#ffd1dc', hills: ['#7a3466', '#4f2350', '#2a1531'], water: true },
    { sky: ['#d9f6f8', '#a8e4ec', '#6fcfdc'], sun: '#fffde7', hills: ['#3fb3a5', '#14897c', '#05635a'], water: true },
    { sky: ['#fff1c1', '#fcd581', '#f39c4f'], sun: '#fff8e1', hills: ['#9c7a62', '#715443', '#4a3529'] },
  ];

  function rng(seed) {
    let s = (seed * 2654435761) >>> 0 || 1;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function ridge(r, w, h, top, rough, steps, base) {
    const pts = [`0,${base}`];
    for (let i = 0; i <= steps; i++) {
      const x = (w * i) / steps;
      const y = top + (r() - 0.5) * rough * h + Math.sin(i * 1.7 + r()) * rough * h * 0.25;
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    pts.push(`${w},${base}`);
    return pts.join(' ');
  }

  function photoSvg(seed, w = 800, h = 600) {
    const r = rng(seed + 11);
    const p = PALETTES[seed % PALETTES.length];
    const id = `p${seed}`;
    const base = p.water ? h * 0.7 : h;
    let s = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`
      + `<defs><linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1">`
      + `<stop offset="0" stop-color="${p.sky[0]}"/><stop offset=".55" stop-color="${p.sky[1]}"/><stop offset="1" stop-color="${p.sky[2]}"/></linearGradient>`
      + `<radialGradient id="${id}g"><stop offset="0" stop-color="${p.sun}" stop-opacity=".9"/><stop offset="1" stop-color="${p.sun}" stop-opacity="0"/></radialGradient>`
      + `<linearGradient id="${id}w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${p.sky[2]}"/><stop offset="1" stop-color="${p.hills[2]}"/></linearGradient></defs>`
      + `<rect width="${w}" height="${h}" fill="url(#${id}s)"/>`;
    if (p.stars) {
      for (let i = 0; i < 70; i++) {
        s += `<circle cx="${(r() * w).toFixed(0)}" cy="${(r() * h * 0.55).toFixed(0)}" r="${(r() * 1.6 + 0.4).toFixed(1)}" fill="#fff" opacity="${(r() * 0.7 + 0.3).toFixed(2)}"/>`;
      }
    }
    const sx = w * (0.22 + 0.56 * r());
    const sy = h * (0.2 + 0.18 * r());
    const sr = h * (0.055 + 0.04 * r());
    s += `<circle cx="${sx}" cy="${sy}" r="${sr * 3.4}" fill="url(#${id}g)"/><circle cx="${sx}" cy="${sy}" r="${sr}" fill="${p.sun}"/>`;
    p.hills.forEach((color, i) => {
      const top = h * (0.4 + i * 0.1 + r() * 0.05);
      s += `<polygon points="${ridge(r, w, h, top, 0.2 - i * 0.04, 7 + i * 3, base)}" fill="${color}"/>`;
      if (p.snow && i === 0) s += `<polygon points="${ridge(r, w, h, top - h * 0.02, 0.06, 7, top + h * 0.05)}" fill="#ffffff" opacity=".55"/>`;
    });
    if (p.water) {
      s += `<rect y="${base}" width="${w}" height="${h - base}" fill="url(#${id}w)"/>`;
      s += `<ellipse cx="${sx}" cy="${base + (h - base) * 0.35}" rx="${sr * 1.6}" ry="${(h - base) * 0.32}" fill="${p.sun}" opacity=".35"/>`;
      for (let i = 0; i < 9; i++) {
        const y = base + 8 + r() * (h - base - 16);
        const x = r() * w * 0.8;
        s += `<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(w * (0.08 + r() * 0.2)).toFixed(0)}" height="2" rx="1" fill="#fff" opacity=".35"/>`;
      }
    }
    return `${s}</svg>`;
  }

  window.makePhoto = (seed, w, h) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(photoSvg(seed, w, h))}`;
})();
