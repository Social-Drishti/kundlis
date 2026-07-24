const fs = require('fs');
const path = require('path');
const { getKundli, Observer, rashiNames, nakshatraNames } = require('@ishubhamx/panchangam-js');
const axios = require('axios');

const ZODIAC = ['Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo', 'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'];
const RASHI = { Aries: 'Mesh', Taurus: 'Vrish', Gemini: 'Mithun', Cancer: 'Kark', Leo: 'Simha', Virgo: 'Kanya', Libra: 'Tula', Scorpio: 'Vrischik', Sagittarius: 'Dhanu', Capricorn: 'Makar', Aquarius: 'Kumbh', Pisces: 'Meen' };
const ABBR = { Sun: 'Su', Moon: 'Mo', Mars: 'Ma', Mercury: 'Me', Jupiter: 'Ju', Venus: 'Ve', Saturn: 'Sa', Rahu: 'Ra', Ketu: 'Ke', Ascendant: 'Asc' };
const COLOR = { Sun: '#D2691E', Moon: '#4682B4', Mars: '#B22222', Mercury: '#2E8B57', Jupiter: '#DAA520', Venus: '#C71585', Saturn: '#4169E1', Rahu: '#2F4F4F', Ketu: '#8B4513', Ascendant: '#8B0000' };
const NAK_LORDS = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Ketu', 'Venus', 'Rahu', 'Jupiter', 'Saturn', 'Mercury', 'Ketu', 'Venus', 'Sun', 'Moon', 'Mars'];
const DASHA_LORDS = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury'];
const DASHA_YEARS = [7, 20, 6, 10, 7, 18, 16, 19, 17];
const CENTER = { 1: [150, 75], 2: [75, 25], 3: [25, 75], 4: [75, 150], 5: [25, 225], 6: [75, 275], 7: [150, 225], 8: [225, 275], 9: [275, 225], 10: [225, 150], 11: [275, 75], 12: [225, 25] };
const TRI = [2, 3, 5, 6, 8, 9, 11, 12];
const LINES = [[0, 0, 300, 300], [300, 0, 0, 300], [150, 0, 300, 150], [300, 150, 150, 300], [150, 300, 0, 150], [0, 150, 150, 0], [75, 75, 0, 0], [225, 75, 300, 0], [75, 225, 0, 300], [225, 225, 300, 300]];

function parseCSV(t) {
  const lines = t.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const parseRow = (line) => {
    const fields = []; let cur = ''; let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ; }
      else if (ch === ',' && !inQ) { fields.push(cur.trim()); cur = ''; }
      else cur += ch;
    }
    fields.push(cur.trim());
    return fields;
  };
  const headers = parseRow(lines[0]).map(h => h.replace(/^"|"$/g, ''));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseRow(lines[i]);
    const obj = {};
    headers.forEach((h, j) => { obj[h] = (vals[j] || '').replace(/^"|"$/g, ''); });
    rows.push(obj);
  }
  return rows;
}

async function geocode(placeName, hardcoded) {
  if (!placeName) return null;
  const clean = placeName.toLowerCase().replace(/[^a-z]/g, '');
  let usedHardcoded = false;
  let hardcodedCoords = null;
  for (const [key, coords] of Object.entries(hardcoded || {})) {
    if (clean.includes(key.toLowerCase().replace(/[^a-z]/g, ''))) {
      console.log(`  -> using hardcoded coordinates for ${key}`);
      hardcodedCoords = coords;
      usedHardcoded = true;
      break;
    }
  }
  const queries = [placeName, placeName.replace(/\s*\(.*?\)\s*/g, ', ').replace(/,\s*$/, '').trim()];
  for (const q of queries) {
    if (!q) continue;
    try {
      const r = await axios.get('https://nominatim.openstreetmap.org/search', {
        params: { q, format: 'json', limit: 1 },
        headers: { 'User-Agent': 'KundliGenerator/1.0' },
        timeout: 10000
      });
      if (r.data && r.data.length) {
        const resolved = { lat: parseFloat(r.data[0].lat), lon: parseFloat(r.data[0].lon), displayName: r.data[0].display_name || '' };
        if (usedHardcoded) {
          return { lat: hardcodedCoords.lat, lon: hardcodedCoords.lon, displayName: resolved.displayName };
        }
        return resolved;
      }
    } catch (e) { }
    await new Promise(x => setTimeout(x, 1100));
  }
  if (usedHardcoded) return { lat: hardcodedCoords.lat, lon: hardcodedCoords.lon, displayName: placeName };
  return null;
}

