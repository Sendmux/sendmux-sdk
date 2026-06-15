package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"reflect"
	"regexp"
	"strings"
	"time"

	"sendmux.ai/go/core"
	"sendmux.ai/go/mailbox"
	"sendmux.ai/go/management"
	"sendmux.ai/go/sending"
)

type plan struct {
	Operations []operation `json:"operations"`
}

type operation struct {
	BodyKind           string   `json:"bodyKind"`
	CleanupSelectors   []string `json:"cleanupSelectors"`
	ExpectedErrorCodes []string `json:"expectedErrorCodes"`
	OperationID        string   `json:"operationId"`
	Request            request  `json:"request"`
	ResponseKind       string   `json:"responseKind"`
	Risk               string   `json:"risk"`
	Surface            string   `json:"surface"`
}

type request struct {
	Body    any            `json:"body"`
	Headers map[string]any `json:"headers"`
	Path    map[string]any `json:"path"`
	Query   map[string]any `json:"query"`
}

type result struct {
	Adapter     string         `json:"adapter"`
	Cleanup     map[string]any `json:"cleanup,omitempty"`
	Error       string         `json:"error,omitempty"`
	OperationID string         `json:"operationId"`
	Status      string         `json:"status"`
}

type apiErrorer interface {
	APIError() *core.APIError
}

func main() {
	var input plan
	if err := json.Unmarshal([]byte(os.Getenv("SENDMUX_LIVE_E2E_LANGUAGE_PLAN")), &input); err != nil {
		failPlan(err)
	}

	clients, err := createClients()
	if err != nil {
		failPlan(err)
	}

	results := make([]result, 0, len(input.Operations))
	for _, op := range input.Operations {
		value, err := callOperation(clients[op.Surface], op)
		if err != nil {
			if code := apiErrorCode(err); code != "" && contains(op.ExpectedErrorCodes, code) {
				results = append(results, result{Adapter: "go", OperationID: op.OperationID, Status: "passed"})
				continue
			}
			results = append(results, result{Adapter: "go", Error: err.Error(), OperationID: op.OperationID, Status: "failed"})
			continue
		}

		if code := apiErrorCode(value); code != "" && contains(op.ExpectedErrorCodes, code) {
			results = append(results, result{Adapter: "go", OperationID: op.OperationID, Status: "passed"})
			continue
		}

		normalised, err := normaliseResult(value, op)
		if err != nil {
			results = append(results, result{Adapter: "go", Error: err.Error(), OperationID: op.OperationID, Status: "failed"})
			continue
		}
		if err := assertResponse(op, normalised); err != nil {
			results = append(results, result{Adapter: "go", Error: err.Error(), OperationID: op.OperationID, Status: "failed"})
			continue
		}

		entry := result{Adapter: "go", OperationID: op.OperationID, Status: "passed"}
		if cleanup := cleanupResult(op, normalised); len(cleanup) > 0 {
			entry.Cleanup = cleanup
		}
		results = append(results, entry)
	}

	encode(map[string]any{"results": results})
}

func createClients() (map[string]any, error) {
	retry := core.RetryOptions{MaxAttempts: 2, BaseDelay: 250 * time.Millisecond, MaxDelay: time.Second}
	mbox, err := mailbox.New(mailboxAPIKey(), mailbox.WithBaseURL(appBaseURL()), mailbox.WithRetryOptions(retry))
	if err != nil {
		return nil, err
	}
	mgmt, err := management.New(rootAPIKey(), management.WithBaseURL(appBaseURL()), management.WithRetryOptions(retry))
	if err != nil {
		return nil, err
	}
	send, err := sending.New(mailboxAPIKey(), sending.WithBaseURL(sendingBaseURL()), sending.WithRetryOptions(retry))
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"mailbox":    mbox,
		"management": mgmt,
		"sending":    send,
	}, nil
}

