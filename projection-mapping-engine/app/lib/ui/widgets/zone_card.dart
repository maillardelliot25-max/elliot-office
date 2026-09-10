import 'package:flutter/material.dart';

import '../../core/models/zone.dart';

/// One animated card in the Card Stack UI (§1.2) — the operator's entire
/// interface to a zone is three buttons (Focus, Cutout, Mute) plus a small
/// Highlight Target action on the thumbnail. No timeline, no layer list,
/// no jargon.
class ZoneCard extends StatelessWidget {
  const ZoneCard({
    super.key,
    required this.zone,
    required this.onModeChanged,
    this.onHighlightTarget,
  });

  final Zone zone;
  final ValueChanged<ZoneMode> onModeChanged;

  /// Opens the "Highlight Target" tap-to-select flow for this zone. Null
  /// when no wall photo is loaded yet — there's nothing to tap on.
  final VoidCallback? onHighlightTarget;

  @override
  Widget build(BuildContext context) {
    return AnimatedContainer(
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOut,
      margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(16),
        color: zone.mode == ZoneMode.mute
            ? Colors.black
            : Theme.of(context).colorScheme.surfaceContainerHigh,
        border: Border.all(
          color: zone.mode == ZoneMode.focus
              ? Theme.of(context).colorScheme.primary
              : Colors.transparent,
          width: 2,
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.all(12),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            AspectRatio(
              aspectRatio: 16 / 9,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(12),
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: zone.thumbnailPath != null
                          ? Image.asset(zone.thumbnailPath!, fit: BoxFit.cover)
                          : Container(color: Colors.grey.shade800),
                    ),
                    Positioned(
                      top: 6,
                      right: 6,
                      child: _HighlightButton(onTap: onHighlightTarget),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Text(
              zone.name,
              style: Theme.of(context).textTheme.titleMedium,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                Expanded(
                  child: _ModeButton(
                    label: 'Focus',
                    selected: zone.mode == ZoneMode.focus,
                    onTap: () => onModeChanged(ZoneMode.focus),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: _ModeButton(
                    label: 'Cutout',
                    selected: zone.mode == ZoneMode.cutout,
                    onTap: () => onModeChanged(ZoneMode.cutout),
                  ),
                ),
                const SizedBox(width: 6),
                Expanded(
                  child: _ModeButton(
                    label: 'Mute',
                    selected: zone.mode == ZoneMode.mute,
                    onTap: () => onModeChanged(ZoneMode.mute),
                    isDanger: true,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _HighlightButton extends StatelessWidget {
  const _HighlightButton({required this.onTap});

  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.black54,
      shape: const CircleBorder(),
      child: IconButton(
        tooltip: onTap == null ? 'Load Wall Photo first' : 'Highlight Target',
        icon: const Icon(Icons.touch_app, size: 20),
        color: Colors.white,
        onPressed: onTap,
      ),
    );
  }
}

class _ModeButton extends StatelessWidget {
  const _ModeButton({
    required this.label,
    required this.selected,
    required this.onTap,
    this.isDanger = false,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;
  final bool isDanger;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final Color background = selected
        ? (isDanger ? scheme.error : scheme.primary)
        : scheme.surfaceContainerHighest;
    final Color foreground = selected
        ? (isDanger ? scheme.onError : scheme.onPrimary)
        : scheme.onSurfaceVariant;

    return FilledButton(
      onPressed: onTap,
      style: FilledButton.styleFrom(
        backgroundColor: background,
        foregroundColor: foreground,
        padding: const EdgeInsets.symmetric(vertical: 10),
      ),
      child: Text(label, style: const TextStyle(fontWeight: FontWeight.w600)),
    );
  }
}
