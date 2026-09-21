// Package core contains shared Sendmux Go SDK runtime helpers.
//
// The package provides API-key prefix validation, retry-aware HTTP clients,
// shared success and error envelope types, and a generic cursor iterator for
// code that adapts response pages to the Page interface. Applications usually
// import a surface package such as sendmux.ai/go/v3/sending, sendmux.ai/go/v3/mailbox,
// or sendmux.ai/go/v3/management; those packages apply the core helpers for you.
package core
