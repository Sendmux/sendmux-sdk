// Package mailbox contains the Sendmux Mailbox API client.
//
// Create a client with New and a mailbox-scoped API key using the smx_mbx_
// prefix. The client exposes generated methods for mailbox reads, message
// operations, folders, threads, and usage, plus typed request and response
// models, conditional request helpers, retry configuration, and API error
// mapping through APIErrorFromResponse.
package mailbox

// DefaultBaseURL is the production Sendmux Mailbox API base URL.
const DefaultBaseURL = "https://app.sendmux.ai/api/v1"
