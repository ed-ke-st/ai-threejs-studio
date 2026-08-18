import assert from "node:assert/strict";
import test from "node:test";
import { exceedsProjectQuota } from "./quota.js";

test("normal accounts remain subject to the configured project quota", () => {
  assert.equal(exceedsProjectQuota(2, 3, "user"), false);
  assert.equal(exceedsProjectQuota(3, 3, "user"), true);
  assert.equal(exceedsProjectQuota(4, 3, null), true);
});

test("admin accounts are exempt from the project quota", () => {
  assert.equal(exceedsProjectQuota(3, 3, "admin"), false);
  assert.equal(exceedsProjectQuota(100, 3, "admin"), false);
});

test("non-positive project quotas remain unlimited", () => {
  assert.equal(exceedsProjectQuota(100, 0, "user"), false);
  assert.equal(exceedsProjectQuota(100, -1, null), false);
});
