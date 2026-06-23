// Package sending contains the Sendmux Sending API client.
//
// Create a client with New and a send-capable API key using the smx_mbx_
// prefix. The client exposes generated methods for the Sending API, typed
// request and response models, idempotency header helpers, retry configuration,
// and API error mapping through APIErrorFromResponse.
package sending

// DefaultBaseURL is the production Sendmux Sending API base URL.
const DefaultBaseURL = "https://smtp.sendmux.ai/api/v1"
