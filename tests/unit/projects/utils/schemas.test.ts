import { describe, it, expect } from "vitest";
import {
  loginSecretsSchema,
  nandosSecretsSchema,
} from "../../../../stack/projects/utils/schemas.js";

describe("loginSecretsSchema", () => {
  it("accepts valid email and password", () => {
    const result = loginSecretsSchema.safeParse({ email: "user@test.com", password: "secret" });
    expect(result.success).toBe(true);
  });

  it("rejects missing email", () => {
    const result = loginSecretsSchema.safeParse({ password: "secret" });
    expect(result.success).toBe(false);
  });

  it("rejects missing password", () => {
    const result = loginSecretsSchema.safeParse({ email: "user@test.com" });
    expect(result.success).toBe(false);
  });

  it("rejects empty email", () => {
    const result = loginSecretsSchema.safeParse({ email: "", password: "secret" });
    expect(result.success).toBe(false);
  });

  it("rejects empty password", () => {
    const result = loginSecretsSchema.safeParse({ email: "user@test.com", password: "" });
    expect(result.success).toBe(false);
  });
});

describe("nandosSecretsSchema", () => {
  const valid = {
    email: "user@test.com",
    password: "secret",
    firstName: "Jane",
    expectedAddress: "123 Main St",
    savedCardSuffix: "4242",
  };

  it("accepts all required fields", () => {
    const result = nandosSecretsSchema.safeParse(valid);
    expect(result.success).toBe(true);
  });

  it("extends loginSecretsSchema (requires email and password)", () => {
    const { email: _, password: __, ...withoutLogin } = valid;
    const result = nandosSecretsSchema.safeParse(withoutLogin);
    expect(result.success).toBe(false);
  });

  it("rejects missing firstName", () => {
    const { firstName: _, ...without } = valid;
    const result = nandosSecretsSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("rejects missing expectedAddress", () => {
    const { expectedAddress: _, ...without } = valid;
    const result = nandosSecretsSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("rejects missing savedCardSuffix", () => {
    const { savedCardSuffix: _, ...without } = valid;
    const result = nandosSecretsSchema.safeParse(without);
    expect(result.success).toBe(false);
  });

  it("rejects empty firstName", () => {
    const result = nandosSecretsSchema.safeParse({ ...valid, firstName: "" });
    expect(result.success).toBe(false);
  });
});
