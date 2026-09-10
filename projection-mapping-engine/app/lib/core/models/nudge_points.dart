import 'package:flutter/material.dart';

/// Canonical (untouched) handle positions for the "Nudge Corners" overlay
/// (§3F), normalized to [0,1] screen coordinates.
///
/// The order here is load-bearing: it must exactly match
/// `NUDGE_CANONICAL_POSITIONS` in
/// `cv_engine/calibration/structured_light.py`, since the overlay sends
/// its dragged points back as a plain ordered list — not a keyed
/// structure — for `apply_manual_nudge` to merge into the calibration
/// mesh. If you reorder one side, reorder the other.
class NudgeCornerLayout {
  NudgeCornerLayout._();

  static const List<Offset> fourPoint = [
    Offset(0, 0), // top-left
    Offset(1, 0), // top-right
    Offset(0, 1), // bottom-left
    Offset(1, 1), // bottom-right
  ];

  static const List<Offset> ninePoint = [
    Offset(0, 0), Offset(0.5, 0), Offset(1, 0),
    Offset(0, 0.5), Offset(0.5, 0.5), Offset(1, 0.5),
    Offset(0, 1), Offset(0.5, 1), Offset(1, 1),
  ];

  static List<Offset> canonicalPositions(int pointCount) {
    switch (pointCount) {
      case 4:
        return fourPoint;
      case 9:
        return ninePoint;
      default:
        throw ArgumentError('pointCount must be 4 or 9, got $pointCount');
    }
  }
}
