const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeSubmission = (input) => ({
  name: String(input.name ?? "").trim(),
  email: String(input.email ?? "").trim().toLowerCase(),
  company: String(input.company ?? "").trim(),
  message: String(input.message ?? "").trim(),
  website: String(input.website ?? "").trim(),
  formId: String(input.form_id ?? "").trim(),
  formStartedAt: Number.parseInt(String(input.form_started_at ?? ""), 10),
});

export const validateSubmission = (submission, options) => {
  const errors = [];

  if (!submission.name || submission.name.length > 120) {
    errors.push("Provide a valid name.");
  }

  if (!submission.email || submission.email.length > 160 || !EMAIL_PATTERN.test(submission.email)) {
    errors.push("Provide a valid email address.");
  }

  if (submission.company.length > 160) {
    errors.push("Company is too long.");
  }

  if (!submission.message || submission.message.length > 4000) {
    errors.push("Provide project details under 4000 characters.");
  }

  if (submission.website) {
    errors.push("Spam submission rejected.");
  }

  if (submission.formId !== options.formToken) {
    errors.push("Form token mismatch.");
  }

  if (!Number.isFinite(submission.formStartedAt)) {
    errors.push("Missing submission timestamp.");
  } else if (Date.now() - submission.formStartedAt < options.minSubmitMs) {
    errors.push("Submission sent too quickly.");
  }

  return errors;
};

export const clientIpFromRequest = (request) => {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0].trim();
  }

  return request.socket.remoteAddress || "unknown";
};

export const originAllowed = (request, allowedOrigin) => {
  const origin = request.headers.origin;
  const referer = request.headers.referer;

  if (origin) {
    return origin === allowedOrigin;
  }

  if (referer) {
    try {
      return new URL(referer).origin === allowedOrigin;
    } catch {
      return false;
    }
  }

  return false;
};

export const createRateLimiter = ({ windowMs, maxRequests }) => {
  const entries = new Map();

  return {
    check(ip) {
      const now = Date.now();
      const record = entries.get(ip);

      if (!record || record.resetAt <= now) {
        entries.set(ip, { count: 1, resetAt: now + windowMs });
        return { allowed: true, remaining: maxRequests - 1 };
      }

      if (record.count >= maxRequests) {
        return { allowed: false, remaining: 0, retryAfterMs: record.resetAt - now };
      }

      record.count += 1;
      return { allowed: true, remaining: maxRequests - record.count };
    },
  };
};
