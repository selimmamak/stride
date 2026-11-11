Pod::Spec.new do |s|
  s.name = 'StrideHealth'
  s.version = '1.0.0'
  s.summary = 'Read running workouts from Apple Health.'
  s.description = 'A local read-only HealthKit module for Stride.'
  s.license = { :type => 'MIT', :file => '../../../LICENSE' }
  s.author = 'Selim'
  s.homepage = 'https://github.com/selimmamak/stride'
  s.platforms = { :ios => '16.4' }
  s.source = { :git => 'https://github.com/selimmamak/stride.git' }
  s.static_framework = true
  s.swift_version = '5.9'

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'HealthKit'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,mm,swift}'
end
