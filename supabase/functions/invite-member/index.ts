// @ts-nocheck
/**
 * Supabase Edge Function — invite-member
 *
 * Allows a "bureau" member of the Judo Club Cattenom Rodemack (authenticated via
 * Keycloak PKCE on the static Hugo site) to invite a new member.
 *
 * Unlike `invite-coach` / `invite-admin` (which use Supabase Auth), this function
 * lives in the Keycloak world:
 *   1. The caller's token is a **Keycloak** access token (client `jcc-frontend`).
 *      It is verified against the realm JWKS and must carry the `bureau` realm role.
 *   2. The new user is created through the **Keycloak Admin API**
 *      (POST /admin/realms/{realm}/users) with a required `UPDATE_PASSWORD` action.
 *   3. Keycloak then emails the user an action link to set their password
 *      (PUT /admin/realms/{realm}/users/{id}/execute-actions-email).
 *   4. The operation is recorded in the `audit_logs` table.
 *
 * Request body (JSON):
 *   { "email": "member@example.com", "firstName": "...", "lastName": "...", "redirectUri": "https://..." }
 *   (only `email` is required)
 *
 * Authorization: Bearer <Keycloak access token of a bureau member>
 *
 * Environment variables
 * ---------------------
 *   SUPABASE_URL                (auto)   — for the audit log
 *   SUPABASE_SERVICE_ROLE_KEY   (auto)   — for the audit log
 *   KC_URL                               — e.g. https://auth.judo-cattenom.fr
 *   KC_REALM                             — e.g. jccattenom
 *   KC_ADMIN_CLIENT_ID                   — confidential client with a service account (manage-users)
 *   KC_ADMIN_CLIENT_SECRET               — its client secret
 *   KC_EMAIL_CLIENT_ID          (opt)    — client used for the action-email link (default: jcc-frontend)
 *   INVITE_REDIRECT_URI         (opt)    — where the password link returns (default: https://judo-cattenom.fr/espace-membre/)
 *
 * Deployment
 * ----------
 *   supabase functions deploy invite-member --project-ref ajbpzueanpeukozjhkiv
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'https://esm.sh/jose@5.9.6'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const REQUIRED_ROLE = 'bureau'

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function maskEmail(email) {
  if (email == null) return null
  const value = String(email).trim()
  if (!value) return null
  const atIndex = value.indexOf('@')
  if (atIndex <= 0) return '[invalid-email]'

  const local = value.slice(0, atIndex)
  const domain = value.slice(atIndex + 1)
  const maskedLocal = local.length <= 2
    ? `${local[0]}${'*'.repeat(Math.max(local.length - 1, 0))}`
    : `${local[0]}${'*'.repeat(Math.max(local.length - 2, 1))}${local.slice(-1)}`

  return `${maskedLocal}@${domain}`
}

function normalizeEmail(email) {
  const value = String(email ?? '').trim().toLowerCase()
  if (!value) return null
  // very light shape check — Keycloak does the real validation
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) return null
  return value
}

async function insertAuditLog(supabaseAdmin, {
  actorUid,
  actorEmail,
  action,
  entityType,
  entityId = null,
  targetUserId = null,
  targetEmail = null,
  metadata = {},
}) {
  const { error } = await supabaseAdmin.from('audit_logs').insert({
    actor_uid: actorUid,
    actor_email: actorEmail,
    action,
    entity_type: entityType,
    entity_id: entityId,
    target_user_id: targetUserId,
    target_email: targetEmail,
    metadata,
  })

  if (error) {
    console.warn('DEBUG invite-member audit log failed:', error.message)
  }
}

// ── Keycloak helpers ──────────────────────────────────────────────────────

// Cache the remote JWKS across invocations (module scope survives warm starts).
let jwksCache = null
function getJwks(kcUrl, realm) {
  if (!jwksCache) {
    jwksCache = createRemoteJWKSet(
      new URL(`${kcUrl}/realms/${realm}/protocol/openid-connect/certs`)
    )
  }
  return jwksCache
}

/** Fetch an admin access token via the service-account client (client_credentials). */
async function getKeycloakAdminToken(kcUrl, realm, clientId, clientSecret) {
  const resp = await fetch(`${kcUrl}/realms/${realm}/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    }),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    throw new Error(`Keycloak admin token request failed (${resp.status}): ${text}`)
  }

  const data = await resp.json()
  if (!data.access_token) throw new Error('Keycloak admin token response missing access_token')
  return data.access_token
}

/** Look up a Keycloak user id by exact email. Returns null if not found. */
async function findKeycloakUserByEmail(kcUrl, realm, adminToken, email) {
  const url = `${kcUrl}/admin/realms/${realm}/users?email=${encodeURIComponent(email)}&exact=true`
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!resp.ok) return null
  const users = await resp.json().catch(() => [])
  if (Array.isArray(users) && users.length > 0 && users[0]?.id) {
    return users[0].id
  }
  return null
}

// ── Handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID()

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed', requestId }, 405)
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    const kcUrl = (Deno.env.get('KC_URL') || '').replace(/\/+$/, '')
    const kcRealm = Deno.env.get('KC_REALM') || 'jccattenom'
    const kcAdminClientId = Deno.env.get('KC_ADMIN_CLIENT_ID')
    const kcAdminClientSecret = Deno.env.get('KC_ADMIN_CLIENT_SECRET')
    const emailClientId = Deno.env.get('KC_EMAIL_CLIENT_ID') || 'jcc-frontend'
    const defaultRedirect = Deno.env.get('INVITE_REDIRECT_URI') || 'https://judo-cattenom.fr/espace-membre/'

    if (!supabaseUrl || !serviceRoleKey || !kcUrl || !kcAdminClientId || !kcAdminClientSecret) {
      console.error('DEBUG invite-member missing configuration:', {
        requestId,
        hasSupabaseUrl: !!supabaseUrl,
        hasServiceRole: !!serviceRoleKey,
        hasKcUrl: !!kcUrl,
        hasAdminClientId: !!kcAdminClientId,
        hasAdminClientSecret: !!kcAdminClientSecret,
      })
      return jsonResponse({ error: 'Server configuration error', requestId }, 500)
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1. Verify the caller's Keycloak token ───────────────────────────────
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return jsonResponse({ error: 'Missing Authorization header', requestId }, 401)
    }
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader

    let payload
    try {
      const result = await jwtVerify(token, getJwks(kcUrl, kcRealm), {
        issuer: `${kcUrl}/realms/${kcRealm}`,
      })
      payload = result.payload
    } catch (e) {
      console.warn('DEBUG invite-member JWT verification failed:', { requestId, error: String(e) })
      return jsonResponse({ error: 'Unauthorized: invalid token', requestId }, 401)
    }

    const realmRoles = (payload?.realm_access?.roles) || []
    if (!realmRoles.includes(REQUIRED_ROLE)) {
      console.warn('DEBUG invite-member forbidden:', { requestId, sub: payload.sub, roles: realmRoles })
      return jsonResponse({ error: `Forbidden: ${REQUIRED_ROLE} role required`, requestId }, 403)
    }

    const callerSub = typeof payload.sub === 'string' ? payload.sub : null
    const callerEmail = typeof payload.email === 'string' ? payload.email : null

    // 2. Parse & validate the request body ─────────────────────────────────
    const body = await req.json().catch(() => ({}))
    const email = normalizeEmail(body.email)
    if (!email) {
      return jsonResponse({ error: 'Missing or invalid email', requestId }, 400)
    }
    const firstName = typeof body.firstName === 'string' ? body.firstName.trim() : ''
    const lastName = typeof body.lastName === 'string' ? body.lastName.trim() : ''
    const redirectUri = typeof body.redirectUri === 'string' && body.redirectUri.trim()
      ? body.redirectUri.trim()
      : defaultRedirect

    // 3. Get an admin token for the Keycloak Admin API ─────────────────────
    const adminToken = await getKeycloakAdminToken(kcUrl, kcRealm, kcAdminClientId, kcAdminClientSecret)

    // 4. Create the user ───────────────────────────────────────────────────
    const createResp = await fetch(`${kcUrl}/admin/realms/${kcRealm}/users`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: email,
        email,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
        enabled: true,
        emailVerified: false,
        requiredActions: ['UPDATE_PASSWORD'],
      }),
    })

    let userId = null
    let alreadyExisted = false

    if (createResp.status === 201) {
      // The new user id is in the Location header: .../users/{id}
      const location = createResp.headers.get('Location') || ''
      userId = location.split('/').pop() || null
      if (!userId) {
        userId = await findKeycloakUserByEmail(kcUrl, kcRealm, adminToken, email)
      }
    } else if (createResp.status === 409) {
      // User already exists — resolve their id and (re)send the action email.
      alreadyExisted = true
      userId = await findKeycloakUserByEmail(kcUrl, kcRealm, adminToken, email)
      if (!userId) {
        return jsonResponse({ error: 'User already exists but could not be resolved', requestId }, 409)
      }
    } else {
      const text = await createResp.text().catch(() => '')
      console.error('DEBUG invite-member create user failed:', { requestId, status: createResp.status, text })
      return jsonResponse({ error: `Keycloak user creation failed (${createResp.status})`, requestId }, 502)
    }

    // 5. Send the "set your password" action email ─────────────────────────
    const emailParams = new URLSearchParams({
      client_id: emailClientId,
      redirect_uri: redirectUri,
      lifespan: '86400', // link valid 24h
    })
    const emailResp = await fetch(
      `${kcUrl}/admin/realms/${kcRealm}/users/${userId}/execute-actions-email?${emailParams}`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(['UPDATE_PASSWORD']),
      }
    )

    if (!emailResp.ok) {
      const text = await emailResp.text().catch(() => '')
      console.error('DEBUG invite-member action email failed:', { requestId, status: emailResp.status, text })
      // The user was created; surface the partial success so the caller can retry the email.
      await insertAuditLog(supabaseAdmin, {
        actorUid: callerSub,
        actorEmail: callerEmail,
        action: 'invite.member.email_failed',
        entityType: 'keycloak_user',
        entityId: userId,
        targetUserId: userId,
        targetEmail: email,
        metadata: { requestId, alreadyExisted, emailStatus: emailResp.status },
      })
      return jsonResponse({
        error: `User created but the invitation email failed (${emailResp.status})`,
        requestId,
        userId,
        alreadyExisted,
      }, 502)
    }

    // 6. Audit log ─────────────────────────────────────────────────────────
    await insertAuditLog(supabaseAdmin, {
      actorUid: callerSub,
      actorEmail: callerEmail,
      action: alreadyExisted ? 'invite.member.resend' : 'invite.member',
      entityType: 'keycloak_user',
      entityId: userId,
      targetUserId: userId,
      targetEmail: email,
      metadata: { requestId, alreadyExisted, redirectUri },
    })

    console.log('DEBUG invite-member success:', {
      requestId,
      email: maskEmail(email),
      userId,
      alreadyExisted,
    })

    return jsonResponse({
      success: true,
      requestId,
      userId,
      email,
      alreadyExisted,
      message: alreadyExisted
        ? 'Utilisateur déjà existant — email de définition du mot de passe renvoyé.'
        : 'Invitation envoyée — le membre va recevoir un email pour définir son mot de passe.',
    }, 200)
  } catch (e) {
    console.error('DEBUG invite-member unexpected error:', { requestId, error: String(e) })
    return jsonResponse({ error: String(e), requestId }, 500)
  }
})
