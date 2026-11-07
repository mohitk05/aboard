import type { ReactNode } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { ADMIN_ROLE } from "./api";
import { useMe } from "./auth";
import { Admin } from "./screens/Admin";
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

const router = createBrowserRouter([
  { path: "/", element: <Gate signedIn={<Home />} signedOut={<Landing />} /> },
  { path: "/login", element: <Gate signedIn={home} signedOut={<Login />} /> },
  { path: "/signup", element: <Gate signedIn={home} signedOut={<Signup />} /> },
  { path: "/admin", element: <Gate signedIn={<AdminOnly><Admin /></AdminOnly>} signedOut={<Navigate to="/login" replace />} /> },
  { path: "*", element: home },
]);

export function App() {
  return <RouterProvider router={router} />;
}
