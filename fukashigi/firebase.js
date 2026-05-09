// ========================================
// Firebase 設定ファイル
// ========================================
// Firebaseコンソール（https://console.firebase.google.com/）で
// プロジェクトを作成し、以下の値を設定してください。

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Firebase 初期化
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db   = firebase.firestore();

// ========================================
// 共通ユーティリティ
// ========================================

// 今日の日付文字列 (YYYYMMDD)
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

// タイムスタンプ → 日本語日時文字列
function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('ja-JP', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit'
  });
}

// 日付のみ
function formatDateOnly(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('ja-JP', {year:'numeric', month:'2-digit', day:'2-digit'});
}

// イベントカテゴリラベル
function categoryLabel(cat) {
  const map = { poker:'ポーカー', smash:'スマブラ', fishing:'釣り', card:'カード', other:'その他' };
  return map[cat] || cat;
}

// ランク計算（来店回数ベース）
function calcRank(checkInCount) {
  if (checkInCount >= 50) return { rank:'LEGEND', color:'#D4AF37' };
  if (checkInCount >= 30) return { rank:'MASTER', color:'#E8C860' };
  if (checkInCount >= 15) return { rank:'VETERAN', color:'#CCCCCC' };
  if (checkInCount >= 5)  return { rank:'MEMBER',  color:'#AAAAAA' };
  return { rank:'ROOKIE', color:'#666666' };
}

// 称号計算
function calcTitle(checkInCount, eventJoinCount) {
  if (checkInCount >= 50)  return '不可思議の住人';
  if (checkInCount >= 30)  return '幹部候補';
  if (checkInCount >= 20)  return 'レジスタンスメンバー';
  if (checkInCount >= 10)  return '常連';
  if (checkInCount >= 5)   return '顔見知り';
  if (checkInCount >= 1)   return '来店者';
  return '新参者';
}

// 今日のQRチェックインコード
function todayCheckinCode() {
  return `FUKASHIGI-CHECKIN-${todayStr()}`;
}
