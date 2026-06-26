import { defineTool, toolOk } from "@rsainth/chatdock-sdk";
import { z } from "zod";

export default defineTool({
  name: "get_status",
  description: "Returns the current status for the authenticated demo user.",
  input: z.object({}),
  permissions: [
    {
      type: "scope",
      anyOf: ["status:read"],
      reason: "Reading demo status requires the status:read scope.",
    },
  ],
  execute: async ({ context }) =>
    toolOk({
      data: {
        ok: true,
        userId: context.user?.id ?? null,
        tenantId: context.user?.tenantId ?? null,
        mode: "local-example",
      },
      display: "The demo user is authenticated and the local example is running.",
    }),
});
