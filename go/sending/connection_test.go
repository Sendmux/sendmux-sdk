package sending_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"sendmux.ai/go/core"
	"sendmux.ai/go/mailbox"
	"sendmux.ai/go/sending"
)

func TestConnectionAdditionPreservesExistingErrorLiterals(t *testing.T) {
	sendError := sending.SendingGetAttachmentUnauthorized{
		Error: sending.ErrorDetail{Code: "invalid_api_key", Message: "Invalid credential"},
		Meta:  sending.Meta{RequestID: "req_sending"},
	}
	mailboxError := mailbox.MailboxGetMeUnauthorized{
		Error: mailbox.ApiErrorError{Code: "invalid_api_key", Message: "Invalid credential"},
		Meta:  mailbox.ApiErrorMeta{RequestID: "req_mailbox"},
	}
	for name, apiError := range map[string]*core.APIError{
		"sending": sendError.APIError(), "mailbox": mailboxError.APIError(),
	} {
		if apiError == nil || apiError.Status != 401 || apiError.Code != "invalid_api_key" {
			t.Fatalf("%s lost its typed API error: %+v", name, apiError)
		}
	}
}

func TestConnectionDependencyErrorRetainsRetryHeaderAndTypedError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet || r.URL.RequestURI() != "/me" || r.Header.Get("Authorization") != "Bearer smx_mbx_test" {
			t.Errorf("unexpected connection request: %s %s", r.Method, r.URL.RequestURI())
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", "30")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"ok":false,"error":{"code":"service_unavailable","message":"Try later","retryable":true},"meta":{"request_id":"req_connection"}}`))
	}))
	defer server.Close()
	client, err := sending.New("smx_mbx_test", sending.WithBaseURL(server.URL), sending.WithRetryOptions(core.RetryOptions{MaxAttempts: 1}))
	if err != nil {
		t.Fatal(err)
	}
	result, err := client.SendingGetConnection(context.Background(), sending.SendingGetConnectionParams{})
	if err != nil {
		t.Fatal(err)
	}
	response, ok := result.(*sending.SendingGetConnectionServiceUnavailable)
	if !ok {
		t.Fatalf("unexpected connection result: %T", result)
	}
	if delay, present := response.RetryAfter.Get(); !present || delay != "30" {
		t.Fatalf("lost Retry-After: %+v", response.RetryAfter)
	}
	apiError := response.APIError()
	if apiError == nil || apiError.Status != 503 || !apiError.Retryable || apiError.RequestID != "req_connection" {
		t.Fatalf("lost typed connection error: %+v", apiError)
	}
}
