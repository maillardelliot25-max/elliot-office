import 'package:flutter/material.dart';

import '../../core/control/control_client.dart';
import '../../core/models/nudge_points.dart';
import '../widgets/nudge_corners_overlay.dart';

/// "Nudge Corners" screen (§3F): the manual keystone override an operator
/// reaches for when a physical projector shifts mid-event and there's no
/// time to re-run Scan Room. Drag handles, hit Apply, done.
class NudgeCornersScreen extends StatefulWidget {
  const NudgeCornersScreen({super.key, this.backgroundImage});

  /// Optional preview (a recent camera frame or the uploaded wall photo) so
  /// the operator can see what they're aligning against, not just drag
  /// blind on a black canvas.
  final ImageProvider? backgroundImage;

  @override
  State<NudgeCornersScreen> createState() => _NudgeCornersScreenState();
}

class _NudgeCornersScreenState extends State<NudgeCornersScreen> {
  int _pointCount = 4;
  late List<Offset> _points = NudgeCornerLayout.canonicalPositions(_pointCount);
  bool _dirty = false;
  bool _applying = false;

  void _setPointCount(int count) {
    if (count == _pointCount) return;
    setState(() {
      _pointCount = count;
      _points = NudgeCornerLayout.canonicalPositions(count);
      _dirty = false;
    });
  }

  void _reset() {
    setState(() {
      _points = NudgeCornerLayout.canonicalPositions(_pointCount);
      _dirty = false;
    });
  }

  Future<void> _apply() async {
    setState(() => _applying = true);
    try {
      await ControlClient.instance.send({
        'command': 'nudge_corners',
        'pointCount': _pointCount,
        'points': _points.map((p) => [p.dx, p.dy]).toList(),
      });
      if (!mounted) return;
      setState(() => _dirty = false);
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Corners updated.')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not apply nudge: $error')),
      );
    } finally {
      if (mounted) setState(() => _applying = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Nudge Corners'),
        actions: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Center(
              child: SegmentedButton<int>(
                segments: const [
                  ButtonSegment(value: 4, label: Text('4 pts')),
                  ButtonSegment(value: 9, label: Text('9 pts')),
                ],
                selected: {_pointCount},
                onSelectionChanged: (selection) => _setPointCount(selection.first),
              ),
            ),
          ),
          IconButton(
            tooltip: 'Reset',
            icon: const Icon(Icons.restart_alt),
            onPressed: _dirty ? _reset : null,
          ),
          IconButton(
            tooltip: 'Apply',
            icon: _applying
                ? const SizedBox(
                    width: 20,
                    height: 20,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Icon(Icons.check),
            onPressed: (_dirty && !_applying) ? _apply : null,
          ),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: NudgeCornersOverlay(
          pointCount: _pointCount,
          points: _points,
          backgroundImage: widget.backgroundImage,
          onChanged: (updated) => setState(() {
            _points = updated;
            _dirty = true;
          }),
        ),
      ),
    );
  }
}