func callOperation(client any, op operation) (any, error) {
	if client == nil {
		return nil, fmt.Errorf("unknown Go SDK surface %s", op.Surface)
	}
	method := reflect.ValueOf(client).MethodByName(exportedOperationName(op.OperationID))
	if !method.IsValid() {
		return nil, fmt.Errorf("go SDK operation %s is not exported", op.OperationID)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()

	args := []reflect.Value{reflect.ValueOf(ctx)}
	for index := 1; index < method.Type().NumIn(); index++ {
		argType := method.Type().In(index)
		if strings.HasSuffix(argType.Name(), "Params") {
			value, err := buildParams(argType, op.Request)
			if err != nil {
				return nil, err
			}
			args = append(args, value)
			continue
		}
		value, err := buildRequestArg(argType, op)
		if err != nil {
			return nil, err
		}
		args = append(args, value)
	}

	out := method.Call(args)
	if len(out) != 2 {
		return nil, fmt.Errorf("go SDK operation %s returned %d values", op.OperationID, len(out))
	}
	if !out[1].IsNil() {
		err, _ := out[1].Interface().(error)
		return nil, err
	}
	return out[0].Interface(), nil
}

func buildParams(argType reflect.Type, req request) (reflect.Value, error) {
	value := reflect.New(argType).Elem()
	for source, params := range map[string]map[string]any{
		"path":    req.Path,
		"query":   req.Query,
		"headers": req.Headers,
	} {
		for name, raw := range params {
			field := findField(value, fieldCandidates(source, name))
			if !field.IsValid() {
				return value, fmt.Errorf("go SDK params %s has no field for %s %s", argType.Name(), source, name)
			}
			if err := setReflectValue(field, raw); err != nil {
				return value, fmt.Errorf("set %s.%s: %w", argType.Name(), name, err)
			}
		}
	}
	return value, nil
}

func buildRequestArg(argType reflect.Type, op operation) (reflect.Value, error) {
	body, hasBody := op.Request.Body, op.Request.Body != nil
	if op.BodyKind == "binary" && strings.HasSuffix(argType.Name(), "Req") {
		value := reflect.New(argType).Elem()
		field := value.FieldByName("Data")
		if !field.IsValid() {
			return value, fmt.Errorf("go SDK binary request %s has no Data field", argType.Name())
		}
		field.Set(reflect.ValueOf(strings.NewReader(fmt.Sprint(body))))
		return value, nil
	}
	if !hasBody {
		return reflect.Zero(argType), nil
	}

	bodyBytes, err := json.Marshal(body)
	if err != nil {
		return reflect.Zero(argType), err
	}

	if isOptionalType(argType) {
		value := reflect.New(argType).Elem()
		target := reflect.New(value.FieldByName("Value").Type())
		if err := json.Unmarshal(bodyBytes, target.Interface()); err != nil {
			return value, err
		}
		value.FieldByName("Value").Set(target.Elem())
		value.FieldByName("Set").SetBool(true)
		return value, nil
	}
	if argType.Kind() == reflect.Pointer {
		value := reflect.New(argType.Elem())
		if err := json.Unmarshal(bodyBytes, value.Interface()); err != nil {
			return value, err
		}
		return value, nil
	}

	value := reflect.New(argType).Elem()
	if err := json.Unmarshal(bodyBytes, value.Addr().Interface()); err != nil {
		return value, err
	}
	return value, nil
}

func normaliseResult(value any, op operation) (any, error) {
	if op.OperationID == "mailboxStreamEvents" {
		reader, ok := value.(io.Reader)
		if !ok {
			return nil, fmt.Errorf("mailboxStreamEvents did not return an io.Reader")
		}
		if closer, ok := value.(io.Closer); ok {
			defer func() {
				_ = closer.Close()
			}()
		}
		body, err := io.ReadAll(reader)
		if err != nil {
			return nil, err
		}
		return firstSSEEvent(body)
	}
	if op.ResponseKind == "binary" || op.OperationID == "mailboxGetMessageAttachment" {
		return "ok", nil
	}

	if err := apiError(value); err != nil {
		return map[string]any{
			"ok": false,
			"error": map[string]any{
				"code": err.Code,
			},
			"meta": map[string]any{
				"request_id": err.RequestID,
			},
		}, nil
	}

	value = unwrapGeneratedResponse(value)
	if op.ResponseKind == "text" {
		if text, ok, err := readTextResponse(value); ok || err != nil {
			return text, err
		}
	}
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	var out any
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, err
	}
	if envelope, ok := out.(map[string]any); ok {
		if response, ok := envelope["response"].(map[string]any); ok {
			if _, hasOK := response["ok"]; hasOK {
				return response, nil
			}
		}
	}
	return out, nil
}

func unwrapGeneratedResponse(value any) any {
	reflected := reflect.ValueOf(value)
	if !reflected.IsValid() {
		return value
	}
	method := reflected.MethodByName("GetResponse")
	if method.IsValid() && method.Type().NumIn() == 0 && method.Type().NumOut() == 1 {
		return method.Call(nil)[0].Interface()
	}
	return value
}

func readTextResponse(value any) (string, bool, error) {
	if text, ok := value.(string); ok {
		return text, true, nil
	}
	if reader, ok := value.(io.Reader); ok {
		if closer, ok := value.(io.Closer); ok {
			defer func() {
				_ = closer.Close()
			}()
		}
		data, err := io.ReadAll(reader)
		return string(data), true, err
	}
	return "", false, nil
}

