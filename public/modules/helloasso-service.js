/**
 * HelloAsso member sync service.
 * Provides functions to trigger server-side sync and read synced member data.
 * 
 * Calls the VPS backend sync.judo-cattenom.fr (which talks to HelloAsso via IONOS IP,
 * not blocked by Cloudflare, unlike the former Supabase Edge Function).
 */

const SYNC_API_BASE = 'https://sync.judo-cattenom.fr';

async function _getApiToken() {
  // Récupère le token depuis chrome.storage.sync (partagé avec l'extension) si dispo
  // Sinon attend que l'UI l'ait injecté
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    try {
      const result = await chrome.storage.sync.get(['jcc_api_token']);
      if (result.jcc_api_token) return result.jcc_api_token;
    } catch (e) { /* ignore */ }
  }
  return window.__jccApiToken || null;
}

async function _apiCall(endpoint, options = {}) {
  const token = await _getApiToken();
  if (!token) {
    throw new Error('Token API HelloAsso non configuré. Configurez-le depuis l\'extension Chrome (⚙️ Paramètres).');
  }
  const fetchOptions = {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  const r = await fetch(`${SYNC_API_BASE}${endpoint}`, fetchOptions);
  const data = await r.json();
  if (!r.ok) {
    throw new Error(data.detail || `HelloAsso API error ${r.status}`);
  }
  return data;
}

export async function syncHelloAssoMembers(_supabase) {
  // _supabase ignoré — on utilise notre backend VPS à la place
  return await _apiCall('/sync', { method: 'POST' });
}

export async function getHelloAssoMembers(_supabase) {
  // _supabase ignoré — on lit depuis notre backend VPS
  const data = await _apiCall('/adherents');
  const adherents = data.adherents || [];
  // Mapper vers le format attendu par l'UI (legacy Supabase schema)
  return adherents.map(a => ({
    id: String(a.item_id || a.order_id || ''),
    helloasso_id: String(a.item_id || ''),
    first_name: a.prenom || '',
    last_name: a.nom || '',
    email: (a.email || '').toLowerCase(),
    date_of_birth: a.date_naissance || '',
    membership_amount: (a.amount_centimes || 0) / 100,
    membership_date: null,
    membership_state: 'active',
    discipline: (function() {
      if (a.pratique === '13') return 'iaido';
      if (a.pratique === '3')  return 'taiso';
      return 'judo';
    })(),
    judo_category: a.tier || '',
    raw_data: a,
  }));
}

export async function getLastSyncTime(_supabase) {
  // _supabase ignoré — stats depuis notre backend
  try {
    const stats = await _apiCall('/stats');
    return stats.synced_at || null;
  } catch (e) {
    return null;
  }
}

/**
 * Parse a HelloAsso CSV export and extract date_of_birth per email.
 * HelloAsso CSV columns vary by form, so we detect columns by header name.
 * Returns array of { email, date_of_birth, first_name, last_name }
 */
export function parseHelloAssoCsv(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  // Detect separator (comma or semicolon)
  const sep = lines[0].includes(';') ? ';' : ',';

  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());

  // Find relevant column indices (HelloAsso uses French headers)
  const find = (...candidates) => {
    for (const c of candidates) {
      const idx = headers.findIndex((h) => h.includes(c));
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const iEmail     = find('email', 'courriel', 'mail');
  const iBirth     = find('naissance', 'birth', 'dob', 'né', 'date de naissance');
  const iFirstName = find('prénom', 'prenom', 'firstname', 'first name');
  const iLastName  = find('nom', 'lastname', 'last name', 'surname');

  const results = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const email = iEmail >= 0 ? cols[iEmail]?.toLowerCase().trim() : null;
    const dob   = iBirth >= 0 ? cols[iBirth]?.trim() : null;
    if (!email || !dob) continue;
    results.push({
      email,
      date_of_birth: dob,
      first_name: iFirstName >= 0 ? cols[iFirstName] : null,
      last_name:  iLastName  >= 0 ? cols[iLastName]  : null,
    });
  }
  return results;
}

/**
 * Import date_of_birth (and optionally name) from parsed CSV rows into helloasso_members.
 * Matches by email. Returns { updated, notFound }.
 */
export async function importHelloAssoCsvData(supabase, rows) {
  let updated = 0;
  const notFound = [];

  for (const row of rows) {
    if (!row.email || !row.date_of_birth) continue;
    const { data, error } = await supabase
      .from('helloasso_members')
      .update({ date_of_birth: row.date_of_birth })
      .ilike('email', row.email)
      .select('id');
    if (error || !data || data.length === 0) {
      notFound.push(row.email);
    } else {
      updated += data.length;
    }
  }
  return { updated, notFound };
}
