import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { completeLogin } from '../../auth/zklogin';

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.replace('#', ''));
    const idToken = params.get('id_token');

    if (!idToken) {
      setError('Missing id_token from OAuth callback.');
      return;
    }

    completeLogin(idToken)
      .then(() => {
        window.history.replaceState({}, '', window.location.pathname);
        router.replace('/hero');
      })
      .catch((err: any) => {
        setError(err.message ?? 'Login finalization failed.');
      });
  }, []);

  return (
    <main style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>Completing Login</h1>
        {error
          ? <p style={styles.error}>{error}</p>
          : <p style={styles.text}>Generating zk proof and opening your authenticated session...</p>
        }
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)',
    color: '#fff',
    fontFamily: "'Inter', sans-serif",
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    padding: 28,
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    textAlign: 'center',
  },
  title: { margin: '0 0 12px', fontSize: 24, fontWeight: 800 },
  text: { margin: 0, color: 'rgba(255,255,255,0.75)' },
  error: { margin: 0, color: '#fca5a5' },
};
