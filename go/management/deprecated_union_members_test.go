package management

import (
	"encoding/json"
	"testing"
)

// The eight quota unions renamed their object member from Nil<Union>1 to ProviderQuotaRange; the
// former member API is kept as deprecated shims. Setting through the former API and through the
// current one must encode the same bytes for a value and for null, leave the int member alone, and
// read back through the former API.
type quotaUnionShimCase struct {
	name       string
	viaFormer  func(NilProviderQuotaRange) json.Marshaler
	viaCurrent func(NilProviderQuotaRange) json.Marshaler
	viaInt     func(int) json.Marshaler
	// Get<former>, its ok, Is<former>, and whether Type equals the former discriminator constant.
	readFormer func(json.Marshaler) (NilProviderQuotaRange, bool, bool, bool)
}

var quotaUnionShimCases = []quotaUnionShimCase{
	{
		name: "ProviderCreateBodyQuotasPerDay",
		viaFormer: func(v NilProviderQuotaRange) json.Marshaler {
			return NewNilProviderCreateBodyQuotasPerDay1ProviderCreateBodyQuotasPerDay(v)
		},
		viaCurrent: func(v NilProviderQuotaRange) json.Marshaler {
			if v.Null {
				return NewNullProviderCreateBodyQuotasPerDay(struct{}{})
			}
			return NewProviderQuotaRangeProviderCreateBodyQuotasPerDay(v.Value)
		},
		viaInt: func(n int) json.Marshaler { return NewIntProviderCreateBodyQuotasPerDay(n) },
		readFormer: func(u json.Marshaler) (NilProviderQuotaRange, bool, bool, bool) {
			s := u.(ProviderCreateBodyQuotasPerDay)
			got, ok := s.GetNilProviderCreateBodyQuotasPerDay1()
			return got, ok, s.IsNilProviderCreateBodyQuotasPerDay1(), s.Type == NilProviderCreateBodyQuotasPerDay1ProviderCreateBodyQuotasPerDay
		},
	},
	{
		name: "ProviderCreateBodyQuotasPerHour",
		viaFormer: func(v NilProviderQuotaRange) json.Marshaler {
			return NewNilProviderCreateBodyQuotasPerHour1ProviderCreateBodyQuotasPerHour(v)
		},
		viaCurrent: func(v NilProviderQuotaRange) json.Marshaler {
			if v.Null {
				return NewNullProviderCreateBodyQuotasPerHour(struct{}{})
			}
			return NewProviderQuotaRangeProviderCreateBodyQuotasPerHour(v.Value)
		},
		viaInt: func(n int) json.Marshaler { return NewIntProviderCreateBodyQuotasPerHour(n) },
		readFormer: func(u json.Marshaler) (NilProviderQuotaRange, bool, bool, bool) {
			s := u.(ProviderCreateBodyQuotasPerHour)
			got, ok := s.GetNilProviderCreateBodyQuotasPerHour1()
			return got, ok, s.IsNilProviderCreateBodyQuotasPerHour1(), s.Type == NilProviderCreateBodyQuotasPerHour1ProviderCreateBodyQuotasPerHour
		},
	},
	{
		name: "ProviderCreateBodyQuotasPerMinute",
		viaFormer: func(v NilProviderQuotaRange) json.Marshaler {
			return NewNilProviderCreateBodyQuotasPerMinute1ProviderCreateBodyQuotasPerMinute(v)
		},
		viaCurrent: func(v NilProviderQuotaRange) json.Marshaler {
			if v.Null {
				return NewNullProviderCreateBodyQuotasPerMinute(struct{}{})
			}
			return NewProviderQuotaRangeProviderCreateBodyQuotasPerMinute(v.Value)
		},
		viaInt: func(n int) json.Marshaler { return NewIntProviderCreateBodyQuotasPerMinute(n) },
		readFormer: func(u json.Marshaler) (NilProviderQuotaRange, bool, bool, bool) {
			s := u.(ProviderCreateBodyQuotasPerMinute)
			got, ok := s.GetNilProviderCreateBodyQuotasPerMinute1()
			return got, ok, s.IsNilProviderCreateBodyQuotasPerMinute1(), s.Type == NilProviderCreateBodyQuotasPerMinute1ProviderCreateBodyQuotasPerMinute
		},
	},
	{
		name: "ProviderCreateBodyQuotasPerSecond",
		viaFormer: func(v NilProviderQuotaRange) json.Marshaler {
			return NewNilProviderCreateBodyQuotasPerSecond1ProviderCreateBodyQuotasPerSecond(v)
		},
		viaCurrent: func(v NilProviderQuotaRange) json.Marshaler {
			if v.Null {
				return NewNullProviderCreateBodyQuotasPerSecond(struct{}{})
			}
			return NewProviderQuotaRangeProviderCreateBodyQuotasPerSecond(v.Value)
		},
		viaInt: func(n int) json.Marshaler { return NewIntProviderCreateBodyQuotasPerSecond(n) },
		readFormer: func(u json.Marshaler) (NilProviderQuotaRange, bool, bool, bool) {
			s := u.(ProviderCreateBodyQuotasPerSecond)
			got, ok := s.GetNilProviderCreateBodyQuotasPerSecond1()
			return got, ok, s.IsNilProviderCreateBodyQuotasPerSecond1(), s.Type == NilProviderCreateBodyQuotasPerSecond1ProviderCreateBodyQuotasPerSecond
		},
	},
	{
		name: "ProviderUpdateBodyQuotasPerDay",
		viaFormer: func(v NilProviderQuotaRange) json.Marshaler {
			return NewNilProviderUpdateBodyQuotasPerDay1ProviderUpdateBodyQuotasPerDay(v)
		},
		viaCurrent: func(v NilProviderQuotaRange) json.Marshaler {
			if v.Null {
				return NewNullProviderUpdateBodyQuotasPerDay(struct{}{})
			}
			return NewProviderQuotaRangeProviderUpdateBodyQuotasPerDay(v.Value)
		},
		viaInt: func(n int) json.Marshaler { return NewIntProviderUpdateBodyQuotasPerDay(n) },
		readFormer: func(u json.Marshaler) (NilProviderQuotaRange, bool, bool, bool) {
			s := u.(ProviderUpdateBodyQuotasPerDay)
			got, ok := s.GetNilProviderUpdateBodyQuotasPerDay1()
			return got, ok, s.IsNilProviderUpdateBodyQuotasPerDay1(), s.Type == NilProviderUpdateBodyQuotasPerDay1ProviderUpdateBodyQuotasPerDay
		},
	},
	{
		name: "ProviderUpdateBodyQuotasPerHour",
		viaFormer: func(v NilProviderQuotaRange) json.Marshaler {
			return NewNilProviderUpdateBodyQuotasPerHour1ProviderUpdateBodyQuotasPerHour(v)
		},
		viaCurrent: func(v NilProviderQuotaRange) json.Marshaler {
			if v.Null {
				return NewNullProviderUpdateBodyQuotasPerHour(struct{}{})
			}
			return NewProviderQuotaRangeProviderUpdateBodyQuotasPerHour(v.Value)
		},
		viaInt: func(n int) json.Marshaler { return NewIntProviderUpdateBodyQuotasPerHour(n) },
		readFormer: func(u json.Marshaler) (NilProviderQuotaRange, bool, bool, bool) {
			s := u.(ProviderUpdateBodyQuotasPerHour)
			got, ok := s.GetNilProviderUpdateBodyQuotasPerHour1()
			return got, ok, s.IsNilProviderUpdateBodyQuotasPerHour1(), s.Type == NilProviderUpdateBodyQuotasPerHour1ProviderUpdateBodyQuotasPerHour
		},
	},
	{
		name: "ProviderUpdateBodyQuotasPerMinute",
		viaFormer: func(v NilProviderQuotaRange) json.Marshaler {
			return NewNilProviderUpdateBodyQuotasPerMinute1ProviderUpdateBodyQuotasPerMinute(v)
		},
		viaCurrent: func(v NilProviderQuotaRange) json.Marshaler {
			if v.Null {
				return NewNullProviderUpdateBodyQuotasPerMinute(struct{}{})
			}
			return NewProviderQuotaRangeProviderUpdateBodyQuotasPerMinute(v.Value)
		},
		viaInt: func(n int) json.Marshaler { return NewIntProviderUpdateBodyQuotasPerMinute(n) },
		readFormer: func(u json.Marshaler) (NilProviderQuotaRange, bool, bool, bool) {
			s := u.(ProviderUpdateBodyQuotasPerMinute)
			got, ok := s.GetNilProviderUpdateBodyQuotasPerMinute1()
			return got, ok, s.IsNilProviderUpdateBodyQuotasPerMinute1(), s.Type == NilProviderUpdateBodyQuotasPerMinute1ProviderUpdateBodyQuotasPerMinute
		},
	},
	{
		name: "ProviderUpdateBodyQuotasPerSecond",
		viaFormer: func(v NilProviderQuotaRange) json.Marshaler {
			return NewNilProviderUpdateBodyQuotasPerSecond1ProviderUpdateBodyQuotasPerSecond(v)
		},
		viaCurrent: func(v NilProviderQuotaRange) json.Marshaler {
			if v.Null {
				return NewNullProviderUpdateBodyQuotasPerSecond(struct{}{})
			}
			return NewProviderQuotaRangeProviderUpdateBodyQuotasPerSecond(v.Value)
		},
		viaInt: func(n int) json.Marshaler { return NewIntProviderUpdateBodyQuotasPerSecond(n) },
		readFormer: func(u json.Marshaler) (NilProviderQuotaRange, bool, bool, bool) {
			s := u.(ProviderUpdateBodyQuotasPerSecond)
			got, ok := s.GetNilProviderUpdateBodyQuotasPerSecond1()
			return got, ok, s.IsNilProviderUpdateBodyQuotasPerSecond1(), s.Type == NilProviderUpdateBodyQuotasPerSecond1ProviderUpdateBodyQuotasPerSecond
		},
	},
}

