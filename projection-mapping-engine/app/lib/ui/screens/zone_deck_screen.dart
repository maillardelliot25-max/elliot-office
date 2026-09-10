import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';

import '../../core/control/control_client.dart';
import '../../core/display/display_service.dart';
import '../../core/models/canvas_photo.dart';
import '../../core/models/zone.dart';
import '../widgets/zone_card.dart';
import 'highlight_target_screen.dart';
import 'nudge_corners_screen.dart';
import 'venue_screen.dart';

/// Top-level operator screen: a scrollable stack of Zone Deck cards plus the
/// "Load Wall Photo", "Scan Room", "Nudge Corners", "Send to Projector",
/// and "Save/Load Venue" actions from §1.2 / §3A / §3B / §3C / §3J.
///
/// This screen only orchestrates UI state; calibration, segmentation, and
/// rendering are owned by `cv_engine` and `render_engine` respectively and
/// are reached here only through [DisplayService] and [ControlClient].
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
  CanvasPhoto? _canvasPhoto;

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
    // Blocked on real camera/projector hardware — see ARCHITECTURE.md §6.
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Scan Room needs a connected camera — not available yet.')),
    );
  }

  Future<bool> _ensureConnected() async {
    if (ControlClient.instance.isConnected) return true;
    try {
      await ControlClient.instance.connect();
      return true;
    } catch (error) {
      if (!mounted) return false;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not reach cv_engine: $error')),
      );
      return false;
    }
  }

  Future<void> _openNudgeCorners() async {
    if (!await _ensureConnected()) return;
    if (!mounted) return;
    Navigator.of(context).push(
      MaterialPageRoute(builder: (_) => const NudgeCornersScreen()),
    );
  }

  Future<void> _loadWallPhoto() async {
    final result = await FilePicker.platform.pickFiles(
      type: FileType.custom,
      allowedExtensions: ['png', 'jpg', 'jpeg', 'heic', 'heif'],
    );
    final path = result?.files.single.path;
    if (path == null) return; // operator cancelled the picker

    if (!await _ensureConnected()) return;

    try {
      final response = await ControlClient.instance.send({
        'command': 'load_wall_photo',
        'path': path,
      });
      if (!mounted) return;
      setState(() {
        _canvasPhoto = CanvasPhoto(
          path: path,
          width: response['width'] as int,
          height: response['height'] as int,
        );
      });
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Wall photo loaded.')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Could not load wall photo: $error')),
      );
    }
  }

  Future<void> _openHighlightTarget(Zone zone) async {
    final canvasPhoto = _canvasPhoto;
    if (canvasPhoto == null) return; // ZoneCard disables the button in this case
    if (!await _ensureConnected()) return;
    if (!mounted) return;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => HighlightTargetScreen(zone: zone, canvasPhoto: canvasPhoto),
      ),
    );
  }

  Future<void> _handleZoneModeChanged(Zone zone, ZoneMode mode) async {
    setState(() => zone.setMode(mode));

    // Best-effort: the operator's local Focus/Cutout/Mute selection has
    // already taken effect in the UI regardless of whether cv_engine is
    // reachable right now, so a failure here is reported but not blocking.
    if (!ControlClient.instance.isConnected) return;
    try {
      await ControlClient.instance.send({
        'command': 'set_zone_mode',
        'zoneId': zone.id,
        'mode': mode.name,
      });
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('${zone.name} mode change did not reach cv_engine: $error')),
      );
    }
  }

  void _applyLoadedVenue(Map<String, dynamic> venueJson) {
    final zonesJson = venueJson['zones'] as List<dynamic>;
    setState(() {
      _zones
        ..clear()
        ..addAll(zonesJson.map((raw) {
          final zoneJson = raw as Map<String, dynamic>;
          return Zone(
            id: zoneJson['zone_id'] as String,
            name: zoneJson['name'] as String,
            mode: ZoneMode.values.byName(zoneJson['mode'] as String),
            assignedMediaPath: zoneJson['assigned_media_path'] as String?,
            visualStyleId: zoneJson['visual_style_id'] as String?,
          );
        }));
    });
  }

  Future<void> _openVenueScreen() async {
    if (!await _ensureConnected()) return;
    if (!mounted) return;
    Navigator.of(context).push(
      MaterialPageRoute(
        builder: (_) => VenueScreen(zones: _zones, onVenueLoaded: _applyLoadedVenue),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Zone Decks'),
        actions: [
          IconButton(
            tooltip: 'Load Wall Photo',
            icon: const Icon(Icons.add_photo_alternate_outlined),
            onPressed: _loadWallPhoto,
          ),
          IconButton(
            tooltip: 'Scan Room',
            icon: const Icon(Icons.center_focus_strong),
            onPressed: _scanRoom,
          ),
          IconButton(
            tooltip: 'Nudge Corners',
            icon: const Icon(Icons.crop_free),
            onPressed: _openNudgeCorners,
          ),
          IconButton(
            tooltip: 'Save / Load Venue',
            icon: const Icon(Icons.folder_special_outlined),
            onPressed: _openVenueScreen,
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
            onModeChanged: (mode) => _handleZoneModeChanged(zone, mode),
            onHighlightTarget: _canvasPhoto == null ? null : () => _openHighlightTarget(zone),
          );
        },
      ),
    );
  }
}
