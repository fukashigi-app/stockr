// ========================================
// FUKASHIGI APP — メンバー用 JavaScript
// ========================================

let currentUser     = null;
let currentUserData = null;
let allEvents       = [];
let currentFilter   = 'all';
let qrScanner       = null;

// Chat state
let currentRoomId   = 'global';
let chatUnsubscribe = null;
let chatImageFile   = null;

// Profile edit state
let profileIconFile = null;

// ========================================
// 認証・初期化
// ========================================

auth.onAuthStateChanged(async user => {
  if (!user) { window.location.href = 'index.html'; return; }
  currentUser = user;
  await loadUserData();
  if (!currentUserData) return;

  // 停止アカウントチェック
  if (currentUserData.suspended) {
    await auth.signOut();
    window.location.href = 'index.html?msg=suspended';
    return;
  }
  // 管理者は管理画面へ
  if (currentUserData.role === 'admin') { window.location.href = 'admin.html'; return; }

  renderHomeUserInfo();
  loadHomeData();
  loadEvents();
});

async function loadUserData() {
  const doc = await db.collection('users').doc(currentUser.uid).get();
  if (!doc.exists) {
    const data = {
      uid: currentUser.uid,
      name: currentUser.email.split('@')[0],
      email: currentUser.email,
      iconUrl: '',
      memberNumber: 'F' + String(Date.now()).slice(-6),
      role: 'member',
      points: 0, totalPoints: 0, chips: 0,
      rank: 'ROOKIE', title: '新参者',
      badges: [], checkInCount: 0, eventJoinCount: 0,
      comment: '',
      suspended: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    await db.collection('users').doc(currentUser.uid).set(data);
    currentUserData = data;
  } else {
    currentUserData = doc.data();
    const rankInfo = calcRank(currentUserData.checkInCount || 0);
    const title    = calcTitle(currentUserData.checkInCount || 0);
    if (currentUserData.rank !== rankInfo.rank || currentUserData.title !== title) {
      await db.collection('users').doc(currentUser.uid).update({ rank: rankInfo.rank, title });
      currentUserData.rank  = rankInfo.rank;
      currentUserData.title = title;
    }
  }
}

function doLogout() {
  if (chatUnsubscribe) chatUnsubscribe();
  auth.signOut().then(() => { window.location.href = 'index.html'; });
}

// ========================================
// タブ切り替え
// ========================================

function switchTab(tab) {
  // チャット購読：タブ離脱でも購読は維持（バックグラウンド通知のため）
  document.querySelectorAll('.tab-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('tab-' + tab).classList.add('active');
  document.getElementById('nav-' + tab).classList.add('active');

  if (tab === 'chat') {
    // チャット初回ロード
    if (!chatUnsubscribe) initChat();
    // バッジクリア
    document.getElementById('chatBadge').style.display = 'none';
  }
  if (tab === 'mypage') loadMyPage();

  // チャット以外のタブではmain-contentのスクロールを有効化
  document.querySelector('.main-content').style.overflow =
    tab === 'chat' ? 'hidden' : '';
}

// ========================================
// ホーム
// ========================================

function renderHomeUserInfo() {
  const d = currentUserData;
  document.getElementById('headerUserName').textContent = d.name;
  document.getElementById('homeUserName').textContent   = d.name;

  // アバター
  setAvatarEl(document.getElementById('homeAvatar'), d.iconUrl, d.name);

  const rankInfo = calcRank(d.checkInCount || 0);
  document.getElementById('homeRankRow').innerHTML = `
    <span class="badge badge-gold">${rankInfo.rank}</span>
    <span class="badge badge-gray" style="margin-left:4px;">${d.title || '新参者'}</span>
  `;
  document.getElementById('statPoints').textContent   = (d.points || 0).toLocaleString();
  document.getElementById('statCheckins').textContent = d.checkInCount || 0;
  document.getElementById('statChips').textContent    = d.chips || 0;
}

function loadHomeData() {
  checkTodayCheckIn();
  loadTodayMembers();
  loadNotices();
  loadHomeEvents();
}

async function checkTodayCheckIn() {
  const snap = await db.collection('checkins')
    .where('userId','==', currentUser.uid)
    .where('dateStr','==', todayStr())
    .limit(1).get();
  if (!snap.empty) {
    const btn = document.getElementById('checkinBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="icon">✓</span> 本日チェックイン済み';
    document.getElementById('checkinStatus').textContent = '次のチェックインは明日から可能です';
  }
}

async function loadTodayMembers() {
  const container = document.getElementById('todayMembers');
  try {
    const snap = await db.collection('checkins')
      .where('dateStr','==', todayStr())
      .orderBy('checkedInAt','asc').limit(20).get();
    if (snap.empty) {
      container.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">まだ来店者がいません</div>';
      return;
    }
    container.innerHTML = snap.docs.map(d => {
      const c = d.data();
      const icon = c.userIcon || '';
      return `<div class="today-member-item">
        <div class="today-member-avatar" style="${icon ? `background-image:url(${icon});background-size:cover;background-position:center;` : ''}">
          ${icon ? '' : (c.userName||'?').charAt(0)}
        </div>
        <div class="today-member-name">${escHtml(c.userName||'—')}</div>
      </div>`;
    }).join('');
  } catch { container.innerHTML = '<div style="font-size:13px;color:var(--text-muted);">—</div>'; }
}

async function loadNotices() {
  const c = document.getElementById('homeNotices');
  try {
    const snap = await db.collection('notices')
      .orderBy('pinned','desc').orderBy('createdAt','desc').limit(3).get();
    if (snap.empty) { c.innerHTML = '<div class="empty-state"><p>お知らせはありません</p></div>'; return; }
    c.innerHTML = snap.docs.map(doc => {
      const n = doc.data();
      return `<div class="notice-card ${n.pinned?'pinned':''}">
        ${n.pinned?'<span class="badge badge-gold" style="margin-bottom:8px;display:inline-block;">固定</span>':''}
        <div class="notice-title">${escHtml(n.title)}</div>
        <div class="notice-body">${escHtml(n.body)}</div>
        <div class="notice-meta">${formatDate(n.createdAt)}</div>
      </div>`;
    }).join('');
  } catch { c.innerHTML = '<div class="empty-state"><p>—</p></div>'; }
}

async function loadHomeEvents() {
  const c = document.getElementById('homeEvents');
  try {
    const today = new Date().toISOString().slice(0,10);
    const snap  = await db.collection('events').where('isPublic','==',true)
      .orderBy('date','asc').limit(10).get();
    const upcoming = snap.docs.filter(d => (d.data().date||'') >= today);
    if (!upcoming.length) { c.innerHTML = '<div class="empty-state"><p>予定されているイベントはありません</p></div>'; return; }
    c.innerHTML = upcoming.slice(0,3).map(doc => renderEventCard(doc.id, doc.data())).join('');
  } catch { c.innerHTML = '<div class="empty-state"><p>—</p></div>'; }
}

// ========================================
// イベント
// ========================================

async function loadEvents() {
  const c = document.getElementById('eventsList');
  try {
    const snap = await db.collection('events').where('isPublic','==',true)
      .orderBy('date','desc').get();
    allEvents = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderEventsList();
  } catch { c.innerHTML = '<div class="empty-state"><p>読み込みエラー</p></div>'; }
}

function renderEventsList() {
  const c = document.getElementById('eventsList');
  const filtered = currentFilter === 'all' ? allEvents : allEvents.filter(e => e.category === currentFilter);
  if (!filtered.length) {
    c.innerHTML = '<div class="empty-state"><div class="empty-icon">📅</div><p>該当するイベントはありません</p></div>';
    return;
  }
  c.innerHTML = filtered.map(ev => renderEventCard(ev.id, ev)).join('');
}

function filterEvents(cat, btn) {
  currentFilter = cat;
  document.querySelectorAll('.tag-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderEventsList();
}

function renderEventCard(id, ev) {
  const joined = (ev.participants||[]).includes(currentUser?.uid||'');
  const count  = (ev.participants||[]).length;
  let month='', day='', wd='';
  if (ev.date) {
    const d = new Date(ev.date+'T00:00:00');
    month = (d.getMonth()+1)+'月';
    day   = d.getDate();
    wd    = ['日','月','火','水','木','金','土'][d.getDay()];
  }
  const hasImg = !!ev.imageUrl;
  return `<div class="event-card ${joined?'joined':''} ${hasImg?'event-card-with-image':''} fade-in" onclick="openEventModal('${id}')">
    ${hasImg ? `<img src="${ev.imageUrl}" class="event-image" alt="">` : ''}
    <div class="event-date-col">
      <div class="event-date-month">${month}</div>
      <div class="event-date-day">${day||'—'}</div>
      <div class="event-date-wd">${wd}</div>
    </div>
    <div class="event-info-col">
      <div class="event-card-title">${escHtml(ev.title)}</div>
      <div class="event-card-meta">
        ${ev.startTime?`<span>${ev.startTime}〜${ev.endTime||''}</span>`:''}
        ${ev.fee?`<span>${ev.fee.toLocaleString()}円</span>`:'<span>無料</span>'}
      </div>
      <div class="event-card-footer">
        <span class="participants-count">👥 ${count}${ev.capacity>0?' / '+ev.capacity:''}名</span>
        <span class="badge ${joined?'badge-green':'badge-gray'}">${joined?'参加予定':'未参加'}</span>
      </div>
    </div>
  </div>`;
}

async function openEventModal(eventId) {
  const ev     = allEvents.find(e => e.id === eventId) || {};
  const joined = (ev.participants||[]).includes(currentUser.uid);
  const count  = (ev.participants||[]).length;

  document.getElementById('eventModalTitle').textContent = ev.title || '';
  document.getElementById('eventModalContent').innerHTML = `
    ${ev.imageUrl ? `<img src="${ev.imageUrl}" style="width:100%;border-radius:8px;margin-bottom:16px;max-height:200px;object-fit:cover;">` : ''}
    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;">
      <span class="badge badge-gray">${categoryLabel(ev.category)}</span>
      ${joined?'<span class="badge badge-green">参加予定</span>':''}
    </div>
    <div class="detail-list" style="margin-bottom:16px;">
      ${dRow('開催日', ev.date||'未定')}
      ${dRow('時間', (ev.startTime||'?')+'〜'+(ev.endTime||'?'))}
      ${dRow('参加費', ev.fee?ev.fee.toLocaleString()+'円':'無料')}
      ${dRow('参加者', count+(ev.capacity>0?' / '+ev.capacity:'')+'名')}
    </div>
    ${ev.description?`<div style="background:var(--bg-card2);border-radius:6px;padding:14px;font-size:13px;line-height:1.8;color:var(--text-sub);white-space:pre-line;margin-bottom:18px;">${escHtml(ev.description)}</div>`:''}
    <button class="btn ${joined?'btn-danger':'btn-gold'} btn-block" id="joinCancelBtn"
            onclick="toggleJoin('${eventId}',${joined})">
      ${joined?'参加キャンセル':'参加する'}
    </button>
  `;
  document.getElementById('eventModal').classList.add('open');
}

function dRow(label, val) {
  return `<div class="detail-row"><span class="label">${escHtml(label)}</span><span class="value" style="font-size:15px;">${escHtml(String(val))}</span></div>`;
}
function closeEventModal() { document.getElementById('eventModal').classList.remove('open'); }

async function toggleJoin(eventId, currentlyJoined) {
  const btn = document.getElementById('joinCancelBtn');
  btn.disabled = true;
  try {
    const ref  = db.collection('events').doc(eventId);
    const data = (await ref.get()).data();
    if (!currentlyJoined && data.capacity > 0 && (data.participants||[]).length >= data.capacity) {
      showToast('定員に達しています', 'error'); btn.disabled = false; return;
    }
    const op = currentlyJoined
      ? firebase.firestore.FieldValue.arrayRemove(currentUser.uid)
      : firebase.firestore.FieldValue.arrayUnion(currentUser.uid);
    await ref.update({ participants: op });
    await db.collection('users').doc(currentUser.uid).update({
      eventJoinCount: firebase.firestore.FieldValue.increment(currentlyJoined ? -1 : 1)
    });
    showToast(currentlyJoined ? '参加をキャンセルしました' : '参加登録しました', currentlyJoined ? 'info' : 'success');
    closeEventModal();
    await loadUserData();
    loadEvents(); loadHomeData(); renderHomeUserInfo();
  } catch(e) { showToast('エラー: '+e.message,'error'); btn.disabled = false; }
}

// ========================================
// QRチェックイン
// ========================================

function openQRScanner() {
  document.getElementById('qrModal').classList.add('open');
  document.getElementById('qrMessage').style.display = 'none';
  if (qrScanner) { qrScanner.resume(); return; }
  qrScanner = new Html5Qrcode('qr-reader');
  qrScanner.start({ facingMode:'environment' }, { fps:10, qrbox:{width:180,height:180} },
    onQRSuccess, ()=>{}).catch(() => showQRMessage('カメラを起動できませんでした', 'var(--danger)'));
}

async function onQRSuccess(text) {
  if (text !== todayCheckinCode()) { showQRMessage('無効なQRコードです', 'var(--danger)'); return; }
  if (qrScanner) qrScanner.pause();
  const snap = await db.collection('checkins')
    .where('userId','==',currentUser.uid).where('dateStr','==',todayStr()).limit(1).get();
  if (!snap.empty) { showQRMessage('本日はすでにチェックイン済みです', 'var(--text-muted)'); return; }

  const batch = db.batch();
  batch.set(db.collection('checkins').doc(), {
    userId: currentUser.uid, userName: currentUserData.name,
    userIcon: currentUserData.iconUrl || '',
    dateStr: todayStr(),
    checkedInAt: firebase.firestore.FieldValue.serverTimestamp(),
    eventId: '', pointsAdded: 10, memo: '通常チェックイン',
  });
  batch.update(db.collection('users').doc(currentUser.uid), {
    checkInCount: firebase.firestore.FieldValue.increment(1),
    points:       firebase.firestore.FieldValue.increment(10),
    totalPoints:  firebase.firestore.FieldValue.increment(10),
    updatedAt:    firebase.firestore.FieldValue.serverTimestamp(),
  });
  await batch.commit();
  showQRMessage('チェックイン完了  +10 pt', 'var(--gold)');
  showToast('チェックイン完了！ +10pt', 'success');
  await checkAndAwardBadges();
  setTimeout(() => { closeQRScanner(); loadUserData().then(() => { renderHomeUserInfo(); loadHomeData(); }); }, 2000);
}

function showQRMessage(msg, color) {
  const el = document.getElementById('qrMessage');
  el.textContent = msg; el.style.color = color;
  el.style.background = 'var(--bg-card2)'; el.style.display = 'block';
}
function closeQRScanner() {
  document.getElementById('qrModal').classList.remove('open');
  if (qrScanner) { qrScanner.stop().then(() => { qrScanner = null; document.getElementById('qr-reader').innerHTML = ''; }).catch(()=>{}); }
}

// ========================================
// バッジ付与
// ========================================

const BADGES_DEF = [
  { id:'first_visit',  name:'初来店',      icon:'⭐', condition: d => d.checkInCount >= 1 },
  { id:'visit_5',      name:'5回来店',      icon:'🌟', condition: d => d.checkInCount >= 5 },
  { id:'visit_10',     name:'10回来店',     icon:'💎', condition: d => d.checkInCount >= 10 },
  { id:'visit_30',     name:'30回来店',     icon:'👑', condition: d => d.checkInCount >= 30 },
  { id:'event_join',   name:'イベント参加', icon:'🎮', condition: d => d.eventJoinCount >= 1 },
  { id:'event_5',      name:'5回参加',      icon:'🏆', condition: d => d.eventJoinCount >= 5 },
  { id:'resistance',   name:'レジスタンス', icon:'✊', condition: d => d.checkInCount >= 20 },
  { id:'headquarters', name:'住人',         icon:'🏠', condition: d => d.checkInCount >= 50 },
  { id:'executive',    name:'幹部候補',     icon:'🗝',  condition: d => d.checkInCount >= 30 },
];

async function checkAndAwardBadges() {
  const doc     = await db.collection('users').doc(currentUser.uid).get();
  const data    = doc.data();
  const current = data.badges || [];
  const toAdd   = BADGES_DEF.filter(b => !current.includes(b.id) && b.condition(data)).map(b => b.id);
  if (toAdd.length) {
    await db.collection('users').doc(currentUser.uid).update({
      badges: firebase.firestore.FieldValue.arrayUnion(...toAdd)
    });
    toAdd.forEach(id => {
      const b = BADGES_DEF.find(x => x.id === id);
      if (b) showToast(`バッジ獲得：${b.name}`, 'success');
    });
  }
}

// ========================================
// チャット
// ========================================

async function initChat() {
  await loadChatRooms();
}

async function loadChatRooms() {
  const bar = document.getElementById('chatRoomsBar');
  const rooms = [{ id:'global', name:'全体' }];

  // ユーザーが参加しているイベントのチャットルームを追加
  try {
    const evSnap = await db.collection('events')
      .where('participants','array-contains', currentUser.uid)
      .where('isPublic','==',true)
      .orderBy('date','desc').limit(10).get();
    evSnap.docs.forEach(doc => {
      rooms.push({ id:'event_'+doc.id, name: doc.data().title });
    });
  } catch {}

  bar.innerHTML = rooms.map(r => `
    <button class="chat-room-btn ${r.id===currentRoomId?'active':''}"
            onclick="switchChatRoom('${r.id}',this)">${escHtml(r.name)}</button>
  `).join('');

  subscribeToRoom(currentRoomId);
}

function switchChatRoom(roomId, btn) {
  if (chatUnsubscribe) { chatUnsubscribe(); chatUnsubscribe = null; }
  currentRoomId = roomId;
  document.querySelectorAll('.chat-room-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('chatMessages').innerHTML =
    '<div class="chat-empty"><div class="chat-empty-icon">💬</div><div>読み込み中…</div></div>';
  subscribeToRoom(roomId);
}

function subscribeToRoom(roomId) {
  chatUnsubscribe = db.collection('chats')
    .where('roomId','==', roomId)
    .where('deleted','==', false)
    .orderBy('createdAt','asc')
    .limit(100)
    .onSnapshot(snap => renderMessages(snap.docs), err => console.warn(err));
}

function renderMessages(docs) {
  const c = document.getElementById('chatMessages');
  if (!docs.length) {
    c.innerHTML = '<div class="chat-empty"><div class="chat-empty-icon">💬</div><div>まだメッセージがありません</div></div>';
    return;
  }
  let html = '';
  let lastDate = '';
  docs.forEach(doc => {
    const msg = doc.data();
    const ts  = msg.createdAt?.toDate ? msg.createdAt.toDate() : new Date();
    const dateStr = ts.toLocaleDateString('ja-JP');
    if (dateStr !== lastDate) {
      html += `<div class="chat-date-sep">${dateStr}</div>`;
      lastDate = dateStr;
    }
    html += renderMessage(doc.id, msg, ts);
  });
  c.innerHTML = html;
  c.scrollTop = c.scrollHeight;
}

function renderMessage(id, msg, tsDate) {
  const isSent  = msg.userId === currentUser.uid;
  const isAdmin = currentUserData?.role === 'admin';
  const icon    = msg.userIcon || '';
  const initial = (msg.userName||'?').charAt(0);
  const timeStr = formatTime(msg.createdAt);

  const avatarHtml = `<div class="chat-avatar-sm"
    style="${icon ? `background-image:url(${icon});background-size:cover;background-position:center;` : ''}">
    ${icon ? '' : escHtml(initial)}
  </div>`;

  const bubbleContent = `
    ${msg.message ? `<div>${escHtml(msg.message)}</div>` : ''}
    ${msg.imageUrl ? `<img src="${msg.imageUrl}" alt="" style="max-width:200px;border-radius:6px;${msg.message?'margin-top:8px':''}">` : ''}
    <div class="chat-time">${timeStr}</div>
  `;

  return `<div class="chat-bubble-wrap ${isSent?'sent':'received'}">
    ${!isSent ? avatarHtml : ''}
    <div class="chat-msg-group">
      ${!isSent ? `<div class="chat-sender-name">${escHtml(msg.userName||'—')}</div>` : ''}
      <div class="chat-bubble ${isSent?'sent':'received'}">${bubbleContent}</div>
      ${isAdmin ? `<button class="chat-delete-btn" onclick="deleteMessage('${id}')">削除</button>` : ''}
    </div>
  </div>`;
}

async function sendMessage() {
  const text = document.getElementById('chatTextInput').value.trim();
  if (!text && !chatImageFile) return;

  const btn = document.getElementById('chatSendBtn');
  btn.disabled = true;

  try {
    let imageUrl = '';
    if (chatImageFile) {
      // Storage アップロード
      const path = `chat_images/${currentUser.uid}/${Date.now()}_${chatImageFile.name}`;
      const ref  = storage.ref(path);
      const task = ref.put(chatImageFile);

      // 進捗表示
      const progWrap = document.getElementById('chatUploadProgress');
      const progBar  = document.getElementById('chatUploadProgressBar');
      progWrap.classList.add('show');
      task.on('state_changed', snap => {
        progBar.style.width = (snap.bytesTransferred / snap.totalBytes * 100) + '%';
      });
      await task;
      imageUrl = await ref.getDownloadURL();
      progWrap.classList.remove('show');
      progBar.style.width = '0%';
    }

    await db.collection('chats').add({
      roomId:   currentRoomId,
      userId:   currentUser.uid,
      userName: currentUserData.name,
      userIcon: currentUserData.iconUrl || '',
      message:  text,
      imageUrl,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      deleted:   false,
    });

    document.getElementById('chatTextInput').value = '';
    clearImageAttach();
  } catch(e) {
    showToast('送信エラー: ' + e.message, 'error');
  }
  btn.disabled = false;
}

function attachImage(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) { showToast('5MB以下の画像を選択してください', 'error'); return; }
  chatImageFile = file;
  const thumb = document.getElementById('chatImageThumb');
  thumb.src = URL.createObjectURL(file);
  document.getElementById('chatImagePreview').style.display = 'flex';
  event.target.value = '';
}

function clearImageAttach() {
  chatImageFile = null;
  document.getElementById('chatImagePreview').style.display = 'none';
  document.getElementById('chatImageThumb').src = '';
}

async function deleteMessage(id) {
  if (!confirm('このメッセージを削除しますか？')) return;
  try {
    await db.collection('chats').doc(id).update({ deleted: true });
    showToast('削除しました', 'info');
  } catch(e) { showToast('エラー: '+e.message,'error'); }
}

// ========================================
// マイページ
// ========================================

async function loadMyPage() {
  const doc = await db.collection('users').doc(currentUser.uid).get();
  currentUserData = doc.data();
  const d = currentUserData;

  setAvatarEl(document.getElementById('mypageAvatar'), d.iconUrl, d.name);
  document.getElementById('mypageName').textContent     = d.name;
  document.getElementById('mypageMemberNo').textContent = 'MEMBER #'+(d.memberNumber||'—');

  const rankInfo = calcRank(d.checkInCount||0);
  document.getElementById('mypageRankRow').innerHTML = `
    <span class="badge badge-gold">${rankInfo.rank}</span>
    <span class="badge badge-gray" style="margin-left:6px;">${d.title||'新参者'}</span>
  `;

  document.getElementById('mypagePoints').textContent     = (d.points||0).toLocaleString();
  document.getElementById('mypageTotalPoints').textContent = (d.totalPoints||0).toLocaleString();
  document.getElementById('mypageChips').textContent      = d.chips||0;
  document.getElementById('mypageCheckins').textContent   = d.checkInCount||0;
  document.getElementById('mypageEventJoins').textContent = d.eventJoinCount||0;
  document.getElementById('mypageComment').textContent    = d.comment || '（自己紹介未設定）';

  const earned = d.badges || [];
  document.getElementById('mypageBadges').innerHTML = BADGES_DEF.map(b => `
    <div class="badge-item ${earned.includes(b.id)?'earned':''}">
      <span class="badge-icon">${b.icon}</span>
      <span class="badge-name">${b.name}</span>
    </div>
  `).join('');

  loadPointLogs();
}

async function loadPointLogs() {
  const c = document.getElementById('mypagePointLogs');
  try {
    const snap = await db.collection('pointLogs')
      .where('userId','==', currentUser.uid)
      .orderBy('createdAt','desc').limit(20).get();
    if (snap.empty) { c.innerHTML = '<div class="empty-state"><p>履歴はありません</p></div>'; return; }
    c.innerHTML = snap.docs.map(doc => {
      const l = doc.data();
      const plus = l.amount > 0;
      return `<div class="log-row">
        <div>
          <div class="${plus?'log-amount-pos':'log-amount-neg'}">${plus?'+':''}${l.amount}</div>
          <div class="log-reason">${escHtml(l.reason||'')}</div>
        </div>
        <div class="log-time">${formatDate(l.createdAt)}</div>
      </div>`;
    }).join('');
  } catch { c.innerHTML = '<div class="empty-state"><p>—</p></div>'; }
}

// ========================================
// プロフィール編集
// ========================================

function openEditProfile() {
  const d = currentUserData;
  document.getElementById('editName').value    = d.name || '';
  document.getElementById('editComment').value = d.comment || '';
  profileIconFile = null;

  // アバタープレビューを現在の状態に
  const preview = document.getElementById('editAvatarPreview');
  if (d.iconUrl) {
    preview.style.backgroundImage = `url(${d.iconUrl})`;
    preview.style.backgroundSize  = 'cover';
    preview.textContent = '';
  } else {
    preview.style.backgroundImage = '';
    preview.textContent = d.name ? d.name.charAt(0) : '👤';
  }
  document.getElementById('profileEditModal').classList.add('open');
}

function closeEditProfile() {
  document.getElementById('profileEditModal').classList.remove('open');
  document.getElementById('iconFileInput').value = '';
  profileIconFile = null;
}

function previewIcon(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 3 * 1024 * 1024) { showToast('3MB以下の画像を選択してください', 'error'); return; }
  profileIconFile = file;
  const preview = document.getElementById('editAvatarPreview');
  preview.style.backgroundImage = `url(${URL.createObjectURL(file)})`;
  preview.style.backgroundSize  = 'cover';
  preview.textContent = '';
}

async function saveProfile() {
  const name    = document.getElementById('editName').value.trim();
  const comment = document.getElementById('editComment').value.trim();
  if (!name) { showToast('名前を入力してください', 'error'); return; }

  const btn = document.getElementById('saveProfileBtn');
  btn.disabled = true; btn.textContent = '保存中…';

  try {
    const updateData = { name, comment, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

    if (profileIconFile) {
      const progWrap = document.getElementById('profileUploadProgress');
      const progBar  = document.getElementById('profileUploadProgressBar');
      progWrap.classList.add('show');

      const path = `avatars/${currentUser.uid}/icon`;
      const ref  = storage.ref(path);
      const task = ref.put(profileIconFile);
      task.on('state_changed', snap => {
        progBar.style.width = (snap.bytesTransferred / snap.totalBytes * 100) + '%';
      });
      await task;
      updateData.iconUrl = await ref.getDownloadURL();
      progWrap.classList.remove('show');
      progBar.style.width = '0%';
    }

    await db.collection('users').doc(currentUser.uid).update(updateData);
    currentUserData = { ...currentUserData, ...updateData };

    showToast('プロフィールを更新しました', 'success');
    closeEditProfile();
    renderHomeUserInfo();
    // マイページも更新（開いていれば）
    if (document.getElementById('tab-mypage').classList.contains('active')) loadMyPage();
  } catch(e) {
    showToast('更新エラー: ' + e.message, 'error');
  }
  btn.disabled = false; btn.textContent = '保存する';
}

// ========================================
// ユーティリティ
// ========================================

function setAvatarEl(el, iconUrl, name) {
  if (iconUrl) {
    el.style.backgroundImage  = `url(${iconUrl})`;
    el.style.backgroundSize   = 'cover';
    el.style.backgroundPosition = 'center';
    el.textContent = '';
  } else {
    el.style.backgroundImage = '';
    el.textContent = name ? name.charAt(0) : '👤';
  }
}

function showToast(msg, type = 'info') {
  const c  = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 300); }, 3000);
}

// モーダル外クリックで閉じる
['eventModal','qrModal','profileEditModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', function(e) {
    if (e.target === this) {
      if (id === 'qrModal') closeQRScanner();
      else this.classList.remove('open');
    }
  });
});
