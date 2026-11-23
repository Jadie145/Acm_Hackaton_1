const el = id => document.getElementById(id);
const fieldStatus = message => { el('fieldResult').textContent = message; };
if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => fieldStatus('Offline reload requires localhost or HTTPS.'));
let referralPhoto;
el('image').addEventListener('change', () => {
  showResult(false);
  referralPhoto = null;
  el('overlay').hidden = el('refer').hidden = true;
  fieldStatus('');
});
function showResult(local) {
  el('localResult').hidden = !local;
  el('output').hidden = local;
}
document.addEventListener('online-result', () => showResult(false));
document.addEventListener('local-analysis', async () => {
  const file = el('image').files[0];
  if (!file) return fieldStatus('Choose a leaf photo first.');
  showResult(true);
  el('overlay').hidden = el('refer').hidden = true;
  fieldStatus('Checking photo on this device…');
  el('localResult').scrollIntoView({ block: 'nearest' });
  try {
    const image = await createImageBitmap(file);
    const canvas = el('overlay');
    canvas.width = 240;
    canvas.height = 240;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, 240, 240);
    referralPhoto = canvas.toDataURL('image/jpeg', 0.75);
    const small = document.createElement('canvas');
    small.width = small.height = 32;
    const s = small.getContext('2d');
    s.drawImage(image, 0, 0, 32, 32);
    image.close();
    const data = s.getImageData(0, 0, 32, 32).data;
    const bins = Array(256).fill(0);
    let contrast = 0;
    for (let y = 4; y < 28; y++) for (let x = 4; x < 28; x++) {
      const i = (y * 32 + x) * 4;
      const quadrant = Math.floor(y / 16) * 2 + Math.floor(x / 16);
      bins[quadrant * 64 + (data[i] >> 6) * 16 + (data[i+1] >> 6) * 4 + (data[i+2] >> 6)]++;
      contrast += Math.abs(data[i+1] - data[i+5]);
    }
    const references = await fetch('/model.json').then(r => r.json());
    if (el('image').files[0] !== file || el('localResult').hidden) return;
    if (!references.length || references[0].bins.length !== bins.length) throw new Error('Local model version mismatch');
    const nearest = references.map(row => ({
      label: row.label, distance: row.bins.reduce((sum, v, i) => sum + Math.abs(v - bins[i]), 0)
    })).sort((a,b) => a.distance-b.distance).slice(0,7);
    const votes = {};
    nearest.forEach(row => votes[row.label] = (votes[row.label] || 0) + 1);
    const [label, count] = Object.entries(votes).sort((a,b) => b[1]-a[1])[0];
    const uncertain = contrast/576 < 3 || count < 4 || nearest[0].distance > 300;
    el('refer').hidden = !uncertain;
    canvas.hidden = uncertain || label !== 'Early_blight';
    if (uncertain) return fieldStatus('Uncertain. Retake a sharp tomato leaf photo or send this image for review.');
    const agreement = Math.round(count/7*100) + '% reference agreement';
    if (label === 'healthy') return fieldStatus('No visible symptoms suggested · ' + agreement);
    if (label !== 'Early_blight') {
      el('refer').hidden = false;
      return fieldStatus('Possible ' + label.replace(/^Tomato_/, '').replace(/_/g, ' ').toLowerCase() + ' · ' + agreement + '. Ask an agriculture officer to confirm.');
    }
    const pixels = ctx.getImageData(0,0,240,240);
    let affected = 0, leaf = 0;
    for (let i=0; i<pixels.data.length; i+=4) {
      const [r,g,b] = pixels.data.subarray(i,i+3);
      const brown = r > g*1.05 && g > b*1.12 && r-b > 20;
      if (brown || (g > r && g > b*1.1)) leaf++;
      if (brown) { affected++; pixels.data[i]=255; pixels.data[i+1]=110; pixels.data[i+2]=40; }
    }
    ctx.putImageData(pixels,0,0);
    const percent = Math.round(100*affected/Math.max(1,leaf));
    fieldStatus('Possible early blight · ' + agreement + '. Color-based severity estimate: ' + (percent < 10 ? 'low' : percent < 30 ? 'moderate' : 'high') + '. Orange marks brown pixels (' + percent + '% of estimated leaf area).');
  } catch { fieldStatus('Unable to read the photo or local model. Load the app online once and try again.'); }
});
async function syncCases() {
  for (const key of Object.keys(localStorage).filter(k => k.startsWith('jrv-case-'))) {
    const response = await fetch('/api/referrals',{method:'POST',headers:{'Content-Type':'application/json'},body:localStorage.getItem(key)});
    if (!response.ok) throw Error();
    localStorage.removeItem(key);
  }
}
el('refer').onclick = async () => {
  const id = crypto.randomUUID();
  try { localStorage.setItem('jrv-case-'+id,JSON.stringify({id,photo:referralPhoto})); }
  catch { return fieldStatus('Device storage is full. Retain the original photo.'); }
  el('refer').hidden = true;
  try { await syncCases(); fieldStatus('Delivered to the local expert inbox.'); }
  catch { fieldStatus('Saved on this device. Reconnect to deliver the referral.'); }
};
window.addEventListener('online', () => syncCases().catch(() => {}));
syncCases().catch(() => {});
el('inbox').onclick = async () => {
  const box = el('cases');
  try {
    const cases = await fetch('/api/referrals').then(r => r.json());
    box.textContent = cases.length + ' photos awaiting review';
    for (const item of cases) {
      const img = new Image(); img.src = item.photo; img.width=120; img.alt='Referred leaf'; box.append(img);
    }
  } catch { box.textContent='Connect to the server to open the inbox.'; }
};
function advisory(question) {
  const answer = /करपा|उपाय|उपचार|प्रतिबंध|काय कर|रोग/.test(question)
    ? 'अगेती करप्याची शक्यता असल्यास रोगग्रस्त पिकाचे अवशेष काढा. पुढील हंगामात पिकांची फेरपालट करा. उपचार ठरवण्यापूर्वी कृषी अधिकाऱ्याकडून रोगाची खात्री करा.'
    : 'हा सल्ला टोमॅटोच्या अगेती करप्यासाठी आहे. इतर समस्यांसाठी कृषी अधिकाऱ्यांशी संपर्क साधा.';
  el('reply').textContent = question + ' — ' + answer;
  if (window.speechSynthesis) { const voice = new SpeechSynthesisUtterance(answer); voice.lang='mr-IN'; speechSynthesis.cancel(); speechSynthesis.speak(voice); }
}
el('advice').onclick = () => advisory(el('advice').textContent);
el('speak').onclick = () => {
  const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Speech) { el('reply').textContent='आवाज उपलब्ध नाही. वरील प्रश्न निवडा.'; return; }
  const recognition = new Speech(); recognition.lang='mr-IN';
  recognition.onresult = e => advisory(e.results[0][0].transcript);
  recognition.onerror = () => { el('reply').textContent='माइक उपलब्ध नाही. वरील प्रश्न निवडा.'; };
  recognition.start();
};
const villages = [
  { name: 'Ozar', coordinates: [20.09, 73.93] },
  { name: 'Pimpalgaon Baswant', coordinates: [20.17, 73.98] },
  { name: 'Niphad', coordinates: [20.08, 74.11] }
];

