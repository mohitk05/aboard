import { useEffect, useRef, type ReactNode } from "react";
import { NavLink, useLocation } from "react-router";
import { ADMIN_ROLE } from "../api";
import { useMe } from "../auth";
import { Page } from "../ui";

/** Layout for signed-in screens: brand and navigation (a bottom tab bar on phones). */
export function Shell({ children, wide }: { children: ReactNode; wide?: boolean }) {
  const me = useMe().data;
  // On phones the tab bar scrolls sideways: keep the current tab in view.
  const nav = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useEffect(() => {
    const bar = nav.current;
    const active = bar?.querySelector<HTMLElement>("a.active");
    if (!bar || !active || bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollLeft = active.offsetLeft - (bar.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);
  return (
    <Page
      wide={wide}
      actions={
        <nav className="nav" aria-label="Main" ref={nav}>
          <NavLink to="/" end>
            Journey
          </NavLink>
          <NavLink to="/business">Business</NavLink>
          <NavLink to="/story">Story</NavLink>
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
