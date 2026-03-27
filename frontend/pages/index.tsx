// pages/index.tsx — Login Screen (WOW #1: Google → OneChain address)
// Phase [2.1] — BLUEPRINT.md: Google + zk proof auth flow + OAuth callback handler

import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { startLogin, completeLogin, getStoredSession, startDemoLogin } from '../auth/zklogin';
import { CHAIN_LABEL } from '../lib/chain';

const JUDGE_MODE = process.env.NEXT_PUBLIC_JUDGE_MODE === 'true';

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Check for OAuth callback (id_token in URL hash)
  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', ''));
    const idToken = params.get('id_token');

    if (idToken) {
      handleCallback(idToken);
      return;
    }

    // If already logged in, redirect to hero screen
    const session = getStoredSession();
    if (session.address && session.hasApiSession && (session.hasProof || JUDGE_MODE)) {
      router.push('/hero');
    }
  }, []);

  async function handleCallback(jwt: string) {
    setStatus('loading');
    try {
      const { address } = await completeLogin(jwt);
      console.log('[login] Derived address:', address);
      // Clean URL (remove id_token from hash)
      window.history.replaceState({}, '', window.location.pathname);
      router.push('/hero');
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message ?? 'ZK proof generation failed. Please try again.');
    }
  }

  async function handleLogin() {
    setStatus('loading');
    setErrorMsg('');
    try {
      await startLogin();
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message ?? 'Login failed. Please try again.');
    }
  }

  async function handleJudgeMode() {
    setStatus('loading');
    setErrorMsg('');
    try {
      await startDemoLogin();
      router.push('/hero');
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message ?? 'Judge mode login failed.');
    }
  }

  return (
    <main style={styles.container}>
      <div style={styles.card}>
        {/* Logo & Title */}
        <div style={styles.logo}>⚔️</div>
        <h1 style={styles.title}>OneRealm</h1>
        <p style={styles.subtitle}>GameFi fantasy economy on {CHAIN_LABEL}. Play with Google. Own your loot.</p>

        {/* Auth states */}
        {status === 'idle' && (
          <>
            <button onClick={handleLogin} style={styles.googleBtn}>
              <span style={{ marginRight: 10 }}>🔑</span>
              Login with Google
            </button>
            {JUDGE_MODE && (
              <button onClick={handleJudgeMode} style={styles.demoBtn}>
                <span style={{ marginRight: 10 }}>⚡</span>
                Enter Judge Mode
              </button>
            )}
          </>
        )}

        {status === 'loading' && (
          <div style={styles.loadingBox}>
            <div style={styles.spinner} />
            <p style={styles.loadingText}>
              {window?.location?.hash?.includes('id_token')
                ? 'Generating ZK proof...'
                : 'Connecting to Google...'}
            </p>
            <p style={styles.loadingSubtext}>This takes 2-5 seconds</p>
          </div>
        )}

        {status === 'error' && (
          <div style={styles.errorBox}>
            <p style={styles.errorText}>⚠️ {errorMsg}</p>
            <button onClick={() => setStatus('idle')} style={styles.retryBtn}>
              Try again
            </button>
          </div>
        )}

        {/* Features */}
        <div style={styles.features}>
          <div style={styles.feature}>
            <span>🔐</span><span>Zero wallet setup — just Google</span>
          </div>
          <div style={styles.feature}>
            <span>⚡</span><span>Zero gas — we sponsor every tx</span>
          </div>
          <div style={styles.feature}>
            <span>🏆</span><span>Equipment truly owned on-chain</span>
          </div>
        </div>
        <Link href="/about" style={styles.aboutLink}>
          Why this fits OneHack →
        </Link>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontFamily: "'Inter', sans-serif",
  },
  card: {
    background: 'rgba(255,255,255,0.05)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 24,
    padding: '48px 40px',
    maxWidth: 400,
    width: '90%',
    textAlign: 'center',
    boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
  },
  logo:  { fontSize: 64, marginBottom: 16 },
  title: { fontSize: 36, fontWeight: 800, color: '#fff', margin: '0 0 8px' },
  subtitle: { color: 'rgba(255,255,255,0.6)', fontSize: 15, marginBottom: 36, lineHeight: 1.5 },
  googleBtn: {
    width: '100%', padding: '16px 24px',
    background: 'linear-gradient(135deg, #667eea, #764ba2)',
    color: '#fff', border: 'none', borderRadius: 12,
    fontSize: 16, fontWeight: 600, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 0.2s',
  },
  demoBtn: {
    width: '100%', padding: '16px 24px',
    background: 'rgba(255,255,255,0.08)',
    color: '#fff', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 12,
    fontSize: 16, fontWeight: 700, cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 0.2s', marginTop: 12,
  },
  loadingBox: { padding: '24px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 },
  spinner: {
    width: 40, height: 40,
    border: '3px solid rgba(255,255,255,0.2)',
    borderTop: '3px solid #667eea',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
  },
  loadingText:    { color: '#fff', fontWeight: 600, margin: 0 },
  loadingSubtext: { color: 'rgba(255,255,255,0.5)', fontSize: 13, margin: 0 },
  errorBox:  { background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 12, padding: 16, marginBottom: 16 },
  errorText: { color: '#fca5a5', margin: '0 0 12px', fontSize: 14 },
  retryBtn: {
    background: 'rgba(255,255,255,0.1)', color: '#fff',
    border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8,
    padding: '8px 20px', cursor: 'pointer', fontSize: 14,
  },
  features: { marginTop: 36, display: 'flex', flexDirection: 'column', gap: 12 },
  feature:  { display: 'flex', gap: 10, alignItems: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 14 },
  aboutLink: {
    display: 'inline-block',
    marginTop: 28,
    color: '#c4b5fd',
    fontSize: 14,
    textDecoration: 'none',
    fontWeight: 700,
  },
};
