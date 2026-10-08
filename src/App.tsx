import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { DataProvider, useData } from "./state/DataContext";
import { LoginPage } from "./pages/LoginPage";

function Shell() {
  const { state, refresh, api } = useData();
  if (state.phase === "loading") return <main className="page center muted">Loading…</main>;
  if (state.phase === "signed_out") return <LoginPage api={api} onSignedIn={refresh} />;
  if (state.phase === "error") {
    return (
      <main className="page center stack">
        <h1>Can't reach TravStats</h1>
        <p className="muted">{state.message}</p>
        <button className="button primary" onClick={() => void refresh()}>
          Retry
        </button>
      </main>
    );
  }
  return (
    <>
      <main className="page">
        <Routes>
          <Route path="/" element={<p>Home</p>} />
          <Route path="/trips" element={<p>Trips</p>} />
          <Route path="/settings" element={<p>Settings</p>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <BottomNav />
    </>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <DataProvider>
        <Shell />
      </DataProvider>
    </BrowserRouter>
  );
}
