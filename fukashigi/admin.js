// ========================================
// FUKASHIGI APP — 管理者用 JavaScript
// ========================================

let adminUser     = null;
let adminUserData = null;
let allMembers    = [];
let allMembersFiltered = [];
let currentSection = 'dashboard';

// ========================================
// 初期化・認証
// ========================================

auth.onAuthStateChanged(async user => {
  if (!user) {
    window.location.href = 'index.html';
    return;
  }
  adminUser = user;

  const doc = await db.collection('users').doc(user.uid).get();
  if (!doc.exists || doc.data().role !== 'admin') {
    showToast('管理者権限がありません', 'error');
    setTimeout(() => { window.location.href = 'app.html'; }, 1500);
    return;
  }
  adminUserData = doc.data();
  loadDashboard();
});

function doLogout() {
  auth.signOut().then(() => { window.location.href = 'index.html'; });
}

// ========================================
// セクション切り替え
// ========================================

function switchSection(sec, btn) {
  document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('sec-' + sec).classList.add('active');
  if (btn) btn.classList.add('active');
  currentSection = sec;

  const loaders = {
    dashboard: loadDashboard,
    members:   loadMembers,
    events:    loadAdminEvents,
    checkins:  loadCheckinHistory,
    points:    () => { loadPointLog(); loadMemberSelect(); },
    notices:   loadNotices,
    qr:        generateQR,
  };
  if (loaders[sec]) loaders[sec]();
}

// ========================================
// ダッシュボード
// ========================================

async function loadDashboard() {
  try {
    const [membersSnap, eventsSnap, checkinsSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('events').get(),
      db.collection('checkins').get(),
    ]);

    const today = todayStr();
    const todayCheckins = checkinsSnap.docs.filter(d => d.data().dateStr === today).length;

    document.getElementById('dashMembers').textContent      = membersSnap.size;
    document.getElementById('dashEvents').textContent       = eventsSnap.size;
    document.getElementById('dashCheckins').textContent     = checkinsSnap.size;
    document.getElementById('dashTodayCheckins').textContent = todayCheckins;

    // 直近イベント
    const events = eventsSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => (b.date || '').localeCompare(a.date || ''))
      .slice(0, 5);

    document.getElementById('dashEvents2').innerHTML = events.length === 0
      ? '<div class="empty-state"><p>イベントがありません</p></div>'
      : events.map(ev => {
          const d = ev.date ? new Date(ev.date + 'T00:00:00') : null;
          const month = d ? (d.getMonth()+1)+'月' : '';
          const day   = d ? d.getDate() : '—';
          return `
          <div class="event-card" style="cursor:default;">
            <div class="event-date-col">
              <div class="event-date-month">${month}</div>
              <div class="event-date-day">${day}</div>
            </div>
            <div class="event-info-col">
              <div class="event-card-title">${escHtml(ev.title)}</div>
              <div class="event-card-meta">
                <span>${categoryLabel(ev.category)}</span>
                <span>👥 ${(ev.participants||[]).length}${ev.capacity ? ' / ' + ev.capacity : ''}名</span>
              </div>
              <div><span class="badge ${ev.isPublic ? 'badge-green' : 'badge-gray'}">${ev.isPublic ? '公開' : '非公開'}</span></div>
            </div>
          </div>`;
        }).join('');
  } catch (e) {
    console.error(e);
  }
}

// ========================================
// メンバー管理
// ========================================

async function loadMembers() {
  const container = document.getElementById('memberList');
  try {
    const snap = await db.collection('users').orderBy('createdAt', 'desc').get();
    allMembers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    allMembersFiltered = [...allMembers];
    renderMembers();
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><p>読み込みエラー</p></div>';
  }
}

function filterMembers() {
  const q = document.getElementById('memberSearch').value.trim().toLowerCase();
  allMembersFiltered = q
    ? allMembers.filter(m => (m.name || '').toLowerCase().includes(q) || (m.email || '').includes(q))
    : [...allMembers];
  renderMembers();
}

