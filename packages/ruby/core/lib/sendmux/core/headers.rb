# frozen_string_literal: true

module Sendmux
  module Core
    module Headers
      def self.idempotency_key(value)
        { idempotency_key: value }
      end

      def self.if_match(value)
        { if_match: value }
      end

      def self.if_none_match(value)
        { if_none_match: value }
      end

      def self.conditional(if_match: nil, if_none_match: nil)
        {}.tap do |headers|
          headers[:if_match] = if_match if if_match
          headers[:if_none_match] = if_none_match if if_none_match
        end
      end
    end
  end
end
