# frozen_string_literal: true

module Sendmux
  module Core
    class RetryOptions
      RETRY_STATUSES = [408, 409, 425, 429, 500, 502, 503, 504].freeze

      attr_reader :max_attempts, :base_delay_seconds, :max_delay_seconds, :jitter

      def initialize(max_attempts: 3, base_delay_seconds: 0.25, max_delay_seconds: 5.0, jitter: true)
        raise ArgumentError, 'max_attempts must be at least 1' if max_attempts < 1
        if base_delay_seconds.negative? || max_delay_seconds.negative?
          raise ArgumentError,
                'retry delays must be non-negative'
        end

        @max_attempts = max_attempts
        @base_delay_seconds = base_delay_seconds
        @max_delay_seconds = max_delay_seconds
        @jitter = jitter
      end

      def to_faraday_options
        {
          max: max_attempts - 1,
          interval: base_delay_seconds,
          max_interval: max_delay_seconds,
          interval_randomness: jitter ? 0.5 : 0.0,
          backoff_factor: 2,
          methods: [],
          retry_statuses: RETRY_STATUSES,
          rate_limit_retry_header: 'Retry-After',
          rate_limit_reset_header: 'X-RateLimit-Reset',
          retry_if: ->(env, _exception) { Retry.retryable_request?(env) }
        }
      end
    end
  end
end
