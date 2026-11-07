import type { ReactNode } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { ADMIN_ROLE } from "./api";
import { useMe } from "./auth";
import { useLiveUpdates } from "./live";
import { WorldLayer } from "./world3d/WorldLayer";
import { Admin } from "./screens/Admin";
import { Conversation, Inbox } from "./screens/Messages";
import { People } from "./screens/People";
import { Profile } from "./screens/Profile";
import { Home } from "./screens/Home";
import { Landing } from "./screens/Landing";
import { Login } from "./screens/Login";
import { Signup } from "./screens/Signup";
import { Splash } from "./ui";

/** Waits for the session check, then shows signed-in or signed-out content. */
function Gate({ signedIn, signedOut }: { signedIn: ReactNode; signedOut: ReactNode }) {
  const me = useMe();
  if (me.isPending) return <Splash />;
  if (me.isError) return <Splash error={me.error.message} onRetry={() => me.refetch()} />;
  return <>{me.data ? signedIn : signedOut}</>;
}

const home = <Navigate to="/" replace />;

function AdminOnly({ children }: { children: ReactNode }) {
  const me = useMe().data;
  return <>{me?.role === ADMIN_ROLE ? children : home}</>;
}

function RouteError() {
  return <Splash error="Something went wrong on this screen." onRetry={() => window.location.assign("/")} />;
}

const routes = [
  { path: "/", element: <Gate signedIn={<Home />} signedOut={<Landing />} /> },
  { path: "/login", element: <Gate signedIn={home} signedOut={<Login />} /> },
  { path: "/signup", element: <Gate signedIn={home} signedOut={<Signup />} /> },
  { path: "/people", element: <Gate signedIn={<People />} signedOut={<Navigate to="/login" replace />} /> },
  { path: "/messages", element: <Gate signedIn={<Inbox />} signedOut={<Navigate to="/login" replace />} /> },
  { path: "/messages/:id", element: <Gate signedIn={<Conversation />} signedOut={<Navigate to="/login" replace />} /> },
  { path: "/profile", element: <Gate signedIn={<Profile />} signedOut={<Navigate to="/login" replace />} /> },
  { path: "/admin", element: <Gate signedIn={<AdminOnly><Admin /></AdminOnly>} signedOut={<Navigate to="/login" replace />} /> },
  { path: "*", element: home },
];

const router = createBrowserRouter(routes.map((r) => ({ ...r, errorElement: <RouteError /> })));

function Live() {
  useLiveUpdates();
  return null;
}

export function App() {
  return (
    <>
      <Live />
      <WorldLayer />
      <RouterProvider router={router} />
    </>
  );
}
