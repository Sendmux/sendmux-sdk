package core_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"sendmux.ai/go/core"
)

func TestRetryableFalsePreservesResponse(t *testing.T) {
	const body = `{"ok":false,"error":{"code":"service_unavailable","retryable":false},"meta":{"request_id":"req_no_retry"}}`
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", "0")
		w.WriteHeader(503)
		_, _ = io.WriteString(w, body)
	}))
	defer server.Close()
	client := core.NewHTTPClient(server.Client(), core.RetryOptions{MaxAttempts: 3})
	defer client.CloseIdleConnections()
	response, err := client.Get(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := response.Body.Close(); err != nil {
			t.Error(err)
		}
	}()
	got, err := io.ReadAll(response.Body)
	if err != nil || string(got) != body || response.StatusCode != 503 || calls.Load() != 1 {
		t.Fatalf("response body preserved=%v status=%d calls=%d read error=%v", string(got) == body, response.StatusCode, calls.Load(), err)
	}
}

func TestDeadlineReturnsServerRetryMetadataWithoutReplay(t *testing.T) {
	for _, retryAfter := range []string{"3600", "999999999999999999999999999999999999"} {
		t.Run(retryAfter, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", retryAfter)
				w.Header().Set("X-RateLimit-Reset", "1")
				w.Header().Set("X-Request-Id", "req_deadline")
				w.WriteHeader(503)
				_, _ = io.WriteString(w, `{"ok":false,"error":{"retryable":true}}`)
			}))
			defer server.Close()
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			request, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
			if err != nil {
				t.Fatal(err)
			}
			client := core.NewHTTPClient(server.Client(), core.RetryOptions{MaxAttempts: 3, MaxDelay: time.Millisecond})
			defer client.CloseIdleConnections()
			response, err := client.Do(request)
			if err != nil {
				t.Fatalf("lost the response and retry metadata: %v", err)
			}
			defer func() {
				if err := response.Body.Close(); err != nil {
					t.Error(err)
				}
			}()
			body, err := io.ReadAll(response.Body)
			if err != nil || !strings.Contains(string(body), `"retryable":true`) || response.StatusCode != 503 || calls.Load() != 1 {
				t.Fatalf("status=%d calls=%d read error=%v", response.StatusCode, calls.Load(), err)
			}
			if response.Header.Get("Retry-After") != retryAfter || response.Header.Get("X-Request-Id") != "req_deadline" || response.Header.Get("X-RateLimit-Reset") != "1" {
				t.Fatal("retry metadata was not preserved")
			}
		})
	}
}

func TestInterruptedErrorBodyIsNotRetriedOrSilenced(t *testing.T) {
	const body = `{"ok":false,`
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Length", "100")
		w.Header().Set("Retry-After", "0")
		w.WriteHeader(503)
		_, _ = io.WriteString(w, body)
	}))
	defer server.Close()
	client := core.NewHTTPClient(server.Client(), core.RetryOptions{MaxAttempts: 3})
	defer client.CloseIdleConnections()
	response, err := client.Get(server.URL)
	if err != nil {
		t.Fatal(err)
	}
	defer func() {
		if err := response.Body.Close(); err != nil {
			t.Error(err)
		}
	}()
	got, err := io.ReadAll(response.Body)
	if !errors.Is(err, io.ErrUnexpectedEOF) || string(got) != body || calls.Load() != 1 {
		t.Fatalf("body preserved=%v calls=%d read error=%v", string(got) == body, calls.Load(), err)
	}
}
