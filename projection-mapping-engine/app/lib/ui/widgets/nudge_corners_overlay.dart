import 'package:flutter/material.dart';

/// Touch-first "Nudge Corners" overlay (§3F): a 4- or 9-point grid of
/// draggable handles on top of a preview image, for millimeter-precise
/// manual keystone adjustment if a physical projector shifts after Scan
/// Room has already run.
///
/// This widget is fully controlled by its parent: [points] is the current
/// normalized ([0,1]) handle layout, and every drag calls [onChanged] with
/// an updated list rather than mutating any internal state — the parent
/// screen owns "dirty"/save tracking and talks to `cv_engine` over
/// [ControlClient] once the operator applies the change.
class NudgeCornersOverlay extends StatelessWidget {
  const NudgeCornersOverlay({
    super.key,
    required this.pointCount,
    required this.points,
    required this.onChanged,
    this.backgroundImage,
    this.handleRadius = 16,
  });

  final int pointCount;
  final List<Offset> points; // normalized [0,1], length == pointCount
  final ValueChanged<List<Offset>> onChanged;
  final ImageProvider? backgroundImage;
  final double handleRadius;

  @override
  Widget build(BuildContext context) {
    assert(points.length == pointCount);

    return LayoutBuilder(
      builder: (context, constraints) {
        final size = Size(constraints.maxWidth, constraints.maxHeight);
        return ClipRRect(
          borderRadius: BorderRadius.circular(12),
          child: Stack(
            children: [
              Positioned.fill(
                child: backgroundImage != null
                    ? Image(image: backgroundImage!, fit: BoxFit.cover)
                    : Container(color: Colors.grey.shade900),
              ),
              Positioned.fill(
                child: CustomPaint(
                  painter: _NudgeGridPainter(points: points, pointCount: pointCount),
                ),
              ),
              for (int i = 0; i < points.length; i++) _buildHandle(context, i, size),
            ],
          ),
        );
      },
    );
  }

  Widget _buildHandle(BuildContext context, int index, Size size) {
    final normalized = points[index];
    final pixel = Offset(normalized.dx * size.width, normalized.dy * size.height);

    return Positioned(
      left: pixel.dx - handleRadius,
      top: pixel.dy - handleRadius,
      child: GestureDetector(
        behavior: HitTestBehavior.opaque,
        onPanUpdate: (details) {
          final movedPixel = pixel + details.delta;
          final clamped = Offset(
            (movedPixel.dx / size.width).clamp(0.0, 1.0),
            (movedPixel.dy / size.height).clamp(0.0, 1.0),
          );
          final updated = List<Offset>.of(points);
          updated[index] = clamped;
          onChanged(updated);
        },
        child: Container(
          width: handleRadius * 2,
          height: handleRadius * 2,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: Theme.of(context).colorScheme.primary,
            border: Border.all(color: Colors.white, width: 2),
            boxShadow: const [BoxShadow(color: Colors.black45, blurRadius: 4)],
          ),
        ),
      ),
    );
  }
}

class _NudgeGridPainter extends CustomPainter {
  _NudgeGridPainter({required this.points, required this.pointCount});

  final List<Offset> points;
  final int pointCount;

  static const _fourPointLoop = [0, 1, 3, 2]; // top-left, top-right, bottom-right, bottom-left
  static const _ninePointRows = [[0, 1, 2], [3, 4, 5], [6, 7, 8]];
  static const _ninePointCols = [[0, 3, 6], [1, 4, 7], [2, 5, 8]];

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = Colors.white.withOpacity(0.85)
      ..strokeWidth = 2
      ..style = PaintingStyle.stroke;

    Offset toPixel(int index) =>
        Offset(points[index].dx * size.width, points[index].dy * size.height);

    void drawPolyline(List<int> indices, {bool close = false}) {
      final path = Path()..moveTo(toPixel(indices.first).dx, toPixel(indices.first).dy);
      for (final index in indices.skip(1)) {
        final p = toPixel(index);
        path.lineTo(p.dx, p.dy);
      }
      if (close) path.close();
      canvas.drawPath(path, paint);
    }

    if (pointCount == 4) {
      drawPolyline(_fourPointLoop, close: true);
    } else if (pointCount == 9) {
      for (final row in _ninePointRows) {
        drawPolyline(row);
      }
      for (final col in _ninePointCols) {
        drawPolyline(col);
      }
    }
  }

  @override
  bool shouldRepaint(covariant _NudgeGridPainter oldDelegate) {
    return oldDelegate.pointCount != pointCount || !identical(oldDelegate.points, points);
  }
}
