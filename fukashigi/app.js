// ========================================
// FUKASHIGI APP — メンバー用 JavaScript
// ========================================

let currentUser  = null;
let currentUserData = null;
let allEvents    = [];
let currentFilter = 'all';
let qrScanner    = null;
let selectedEvent = null;

// ========================================
// 初期化・認証
// ========================================

auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  currentUser = user;
  await loadUserData();
  loadHome();
  loadEvents();
});

async function loadUserData() {
  const doc = await db.collection('users').doc(currentUser.uid).get();
  if (!doc.exists) {
    // ユーザードキュメントがない場合は作成
    const data = {
      uid: currentUser.uid,
      name: currentUser.displayName || currentUser.email.split('@')[0],
      email: currentUser.email,
      iconUrl: '',
      memberNumber: 'F' + String(Date.now()).slice(-6),
      role: 'member',
      points: 0, totalPoints: 0, chips: 0,
      rank: 'ROOKIE', title: '新参者',
      badges: [], checkInCount: 0, eventJoinCount: 0,
      comment: '',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('users').doc(currentUser.uid).set(data);
    currentUserData = data;
  } else {
    currentUserData = doc.data();
    // ランクと称号を自動更新
    const rankInfo = calcRank(currentUserData.checkInCount || 0);
    const title    = calcTitle(currentUserData.checkInCount || 0, currentUserData.eventJoinCount || 0);
    if (currentUserData.rank !== rankInfo.rank || currentUserData.title !== title) {
      await db.collection('users').doc(currentUser.uid).update({ rank: rankInfo.rank, title });
      currentUserData.rank  = rankInfo.rank;
      currentUserData.title = title;
    }
  }
  // 管理者は管理画面へ
  if (currentUserData.role === 'admin') {
    window.location.href = 'admin.html';
  }
}

function doLogout() {
  auth.signOut().then(() => { window.location.href = 'index.html'; });
}

// ========================================
// タブ切り替え
// ========================================

function switchTab(tab) {
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('nav-' + tab).classList.add('active');
  if (tab === 'mypage') loadMyPage();
}

// ========================================
// ホーム
// ========================================

function loadHome() {
  if (!currentUserData) return;
  const d = currentUserData;

  document.getElementById('headerUserName').textContent = d.name;
  document.getElementById('homeUserName').textContent   = d.name + ' さん';

  // ランク・称号
  const rankInfo = calcRank(d.checkInCount || 0);
  document.getElementById('homeRankRow').innerHTML = `
    <span class="badge badge-blue">${rankInfo.rank}</span>
    <span class="badge badge-purple">${d.title || '新参者'}</span>
  `;

  // スタッツ
  document.getElementById('statPoints').textContent   = (d.points || 0).toLocaleString();
  document.getElementById('statCheckins').textContent = d.checkInCount || 0;
  document.getElementById('statChips').textContent    = d.chips || 0;
  document.getElementById('statEvents').textContent   = d.eventJoinCount || 0;

  // チェックイン済みか確認
  checkTodayCheckIn();

  // お知らせ
  loadNotices();
  // イベント（ホーム用）
  loadHomeEvents();
}

async function checkTodayCheckIn() {
  const today = todayStr();
  const snap = await db.collection('checkins')
    .where('userId', '==', currentUser.uid)
    .where('dateStr', '==', today)
    .limit(1).get();

  const btn = document.getElementById('checkinBtn');
  const status = document.getElementById('checkinStatus');
  if (!snap.empty) {
    btn.disabled = true;
    btn.style.opacity = '0.5';
    btn.classList.remove('pulse');
    btn.innerHTML = '<span class="icon">✅</span> 本日チェックイン済み';
    status.textContent = '次回のチェックインは明日から可能です';
  }
}

async function loadNotices() {
  const container = document.getElementById('homeNotices');
  try {
    const snap = await db.collection('notices')
      .orderBy('pinned', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(3).get();

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state"><p>お知らせはありません</p></div>';
      return;
    }
    container.innerHTML = snap.docs.map(doc => {
      const n = doc.data();
      return `
        <div class="notice-card ${n.pinned ? 'pinned' : ''}">
          ${n.pinned ? '<span class="badge badge-gold" style="margin-bottom:6px;display:inline-block;">📌 固定</span>' : ''}
          <div class="notice-title">${escHtml(n.title)}</div>
          <div class="notice-body">${escHtml(n.body)}</div>
          <div class="notice-meta">${formatDate(n.createdAt)} — ${escHtml(n.createdBy || '')}</div>
        </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><p>読み込みエラー</p></div>';
  }
}

async function loadHomeEvents() {
  const container = document.getElementById('homeEvents');
  try {
    const now = new Date();
    const snap = await db.collection('events')
      .where('isPublic', '==', true)
      .orderBy('date', 'asc')
      .limit(5).get();

    const upcoming = snap.docs.filter(d => {
      const ev = d.data();
      return new Date(ev.date) >= new Date(now.toISOString().slice(0,10));
    });

    if (upcoming.length === 0) {
      container.innerHTML = '<div class="empty-state"><p>予定されているイベントはありません</p></div>';
      return;
    }
    container.innerHTML = upcoming.slice(0,3).map(doc => renderEventCard(doc.id, doc.data())).join('');
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><p>読み込みエラー</p></div>';
  }
}

// ========================================
// イベント一覧
// ========================================

async function loadEvents() {
  const container = document.getElementById('eventsList');
  try {
    const snap = await db.collection('events')
      .where('isPublic', '==', true)
      .orderBy('date', 'desc')
      .get();
    allEvents = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderEventsList();
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><p>読み込みエラー</p></div>';
  }
}

function renderEventsList() {
  const container = document.getElementById('eventsList');
  const filtered  = currentFilter === 'all'
    ? allEvents
    : allEvents.filter(e => e.category === currentFilter);

  if (filtered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>該当するイベントはありません</p></div>';
    return;
  }
  container.innerHTML = filtered.map(ev => renderEventCard(ev.id, ev)).join('');
}

function filterEvents(cat, btn) {
  currentFilter = cat;
  document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderEventsList();
}

function renderEventCard(id, ev) {
  const joined = (ev.participants || []).includes(currentUser.uid);
  const count  = (ev.participants || []).length;
  const cap    = ev.capacity || 0;
  const pct    = cap > 0 ? Math.min(100, Math.round(count / cap * 100)) : 0;
  return `
    <div class="event-card ${joined ? 'joined' : ''} fade-in" onclick="openEventModal('${id}')">
      <div class="event-card-header">
        <div class="event-card-title">${escHtml(ev.title)}</div>
        <span class="badge badge-purple">${categoryLabel(ev.category)}</span>
      </div>
      <div class="event-card-meta">
        <span>📅 ${ev.date || '未定'}</span>
        <span>🕐 ${ev.startTime || ''}〜${ev.endTime || ''}</span>
        <span>💴 ${ev.fee ? ev.fee.toLocaleString() + '円' : '無料'}</span>
        <span>👥 ${count}${cap > 0 ? ' / ' + cap : ''}名</span>
      </div>
      <div class="event-join-row">
        ${cap > 0 ? `<div class="participants-bar"><div class="participants-bar-fill" style="width:${pct}%"></div></div>` : '<div style="flex:1"></div>'}
        <span class="badge ${joined ? 'badge-green' : 'badge-gray'}">${joined ? '✓ 参加予定' : '未参加'}</span>
      </div>
    </div>`;
}

// ========================================
// イベント詳細モーダル
// ========================================

async function openEventModal(eventId) {
  const ev = allEvents.find(e => e.id === eventId) || {};
  selectedEvent = { id: eventId, ...ev };
  const joined  = (ev.participants || []).includes(currentUser.uid);
  const count   = (ev.participants || []).length;

  document.getElementById('eventModalTitle').textContent = ev.title || '';
  document.getElementById('eventModalContent').innerHTML = `
    <div class="divider"></div>
    <div style="margin-bottom:12px;">
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px;">
        <span class="badge badge-purple">${categoryLabel(ev.category)}</span>
        ${joined ? '<span class="badge badge-green">✓ 参加予定</span>' : ''}
      </div>
      <table style="width:100%;font-size:14px;border-collapse:collapse;">
        ${row('📅 開催日', ev.date || '未定')}
        ${row('🕐 時間', (ev.startTime || '?') + '〜' + (ev.endTime || '?'))}
        ${row('💴 参加費', ev.fee ? ev.fee.toLocaleString() + '円' : '無料')}
        ${row('👥 参加者', count + (ev.capacity ? ' / ' + ev.capacity : '') + '名')}
      </table>
    </div>
    ${ev.description ? `<div style="background:var(--bg-card2);border-radius:8px;padding:12px;font-size:14px;line-height:1.7;white-space:pre-line;margin-bottom:16px;">${escHtml(ev.description)}</div>` : ''}
    <button class="btn ${joined ? 'btn-danger' : 'btn-primary'} btn-block"
            id="joinCancelBtn"
            onclick="toggleJoin('${eventId}', ${joined})">
      ${joined ? '❌ 参加キャンセル' : '✅ 参加する'}
    </button>
  `;

  document.getElementById('eventModal').classList.add('open');
}

function row(label, val) {
  return `<tr>
    <td style="padding:6px 0;color:var(--text-muted);width:45%;">${label}</td>
    <td style="padding:6px 0;font-weight:600;">${escHtml(String(val))}</td>
  </tr>`;
}

function closeEventModal() {
  document.getElementById('eventModal').classList.remove('open');
}

async function toggleJoin(eventId, currentlyJoined) {
  const btn = document.getElementById('joinCancelBtn');
  btn.disabled = true;

  try {
    const ref = db.collection('events').doc(eventId);
    const ev  = await ref.get();
    const data = ev.data();

    if (currentlyJoined) {
      await ref.update({
        participants: firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
      });
      await db.collection('users').doc(currentUser.uid).update({
        eventJoinCount: firebase.firestore.FieldValue.increment(-1)
      });
      showToast('参加をキャンセルしました', 'info');
    } else {
      if (data.capacity > 0 && (data.participants || []).length >= data.capacity) {
        showToast('定員に達しています', 'error');
        btn.disabled = false;
        return;
      }
      await ref.update({
        participants: firebase.firestore.FieldValue.arrayUnion(currentUser.uid)
      });
      await db.collection('users').doc(currentUser.uid).update({
        eventJoinCount: firebase.firestore.FieldValue.increment(1)
      });
      showToast('参加登録しました！', 'success');
    }

    // データ再読み込み
    closeEventModal();
    await loadUserData();
    loadEvents();
    loadHome();
  } catch (e) {
    showToast('エラーが発生しました: ' + e.message, 'error');
    btn.disabled = false;
  }
}

// ========================================
// QRチェックイン
// ========================================

function openQRScanner() {
  document.getElementById('qrModal').classList.add('open');
  document.getElementById('qrMessage').style.display = 'none';

  if (qrScanner) {
    qrScanner.resume();
    return;
  }

  qrScanner = new Html5Qrcode('qr-reader');
  qrScanner.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 200, height: 200 } },
    onQRSuccess,
    () => {}
  ).catch(err => {
    document.getElementById('qrMessage').textContent = 'カメラを起動できませんでした。ブラウザのカメラ許可を確認してください。';
    document.getElementById('qrMessage').style.display = 'block';
    document.getElementById('qrMessage').style.color = 'var(--danger)';
  });
}

async function onQRSuccess(text) {
  const expected = todayCheckinCode();
  if (text !== expected) {
    showQRMessage('❌ 無効なQRコードです', 'var(--danger)');
    return;
  }

  // スキャン停止
  if (qrScanner) qrScanner.pause();

  // 今日のチェックイン確認
  const today = todayStr();
  const snap = await db.collection('checkins')
    .where('userId', '==', currentUser.uid)
    .where('dateStr', '==', today)
    .limit(1).get();

  if (!snap.empty) {
    showQRMessage('✅ 本日はすでにチェックイン済みです', 'var(--neon-blue)');
    return;
  }

  // チェックイン登録
  const batch = db.batch();
  const checkinRef = db.collection('checkins').doc();
  batch.set(checkinRef, {
    userId:   currentUser.uid,
    userName: currentUserData.name,
    dateStr:  today,
    checkedInAt: firebase.firestore.FieldValue.serverTimestamp(),
    eventId:  '',
    pointsAdded: 10,
    memo: '通常チェックイン',
  });

  const userRef = db.collection('users').doc(currentUser.uid);
  batch.update(userRef, {
    checkInCount: firebase.firestore.FieldValue.increment(1),
    points:       firebase.firestore.FieldValue.increment(10),
    totalPoints:  firebase.firestore.FieldValue.increment(10),
    updatedAt:    firebase.firestore.FieldValue.serverTimestamp(),
  });

  await batch.commit();

  showQRMessage('✅ チェックイン完了！ +10ポイント', 'var(--success)');
  showToast('チェックイン完了！ +10pt 獲得', 'success');

  // バッジ付与チェック
  await checkAndAwardBadges();

  setTimeout(() => {
    closeQRScanner();
    loadUserData().then(() => loadHome());
  }, 2000);
}

function showQRMessage(msg, color) {
  const el = document.getElementById('qrMessage');
  el.textContent = msg;
  el.style.color = color;
  el.style.display = 'block';
}

function closeQRScanner() {
  document.getElementById('qrModal').classList.remove('open');
  if (qrScanner) {
    qrScanner.stop().then(() => {
      qrScanner = null;
      document.getElementById('qr-reader').innerHTML = '';
    }).catch(() => {});
  }
}

// ========================================
// バッジ付与
// ========================================

const BADGES_DEF = [
  { id: 'first_visit',   name: '初来店',      icon: '🌟', condition: d => d.checkInCount >= 1 },
  { id: 'visit_5',       name: '5回来店',      icon: '⭐', condition: d => d.checkInCount >= 5 },
  { id: 'visit_10',      name: '10回来店',     icon: '💫', condition: d => d.checkInCount >= 10 },
  { id: 'visit_30',      name: '常連',         icon: '🏆', condition: d => d.checkInCount >= 30 },
  { id: 'event_join',    name: 'イベント参加', icon: '🎮', condition: d => d.eventJoinCount >= 1 },
  { id: 'event_5',       name: '5回参加',      icon: '🎯', condition: d => d.eventJoinCount >= 5 },
  { id: 'resistance',    name: 'レジスタンス', icon: '✊', condition: d => d.checkInCount >= 20 },
  { id: 'headquarters',  name: '不可思議の住人',icon: '🏠', condition: d => d.checkInCount >= 50 },
  { id: 'executive',     name: '幹部候補',     icon: '👑', condition: d => d.checkInCount >= 30 },
];

async function checkAndAwardBadges() {
  const doc = await db.collection('users').doc(currentUser.uid).get();
  const data = doc.data();
  const current = data.badges || [];
  const toAdd = BADGES_DEF
    .filter(b => !current.includes(b.id) && b.condition(data))
    .map(b => b.id);
  if (toAdd.length > 0) {
    await db.collection('users').doc(currentUser.uid).update({
      badges: firebase.firestore.FieldValue.arrayUnion(...toAdd)
    });
    toAdd.forEach(id => {
      const badge = BADGES_DEF.find(b => b.id === id);
      if (badge) showToast(`🏅 新バッジ獲得：${badge.name}`, 'success');
    });
  }
}

// ========================================
// マイページ
// ========================================

async function loadMyPage() {
  const doc = await db.collection('users').doc(currentUser.uid).get();
  currentUserData = doc.data();
  const d = currentUserData;

  document.getElementById('mypageName').textContent     = d.name;
  document.getElementById('mypageMemberNo').textContent = 'MEMBER #' + (d.memberNumber || '—');

  const rankInfo = calcRank(d.checkInCount || 0);
  document.getElementById('mypageRankRow').innerHTML = `
    <span class="badge badge-blue">${rankInfo.rank}</span>
    <span class="badge badge-purple" style="margin-left:6px;">${d.title || '新参者'}</span>
  `;

  document.getElementById('mypagePoints').textContent      = (d.points || 0).toLocaleString();
  document.getElementById('mypageTotalPoints').textContent  = (d.totalPoints || 0).toLocaleString();
  document.getElementById('mypageChips').textContent       = d.chips || 0;
  document.getElementById('mypageCheckins').textContent    = d.checkInCount || 0;
  document.getElementById('mypageEventJoins').textContent  = d.eventJoinCount || 0;

  // バッジ
  const earnedBadges = d.badges || [];
  document.getElementById('mypageBadges').innerHTML = BADGES_DEF.map(b => `
    <div class="badge-item ${earnedBadges.includes(b.id) ? 'earned' : ''}">
      <span class="badge-icon">${b.icon}</span>
      <span class="badge-name">${b.name}</span>
    </div>
  `).join('');

  // ポイント履歴
  loadPointLogs();
}

async function loadPointLogs() {
  const container = document.getElementById('mypagePointLogs');
  try {
    const snap = await db.collection('pointLogs')
      .where('userId', '==', currentUser.uid)
      .orderBy('createdAt', 'desc')
      .limit(20).get();

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state"><p>履歴はありません</p></div>';
      return;
    }
    container.innerHTML = snap.docs.map(doc => {
      const l = doc.data();
      const plus = l.amount > 0;
      return `
        <div class="log-row">
          <div>
            <div class="${plus ? 'log-amount-pos' : 'log-amount-neg'}">${plus ? '+' : ''}${l.amount}</div>
            <div class="log-reason">${escHtml(l.reason || '')}</div>
          </div>
          <div class="log-time">${formatDate(l.createdAt)}</div>
        </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><p>読み込みエラー</p></div>';
  }
}

// ========================================
// ユーティリティ
// ========================================

function showToast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 3000);
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// モーダル外クリックで閉じる
document.getElementById('eventModal').addEventListener('click', function(e) {
  if (e.target === this) closeEventModal();
});
document.getElementById('qrModal').addEventListener('click', function(e) {
  if (e.target === this) closeQRScanner();
});
