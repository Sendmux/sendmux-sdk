package sending_test

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

	"sendmux.ai/go/mailbox"
	"sendmux.ai/go/management"
	"sendmux.ai/go/sending"
)

const oauthConnection = `{"ok":true,"data":{"team":{"id":"team_test","name":"Test"},"credential":{"id":"grant_test","type":"oauth","name":null},"label":"Test","permissions":[],"mailboxes":[]},"meta":{"request_id":"req_test"}}`

type oauthContextKey struct{}

func TestAccessTokenUsesBearerWithoutAPIKeyPrefix(t *testing.T) {
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		if r.Header.Get("Authorization") != "Bearer opaque.oauth-token" {
			t.Error("incorrect bearer credential")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = io.WriteString(w, oauthConnection)
	}))
	defer server.Close()
	client, err := sending.NewWithAccessToken("opaque.oauth-token", sending.WithBaseURL(server.URL))
	if err != nil {
		t.Fatalf("explicit access token rejected: %v", err)
	}
	if _, err := client.SendingGetConnection(context.Background(), sending.SendingGetConnectionParams{}); err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 1 {
		t.Fatalf("requests=%d", calls.Load())
	}
}

func TestTokenProvidersRefreshAcrossAllAPIs(t *testing.T) {
	for name, factory := range oauthFactories() {
		t.Run(name, func(t *testing.T) {
			var received []string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				received = append(received, r.Header.Get("Authorization"))
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, oauthConnection)
			}))
			defer server.Close()
			token := "first-token"
			providerCalls := 0
			requestContext := context.WithValue(context.Background(), oauthContextKey{}, "request")
			call, err := factory(server.URL, func(ctx context.Context) (string, error) {
				if ctx.Value(oauthContextKey{}) != "request" {
					t.Error("provider did not receive request context")
				}
				providerCalls++
				return token, nil
			})
			if err != nil {
				t.Fatalf("provider configuration rejected: %v", err)
			}
			if providerCalls != 0 {
				t.Fatal("provider ran before an API request")
			}
			if err := call(requestContext); err != nil {
				t.Fatal(err)
			}
			token = "second-token"
			if err := call(requestContext); err != nil {
				t.Fatal(err)
			}
			if providerCalls != 2 || len(received) != 2 || received[0] != "Bearer first-token" || received[1] != "Bearer second-token" {
				t.Fatal("token was not resolved for each request")
			}
		})
	}
}

func TestTokenValidationAndProviderFailuresPreventRequests(t *testing.T) {
	for _, token := range []string{"", "Bearer token", "token\r\nInjected: header", "token\x00", "token=tail", "token value"} {
		if _, err := sending.NewWithAccessToken(token); err == nil {
			t.Fatal("malformed token accepted")
		}
	}
	if _, err := sending.NewWithTokenProvider(nil); err == nil {
		t.Fatal("nil provider accepted")
	}
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer server.Close()
	want := errors.New("refresh unavailable")
	provider := func(context.Context) (string, error) { return "", want }
	for name, factory := range oauthFactories() {
		call, err := factory(server.URL, provider)
		if err != nil {
			t.Fatalf("%s eagerly called its provider", name)
		}
		if err := call(context.Background()); !errors.Is(err, want) {
			t.Fatalf("%s lost provider error", name)
		}
		call, err = factory(server.URL, func(context.Context) (string, error) { return "token\nheader", nil })
		if err != nil {
			t.Fatal(err)
		}
		if err := call(context.Background()); err == nil {
			t.Fatalf("%s accepted malformed provider token", name)
		}
	}
	if calls.Load() != 0 {
		t.Fatalf("unsafe requests=%d", calls.Load())
	}
}

type oauthCallFactory func(string, func(context.Context) (string, error)) (func(context.Context) error, error)

func oauthFactories() map[string]oauthCallFactory {
	return map[string]oauthCallFactory{
		"sending": func(url string, provider func(context.Context) (string, error)) (func(context.Context) error, error) {
			client, err := sending.NewWithTokenProvider(provider, sending.WithBaseURL(url))
			return func(ctx context.Context) error {
				_, err := client.SendingGetConnection(ctx, sending.SendingGetConnectionParams{})
				return err
			}, err
		},
		"mailbox": func(url string, provider func(context.Context) (string, error)) (func(context.Context) error, error) {
			client, err := mailbox.NewWithTokenProvider(provider, mailbox.WithBaseURL(url))
			return func(ctx context.Context) error {
				_, err := client.MailboxGetConnection(ctx, mailbox.MailboxGetConnectionParams{})
				return err
			}, err
		},
		"management": func(url string, provider func(context.Context) (string, error)) (func(context.Context) error, error) {
			client, err := management.NewWithTokenProvider(provider, management.WithBaseURL(url))
			return func(ctx context.Context) error {
				_, err := client.ManagementGetConnection(ctx, management.ManagementGetConnectionParams{})
				return err
			}, err
		},
	}
}
