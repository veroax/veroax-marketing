// Shared layout for the (auth) route group. Adds robots:noindex to
// every page inside (login, signup). Auth surfaces should never
// appear in any search index. Client-component pages cannot export
// metadata themselves, so the layout carries it.

export const metadata = {
  robots: { index: false, follow: false },
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
