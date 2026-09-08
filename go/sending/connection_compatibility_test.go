package sending_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/ogen-go/ogen/middleware"

	"sendmux.ai/go/sending"
)

// Hide the promoted connection method to model a pre-1.5 implementation.
type legacySendingHandler struct {
	sending.UnimplementedHandler
	SendingGetConnection struct{}
}

type connectionSendingHandler struct {
	legacySendingHandler
}

func (connectionSendingHandler) SendingGetConnection(context.Context, sending.SendingGetConnectionParams) (sending.SendingGetConnectionRes, error) {
	var response sending.ConnectionResponseHeaders
	err := json.Unmarshal([]byte(`{"ok":true,"data":{"team":{"id":"team_test","name":"Test team"},"credential":{"id":"key_test","type":"api_key","name":null},"label":"Test team","permissions":[],"mailboxes":[]},"meta":{"request_id":"req_test"}}`), &response.Response)
	return &response, err
}

func TestConnectionHandlerExtensionWorksWithAndWithoutMiddleware(t *testing.T) {
	for _, withMiddleware := range []bool{false, true} {
		name := "direct"
		var options []sending.ServerOption
		if withMiddleware {
			name = "middleware"
			options = append(options, sending.WithMiddleware(func(req middleware.Request, next middleware.Next) (middleware.Response, error) {
				return next(req)
			}))
		}
		t.Run(name, func(t *testing.T) {
			server, err := sending.NewServer(connectionSendingHandler{}, connectionSecurity{}, options...)
			if err != nil {
				t.Fatal(err)
			}
			request := httptest.NewRequest(http.MethodGet, "/me", nil)
			request.Header.Set("Authorization", "Bearer smx_mbx_test")
			response := httptest.NewRecorder()
			server.ServeHTTP(response, request)
			if response.Code != http.StatusOK {
				t.Fatalf("connection handler: got %d, want 200", response.Code)
			}
			var body sending.ConnectionResponse
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body.Data.Label != "Test team" || body.Meta.RequestID != "req_test" {
				t.Fatalf("connection metadata lost: %+v", body)
			}
		})
	}
}

var _ sending.Invoker = legacySendingHandler{}

type connectionSecurity struct{}

func (connectionSecurity) HandleBearerAuth(ctx context.Context, _ sending.OperationName, _ sending.BearerAuth) (context.Context, error) {
	return ctx, nil
}

func TestLegacyHandlerRetainsConnectionNotImplementedResponse(t *testing.T) {
	server, err := sending.NewServer(legacySendingHandler{}, connectionSecurity{})
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(http.MethodGet, "/me", nil)
	request.Header.Set("Authorization", "Bearer smx_mbx_test")
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusNotImplemented {
		t.Fatalf("legacy handler: got %d, want 501", response.Code)
	}
}
