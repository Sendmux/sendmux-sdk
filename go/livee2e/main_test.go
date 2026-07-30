package main

import (
	"testing"

	"sendmux.ai/go/management"
)

func TestAPIErrorExtractsHeaderWrappedManagementResponse(t *testing.T) {
	response := &management.ManagementCreateDomainServiceUnavailable{
		Response: management.ApiError{
			Error: management.ApiErrorError{
				Code:      management.ApiErrorErrorCodeServiceUnavailable,
				Message:   "service unavailable",
				Retryable: true,
			},
			Meta: management.ApiErrorMeta{RequestID: "req_unavailable"},
		},
	}

	got := apiError(response)
	if got == nil {
		t.Fatal("apiError() returned nil")
	}
	if got.Status != 503 {
		t.Fatalf("Status = %d, want 503", got.Status)
	}
	if got.Code != "service_unavailable" {
		t.Fatalf("Code = %q, want service_unavailable", got.Code)
	}
	if got.Message != "service unavailable" {
		t.Fatalf("Message = %q, want service unavailable", got.Message)
	}
	if got.RequestID != "req_unavailable" {
		t.Fatalf("RequestID = %q, want req_unavailable", got.RequestID)
	}
	if !got.Retryable {
		t.Fatal("Retryable = false, want true")
	}
}

func TestAPIErrorExtractsAdjacentHeaderWrappedStatus(t *testing.T) {
	response := &management.ManagementGetDeliveryPayloadNotFound{
		Response: management.ApiError{
			Error: management.ApiErrorError{
				Code:    management.ApiErrorErrorCodeNotFound,
				Message: "delivery payload not found",
			},
			Meta: management.ApiErrorMeta{RequestID: "req_not_found"},
		},
	}

	got := apiError(response)
	if got == nil {
		t.Fatal("apiError() returned nil")
	}
	if got.Status != 404 {
		t.Fatalf("Status = %d, want 404", got.Status)
	}
	if got.Code != "not_found" {
		t.Fatalf("Code = %q, want not_found", got.Code)
	}
}