const leaflet = document.createElement('script');
leaflet.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
leaflet.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
leaflet.crossOrigin = 'anonymous';
leaflet.onload = () => {
  el('map').textContent = '';
  const map = L.map('map', { scrollWheelZoom: false });
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>'
  }).addTo(map);
  map.fitBounds(villages.map(village => village.coordinates), { padding: [35, 35], maxZoom: 12 });
  for (const village of villages) {
    L.circleMarker(village.coordinates, { radius: 9, color: '#9c3c14', fillOpacity: 0.85 })
      .addTo(map).bindTooltip(village.name).bindPopup(village.name + ' · Simulated early-blight report');
  }
};
leaflet.onerror = () => {
  el('map').textContent = 'Map unavailable. Demo villages: ' + villages.map(village => village.name).join(', ') + '.';
};
document.head.append(leaflet);

el('weather').onclick = async () => {
  el('weather').disabled = true;
  el('alert').textContent = 'Checking forecast…';
  try {
    const query = new URLSearchParams({
      latitude: villages.map(village => village.coordinates[0]).join(','),
      longitude: villages.map(village => village.coordinates[1]).join(','),
      hourly: 'relative_humidity_2m',
      forecast_hours: '24'
    });
    const response = await fetch('https://api.open-meteo.com/v1/forecast?' + query, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error('Forecast request failed');
    const forecasts = await response.json();
    const rows = villages.map((village, index) => {
      const humidity = forecasts[index]?.hourly?.relative_humidity_2m.filter(Number.isFinite);
      if (!humidity?.length) throw new Error('Humidity forecast unavailable');
      return { name: village.name, peak: Math.max(...humidity) };
    });
    const flagged = rows.filter(row => row.peak >= 80).map(row => row.name);
    el('alert').textContent = rows.map(row => row.name + ' ' + row.peak + '%').join(' · ') + '. ' +
      (flagged.length ? 'Demo alert for ' + flagged.join(', ') + '. Scout tomato leaves after humid conditions.' : 'No village reached the 80% demo alert threshold.');
  } catch {
    el('alert').textContent = 'Forecast unavailable. Check your connection and try again.';
  } finally {
    el('weather').disabled = false;
  }
};
