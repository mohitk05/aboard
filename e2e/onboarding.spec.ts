import { ensureWorld, expect, signUpToTutorial, test } from "./fixtures";

// Set SHOTS=<dir> to also save a screenshot of every screen (for a visual check).
const dir = process.env.SHOTS;

// The new-player tutorial: six screens from the story to boarding the first train.
test("a new player is taken through the tutorial, and boards a train", async ({ page, request }) => {
  test.setTimeout(180_000);
  await ensureWorld(request);
  await signUpToTutorial(page);
  const shot = async (n: number) => {
    if (dir) {
      await page.waitForTimeout(2500); // let the globe fly to where the screen points
      await page.screenshot({ path: `${dir}/onboarding-${n}.png` });
    }
  };

  // 1-3: the story, in three beats.
  await expect(page.getByRole("heading", { name: "We cooled the sky and warmed the sea." })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Step 1 of 6")).toBeVisible();
  await shot(1);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "Steel now crosses every continent." })).toBeVisible();
  await expect(page.getByText("Step 2 of 6")).toBeVisible();
  await shot(2);
  await page.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("heading", { name: "You couldn't leave. You stayed." })).toBeVisible();
  await expect(page.getByText("Step 3 of 6")).toBeVisible();
  await expect(page.getByRole("link", { name: "Read the full history" })).toBeVisible();
  await shot(3);
  await page.getByRole("button", { name: "Arrive" }).click();

  // 4: the grant.
  await expect(page.getByRole("heading", { name: "Welcome, traveller." })).toBeVisible();
  await expect(page.getByText("Step 4 of 6")).toBeVisible();
  await expect(page.getByText("5,000", { exact: true })).toBeVisible();
  await shot(4);
  await page.getByRole("button", { name: "Accept the grant" }).click();

  // 5: the towns that need bread: the nearest station to Berlin comes first.
  await expect(page.getByText("Step 5 of 6")).toBeVisible();
  await expect(page.getByRole("heading", { name: /You are the only supply line within \d/ })).toBeVisible();
  await expect(page.getByText(/4,000 people · 38 h left/)).toBeVisible();
  await shot(5);
  await page.getByRole("button", { name: /^Feed .+ first$/ }).click();

  // 6: the mission and the train; boarding buys the ticket and leaves the tutorial.
  await expect(page.getByText("Step 6 of 6")).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Make bread\. Save / })).toBeVisible();
  await shot(6);
  await page.getByRole("button", { name: "Board the train" }).click();
  await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/$/);
});