function renderMembers() {
  const container = document.getElementById('memberList');
  if (allMembersFiltered.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><p>メンバーが見つかりません</p></div>';
    return;
  }
  container.innerHTML = allMembersFiltered.map(m => {
    const rankInfo = calcRank(m.checkInCount || 0);
    return `
      <div class="member-row" onclick="openMemberModal('${m.id}')">
        <div class="member-avatar-sm">👤</div>
        <div class="member-info">
          <div class="member-name">${escHtml(m.name || '—')}</div>
          <div class="member-sub">
            ${m.memberNumber || ''} &nbsp;•&nbsp;
            <span class="badge badge-${m.role==='admin'?'gold':'blue'}">${m.role==='admin'?'管理者':'メンバー'}</span>
            &nbsp;
            <span style="color:${rankInfo.color};font-size:11px;font-weight:700;">${rankInfo.rank}</span>
          </div>
          <div class="member-sub" style="margin-top:2px;">来店 ${m.checkInCount||0}回</div>
        </div>
        <div class="member-points">
          <div class="pts">${(m.points||0).toLocaleString()}</div>
          <div class="pts-label">pt</div>
        </div>
      </div>`;
  }).join('');
}

function openMemberModal(uid) {
  const m = allMembers.find(x => x.id === uid);
  if (!m) return;
  const rankInfo = calcRank(m.checkInCount || 0);

  document.getElementById('memberModalTitle').textContent = m.name || '—';
  document.getElementById('memberModalContent').innerHTML = `
    <div class="divider"></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
      <span class="badge badge-gold">${rankInfo.rank}</span>
      <span class="badge badge-gray">${m.title || '新参者'}</span>
      <span class="badge badge-${m.role==='admin'?'gold':'gray'}">${m.role==='admin'?'管理者':'メンバー'}</span>
    </div>
    <div class="detail-list" style="margin-bottom:16px;">
      ${adminRow('会員番号', m.memberNumber || '—')}
      ${adminRow('メール', m.email || '—')}
      ${adminRow('ポイント', (m.points||0).toLocaleString() + ' pt')}
      ${adminRow('累計ポイント', (m.totalPoints||0).toLocaleString() + ' pt')}
      ${adminRow('チップ', m.chips || 0)}
      ${adminRow('来店回数', (m.checkInCount||0) + ' 回')}
      ${adminRow('イベント参加', (m.eventJoinCount||0) + ' 回')}
    </div>

    <!-- 権限変更 -->
    <div class="point-form" style="margin-bottom:12px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:10px;color:var(--gold);">権限変更</div>
      <div style="display:flex;gap:8px;">
        <button class="btn btn-outline btn-sm ${m.role!=='admin'?'':'btn-ghost'}"
                onclick="changeRole('${uid}','member')">一般メンバー</button>
        <button class="btn btn-gold btn-sm ${m.role==='admin'?'':'btn-outline'}"
                onclick="changeRole('${uid}','admin')">管理者に変更</button>
      </div>
    </div>

    <!-- クイックポイント付与 -->
    <div class="point-form">
      <div style="font-size:13px;font-weight:700;margin-bottom:10px;color:var(--gold);">ポイント付与</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px;">
        <input type="number" class="form-input" id="quickPtAmt" placeholder="100" style="font-size:14px;">
        <div class="select-wrap">
          <select class="form-select" id="quickPtType" style="font-size:14px;">
            <option value="point_add">ポイント付与</option>
            <option value="point_sub">ポイント減算</option>
            <option value="chip_add">チップ付与</option>
            <option value="chip_sub">チップ減算</option>
          </select>
        </div>
      </div>
      <input type="text" class="form-input" id="quickPtReason" placeholder="理由（例：大会優勝）" style="margin-bottom:8px;font-size:14px;">
      <button class="btn btn-primary btn-block btn-sm" onclick="quickApplyPoints('${uid}')">実行</button>
    </div>
  `;
  document.getElementById('memberModal').classList.add('open');
}

function closeMemberModal() {
  document.getElementById('memberModal').classList.remove('open');
}

function adminRow(label, val) {
  return `<div class="detail-row">
    <span class="label">${escHtml(label)}</span>
    <span class="value" style="font-size:15px;">${escHtml(String(val))}</span>
  </div>`;
}

