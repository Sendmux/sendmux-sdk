// Package management contains the Sendmux Management API client.
//
// Create a client with New and a root API key using the smx_root_ prefix. The
// client exposes generated methods for domains, mailboxes, sending accounts,
// billing, logs, and webhooks, plus typed request and response models,
// idempotency and conditional request helpers, retry configuration, and API
// error mapping through APIErrorFromResponse.
package management

// DefaultBaseURL is the production Sendmux Management API base URL.
const DefaultBaseURL = "https://app.sendmux.ai/api/v1"
