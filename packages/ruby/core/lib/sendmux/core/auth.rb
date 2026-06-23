# frozen_string_literal: true

require 'uri'

module Sendmux
  module Core
    class Auth
      ROOT_PREFIX = 'smx_root_'
      MAILBOX_PREFIX = 'smx_mbx_'
      AGENT_PREFIX = 'smx_agent_'

      def self.configure_bearer(configuration, api_key, expected_surface, base_url: nil)
        assert_api_key_surface(api_key, expected_surface)
        unless configuration.respond_to?(:access_token=)
          raise ArgumentError, 'Generated configuration does not support bearer access tokens'
        end

        configuration.access_token = api_key
        configure_base_url(configuration, base_url) if base_url && !base_url.empty?
        configuration
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
        return true if expected_surface == ApiKeySurface::SENDING && api_key.start_with?(MAILBOX_PREFIX)
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
        configuration.base_path = uri.path
        configuration.ignore_operation_servers = true if configuration.respond_to?(:ignore_operation_servers=)
      end
    end
  end
end
