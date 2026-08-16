import { test, expect, type Page } from "@playwright/test";

/**
 * A dropdown that opens into a container hiding its overflow gets cut, and the
 * options outside it cannot be clicked even though the DOM still lists them.
 * It has happened twice: first to the header chips, then to every dropdown on
 * Advanced settings, where the Appearance card holds a single row and swallowed
 * all three theme options.
 *
 * These run against the frontend alone, so anything needing the Rust side
 * (microphones, models, languages) is absent. Advanced settings is used because
 * its dropdowns are static and it is where the bug showed up.
 */

/** Controls that open a list, told apart from block headers by their chevron. */
const CONTROL = '.vc-block button:has(svg path[d="M19 9l-7 7-7-7"])';

async function irAAvanzados(page: Page) {
  await page.goto("/");
  await page.locator('[data-section="advanced"]').click();
  await expect(page.locator(".vc-block").first()).toBeVisible();
}

/**
 * The list closes on a mousedown outside it and nothing else, Escape included,
 * so that is how a test has to close it. Left open, it covers the next control
 * and swallows the click meant for it.
 */
async function cerrar(page: Page) {
  await page.evaluate(() =>
    document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })),
  );
}

/**
 * How far the open panel sticks out of the frame that clips it. A list too long
 * for the window is fine, that is what its scrollbar is for; a list reaching
 * past an edge it cannot cross is the bug, because nothing there is reachable
 * and nothing says so.
 */
async function desbordamiento(page: Page) {
  return page.evaluate(() => {
    const panel = document.querySelector(".vc-block .absolute.z-50");
    if (!panel) return null;
    let arriba = 0;
    let abajo = window.innerHeight;
    for (let e = panel.parentElement; e; e = e.parentElement) {
      if (getComputedStyle(e).overflow !== "visible") {
        const r = e.getBoundingClientRect();
        arriba = Math.max(arriba, r.top);
        abajo = Math.min(abajo, r.bottom);
      }
    }
    const p = panel.getBoundingClientRect();
    return Math.round(Math.max(0, p.bottom - abajo, arriba - p.top));
  });
}

/**
 * Every control on the page, opened one at a time. Block headers carry the same
 * chevron and open no list, so `mirar` gets null for them; it returns whether it
 * measured anything, and the count is asserted at the end. Without that a
 * selector that quietly matches nothing passes for a clean run.
 */
async function porCadaDesplegable(
  page: Page,
  mirar: (indice: number) => Promise<boolean>,
) {
  const controles = page.locator(CONTROL);
  const cuantos = await controles.count();
  expect(cuantos, "no controls found, the page did not render").toBeGreaterThan(0);

  let medidos = 0;
  for (let i = 0; i < cuantos; i++) {
    const control = controles.nth(i);
    await control.scrollIntoViewIfNeeded();
    await control.click();
    await expect(page.locator(".vc-block .absolute.z-50")).toHaveCount(1, {
      timeout: 1000,
    }).catch(() => {});
    if (await mirar(i)) medidos++;
    await cerrar(page);
  }
  expect(medidos, "no dropdown actually opened, so nothing was checked").toBeGreaterThan(0);
}

test.describe("dropdowns", () => {
  test("a settings card does not clip what opens inside it", async ({ page }) => {
    await irAAvanzados(page);

    const recorta = await page.evaluate(() =>
      [...document.querySelectorAll(".vc-block")].some(
        (bloque) => getComputedStyle(bloque).overflow !== "visible",
      ),
    );
    expect(recorta, ".vc-block must not hide its overflow").toBe(false);
  });

  test("the theme dropdown shows all three of its options", async ({ page }) => {
    await irAAvanzados(page);
    // The one from the bug report: a card of a single row, so the list had
    // nowhere to go and every option landed outside it.
    await page.locator('[data-tour="theme-selector"] button').first().click();

    const alcanzables = await page.evaluate(() => {
      const panel = document.querySelector('[data-tour="theme-selector"] .absolute');
      if (!panel) return -1;
      return [...panel.querySelectorAll("button")].filter((opcion) => {
        const c = opcion.getBoundingClientRect();
        const encima = document.elementFromPoint(
          c.left + c.width / 2,
          c.top + c.height / 2,
        );
        return encima && (encima === opcion || opcion.contains(encima));
      }).length;
    });
    expect(alcanzables, "theme options that can be clicked").toBe(3);
  });

  for (const alto of [760, 420]) {
    test(`no dropdown reaches past its edges in a ${alto}px window`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1000, height: alto });
      await irAAvanzados(page);

      await porCadaDesplegable(page, async (i) => {
        const fuera = await desbordamiento(page);
        if (fuera === null) return false;
        expect(fuera, `dropdown ${i} reaches ${fuera}px past its edge`).toBe(0);
        return true;
      });
    });
  }
});
