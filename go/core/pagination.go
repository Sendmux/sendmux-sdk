package core

import "context"

// Page is the minimal cursor page shape consumed by IterateCursor.
type Page[T any] interface {
	Items() []T
	Pagination() Pagination
}

// IterateCursor streams items across cursor-paginated Sendmux pages.
func IterateCursor[T any](ctx context.Context, fetch func(context.Context, string) (Page[T], error)) func(func(T, error) bool) {
	return func(yield func(T, error) bool) {
		var cursor string
		for {
			page, err := fetch(ctx, cursor)
			if err != nil {
				yield(*new(T), err)
				return
			}

			for _, item := range page.Items() {
				if !yield(item, nil) {
					return
				}
			}

			pagination := page.Pagination()
			if !pagination.HasMore || pagination.NextCursor == "" {
				return
			}
			cursor = pagination.NextCursor
		}
	}
}
