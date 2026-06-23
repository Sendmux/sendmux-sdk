// Package mailbox contains the Sendmux Mailbox API client.
//
// Create a client with New and an smx_mbx_ key or scoped smx_agent_ token.
// The client exposes generated methods for mailbox reads, message
// operations, folders, threads, and usage, plus typed request and response
// models, conditional request helpers, retry configuration, and API error
// mapping through APIErrorFromResponse.
package mailbox

// DefaultBaseURL is the production Sendmux Mailbox API base URL.
const DefaultBaseURL = "https://app.sendmux.ai/api/v1"
