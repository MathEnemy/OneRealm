// Layout.tsx is now a thin re-export alias so any existing imports continue to work.
// The actual implementation lives in components/layout/AppShell.tsx
import { AppShell } from './layout/AppShell';

export function Layout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
