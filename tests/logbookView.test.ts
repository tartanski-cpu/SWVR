import { describe } from "vitest";
import { beforeAll, it, expect } from "vitest";
import * as THREE from "three";
import type { Intent } from "../src/core/intents";
import { IdFactory } from "../src/core/ids";
import { stepWorld } from "../src/core/simulation";
import { createWorld } from "../src/core/world";
import { LOG_TYPES } from "../src/log/log";
const DT = 1 / 60;
beforeAll(() => {
  const ctx = new Proxy(
    {},
    {
      get: (_t, k) =>
        k === "measureText"
          ? () => ({ width: 100 })
          : k === "createLinearGradient"
            ? () => ({ addColorStop() {} })
            : () => {},
      set: () => true,
    },
  );
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
  };
});
describe("logbook view", () => {
  it("VR: the trigger on an entry type starts an entry, however many entries there are already", async () => {
    const { LogbookView } = await import("../src/log/logbookView");
    const { world, localPlayerId } = createWorld(new IdFactory());
    const send = (control: string, ref?: string, args?: number[]) =>
      stepWorld(
        world,
        [
          {
            playerId: localPlayerId,
            targetId: "env",
            control,
            value: 1,
            ref,
            args,
          } as Intent,
        ],
        DT,
      );
    const book = new LogbookView(0.46, 0.32);
    const pushed: string[] = [];
    const ctx = {
      world,
      playerId: localPlayerId,
      push: (c: string, r?: string, a?: number[]) => {
        pushed.push(`${c} ${a}`);
        send(c, r, a);
      },
      pulse() {},
      canRead: () => true,
      notify() {},
      sound() {},
    };
    const ch = Math.round((1024 * 0.32) / 0.46);
    const click = (x: number, y: number) => {
      book.update(world, localPlayerId, 1, DT);
      const p = new THREE.Vector3(
        (x / 1024 - 0.5) * 0.46,
        (0.5 - y / ch) * 0.32,
        0.5,
      );
      const hand = {
        tracked: true,
        grip: p.clone(),
        ray: new THREE.Ray(p.clone(), new THREE.Vector3(0, 0, -1)),
        gripDown: false,
        gripPressed: false,
        triggerDown: true,
        triggerPressed: true,
      };
      const idle = { ...hand, tracked: false };
      book.updateXR(ctx as never, { right: hand, left: idle } as never, {
        left: false,
        right: false,
      });
    };
    for (let n = 0; n < 10; n++) {
      pushed.length = 0;
      const i = n % LOG_TYPES.length;
      click(552 + 40, 118 + i * 50 + 16);
      const began = !!world.log?.draft;
      // Fill every field and sign.
      if (world.log?.draft) {
        send("logPick", "fuel", [0]);
        send("logPick", "ship", [0]);
        send("logPick", "dir", [0]);
        send("logPick", "hazard", [0]);
        send("logPick", "sea", [0]);
        send("logPick", "vis", [0]);
        send("logSign");
      }
      const entries = world.log!.voyages.reduce(
        (a, v) => a + v.entries.length,
        0,
      );
      expect(began, `entry ${n + 1} (${LOG_TYPES[i]})`).toBe(true);
      expect(pushed[0]).toBe(`logBegin ${i}`);
      expect(entries).toBe(n + 1);
    }
  });
});
