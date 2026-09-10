/// The currently loaded "Load Wall Photo" canvas (spec §3B) — a local file
/// path plus the pixel dimensions `cv_engine` reported back after decoding
/// it, needed to convert an on-screen tap into the exact pixel coordinate
/// `highlight_target` expects.
class CanvasPhoto {
  const CanvasPhoto({required this.path, required this.width, required this.height});

  final String path;
  final int width;
  final int height;

  double get aspectRatio => width / height;
}
