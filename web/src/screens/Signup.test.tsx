// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { fail, fakeServer, me, renderScreen, stop } from "../test/harness";
import { Signup } from "./Signup";

const at = (route: string) => renderScreen(<Signup />, { route, path: "/signup" });

// Was e2e "signup is invite-only" and the form half of "an admin makes an invite link…".
describe("Signup", () => {
  it("is invite-only: no code explains why, and a bad code is refused", async () => {
    fakeServer({ "GET /invite/NOTAREALCODE": fail(404, "That invite code isn't valid.") });
    const user = userEvent.setup();
    at("/signup");
    expect(screen.getByRole("heading", { name: "Aboard is invite-only" })).toBeTruthy();

    await user.type(screen.getByLabelText(/Invite code/), "NOTAREALCODE");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("That invite code isn't valid.")).toBeTruthy();
  });

  it("takes a whole pasted link as well as a bare code", async () => {
    const server = fakeServer({ "GET /invite/ABC123": fail(409, "That invite has already been used.") });
    const user = userEvent.setup();
    at("/signup");
    await user.type(screen.getByLabelText(/Invite code/), "https://aboard.example/signup?invite=ABC123");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("That invite has already been used.")).toBeTruthy();
    expect(server.to("GET", "/invite/ABC123")).toHaveLength(1);
  });

  it("with a good invite, shows who it's for and signs the player up at home in Berlin", async () => {
    const server = fakeServer({
      "GET /invite/GOODCODE12345": { valid: true, note: "For Ada" },
      "GET /stop": [stop("Berlin", "Germany"), stop("Paris", "France")],
      "GET /interest": [{ id: "i1", name: "Trains", description: null, image: null }],
      "GET /game/catalog": { home: stop("Berlin", "Germany") },
      "POST /user/signup": ({ user }) => ({ user: me({ username: user.username }) }),
    });
    const user = userEvent.setup();
    at("/signup?invite=GOODCODE12345");

    expect(await screen.findByText(/You're invited: For Ada\./)).toBeTruthy();
    expect((await screen.findByRole("group", { name: "Starting station" })).textContent).toContain("Berlin, Germany");

    await user.type(screen.getByLabelText("Username"), "ada");
    await user.type(screen.getByLabelText("Email"), "ada@example.test");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.type(screen.getByLabelText("Age"), "30");
    await user.click(await screen.findByRole("checkbox", { name: "Trains" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Start travelling" }) as HTMLButtonElement).disabled).toBe(false));
    await user.click(screen.getByRole("button", { name: "Start travelling" }));

    await waitFor(() => expect(server.to("POST", "/user/signup")).toHaveLength(1));
    expect(server.to("POST", "/user/signup")[0]!.body.user).toMatchObject({
      username: "ada",
      email: "ada@example.test",
      age: 30,
      interests: ["i1"],
      profileMode: "PUBLIC",
      invite: "GOODCODE12345",
    });
  });
});
