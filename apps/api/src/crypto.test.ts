import { test } from "node:test";
import assert from "node:assert/strict";
import { decryptSecret, encryptSecret } from "./crypto.js";

const KEY = "unit-test-encryption-key-0123456789";

test("encrypt/decrypt round-trips a provider key", () => {
  const plain = "sk-ant-api03-abcDEF123";
  const enc = encryptSecret(plain, KEY);
  assert.notEqual(enc, plain, "ciphertext should differ from plaintext");
  assert.equal(decryptSecret(enc, KEY), plain);
});

test("random IV yields distinct ciphertext for the same input", () => {
  const a = encryptSecret("same-secret", KEY);
  const b = encryptSecret("same-secret", KEY);
  assert.notEqual(a, b);
  assert.equal(decryptSecret(a, KEY), "same-secret");
  assert.equal(decryptSecret(b, KEY), "same-secret");
});

test("decrypting with the wrong key fails (GCM auth tag)", () => {
  const enc = encryptSecret("secret", "key-one");
  assert.throws(() => decryptSecret(enc, "key-two"));
});

test("handles empty and unicode values", () => {
  assert.equal(decryptSecret(encryptSecret("", KEY), KEY), "");
  assert.equal(decryptSecret(encryptSecret("héllo 🌍 key", KEY), KEY), "héllo 🌍 key");
});
