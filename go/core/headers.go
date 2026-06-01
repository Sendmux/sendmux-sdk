package core

import (
	"errors"
	"strings"
)

// ValidateHeaderValue rejects header values that would break HTTP framing.
func ValidateHeaderValue(value string) error {
	if strings.ContainsAny(value, "\r\n") {
		return errors.New("sendmux: header value must not contain control newlines")
	}
	return nil
}
