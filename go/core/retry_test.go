package core

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestIterateCursorStreamsPages(t *testing.T) {
	t.Parallel()

	pages := []testPage[int]{
		{items: []int{1, 2}, pagination: Pagination{HasMore: true, NextCursor: "cursor_2"}},
		{items: []int{3}, pagination: Pagination{HasMore: false}},
	}
	var cursors []string

	var got []int
	for item, err := range IterateCursor(context.Background(), func(_ context.Context, cursor string) (Page[int], error) {
		cursors = append(cursors, cursor)
		return pages[len(cursors)-1], nil
	}) {
		if err != nil {
			t.Fatalf("iterate cursor: %v", err)
		}
		got = append(got, item)
	}

	if strings.Join(intsToStrings(got), ",") != "1,2,3" {
		t.Fatalf("items = %v", got)
	}
	if strings.Join(cursors, ",") != ",cursor_2" {
		t.Fatalf("cursors = %v", cursors)
	}
}

func TestAPIErrorFromResponse(t *testing.T) {
	t.Parallel()

	response := generatedErrorResponse{
		Error: generatedErrorDetail{
			Code:      "rate_limited",
			Message:   "Too many requests",
			Param:     generatedOptString{value: "limit", set: true},
			Retryable: true,
			Errors: []generatedIssue{
				{Code: "too_many", Message: "Try later", Path: "request"},
			},
		},
		Meta: generatedMeta{RequestID: "req_123"},
	}

	apiError, ok := APIErrorFromResponse(&response, http.StatusTooManyRequests)
	if !ok {
		t.Fatal("expected generated response to map to APIError")
	}
	if apiError.Status != http.StatusTooManyRequests || apiError.Code != "rate_limited" {
		t.Fatalf("api error = %#v", apiError)
	}
	if apiError.RequestID != "req_123" || apiError.Param != "limit" || !apiError.Retryable {
		t.Fatalf("api error metadata = %#v", apiError)
	}
	if len(apiError.Errors) != 1 || apiError.Errors[0].Path != "request" {
		t.Fatalf("api error issues = %#v", apiError.Errors)
	}
}

func TestValidateAPIKey(t *testing.T) {
	t.Parallel()

	if err := ValidateAPIKey("smx_root_example", KeySurfaceRoot); err != nil {
		t.Fatalf("root key rejected: %v", err)
	}
	if err := ValidateAPIKey("smx_mbx_example", KeySurfaceMailbox); err != nil {
		t.Fatalf("mailbox key rejected: %v", err)
	}
	if err := ValidateAPIKey("smx_agent_example", KeySurfaceMailbox); err != nil {
		t.Fatalf("agent key rejected for mailbox surface: %v", err)
	}
	if err := ValidateAPIKey("smx_mbx_example", KeySurfaceSending); err != nil {
		t.Fatalf("mailbox key rejected for sending surface: %v", err)
	}
	if err := ValidateAPIKey("smx_mbx_example", KeySurfaceRoot); err == nil {
		t.Fatal("mailbox key accepted for root surface")
	}
	if err := ValidateAPIKey("smx_agent_example", KeySurfaceRoot); err == nil {
		t.Fatal("agent key accepted for root surface")
	}
	if err := ValidateAPIKey("smx_agent_example", KeySurfaceSending); err == nil {
		t.Fatal("agent key accepted for sending surface")
	}
}

func TestRetryingTransportRetriesIdempotentPost(t *testing.T) {
	t.Parallel()

	var attempts int
	transport := NewRetryingTransport(roundTripFunc(func(req *http.Request) (*http.Response, error) {
		attempts++
		body, err := io.ReadAll(req.Body)
		if err != nil {
			t.Fatalf("read body: %v", err)
		}
		if string(body) != `{"ok":true}` {
			t.Fatalf("body was not replayed: %s", body)
		}
		if attempts == 1 {
			return response(http.StatusTooManyRequests, "0"), nil
		}
		return response(http.StatusOK, ""), nil
	}), RetryOptions{MaxAttempts: 2, BaseDelay: time.Nanosecond})

	req, err := http.NewRequest(http.MethodPost, "https://example.test", strings.NewReader(`{"ok":true}`))
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	req.Header.Set("Idempotency-Key", "idem_test")

	resp, err := transport.RoundTrip(req)
	if err != nil {
		t.Fatalf("round trip: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	if attempts != 2 {
		t.Fatalf("attempts = %d", attempts)
	}
}

func TestRetryingTransportDoesNotRetryUnsafePostWithoutIdempotency(t *testing.T) {
	t.Parallel()

	var attempts int
	transport := NewRetryingTransport(roundTripFunc(func(req *http.Request) (*http.Response, error) {
		attempts++
		return response(http.StatusTooManyRequests, "0"), nil
	}), RetryOptions{MaxAttempts: 2, BaseDelay: time.Nanosecond})

	req, err := http.NewRequest(http.MethodPost, "https://example.test", strings.NewReader(`{"ok":true}`))
	if err != nil {
		t.Fatalf("request: %v", err)
	}

	if _, err := transport.RoundTrip(req); err != nil {
		t.Fatalf("round trip: %v", err)
	}
	if attempts != 1 {
		t.Fatalf("attempts = %d", attempts)
	}
}

func TestRetryingTransportStopsOnContext(t *testing.T) {
	t.Parallel()

	transport := NewRetryingTransport(roundTripFunc(func(req *http.Request) (*http.Response, error) {
		return nil, errors.New("network down")
	}), RetryOptions{MaxAttempts: 2, BaseDelay: time.Hour})

	req, err := http.NewRequest(http.MethodGet, "https://example.test", nil)
	if err != nil {
		t.Fatalf("request: %v", err)
	}
	ctx, cancel := contextWithCancel(req)
	cancel()
	req = req.WithContext(ctx)

	if _, err := transport.RoundTrip(req); err == nil {
		t.Fatal("expected context cancellation")
	}
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func response(status int, retryAfter string) *http.Response {
	header := make(http.Header)
	if retryAfter != "" {
		header.Set("Retry-After", retryAfter)
	}
	return &http.Response{
		StatusCode: status,
		Header:     header,
		Body:       io.NopCloser(strings.NewReader("{}")),
	}
}

func contextWithCancel(req *http.Request) (context.Context, context.CancelFunc) {
	return context.WithCancel(req.Context())
}

type testPage[T any] struct {
	items      []T
	pagination Pagination
}

func (p testPage[T]) Items() []T {
	return p.items
}

func (p testPage[T]) Pagination() Pagination {
	return p.pagination
}

func intsToStrings(values []int) []string {
	out := make([]string, 0, len(values))
	for _, value := range values {
		out = append(out, strconv.Itoa(value))
	}
	return out
}

type generatedErrorResponse struct {
	Error generatedErrorDetail
	Meta  generatedMeta
}

type generatedErrorDetail struct {
	Code      string
	Message   string
	Param     generatedOptString
	Retryable bool
	Errors    []generatedIssue
}

type generatedMeta struct {
	RequestID string
}

type generatedIssue struct {
	Code    string
	Message string
	Path    string
}

type generatedOptString struct {
	value string
	set   bool
}

func (s generatedOptString) Get() (string, bool) {
	return s.value, s.set
}
