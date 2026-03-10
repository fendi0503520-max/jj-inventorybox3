// ============================================================
//  JJ 庫存管理系統 — 共用資料層 v2.0
//  新增：登入失敗鎖定、Session逾時、角色存取控制、密碼修改
// ============================================================
const JJ = (() => {
  const KEYS = {
    products: 'jj_products',
    logs:     'jj_logs',
    user:     'jj_current_user',
    session:  'jj_session_time',
    locks:    'jj_login_locks',
    users:    'jj_users',
  };

  const SESSION_TIMEOUT = 30 * 60 * 1000; // 30 分鐘
  const MAX_FAIL = 5;                       // 失敗幾次鎖定
  const LOCK_DURATION = 15 * 60 * 1000;    // 鎖定 15 分鐘

  // ── 角色可存取頁面清單 ──
  const ROLE_ACCESS = {
    '系統管理員': ['*'], // 全部
    '倉管人員': [
      'jj-dashboard','jj-products','jj-stock',
      'jj-inbound','jj-outbound','jj-transfer','jj-logs',
      'jj-alerts','jj-inventory','jj-reports','jj-warroom',
      'jj-qrcode','jj-profile',
    ],
    '唯讀人員': [
      'jj-dashboard','jj-stock','jj-logs',
      'jj-alerts','jj-warroom','jj-reports','jj-profile',
    ],
  };

  // ── 預設帳號（含密碼，可被修改） ──
  const DEFAULT_USERS = [
    {email:'admin@jj.com.tw', password:'jj1234', name:'黃小翰', role:'系統管理員', mustChange:false},
    {email:'chen@jj.com.tw',  password:'jj1234', name:'陳小華', role:'倉管人員',   mustChange:true},
    {email:'lee@jj.com.tw',   password:'jj1234', name:'李大明', role:'倉管人員',   mustChange:true},
    {email:'wang@jj.com.tw',  password:'jj1234', name:'王芳芳', role:'唯讀人員',   mustChange:true},
  ];

  const DEFAULT_PRODUCTS = [
    {id:'P001',name:'防水膠帶 50mm',code:'PKG-001',cat:'包裝材料',unit:'捲',stock:12, safe:100,wh:'大溪倉',status:'active'},
    {id:'P002',name:'棧板 120x100cm',code:'PLT-001',cat:'棧板設備',unit:'片',stock:8,  safe:50, wh:'大肚倉',status:'active'},
    {id:'P003',name:'紙箱 A4 尺寸',code:'PKG-002',cat:'包裝材料',unit:'個',stock:45, safe:200,wh:'大溪倉',status:'active'},
    {id:'P004',name:'包裝泡棉 30mm',code:'PKG-003',cat:'包裝材料',unit:'包',stock:38, safe:150,wh:'大溪倉',status:'active'},
    {id:'P005',name:'收縮膜 500m',code:'PKG-004',cat:'包裝材料',unit:'捲',stock:3,  safe:20, wh:'大肚倉',status:'active'},
    {id:'P006',name:'堆高機 3T',code:'EQP-001',cat:'搬運工具',unit:'台',stock:2,  safe:2,  wh:'大溪倉',status:'active'},
    {id:'P007',name:'手推車',code:'EQP-002',cat:'搬運工具',unit:'台',stock:8,  safe:5,  wh:'大溪倉',status:'active'},
    {id:'P008',name:'標籤紙 A6',code:'PKG-005',cat:'包裝材料',unit:'包',stock:120,safe:50, wh:'岡山倉',status:'active'},
    {id:'P009',name:'封箱機',code:'EQP-003',cat:'搬運工具',unit:'台',stock:3,  safe:2,  wh:'大肚倉',status:'active'},
    {id:'P010',name:'氣泡袋 30x40cm',code:'PKG-006',cat:'包裝材料',unit:'個',stock:200,safe:100,wh:'大溪倉',status:'active'},
  ];

  function init() {
    if (!localStorage.getItem(KEYS.products)) localStorage.setItem(KEYS.products, JSON.stringify(DEFAULT_PRODUCTS));
    if (!localStorage.getItem(KEYS.logs))     localStorage.setItem(KEYS.logs,     JSON.stringify([]));
    if (!localStorage.getItem(KEYS.users))    localStorage.setItem(KEYS.users,    JSON.stringify(DEFAULT_USERS));
  }

  // ── Products ──
  function getProducts() { init(); return JSON.parse(localStorage.getItem(KEYS.products)); }
  function saveProducts(p) { localStorage.setItem(KEYS.products, JSON.stringify(p)); }

  // ── Logs ──
  function getLogs() { init(); return JSON.parse(localStorage.getItem(KEYS.logs)); }
  function addLog(entry) {
    const logs = getLogs();
    logs.unshift({...entry, time: new Date().toLocaleString('zh-TW')});
    if (logs.length > 300) logs.pop();
    localStorage.setItem(KEYS.logs, JSON.stringify(logs));
  }

  // ── Users (帳號清單) ──
  function getUsers() { init(); return JSON.parse(localStorage.getItem(KEYS.users)); }
  function saveUsers(u) { localStorage.setItem(KEYS.users, JSON.stringify(u)); }

  // ── Session ──
  function getUser()      { return JSON.parse(localStorage.getItem(KEYS.user) || 'null'); }
  function setUser(user)  {
    localStorage.setItem(KEYS.user, JSON.stringify(user));
    touchSession();
  }
  function clearUser()    {
    localStorage.removeItem(KEYS.user);
    localStorage.removeItem(KEYS.session);
  }
  function touchSession() { localStorage.setItem(KEYS.session, Date.now()); }
  function isSessionAlive() {
    const t = parseInt(localStorage.getItem(KEYS.session) || '0');
    return Date.now() - t < SESSION_TIMEOUT;
  }

  // ── 登入失敗鎖定 ──
  function getLocks() { return JSON.parse(localStorage.getItem(KEYS.locks) || '{}'); }
  function saveLocks(l) { localStorage.setItem(KEYS.locks, JSON.stringify(l)); }
  function recordFail(email) {
    const locks = getLocks();
    const now = Date.now();
    if (!locks[email]) locks[email] = {count:0, lockedAt:0};
    locks[email].count++;
    if (locks[email].count >= MAX_FAIL) locks[email].lockedAt = now;
    saveLocks(locks);
    return locks[email];
  }
  function clearFail(email) {
    const locks = getLocks();
    delete locks[email];
    saveLocks(locks);
  }
  function isLocked(email) {
    const locks = getLocks();
    const info = locks[email];
    if (!info) return false;
    if (info.lockedAt && Date.now() - info.lockedAt < LOCK_DURATION) return true;
    if (info.lockedAt && Date.now() - info.lockedAt >= LOCK_DURATION) { clearFail(email); return false; }
    return false;
  }
  function failCount(email) {
    const locks = getLocks();
    return locks[email] ? locks[email].count : 0;
  }
  function lockRemaining(email) {
    const locks = getLocks();
    const info = locks[email];
    if (!info || !info.lockedAt) return 0;
    return Math.max(0, Math.ceil((LOCK_DURATION - (Date.now()-info.lockedAt)) / 60000));
  }

  // ── 登入驗證 ──
  function login(email, password) {
    init();
    if (isLocked(email)) {
      return { ok:false, reason:'locked', minutes: lockRemaining(email) };
    }
    const users = getUsers();
    const user = users.find(u => u.email === email && u.password === password);
    if (!user) {
      const info = recordFail(email);
      const remaining = MAX_FAIL - info.count;
      if (info.count >= MAX_FAIL) return { ok:false, reason:'locked', minutes: Math.ceil(LOCK_DURATION/60000) };
      return { ok:false, reason:'wrong', remaining };
    }
    clearFail(email);
    setUser({email:user.email, name:user.name, role:user.role, mustChange:user.mustChange});
    addLog({type:'登入/登出', prod:'—', wh:'—', chg:'—', before:'—', after:'—', user:user.name, doc:'—', note:'使用者登入系統'});
    return { ok:true, user, mustChange: user.mustChange };
  }

  // ── 修改密碼 ──
  function changePassword(email, oldPwd, newPwd) {
    const users = getUsers();
    const u = users.find(x => x.email === email);
    if (!u) return { ok:false, msg:'找不到帳號' };
    if (u.password !== oldPwd) return { ok:false, msg:'舊密碼錯誤' };
    if (newPwd.length < 6) return { ok:false, msg:'新密碼至少 6 碼' };
    if (oldPwd === newPwd) return { ok:false, msg:'新密碼不能與舊密碼相同' };
    u.password = newPwd;
    u.mustChange = false;
    saveUsers(users);
    // 更新 session 中的 mustChange
    const cur = getUser();
    if (cur && cur.email === email) { cur.mustChange = false; setUser(cur); }
    addLog({type:'系統設定', prod:'—', wh:'—', chg:'—', before:'—', after:'—', user:u.name, doc:'—', note:'修改密碼'});
    return { ok:true };
  }

  // ── 管理員重設密碼 ──
  function resetPassword(email) {
    const users = getUsers();
    const u = users.find(x => x.email === email);
    if (!u) return false;
    u.password = 'jj1234';
    u.mustChange = true;
    saveUsers(users);
    return true;
  }

  // ── 角色存取控制 ──
  function canAccess(role, page) {
    const allowed = ROLE_ACCESS[role];
    if (!allowed) return false;
    if (allowed[0] === '*') return true;
    return allowed.includes(page);
  }

  // ── Session 守衛（所有頁面呼叫） ──
  function guardPage(pageName) {
    const user = getUser();
    // 未登入
    if (!user) { location.href = 'login.html'; return false; }
    // Session 逾時
    if (!isSessionAlive()) {
      clearUser();
      alert('⏰ 閒置逾時，請重新登入。');
      location.href = 'login.html';
      return false;
    }
    // 角色存取控制
    if (pageName && !canAccess(user.role, pageName)) {
      location.href = 'jj-denied.html';
      return false;
    }
    // 強制改密碼
    if (user.mustChange && pageName !== 'jj-profile') {
      if (!confirm('首次登入請先修改密碼，點確定前往修改。')) { clearUser(); location.href='login.html'; return false; }
      location.href = 'jj-profile.html';
      return false;
    }
    touchSession(); // 每次活動更新 session
    return true;
  }

  // ── 入庫 ──
  function doInbound(items, meta) {
    const products = getProducts();
    items.forEach(item => {
      const p = products.find(x => x.id === item.id);
      if (p) { const b=p.stock; p.stock+=Number(item.qty); addLog({type:'入庫',prod:p.name,wh:meta.wh,chg:`+${item.qty}`,before:b,after:p.stock,user:meta.user,doc:meta.doc,note:meta.note||''}); }
    });
    saveProducts(products);
  }

  // ── 出庫 ──
  function doOutbound(items, meta) {
    const products = getProducts();
    const errors = [];
    items.forEach(item => {
      const p = products.find(x => x.id === item.id);
      if (p && p.stock < Number(item.qty)) errors.push(`${p.name} 庫存不足（現有 ${p.stock}）`);
    });
    if (errors.length) return { ok:false, errors };
    items.forEach(item => {
      const p = products.find(x => x.id === item.id);
      if (p) { const b=p.stock; p.stock-=Number(item.qty); addLog({type:'出庫',prod:p.name,wh:meta.wh,chg:`-${item.qty}`,before:b,after:p.stock,user:meta.user,doc:meta.doc,note:meta.note||''}); }
    });
    saveProducts(products);
    return { ok:true };
  }

  function resetAll() {
    [KEYS.products,KEYS.logs,KEYS.users,KEYS.locks].forEach(k=>localStorage.removeItem(k));
    init();
  }

  return {
    init, getProducts, saveProducts, getLogs, addLog,
    getUsers, saveUsers,
    getUser, setUser, clearUser, touchSession, isSessionAlive,
    isLocked, failCount, lockRemaining, recordFail, clearFail,
    login, changePassword, resetPassword,
    canAccess, guardPage,
    doInbound, doOutbound, resetAll,
    SESSION_TIMEOUT, MAX_FAIL,
  };
})();
