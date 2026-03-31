const admin = require('firebase-admin');
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
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: "https://huntercoin-9fa34-default-rtdb.europe-west1.firebasedatabase.app"
});
const db = admin.database();
// GBM — stesso algoritmo del master
function gbm(current) {
  const sigma = 0.08;
  // Box-Muller
  const u = Math.random();
  const v = Math.random();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  var mu = 0.002;
  return Math.round(Math.min(Math.max(current * Math.exp((mu - 0.5 * sigma * sigma) + sigma * z), 200), 10000));
}
// Hunterday: 15% al giorno, dura fino alle 23:59 del giorno stesso
async function checkHunterday(data) {
  const today = new Date().toISOString().split('T')[0];
  const hd = data.hunterday || {};
  if (hd.lastChecked === today) {
    console.log('Hunterday: già controllato oggi (' + (hd.active ? 'ATTIVO' : 'inattivo') + ')');
    return hd.active || false;
  }
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
