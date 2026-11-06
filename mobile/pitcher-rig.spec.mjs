import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
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
  await page.route(/\/app\.js(?:\?.*)?$/, (route) =>
    route.fulfill({ contentType: "text/javascript", body }),
  );
  await page.goto(process.env.BE_TEST_ENTRY || "/");
  await expect
    .poll(
      () => page.evaluate(() => typeof window.openPitchActor === "function"),
      { timeout: 30000 },
    )
    .toBe(true);
  await page.evaluate(
    ({ hand, bat }) => {
      document.body.insertAdjacentHTML(
        "beforeend",
        '<nav id="underlying-game-nav" style="position:fixed;bottom:0;left:0;right:0;height:80px;z-index:30;background:white">홈 · 선수 · 뉴스 · 리그</nav>',
      );
      window.openPitchActor(hand, "오버핸드", bat);
    },
    { hand, bat },
  );
  await expect(page.locator("#be-replay-next")).toBeEnabled({ timeout: 30000 });
  return errors;
}
async function checkFooter(page) {
  const r = await page.evaluate(() => {
    const overlay = document.querySelector("#be-replay-overlay"),
      controls = overlay.querySelector(".be-replay-controls"),
      dialog = overlay.querySelector(".be-replay-dialog"),
      c = controls.getBoundingClientRect(),
      d = dialog.getBoundingClientRect();
    return {
      direct: controls.parentElement === overlay,
      inDialog: controls.closest('[role="dialog"]') === overlay,
      bottom: c.bottom,
      top: c.top,
      dialogBottom: d.bottom,
      viewport: innerHeight,
      selectRight: controls.querySelector("select").getBoundingClientRect()
        .right,
      viewportWidth: innerWidth,
      covered: !!document
        .elementFromPoint(innerWidth / 2, innerHeight - 12)
        ?.closest(".be-replay-controls"),
      htmlOverflow: document.documentElement.style.overflow,
    };
  });
  expect(r.direct).toBe(true);
  expect(r.inDialog).toBe(true);
  expect(r.bottom).toBeCloseTo(r.viewport, 0);
  expect(r.dialogBottom).toBeLessThanOrEqual(r.top + 1);
  expect(r.covered).toBe(true);
  expect(r.selectRight).toBeLessThanOrEqual(r.viewportWidth);
  expect(r.htmlOverflow).toBe("hidden");
}
for (const hand of ["우투", "좌투"])
  for (const bat of ["우타", "좌타"])
    test(
      "pitcher is opposite batter and modal owns its footer " +
        hand +
        " " +
        bat,
      async ({ page, browserName }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        const errors = await open(page, hand, bat);
        await checkFooter(page);
        await page.screenshot({
          path:
            "test-results/modal-ready-" +
            browserName +
            "-" +
            hand +
            "-" +
            bat +
            ".png",
        });
        await page.locator("#be-replay-sound").uncheck();
        await page.locator("#be-replay-next").click();
        await page.clock.runFor(550);
        await page.locator("#be-replay-auto").click();
        let pixels;
        for (const width of [390, 1080]) {
          await page.setViewportSize({
            width,
            height: width === 390 ? 844 : 900,
          });
          await page.clock.runFor(50);
          await checkFooter(page);
          const result = await page.evaluate(() => {
            const node = document.querySelector(".be-motion-pitcher"),
              scene = document
                .querySelector(".be-stadium-scene")
                .getBoundingClientRect(),
              zone = document
                .querySelector(".be-broadcast-zone-grid")
                .getBoundingClientRect();
            return {
              ...node._actor.inspect(),
              aspect: scene.width / scene.height,
              zone: [
                (zone.left - scene.left) / scene.width,
                zone.width / scene.width,
              ],
              canvas: node.querySelector("canvas").toDataURL(),
            };
          });
          const digest = createHash("sha256")
            .update(result.canvas)
            .digest("hex");
          if (pixels) expect(digest).toBe(pixels);
          else pixels = digest;
          expect(result.renderer).toBe("complete-frame-sequence");
          expect(result.wholeFrame).toBe(true);
          expect(result.frame).toBe(1);
          expect(result.aspect).toBeCloseTo(18 / 13, 2);
          expect(result.zone[1]).toBeCloseTo(0.22, 2);
          expect(result.zone[0]).toBeCloseTo(bat === "우타" ? 0.44 : 0.34, 2);
          const x = result.registration.mirror
            ? 720 - result.registration.pivot[0]
            : result.registration.pivot[0];
          expect(x).toBe(bat === "좌타" ? 500 : 220);
          expect(result.registration.mirror).toBe(hand === "좌투");
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
          await page.locator(".be-stadium").screenshot({
            path:
              "test-results/opposite-" +
              browserName +
              "-" +
              width +
              "-" +
              hand +
              "-" +
              bat +
              ".png",
          });
        }
        expect(errors).toEqual([]);
        await page.evaluate(() => beCloseGameReplay());
        expect(
          await page.evaluate(() => document.documentElement.style.overflow),
        ).toBe("");
      },
    );
