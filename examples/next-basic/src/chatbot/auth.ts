import { createHeaderAuthAdapter } from "@rsainth/chatdock-sdk/next";

export const auth = createHeaderAuthAdapter(async ({ token }) => {
  if (token !== "next-basic-demo-token") {
    return null;
  }

  return {
    id: "demo-user",
    roles: ["member"],
    scopes: ["status:read"],
    tenantId: "demo-tenant",
    metadata: {
      email: "demo@example.test",
      source: "examples/next-basic",
    },
  };
});
