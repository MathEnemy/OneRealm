import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { startLogin, completeLogin, getStoredSession, startDemoLogin } from '../auth/zklogin';
import { CHAIN_LABEL } from '../lib/chain';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Banner } from '../components/ui/Feedback';
import { StatePanel } from '../components/ui/StatePanel';

const JUDGE_MODE = process.env.NEXT_PUBLIC_JUDGE_MODE === 'true';

export default function LoginPage() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [loadingPhase, setLoadingPhase] = useState<'google' | 'proof' | 'server'>('google');
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
    setLoadingPhase('proof');
    try {
      const { address } = await completeLogin(jwt);
      console.log('[login] Derived address:', address);
      // Clean URL (remove id_token from hash)
      window.history.replaceState({}, '', window.location.pathname);
      setLoadingPhase('server');
      router.push('/hero');
    } catch (err: any) {
      setStatus('error');
      setErrorMsg(err.message ?? 'ZK proof generation failed. Please try again.');
    }
  }

  async function handleLogin() {
    setStatus('loading');
    setLoadingPhase('google');
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
    setLoadingPhase('google');
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
    <main className="container flex-center" style={{ minHeight: '100vh', position: 'relative' }}>
      {/* Subtle radial glow */}
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(102, 126, 234, 0.15) 0%, rgba(0,0,0,0) 70%)',
        zIndex: 0,
        pointerEvents: 'none'
      }} />

      <Card style={{ maxWidth: 440, width: '100%', textAlign: 'center', padding: 'var(--space-6) var(--space-5)', position: 'relative', zIndex: 1 }}>
        {/* Logo & Title */}
        <div style={{ fontSize: 64, marginBottom: 'var(--space-3)' }}>⚔️</div>
        <h1 style={{ marginBottom: 'var(--space-2)' }}>OneRealm</h1>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 'var(--space-6)' }}>
          GameFi fantasy economy on {CHAIN_LABEL}. Play with Google. Own your loot.
        </p>

        {/* Auth states */}
        {status === 'idle' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <Button variant="primary" fullWidth onClick={handleLogin} style={{ padding: 'var(--space-4)' }} data-testid="login-google-button">
              <span style={{ marginRight: 'var(--space-2)' }}>🔑</span> Login with Google
            </Button>
            {JUDGE_MODE && (
              <Button fullWidth onClick={handleJudgeMode} style={{ padding: 'var(--space-4)' }} data-testid="login-judge-button">
                <span style={{ marginRight: 'var(--space-2)' }}>⚡</span> Enter Judge Mode
              </Button>
            )}
          </div>
        )}

        {status === 'loading' && (
          <StatePanel
            loading
            tone="info"
            eyebrow="Secure Login"
            title={
              loadingPhase === 'google'
                ? 'Connecting to Google…'
                : loadingPhase === 'proof'
                  ? 'Generating ZK proof…'
                  : 'Authenticating…'
            }
            description={loadingPhase === 'proof' ? 'This takes 2-5 seconds.' : 'Please wait…'}
            style={{ marginTop: 'var(--space-2)' }}
          />
        )}

        {status === 'error' && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <Banner type="error">{errorMsg}</Banner>
            <Button variant="secondary" onClick={() => setStatus('idle')} fullWidth style={{ marginTop: 'var(--space-3)' }}>
              Try again
            </Button>
          </div>
        )}

        {/* Features / Trust Strip */}
        <div className="stat-block" style={{ marginTop: 'var(--space-6)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', textAlign: 'left', background: 'transparent', padding: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--text-secondary)', fontSize: 14 }}>
            <span className="badge badge-info" style={{ width: 28, height: 28, justifyContent: 'center' }}>🔐</span> 
            <span>Zero wallet setup — just Google</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--text-secondary)', fontSize: 14 }}>
            <span className="badge badge-info" style={{ width: 28, height: 28, justifyContent: 'center' }}>⚡</span> 
            <span>Zero gas — we sponsor every tx</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', color: 'var(--text-secondary)', fontSize: 14 }}>
            <span className="badge badge-info" style={{ width: 28, height: 28, justifyContent: 'center' }}>🏆</span> 
            <span>Equipment truly owned on-chain</span>
          </div>
        </div>

        <div style={{ marginTop: 'var(--space-6)' }}>
          <Link href="/about" className="btn btn-ghost" style={{ fontWeight: 700 }}>
            Why this fits OneHack →
          </Link>
        </div>
      </Card>
    </main>
  );
}
