import 'dart:io';

import 'package:flutter/material.dart';

import '../../core/control/control_client.dart';
import '../../core/models/canvas_photo.dart';
import '../../core/models/zone.dart';

/// "Highlight Target" screen (§3D): the operator taps the object in the
/// loaded wall photo that a zone should track — a picture frame, a TV, a
/// pillar — and `cv_engine`'s `ClassicalSegmentationEngine` segments it
/// from that single tap point.
///
/// The photo is shown at a fixed aspect ratio (`BoxFit.fill` inside an
/// `AspectRatio` sized to the photo's own dimensions) specifically so the
/// on-screen tap position maps to image pixel coordinates with a plain
/// linear scale — no letterboxing offset to account for.
class HighlightTargetScreen extends StatefulWidget {
  const HighlightTargetScreen({super.key, required this.zone, required this.canvasPhoto});

  final Zone zone;
  final CanvasPhoto canvasPhoto;

  @override
  State<HighlightTargetScreen> createState() => _HighlightTargetScreenState();
}

class _HighlightTargetScreenState extends State<HighlightTargetScreen> {
  Offset? _lastTapNormalized;
  bool _submitting = false;

  Future<void> _handleTap(Offset localPosition, Size renderedSize) async {
    final normalized = Offset(
      (localPosition.dx / renderedSize.width).clamp(0.0, 1.0),
      (localPosition.dy / renderedSize.height).clamp(0.0, 1.0),
    );
    setState(() {
      _lastTapNormalized = normalized;
      _submitting = true;
    });

    final pixelX = (normalized.dx * widget.canvasPhoto.width).round().clamp(
          0,
          widget.canvasPhoto.width - 1,
        );
    final pixelY = (normalized.dy * widget.canvasPhoto.height).round().clamp(
          0,
          widget.canvasPhoto.height - 1,
        );

    try {
      await ControlClient.instance.send({
        'command': 'highlight_target',
        'zoneId': widget.zone.id,
        'point': [pixelX, pixelY],
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${widget.zone.name} target highlighted.')),
      );
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not highlight target: $error')),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Highlight Target — ${widget.zone.name}'),
        actions: [
          if (_submitting)
            const Padding(
              padding: EdgeInsets.symmetric(horizontal: 16),
              child: Center(
                child: SizedBox(
                  width: 20,
                  height: 20,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
            ),
        ],
      ),
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: AspectRatio(
            aspectRatio: widget.canvasPhoto.aspectRatio,
            child: LayoutBuilder(
              builder: (context, constraints) {
                final size = Size(constraints.maxWidth, constraints.maxHeight);
                return ClipRRect(
                  borderRadius: BorderRadius.circular(12),
                  child: Stack(
                    children: [
                      Positioned.fill(
                        child: Image.file(File(widget.canvasPhoto.path), fit: BoxFit.fill),
                      ),
                      Positioned.fill(
                        child: GestureDetector(
                          behavior: HitTestBehavior.opaque,
                          onTapUp: (details) => _handleTap(details.localPosition, size),
                        ),
                      ),
                      if (_lastTapNormalized != null) _buildMarker(size),
                    ],
                  ),
                );
              },
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildMarker(Size size) {
    final normalized = _lastTapNormalized!;
    const markerRadius = 12.0;
    return Positioned(
      left: normalized.dx * size.width - markerRadius,
      top: normalized.dy * size.height - markerRadius,
      child: IgnorePointer(
        child: Container(
          width: markerRadius * 2,
          height: markerRadius * 2,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            border: Border.all(color: Colors.deepPurpleAccent, width: 3),
            boxShadow: const [BoxShadow(color: Colors.black54, blurRadius: 4)],
          ),
        ),
      ),
    );
  }
}
