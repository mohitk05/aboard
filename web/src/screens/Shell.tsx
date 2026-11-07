import type { ReactNode } from "react";
import { NavLink } from "react-router";
import { ADMIN_ROLE } from "../api";
import { useMe } from "../auth";
import { Page } from "../ui";

/** Layout for signed-in screens: brand and navigation (a bottom tab bar on phones). */
export function Shell({ children }: { children: ReactNode }) {
  const me = useMe().data;
  return (
    <Page
      actions={
        <nav className="nav" aria-label="Main">
          <NavLink to="/" end>
            Journey
          </NavLink>
          <NavLink to="/people">People</NavLink>
          <NavLink to="/messages">Messages</NavLink>
          <NavLink to="/profile">Profile</NavLink>
          {me?.role === ADMIN_ROLE && <NavLink to="/admin">Admin</NavLink>}
        </nav>
      }
    >
      {children}
    </Page>
  );
}
