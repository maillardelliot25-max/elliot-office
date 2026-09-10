#pragma once
// Module 1 — Display & Rendering Daemon (Windows)
//
// Detects connected displays via EnumDisplayMonitors and, on "Send to
// Projector", spawns a borderless, frameless, always-on-top output window
// pinned to a secondary monitor at its native resolution. This window is the
// render surface the GLSL compositor (Module 3) draws into.
//
// Exposed to Dart as a Flutter Windows platform plugin over the method
// channel "com.elliotoffice.projection_mapper/display".

#include <windows.h>

#include <cstdint>
#include <string>
#include <vector>

namespace projection_mapper {

struct DisplayInfo {
  // Stable id derived from the monitor's device name (\\.\DISPLAY1, ...),
  // safe to send across the platform channel and round-trip back into
  // SendToProjector.
  std::string id;
  std::string device_name;
  int32_t x = 0;
  int32_t y = 0;
  int32_t width = 0;
  int32_t height = 0;
  bool is_primary = false;
};

class DisplayDaemon {
 public:
  DisplayDaemon() = default;
  ~DisplayDaemon();

  DisplayDaemon(const DisplayDaemon&) = delete;
  DisplayDaemon& operator=(const DisplayDaemon&) = delete;

  // Enumerates all currently connected displays (EnumDisplayMonitors).
  std::vector<DisplayInfo> ListDisplays() const;

  // Creates (or moves) a borderless, frameless, topmost output window on the
  // display identified by `display_id` at that display's native resolution.
  // Returns the native HWND as an integer handle for the render engine to
  // attach its swap chain to, or 0 on failure.
  int64_t SendToProjector(const std::string& display_id);

  // Hides and destroys the output window, releasing the secondary display.
  void CloseProjectorWindow();

  bool HasActiveProjectorWindow() const { return output_hwnd_ != nullptr; }

 private:
  static LRESULT CALLBACK OutputWindowProc(HWND hwnd, UINT msg, WPARAM wparam,
                                            LPARAM lparam);

  HWND output_hwnd_ = nullptr;
  static constexpr wchar_t kWindowClassName[] = L"ProjectionMapperOutputWindow";
};

}  // namespace projection_mapper
