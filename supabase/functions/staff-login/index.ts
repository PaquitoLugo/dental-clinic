import { createClient } from 'npm:@supabase/supabase-js@2';
import bcrypt from 'npm:bcryptjs@3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const jsonResponse = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const hmacKeyPromise = crypto.subtle.importKey(
  'raw',
  new TextEncoder().encode(serviceRoleKey),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign'],
);

const hashRateLimitKey = async (value: string) => {
  const signature = await crypto.subtle.sign('HMAC', await hmacKeyPromise, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return jsonResponse({ ok: false, code: 'METHOD_NOT_ALLOWED' }, 405);

  let input: { username?: unknown; password?: unknown };
  try {
    input = await request.json();
  } catch {
    return jsonResponse({ ok: false, code: 'INVALID_REQUEST' }, 400);
  }

  const identifier = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';
  if (!identifier || identifier.length > 254 || !password || password.length > 256) {
    return jsonResponse({ ok: false, code: 'INVALID_CREDENTIALS' });
  }

  try {
    const forwardedIp = request.headers.get('cf-connecting-ip')
      || request.headers.get('x-forwarded-for')?.split(',')[0].trim()
      || `unknown:${identifier}`;
    const [ipHash, identifierHash] = await Promise.all([
      hashRateLimitKey(`ip:${forwardedIp}`),
      hashRateLimitKey(`identifier:${identifier}`),
    ]);
    const { data: canAttempt, error: rateLimitError } = await adminClient.rpc('check_staff_login_rate_limit', {
      p_ip_hash: ipHash,
      p_identifier_hash: identifierHash,
    });
    if (rateLimitError) throw rateLimitError;
    if (!canAttempt) return jsonResponse({ ok: false, code: 'RATE_LIMITED' });

    const { data: byUsername, error: usernameError } = await adminClient
      .from('staff_users')
      .select('id, username, email, password, role, full_name, account_status, archived_at, auth_user_id')
      .eq('username', identifier)
      .maybeSingle();
    if (usernameError) throw usernameError;

    let account = byUsername;
    if (!account && identifier.includes('@')) {
      const { data: byEmail, error: emailError } = await adminClient
        .from('staff_users')
        .select('id, username, email, password, role, full_name, account_status, archived_at, auth_user_id')
        .eq('email', identifier)
        .maybeSingle();
      if (emailError) throw emailError;
      account = byEmail;
    }

    if (!account) return jsonResponse({ ok: false, code: 'INVALID_CREDENTIALS' });

    let passwordMatches = false;
    if (typeof account.password === 'string' && account.password.startsWith('$2')) {
      passwordMatches = await bcrypt.compare(password, account.password);
    } else {
      passwordMatches = password === account.password;
    }
    if (!passwordMatches) return jsonResponse({ ok: false, code: 'INVALID_CREDENTIALS' });
    if (account.archived_at) return jsonResponse({ ok: false, code: 'ARCHIVED' });

    const accountStatus = String(account.account_status || 'Approved').toLowerCase();
    if (accountStatus === 'pending') return jsonResponse({ ok: false, code: 'PENDING' });
    if (accountStatus === 'rejected') return jsonResponse({ ok: false, code: 'REJECTED' });

    const normalizedRole = account.id === 1
      ? 'manager'
      : account.id === 2
        ? 'dentist'
        : account.id === 3
          ? 'assistant'
          : account.id === 4
            ? 'patient'
            : String(account.role || '').toLowerCase();
    if (!['manager', 'dentist', 'assistant', 'patient'].includes(normalizedRole)) {
      return jsonResponse({ ok: false, code: 'INVALID_CREDENTIALS' });
    }

    if (!account.password.startsWith('$2')) {
      const passwordHash = await bcrypt.hash(password, 10);
      const { error } = await adminClient.from('staff_users')
        .update({ password: passwordHash })
        .eq('id', account.id);
      if (error) throw error;
      account.password = passwordHash;
    }

    const syntheticEmail = `staff-${account.id}@users.lumident.invalid`;
    let authUserId = account.auth_user_id;

    if (authUserId) {
      const { error } = await adminClient.auth.admin.updateUserById(authUserId, {
        email: syntheticEmail,
        password,
        email_confirm: true,
        user_metadata: {
          staff_user_id: account.id,
          role: normalizedRole,
          full_name: account.full_name || account.username,
        },
      });
      if (error) throw error;
    } else {
      const { data, error } = await adminClient.auth.admin.createUser({
        email: syntheticEmail,
        password,
        email_confirm: true,
        user_metadata: {
          staff_user_id: account.id,
          role: normalizedRole,
          full_name: account.full_name || account.username,
        },
      });
      if (error) throw error;
      if (!data.user) throw new Error('Supabase Auth did not return a user after creation.');
      authUserId = data.user.id;

      const { data: linkedAccount, error: linkError } = await adminClient.from('staff_users')
        .update({ auth_user_id: authUserId })
        .eq('id', account.id)
        .is('auth_user_id', null)
        .select('auth_user_id')
        .maybeSingle();
      if (linkError || !linkedAccount) {
        const { error: cleanupError } = await adminClient.auth.admin.deleteUser(authUserId);
        if (cleanupError) console.error('Could not remove an unlinked Supabase Auth user:', cleanupError);
        if (linkError) throw linkError;
        throw new Error('Staff authentication link changed during sign-in. Please try again.');
      }
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: signedIn, error: signInError } = await authClient.auth.signInWithPassword({
      email: syntheticEmail,
      password,
    });
    if (signInError || !signedIn.session) throw signInError || new Error('Supabase Auth did not return a session.');

    return jsonResponse({
      ok: true,
      session: signedIn.session,
      user: {
        id: account.id,
        role: normalizedRole,
        full_name: account.full_name || account.username,
      },
    });
  } catch (error) {
    console.error('Staff authentication failed:', error);
    return jsonResponse({ ok: false, code: 'AUTH_UNAVAILABLE' }, 500);
  }
});
