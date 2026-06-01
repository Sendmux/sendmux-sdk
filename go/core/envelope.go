package core

// SuccessEnvelope is the shared Sendmux response envelope shape.
type SuccessEnvelope[TData any, TMeta any] struct {
	Ok   bool  `json:"ok"`
	Data TData `json:"data"`
	Meta TMeta `json:"meta"`
}

// Pagination describes cursor pagination metadata.
type Pagination struct {
	HasMore    bool   `json:"has_more"`
	NextCursor string `json:"next_cursor"`
}
