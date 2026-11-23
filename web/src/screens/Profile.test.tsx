// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Me } from "../api";
import { fail, fakeServer, me, renderScreen } from "../test/harness";
import { Profile } from "./Profile";

const INTERESTS = [
  { id: "chess", name: "Chess", description: null, image: null },
  { id: "music", name: "Music", description: null, image: null },
];

// Was e2e F4 "edit your profile and change your password".
describe("Profile", () => {
  it("saves a new picture, saves interests, and changes the password", async () => {
    let player: Me = me({ interests: [{ id: "chess", name: "Chess" }] });
    const server = fakeServer({
      "GET /user/me": () => player,
      "GET /interest": INTERESTS,
      [`GET /user/${player.id}/travels`]: fail(404, "No travels in this test."),
      "PATCH /user/me": ({ user }) => (player = { ...player, ...(user.interests ? { interests: INTERESTS.filter((i) => user.interests.includes(i.id)) } : user) }),
      "POST /user/password": ({ current }) => (current === "password123" ? {} : fail(400, "Your current password is wrong.")),
    });
    const user = userEvent.setup();
    renderScreen(<Profile />, { signedIn: player });

    // Choose a profile picture: it shows at the top of the profile, with its own "Saved.".
    const picture = await screen.findByRole("region", { name: "Profile picture" });
    await user.click(within(picture).getByRole("radio", { name: /bald, bearded man/ }));
    await user.click(within(picture).getByRole("button", { name: "Save picture" }));
    expect(await within(picture).findByText("Saved.")).toBeTruthy();
    expect(server.to("PATCH", "/user/me")[0]!.body).toEqual({ user: { image: "/avatars/3.webp" } });
    await waitFor(() => expect(screen.getByRole("region", { name: "Your profile" }).querySelector('img[src="/avatars/3.webp"]')).toBeTruthy());

    // Interests: Chess is already ticked; add Music and save. (The picture's "Saved." is still up, so look in this form.)
    const about = screen.getByRole("heading", { name: "About you" }).closest("form")!;
    expect((await within(about).findByRole("checkbox", { name: "Chess" }) as HTMLInputElement).checked).toBe(true);
    await user.click(within(about).getByRole("checkbox", { name: "Music" }));
    await user.click(within(about).getByRole("button", { name: "Save" }));
    expect(await within(about).findByText("Saved.")).toBeTruthy();
    expect(server.to("PATCH", "/user/me")[1]!.body).toEqual({ user: { interests: ["chess", "music"], profileMode: "PUBLIC" } });

    // Password: the wrong current one is refused, the right one goes through.
    const password = screen.getByRole("heading", { name: "Change password" }).closest("form")!;
    await user.type(screen.getByLabelText("Current password"), "wrong-one");
    await user.type(screen.getByLabelText("New password"), "a-new-password");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect((await within(password).findByRole("alert")).textContent).toMatch(/current password is wrong/);
    await user.clear(screen.getByLabelText("Current password"));
    await user.type(screen.getByLabelText("Current password"), "password123");
    await user.click(screen.getByRole("button", { name: "Change password" }));
    expect(await within(password).findByText("Password changed.")).toBeTruthy();
    expect(server.to("POST", "/user/password").map((c) => c.body)).toEqual([
      { current: "wrong-one", next: "a-new-password" },
      { current: "password123", next: "a-new-password" },
    ]);
  });
});
