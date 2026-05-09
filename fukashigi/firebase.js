// ========================================
// Firebase 設定ファイル（compat版）
// ========================================

const firebaseConfig = {
  apiKey:            "AIzaSyDt2LBQ7W_k2XGOYw273AozZ2-sY2i4z6k",
  authDomain:        "fukashigi-1.firebaseapp.com",
  projectId:         "fukashigi-1",
  storageBucket:     "fukashigi-1.firebasestorage.app",
  messagingSenderId: "130242994746",
  appId:             "1:130242994746:web:0dd04ccf2f0c74dbeb8b03"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}

const auth    = firebase.auth();
const db      = firebase.firestore();
const storage = firebase.storage();

// ========================================
// 共通ユーティリティ
// ========================================

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('ja-JP', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit'
  });
}

function formatTime(ts) {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString('ja-JP', { hour:'2-digit', minute:'2-digit' });
}

function formatDateOnly(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('ja-JP', { year:'numeric', month:'2-digit', day:'2-digit' });
}

function categoryLabel(cat) {
  const map = { poker:'ポーカー', smash:'スマブラ', fishing:'釣り', card:'カード', other:'その他' };
  return map[cat] || cat;
}

function calcRank(checkInCount) {
  if (checkInCount >= 50) return { rank:'LEGEND', color:'#D4AF37' };
  if (checkInCount >= 30) return { rank:'MASTER', color:'#E8C860' };
  if (checkInCount >= 15) return { rank:'VETERAN', color:'#CCCCCC' };
  if (checkInCount >= 5)  return { rank:'MEMBER',  color:'#AAAAAA' };
  return { rank:'ROOKIE', color:'#666666' };
}

function calcTitle(checkInCount) {
  if (checkInCount >= 50) return '不可思議の住人';
  if (checkInCount >= 30) return '幹部候補';
  if (checkInCount >= 20) return 'レジスタンスメンバー';
  if (checkInCount >= 10) return '常連';
  if (checkInCount >= 5)  return '顔見知り';
  if (checkInCount >= 1)  return '来店者';
  return '新参者';
}

function todayCheckinCode() {
  return `FUKASHIGI-CHECKIN-${todayStr()}`;
}

// 画像アップロード共通（Storage）
async function uploadFile(path, file) {
  const ref = storage.ref(path);
  await ref.put(file);
  return await ref.getDownloadURL();
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
