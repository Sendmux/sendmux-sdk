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
	// KeySurfaceMailbox accepts mailbox-scoped API keys or scoped agent tokens.
	KeySurfaceMailbox KeySurface = "mailbox"
	// KeySurfaceSending accepts send-capable mailbox API keys or owner-approved agent tokens.
	KeySurfaceSending KeySurface = "sending"
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
	case surface == KeySurfaceMailbox && !isMailboxCompatibleAPIKey(apiKey):
		return errors.New("sendmux: mailbox API key must start with smx_mbx_ or smx_agent_")
	case surface == KeySurfaceSending && !isMailboxCompatibleAPIKey(apiKey):
		return errors.New("sendmux: sending API key must start with smx_mbx_ or smx_agent_")
	case surface != KeySurfaceRoot && surface != KeySurfaceMailbox && surface != KeySurfaceSending:
		return errors.New("sendmux: unknown API key surface")
	default:
		return nil
	}
}

func isMailboxCompatibleAPIKey(apiKey string) bool {
	return strings.HasPrefix(apiKey, "smx_mbx_") || strings.HasPrefix(apiKey, "smx_agent_")
}
