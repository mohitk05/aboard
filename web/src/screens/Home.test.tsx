// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { Me } from "../api";
import { departure, fakeServer, me, renderScreen, stop, waitingJourney } from "../test/harness";
import { Home } from "./Home";

const paris = stop("Paris", "France");
const berlin = stop("Berlin", "Germany");
const vladivostok = stop("Vladivostok", "Russia");
const lisbon = stop("Lisbon", "Portugal");
const LINE = "Lisbon – Vladivostok";

/** A server with one player at Paris, where the one departure is the Long Way. Buying moves them to the platform. */
function parisServer(departures = [departure("trip1", LINE, vladivostok, [berlin, vladivostok])]) {
  let player: Me = me({ currentStop: paris.id });
  const server = fakeServer({
    "GET /user/me": () => player,
    [`GET /stop/${paris.id}`]: paris,
    [`GET /stop/${paris.id}/departures`]: departures,
    "POST /ticket/buy": () => {
      player = me({ currentStop: paris.id, state: "READYTOGO", ticket: "tk1", journey: waitingJourney(paris, berlin, LINE) });
      return {};
    },
    "DELETE /ticket": () => {
      player = me({ currentStop: paris.id });
      return {};
    },
  });
  return Object.assign(server, { player: () => player });
}

// Was e2e F2 ("buy a ticket from the departures board, then cancel it" and "the end of the line has no departures").
describe("Home, at a station", () => {
  it("buys a ticket from the departures board, then cancels it after a confirmation", async () => {
    const server = parisServer();
    const user = userEvent.setup();
    renderScreen(<Home />, { signedIn: server.player() });

    const board = await screen.findByRole("region", { name: "Departures" });
    const train = await within(board).findByRole("button", { name: new RegExp(`Vladivostok.*${LINE}`) });
    expect(train.getAttribute("aria-expanded")).toBe("false");
    await user.click(train);
    expect(train.getAttribute("aria-expanded")).toBe("true");

    // Destinations after Paris, each with a fare.
    expect(within(board).getByRole("heading", { name: "Where to?" })).toBeTruthy();
    await user.click(within(board).getByRole("button", { name: /Buy a ticket to Berlin/ }));
    expect(server.to("POST", "/ticket/buy")[0]!.body).toEqual({ ticket: { trip: "trip1", from: paris.id, to: berlin.id } });

    // Now waiting on the platform with a ticket.
    expect(await screen.findByText("Paris → Berlin")).toBeTruthy();
    expect(screen.getByText(/Your train arrives in/)).toBeTruthy();
    const ticket = screen.getByRole("region", { name: "Ticket details" });
    expect(within(ticket).getByText("The Long Way", { exact: false }).textContent).toContain(LINE);

    // Cancelling asks first; "Keep it" backs out.
    await user.click(screen.getByRole("button", { name: "Cancel ticket" }));
    await user.click(screen.getByRole("button", { name: "Keep it" }));
    expect(server.to("DELETE", "/ticket")).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Cancel ticket" }));
    await user.click(screen.getByRole("button", { name: "Yes, cancel my ticket" }));

    expect(await screen.findByRole("region", { name: "At the station" })).toBeTruthy();
    expect(server.to("DELETE", "/ticket")).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole("region", { name: "Ticket details" })).toBeNull());
  });

  it("doesn't offer the station you're at as a destination", async () => {
    const server = parisServer();
    const user = userEvent.setup();
    renderScreen(<Home />, { signedIn: server.player() });
    const board = await screen.findByRole("region", { name: "Departures" });
    await user.click(await within(board).findByRole("button", { name: new RegExp(LINE) }));
    expect(within(board).queryByText("Lisbon")).toBeNull();
    expect(within(board).queryByRole("button", { name: /Buy a ticket to Paris/ })).toBeNull();
  });

  it("lists a train that ends its line here as a return run, with nothing to buy yet", async () => {
    const back = { ...departure("trip2", LINE, lisbon, []), returning: true };
    parisServer([back]);
    renderScreen(<Home />, { signedIn: me({ currentStop: paris.id }) });
    const board = await screen.findByRole("region", { name: "Departures" });
    const row = await within(board).findByLabelText(`Return run to Lisbon, ${LINE}`);
    expect(row.textContent).toContain("turns round here");
    expect(within(board).queryByRole("button", { name: /Lisbon/ })).toBeNull();
    expect(screen.queryByText(/No trains are due here right now/)).toBeNull();
  });

  it("says so when no trains are due", async () => {
    const server = parisServer([]);
    renderScreen(<Home />, { signedIn: server.player() });
    expect(await screen.findByText(/No trains are due here right now/)).toBeTruthy();
  });
});

