package core

import (
	"fmt"
	"reflect"
)

// ErrorIssue is one field-level validation issue returned by the API.
type ErrorIssue struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Path    string `json:"path"`
}

// APIError is the typed Sendmux API error used across generated packages.
type APIError struct {
	Status    int          `json:"status"`
	Code      string       `json:"code"`
	Message   string       `json:"message"`
	RequestID string       `json:"request_id"`
	Param     string       `json:"param,omitempty"`
	Retryable bool         `json:"retryable"`
	Errors    []ErrorIssue `json:"errors,omitempty"`
}

func (e *APIError) Error() string {
	if e == nil {
		return "sendmux: api error"
	}
	if e.Code != "" && e.Message != "" {
		return fmt.Sprintf("sendmux: %s: %s", e.Code, e.Message)
	}
	if e.Message != "" {
		return fmt.Sprintf("sendmux: %s", e.Message)
	}
	if e.Code != "" {
		return fmt.Sprintf("sendmux: %s", e.Code)
	}
	return fmt.Sprintf("sendmux: api error status %d", e.Status)
}

// ErrorMessageFromResponse returns the stable error string for a generated error response.
func ErrorMessageFromResponse(response any, status int) string {
	apiError, ok := APIErrorFromResponse(response, status)
	if !ok {
		return fmt.Sprintf("sendmux: api error status %d", status)
	}
	return apiError.Error()
}

// APIErrorFromResponse maps an ogen generated ErrorResponse-shaped value.
func APIErrorFromResponse(response any, status int) (*APIError, bool) {
	value := reflect.Indirect(reflect.ValueOf(response))
	if !value.IsValid() || value.Kind() != reflect.Struct {
		return nil, false
	}

	errorValue := reflect.Indirect(value.FieldByName("Error"))
	if !errorValue.IsValid() || errorValue.Kind() != reflect.Struct {
		return nil, false
	}

	metaValue := reflect.Indirect(value.FieldByName("Meta"))
	apiError := &APIError{
		Status:    status,
		Code:      stringField(errorValue, "Code"),
		Message:   stringField(errorValue, "Message"),
		RequestID: stringField(metaValue, "RequestID"),
		Param:     optionalStringField(errorValue, "Param"),
		Retryable: boolField(errorValue, "Retryable"),
		Errors:    issueSlice(errorValue.FieldByName("Errors")),
	}
	return apiError, true
}

func stringField(value reflect.Value, name string) string {
	field := value.FieldByName(name)
	if !field.IsValid() || field.Kind() != reflect.String {
		return ""
	}
	return field.String()
}

func boolField(value reflect.Value, name string) bool {
	field := value.FieldByName(name)
	if !field.IsValid() || field.Kind() != reflect.Bool {
		return false
	}
	return field.Bool()
}

func optionalStringField(value reflect.Value, name string) string {
	field := value.FieldByName(name)
	if !field.IsValid() {
		return ""
	}

	method := field.MethodByName("Get")
	if !method.IsValid() {
		return ""
	}

	result := method.Call(nil)
	if len(result) != 2 || result[0].Kind() != reflect.String || result[1].Kind() != reflect.Bool {
		return ""
	}
	if !result[1].Bool() {
		return ""
	}
	return result[0].String()
}

func issueSlice(value reflect.Value) []ErrorIssue {
	if !value.IsValid() || value.Kind() != reflect.Slice {
		return nil
	}

	out := make([]ErrorIssue, 0, value.Len())
	for index := 0; index < value.Len(); index++ {
		item := reflect.Indirect(value.Index(index))
		if !item.IsValid() || item.Kind() != reflect.Struct {
			continue
		}
		out = append(out, ErrorIssue{
			Code:    stringField(item, "Code"),
			Message: stringField(item, "Message"),
			Path:    stringField(item, "Path"),
		})
	}
	return out
}