func firstSSEEvent(body []byte) (map[string]any, error) {
	for _, block := range bytes.Split(bytes.ReplaceAll(body, []byte("\r\n"), []byte("\n")), []byte("\n\n")) {
		var lines []string
		for _, line := range bytes.Split(block, []byte("\n")) {
			if bytes.HasPrefix(line, []byte("data:")) {
				lines = append(lines, strings.TrimSpace(string(bytes.TrimPrefix(line, []byte("data:")))))
			}
		}
		if len(lines) == 0 {
			continue
		}
		var out map[string]any
		if err := json.Unmarshal([]byte(strings.Join(lines, "\n")), &out); err != nil {
			return nil, err
		}
		return out, nil
	}
	return nil, fmt.Errorf("mailboxStreamEvents did not yield an SSE data event")
}

func assertResponse(op operation, value any) error {
	if len(op.ExpectedErrorCodes) > 0 {
		envelope, ok := value.(map[string]any)
		if !ok || envelope["ok"] != false {
			return fmt.Errorf("%s expected a safe API error response", op.OperationID)
		}
		code, _ := valueAtPath(envelope, "error.code").(string)
		if !contains(op.ExpectedErrorCodes, code) {
			return fmt.Errorf("%s returned unexpected error code %s", op.OperationID, code)
		}
		if _, ok := valueAtPath(envelope, "meta.request_id").(string); !ok {
			return fmt.Errorf("%s did not return meta.request_id", op.OperationID)
		}
		return nil
	}

	if op.OperationID == "mailboxStreamEvents" {
		envelope, ok := value.(map[string]any)
		if !ok {
			return fmt.Errorf("mailboxStreamEvents did not return an event object")
		}
		eventType, _ := firstString(envelope["event_type"], envelope["event"])
		if !contains([]string{"message.received", "message.received.spam", "sync_required"}, eventType) {
			return fmt.Errorf("mailboxStreamEvents did not return a mailbox realtime event")
		}
		return nil
	}
	if op.ResponseKind == "binary" || op.OperationID == "mailboxGetMessageAttachment" {
		if text, ok := value.(string); ok && text != "" {
			return nil
		}
		if envelope, ok := value.(map[string]any); ok && len(envelope) > 0 {
			return nil
		}
		return fmt.Errorf("%s did not return binary content", op.OperationID)
	}
	if op.ResponseKind == "text" {
		if text, ok := value.(string); ok && text != "" {
			return nil
		}
		return fmt.Errorf("%s did not return text", op.OperationID)
	}
	if op.OperationID == "sendingGetOpenApiSpec" {
		envelope, ok := value.(map[string]any)
		if !ok || envelope["openapi"] != "3.1.0" {
			return fmt.Errorf("sendingGetOpenApiSpec did not return OpenAPI 3.1")
		}
		if _, ok := envelope["paths"].(map[string]any); !ok {
			return fmt.Errorf("sendingGetOpenApiSpec did not return paths")
		}
		return nil
	}

	envelope, ok := value.(map[string]any)
	if !ok || envelope["ok"] != true {
		return fmt.Errorf("%s did not return ok=true", op.OperationID)
	}
	if _, ok := valueAtPath(envelope, "meta.request_id").(string); !ok {
		return fmt.Errorf("%s did not return meta.request_id", op.OperationID)
	}
	return nil
}

func cleanupResult(op operation, value any) map[string]any {
	out := map[string]any{}
	for _, selector := range op.CleanupSelectors {
		if selected := valueAtPath(value, selector); selected != nil {
			setValueAtPath(out, selector, selected)
		}
	}
	return out
}

func setValueAtPath(target map[string]any, selector string, value any) {
	current := target
	parts := strings.Split(selector, ".")
	for index, part := range parts {
		if index == len(parts)-1 {
			current[part] = value
			return
		}
		child, ok := current[part].(map[string]any)
		if !ok {
			child = map[string]any{}
			current[part] = child
		}
		current = child
	}
}

func findField(value reflect.Value, candidates []string) reflect.Value {
	for _, name := range candidates {
		field := value.FieldByName(name)
		if field.IsValid() && field.CanSet() {
			return field
		}
	}
	return reflect.Value{}
}

func fieldCandidates(source string, name string) []string {
	if source == "headers" && name == "Last-Event-ID" {
		return []string{"HeaderLastEventID", "LastEventID"}
	}
	if source == "query" && name == "last_event_id" {
		return []string{"QueryLastEventID", "LastEventID"}
	}
	candidate := exportedParameterName(name)
	return []string{candidate}
}

