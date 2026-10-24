/* ==========================================================================
   Sandhani GSVMC Unit — Supabase DataLayer (v2, LIVE)
   --------------------------------------------------------------------------
   সব ডেটা এখন Supabase backend থেকে আসে (REST + Auth, vanilla fetch —
   কোনো CDN/SDK লাগে না)। Connection config: js/config.js
   (window.SANDHANI_SUPABASE = { url, anon })।
   localStorage শুধু লগইন সেশন রাখতে ব্যবহার হয় ("sandhani-session") —
   কোনো ব্যবসায়িক ডেটা ব্রাউজারে জমা থাকে না।
   ========================================================================== */

const SESSION_KEY = 'sandhani-session';
const ELIGIBILITY_DAYS = 120; // ডোনেশনের পর কতদিন বিরতি
const GROUPS = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];

/* পুরনো ডেমোর localStorage ডেটা থাকলে মুছে ফেলি (v1 demo cleanup) */
try {
  localStorage.removeItem('sandhani_db_v1');
  localStorage.removeItem('sandhani_session_v1');
} catch (e) { /* ignore */ }

const SB_CFG = window.SANDHANI_SUPABASE || {};
const SB_URL = String(SB_CFG.url || '').replace(/\/+$/, '');
const SB_ANON = SB_CFG.anon || '';

