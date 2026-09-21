const admin = require('firebase-admin');
const { getApps, initializeApp, cert } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
// Debug: verifica che la variabile esista
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
console.log('FIREBASE_SERVICE_ACCOUNT presente:', raw !== undefined);
console.log('Lunghezza:', raw ? raw.length : 0);
if (!raw) {
  console.error('ERRORE: variabile FIREBASE_SERVICE_ACCOUNT non trovata.');
  console.log('Variabili disponibili:', Object.keys(process.env).filter(k => !k.includes('TOKEN') && !k.includes('KEY')));
  process.exit(1);
}
const serviceAccount = JSON.parse(raw);
initializeApp({
  credential: cert(serviceAccount),
  databaseURL: "https://huntercoin-9fa34-default-rtdb.europe-west1.firebasedatabase.app"
});
const db = getDatabase();
// Mean-reversion (Ornstein-Uhlenbeck in scala log) — curva volubile con ritorno al centro
// center: valore attorno a cui gravita | theta: forza del richiamo | sigma: ampiezza degli shock
function gbm(current) {
  const center = 1225; // media geometrica di 300 e 5000 -> estremi toccati con pari frequenza
  const theta = 0.03;
  const sigma = 0.20;
  // Box-Muller
  const u = Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  const logNext = Math.log(current)
                + theta * (Math.log(center) - Math.log(current))
                + sigma * z;
  return Math.round(Math.min(Math.max(Math.exp(logNext), 300), 5000));
}
// Hunterday: 5% al giorno, dura fino alle 23:59 del giorno stesso
async function checkHunterday(data) {
  const today = new Date().toISOString().split('T')[0];
  const hd = data.hunterday || {};
  if (hd.lastChecked === today) {
    console.log('Hunterday: già controllato oggi (' + (hd.active ? 'ATTIVO' : 'inattivo') + ')');
    return hd.active || false;
  }
  // 15% ~ approssima il ~19% reale della regola avkg (duplicato tra le prime 3 sequenze)
  const isHD = Math.random() < 0.15;
  await db.ref('huntercoin/hunterday').set({ active: isHD, lastChecked: today });
  console.log('Hunterday: ' + (isHD ? 'ATTIVO' : 'inattivo') + ' (nuovo controllo)');
  return isHD;
}
async function run() {
  try {
    const snap = await db.ref('huntercoin').once('value');
    const data = snap.val() || {};
    const current = data.currentValue || 1000;
    console.log('Valore attuale: ' + current + ' Jenny');
    await checkHunterday(data);
    const next = gbm(current);
    const ts = Date.now();
    console.log('Nuovo valore: ' + next + ' Jenny');
    await db.ref('huntercoin/currentValue').set(next);
    await db.ref('huntercoin/lastUpdate').set(ts);
    await db.ref('huntercoin/lastAutoUpdate').set(ts);
    await db.ref('huntercoin/history').push({ value: next, timestamp: ts });
    // Pulizia storico > 7 giorni
    const histSnap = await db.ref('huntercoin/history').once('value');
    const history = histSnap.val();
    if (history) {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      for (const [key, entry] of Object.entries(history)) {
        if (entry.timestamp < cutoff) {
          await db.ref('huntercoin/history/' + key).remove();
        }
      }
    }
    console.log('Aggiornamento completato con successo.');
    process.exit(0);
  } catch (e) {
    console.error('Errore:', e.message);
    process.exit(1);
  }
}
run();
