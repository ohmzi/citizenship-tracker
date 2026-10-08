import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { DataProvider, useData } from "./state/DataContext";
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/LoginPage";
import { SettingsPage } from "./pages/SettingsPage";

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
          <Route path="/" element={<HomePage data={state.data} />} />
          <Route path="/trips" element={<p>Trips</p>} />
          <Route path="/settings" element={<SettingsPage data={state.data} api={api} onSaved={refresh} />} />
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