/* ---------- date helpers ---------- */
function isoToday() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function isoShift(days) {
  const d = new Date(); d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function addDaysISO(iso, days) {
  const d = new Date(String(iso).slice(0, 10) + 'T00:00:00');
  if (isNaN(d)) return null;
  d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function diffDays(aISO, bISO) { // a - b (days)
  const a = new Date(String(aISO).slice(0, 10) + 'T00:00:00'), b = new Date(String(bISO).slice(0, 10) + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}
function bnDigits(s) {
  const map = { '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪', '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯' };
  return String(s).replace(/[0-9]/g, ch => map[ch]);
}
const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
function fmtDateBn(iso) {
  if (!iso) return '—';
  const parts = String(iso).slice(0, 10).split('-').map(Number); // date বা timestamptz দুটোই চলে
  if (parts.length !== 3 || parts.some(isNaN)) return '—';
  return bnDigits(parts[2]) + ' ' + BN_MONTHS[parts[1] - 1] + ' ' + bnDigits(parts[0]);
}
function grpDisplay(g) { return String(g || '').replace('-', '−'); } // A- -> A−

/* ---------- generic page error ---------- */
const LOAD_ERR = 'তথ্য লোড করা যায়নি, আবার চেষ্টা করুন।';
function showPageError(msg) {
  const el = document.getElementById('pageErr');
  if (el) { el.style.display = 'block'; el.textContent = msg || LOAD_ERR; }
  else console.error(msg || LOAD_ERR);
}
function hidePageError() {
  const el = document.getElementById('pageErr');
  if (el) el.style.display = 'none';
}

/* ==========================================================================
   Supabase REST client (vanilla fetch)
   - প্রতিটি request-এ apikey header = anon key
   - Authorization: লগইন থাকলে user access token, নাহলে anon key
   ========================================================================== */
async function sbFetch(path, opts) {
  opts = opts || {};
  let token = SB_ANON;
  if (opts.auth !== false) {
    const sess = await Auth.ensureFresh();
    if (sess && sess.access_token) token = sess.access_token;
  }
  const headers = { apikey: SB_ANON, Authorization: 'Bearer ' + token };
  if (opts.prefer) headers.Prefer = opts.prefer;
  let body;
  if (opts.body !== undefined) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(opts.body); }
  return fetch(SB_URL + path, { method: opts.method || 'GET', headers, body });
}

async function sbRequest(path, opts) {
  let res;
  try {
    res = await sbFetch(path, opts);
  } catch (e) {
    const err = new Error('network');
    err.network = true;
    throw err;
  }
  const text = await res.text();
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch (e) { data = null; } }
  if (!res.ok) {
    const err = new Error((data && (data.message || data.error_description || data.error)) || ('HTTP ' + res.status));
    err.status = res.status;
    err.code = data && data.code;
    err.data = data;
    throw err;
  }
  let count = null;
  const cr = res.headers.get('content-range');
  if (cr && cr.indexOf('/') !== -1) {
    const n = parseInt(cr.split('/')[1], 10);
    if (!isNaN(n)) count = n;
  }
  return { data, count, res };
}

const SB = {
  /* GET /rest/v1/<path> → rows (array) */
  async get(path, opts) {
    const r = await sbRequest('/rest/v1' + path, opts);
    return r.data;
  },
  /* GET with Prefer: count=exact → { rows, count } */
  async getCount(path) {
    const sep = path.indexOf('?') === -1 ? '?' : '&';
    const r = await sbRequest('/rest/v1' + path + sep + 'limit=1', { prefer: 'count=exact' });
    return { rows: r.data, count: r.count };
  },
  /* শুধু count (rows লাগে না) */
  async count(path) {
    const r = await this.getCount(path);
    if (r.count != null) return r.count;
    return Array.isArray(r.rows) ? r.rows.length : 0;
  },
  /* POST (insert) → inserted rows */
  async insert(table, row, opts) {
    const r = await sbRequest('/rest/v1/' + table, Object.assign({ method: 'POST', body: row, prefer: 'return=representation' }, opts || {}));
    return r.data;
  },
  /* PATCH /rest/v1/<path> */
  async update(path, body, opts) {
    const r = await sbRequest('/rest/v1' + path, Object.assign({ method: 'PATCH', body, prefer: 'return=representation' }, opts || {}));
    return r.data;
  },
  /* POST /rest/v1/rpc/<name> */
  async rpc(name, args, opts) {
    const r = await sbRequest('/rest/v1/rpc/' + name, Object.assign({ method: 'POST', body: args || {} }, opts || {}));
    return r.data;
  }
};

/* ==========================================================================
   Auth — Supabase Auth (email/password)
   Session localStorage-এ থাকে: { access_token, refresh_token, expires_at,
   user, profile } — key: "sandhani-session"
   ========================================================================== */
const Auth = {
  session() {
    try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
  },
  _save(sess) { localStorage.setItem(SESSION_KEY, JSON.stringify(sess)); },
  clear() { localStorage.removeItem(SESSION_KEY); },

  /* পেজগুলো যে আকারে session ব্যবহার করে */
  view(sess) {
    const p = (sess && sess.profile) || {};
    return {
      userId: sess.user.id,
      name: p.name || sess.user.email || '',
      role: p.role || 'team',
      email: p.email || sess.user.email || '',
      profile: p
    };
  },

  async _authToken(payload, grantQuery) {
    const res = await fetch(SB_URL + '/auth/v1/token?' + grantQuery, {
      method: 'POST',
      headers: { apikey: SB_ANON, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => null);
    return { res, data };
  },

  async login(email, password) {
    email = String(email || '').trim();
    let out;
    try {
      out = await this._authToken({ email, password }, 'grant_type=password');
    } catch (e) {
      return { ok: false, error: 'সার্ভারে যোগাযোগ করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।' };
    }
    const { res, data } = out;
    if (!res.ok || !data || !data.access_token) {
      return { ok: false, error: 'ইমেইল বা পাসওয়ার্ড ভুল।' };
    }
    const sess = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (data.expires_in || 3600) * 1000,
      user: data.user,
      profile: null
    };
    this._save(sess);
    const profile = await this.fetchProfile(sess);
    if (!profile) {
      this.clear();
      return { ok: false, error: 'এই অ্যাকাউন্টের কোনো টিম প্রোফাইল পাওয়া যায়নি। অ্যাডমিনের সাথে যোগাযোগ করুন।' };
    }
    if (!profile.active) {
      this.clear();
      return { ok: false, error: 'এই অ্যাকাউন্ট এখন সক্রিয় নয়। সাইন আপ করে থাকলে Admin-এর অনুমোদনের জন্য অপেক্ষা করুন।' };
    }
    sess.profile = profile;
    this._save(sess);
    return { ok: true, session: this.view(sess) };
  },

  /* নতুন সদস্যের সাইন আপ: অ্যাকাউন্ট তৈরি হয়, প্রোফাইল নিষ্ক্রিয় থাকে —
     Admin member/users পেজ থেকে সক্রিয় করলে তবেই লগইন করা যায় */
  async signUpMember(email, password, meta) {
    let res, data;
    try {
      res = await fetch(SB_URL + '/auth/v1/signup', {
        method: 'POST',
        headers: { apikey: SB_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(email || '').trim(), password, data: meta || {} })
      });
      data = await res.json().catch(() => null);
    } catch (e) {
      return { ok: false, error: 'সার্ভারে যোগাযোগ করা যায়নি। ইন্টারনেট সংযোগ দেখে আবার চেষ্টা করুন।' };
    }
    if (!res.ok) {
      const msg = (data && (data.msg || data.message || data.error_description || data.error)) || '';
      if (/already|registered/i.test(msg)) return { ok: false, error: 'এই ইমেইলে আগেই অ্যাকাউন্ট আছে — লগইন করুন।' };
      if (/password/i.test(msg)) return { ok: false, error: 'পাসওয়ার্ড অন্তত ৬ অক্ষরের হতে হবে।' };
      return { ok: false, error: 'সাইন আপ করা যায়নি। আবার চেষ্টা করুন।' };
    }
    if (data && data.access_token) {
      const sess = {
        access_token: data.access_token,
        refresh_token: data.refresh_token,
        expires_at: Date.now() + (data.expires_in || 3600) * 1000,
        user: data.user,
        profile: null
      };
      this._save(sess);
      return { ok: true, session: sess, user: data.user };
    }
    return { ok: true, session: null, user: (data && data.user) || null };
  },

  /* প্রোফাইল ছবি: avatars/<uid>/avatar.jpg-তে আপলোড করে প্রোফাইলে URL বসায় */
  async uploadAvatar(blob) {
    const sess = this.session();
    if (!sess || !sess.user || !sess.access_token) return false;
    const path = sess.user.id + '/avatar.jpg';
    try {
      const r = await fetch(SB_URL + '/storage/v1/object/avatars/' + path, {
        method: 'POST',
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + sess.access_token, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' },
        body: blob
      });
      if (!r.ok) return false;
      const url = SB_URL + '/storage/v1/object/public/avatars/' + path + '?v=' + Date.now();
      await SB.post('/rpc/set_my_photo', { p_url: url });
      return true;
    } catch (e) { return false; }
  },

  /* পাসওয়ার্ড রিসেটের ইমেইল পাঠায় (লিংক reset.html-এ খোলে) */
  async resetPassword(email) {
    const redirectTo = location.origin + location.pathname.replace(/[^/]*$/, '') + 'reset.html';
    try {
      const r = await fetch(SB_URL + '/auth/v1/recover?redirect_to=' + encodeURIComponent(redirectTo), {
        method: 'POST',
        headers: { apikey: SB_ANON, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(email || '').trim() })
      });
      return r.ok;
    } catch (e) { return false; }
  },

  /* রিসেট লিংক থেকে এলে hash-এর token দিয়ে সাময়িক session বসায় */
  async acceptRecovery() {
    const h = location.hash ? new URLSearchParams(location.hash.slice(1)) : new URLSearchParams();
    if (h.get('type') !== 'recovery' || !h.get('access_token')) return false;
    const sess = {
      access_token: h.get('access_token'),
      refresh_token: h.get('refresh_token'),
      expires_at: Date.now() + parseInt(h.get('expires_in') || '3600', 10) * 1000,
      user: null,
      profile: null
    };
    try {
      const r = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + sess.access_token } });
      if (r.ok) sess.user = await r.json();
    } catch (e) { /* ignore */ }
    if (!sess.user) return false;
    this._save(sess);
    history.replaceState(null, '', location.pathname);
    return true;
  },

  /* নতুন পাসওয়ার্ড সেট করে (রিসেট session দিয়ে) */
  async updatePassword(newPassword) {
    const sess = this.session();
    if (!sess || !sess.access_token) return false;
    try {
      const r = await fetch(SB_URL + '/auth/v1/user', {
        method: 'PUT',
        headers: { apikey: SB_ANON, Authorization: 'Bearer ' + sess.access_token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: newPassword })
      });
      return r.ok;
    } catch (e) { return false; }
  },

  /* Google OAuth — Supabase authorize endpoint-এ পাঠায়; ফিরে আসে login.html-এ
     hash-এ token নিয়ে (acceptOAuthRedirect সেটা ধরে) */
  signInWithGoogle() {
    const redirectTo = location.origin + location.pathname;
    location.href = SB_URL + '/auth/v1/authorize?provider=google&redirect_to=' + encodeURIComponent(redirectTo);
  },

  /* Google theke fire ele session bosay — hash token (implicit) othoba ?code= (PKCE) dutoi dhore.
     kichui na thakle null; error thakle { ok:false, error }; profile na thakle { ok:false, pending:true } */
  async acceptOAuthRedirect() {
    const q = new URLSearchParams(location.search);
    const h = location.hash ? new URLSearchParams(location.hash.slice(1)) : new URLSearchParams();
    const errDesc = h.get('error_description') || q.get('error_description') || h.get('error') || q.get('error');
    if (errDesc) {
      history.replaceState(null, '', location.pathname);
      return { ok: false, error: 'Google login hoyni: ' + decodeURIComponent(String(errDesc).replace(/\+/g, ' ')) };
    }
    if (h.get('access_token')) {
      const access = h.get('access_token');
      const refresh = h.get('refresh_token');
      const exp = parseInt(h.get('expires_in') || '3600', 10);
      history.replaceState(null, '', location.pathname);
      return this._finishOAuth(access, refresh, exp);
    }
    if (q.get('code')) {
      const code = q.get('code');
      history.replaceState(null, '', location.pathname);
      try {
        const r = await fetch(SB_URL + '/auth/v1/token?grant_type=pkce', {
          method: 'POST',
          credentials: 'include',
          headers: { apikey: SB_ANON, 'Content-Type': 'application/json' },
          body: JSON.stringify({ auth_code: code })
        });
        const data = await r.json().catch(() => null);
        if (r.ok && data && data.access_token) {
          return this._finishOAuth(data.access_token, data.refresh_token, data.expires_in || 3600, data.user);
        }
        const msg = (data && (data.error_description || data.msg || data.error)) || 'code exchange failed';
        return { ok: false, error: 'Google login hoyni: ' + msg };
      } catch (e) {
        return { ok: false, error: 'Google login sompurno kora jayni, abar chesta korun.' };
      }
    }
    return null;
  },

  /* token paoyar porer ongsho: user + profile jachai kore session save kore */
  async _finishOAuth(access, refresh, expiresIn, knownUser) {
    let user = knownUser || null;
    if (!user) {
      try {
        const r = await fetch(SB_URL + '/auth/v1/user', { headers: { apikey: SB_ANON, Authorization: 'Bearer ' + access } });
        if (r.ok) user = await r.json();
      } catch (e) { /* ignore */ }
    }
    if (!user) return { ok: false, error: 'Google login sompurno kora jayni, abar chesta korun.' };
    const sess = {
      access_token: access,
      refresh_token: refresh,
      expires_at: Date.now() + (parseInt(expiresIn || '3600', 10)) * 1000,
      user: user,
      profile: null
    };
    this._save(sess);
    const profile = await this.fetchProfile(sess);
    if (!profile || !profile.active) {
      this.clear();
      return { ok: false, pending: true };
    }
    sess.profile = profile;
    this._save(sess);
    return { ok: true, session: this.view(sess) };
  },

  async fetchProfile(sess) {
    if (!sess || !sess.user || !sess.user.id) return null;
    try {
      const rows = await SB.get('/profiles?select=id,name,email,phone,role,active&id=eq.' + encodeURIComponent(sess.user.id));
      return (rows && rows[0]) || null;
    } catch (e) { return null; }
  },

  /* token মেয়াদ শেষের দিকে হলে refresh করে; ব্যর্থ হলে null */
  async ensureFresh() {
    const sess = this.session();
    if (!sess || !sess.access_token || !sess.user) return null;
    if (sess.expires_at && sess.expires_at - Date.now() > 60000) return sess;
    if (!sess.refresh_token) { this.clear(); return null; }
    try {
      const { res, data } = await this._authToken({ refresh_token: sess.refresh_token }, 'grant_type=refresh_token');
      if (!res.ok || !data || !data.access_token) { this.clear(); return null; }
      sess.access_token = data.access_token;
      sess.refresh_token = data.refresh_token || sess.refresh_token;
      sess.expires_at = Date.now() + (data.expires_in || 3600) * 1000;
      if (data.user) sess.user = data.user;
      this._save(sess);
      return sess;
    } catch (e) {
      return sess; // network সমস্যা হলে পুরনো session দিয়েই চেষ্টা চলুক
    }
  },

  logout() {
    this.clear();
    location.href = '../login.html';
  },

  /* member পেজের গার্ড: valid session + profile না থাকলে login-এ পাঠায়।
     adminOnly হলে role=admin ছাড়া dashboard-এ পাঠায়। */
  async guard(adminOnly) {
    const sess = await this.ensureFresh();
    if (!sess) { location.href = '../login.html'; return null; }
    if (!sess.profile) {
      const profile = await this.fetchProfile(sess);
      if (!profile || !profile.active) { this.clear(); location.href = '../login.html'; return null; }
      sess.profile = profile;
      this._save(sess);
    }
    if (adminOnly && sess.profile.role !== 'admin') { location.href = 'dashboard.html'; return null; }
    return this.view(sess);
  }
};