func setReflectValue(field reflect.Value, raw any) error {
	if isOptionalType(field.Type()) {
		if err := setReflectValue(field.FieldByName("Value"), raw); err != nil {
			return err
		}
		field.FieldByName("Set").SetBool(true)
		return nil
	}
	if field.Kind() == reflect.Pointer {
		value := reflect.New(field.Type().Elem())
		if err := setReflectValue(value.Elem(), raw); err != nil {
			return err
		}
		field.Set(value)
		return nil
	}
	switch field.Kind() {
	case reflect.String:
		text := fmt.Sprint(raw)
		field.Set(reflect.ValueOf(text).Convert(field.Type()))
	case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
		number, err := int64Value(raw)
		if err != nil {
			return err
		}
		field.SetInt(number)
	case reflect.Bool:
		boolean, ok := raw.(bool)
		if !ok {
			return fmt.Errorf("expected bool, got %T", raw)
		}
		field.SetBool(boolean)
	default:
		data, err := json.Marshal(raw)
		if err != nil {
			return err
		}
		target := reflect.New(field.Type())
		if err := json.Unmarshal(data, target.Interface()); err != nil {
			return err
		}
		field.Set(target.Elem())
	}
	return nil
}

func isOptionalType(t reflect.Type) bool {
	if t.Kind() != reflect.Struct {
		return false
	}
	_, hasSet := t.FieldByName("Set")
	_, hasValue := t.FieldByName("Value")
	return hasSet && hasValue
}

func int64Value(raw any) (int64, error) {
	switch value := raw.(type) {
	case float64:
		return int64(value), nil
	case int:
		return int64(value), nil
	case int64:
		return value, nil
	case string:
		var out int64
		_, err := fmt.Sscan(value, &out)
		return out, err
	default:
		return 0, fmt.Errorf("expected number, got %T", raw)
	}
}

func apiErrorCode(value any) string {
	if err := apiError(value); err != nil {
		return err.Code
	}
	if err, ok := value.(*core.APIError); ok {
		return err.Code
	}
	return ""
}

func apiError(value any) *core.APIError {
	if errorer, ok := value.(apiErrorer); ok {
		return errorer.APIError()
	}
	return nil
}

func exportedOperationName(value string) string {
	return strings.ToUpper(value[:1]) + value[1:]
}

func exportedParameterName(value string) string {
	parts := regexp.MustCompile(`[-_]`).Split(value, -1)
	out := strings.Builder{}
	for _, part := range parts {
		switch strings.ToLower(part) {
		case "id":
			out.WriteString("ID")
		case "url":
			out.WriteString("URL")
		case "api":
			out.WriteString("API")
		default:
			if part == "" {
				continue
			}
			out.WriteString(strings.ToUpper(part[:1]))
			if len(part) > 1 {
				out.WriteString(strings.ToLower(part[1:]))
			}
		}
	}
	return out.String()
}

func valueAtPath(value any, selector string) any {
	current := value
	for _, segment := range strings.Split(selector, ".") {
		switch typed := current.(type) {
		case map[string]any:
			current = typed[segment]
		case []any:
			var index int
			if _, err := fmt.Sscan(segment, &index); err != nil || index < 0 || index >= len(typed) {
				return nil
			}
			current = typed[index]
		default:
			return nil
		}
	}
	return current
}

func firstString(values ...any) (string, bool) {
	for _, value := range values {
		if text, ok := value.(string); ok && text != "" {
			return text, true
		}
	}
	return "", false
}

func contains(values []string, needle string) bool {
	for _, value := range values {
		if value == needle {
			return true
		}
	}
	return false
}

func appBaseURL() string {
	return firstEnvOrDefault("https://app.sendmux.ai/api/v1", "SENDMUX_LIVE_E2E_APP_BASE_URL", "SENDMUX_STAGING_APP_BASE_URL")
}

func sendingBaseURL() string {
	return firstEnvOrDefault("https://smtp.sendmux.ai/api/v1", "SENDMUX_LIVE_E2E_SENDING_BASE_URL", "SENDMUX_STAGING_SMTP_BASE_URL")
}

func rootAPIKey() string {
	return requiredEnv("SENDMUX_LIVE_E2E_ROOT_API_KEY", "SENDMUX_STAGING_ROOT_API_KEY")
}

func mailboxAPIKey() string {
	return requiredEnv("SENDMUX_LIVE_E2E_MAILBOX_API_KEY", "SENDMUX_STAGING_MAILBOX_API_KEY")
}

func firstEnv(names ...string) string {
	for _, name := range names {
		if value := os.Getenv(name); value != "" {
			return value
		}
	}
	return ""
}

func firstEnvOrDefault(defaultValue string, names ...string) string {
	if value := firstEnv(names...); value != "" {
		return value
	}
	return defaultValue
}

func requiredEnv(names ...string) string {
	if value := firstEnv(names...); value != "" {
		return value
	}
	failPlan(fmt.Errorf("missing required environment variable: %s", strings.Join(names, " or ")))
	return ""
}

func failPlan(err error) {
	encode(map[string]any{
		"results": []result{{
			Adapter:     "go",
			Error:       err.Error(),
			OperationID: "go-plan",
			Status:      "failed",
		}},
	})
	os.Exit(0)
}

func encode(value any) {
	encoder := json.NewEncoder(os.Stdout)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(value); err != nil {
		panic(err)
	}
}