function mapPlanets(p, asc, h) {
  const ex = {};
  const keys = { Sun: 1, Moon: 1, Mercury: 1, Venus: 1, Mars: 1, Jupiter: 1, Saturn: 1, Rahu: 1, Ketu: 1 };
  for (const [k, pd] of Object.entries(p)) {
    if (!keys[k]) continue;
    const ri = pd.rashi, ni = Math.floor(pd.longitude / (13 + 1 / 3));
    const pa = Math.floor((pd.longitude % (13 + 1 / 3)) / (13 + 1 / 3) * 4) + 1;
    let hn = 0;
    if (h) {
      const hh = h.find(x => x.startLongitude < x.endLongitude
        ? (pd.longitude >= x.startLongitude && pd.longitude < x.endLongitude)
        : (pd.longitude >= x.startLongitude || pd.longitude < x.endLongitude));
      if (hh) hn = hh.number;
    }
    ex[k] = { current_sign: ri + 1, signName: rashiNames[ri], nakshatraName: nakshatraNames[ni] || 'Unknown', nakshatraPada: pa, nakshatraLord: NAK_LORDS[ni] || 'Unknown', normDegree: pd.degree, houseNumber: hn, isRetro: pd.isRetrograde };
  }
  if (asc) {
    const ni = Math.floor(asc.longitude / (13 + 1 / 3));
    const pa = Math.floor((asc.longitude % (13 + 1 / 3)) / (13 + 1 / 3) * 4) + 1;
    ex.Ascendant = { current_sign: asc.rashi + 1, signName: rashiNames[asc.rashi], nakshatraName: asc.nakshatra, nakshatraPada: asc.pada || pa, nakshatraLord: NAK_LORDS[ni] || 'Unknown', normDegree: asc.longitude % 30, houseNumber: 1, isRetro: false };
  }
  return ex;
}

function formatDate(date) {
  if (!date) return '';
  const d = new Date(date);
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}

function computeDasha(dashaCycle) {
  if (!dashaCycle || !dashaCycle.fullCycle) return null;
  const now = new Date();
  const mahaDasas = dashaCycle.fullCycle.map((d) => ({
    lord: d.planet,
    start: new Date(d.startTime),
    end: new Date(d.endTime),
    startStr: formatDate(d.startTime),
    endStr: formatDate(d.endTime)
  }));
  const currentMaha = mahaDasas.find(d => now >= d.start && now < d.end);
  if (!currentMaha) return { mahaDasas, currentMaha: null, currentAntar: null };
  const mahaLordIdx = DASHA_LORDS.indexOf(currentMaha.lord);
  const mahaDurationMs = currentMaha.end.getTime() - currentMaha.start.getTime();
  const totalYears = 120;
  let antarStart = currentMaha.start;
  const antarDasas = [];
  for (let j = 0; j < 9; j++) {
    const adIdx = (mahaLordIdx + j) % 9;
    const adLord = DASHA_LORDS[adIdx];
    const adDurationMs = (DASHA_YEARS[adIdx] / totalYears) * mahaDurationMs;
    const adEnd = new Date(antarStart.getTime() + adDurationMs);
    antarDasas.push({ lord: adLord, start: antarStart, end: adEnd, startStr: formatDate(antarStart), endStr: formatDate(adEnd) });
    antarStart = adEnd;
  }
  const currentAntar = antarDasas.find(d => now >= d.start && now < d.end);
  return { mahaDasas, currentMaha, currentAntar, antarDasas };
}

