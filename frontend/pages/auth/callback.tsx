import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { completeLogin } from '../../auth/zklogin';
import { Card } from '../../components/ui/Card';
import { Spinner, Banner } from '../../components/ui/Feedback';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', ''));
    const idToken = params.get('id_token');

    if (!idToken) {
      setError('Missing `id_token` from OAuth callback. Return to login and try again.');
      return;
    }

    completeLogin(idToken)
      .then(() => {
        window.history.replaceState({}, '', window.location.pathname);
        router.replace('/hero');
      })
      .catch((err: any) => {
        setError(err.message ?? 'Login finalization failed. Return to login and try again.');
      });
  }, [router]);

  return (
    <main className="container flex-center" style={{ minHeight: '100vh' }}>
      <Card className="state-card" style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
        {error ? (
          <>
            <div className="state-eyebrow">Login Error</div>
            <h1 className="state-title">Unable to complete login</h1>
            <div style={{ marginTop: 16 }}>
              <Banner type="error">{error}</Banner>
            </div>
          </>
        ) : (
          <div className="loading-state" role="status" aria-live="polite" style={{ padding: 0 }}>
            <Spinner size={50} />
            <div className="state-eyebrow">Securing Session</div>
            <h1 className="state-title">Completing Login…</h1>
            <p className="state-copy">Generating the zk proof and opening the authenticated session.</p>
          </div>
        )}
      </Card>
    </main>
  );
}
