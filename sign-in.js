// Sign-in page. Accepts a `?returnTo=<url>` query param so we can bounce the
// user back where they came from after the OAuth round-trip. Defaults to the
// home page if no returnTo is provided or it's unsafe (off-origin).

function _signinReturnTo() {
  const raw = new URLSearchParams(location.search).get('returnTo') || '';
  if (!raw) return new URL('index.html', location.href).href;
  // Only allow same-origin returnTo to avoid open-redirect abuse.
  try {
    const u = new URL(raw, location.href);
    if (u.origin !== location.origin) return new URL('index.html', location.href).href;
    return u.href;
  } catch {
    return new URL('index.html', location.href).href;
  }
}

async function signinWithProvider(provider) {
  clearError('signinErr');
  const { error } = await db.auth.signInWithOAuth({
    provider,
    options: { redirectTo: _signinReturnTo() },
  });
  if (error) showError('signinErr', error.message);
}

async function _signinInit() {
  await initAuth();
  // If the user is already signed in (e.g. came here by mistake), bounce them
  // straight back to the page they intended to land on.
  if (getCurrentUser()) {
    location.replace(_signinReturnTo());
  }
}

_signinInit();
