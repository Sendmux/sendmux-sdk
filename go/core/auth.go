package core

import (
	"errors"
	"strings"
)

// KeySurface identifies the Sendmux API key category a client accepts.
type KeySurface string

const (
	// KeySurfaceRoot accepts root/team API keys.
	KeySurfaceRoot KeySurface = "root"
	// KeySurfaceMailbox accepts mailbox-scoped API keys.
	KeySurfaceMailbox KeySurface = "mailbox"
)

// ValidateAPIKey validates the key prefix for a Sendmux surface.
func ValidateAPIKey(apiKey string, surface KeySurface) error {
	switch {
	case apiKey == "":
		return errors.New("sendmux: api key is required")
	case strings.ContainsAny(apiKey, "\r\n"):
		return errors.New("sendmux: api key must not contain control newlines")
	case surface == KeySurfaceRoot && !strings.HasPrefix(apiKey, "smx_root_"):
		return errors.New("sendmux: root API key must start with smx_root_")
	case surface == KeySurfaceMailbox && !strings.HasPrefix(apiKey, "smx_mbx_"):
		return errors.New("sendmux: mailbox API key must start with smx_mbx_")
	case surface != KeySurfaceRoot && surface != KeySurfaceMailbox:
		return errors.New("sendmux: unknown API key surface")
	default:
		return nil
	}
}
