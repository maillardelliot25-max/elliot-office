#include "display_daemon.h"

#include <algorithm>

namespace projection_mapper {

namespace {

// Converts a wide device name like "\\.\DISPLAY1" into a stable, ASCII id
// safe to hand to Dart ("DISPLAY1").
std::string DeviceNameToId(const wchar_t* device_name) {
  std::wstring wname(device_name);
  size_t last_backslash = wname.find_last_of(L'\\');
  std::wstring tail =
      (last_backslash == std::wstring::npos) ? wname : wname.substr(last_backslash + 1);
  return std::string(tail.begin(), tail.end());
}

std::string WideToUtf8(const wchar_t* wide) {
  std::wstring w(wide);
  return std::string(w.begin(), w.end());
}

BOOL CALLBACK MonitorEnumProc(HMONITOR hmonitor, HDC /*hdc*/, LPRECT /*rect*/,
                               LPARAM lparam) {
  auto* out = reinterpret_cast<std::vector<DisplayInfo>*>(lparam);

  MONITORINFOEXW info;
  info.cbSize = sizeof(MONITORINFOEXW);
  if (!GetMonitorInfoW(hmonitor, &info)) {
    return TRUE;  // keep enumerating
  }

  DisplayInfo display;
  display.device_name = WideToUtf8(info.szDevice);
  display.id = DeviceNameToId(info.szDevice);
  display.x = info.rcMonitor.left;
  display.y = info.rcMonitor.top;
  display.width = info.rcMonitor.right - info.rcMonitor.left;
  display.height = info.rcMonitor.bottom - info.rcMonitor.top;
  display.is_primary = (info.dwFlags & MONITORINFOF_PRIMARY) != 0;

  out->push_back(std::move(display));
  return TRUE;
}

}  // namespace

DisplayDaemon::~DisplayDaemon() { CloseProjectorWindow(); }

std::vector<DisplayInfo> DisplayDaemon::ListDisplays() const {
  std::vector<DisplayInfo> displays;
  EnumDisplayMonitors(nullptr, nullptr, MonitorEnumProc,
                       reinterpret_cast<LPARAM>(&displays));

  // Primary display first, secondaries (the projector candidates) after, in
  // left-to-right order — this is the order the "Send to Projector" picker
  // in the UI shows them in.
  std::stable_sort(displays.begin(), displays.end(),
                    [](const DisplayInfo& a, const DisplayInfo& b) {
                      if (a.is_primary != b.is_primary) return a.is_primary;
                      return a.x < b.x;
                    });
  return displays;
}

LRESULT CALLBACK DisplayDaemon::OutputWindowProc(HWND hwnd, UINT msg,
                                                  WPARAM wparam,
                                                  LPARAM lparam) {
  switch (msg) {
    case WM_CLOSE:
      // The output window is owned by the daemon; ignore user-initiated
      // close (there's no title bar to click, but Alt+F4 still reaches it)
      // and let CloseProjectorWindow() be the only path that destroys it.
      return 0;
    case WM_ERASEBKGND:
      // The render engine owns painting via its own swap chain; avoid the
      // default white flash before the first frame is presented.
      return 1;
    default:
      return DefWindowProcW(hwnd, msg, wparam, lparam);
  }
}

int64_t DisplayDaemon::SendToProjector(const std::string& display_id) {
  auto displays = ListDisplays();
  auto it = std::find_if(displays.begin(), displays.end(),
                          [&](const DisplayInfo& d) { return d.id == display_id; });
  if (it == displays.end()) {
    return 0;
  }
  const DisplayInfo& target = *it;

  HINSTANCE hinstance = GetModuleHandleW(nullptr);

  if (output_hwnd_ == nullptr) {
    WNDCLASSEXW wc = {};
    wc.cbSize = sizeof(WNDCLASSEXW);
    wc.lpfnWndProc = &DisplayDaemon::OutputWindowProc;
    wc.hInstance = hinstance;
    wc.lpszClassName = kWindowClassName;
    wc.hbrBackground = reinterpret_cast<HBRUSH>(GetStockObject(BLACK_BRUSH));
    // RegisterClassExW is idempotent-safe to call repeatedly in practice
    // (fails harmlessly with ERROR_CLASS_ALREADY_EXISTS on a second call);
    // no need to guard it with a static-init flag here.
    RegisterClassExW(&wc);

    // WS_POPUP: no title bar, no border, no system menu — a true borderless
    // frameless window. WS_EX_TOPMOST keeps it pinned above the desktop so
    // an operator's stray click on the primary display can't bury it.
    output_hwnd_ = CreateWindowExW(
        WS_EX_TOPMOST | WS_EX_NOACTIVATE, kWindowClassName, L"Projector Output",
        WS_POPUP, target.x, target.y, target.width, target.height, nullptr,
        nullptr, hinstance, nullptr);
  } else {
    // Already have an output window — just move/resize it onto the newly
    // selected display instead of recreating it, so the render engine's
    // swap chain doesn't have to be torn down.
    SetWindowPos(output_hwnd_, HWND_TOPMOST, target.x, target.y, target.width,
                 target.height, SWP_NOACTIVATE);
  }

  if (output_hwnd_ == nullptr) {
    return 0;
  }

  ShowWindow(output_hwnd_, SW_SHOWNOACTIVATE);
  // Deliberately not calling SetForegroundWindow/BringWindowToTop: the
  // operator's controls stay focused on the primary display's UI window.
  return reinterpret_cast<int64_t>(output_hwnd_);
}

void DisplayDaemon::CloseProjectorWindow() {
  if (output_hwnd_ != nullptr) {
    DestroyWindow(output_hwnd_);
    output_hwnd_ = nullptr;
  }
}

}  // namespace projection_mapper
