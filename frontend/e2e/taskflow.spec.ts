import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

async function openMobileNavigation(page: Page) {
  if ((page.viewportSize()?.width ?? 1200) <= 760) {
    await page.getByRole("button", { name: "Open menu" }).click();
  }
}

test("account registration, task lifecycle, and user isolation", async ({ page, browser }) => {
  const suffix = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  const firstEmail = `first-${suffix}@example.com`;
  const password = "TaskFlow!Secure2026";

  await page.goto("/signup");
  const signupAccessibility = await new AxeBuilder({ page }).analyze();
  expect(signupAccessibility.violations).toEqual([]);
  await page.getByLabel("Full name").fill("First TaskFlow User");
  await page.getByLabel("Email").fill(firstEmail);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm password").fill(password);
  await page.getByLabel(/I agree to the/).check();
  const firstLogin = page.waitForResponse((response) => response.url().endsWith("/auth/login"));
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page).toHaveURL(/\/app$/);
  await firstLogin;
  await expect(
    page.getByRole("heading", { name: /^Good (morning|afternoon|evening),/ }),
  ).toBeVisible();
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.getByRole("button", { name: "Quick add" }).click();
  await page.getByPlaceholder("What needs doing?").fill(`Isolation task ${suffix}`);
  await page.getByLabel("Priority").selectOption("medium");
  const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const localDueAt = `${dueAt.getFullYear()}-${String(dueAt.getMonth() + 1).padStart(2, "0")}-${String(dueAt.getDate()).padStart(2, "0")}T12:00`;
  await page.getByLabel("Deadline", { exact: true }).fill(localDueAt);
  await page.getByLabel("External link").fill("https://example.com/task-reference");
  await page.getByRole("button", { name: "Add task" }).click();
  await expect(page.getByText(`Isolation task ${suffix}`)).toBeVisible();
  const taskLink = page.getByRole("link", { name: `Isolation task ${suffix}` });
  await taskLink.click();
  const taskAccessibility = await new AxeBuilder({ page }).analyze();
  expect(taskAccessibility.violations).toEqual([]);
  const attachmentResponse = page.waitForResponse(
    (response) => response.url().includes("/attachments") && response.request().method() === "POST",
  );
  await page.getByLabel("Attach an image").setInputFiles({
    name: "one-pixel.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
      "base64",
    ),
  });
  await page.getByRole("button", { name: "Upload image" }).click();
  const attachmentData = (await (await attachmentResponse).json()) as { id: string };
  expect(attachmentData.id, JSON.stringify(attachmentData)).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  await expect(page.getByRole("link", { name: "Open external link" })).toHaveAttribute(
    "href",
    "https://example.com/task-reference",
  );
  const priorityResponse = page.waitForResponse(
    (response) => response.url().includes("/tasks/") && response.request().method() === "PATCH",
  );
  await page.getByLabel("Priority").selectOption("high");
  await priorityResponse;
  await expect(page.getByLabel("Priority")).toHaveValue("high");
  const updatedDueAt = `${dueAt.getFullYear()}-${String(dueAt.getMonth() + 1).padStart(2, "0")}-${String(dueAt.getDate()).padStart(2, "0")}T14:30`;
  const dueResponse = page.waitForResponse(
    (response) => response.url().includes("/tasks/") && response.request().method() === "PATCH",
  );
  await page.getByLabel("Deadline", { exact: true }).fill(updatedDueAt);
  await page.getByLabel("Estimated duration (minutes)").click();
  await dueResponse;
  const editedTitle = `Edited task ${suffix}`;
  const editResponse = page.waitForResponse(
    (response) => response.url().includes(`/tasks/`) && response.request().method() === "PATCH",
  );
  await page.getByLabel("Title").fill(editedTitle);
  await page.getByLabel("Title").press("Tab");
  await editResponse;
  await expect(page.getByRole("heading", { name: editedTitle })).toBeVisible();
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.getByText("Completed").first()).toBeVisible();
  await page.getByRole("button", { name: "Reopen", exact: true }).click();
  await expect(page.getByText("Pending").first()).toBeVisible();
  await openMobileNavigation(page);
  await page.getByRole("link", { name: "Overview" }).click();
  await expect(page.getByText(editedTitle)).toBeVisible();
  await openMobileNavigation(page);
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto("/app/tasks");
  await expect(page).toHaveURL(/\/login$/);

  // Account isolation is viewport-independent; run it once to stay inside the signup rate limit.
  if (test.info().project.name !== "desktop") return;

  const secondContext = await browser.newContext();
  const secondPage = await secondContext.newPage();
  await secondPage.goto("/signup");
  await secondPage.getByLabel("Full name").fill("Second TaskFlow User");
  await secondPage.getByLabel("Email").fill(`second-${suffix}@example.com`);
  await secondPage.getByLabel("Password", { exact: true }).fill(password);
  await secondPage.getByLabel("Confirm password").fill(password);
  await secondPage.getByLabel(/I agree to the/).check();
  const secondLogin = secondPage.waitForResponse((response) =>
    response.url().endsWith("/auth/login"),
  );
  await secondPage.getByRole("button", { name: "Create account" }).click();
  await expect(secondPage).toHaveURL(/\/app$/);
  const secondAccessToken = (await secondLogin).json().then((body) => body.access_token as string);
  await secondPage.goto("/app/tasks");
  await expect(secondPage.getByText(`Isolation task ${suffix}`)).toHaveCount(0);
  const denied = await secondContext.request.get(
    `http://127.0.0.1:5173/api/v1/attachments/${attachmentData.id}`,
    {
      headers: { Authorization: `Bearer ${await secondAccessToken}` },
    },
  );
  expect(denied.status(), JSON.stringify(await denied.json())).toBe(404);
  await secondContext.close();
});
