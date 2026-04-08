import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import nodemailer from "nodemailer";
import {
  clientIpFromRequest,
  createRateLimiter,
  normalizeSubmission,
  originAllowed,
  validateSubmission,
} from "./lib/contact.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
  port: Number.parseInt(process.env.PORT ?? "3000", 10),
  allowedOrigin: process.env.ALLOWED_ORIGIN ?? "http://localhost:3000",
  formToken: process.env.CONTACT_FORM_TOKEN ?? "onramp-contact-v1",
  minSubmitMs: Number.parseInt(process.env.CONTACT_MIN_SUBMIT_MS ?? "4000", 10),
  rateLimitWindowMs: Number.parseInt(process.env.RATE_LIMIT_WINDOW_MS ?? "900000", 10),
  rateLimitMaxRequests: Number.parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? "5", 10),
  smtpHost: process.env.SMTP_HOST ?? "mx.otnh.net",
  smtpPort: Number.parseInt(process.env.SMTP_PORT ?? "587", 10),
  smtpSecure: String(process.env.SMTP_SECURE ?? "false") === "true",
  smtpUser: process.env.SMTP_USER ?? "",
  smtpPass: process.env.SMTP_PASS ?? "",
  smtpFrom: process.env.SMTP_FROM ?? "OnRamp Services <no-reply@onrampservices.com>",
  contactTo: process.env.CONTACT_TO ?? "",
};

const transporter = nodemailer.createTransport({
  host: config.smtpHost,
  port: config.smtpPort,
  secure: config.smtpSecure,
  auth: config.smtpUser ? { user: config.smtpUser, pass: config.smtpPass } : undefined,
});

const rateLimiter = createRateLimiter({
  windowMs: config.rateLimitWindowMs,
  maxRequests: config.rateLimitMaxRequests,
});

const staticFiles = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/index.html", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/styles.css", { file: "styles.css", type: "text/css; charset=utf-8" }],
  ["/main.js", { file: "main.js", type: "application/javascript; charset=utf-8" }],
]);

const readBody = async (request) =>
  new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        reject(new Error("Body too large"));
      }
    });

    request.on("end", () => resolve(body));
    request.on("error", reject);
  });

const parseBody = (body, contentType) => {
  if (contentType.includes("application/json")) {
    return JSON.parse(body || "{}");
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(body));
  }

  return {};
};

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
};

const sendStatic = async (response, filePath, contentType) => {
  const fullPath = path.join(__dirname, filePath);
  const fileContents = await fs.readFile(fullPath);
  response.writeHead(200, {
    "Content-Type": contentType,
    "Cache-Control": "public, max-age=300",
  });
  response.end(fileContents);
};

const logSecurityEvent = (message, details) => {
  console.warn(`[contact] ${message}`, details);
};

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET") {
      const asset = staticFiles.get(request.url || "/");
      if (!asset) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      await sendStatic(response, asset.file, asset.type);
      return;
    }

    if (request.method === "POST" && request.url === "/api/contact") {
      const ip = clientIpFromRequest(request);
      const limitResult = rateLimiter.check(ip);

      if (!limitResult.allowed) {
        logSecurityEvent("rate_limited", { ip });
        sendJson(response, 429, { message: "Too many requests. Try again later." });
        return;
      }

      if (!originAllowed(request, config.allowedOrigin)) {
        logSecurityEvent("origin_rejected", { ip, origin: request.headers.origin, referer: request.headers.referer });
        sendJson(response, 403, { message: "Request rejected." });
        return;
      }

      const rawBody = await readBody(request);
      const parsedBody = parseBody(rawBody, request.headers["content-type"] ?? "");
      const submission = normalizeSubmission(parsedBody);
      const errors = validateSubmission(submission, {
        formToken: config.formToken,
        minSubmitMs: config.minSubmitMs,
      });

      if (errors.length > 0) {
        logSecurityEvent("validation_rejected", { ip, reason: errors[0] });
        sendJson(response, 400, { message: "Please review the form and try again." });
        return;
      }

      if (!config.contactTo) {
        console.error("[contact] CONTACT_TO is not configured.");
        sendJson(response, 500, { message: "Unable to send your inquiry right now." });
        return;
      }

      await transporter.sendMail({
        from: config.smtpFrom,
        to: config.contactTo,
        replyTo: submission.email,
        subject: `OnRamp Services inquiry from ${submission.name}`,
        text: [
          `Name: ${submission.name}`,
          `Email: ${submission.email}`,
          `Company: ${submission.company || "Not provided"}`,
          "",
          "Message:",
          submission.message,
        ].join("\n"),
      });

      sendJson(response, 200, {
        message: "Inquiry sent. We will review it and follow up if it is a fit.",
      });
      return;
    }

    response.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Method not allowed");
  } catch (error) {
    console.error("[server] request_failed", error);
    sendJson(response, 500, { message: "Unable to send your inquiry right now." });
  }
});

server.listen(config.port, () => {
  console.log(`OnRamp Services listening on http://localhost:${config.port}`);
});
