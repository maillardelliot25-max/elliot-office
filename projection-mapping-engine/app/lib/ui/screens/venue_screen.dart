import 'package:flutter/material.dart';

import '../../core/control/control_client.dart';
import '../../core/models/zone.dart';

/// "Save Venue" / "Load Venue" (spec §3J): bundles the current Zone Deck
/// state into a `venue_profile.json` `cv_engine` can restore instantly
/// without re-scanning, or restores one previously saved.
///
/// Ties directly into `cv_engine.venue.venue_profile.VenueProfile`'s field
/// names — this screen builds/parses the exact same JSON shape that class
/// (de)serializes, since `ControlClient` just forwards it verbatim over the
/// `save_venue`/`load_venue` control commands.
class VenueScreen extends StatefulWidget {
  const VenueScreen({
    super.key,
    required this.zones,
    required this.onVenueLoaded,
    this.projectorResolution = const [1920, 1080],
  });

  final List<Zone> zones;
  final ValueChanged<Map<String, dynamic>> onVenueLoaded;

  /// TODO(Module 4): source this from the display Send to Projector
  /// actually connected to, once a multi-projector picker exists, instead
  /// of a fixed 1080p default.
  final List<int> projectorResolution;

  @override
  State<VenueScreen> createState() => _VenueScreenState();
}

class _VenueScreenState extends State<VenueScreen> {
  final _nameController = TextEditingController();
  bool _busy = false;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  Map<String, dynamic> _buildVenuePayload(String venueName) {
    return {
      'venue_name': venueName,
      'calibration_mesh_path': 'calibration_matrix.json',
      'projector_resolution': widget.projectorResolution,
      'zones': widget.zones
          .map((zone) => {
                'zone_id': zone.id,
                'name': zone.name,
                'mode': zone.mode.name,
                'mask_path': '${zone.id}_mask.npy',
                'assigned_media_path': zone.assignedMediaPath,
                'visual_style_id': zone.visualStyleId,
              })
          .toList(),
    };
  }

  Future<void> _save() async {
    final venueName = _nameController.text.trim();
    if (venueName.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Name the venue first.')));
      return;
    }

    setState(() => _busy = true);
    try {
      await ControlClient.instance.send({
        'command': 'save_venue',
        'venue': _buildVenuePayload(venueName),
      });
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Saved "$venueName".')));
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Could not save venue: $error')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _load() async {
    final venueName = _nameController.text.trim();
    if (venueName.isEmpty) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Enter the venue name to load.')));
      return;
    }

    setState(() => _busy = true);
    try {
      final response = await ControlClient.instance.send({
        'command': 'load_venue',
        'venueName': venueName,
      });
      widget.onVenueLoaded(response['venue'] as Map<String, dynamic>);
      if (!mounted) return;
      Navigator.of(context).pop();
    } catch (error) {
      if (!mounted) return;
      ScaffoldMessenger.of(context)
          .showSnackBar(SnackBar(content: Text('Could not load venue: $error')));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Save / Load Venue')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            TextField(
              controller: _nameController,
              decoration: const InputDecoration(
                labelText: 'Venue name',
                border: OutlineInputBorder(),
              ),
            ),
            const SizedBox(height: 16),
            Row(
              children: [
                Expanded(
                  child: FilledButton.icon(
                    onPressed: _busy ? null : _save,
                    icon: const Icon(Icons.save_outlined),
                    label: const Text('Save Venue'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: OutlinedButton.icon(
                    onPressed: _busy ? null : _load,
                    icon: const Icon(Icons.folder_open_outlined),
                    label: const Text('Load Venue'),
                  ),
                ),
              ],
            ),
            if (_busy) ...[
              const SizedBox(height: 16),
              const LinearProgressIndicator(),
            ],
          ],
        ),
      ),
    );
  }
}
