package sending

import "sendmux.ai/go/core"

// APIError maps SendingSendEmailBadRequest into the shared typed API error.
func (r *SendingSendEmailBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps SendingSendEmailBatchBadRequest into the shared typed API error.
func (r *SendingSendEmailBatchBadRequest) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 400)
	return err
}

// APIError maps SendingSendEmailBatchConflict into the shared typed API error.
func (r *SendingSendEmailBatchConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps SendingSendEmailBatchForbidden into the shared typed API error.
func (r *SendingSendEmailBatchForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps SendingSendEmailBatchPaymentRequired into the shared typed API error.
func (r *SendingSendEmailBatchPaymentRequired) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 402)
	return err
}

// APIError maps SendingSendEmailBatchRequestEntityTooLarge into the shared typed API error.
func (r *SendingSendEmailBatchRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps SendingSendEmailBatchServiceUnavailable into the shared typed API error.
func (r *SendingSendEmailBatchServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps SendingSendEmailBatchTooManyRequests into the shared typed API error.
func (r *SendingSendEmailBatchTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps SendingSendEmailBatchUnauthorized into the shared typed API error.
func (r *SendingSendEmailBatchUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps SendingSendEmailBatchUnprocessableEntity into the shared typed API error.
func (r *SendingSendEmailBatchUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}

// APIError maps SendingSendEmailConflict into the shared typed API error.
func (r *SendingSendEmailConflict) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 409)
	return err
}

// APIError maps SendingSendEmailForbidden into the shared typed API error.
func (r *SendingSendEmailForbidden) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 403)
	return err
}

// APIError maps SendingSendEmailPaymentRequired into the shared typed API error.
func (r *SendingSendEmailPaymentRequired) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 402)
	return err
}

// APIError maps SendingSendEmailRequestEntityTooLarge into the shared typed API error.
func (r *SendingSendEmailRequestEntityTooLarge) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 413)
	return err
}

// APIError maps SendingSendEmailServiceUnavailable into the shared typed API error.
func (r *SendingSendEmailServiceUnavailable) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 503)
	return err
}

// APIError maps SendingSendEmailTooManyRequests into the shared typed API error.
func (r *SendingSendEmailTooManyRequests) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 429)
	return err
}

// APIError maps SendingSendEmailUnauthorized into the shared typed API error.
func (r *SendingSendEmailUnauthorized) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 401)
	return err
}

// APIError maps SendingSendEmailUnprocessableEntity into the shared typed API error.
func (r *SendingSendEmailUnprocessableEntity) APIError() *core.APIError {
	err, _ := core.APIErrorFromResponse(r, 422)
	return err
}
