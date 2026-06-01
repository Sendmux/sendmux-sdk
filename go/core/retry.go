package core

import (
	"bytes"
	"context"
	"crypto/rand"
	"io"
	"math/big"
	"net/http"
	"strconv"
	"time"
)

// RetryOptions configures retry and rate-limit backoff behaviour.
type RetryOptions struct {
	MaxAttempts int
	BaseDelay   time.Duration
	MaxDelay    time.Duration
}

// NewHTTPClient returns an HTTP client with Sendmux retry behaviour.
func NewHTTPClient(base *http.Client, options RetryOptions) *http.Client {
	var client http.Client
	if base != nil {
		client = *base
	}

	transport := client.Transport
	if transport == nil {
		transport = http.DefaultTransport
	}
	client.Transport = NewRetryingTransport(transport, options)
	return &client
}

// NewRetryingTransport wraps a base transport with rate-limit-aware retries.
func NewRetryingTransport(base http.RoundTripper, options RetryOptions) http.RoundTripper {
	if base == nil {
		base = http.DefaultTransport
	}
	return &retryingTransport{
		base:    base,
		options: normalizeRetryOptions(options),
	}
}

type retryingTransport struct {
	base    http.RoundTripper
	options RetryOptions
}

func (t *retryingTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	if !requestMayRetry(req) {
		return t.base.RoundTrip(req)
	}

	if err := makeBodyReplayable(req); err != nil {
		return t.base.RoundTrip(req)
	}

	var lastResponse *http.Response
	var lastErr error

	for attempt := 1; attempt <= t.options.MaxAttempts; attempt++ {
		attemptReq, err := cloneRequest(req)
		if err != nil {
			return nil, err
		}

		response, err := t.base.RoundTrip(attemptReq)
		if !shouldRetry(response, err, attempt, t.options.MaxAttempts) {
			return response, err
		}

		lastResponse = response
		lastErr = err
		closeResponse(response)

		if err := sleepWithContext(req.Context(), retryDelay(response, attempt, t.options)); err != nil {
			return nil, err
		}
	}

	return lastResponse, lastErr
}

func normalizeRetryOptions(options RetryOptions) RetryOptions {
	if options.MaxAttempts <= 0 {
		options.MaxAttempts = 3
	}
	if options.BaseDelay <= 0 {
		options.BaseDelay = 200 * time.Millisecond
	}
	if options.MaxDelay <= 0 {
		options.MaxDelay = 5 * time.Second
	}
	return options
}

func requestMayRetry(req *http.Request) bool {
	switch req.Method {
	case http.MethodGet, http.MethodHead, http.MethodOptions, http.MethodTrace:
		return true
	default:
		return req.Header.Get("Idempotency-Key") != ""
	}
}

func makeBodyReplayable(req *http.Request) error {
	if req.Body == nil || req.Body == http.NoBody || req.GetBody != nil {
		return nil
	}

	body, err := io.ReadAll(req.Body)
	if err != nil {
		return err
	}
	if err := req.Body.Close(); err != nil {
		return err
	}

	req.Body = io.NopCloser(bytes.NewReader(body))
	req.GetBody = func() (io.ReadCloser, error) {
		return io.NopCloser(bytes.NewReader(body)), nil
	}
	req.ContentLength = int64(len(body))
	return nil
}

func cloneRequest(req *http.Request) (*http.Request, error) {
	cloned := req.Clone(req.Context())
	if req.Body == nil || req.Body == http.NoBody {
		return cloned, nil
	}

	body, err := req.GetBody()
	if err != nil {
		return nil, err
	}
	cloned.Body = body
	return cloned, nil
}

func shouldRetry(response *http.Response, err error, attempt int, maxAttempts int) bool {
	if attempt >= maxAttempts {
		return false
	}
	if err != nil {
		return true
	}
	if response == nil {
		return false
	}

	switch response.StatusCode {
	case http.StatusRequestTimeout,
		http.StatusTooManyRequests,
		http.StatusInternalServerError,
		http.StatusBadGateway,
		http.StatusServiceUnavailable,
		http.StatusGatewayTimeout:
		return true
	default:
		return false
	}
}

func retryDelay(response *http.Response, attempt int, options RetryOptions) time.Duration {
	if delay, ok := retryAfterDelay(response); ok {
		return delay
	}
	if delay, ok := rateLimitResetDelay(response); ok {
		return delay
	}

	delay := options.BaseDelay * (1 << (attempt - 1))
	if delay > options.MaxDelay {
		delay = options.MaxDelay
	}
	return jitter(delay)
}

func retryAfterDelay(response *http.Response) (time.Duration, bool) {
	if response == nil {
		return 0, false
	}

	value := response.Header.Get("Retry-After")
	if value == "" {
		return 0, false
	}

	if seconds, err := strconv.Atoi(value); err == nil {
		return time.Duration(seconds) * time.Second, true
	}

	resetAt, err := http.ParseTime(value)
	if err != nil {
		return 0, false
	}
	delay := time.Until(resetAt)
	if delay < 0 {
		return 0, true
	}
	return delay, true
}

func rateLimitResetDelay(response *http.Response) (time.Duration, bool) {
	if response == nil {
		return 0, false
	}

	value := response.Header.Get("X-RateLimit-Reset")
	if value == "" {
		return 0, false
	}

	unixSeconds, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, false
	}

	delay := time.Until(time.Unix(unixSeconds, 0))
	if delay < 0 {
		return 0, true
	}
	return delay, true
}

func jitter(delay time.Duration) time.Duration {
	if delay <= 0 {
		return 0
	}

	max := big.NewInt(int64(delay))
	n, err := rand.Int(rand.Reader, max)
	if err != nil {
		return delay
	}
	return time.Duration(n.Int64())
}

func sleepWithContext(ctx context.Context, delay time.Duration) error {
	if delay <= 0 {
		return nil
	}

	timer := time.NewTimer(delay)
	defer timer.Stop()

	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}

func closeResponse(response *http.Response) {
	if response == nil || response.Body == nil {
		return
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4096))
	_ = response.Body.Close()
}
