package sending

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestAttachmentSupportsLegacyInlineLiteral(t *testing.T) {
	attachment := Attachment{
		Content:  "SGVsbG8=",
		Filename: "hello.txt",
	}

	body, err := json.Marshal(&attachment)
	if err != nil {
		t.Fatalf("marshal legacy inline attachment: %v", err)
	}

	encoded := string(body)
	if !strings.Contains(encoded, `"content":"SGVsbG8="`) {
		t.Fatalf("legacy inline attachment omitted content: %s", encoded)
	}
	if !strings.Contains(encoded, `"filename":"hello.txt"`) {
		t.Fatalf("legacy inline attachment omitted filename: %s", encoded)
	}
}

func TestAttachmentRefOmitsEmptyInlineFields(t *testing.T) {
	attachment := Attachment{
		AttachmentID: NewOptString("att_abc123abc123abc123abc123"),
	}

	body, err := json.Marshal(&attachment)
	if err != nil {
		t.Fatalf("marshal attachment ref: %v", err)
	}

	encoded := string(body)
	if strings.Contains(encoded, `"content"`) || strings.Contains(encoded, `"filename"`) {
		t.Fatalf("attachment ref encoded empty inline fields: %s", encoded)
	}
	if !strings.Contains(encoded, `"attachment_id":"att_abc123abc123abc123abc123"`) {
		t.Fatalf("attachment ref omitted attachment_id: %s", encoded)
	}
}
