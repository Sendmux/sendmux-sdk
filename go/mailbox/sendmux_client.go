package mailbox

import (
	"context"
	"errors"
	"net/http"

	"sendmux.ai/go/core"
)

type securitySource struct {
	provider func(context.Context) (string, error)
}

func (s securitySource) BearerAuth(ctx context.Context, _ OperationName) (BearerAuth, error) {
	token, err := s.provider(ctx)
	if err != nil {
		return BearerAuth{}, err
	}
	if err := core.ValidateAccessToken(token); err != nil {
		return BearerAuth{}, err
	}
	return BearerAuth{Token: token}, nil
}

type sendmuxClientConfig struct {
	baseURL      string
	httpClient   *http.Client
	retryOptions core.RetryOptions
}

// SendmuxOption configures a Sendmux Mailbox API client.
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

// New returns a Sendmux Mailbox API client authenticated with an API key.
func New(apiKey string, opts ...SendmuxOption) (*Client, error) {
	if err := core.ValidateAPIKey(apiKey, core.KeySurfaceMailbox); err != nil {
		return nil, err
	}
	return NewWithTokenProvider(func(context.Context) (string, error) { return apiKey, nil }, opts...)
}

// NewWithAccessToken returns a client authenticated with an OAuth access token.
func NewWithAccessToken(token string, opts ...SendmuxOption) (*Client, error) {
	if err := core.ValidateAccessToken(token); err != nil {
		return nil, err
	}
	return NewWithTokenProvider(func(context.Context) (string, error) { return token, nil }, opts...)
}

// NewWithTokenProvider resolves an OAuth access token for each API request.
// The provider must be safe for concurrent calls.
func NewWithTokenProvider(provider func(context.Context) (string, error), opts ...SendmuxOption) (*Client, error) {
	if provider == nil {
		return nil, errors.New("sendmux: token provider is required")
	}
	config := sendmuxClientConfig{baseURL: DefaultBaseURL}
	for _, opt := range opts {
		opt(&config)
	}
	return NewClient(
		config.baseURL,
		securitySource{provider: provider},
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