function genKundli(bd) {
  const y = parseInt(bd.year), m = parseInt(bd.month) - 1, d = parseInt(bd.date);
  const h = parseInt(bd.hours || 0), mn = parseInt(bd.minutes || 0), s = parseInt(bd.seconds || 0);
  const tz = parseFloat(bd.timezone || 5.5);
  const dt = new Date(Date.UTC(y, m, d, h, mn, s) - tz * 3600000);
  const ob = new Observer(parseFloat(bd.latitude), parseFloat(bd.longitude), 0);
  const r = getKundli(dt, ob, { houseSystem: 'whole_sign' });
  const ex = mapPlanets(r.planets, r.ascendant, r.houses);
  const asc = ex.Ascendant.current_sign;
  const pl = Object.entries(ex).map(([k, d]) => ({ key: k, houseNumber: d.houseNumber, isRetro: d.isRetro, signName: d.signName, normDegree: d.normDegree, nakshatraName: d.nakshatraName, nakshatraPada: d.nakshatraPada }));
  const dasha = computeDasha(r.dasha);
  return { ascendantSign: asc, planets: pl, dasha };
}

function buildHouses(planets, asc) {
  const hh = [];
  for (let i = 1; i <= 12; i++) {
    const sn = ((asc - 1 + (i - 1)) % 12) + 1;
    const en = ZODIAC[sn - 1];
    hh.push({ houseNumber: i, signNumber: sn, signName: en, rashiName: RASHI[en] || en, planets: planets.filter(p => p.houseNumber === i && p.key !== 'Ascendant') });
  }
  return hh;
}

function iconPath(name, type) {
  if (type === 'sign') return `astro_icons/signs/${name}.svg`;
  return `astro_icons/planets/${name}.svg`;
}

function chartSvg(hd) {
  let s = '<svg viewBox="0 0 300 300" class="chart-svg" xmlns="http://www.w3.org/2000/svg">';
  s += '<defs><radialGradient id="g" cx="50%" cy="50%" r="70%"><stop offset="0%" stop-color="#FAF0DC"/><stop offset="70%" stop-color="#F5E6C8"/><stop offset="100%" stop-color="#E8D4A8"/></radialGradient></defs>';
  s += '<rect x="0" y="0" width="300" height="300" fill="url(#g)"/>';
  s += '<text x="8" y="18" fill="#FF6600" font-size="14">ॐ</text><text x="280" y="18" fill="#FF6600" font-size="14">ॐ</text><text x="8" y="295" fill="#FF6600" font-size="12">श्री</text><text x="275" y="295" fill="#FF6600" font-size="12">श्री</text>';
  s += '<g stroke="#8B0000" stroke-width="2" fill="none"><rect x="2" y="2" width="296" height="296"/><rect x="6" y="6" width="288" height="288" stroke-width="0.5" stroke="#A52A2A"/>';
  for (const [x1, y1, x2, y2] of LINES) s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  s += '</g>';
  for (const h of hd) {
    const [cx, cy] = CENTER[h.houseNumber];
    const tri = TRI.includes(h.houseNumber), asc = h.houseNumber === 1;
    const sny = tri ? cy - 12 : cy - 18, rny = sny + (tri ? 16 : 24);
    const iconSize = tri ? 20 : 28;
    const iconX = cx - iconSize / 2 - 2;
    const iconY = sny - iconSize / 2;
    s += `<image href="${iconPath(h.signName, 'sign')}" x="${iconX}" y="${iconY}" width="${iconSize}" height="${iconSize}"/>`;
    s += `<text x="${cx + iconSize / 2 + 1}" y="${sny}" text-anchor="middle" dominant-baseline="middle" class="${asc ? 'asc' : 'rashi'}" font-size="${tri ? 9 : 11}">${h.signNumber}</text>`;
    s += `<text x="${cx}" y="${rny}" text-anchor="middle" dominant-baseline="middle" class="rashi" font-size="${tri ? 8 : 10}">${h.rashiName}${asc ? ' ↑' : ''}</text>`;
    if (h.planets.length) {
      const cols = Math.min(h.planets.length, tri ? 2 : 3), sp = tri ? 18 : 22, lh = tri ? 10 : 12, fs = tri ? 8 : 9, base = rny + (tri ? 10 : 14), tw = (cols - 1) * sp;
      h.planets.forEach((p, idx) => {
        const row = Math.floor(idx / cols), col = idx % cols, off = col * sp - tw / 2, px = cx + off, py = base + row * lh;
        const ab = ABBR[p.key] || p.key.substr(0, 2), rt = p.isRetro ? 'ᴿ' : '';
        s += `<text x="${px}" y="${py}" text-anchor="middle" dominant-baseline="middle" class="planet" fill="${COLOR[p.key] || '#1A0F0A'}" font-size="${fs}">${ab}${rt}</text>`;
      });
    }
  }
  s += '</svg>';
  return s;
}

