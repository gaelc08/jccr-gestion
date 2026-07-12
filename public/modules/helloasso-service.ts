/**
 * HelloAsso member sync service.
 * Provides functions to trigger server-side sync and read synced member data.
 * 
 * Calls the VPS backend sync.judo-cattenom.fr (which talks to HelloAsso via IONOS IP,
 * not blocked by Cloudflare, unlike the former Supabase Edge Function).
 */

const SYNC_API_BASE = 'https://sync.judo-cattenom.fr';

async function _getApiToken() {
  // Try localStorage first (web app context)
  let token = localStorage.getItem('jcc_api_token');
  
  // Fallback to chrome.storage.sync (extension context)
  if (!token && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    try {
      const result = await new Promise<{ jcc_api_token?: string }>((resolve) => {
        chrome.storage.sync.get(['jcc_api_token'], resolve);
      });
      token = result.jcc_api_token ?? null;
    } catch (e) { /* ignore */ }
  }
  
  // Final fallback to window global (injected by app)
  if (!token) {
    token = window.__jccApiToken || null;
  }
  
  return token;
}

async function _apiCall(endpoint, options: Record<string, any> = {}) {
  const token = await _getApiToken();
  if (!token) {
    throw new Error('Token API HelloAsso non configuré. Configurez-le depuis l\'extension Chrome (⚙️ Paramètres).');
  }
  const fetchOptions: any = {
    method: options.method || 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  };
  if ((options as any).body) {
    fetchOptions.body = (options as any).body;
  }
  const r = await fetch(`${SYNC_API_BASE}${endpoint}`, fetchOptions);
  const text = await r.text();
  if (!r.ok) {
    let msg;
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data.detail)) {
        msg = data.detail.map(e => e.msg || JSON.stringify(e)).join('; ');
      } else if (typeof data.detail === 'string') {
        msg = data.detail;
      } else {
        msg = JSON.stringify(data);
      }
    } catch {
      // Réponse non-JSON (ex. page d'erreur HTML 502/504)
      msg = text.slice(0, 200);
    }
    throw new Error(msg || `HelloAsso API error ${r.status}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Réponse HelloAsso invalide (JSON attendu) : ${text.slice(0, 200)}`);
  }
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

  const results: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const email = iEmail >= 0 ? cols[iEmail]?.toLowerCase().trim() : null;
    const dob   = iBirth >= 0 ? cols[iBirth]?.trim() : null;
    if (!email || !dob) continue;
    (results as any[]).push({
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
  const notFound: any[] = [];

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

/**
 * Importe un CSV exporté du site FFJDO pour marquer les adhérents comme saisis.
 * Envoie le texte CSV au backend VPS qui fait le matching et met à jour l'état.
 */
export async function importFfjdaCsv(csvText) {
  return await _apiCall('/import-ffjda-csv', {
    method: 'POST',
    body: JSON.stringify({ csv_text: csvText }),
  });
}

/**
 * Corrige le prénom/nom d'un adhérent HelloAsso.
 * Les corrections sont stockées côté VPS et préservées lors des re-synchronisations.
 */
export async function correctMemberName(itemId, firstName, lastName) {
  return await _apiCall('/correct-name', {
    method: 'POST',
    body: JSON.stringify({ item_id: parseInt(itemId, 10), first_name: firstName, last_name: lastName }),
  });
}

/**
 * Récupère les données de réconciliation (HA + FFJDA côte à côte).
 */
export async function getReconciliation() {
  return await _apiCall('/reconciliation');
}

/**
 * Récupère la liste des membres FFJDA importés.
 */
export async function getFfjdaMembers() {
  const data = await _apiCall('/ffjda-members');
  return data.members || [];
}