# frozen_string_literal: true

require 'uri'

module Sendmux
  module Core
    class Auth
      ROOT_PREFIX = 'smx_root_'
      MAILBOX_PREFIX = 'smx_mbx_'
      AGENT_PREFIX = 'smx_agent_'

      def self.configure_bearer(configuration, api_key, expected_surface, base_url: nil, access_token: nil)
        raise ArgumentError, 'Provide exactly one of api_key or access_token' if api_key.nil? == access_token.nil?
        unless configuration.respond_to?(:access_token=)
          raise ArgumentError, 'Generated configuration does not support bearer access tokens'
        end

        if api_key.nil?
          configure_access_token(configuration, access_token)
        else
          assert_api_key_surface(api_key, expected_surface)
          configuration.access_token = api_key
          configuration.access_token_getter = nil if configuration.respond_to?(:access_token_getter=)
        end
        configure_base_url(configuration, base_url) if base_url && !base_url.empty?
        configuration
      end

      def self.configure_access_token(configuration, access_token)
        if access_token.respond_to?(:call)
          configuration.access_token = nil
          configuration.access_token_getter = -> { validate_access_token(access_token.call) }
        else
          configuration.access_token = validate_access_token(access_token)
          configuration.access_token_getter = nil if configuration.respond_to?(:access_token_getter=)
        end
      end

      def self.validate_access_token(token)
        unless token.is_a?(String) && token.match?(%r{\A[A-Za-z0-9._~+/-]+=*\z})
          raise ArgumentError, 'Provide a valid bare access token'
        end

        token
      end

      def self.assert_api_key_surface(api_key, expected_surface)
        actual = surface_for(api_key)
        unless actual
          raise ArgumentError,
                "Sendmux API keys must start with #{ROOT_PREFIX}, #{MAILBOX_PREFIX}, or #{AGENT_PREFIX}"
        end
        return actual if compatible_surface?(api_key, actual, expected_surface)

        raise ArgumentError, "Expected a #{expected_surface} API key, received a #{actual} API key"
      end

      def self.compatible_surface?(api_key, actual, expected_surface)
        return true if actual == expected_surface
        return true if expected_surface == ApiKeySurface::SENDING &&
                       (api_key.start_with?(MAILBOX_PREFIX) || api_key.start_with?(AGENT_PREFIX))
        return true if expected_surface == ApiKeySurface::MAILBOX && actual == ApiKeySurface::MAILBOX

        false
      end

      def self.surface_for(api_key)
        return ApiKeySurface::ROOT if api_key.start_with?(ROOT_PREFIX)
        return ApiKeySurface::MAILBOX if api_key.start_with?(MAILBOX_PREFIX)
        return ApiKeySurface::MAILBOX if api_key.start_with?(AGENT_PREFIX)

        nil
      end

      def self.configure_base_url(configuration, base_url)
        uri = URI(base_url)
        raise ArgumentError, 'base_url must include a scheme and host' unless uri.scheme && uri.host

        configuration.scheme = uri.scheme
        configuration.host = uri.host
        configuration.host += ":#{uri.port}" if uri.port && uri.port != uri.default_port
        configuration.base_path = uri.path
        configuration.ignore_operation_servers = true if configuration.respond_to?(:ignore_operation_servers=)
      end
    end
  end
end