function dashaHtml(d) {
  if (!d || !d.mahaDasas) return '';
  const { currentMaha, currentAntar, mahaDasas, antarDasas } = d;
  const current = `<div class="current-dasha">
    <div><b>Current Mahadasha:</b> ${currentMaha ? currentMaha.lord : 'N/A'} ${currentMaha ? `(${currentMaha.startStr} → ${currentMaha.endStr})` : ''}</div>
    <div><b>Current Antardasha:</b> ${currentAntar ? currentAntar.lord : 'N/A'} ${currentAntar ? `(${currentAntar.startStr} → ${currentAntar.endStr})` : ''}</div>
  </div>`;
  const mahaRows = mahaDasas.map(x => `<tr><td>${x.lord}</td><td>${x.startStr}</td><td>${x.endStr}</td></tr>`).join('');
  const antarRows = (antarDasas || []).map(x => {
    const highlight = currentAntar && x.lord === currentAntar.lord ? ' style="background:#FFD699;font-weight:700;"' : '';
    return `<tr${highlight}><td>${x.lord}</td><td>${x.startStr}</td><td>${x.endStr}</td></tr>`;
  }).join('');
  return `<div class="dasha-section">
    <div class="dasha-title">Vimshottari Dasha</div>
    ${current}
    <div class="dasha-subtitle">Antardashas in Current Mahadasha (${currentMaha ? currentMaha.lord : ''})</div>
    <table class="dasha-table">
      <thead><tr><th>Antardasha Lord</th><th>Start</th><th>End</th></tr></thead>
      <tbody>${antarRows}</tbody>
    </table>
    <div class="dasha-subtitle" style="margin-top:3mm">All Mahadashas</div>
    <table class="dasha-table">
      <thead><tr><th>Mahadasha Lord</th><th>Start</th><th>End</th></tr></thead>
      <tbody>${mahaRows}</tbody>
    </table>
  </div>`;
}

function pageHtml(p, k, lat, lon, n, tot) {
  const asc = k.planets.find(x => x.key === 'Ascendant');
  const vis = k.planets.filter(x => ['Sun', 'Moon', 'Mars', 'Mercury', 'Jupiter', 'Venus', 'Saturn', 'Rahu', 'Ketu'].includes(x.key));
  const rows = vis.map(p => `<tr><td><img class="planet-icon" src="${iconPath(p.key, 'planet')}" alt=""/> ${ABBR[p.key] || p.key} (${p.key})</td><td>${p.signName}</td><td>${p.houseNumber}</td><td>${p.normDegree.toFixed(2)}°</td><td>${p.nakshatraName || ''}</td><td>${p.isRetro ? 'Yes' : 'No'}</td></tr>`).join('');
  return `<div class="page">
    <div class="header"><div class="title">Kundli Chart</div><div class="subtitle">AstroChitra · Vedic Astrology</div></div>
    <div class="details-box">
      <div class="name">${p.name}</div>
      <div class="details-grid">
        <div><span>DOB:</span> ${p.dob || 'N/A'}</div>
        <div><span>Time:</span> ${p.time || 'N/A'}</div>
        <div><span>Place:</span> ${p.place || 'N/A'}</div>
        <div><span>Resolved:</span> ${p.resolvedPlace || p.place || 'N/A'}</div>
        <div><span>Lat:</span> ${lat.toFixed(4)} · <span>Lon:</span> ${lon.toFixed(4)}</div>
      </div>
      <div class="lagna">Lagna: ${asc.signName} | Nakshatra: ${asc.nakshatraName} | Pada: ${asc.nakshatraPada}</div>
    </div>
    <div class="chart-wrap">${chartSvg(buildHouses(k.planets, k.ascendantSign))}</div>
    ${dashaHtml(k.dasha)}
    <table class="planet-table">
      <thead><tr><th>Planet</th><th>Sign</th><th>House</th><th>Degree</th><th>Nakshatra</th><th>Retro</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="footer">AstroChitra · Page ${n} / ${tot}</div>
  </div>`;
}

