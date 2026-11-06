import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const original = readFileSync(new URL("../app.js", import.meta.url), "utf8"),
  fixtures = readFileSync(
    new URL("./stadium-replay.spec.mjs", import.meta.url),
    "utf8",
  ),
  setup = fixtures.slice(
    fixtures.indexOf("const setup=`") + 13,
    fixtures.indexOf("`;\nasync function open"),
  );
async function open(page, hand, bat) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const body =
    original
      .slice(0, original.lastIndexOf("(async()=>{try{app.innerHTML="))
      .replace(/^import .*;\s*$/gm, "") + setup;
  await page.route("**/app.js", (route) =>
    route.fulfill({ contentType: "text/javascript", body }),
  );
  await page.goto("/");
  await page.evaluate(
    ({ hand, bat }) => window.openPitchActor(hand, "오버핸드", bat),
    { hand, bat },
  );
  await expect(page.locator(".be-motion-pitcher canvas")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 30000 },
  );
  await expect(page.locator("#be-replay-next")).toBeEnabled({ timeout: 30000 });
  return errors;
}
const cameraPixels = new Map();
for (const width of [390, 1080])
  for (const hand of ["우투", "좌투"])
    for (const bat of ["우타", "좌타"])
      test(
        "selected complete-frame pitcher uses the same camera " +
          width +
          " " +
          hand +
          " " +
          bat,
        async ({ page, browserName }) => {
          await page.setViewportSize({ width, height: 900 });
          const errors = await open(page, hand, bat);
          await page.locator("#be-replay-sound").uncheck();
          await page.locator("#be-replay-next").click();
          await page.clock.runFor(550);
          await page.locator("#be-replay-auto").click();
          const result = await page.evaluate(() => {
            const node = document.querySelector(".be-motion-pitcher"),
              scene = document
                .querySelector(".be-stadium-scene")
                .getBoundingClientRect(),
              zone = document
                .querySelector(".be-broadcast-zone-grid")
                .getBoundingClientRect(),
              batter = document
                .querySelector(".be-batter-render")
                .getBoundingClientRect();
            return {
              ...node._actor.inspect(),
              aspect: scene.width / scene.height,
              zone: [
                (zone.left - scene.left) / scene.width,
                (zone.top - scene.top) / scene.height,
                zone.width / scene.width,
              ],
              batter: [
                (batter.left - scene.left) / scene.width,
                (batter.top - scene.top) / scene.height,
                batter.height / scene.height,
              ],
              context: !!node.querySelector("canvas").getContext("2d"),
              canvas: node.querySelector("canvas").toDataURL(),
            };
          });
          const key = hand + bat;
          if (width === 390) cameraPixels.set(key, result.canvas);
          else expect(result.canvas).toBe(cameraPixels.get(key));
          expect(result.renderer).toBe("complete-frame-sequence");
          expect(result.source).toContain("pitcher-complete.png");
          expect(result.wholeFrame).toBe(true);
          expect(result.frame).toBe(1);
          expect(result.context).toBe(true);
          expect(result.aspect).toBeCloseTo(18 / 13, 2);
          expect(result.zone[2]).toBeCloseTo(0.22, 2);
          expect(result.zone[0]).toBeCloseTo(bat === "우타" ? 0.44 : 0.34, 2);
          expect(result.zone[1]).toBeCloseTo(0.45769, 2);
          expect(
            bat === "우타" ? result.batter[0] > 0.5 : result.batter[0] < 0.4,
          ).toBe(true);
          await page.locator(".be-stadium").scrollIntoViewIfNeeded();
          const clear = await page.evaluate(
            () =>
              document
                .querySelector(".be-replay-controls")
                .getBoundingClientRect().top -
              document.querySelector(".be-stadium").getBoundingClientRect()
                .bottom,
          );
          expect(clear).toBeGreaterThanOrEqual(-1);
          await page
            .locator(".be-stadium")
            .screenshot({
              path:
                "test-results/complete-" +
                width +
                "-" +
                hand +
                "-" +
                bat +
                ".png",
            });
          await page.clock.runFor(1000);
          expect(
            await page.evaluate(
              () =>
                document.querySelector(".be-motion-pitcher")._actor.inspect()
                  .frame,
            ),
          ).toBe(1);
          expect(errors).toEqual([]);
          await page.evaluate(() => beCloseGameReplay());
        },
      );
