// ── SUPABASE ──────────────────────────────────────────────────────────────────

const SUPABASE_URL      = 'https://qmeqdrzgsyiacwxjpdjk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtZXFkcnpnc3lpYWN3eGpwZGprIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzY3MDIsImV4cCI6MjA5MjQ1MjcwMn0.600_RzDrvlimAXLxNZrnzR1ieymPPwxavdkdM4h3wpU';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ── UTILITIES ─────────────────────────────────────────────────────────────────

function _esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── CHARACTER CACHE ───────────────────────────────────────────────────────────

let _chars = null;

async function loadCharacters() {
  if (_chars) return _chars;
  const { data, error } = await db
    .from('characters')
    .select('*')
    .order('sort_order');
  if (error) {
    console.error('Failed to load characters:', error.message);
    return [];
  }
  _chars = data || [];
  return _chars;
}
