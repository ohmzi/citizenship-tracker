import { NavLink } from "react-router-dom";

const icons = {
  home: "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  trips: "M2 16l20-7-4-2-6 3-6-3-2 1 5 4-4 2-2-1-1 1 3 3z",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8-3 2-1-1-3-2 .2-1.4-1.4.2-2-3-1-1 2h-2l-1-2-3 1 .2 2L6.6 8.2 4.6 8l-1 3 2 1v2l-2 1 1 3 2-.2 1.4 1.4-.2 2 3 1 1-2h2l1 2 3-1-.2-2 1.4-1.4 2 .2 1-3-2-1z",
};

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function BottomNav() {
  const item = ({ isActive }: { isActive: boolean }) => `nav-item${isActive ? " active" : ""}`;
  return (
    <nav className="bottom-nav" aria-label="Main">
      <NavLink to="/" end className={item}>
        <Icon d={icons.home} />
        Home
      </NavLink>
      <NavLink to="/trips" className={item}>
        <Icon d={icons.trips} />
        Trips
      </NavLink>
      <NavLink to="/settings" className={item}>
        <Icon d={icons.settings} />
        Settings
      </NavLink>
    </nav>
  );
}
