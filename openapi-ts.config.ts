import { defineConfig } from "@hey-api/openapi-ts";

const appSpec = ".codegen/openapi-app.codegen.json";
const sendingSpec = ".codegen/openapi-sending.codegen.json";

const baseOutput = {
  fileName: {
    suffix: ".gen",
  },
  module: {
    extension: ".js",
  },
};

export default defineConfig([
  {
    input: sendingSpec,
    output: {
      ...baseOutput,
      path: "packages/ts/sending/src/generated",
    },
    parser: {
      filters: {
        orphans: false,
        tags: {
          include: ["Attachments", "Emails", "Meta"],
        },
      },
    },
    plugins: ["@hey-api/typescript", { auth: true, name: "@hey-api/sdk" }],
  },
  {
    input: appSpec,
    output: {
      ...baseOutput,
      path: "packages/ts/mailbox/src/generated",
    },
    parser: {
      filters: {
        orphans: false,
        tags: {
          include: ["Mailbox API"],
        },
      },
    },
    plugins: ["@hey-api/typescript", { auth: true, name: "@hey-api/sdk" }],
  },
  {
    input: appSpec,
    output: {
      ...baseOutput,
      path: "packages/ts/management/src/generated",
    },
    parser: {
      filters: {
        orphans: false,
        tags: {
          include: [
            "Billing",
            "Domain Filters",
            "Domains",
            "Emails",
            "Inboxes",
            "Mailbox Filters",
            "Mailboxes",
            "Sending accounts",
            "Webhooks",
          ],
        },
      },
    },
    plugins: ["@hey-api/typescript", { auth: true, name: "@hey-api/sdk" }],
  },
]);
