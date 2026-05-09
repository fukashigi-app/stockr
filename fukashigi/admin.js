// ========================================
// FUKASHIGI APP — 管理者用 JavaScript
// ========================================

let adminUser     = null;
let adminUserData = null;
let allMembers    = [];
let allMembersFiltered = [];
let memberFilter  = 'all';
let currentSection = 'dashboard';
let adminChatUnsub = null;

// ========================================
// 認証
// ========================================

auth.onAuthStateChanged(async user => {
  if (!user) { window.location.href = 'index.html'; return; }
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
  if (adminChatUnsub) adminChatUnsub();
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
    notices:   loadAdminNotices,
    chat:      () => loadAdminChat('global', document.querySelector('#adminChatRoomFilter .tag-btn')),
    qr:        generateQR,
  };
  if (loaders[sec]) loaders[sec]();
}

// ========================================
// ダッシュボード
// ========================================

async function loadDashboard() {
  try {
    const [mSnap, eSnap, cSnap] = await Promise.all([
      db.collection('users').get(),
      db.collection('events').get(),
      db.collection('checkins').get(),
    ]);
    const todayCI = cSnap.docs.filter(d => d.data().dateStr === todayStr()).length;
    document.getElementById('dashMembers').textContent       = mSnap.size;
    document.getElementById('dashEvents').textContent        = eSnap.size;
    document.getElementById('dashCheckins').textContent      = cSnap.size;
    document.getElementById('dashTodayCheckins').textContent = todayCI;

    const events = eSnap.docs.map(d => ({ id:d.id, ...d.data() }))
      .sort((a,b) => (b.date||'').localeCompare(a.date||'')).slice(0,5);
    document.getElementById('dashEvents2').innerHTML = !events.length
      ? '<div class="empty-state"><p>イベントがありません</p></div>'
      : events.map(ev => renderAdminEventCard(ev)).join('');
  } catch(e) { console.error(e); }
}

// ========================================
// メンバー管理
// ========================================

async function loadMembers() {
  const c = document.getElementById('memberList');
  try {
    const snap = await db.collection('users').orderBy('createdAt','desc').get();
    allMembers = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    applyMemberFilter();
  } catch { c.innerHTML = '<div class="empty-state"><p>読み込みエラー</p></div>'; }
}

