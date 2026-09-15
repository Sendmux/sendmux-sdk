import { test } from "node:test";
import { aiConsumers } from "./ci-consumers.mjs";

test("packed AI peer range rejects Zod 3.24 and preserves the historical valid intersection", async () => {
  await aiConsumers([["5.0.0", "4.0.0"]]);
});