/* ---------- donor eligibility (120-day blackout) ---------- */
function donorStatus(d) {
  const last = d.last_donation_date || null;
  if (!last) return { eligible: true, label: 'Eligible', eligibleDate: null };
  const eligibleDate = addDaysISO(last, ELIGIBILITY_DAYS);
  if (!eligibleDate || isoToday() >= eligibleDate) return { eligible: true, label: 'Eligible', eligibleDate: null };
  return { eligible: false, label: 'বিরতিতে', eligibleDate };
}

/* ---------- requests ---------- */
const STATUS_BN = { 'new': 'নতুন', 'in-progress': 'প্রক্রিয়াধীন', 'fulfilled': 'সম্পন্ন', 'closed': 'বন্ধ' };
const STATUS_CLASS = { 'new': 'new', 'in-progress': 'wait', 'fulfilled': 'ok', 'closed': 'gray' };

/* track_no ডাটাবেসে default নেই — client থেকে তৈরি হয় (SB- + 5 random digits) */
function genTrackNo() {
  return 'SB-' + Math.floor(10000 + Math.random() * 90000);
}

/* ---------- member UI helpers ---------- */
function sidebarHTML(activePage, sess) {
  const roleBn = sess.role === 'admin' ? 'অ্যাডমিন' : 'টিম মেম্বার';
  // [key, href, label] — key দিয়ে active মেলানো হয় (inbox-এর দুই রূপের জন্য key আলাদা)
  const groups = [
    ['', [
      ['dashboard.html', 'dashboard.html', '📊 ড্যাশবোর্ড'],
      ['activity.html', 'activity.html', '🖼️ কার্যক্রম যোগ'],
    ]],
    ['🩸 Blood Manager', [
      ['donors.html', 'donors.html', '🩸 ডোনার ডিরেক্টরি'],
      ['inbox.html', 'inbox.html', '📥 ইনবক্স (অনুরোধ)'],
      ['donor-signups.html', 'donor-signups.html', '📝 ডোনার আবেদন'],
      ['stock.html', 'stock.html', '🧊 রক্তের স্টক'],
      ['exchange.html', 'exchange.html', '🔄 এক্সচেঞ্জ'],
    ]],
    ['💉 Vaccine Manager', [
      ['vaccine.html', 'vaccine.html', '💉 টিকার স্টক'],
      ['vaccine-interest', 'inbox.html?type=vaccine', '📩 টিকার আগ্রহ'],
    ]],
    ['💊 Drug Manager', [
      ['drugs.html', 'drugs.html', '💊 ড্যাশবোর্ড ও খোঁজা'],
      ['drug-receipt.html', 'drug-receipt.html', '📦 প্রাপ্তি (নতুন ওষুধ)'],
      ['drug-add.html', 'drug-add.html', '➕ নতুন ওষুধ যোগ'],
      ['drug-expired.html', 'drug-expired.html', '⏰ মেয়াদোত্তীর্ণ'],
    ]],
  ];
  if (sess.role === 'admin') groups.push(['', [['users.html', 'users.html', '👥 ইউজার']]]);
  // Manager tile: [css class, শিরোনাম, বাংলা সাবটাইটেল, SVG icon] — Miraz-approved tile design 2026-10-24
  const tiles = {
    '🩸 Blood Manager': ['blood', 'Blood Manager', 'রক্তদান ও ডোনার ব্যবস্থাপনা', '<svg viewBox="0 0 24 24" fill="#fff"><path d="M12 2.5S5.5 10.6 5.5 15a6.5 6.5 0 0 0 13 0C18.5 10.6 12 2.5 12 2.5Z"/></svg>'],
    '💉 Vaccine Manager': ['vax', 'Vaccine Manager', 'টিকাদান কর্মসূচি', '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round"><g transform="rotate(45 12 12)"><path d="M11 1.5h2V6h-2z"/><rect x="8" y="6" width="8" height="10" rx="1.5" fill="#fff" stroke="none"/><path d="M8 12h8M7 19h10M12 16v3"/></g></svg>'],
    '💊 Drug Manager': ['drug', 'Drug Manager', 'বিনামূল্যে ওষুধ সেবা', '<svg viewBox="0 0 24 24"><g transform="rotate(-45 12 12)"><rect x="2.5" y="8" width="19" height="8" rx="4" fill="#fff"/><rect x="2.5" y="8" width="9.5" height="8" rx="4" fill="#b2dfdb"/><line x1="12" y1="8" x2="12" y2="16" stroke="#00695c" stroke-width="1.4"/></g></svg>'],
  };
  let html = '<div class="sidebar"><div class="side-topbar"><span class="st-brand">🩸 Sandhani <span>GSVMC Unit</span></span><button type="button" class="side-toggle" id="sideToggle" aria-label="মেনু">☰</button></div>' +
    '<div class="who"><strong>' + esc(sess.name) + '</strong>' + roleBn + '</div><nav class="side-nav">';
  groups.forEach(([head, links]) => {
    if (!head) {
      links.forEach(([key, href, label]) => {
        html += '<a href="' + href + '"' + (activePage === key ? ' class="active"' : '') + '>' + label + '</a>';
      });
      return;
    }
    const meta = tiles[head] || ['blood', head, '', ''];
    const isOpen = links.some(([key]) => key === activePage);
    html += '<div class="acc' + (isOpen ? ' open' : '') + '"><button type="button" class="tile ' + meta[0] + '" aria-expanded="' + isOpen + '"><span class="pic">' + meta[3] + '</span><span class="t"><b>' + meta[1] + '</b><small>' + meta[2] + '</small></span><span class="chev">▾</span></button><div class="sub">';
    links.forEach(([key, href, label]) => {
      html += '<a href="' + href + '"' + (activePage === key ? ' class="active"' : '') + '>' + label + '</a>';
    });
    html += '</div></div>';
  });
  html += '<div class="sp"></div><a href="#" class="logout" onclick="Auth.logout();return false;">🚪 লগআউট</a></nav></div>';
  return html;
}

// মোবাইলে sidebar topbar-এর ☰ টগল + manager tile accordion (সব member পেজে একবারই বাঁধা)
document.addEventListener('click', function (e) {
  const closest = e.target && e.target.closest ? e.target.closest.bind(e.target) : null;
  if (!closest) return;
  const t = closest('#sideToggle');
  if (t) {
    const sb = t.closest('.sidebar');
    if (sb) { sb.classList.toggle('open'); t.textContent = sb.classList.contains('open') ? '✕' : '☰'; }
    return;
  }
  const tile = closest('.tile');
  if (tile) {
    const acc = tile.closest('.acc');
    if (!acc) return;
    const wasOpen = acc.classList.contains('open');
    document.querySelectorAll('.sidebar .acc.open').forEach(a => {
      a.classList.remove('open');
      const b = a.querySelector('.tile');
      if (b) b.setAttribute('aria-expanded', 'false');
    });
    if (!wasOpen) { acc.classList.add('open'); tile.setAttribute('aria-expanded', 'true'); }
  }
});
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function statusBadge(st) { return '<span class="badge ' + (STATUS_CLASS[st] || 'gray') + '">' + (STATUS_BN[st] || st) + '</span>'; }
