import type { ReactNode } from "react";
import { createBrowserRouter, Navigate, RouterProvider } from "react-router";
import { useMe } from "./auth";
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

const router = createBrowserRouter([
  { path: "/", element: <Gate signedIn={<Home />} signedOut={<Landing />} /> },
  { path: "/login", element: <Gate signedIn={home} signedOut={<Login />} /> },
  { path: "/signup", element: <Gate signedIn={home} signedOut={<Signup />} /> },
  { path: "*", element: home },
]);

export function App() {
  return <RouterProvider router={router} />;
}
