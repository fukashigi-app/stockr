// ========================================
// Firebase 設定ファイル
// ========================================
// CDNを使用してFirebaseの最新モジュール（v9以降）をインポートします
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// FUKASHIGIプロジェクトの設定値
const firebaseConfig = {
  apiKey: "AIzaSyDt2LBQ7W_k2XGOYw273AozZ2-sY2i4z6k",
  authDomain: "fukashigi-1.firebaseapp.com",
  projectId: "fukashigi-1",
  storageBucket: "fukashigi-1.firebasestorage.app",
  messagingSenderId: "130242994746",
  appId: "1:130242994746:web:0dd04ccf2f0c74dbeb8b03",
  measurementId: "G-7S8QM44H4Q"
};

// Firebase 初期化
const app = initializeApp(firebaseConfig);

// 他のファイルから import できるように export を付けます
export const auth = getAuth(app);
export const db   = getFirestore(app);

// ========================================
// 共通ユーティリティ
// ========================================

// 今日の日付文字列 (YYYYMMDD)
export function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

// タイムスタンプ → 日本語日時文字列
export function formatDate(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString('ja-JP', {
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit'
  });
}

// 日付のみ
export function formatDateOnly(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('ja-JP', {year:'numeric', month:'2-digit', day:'2-digit'});
}

// イベントカテゴリラベル
export function categoryLabel(cat) {
  const map = { poker:'ポーカー', smash:'スマブラ', fishing:'釣り', card:'カード', other:'その他' };
  return map[cat] || cat;
}

// ランク計算（来店回数ベース）
export function calcRank(checkInCount) {
  if (checkInCount >= 50) return { rank:'LEGEND', color:'#D4AF37' };
  if (checkInCount >= 30) return { rank:'MASTER', color:'#E8C860' };
  if (checkInCount >= 15) return { rank:'VETERAN', color:'#CCCCCC' };
  if (checkInCount >= 5)  return { rank:'MEMBER',  color:'#AAAAAA' };
  return { rank:'ROOKIE', color:'#666666' };
}

// 称号計算
export function calcTitle(checkInCount, eventJoinCount) {
  if (checkInCount >= 50)  return '不可思議の住人';
  if (checkInCount >= 30)  return '幹部候補';
  if (checkInCount >= 20)  return 'レジスタンスメンバー';
  if (checkInCount >= 10)  return '常連';
  if (checkInCount >= 5)   return '顔見知り';
  if (checkInCount >= 1)   return '来店者';
  return '新参者';
}

// 今日のQRチェックインコード
export function todayCheckinCode() {
  return `FUKASHIGI-CHECKIN-${todayStr()}`;
}
