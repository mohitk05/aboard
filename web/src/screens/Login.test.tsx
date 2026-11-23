// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fail, fakeServer, me, renderScreen } from "../test/harness";
import { Login } from "./Login";

// Was part of e2e F0: a wrong password is refused with a message, the right one logs in.
describe("Login", () => {
  it("shows the server's refusal, then logs in with the corrected password", async () => {
    let attempts = 0;
    const server = fakeServer({
      "POST /user/login": ({ user }) => (++attempts === 1 ? fail(401, "Wrong email or password.") : { user: me({ email: user.email }) }),
    });
    const user = userEvent.setup();
    renderScreen(<Login />);

    await user.type(screen.getByLabelText("Email"), "ada@example.test");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Wrong email or password/);

    await user.clear(screen.getByLabelText("Password"));
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    expect(server.to("POST", "/user/login").map((c) => c.body)).toEqual([
      { user: { email: "ada@example.test", password: "wrong-password" } },
      { user: { email: "ada@example.test", password: "password123" } },
    ]);
  });
});
