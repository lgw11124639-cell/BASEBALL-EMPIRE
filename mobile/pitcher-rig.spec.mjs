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
      "pitcher uses actual-handed camera and modal owns its footer " +
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
          expect(result.uniformBaked).toBe(true);
          expect(result.source).toContain("pitcher-motion/club-");
          expect(result.frame).toBe(6);
          expect(result.frameCount).toBe(31);
          expect(result.aspect).toBeCloseTo(18 / 13, 2);
          expect(result.zone[1]).toBeCloseTo(0.20, 2);
          expect(result.zone[0]).toBeCloseTo(hand === "우투" ? 0.58 : 0.20, 2);
          const x = result.registration.mirror
            ? 720 - result.registration.pivot[0]
            : result.registration.pivot[0];
          expect(x).toBe(hand === "좌투" ? 564 : 125);
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

test('all baked club uniforms keep complete bodies outside the strike zone in every pose',async({page})=>{
  const errors=await open(page,'우투','우타');
  const result=await page.evaluate(async()=>{
    const module=window.beBroadcastActors,actor=document.querySelector('.be-motion-pitcher')._actor,canvas=document.querySelector('.be-motion-pitcher canvas');

    const sheet=document.createElement('canvas');sheet.width=1440;sheet.height=1600;
    const preview=sheet.getContext('2d');preview.fillStyle='#102638';preview.fillRect(0,0,1440,1600);
    const phases=[0,1,2,3,3.6,4],violations=[],sources=[];
    for(let id=0;id<10;id++){
      await actor.setKit(id);sources.push(actor.inspect().source);
      for(const hand of ['right','left'])for(let row=0;row<4;row++)for(let frame=0;frame<6;frame++){
        actor.pose(phases[frame],row,hand,frame>=3);
        const ctx=canvas.getContext('2d'),x=hand==='right'?418:144,y=hand==='right'?191:222;
        const zone=ctx.getImageData(x*2,y*2,144*2,128*2).data;
        let opaque=0;for(let i=3;i<zone.length;i+=4)if(zone[i]>32)opaque++;
        if(opaque)violations.push({id,hand,row,frame,opaque});
        if(frame===3){const [rx,ry]=actor.releasePoint(row,hand),handPixel=ctx.getImageData(Math.round(rx*2),Math.round(ry*2),1,1).data;if(handPixel[3]<80)violations.push({id,hand,row,frame,releaseOffBody:true});}
        const body=ctx.getImageData(0,0,1440,1040).data;let pixels=0;
        for(let i=3;i<body.length;i+=64)if(body[i]>200)pixels++;
        if(pixels<500)violations.push({id,hand,row,frame,missing:true});
        if(row===0)preview.drawImage(canvas,(frame+(hand==='left'?6:0))*120,id*160,120,130);
      }
      preview.fillStyle='white';preview.font='14px sans-serif';preview.fillText('Club '+id,8,id*160+151);
    }
    return {violations,sources,preview:sheet.toDataURL('image/png')};
  });
  if(result.violations.length)console.log("Uniform pixel checks",JSON.stringify(result.violations));
  expect(result.violations).toEqual([]);expect(new Set(result.sources).size).toBe(10);
  const {writeFileSync}=await import('node:fs');writeFileSync('test-results/pitcher-uniforms.png',Buffer.from(result.preview.split(',')[1],'base64'));
  expect(errors).toEqual([]);await page.evaluate(()=>beCloseGameReplay());
});
