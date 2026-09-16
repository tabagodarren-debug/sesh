import { expect, test } from "@playwright/test";

test("the stopwatch starts, pauses, and resumes without drift", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await expect(page.getByRole("timer")).toHaveText("+0:00:00");
  await expect(page.locator(".focus-value")).toHaveText("+0%");

  await page.getByRole("button", { name: "Start timer" }).click();
  await page.clock.fastForward(12_000);
  await expect(page.getByRole("timer")).toHaveText("+0:00:12");

  await page.getByRole("button", { name: "Pause timer" }).click();
  await page.clock.fastForward(30_000);
  await expect(page.getByRole("timer")).toHaveText("+0:00:12");

  await page.getByRole("button", { name: "Resume timer" }).click();
  await page.clock.fastForward(8_000);
  await expect(page.getByRole("timer")).toHaveText("+0:00:20");
});

test("focus uses a fixed one-hour benchmark and today survives reset", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "Start timer" }).click();
  await page.clock.fastForward(30 * 60_000);
  await expect(page.locator(".focus-value")).toHaveText("+50%");
  await expect(page.locator(".session-metrics")).toContainText("+0:30:00");

  await page.getByRole("button", { name: "Reset current session" }).click();
  await expect(page.getByRole("timer")).toHaveText("+0:00:00");
  await expect(page.locator(".session-metrics")).toContainText("+0:30:00");
});

test("username edits inline, enforces its limit, and persists", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Edit username/ }).click();
  const input = page.getByRole("textbox", { name: "Username" });
  await input.fill("A focused SESH user with extra text");
  await input.press("Enter");
  await expect(page.getByRole("button", { name: /Edit username/ })).toHaveText(
    "A focused SESH user with",
  );
  await page.reload();
  await expect(page.getByRole("button", { name: /Edit username/ })).toHaveText(
    "A focused SESH user with",
  );
});

test("normal layout has no viewport overflow at supported sizes", async ({
  page,
}) => {
  await page.goto("/");
  for (const [width, height] of [
    [700, 475],
    [840, 570],
    [1000, 680],
  ]) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole("timer")).toBeInViewport();
    await expect(page.getByRole("button", { name: "Settings" })).toBeInViewport();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= innerWidth &&
          document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
  }
});

test("the Bibata cursor is default and the system cursor preference persists", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator(".app")).toHaveAttribute("data-cursor", "bibata");
  const settingsButton = page.getByRole("button", { name: "Settings" });
  expect(await settingsButton.evaluate((element) => getComputedStyle(element).cursor))
    .toContain("bibata-modern-ice/left_ptr.png");

  await settingsButton.click();
  await page.getByRole("menuitem", { name: "Appearance" }).click();
  await page.getByRole("button", { name: "Text", exact: true }).click();
  await page.getByRole("button", { name: "System", exact: true }).click();
  await expect(page.locator(".app")).toHaveAttribute("data-cursor", "system");
  expect(
    await page
      .getByRole("button", { name: "Done", exact: true })
      .evaluate((element) => getComputedStyle(element).cursor),
  ).toBe("pointer");

  await page.waitForTimeout(250);
  await page.reload();
  await expect(page.locator(".app")).toHaveAttribute("data-cursor", "system");
});

test("grabbing cursor lasts until left-button release, not drag acceptance", async ({ page }) => {
  await page.goto("/");
  await page.mouse.move(500, 250);
  await page.mouse.down();
  // Handing input to a native move loop can cancel the DOM pointer without releasing it.
  await page.evaluate(() => window.dispatchEvent(new PointerEvent("pointercancel")));
  await page.waitForTimeout(300);
  await expect(page.locator("html")).toHaveAttribute("data-window-dragging", "true");
  expect(await page.locator(".foreground").evaluate(el => getComputedStyle(el).cursor))
    .toContain("grabbing.png");
  await page.mouse.up();
  await expect(page.locator("html")).not.toHaveAttribute("data-window-dragging", "true");
  expect(await page.locator(".foreground").evaluate(el => getComputedStyle(el).cursor))
    .toContain("left_ptr.png");
});

test("background selection and compact mode preserve the same timer", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "Start timer" }).click();
  await page.clock.fastForward(5_000);
  await page.getByRole("button", { name: "Pause timer" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: "Background library" }).click();
  await page.getByRole("button", { name: "Orbit Space" }).click();
  await page.getByRole("button", { name: "Done", exact: true }).click();
  await page.clock.fastForward(150);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.locator(".background")).toBeVisible();

  await page.keyboard.press("c");
  await expect(page.locator(".compact-time")).toHaveText("+0:00:05");
  await expect(page.locator(".compact-focus")).toHaveText("+0%");
  await expect(page.locator(".compact-content")).toBeVisible();
  await page.keyboard.press("c");
  await expect(page.getByRole("timer")).toHaveText("+0:00:05");
});

test("double-clicking the timer toggles normal and compact modes", async ({ page }) => {
  await page.goto("/");
  await page.locator(".elapsed-block").dblclick();
  await expect(page.locator(".app")).toHaveClass(/compact/);
  await page.locator(".compact-time").dblclick();
  await expect(page.locator(".app")).toHaveClass(/normal/);
  await expect(page.locator("html")).not.toHaveAttribute("data-window-dragging", "true");
});

test("Wallhaven reports a helpful fallback outside the native app", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: "Background library" }).click();
  await page.getByRole("button", { name: "Wallhaven", exact: true }).click();
  await expect(
    page.getByText("Open the desktop app to browse Wallhaven."),
  ).toBeVisible();
});

test("session calendar retains daily hours and exposes session details", async ({
  page,
}) => {
  await page.clock.install();
  await page.goto("/");
  await page.getByRole("button", { name: "Start timer" }).click();
  await page.clock.fastForward(60 * 60_000);
  await page.getByRole("button", { name: "Pause timer" }).click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByRole("menuitem", { name: "Session calendar" }).click();

  const calendar = page.getByRole("dialog", { name: "Session calendar" });
  await expect(calendar).toBeVisible();
  await expect(calendar).toContainText("+1H00M");
  await expect(page.getByRole("button", { name: "Export calendar as PNG" })).toBeVisible();
  await page.getByRole("gridcell", { name: /highest focus time this month/ }).click();
  await expect(calendar).toContainText("Session 1");
});