function htmlWrap(pages) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Kundli Charts</title><style>
    @font-face{font-family:'AstroChitra';src:url('AstroChitra.ttf') format('truetype');font-weight:normal;font-style:normal}
    *{box-sizing:border-box}
    body{margin:0;padding:0;font-family:'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#1A0F0A;background:#f4f1ea;line-height:1.4}
    .page{width:210mm;min-height:297mm;padding:10mm;margin:0 auto 8mm;background:#fff;box-shadow:0 0 10px rgba(0,0,0,.1);page-break-after:always;display:flex;flex-direction:column;align-items:center}
    .page:last-child{page-break-after:auto}
    .header{text-align:center;margin-bottom:4mm}
    .title{font-family:'AstroChitra',Georgia,serif;font-size:32pt;font-weight:400;color:#8B0000;letter-spacing:-0.1em}
    .subtitle{font-size:10pt;color:#666;margin-top:1mm}
    .details-box{width:100%;border:2px solid #8B0000;border-radius:6px;padding:4mm;background:#FFF8F0;margin-bottom:4mm}
    .name{font-family:'AstroChitra',Georgia,serif;font-size:22pt;font-weight:400;color:#1A0F0A;margin-bottom:3mm;letter-spacing:-0.1em}
    .details-grid{display:grid;grid-template-columns:1fr 1fr;gap:2mm 6mm;font-size:10pt;color:#333;margin-bottom:2mm}
    .details-grid span{font-weight:600;color:#1A0F0A}
    .lagna{font-size:9.5pt;font-weight:700;color:#8B0000}
    .chart-wrap{width:100%;display:flex;justify-content:center;margin-bottom:4mm}
    .chart-svg{width:100%;max-width:125mm;height:auto;border:4px double #8B0000;background:#F5E6C8}
    .chart-svg text{font-family:Georgia,'Times New Roman',serif;font-weight:700;paint-order:stroke fill;stroke:rgba(245,230,200,.85);stroke-width:2.5px;stroke-linejoin:round}
    .chart-svg .rashi{fill:#3D2914}
    .chart-svg .asc{fill:#8B0000;font-weight:800}
    .chart-svg .planet{font-weight:800;letter-spacing:.3px}
    .dasha-section{width:100%;margin-bottom:4mm}
    .dasha-title{font-family:'AstroChitra',Georgia,serif;font-size:15pt;font-weight:400;color:#8B0000;text-align:center;margin-bottom:2mm;letter-spacing:-0.1em}
    .dasha-subtitle{font-size:9.5pt;font-weight:700;color:#5C3D2E;margin-bottom:1.5mm}
    .current-dasha{width:100%;background:#FFF8F0;border:1px solid #8B0000;border-radius:4px;padding:3mm;margin-bottom:2mm;font-size:9pt;color:#1A0F0A}
    .current-dasha div{margin:1mm 0}
    .dasha-table{width:100%;border-collapse:collapse;font-size:8pt}
    .dasha-table th{background:#8B0000;color:#fff;padding:1.5mm 2mm;text-align:left}
    .dasha-table td{padding:1.5mm 2mm;border-bottom:1px solid #ddd}
    .dasha-table tbody tr:nth-child(odd){background:#F5E6C8}
    .dasha-table tbody tr:nth-child(even){background:#FBF4E9}
    .planet-table{width:100%;border-collapse:collapse;font-size:9pt;margin-top:2mm}
    .planet-table th{background:#8B0000;color:#fff;font-weight:700;padding:2mm;text-align:left}
    .planet-table td{padding:1.5mm 2mm;border-bottom:1px solid #ddd;vertical-align:middle}
    .planet-table tbody tr:nth-child(odd){background:#F5E6C8}
    .planet-table tbody tr:nth-child(even){background:#FBF4E9}
    .planet-icon{width:14px;height:14px;vertical-align:middle;margin-right:4px}
    .footer{margin-top:auto;padding-top:3mm;font-size:8pt;color:#999;text-align:center}
    @media print{body{background:none}.page{box-shadow:none;margin:0;page-break-after:always}.page:last-child{page-break-after:auto}}
    @page{size:A4 portrait;margin:0}
  </style></head><body>${pages.join('')}</body></html>`;
}

function copyAssets(outputDir) {
  const scriptsDir = __dirname;
  const dstAssets = path.join(outputDir, 'astro_icons');
  const dstFont = path.join(outputDir, 'AstroChitra.ttf');

  if (!fs.existsSync(dstAssets)) {
    const signsDir = path.join(scriptsDir, 'astro_icons', 'signs');
    if (fs.existsSync(signsDir)) {
      fs.cpSync(path.join(scriptsDir, 'astro_icons'), dstAssets, { recursive: true, force: true });
      console.log('Copied astro_icons/');
    }
  }
  if (!fs.existsSync(dstFont)) {
    const srcFont = path.join(scriptsDir, 'AstroChitra.ttf');
    if (fs.existsSync(srcFont)) {
      fs.copyFileSync(srcFont, dstFont);
      console.log('Copied AstroChitra.ttf');
    }
  }
}

async function resolveLocation(entry, hardcoded) {
  if (entry.lat != null && entry.lon != null) {
    return { lat: parseFloat(entry.lat), lon: parseFloat(entry.lon), displayName: entry.location || '' };
  }
  if (entry.location) {
    const c = await geocode(entry.location, hardcoded);
    if (c) return { lat: c.lat, lon: c.lon, displayName: c.displayName || entry.location };
  }
  console.log('  -> no location resolved, using Mumbai default');
  return { lat: 19.0760, lon: 72.8777, displayName: 'Mumbai' };
}

function loadEntries(config) {
  if (config.mode === 'csv') {
    const csvPath = path.resolve(config.csvPath);
    if (!fs.existsSync(csvPath)) { console.error(`CSV not found: ${csvPath}`); process.exit(1); }
    const cols = config.csvColumns || {};
    const nameCol = cols.name || 'CLIENTS NAME';
    const dobCol = cols.dob || 'DATE OF BIRTH';
    const timeCol = cols.time || 'BIRTH TIME';
    const locCol = cols.location || 'BIRTH PLACE';
    const rows = parseCSV(fs.readFileSync(csvPath, 'utf-8'));
    return rows.map(r => ({
      name: r[nameCol] || 'Unknown',
      dob: r[dobCol] || '',
      time: r[timeCol] || '',
      location: r[locCol] || ''
    }));
  }
  return config.manualEntries || [];
}

async function main() {
  const configArg = process.argv.find(a => a.startsWith('--config='));
  const configPath = configArg
    ? path.resolve(configArg.split('=')[1])
    : path.join(__dirname, 'config.json');

  if (!fs.existsSync(configPath)) {
    console.error(`Config not found: ${configPath}`);
    console.error('Copy sample-config.json to config.json and edit it, or pass --config=path');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
  const outputDir = path.resolve(config.outputDir || '..');
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

  copyAssets(outputDir);

  const entries = loadEntries(config);
  if (!entries.length) { console.error('No entries found in config'); process.exit(1); }
  console.log(`Found ${entries.length} entries\n`);

  const hardcoded = config.hardcodedLocations || {};
  const pages = [];

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    console.log(`[${i + 1}/${entries.length}] ${e.name}`);

    let y, m, d;
    if (e.dob) {
      const p = e.dob.split(/[-/]/);
      if (p.length === 3) { y = parseInt(p[0]); m = parseInt(p[1]); d = parseInt(p[2]); }
    }
    let h = 12, mn = 0;
    if (e.time) {
      const t = e.time.split(':');
      if (t.length >= 2) { h = parseInt(t[0]); mn = parseInt(t[1]); }
    }

    const { lat, lon, displayName } = await resolveLocation(e, hardcoded);
    console.log(`  -> ${lat}, ${lon} (${displayName})`);

    let k;
    try {
      k = genKundli({ year: y || 2000, month: m || 1, date: d || 1, hours: h, minutes: mn, seconds: 0, timezone: 5.5, latitude: lat, longitude: lon });
    } catch (err) {
      console.error(`  Failed: ${err.message}`);
      continue;
    }

    pages.push(pageHtml({ name: e.name, dob: e.dob, time: e.time, place: e.location, resolvedPlace: displayName }, k, lat, lon, i + 1, entries.length));
    console.log('  done');
  }

  const out = path.join(outputDir, 'index.html');
  fs.writeFileSync(out, htmlWrap(pages), 'utf-8');
  console.log(`\nHTML saved: ${out} (${pages.length} pages)`);
  console.log('Open in Chrome, then Print -> Save as PDF -> A4 Portrait.');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
