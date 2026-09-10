import 'package:flutter/foundation.dart';

/// How a [Zone]'s mask is applied to its assigned Visual Style, per §3D.4:
///
///   focus  -> outputColor = visualColor * M
///   cutout -> outputColor = visualColor * (1.0 - M)
///   mute   -> outputColor = 0
enum ZoneMode { focus, cutout, mute }

/// One card in a Zone Deck (e.g. "Wall Deck", "Picture Frame Deck").
///
/// This is the UI-facing model Module 4 renders as an animated thumbnail
/// card; it carries only ids/references, not pixel data — the actual mask
/// matrix lives in `cv_engine` and the shader lives in `render_engine`.
class Zone extends ChangeNotifier {
  Zone({
    required this.id,
    required this.name,
    this.mode = ZoneMode.focus,
    this.thumbnailPath,
    this.assignedMediaPath,
    this.visualStyleId,
  });

  final String id;
  String name;

  ZoneMode mode;

  /// Snapshot/segmentation preview shown on the card face.
  String? thumbnailPath;

  /// Media asset (video/image) bound to this zone (§3E.1).
  String? assignedMediaPath;

  /// Selected GLSL "Visual Style" when no custom media is assigned.
  String? visualStyleId;

  void setMode(ZoneMode next) {
    if (mode == next) return;
    mode = next;
    notifyListeners();
  }

  void focus() => setMode(ZoneMode.focus);
  void cutout() => setMode(ZoneMode.cutout);
  void mute() => setMode(ZoneMode.mute);
}