function setMemberFilter(filter, btn) {
  memberFilter = filter;
  document.querySelectorAll('#sec-members .tag-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  applyMemberFilter();
}

function filterMembers() { applyMemberFilter(); }

function applyMemberFilter() {
  const q = (document.getElementById('memberSearch')?.value || '').trim().toLowerCase();
  let list = allMembers;
  if (memberFilter === 'active')    list = list.filter(m => !m.suspended);
  if (memberFilter === 'suspended') list = list.filter(m => m.suspended);
  if (q) list = list.filter(m => (m.name||'').toLowerCase().includes(q) || (m.email||'').includes(q));
  allMembersFiltered = list;
  renderMembers();
}

function renderMembers() {
  const c = document.getElementById('memberList');
  if (!allMembersFiltered.length) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">👤</div><p>メンバーが見つかりません</p></div>';
    return;
  }
  c.innerHTML = allMembersFiltered.map(m => {
    const rankInfo = calcRank(m.checkInCount||0);
    return `<div class="member-row" onclick="openMemberModal('${m.id}')">
      <div class="member-avatar-sm" style="${m.iconUrl?`background-image:url(${m.iconUrl});background-size:cover;background-position:center;`:''}">${m.iconUrl?'':( (m.name||'?').charAt(0) )}</div>
      <div class="member-info">
        <div class="member-name">${escHtml(m.name||'—')}</div>
        <div class="member-sub" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span>${m.memberNumber||''}</span>
          <span class="badge badge-${m.role==='admin'?'gold':'blue'}">${m.role==='admin'?'管理者':'メンバー'}</span>
          <span style="color:${rankInfo.color};font-size:11px;font-weight:700;">${rankInfo.rank}</span>
          ${m.suspended?'<span class="badge-suspended">停止中</span>':''}
        </div>
        <div class="member-sub">来店 ${m.checkInCount||0}回</div>
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
  const rankInfo = calcRank(m.checkInCount||0);
  document.getElementById('memberModalTitle').textContent = m.name||'—';
  document.getElementById('memberModalContent').innerHTML = `
    <div class="divider"></div>
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px;">
      <span class="badge badge-gold">${rankInfo.rank}</span>
      <span class="badge badge-gray">${m.title||'新参者'}</span>
      <span class="badge badge-${m.role==='admin'?'gold':'gray'}">${m.role==='admin'?'管理者':'メンバー'}</span>
      ${m.suspended?'<span class="badge-suspended">停止中</span>':''}
    </div>
    <div class="detail-list" style="margin-bottom:16px;">
      ${adminRow('会員番号', m.memberNumber||'—')}
      ${adminRow('メール', m.email||'—')}
      ${adminRow('ポイント', (m.points||0).toLocaleString()+' pt')}
      ${adminRow('累計ポイント', (m.totalPoints||0).toLocaleString()+' pt')}
      ${adminRow('チップ', m.chips||0)}
      ${adminRow('来店回数', (m.checkInCount||0)+' 回')}
      ${adminRow('イベント参加', (m.eventJoinCount||0)+' 回')}
      ${adminRow('登録日', formatDateOnly(m.createdAt))}
    </div>

    <!-- 権限変更 -->
    <div class="point-form" style="margin-bottom:12px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:10px;color:var(--gold);">権限変更</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-outline btn-sm ${m.role!=='admin'?'btn-ghost':''}"
                onclick="changeRole('${uid}','member')">一般メンバー</button>
        <button class="btn btn-gold btn-sm ${m.role==='admin'?'':'btn-outline'}"
                onclick="changeRole('${uid}','admin')">管理者</button>
      </div>
    </div>

    <!-- アカウント停止 -->
    <div class="point-form" style="margin-bottom:12px;">
      <div style="font-size:13px;font-weight:700;margin-bottom:10px;color:var(--text-muted);">アカウント管理</div>
      ${m.suspended
        ? `<button class="btn btn-outline btn-block btn-sm" onclick="toggleSuspend('${uid}',false)">停止を解除する</button>`
        : `<button class="btn btn-danger btn-block btn-sm" onclick="toggleSuspend('${uid}',true)">アカウントを停止する</button>`
      }
    </div>

    <!-- クイックポイント -->
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
      <input type="text" class="form-input" id="quickPtReason" placeholder="理由" style="margin-bottom:8px;font-size:14px;">
      <button class="btn btn-primary btn-block btn-sm" onclick="quickApplyPoints('${uid}')">実行</button>
    </div>
  `;
  document.getElementById('memberModal').classList.add('open');
}

function closeMemberModal() { document.getElementById('memberModal').classList.remove('open'); }

function adminRow(label, val) {
  return `<div class="detail-row"><span class="label">${escHtml(label)}</span><span class="value" style="font-size:15px;">${escHtml(String(val))}</span></div>`;
}

async function changeRole(uid, role) {
  if (!confirm(`権限を「${role==='admin'?'管理者':'一般メンバー'}」に変更しますか？`)) return;
  await db.collection('users').doc(uid).update({ role });
  const idx = allMembers.findIndex(m => m.id === uid);
  if (idx >= 0) allMembers[idx].role = role;
  closeMemberModal(); applyMemberFilter();
  showToast('権限を変更しました', 'success');
}

async function toggleSuspend(uid, suspend) {
  const action = suspend ? '停止' : '復元';
  if (!confirm(`このアカウントを${action}しますか？`)) return;
  await db.collection('users').doc(uid).update({
    suspended: suspend,
    updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  const idx = allMembers.findIndex(m => m.id === uid);
  if (idx >= 0) allMembers[idx].suspended = suspend;
  closeMemberModal(); applyMemberFilter();
  showToast(`アカウントを${action}しました`, suspend ? 'error' : 'success');
}

async function quickApplyPoints(uid) {
  const amount = parseInt(document.getElementById('quickPtAmt').value);
  const type   = document.getElementById('quickPtType').value;
  const reason = document.getElementById('quickPtReason').value.trim();
  if (!amount || amount <= 0) { showToast('数量を入力してください', 'error'); return; }
  await applyPointsTo(uid, type, amount, reason || '管理者による操作');
  closeMemberModal();
}

// ========================================
// イベント管理
// ========================================

async function loadAdminEvents() {
  const c = document.getElementById('adminEventsList');
  try {
    const snap = await db.collection('events').orderBy('date','desc').get();
    const events = snap.docs.map(d => ({ id:d.id, ...d.data() }));
    c.innerHTML = !events.length
      ? '<div class="empty-state"><p>イベントがありません</p></div>'
      : events.map(ev => `
          <div class="event-card" style="flex-direction:column;">
            ${ev.imageUrl ? `<img src="${ev.imageUrl}" style="width:100%;height:120px;object-fit:cover;border-radius:8px 8px 0 0;">` : ''}
            <div style="display:flex;">
              <div class="event-date-col">
                ${ev.date ? (() => { const d=new Date(ev.date+'T00:00:00'); return `<div class="event-date-month">${d.getMonth()+1}月</div><div class="event-date-day">${d.getDate()}</div>`; })() : '<div class="event-date-day">—</div>'}
              </div>
              <div class="event-info-col">
                <div class="event-card-title">${escHtml(ev.title)}</div>
                <div class="event-card-meta">
                  <span>${categoryLabel(ev.category)}</span>
                  ${ev.startTime?`<span>${ev.startTime}〜${ev.endTime||''}</span>`:''}
                  <span>👥 ${(ev.participants||[]).length}${ev.capacity?'/'+ev.capacity:''}名</span>
                </div>
                <span class="badge ${ev.isPublic?'badge-green':'badge-gray'}">${ev.isPublic?'公開':'非公開'}</span>
              </div>
            </div>
            <div style="display:flex;gap:8px;padding:12px 16px;border-top:1px solid var(--border);">
              <button class="btn btn-outline btn-sm" onclick="toggleEventPublic('${ev.id}',${ev.isPublic})">${ev.isPublic?'非公開にする':'公開する'}</button>
              <button class="btn btn-danger btn-sm" onclick="deleteEvent('${ev.id}')">削除</button>
            </div>
          </div>`).join('');
  } catch { c.innerHTML = '<div class="empty-state"><p>読み込みエラー</p></div>'; }
}

function renderAdminEventCard(ev) {
  return `<div class="event-card" style="cursor:default;">
    <div class="event-date-col">
      ${ev.date ? (() => { const d=new Date(ev.date+'T00:00:00'); return `<div class="event-date-month">${d.getMonth()+1}月</div><div class="event-date-day">${d.getDate()}</div>`; })() : '<div class="event-date-day">—</div>'}
    </div>
    <div class="event-info-col">
      <div class="event-card-title">${escHtml(ev.title)}</div>
      <div class="event-card-meta">
        <span>${categoryLabel(ev.category)}</span>
        <span>👥 ${(ev.participants||[]).length}名</span>
      </div>
      <span class="badge ${ev.isPublic?'badge-green':'badge-gray'}">${ev.isPublic?'公開':'非公開'}</span>
    </div>
  </div>`;
}

function showCreateEventForm() {
  const f = document.getElementById('createEventForm');
  f.style.display = f.style.display === 'none' ? '' : 'none';
  if (!document.getElementById('evDate').value)
    document.getElementById('evDate').value = new Date().toISOString().slice(0,10);
}

async function createEvent() {
  const title = document.getElementById('evTitle').value.trim();
  const date  = document.getElementById('evDate').value;
  if (!title) { showToast('イベント名を入力してください','error'); return; }
  if (!date)  { showToast('開催日を入力してください','error'); return; }
  try {
    await db.collection('events').add({
      title, date,
      category:    document.getElementById('evCategory').value,
      startTime:   document.getElementById('evStartTime').value,
      endTime:     document.getElementById('evEndTime').value,
      fee:         parseInt(document.getElementById('evFee').value)||0,
      capacity:    parseInt(document.getElementById('evCapacity').value)||0,
      description: document.getElementById('evDescription').value.trim(),
      imageUrl:    document.getElementById('evImageUrl').value.trim(),
      isPublic:    document.getElementById('evPublic').checked,
      participants: [],
      createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt:   firebase.firestore.FieldValue.serverTimestamp(),
    });
    showToast('イベントを作成しました','success');
    document.getElementById('createEventForm').style.display = 'none';
    ['evTitle','evDate','evStartTime','evEndTime','evFee','evCapacity','evDescription','evImageUrl']
      .forEach(id => { document.getElementById(id).value=''; });
    loadAdminEvents();
  } catch(e) { showToast('エラー: '+e.message,'error'); }
}

async function toggleEventPublic(id, isPublic) {
  await db.collection('events').doc(id).update({ isPublic: !isPublic });
  showToast(isPublic?'非公開にしました':'公開しました','success');
  loadAdminEvents();
}

async function deleteEvent(id) {
  if (!confirm('このイベントを削除しますか？')) return;
  await db.collection('events').doc(id).delete();
  showToast('削除しました','info');
  loadAdminEvents();
}

// ========================================
// チェックイン履歴
// ========================================

async function loadCheckinHistory() {
  const c = document.getElementById('checkinHistory');
  try {
    const snap = await db.collection('checkins').orderBy('checkedInAt','desc').limit(60).get();
    if (snap.empty) { c.innerHTML = '<div class="empty-state"><p>履歴がありません</p></div>'; return; }
    const today = todayStr();
    c.innerHTML = snap.docs.map(doc => {
      const ci = doc.data();
      return `<div class="checkin-row">
        <div>
          <div class="ci-name">${escHtml(ci.userName||'—')}</div>
          <div class="ci-time">${formatDate(ci.checkedInAt)}</div>
        </div>
        <div style="text-align:right;">
          ${ci.dateStr===today?'<span class="badge badge-green">今日</span>':''}
          ${ci.pointsAdded?`<div style="color:var(--success);font-size:13px;font-weight:700;font-family:'Inter',sans-serif;">+${ci.pointsAdded}pt</div>`:''}
        </div>
      </div>`;
    }).join('');
  } catch { c.innerHTML = '<div class="empty-state"><p>読み込みエラー</p></div>'; }
}

// ========================================
// ポイント管理
// ========================================

async function loadMemberSelect() {
  const sel = document.getElementById('ptMember');
  if (!sel || sel.options.length > 0) return;
  const snap = await db.collection('users').orderBy('name').get();
  sel.innerHTML = snap.docs.map(d => {
    const m = d.data();
    return `<option value="${d.id}">${escHtml(m.name)} (${m.points||0}pt)</option>`;
  }).join('');
}

async function applyPoints() {
  const uid    = document.getElementById('ptMember').value;
  const type   = document.getElementById('ptType').value;
  const amount = parseInt(document.getElementById('ptAmount').value);
  const reason = document.getElementById('ptReason').value.trim();
  if (!uid)             { showToast('メンバーを選択してください','error'); return; }
  if (!amount||amount<=0) { showToast('数量を入力してください','error'); return; }
  await applyPointsTo(uid, type, amount, reason || '管理者による操作');
  document.getElementById('ptAmount').value = '';
  document.getElementById('ptReason').value = '';
  loadPointLog();
}

async function applyPointsTo(uid, type, amount, reason) {
  try {
    const userRef = db.collection('users').doc(uid);
    const userData = (await userRef.get()).data();
    let update = { updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    const sign = type.endsWith('_sub') ? -1 : 1;
    if (type.startsWith('point')) {
      update.points = firebase.firestore.FieldValue.increment(sign * amount);
      if (sign > 0) update.totalPoints = firebase.firestore.FieldValue.increment(amount);
    } else {
      update.chips = firebase.firestore.FieldValue.increment(sign * amount);
    }
    const batch = db.batch();
    batch.update(userRef, update);
    batch.set(db.collection('pointLogs').doc(), {
      userId:    uid,
      userName:  userData.name||'',
      type, amount: sign * amount, reason,
      createdBy: adminUserData.name||'admin',
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    await batch.commit();
    showToast(`${userData.name||'メンバー'} に操作を適用しました`, 'success');
  } catch(e) { showToast('エラー: '+e.message,'error'); }
}

async function loadPointLog() {
  const c = document.getElementById('pointLogList');
  if (!c) return;
  try {
    const snap = await db.collection('pointLogs').orderBy('createdAt','desc').limit(30).get();
    if (snap.empty) { c.innerHTML = '<div class="empty-state"><p>履歴がありません</p></div>'; return; }
    const typeLabel = { point_add:'ポイント付与', point_sub:'ポイント減算', chip_add:'チップ付与', chip_sub:'チップ減算' };
    c.innerHTML = snap.docs.map(doc => {
      const l = doc.data(); const plus = l.amount > 0;
      return `<div class="log-row">
        <div>
          <div style="font-weight:700;font-size:14px;margin-bottom:2px;">${escHtml(l.userName||'—')}</div>
          <div class="log-reason">${typeLabel[l.type]||l.type} — ${escHtml(l.reason||'')}</div>
          <div class="log-time">${formatDate(l.createdAt)} by ${escHtml(l.createdBy||'')}</div>
        </div>
        <div class="${plus?'log-amount-pos':'log-amount-neg'}">${plus?'+':''}${l.amount}</div>
      </div>`;
    }).join('');
  } catch { c.innerHTML = '<div class="empty-state"><p>—</p></div>'; }
}

// ========================================
// お知らせ管理
// ========================================

async function postNotice() {
  const title  = document.getElementById('noticeTitle').value.trim();
  const body   = document.getElementById('noticeBody').value.trim();
  const pinned = document.getElementById('noticePinned').checked;
  if (!title) { showToast('タイトルを入力してください','error'); return; }
  if (!body)  { showToast('本文を入力してください','error'); return; }
  await db.collection('notices').add({
    title, body, pinned,
    createdBy: adminUserData.name||'admin',
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  showToast('投稿しました','success');
  document.getElementById('noticeTitle').value = '';
  document.getElementById('noticeBody').value  = '';
  document.getElementById('noticePinned').checked = false;
  loadAdminNotices();
}

async function loadAdminNotices() {
  const c = document.getElementById('noticeList');
  if (!c) return;
  try {
    const snap = await db.collection('notices')
      .orderBy('pinned','desc').orderBy('createdAt','desc').limit(20).get();
    if (snap.empty) { c.innerHTML = '<div class="empty-state"><p>お知らせはありません</p></div>'; return; }
    c.innerHTML = snap.docs.map(doc => {
      const n = doc.data();
      return `<div class="notice-card ${n.pinned?'pinned':''}">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
          <div>
            ${n.pinned?'<span class="badge badge-gold" style="margin-bottom:6px;display:inline-block;">固定</span>':''}
            <div class="notice-title">${escHtml(n.title)}</div>
            <div class="notice-body">${escHtml(n.body)}</div>
            <div class="notice-meta">${formatDate(n.createdAt)}</div>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0;">
            <button class="btn btn-outline btn-sm" onclick="toggleNoticePinned('${doc.id}',${n.pinned})">${n.pinned?'固定解除':'固定'}</button>
            <button class="btn btn-danger btn-sm" onclick="deleteNotice('${doc.id}')">削除</button>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch {}
}

async function toggleNoticePinned(id, pinned) {
  await db.collection('notices').doc(id).update({ pinned: !pinned });
  showToast(pinned?'固定を解除しました':'固定しました','success');
  loadAdminNotices();
}
async function deleteNotice(id) {
  if (!confirm('削除しますか？')) return;
  await db.collection('notices').doc(id).delete();
  showToast('削除しました','info');
  loadAdminNotices();
}

// ========================================
// チャット管理
// ========================================

async function loadAdminChat(roomId, btn) {
  if (adminChatUnsub) { adminChatUnsub(); adminChatUnsub = null; }
  if (btn) {
    document.querySelectorAll('#adminChatRoomFilter .tag-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  }

  const c = document.getElementById('adminChatList');
  adminChatUnsub = db.collection('chats')
    .where('roomId','==', roomId)
    .orderBy('createdAt','desc').limit(50)
    .onSnapshot(snap => {
      if (snap.empty) { c.innerHTML = '<div class="empty-state"><p>メッセージがありません</p></div>'; return; }
      c.innerHTML = snap.docs.map(doc => {
        const m = doc.data();
        return `<div class="log-row ${m.deleted?'':''}">
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:13px;margin-bottom:2px;${m.deleted?'opacity:0.4;':''}">${escHtml(m.userName||'—')}</div>
            <div style="font-size:14px;${m.deleted?'color:var(--text-muted);font-style:italic;':'color:var(--text-sub);'}">${m.deleted?'[削除済み]':escHtml(m.message||'')}</div>
            ${m.imageUrl&&!m.deleted?`<img src="${m.imageUrl}" style="max-width:120px;border-radius:4px;margin-top:4px;">`:'' }
            <div class="log-time">${formatDate(m.createdAt)}</div>
          </div>
          ${!m.deleted?`<button class="chat-delete-btn" style="font-size:12px;" onclick="adminDeleteMsg('${doc.id}')">削除</button>`:''}
        </div>`;
      }).join('');
    });
}

async function adminDeleteMsg(id) {
  if (!confirm('削除しますか？')) return;
  await db.collection('chats').doc(id).update({ deleted: true });
  showToast('削除しました','info');
}

// ========================================
// QRコード生成
// ========================================

function generateQR() {
  const code = todayCheckinCode();
  const c = document.getElementById('qrCodeDisplay');
  c.innerHTML = '';
  new QRCode(c, { text:code, width:220, height:220,
    colorDark:'#000000', colorLight:'#ffffff',
    correctLevel: QRCode.CorrectLevel.H });
  document.getElementById('qrCodeText').textContent = code;
}

// ========================================
// ユーティリティ
// ========================================

function showToast(msg, type='info') {
  const c  = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`; el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(),300); }, 3500);
}

document.getElementById('memberModal').addEventListener('click', function(e) {
  if (e.target === this) closeMemberModal();
});