func TestDeprecatedQuotaUnionMemberShims(t *testing.T) {
	value := NewNilProviderQuotaRange(ProviderQuotaRange{Max: 500, Min: 10})
	null := NilProviderQuotaRange{Null: true}
	inputs := []struct {
		label string
		in    NilProviderQuotaRange
		want  string
	}{
		{label: "value", in: value, want: `{"max":500,"min":10}`},
		{label: "null", in: null, want: `null`},
	}
	for _, tc := range quotaUnionShimCases {
		t.Run(tc.name, func(t *testing.T) {
			for _, input := range inputs {
				former := encode(t, tc.viaFormer(input.in))
				current := encode(t, tc.viaCurrent(input.in))
				if former != current || former != input.want {
					t.Fatalf("%s: former API encodes %s, current API encodes %s, want %s", input.label, former, current, input.want)
				}
				for _, built := range []json.Marshaler{tc.viaFormer(input.in), tc.viaCurrent(input.in)} {
					got, ok, is, formerDiscriminator := tc.readFormer(built)
					if !ok || !is || got != input.in {
						t.Fatalf("%s: former Get/Is read back (%+v, %v, %v), want (%+v, true, true)", input.label, got, ok, is, input.in)
					}
					if formerDiscriminator != !input.in.Null {
						t.Fatalf("%s: Type equals the former discriminator constant = %v; the value case must, the null case reports the Null member", input.label, formerDiscriminator)
					}
				}
			}
			integer := tc.viaInt(7)
			if got := encode(t, integer); got != "7" {
				t.Fatalf("int member encodes %s, want 7", got)
			}
			if got, ok, is, formerDiscriminator := tc.readFormer(integer); ok || is || formerDiscriminator || got != (NilProviderQuotaRange{}) {
				t.Fatalf("int member read through the former API as (%+v, %v, %v, %v), want zero and false", got, ok, is, formerDiscriminator)
			}
		})
	}
}

func encode(t *testing.T, value json.Marshaler) string {
	t.Helper()
	data, err := value.MarshalJSON()
	if err != nil {
		t.Fatalf("MarshalJSON: %v", err)
	}
	return string(data)
}
