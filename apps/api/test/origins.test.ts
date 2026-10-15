import { expect, it } from "vitest";
import { requestOrigins } from "../src/common/config/origins";
import { db, request as callApp, signUp, uniqueEmail, uniqueSlug } from "./helpers";

function request(headers: Record<string, string>): Request {
  return new Request("http://localhost:8787/api/auth/sign-in/email", { headers });
}

it("trusts the host the request arrived on, with nothing configured", () => {
  const origins = requestOrigins(
    request({ host: "heptadec.example.com", origin: "https://heptadec.example.com" }),
  );
  expect(origins).toContain("http://heptadec.example.com");
  expect(origins).toContain("https://heptadec.example.com");
});

it("follows a moved frontend without any change to configuration", () => {
  for (const host of [
    "heptadec.example.com",
    "analytics.internal:8443",
    "10.0.0.7:5173",
    "some-other-name.example.org",
  ]) {
    const origins = requestOrigins(request({ host, origin: `http://${host}` }));
    expect(origins).toContain(`http://${host}`);
  }
});

it("reads the forwarded host and scheme when a proxy rewrote them", () => {
  const origins = requestOrigins(
    request({
      host: "api:8787",
      "x-forwarded-host": "heptadec.example.com",
      "x-forwarded-proto": "https",
    }),
  );
  expect(origins).toContain("https://heptadec.example.com");
});

it("takes the first hop when a proxy chain appends a scheme", () => {
  const origins = requestOrigins(
    request({
      host: "api:8787",
      "x-forwarded-host": "heptadec.example.com",
      "x-forwarded-proto": "https, http",
    }),
  );
  expect(origins).toContain("https://heptadec.example.com");
  expect(origins).not.toContain("http://heptadec.example.com");
});

it("never trusts a foreign origin just because the host matches", () => {
  const origins = requestOrigins(
    request({ host: "heptadec.example.com", origin: "https://evil.test" }),
  );
  expect(origins).not.toContain("https://evil.test");
});

it("allows a request from the host it came in on", async () => {
  const { cookie } = await signUp(uniqueEmail());

  const allowed = await callApp("/api/auth/organization/create", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      cookie,
      host: "heptadec.test",
      origin: "http://heptadec.test",
    },
    body: JSON.stringify({ name: "Legit", slug: uniqueSlug() }),
  });
  expect(allowed.status).toBe(200);
});

it("accepts a sign-up from the host the request came in on", async () => {
  const email = uniqueEmail();
  const created = await callApp("/api/auth/sign-up/email", {
    method: "POST",
    headers: { "content-type": "application/json", host: "heptadec.test" },
    body: JSON.stringify({ name: "A", email, password: "supersecret1" }),
  });
  expect(created.status).toBe(200);

  const signedIn = await callApp("/api/auth/sign-in/email", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      host: "heptadec.test",
      origin: "http://heptadec.test",
    },
    body: JSON.stringify({ email, password: "supersecret1" }),
  });
  expect(signedIn.status).toBe(200);
});
