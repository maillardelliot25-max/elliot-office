import 'package:flutter/services.dart';

/// One connected display, as reported by the native side.
///
/// Mirrors `DisplayInfo` (Windows `display_daemon.h`) and the Kotlin
/// `displayToMap` output (Android `DisplayDaemonPlugin`) — both platforms
/// serialize to the same shape so this class never branches on platform.
class DisplayInfo {
  final String id;
  final String deviceName;
  final int x;
  final int y;
  final int width;
  final int height;
  final bool isPrimary;

  const DisplayInfo({
    required this.id,
    required this.deviceName,
    required this.x,
    required this.y,
    required this.width,
    required this.height,
    required this.isPrimary,
  });

  factory DisplayInfo.fromMap(Map<dynamic, dynamic> map) {
    return DisplayInfo(
      id: map['id'] as String,
      deviceName: map['deviceName'] as String,
      x: map['x'] as int,
      y: map['y'] as int,
      width: map['width'] as int,
      height: map['height'] as int,
      isPrimary: map['isPrimary'] as bool,
    );
  }
}

/// Dart-side bridge to the native "display daemon" (Module 1).
///
/// Talks to `display_daemon_plugin.cpp` on Windows and
/// `DisplayDaemonPlugin.kt` on Android over a single shared method-channel
/// name, so UI code (Module 4) never needs a `Platform.isWindows` branch —
/// this is the "Send to Projector" button's entire backing implementation.
class DisplayService {
  DisplayService._();

  static final DisplayService instance = DisplayService._();

  static const MethodChannel _channel =
      MethodChannel('com.elliotoffice.projection_mapper/display');

  /// Lists connected displays; the secondary ones are "Send to Projector"
  /// candidates, the primary is where the operator's own UI stays.
  Future<List<DisplayInfo>> listDisplays() async {
    final result = await _channel.invokeMethod<List<dynamic>>('listDisplays');
    final displays = result ?? const [];
    return displays
        .map((raw) => DisplayInfo.fromMap(raw as Map<dynamic, dynamic>))
        .toList(growable: false);
  }

  /// "Send to Projector": opens (or moves) the borderless output surface
  /// onto [display]. Returns the native window/surface handle the render
  /// engine attaches to.
  Future<int> sendToProjector(DisplayInfo display) async {
    final handle = await _channel.invokeMethod<int>(
      'sendToProjector',
      <String, dynamic>{'displayId': display.id},
    );
    if (handle == null || handle == 0) {
      throw StateError('Could not open projector output on ${display.id}');
    }
    return handle;
  }

  Future<void> closeProjector() async {
    await _channel.invokeMethod<void>('closeProjector');
  }

  Future<bool> hasActiveProjectorWindow() async {
    final active =
        await _channel.invokeMethod<bool>('hasActiveProjectorWindow');
    return active ?? false;
  }
}
