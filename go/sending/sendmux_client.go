package sending

import (
	"context"
	"net/http"

	"sendmux.ai/go/core"
)

type securitySource struct {
	apiKey string
}

func (s securitySource) BearerAuth(_ context.Context, _ OperationName) (BearerAuth, error) {
	return BearerAuth{Token: s.apiKey}, nil
}

type sendmuxClientConfig struct {
	baseURL      string
	httpClient   *http.Client
	retryOptions core.RetryOptions
}

// SendmuxOption configures a Sendmux Sending API client.
type SendmuxOption func(*sendmuxClientConfig)

// WithBaseURL overrides the default Sendmux API base URL.
func WithBaseURL(baseURL string) SendmuxOption {
	return func(config *sendmuxClientConfig) {
		if baseURL != "" {
			config.baseURL = baseURL
		}
	}
}

// WithHTTPClient sets the base HTTP client wrapped by the retry transport.
func WithHTTPClient(client *http.Client) SendmuxOption {
	return func(config *sendmuxClientConfig) {
		if client != nil {
			config.httpClient = client
		}
	}
}

// WithRetryOptions sets retry and rate-limit backoff behaviour.
func WithRetryOptions(options core.RetryOptions) SendmuxOption {
	return func(config *sendmuxClientConfig) {
		config.retryOptions = options
	}
}

// New returns a Sendmux Sending API client.
func New(apiKey string, opts ...SendmuxOption) (*Client, error) {
	if err := core.ValidateAPIKey(apiKey, core.KeySurfaceRoot); err != nil {
		return nil, err
	}

	config := sendmuxClientConfig{
		baseURL: DefaultBaseURL,
	}
	for _, opt := range opts {
		opt(&config)
	}

	return NewClient(
		config.baseURL,
		securitySource{apiKey: apiKey},
		WithClient(core.NewHTTPClient(config.httpClient, config.retryOptions)),
	)
}

// OptionalHeader returns a generated optional string header value.
func OptionalHeader(value string) OptString {
	var out OptString
	out.SetTo(value)
	return out
}

// IdempotencyKey returns a generated Idempotency-Key header value.
func IdempotencyKey(value string) OptString {
	return OptionalHeader(value)
}

// IfMatch returns a generated If-Match header value.
func IfMatch(value string) OptString {
	return OptionalHeader(value)
}

// IfNoneMatch returns a generated If-None-Match header value.
func IfNoneMatch(value string) OptString {
	return OptionalHeader(value)
}

// APIErrorFromResponse maps a generated error response into a typed API error.
func APIErrorFromResponse(response any, status int) (*core.APIError, bool) {
	return core.APIErrorFromResponse(response, status)
}
