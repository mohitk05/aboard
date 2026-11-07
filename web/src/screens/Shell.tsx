import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { ADMIN_ROLE } from "../api";
import { useLogout, useMe } from "../auth";
import { Page } from "../ui";

/** Layout for signed-in screens: brand, navigation, log out. */
export function Shell({ children }: { children: ReactNode }) {
  const me = useMe().data;
  const logout = useLogout();
  return (
    <Page
      actions={
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>
            Journey
          </NavLink>
          {me?.role === ADMIN_ROLE && <NavLink to="/admin">Admin</NavLink>}
          <button className="linklike" onClick={() => logout.mutate()} disabled={logout.isPending}>
            Log out
          </button>
        </nav>
      }
    >
      {children}
    </Page>
  );
}
