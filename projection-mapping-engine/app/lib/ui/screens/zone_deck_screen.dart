import 'package:flutter/material.dart';

import '../../core/display/display_service.dart';
import '../../core/models/zone.dart';
import '../widgets/zone_card.dart';

/// Top-level operator screen: a scrollable stack of Zone Deck cards plus the
/// "Send to Projector" and "Scan Room" actions from §1.2 / §3A / §3C.
///
/// This screen only orchestrates UI state; calibration, segmentation, and
/// rendering are owned by `cv_engine` and `render_engine` respectively and
/// are reached here only through [DisplayService] / the (TODO) control
/// WebSocket client.
class ZoneDeckScreen extends StatefulWidget {
  const ZoneDeckScreen({super.key});

  @override
  State<ZoneDeckScreen> createState() => _ZoneDeckScreenState();
}

class _ZoneDeckScreenState extends State<ZoneDeckScreen> {
  final List<Zone> _zones = [
    Zone(id: 'wall', name: 'Wall Deck'),
    Zone(id: 'frame', name: 'Picture Frame Deck'),
    Zone(id: 'pillar', name: 'Pillar Deck'),
  ];

  bool _projectorConnected = false;

  Future<void> _sendToProjector() async {
    final displays = await DisplayService.instance.listDisplays();
    final secondary = displays.where((d) => !d.isPrimary).toList();

    if (secondary.isEmpty) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('No projector detected. Plug one in and try again.')),
      );
      return;
    }

    // First secondary display is the default target; a full display picker
    // is a Module 4 follow-up once more than one projector is common.
    await DisplayService.instance.sendToProjector(secondary.first);
    setState(() => _projectorConnected = true);
  }

  void _scanRoom() {
    // TODO(Module 2/3): trigger cv_engine's structured-light calibration
    // routine over the control WebSocket and stream progress back here.
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Scan Room is not wired up yet — coming with Module 2.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Zone Decks'),
        actions: [
          IconButton(
            tooltip: 'Scan Room',
            icon: const Icon(Icons.center_focus_strong),
            onPressed: _scanRoom,
          ),
          IconButton(
            tooltip: 'Send to Projector',
            icon: Icon(
              _projectorConnected ? Icons.cast_connected : Icons.cast,
            ),
            onPressed: _sendToProjector,
          ),
        ],
      ),
      body: ListView.builder(
        padding: const EdgeInsets.symmetric(vertical: 12),
        itemCount: _zones.length,
        itemBuilder: (context, index) {
          final zone = _zones[index];
          return ZoneCard(
            zone: zone,
            onModeChanged: (mode) => setState(() => zone.setMode(mode)),
          );
        },
      ),
    );
  }
}
