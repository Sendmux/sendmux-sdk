package mailbox_test

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"sendmux.ai/go/v2/mailbox"
)

func TestListResponseMetadataContracts(t *testing.T) {
	writeJSON := func(w http.ResponseWriter, body string) {
		t.Helper()
		if _, err := fmt.Fprint(w, body); err != nil {
			t.Errorf("write response: %v", err)
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch r.URL.Path {
		case "/mailbox/threads/thr_test/messages":
			writeJSON(w, `{"ok":true,"data":[],"pagination":{"has_more":false},"meta":{"request_id":"req_thread","thread_id":"thr_test","sync_state":"sync_thread"}}`)
		case "/mailbox/messages":
			writeJSON(w, `{"ok":true,"data":[],"pagination":{"has_more":false},"meta":{"request_id":"req_messages","sync_state":"sync_messages"}}`)
		default:
			http.NotFound(w, r)
		}
	}))
	t.Cleanup(server.Close)

	client, err := mailbox.New("smx_mbx_test", mailbox.WithBaseURL(server.URL))
	if err != nil {
		t.Fatal(err)
	}

	t.Run("thread list returns thread identity and typed sync state", func(t *testing.T) {
		result, err := client.MailboxListThreadMessages(context.Background(), mailbox.MailboxListThreadMessagesParams{ThreadID: "thr_test"})
		if err != nil {
			t.Fatal(err)
		}
		page, ok := result.(*mailbox.MailboxThreadMessageSummaryCursorListResponse)
		if !ok {
			t.Fatalf("thread list returned %T", result)
		}
		if len(page.Data) != 0 || page.Meta.ThreadID != "thr_test" || page.Meta.SyncState.Or("") != "sync_thread" {
			t.Fatalf("unexpected thread page: %#v", page)
		}
	})

	t.Run("ordinary message list remains thread independent", func(t *testing.T) {
		result, err := client.MailboxListMessages(context.Background(), mailbox.MailboxListMessagesParams{})
		if err != nil {
			t.Fatal(err)
		}
		page, ok := result.(*mailbox.MailboxMessageSummaryCursorListResponse)
		if !ok {
			t.Fatalf("message list returned %T", result)
		}
		if len(page.Data) != 0 || page.Meta.SyncState.Or("") != "sync_messages" {
			t.Fatalf("unexpected message page: %#v", page)
		}
	})
}
