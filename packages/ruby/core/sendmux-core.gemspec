# frozen_string_literal: true

require_relative 'lib/sendmux/core/version'

Gem::Specification.new do |spec|
  spec.name = 'sendmux-core'
  spec.version = Sendmux::Core::VERSION
  spec.authors = ['Sendmux']
  spec.email = ['contact@sendmux.ai']
  spec.summary = 'Shared core helpers for Sendmux Ruby SDK packages.'
  spec.homepage = 'https://github.com/Sendmux/sendmux-sdk'
  spec.license = 'MIT'
  spec.required_ruby_version = '>= 3.1'
  spec.metadata = {
    'homepage_uri' => spec.homepage,
    'source_code_uri' => "#{spec.homepage}/tree/main/packages/ruby/core",
    'changelog_uri' => "#{spec.homepage}/blob/main/packages/ruby/core/CHANGELOG.md"
  }
  spec.files = Dir.chdir(__dir__) { Dir['lib/**/*.rb', 'README.md', 'CHANGELOG.md'] }
  spec.require_paths = ['lib']
  spec.add_dependency 'faraday', '~> 2.0'
  spec.add_dependency 'faraday-retry', '>= 2.4', '< 3.0'
end
