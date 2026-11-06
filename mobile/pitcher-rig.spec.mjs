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
  await expect(page.locator("#be-replay-next")).toBeEnabled({timeout:30000});
  return errors;
}
for (const hand of ["우투", "좌투"])
  for (const bat of ["우타", "좌타"])
    test(
      "physical rubber, club pixels and unclipped plate " + hand + " " + bat,
      async ({ page, browserName }) => {
        const errors = await open(page, hand, bat);
        await page.locator("#be-replay-sound").uncheck();
        await page.locator("#be-replay-next").click();
        await page.clock.runFor(550);
        await page.locator("#be-replay-auto").click();
        const result = await page.evaluate(async () => {
          const node = document.querySelector(".be-motion-pitcher"),
            actor = node._actor,
            stage = document
              .querySelector(".be-stadium-scene")
              .getBoundingClientRect(),
            batter = document
              .querySelector(".be-batter-render")
              .getBoundingClientRect(),
            hud = document
              .querySelector(".be-stadium-hud")
              .getBoundingClientRect(),
            release = actor.releasePoint(
              0,
              document.querySelector(".be-stadium").dataset.pitchHand,
            ),
            atlas = await window.beBroadcastActors.uniformAtlas(0),
            img = new Image();
          img.src = atlas;
          await img.decode();
          const canvas = document.createElement("canvas");
          canvas.width = canvas.height = 768;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0);
          const d = ctx.getImageData(0, 0, 768, 768).data;
          let green = 0,
            blue = 0;
          for (let i = 0; i < d.length; i += 4) {
            if (d[i + 3] < 200) continue;
            if (
              d[i + 1] > d[i] * 1.2 &&
              d[i + 1] > d[i + 2] * 1.2 &&
              d[i + 1] > 50
            )
              green++;
            if (
              Math.floor(i / 4 / 768) % 384 > 180 &&
              d[i + 2] > d[i] * 1.5 &&
              d[i + 2] > d[i + 1] * 1.3 &&
              d[i + 2] > 100
            )
              blue++;
          }
          return {
            ...actor.inspect(),
            release,
            green,
            blue,
            atlasPrefix: atlas.slice(0, 22),
            batter: {
              left: batter.left - stage.left,
              right: batter.right - stage.left,
            },
            hudBounds:[hud.left-stage.left,hud.top-stage.top,hud.right-stage.left,hud.bottom-stage.top],
            width: stage.width,
            noFilter: getComputedStyle(
              document.querySelector(".be-motion-batter"),
            ).filter,
          };
        });
        expect(result.phase).toBe(1);
        expect(result.rightSole[1]).toBeCloseTo(0.269, 3);
        expect(result.leftSole[1]).toBeGreaterThan(0.8);
        expect(
          hand === "우투" ? result.release[0] < 360 : result.release[0] > 360,
        ).toBe(true);
        expect(
          bat === "우타"
            ? result.batter.left > result.width / 2
            : result.batter.right < result.width / 2,
        ).toBe(true);
        expect(result.hudBounds[0]).toBeGreaterThanOrEqual(0);
        expect(result.hudBounds[2]).toBeLessThanOrEqual(result.width);
        const [hx,hy]=result.headOnScreen,[l,t,r,b]=result.hudBounds;
        expect(hx+8<l||hx-8>r||hy+8<t||hy-8>b).toBe(true);
        expect(result.green).toBeLessThan(200);
        expect(result.blue).toBeLessThan(300);
        expect(result.atlasPrefix).toBe("data:image/png;base64,");
        expect(result.noFilter).toBe("none");
        await page
          .locator(".be-stadium")
          .screenshot({
            path:
              "test-results/rig-" +
              browserName +
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
                .phase,
          ),
        ).toBe(1);
        expect(errors).toEqual([]);
        await page.evaluate(() => beCloseGameReplay());
      },
    );
