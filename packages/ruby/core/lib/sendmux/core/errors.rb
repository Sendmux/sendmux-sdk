# frozen_string_literal: true

require 'json'

module Sendmux
  module Core
    class ApiError < StandardError
      attr_reader :status, :code, :request_id, :param, :retryable, :errors, :response_body, :response_headers

      def initialize(status:, code:, message:, retryable:, request_id: nil, param: nil, errors: nil,
                     response_body: nil, response_headers: {})
        super(message)
        @status = status
        @code = code
        @request_id = request_id
        @param = param
        @retryable = retryable
        @errors = errors
        @response_body = response_body
        @response_headers = response_headers
      end
    end

    class ErrorMapper
      def self.map(error)
        return error if error.is_a?(ApiError)

        headers = normalise_headers(error.respond_to?(:response_headers) ? error.response_headers : {})
        body = error.respond_to?(:response_body) ? error.response_body : nil
        payload = payload_from(body)
        detail = hash_at(payload, 'error') || {}
        status = status_from(error)

        ApiError.new(
          status: status,
          code: string_at(detail, 'code') || 'api_error',
          message: string_at(detail, 'message') || error.message || 'Sendmux API request failed',
          retryable: retryable(detail, status),
          request_id: request_id(payload, headers),
          param: string_at(detail, 'param'),
          errors: detail['errors'],
          response_body: body,
          response_headers: headers
        )
      end

      def self.status_from(error)
        return error.code if error.respond_to?(:code) && error.code.is_a?(Integer) && error.code.positive?

        nil
      end

      def self.payload_from(body)
        return nil unless body.is_a?(String) && !body.empty?

        JSON.parse(body)
      rescue JSON::ParserError
        nil
      end

      def self.request_id(payload, headers)
        string_at(hash_at(payload, 'meta'), 'request_id') || header(headers, 'x-request-id')
      end

      def self.normalise_headers(headers)
        return {} unless headers.respond_to?(:each)

        headers.each_with_object({}) do |(key, value), result|
          result[key.to_s] = value.is_a?(Array) ? value.join(', ') : value.to_s
        end
      end

      def self.hash_at(value, key)
        child = value[key] if value.is_a?(Hash)
        child.is_a?(Hash) ? child : nil
      end

      def self.string_at(value, key)
        child = value[key] if value.is_a?(Hash)
        child.is_a?(String) && !child.empty? ? child : nil
      end

      def self.bool_at(value, key)
        child = value[key] if value.is_a?(Hash)
        [true, false].include?(child) ? child : nil
      end

      def self.retryable(detail, status)
        explicit = bool_at(detail, 'retryable')
        explicit.nil? ? default_retryable?(status) : explicit
      end

      def self.header(headers, name)
        pair = headers.find { |key, _value| key.downcase == name }
        pair&.last
      end

      def self.default_retryable?(status)
        status == 429 || (status.is_a?(Integer) && status >= 500)
      end
    end
  end
end
