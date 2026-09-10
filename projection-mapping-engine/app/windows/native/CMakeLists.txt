# Module 1 (Windows) — builds the display daemon as a static lib that the
# generated Flutter Windows runner links in as a plugin.
#
# This file targets being included from the standard
# `windows/flutter/generated_plugins.cmake` once `flutter create` has
# generated the Windows runner scaffolding around this plugin source set;
# it is not a standalone top-level CMakeLists.

cmake_minimum_required(VERSION 3.14)

add_library(display_daemon_plugin STATIC
  "display_daemon.cpp"
  "display_daemon.h"
  "display_daemon_plugin.cpp"
)

apply_standard_settings(display_daemon_plugin)

target_include_directories(display_daemon_plugin PUBLIC
  "${CMAKE_CURRENT_SOURCE_DIR}"
)

target_link_libraries(display_daemon_plugin PRIVATE
  flutter
  flutter_wrapper_plugin
)
