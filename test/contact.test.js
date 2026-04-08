import test from "node:test";
import assert from "node:assert/strict";
import {
  createRateLimiter,
  normalizeSubmission,
  validateSubmission,
} from "../lib/contact.js";

test("normalizeSubmission trims and normalizes values", () => {
  const submission = normalizeSubmission({
    name: "  Chad  ",
    email: " Chad@Example.com ",
    company: " OnRamp ",
    message: " Hello ",
    website: "",
    form_id: "token",
    form_started_at: String(Date.now() - 5000),
  });

  assert.equal(submission.name, "Chad");
  assert.equal(submission.email, "chad@example.com");
  assert.equal(submission.company, "OnRamp");
  assert.equal(submission.message, "Hello");
});

test("validateSubmission accepts a valid inquiry", () => {
  const errors = validateSubmission(
    normalizeSubmission({
      name: "Chad",
      email: "chad@example.com",
      company: "OnRamp Services",
      message: "Need a customer portal.",
      website: "",
      form_id: "token",
      form_started_at: String(Date.now() - 6000),
    }),
    {
      formToken: "token",
      minSubmitMs: 4000,
    },
  );

  assert.deepEqual(errors, []);
});

test("validateSubmission rejects spammy or invalid input", () => {
  const errors = validateSubmission(
    normalizeSubmission({
      name: "",
      email: "not-an-email",
      company: "",
      message: "",
      website: "https://spam.example",
      form_id: "wrong-token",
      form_started_at: String(Date.now()),
    }),
    {
      formToken: "token",
      minSubmitMs: 4000,
    },
  );

  assert.ok(errors.length >= 4);
});

test("createRateLimiter blocks after the configured threshold", () => {
  const limiter = createRateLimiter({ windowMs: 1000, maxRequests: 2 });

  assert.equal(limiter.check("127.0.0.1").allowed, true);
  assert.equal(limiter.check("127.0.0.1").allowed, true);
  assert.equal(limiter.check("127.0.0.1").allowed, false);
});