async function changeRole(uid, role) {
  if (!confirm(`権限を「${role==='admin'?'管理者':'一般メンバー'}」に変更しますか？`)) return;
  try {
    await db.collection('users').doc(uid).update({ role });
    const idx = allMembers.findIndex(m => m.id === uid);
    if (idx >= 0) allMembers[idx].role = role;
    closeMemberModal();
    renderMembers();
    showToast('権限を変更しました', 'success');
  } catch (e) {
    showToast('エラー: ' + e.message, 'error');
  }
}

async function quickApplyPoints(uid) {
  const amount  = parseInt(document.getElementById('quickPtAmt').value);
  const type    = document.getElementById('quickPtType').value;
  const reason  = document.getElementById('quickPtReason').value.trim();

  if (!amount || amount <= 0) { showToast('数量を入力してください', 'error'); return; }

  await applyPointsTo(uid, type, amount, reason || '管理者による操作');
  closeMemberModal();
}

// ========================================
// イベント管理
// ========================================

async function loadAdminEvents() {
  const container = document.getElementById('adminEventsList');
  try {
    const snap = await db.collection('events').orderBy('date', 'desc').get();
    const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (events.length === 0) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>イベントがありません</p></div>';
      return;
    }
    container.innerHTML = events.map(ev => {
      const d = ev.date ? new Date(ev.date + 'T00:00:00') : null;
      const month = d ? (d.getMonth()+1)+'月' : '';
      const day   = d ? d.getDate() : '—';
      return `
      <div class="event-card" style="display:flex;flex-direction:column;">
        <div style="display:flex;">
          <div class="event-date-col">
            <div class="event-date-month">${month}</div>
            <div class="event-date-day">${day}</div>
          </div>
          <div class="event-info-col">
            <div class="event-card-title">${escHtml(ev.title)}</div>
            <div class="event-card-meta">
              <span>${categoryLabel(ev.category)}</span>
              ${ev.startTime ? `<span>${ev.startTime}〜${ev.endTime||''}</span>` : ''}
              <span>${ev.fee ? ev.fee.toLocaleString()+'円' : '無料'}</span>
              <span>👥 ${(ev.participants||[]).length}${ev.capacity?'/'+ev.capacity:''}名</span>
            </div>
            <span class="badge ${ev.isPublic ? 'badge-green' : 'badge-gray'}">${ev.isPublic ? '公開' : '非公開'}</span>
          </div>
        </div>
        <div style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--border);">
          <button class="btn btn-outline btn-sm" onclick="toggleEventPublic('${ev.id}', ${ev.isPublic})">
            ${ev.isPublic ? '非公開にする' : '公開する'}
          </button>
          <button class="btn btn-danger btn-sm" onclick="deleteEvent('${ev.id}')">削除</button>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><p>読み込みエラー</p></div>';
  }
}

function showCreateEventForm() {
  const form = document.getElementById('createEventForm');
  form.style.display = form.style.display === 'none' ? '' : 'none';
  // 今日の日付をデフォルトに
  if (!document.getElementById('evDate').value) {
    document.getElementById('evDate').value = new Date().toISOString().slice(0,10);
  }
}

async function createEvent() {
  const title    = document.getElementById('evTitle').value.trim();
  const date     = document.getElementById('evDate').value;
  const category = document.getElementById('evCategory').value;

  if (!title) { showToast('イベント名を入力してください', 'error'); return; }
  if (!date)  { showToast('開催日を入力してください', 'error'); return; }

  try {
    const data = {
      title,
      date,
      category,
      startTime:   document.getElementById('evStartTime').value,
      endTime:     document.getElementById('evEndTime').value,
      fee:         parseInt(document.getElementById('evFee').value) || 0,
      capacity:    parseInt(document.getElementById('evCapacity').value) || 0,
      description: document.getElementById('evDescription').value.trim(),
      isPublic:    document.getElementById('evPublic').checked,
      participants: [],
      createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('events').add(data);
    showToast('イベントを作成しました', 'success');
    document.getElementById('createEventForm').style.display = 'none';
    // フォームリセット
    ['evTitle','evDate','evStartTime','evEndTime','evFee','evCapacity','evDescription'].forEach(id => {
      document.getElementById(id).value = '';
    });
    loadAdminEvents();
  } catch (e) {
    showToast('エラー: ' + e.message, 'error');
  }
}

async function toggleEventPublic(id, isPublic) {
  try {
    await db.collection('events').doc(id).update({ isPublic: !isPublic });
    showToast(isPublic ? '非公開にしました' : '公開しました', 'success');
    loadAdminEvents();
  } catch (e) {
    showToast('エラー: ' + e.message, 'error');
  }
}

async function deleteEvent(id) {
  if (!confirm('このイベントを削除しますか？')) return;
  try {
    await db.collection('events').doc(id).delete();
    showToast('削除しました', 'info');
    loadAdminEvents();
  } catch (e) {
    showToast('エラー: ' + e.message, 'error');
  }
}

// ========================================
// チェックイン履歴
// ========================================

async function loadCheckinHistory() {
  const container = document.getElementById('checkinHistory');
  try {
    const snap = await db.collection('checkins')
      .orderBy('checkedInAt', 'desc')
      .limit(50).get();

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state"><div class="empty-icon">📍</div><p>チェックイン履歴がありません</p></div>';
      return;
    }

    const today = todayStr();
    container.innerHTML = snap.docs.map(doc => {
      const c = doc.data();
      const isToday = c.dateStr === today;
      return `
        <div class="checkin-row">
          <div>
            <div class="ci-name">${escHtml(c.userName || '—')}</div>
            <div class="ci-time">${formatDate(c.checkedInAt)}</div>
            ${c.memo ? `<div class="ci-time">${escHtml(c.memo)}</div>` : ''}
          </div>
          <div style="text-align:right;">
            ${isToday ? '<span class="badge badge-green">今日</span>' : ''}
            ${c.pointsAdded ? `<div style="color:var(--success);font-size:13px;font-weight:700;">+${c.pointsAdded}pt</div>` : ''}
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><p>読み込みエラー</p></div>';
  }
}

// ========================================
// ポイント管理
// ========================================

async function loadMemberSelect() {
  const sel = document.getElementById('ptMember');
  if (!sel || sel.options.length > 0) return;
  try {
    const snap = await db.collection('users').orderBy('name').get();
    sel.innerHTML = snap.docs.map(d => {
      const m = d.data();
      return `<option value="${d.id}">${escHtml(m.name)} (${m.points||0}pt)</option>`;
    }).join('');
  } catch (e) {}
}

async function applyPoints() {
  const uid    = document.getElementById('ptMember').value;
  const type   = document.getElementById('ptType').value;
  const amount = parseInt(document.getElementById('ptAmount').value);
  const reason = document.getElementById('ptReason').value.trim();

  if (!uid)    { showToast('メンバーを選択してください', 'error'); return; }
  if (!amount || amount <= 0) { showToast('数量を入力してください', 'error'); return; }

  await applyPointsTo(uid, type, amount, reason || '管理者による操作');

  // フォームリセット
  document.getElementById('ptAmount').value = '';
  document.getElementById('ptReason').value = '';
  loadPointLog();
}

async function applyPointsTo(uid, type, amount, reason) {
  try {
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    const userData = userDoc.data();

    let updateData = {};
    if (type === 'point_add') {
      updateData = {
        points:      firebase.firestore.FieldValue.increment(amount),
        totalPoints: firebase.firestore.FieldValue.increment(amount),
      };
    } else if (type === 'point_sub') {
      updateData = { points: firebase.firestore.FieldValue.increment(-amount) };
    } else if (type === 'chip_add') {
      updateData = { chips: firebase.firestore.FieldValue.increment(amount) };
    } else if (type === 'chip_sub') {
      updateData = { chips: firebase.firestore.FieldValue.increment(-amount) };
    }
    updateData.updatedAt = firebase.firestore.FieldValue.serverTimestamp();

    const finalAmount = type.endsWith('_sub') ? -amount : amount;

    const batch = db.batch();
    batch.update(userRef, updateData);
    batch.set(db.collection('pointLogs').doc(), {
      userId:    uid,
      userName:  userData.name || '',
      type,
      amount:    finalAmount,
      reason,
      createdBy: adminUserData.name || 'admin',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();

    showToast(`${userData.name || 'メンバー'} に操作を適用しました`, 'success');
    return true;
  } catch (e) {
    showToast('エラー: ' + e.message, 'error');
    return false;
  }
}

async function loadPointLog() {
  const container = document.getElementById('pointLogList');
  if (!container) return;
  try {
    const snap = await db.collection('pointLogs')
      .orderBy('createdAt', 'desc')
      .limit(30).get();

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state"><p>履歴がありません</p></div>';
      return;
    }
    container.innerHTML = snap.docs.map(doc => {
      const l = doc.data();
      const plus = l.amount > 0;
      const typeLabel = {
        point_add:'ポイント付与', point_sub:'ポイント減算',
        chip_add:'チップ付与',   chip_sub:'チップ減算'
      }[l.type] || l.type;
      return `
        <div class="log-row">
          <div>
            <div style="font-weight:700;font-size:14px;margin-bottom:2px;">${escHtml(l.userName||'—')}</div>
            <div style="font-size:12px;color:var(--text-muted);">${typeLabel} — ${escHtml(l.reason||'')}</div>
            <div class="log-time">${formatDate(l.createdAt)} by ${escHtml(l.createdBy||'')}</div>
          </div>
          <div class="${plus?'log-amount-pos':'log-amount-neg'}">${plus?'+':''}${l.amount}</div>
        </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><p>読み込みエラー</p></div>';
  }
}

// ========================================
// お知らせ管理
// ========================================

async function postNotice() {
  const title  = document.getElementById('noticeTitle').value.trim();
  const body   = document.getElementById('noticeBody').value.trim();
  const pinned = document.getElementById('noticePinned').checked;

  if (!title) { showToast('タイトルを入力してください', 'error'); return; }
  if (!body)  { showToast('本文を入力してください', 'error'); return; }

  try {
    await db.collection('notices').add({
      title, body, pinned,
      createdBy: adminUserData.name || 'admin',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('投稿しました', 'success');
    document.getElementById('noticeTitle').value = '';
    document.getElementById('noticeBody').value  = '';
    document.getElementById('noticePinned').checked = false;
    loadNotices();
  } catch (e) {
    showToast('エラー: ' + e.message, 'error');
  }
}

async function loadNotices() {
  const container = document.getElementById('noticeList');
  if (!container) return;
  try {
    const snap = await db.collection('notices')
      .orderBy('pinned', 'desc')
      .orderBy('createdAt', 'desc')
      .limit(20).get();

    if (snap.empty) {
      container.innerHTML = '<div class="empty-state"><p>お知らせはありません</p></div>';
      return;
    }
    container.innerHTML = snap.docs.map(doc => {
      const n = doc.data();
      return `
        <div class="notice-card ${n.pinned?'pinned':''}">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div>
              ${n.pinned ? '<span class="badge badge-gold" style="margin-bottom:6px;display:inline-block;">📌 固定</span>' : ''}
              <div class="notice-title">${escHtml(n.title)}</div>
              <div class="notice-body">${escHtml(n.body)}</div>
              <div class="notice-meta">${formatDate(n.createdAt)} — ${escHtml(n.createdBy||'')}</div>
            </div>
            <div style="display:flex;gap:6px;flex-shrink:0;">
              <button class="btn btn-outline btn-sm" onclick="toggleNoticePinned('${doc.id}',${n.pinned})">
                ${n.pinned ? '固定解除' : '固定'}
              </button>
              <button class="btn btn-danger btn-sm" onclick="deleteNotice('${doc.id}')">削除</button>
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = '<div class="empty-state"><p>読み込みエラー</p></div>';
  }
}

async function toggleNoticePinned(id, pinned) {
  await db.collection('notices').doc(id).update({ pinned: !pinned });
  showToast(pinned ? '固定を解除しました' : '固定しました', 'success');
  loadNotices();
}

async function deleteNotice(id) {
  if (!confirm('このお知らせを削除しますか？')) return;
  await db.collection('notices').doc(id).delete();
  showToast('削除しました', 'info');
  loadNotices();
}

// ========================================
// QRコード生成
// ========================================

function generateQR() {
  const code = todayCheckinCode();
  const container = document.getElementById('qrCodeDisplay');
  container.innerHTML = '';

  new QRCode(container, {
    text:   code,
    width:  220,
    height: 220,
    colorDark:  '#000000',
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.H
  });

  document.getElementById('qrCodeText').textContent = code;
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
  }, 3500);
}

function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// モーダル外クリックで閉じる
document.getElementById('memberModal').addEventListener('click', function(e) {
  if (e.target === this) closeMemberModal();
});
