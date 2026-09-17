import "./globals.css";

export const metadata = {
  title: "Agent Builder Platform",
  description: "Create and run AI agents for small businesses — no builder, no canvas.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="topbar">
          <a href="/dashboard" className="brand">Agent Builder</a>
          <nav>
            <a href="/new">New agent</a>
            <a href="/dashboard">Dashboard</a>
            <a href="/queue">Queue</a>
          </nav>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
