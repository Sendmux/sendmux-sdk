# frozen_string_literal: true

require 'faraday/retry'

module Sendmux
  module Core
    module Retry
      SAFE_METHODS = %w[GET HEAD OPTIONS].freeze

      def self.configure(configuration, retry_options = nil)
        options = retry_options || RetryOptions.new
        configuration.request(:retry, options.to_faraday_options)
      end

      def self.retryable_request?(env)
        method = env[:method].to_s.upcase
        return true if SAFE_METHODS.include?(method)

        method == 'POST' && header(env[:request_headers] || {}, 'Idempotency-Key') && replayable_body?(env[:body])
      end

      def self.header(headers, name)
        headers.find { |key, _value| key.to_s.downcase == name.downcase }&.last
      end

      def self.replayable_body?(body)
        body.nil? || body.is_a?(String) || body.respond_to?(:rewind)
      end
    end
  end
end
