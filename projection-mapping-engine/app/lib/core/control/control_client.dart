import 'dart:async';
import 'dart:collection';
import 'dart:convert';

import 'package:web_socket_channel/web_socket_channel.dart';

/// Thin JSON request/response bridge to `cv_engine`'s control WebSocket
/// server (`cv_engine/main.py`) — everything that isn't a per-frame render
/// operation: Scan Room, Highlight Target, Nudge Corners, Save/Load Venue.
///
/// The server handles one message at a time per connection and replies
/// once per request (see `ControlServer.handle_connection`), so this client
/// only needs to pair each outgoing request with the next inbound message —
/// it does not attempt to pipeline concurrent requests.
class ControlClient {
  ControlClient._();

  static final ControlClient instance = ControlClient._();

  WebSocketChannel? _channel;
  StreamSubscription<dynamic>? _subscription;
  final Queue<Completer<Map<String, dynamic>>> _pending = Queue();

  bool get isConnected => _channel != null;

  Future<void> connect({String host = '127.0.0.1', int port = 8765}) async {
    await close();

    final channel = WebSocketChannel.connect(Uri.parse('ws://$host:$port'));
    _channel = channel;
    _subscription = channel.stream.listen(
      _handleMessage,
      onError: _handleError,
      onDone: () => _handleError(StateError('cv_engine connection closed')),
    );
  }

  void _handleMessage(dynamic raw) {
    final response = jsonDecode(raw as String) as Map<String, dynamic>;
    if (_pending.isNotEmpty) {
      _pending.removeFirst().complete(response);
    }
  }

  void _handleError(Object error) {
    while (_pending.isNotEmpty) {
      _pending.removeFirst().completeError(error);
    }
  }

  /// Sends one command and waits for its matching response, e.g.:
  /// `send({'command': 'nudge_corners', 'pointCount': 4, 'points': [...]})`.
  ///
  /// Throws a [StateError] if the response's `ok` field is `false`, using
  /// its `error` field as the message — callers get a plain exception
  /// instead of having to check `response['ok']` everywhere.
  Future<Map<String, dynamic>> send(Map<String, dynamic> request) async {
    final channel = _channel;
    if (channel == null) {
      throw StateError('ControlClient.connect() must be called before send()');
    }

    final completer = Completer<Map<String, dynamic>>();
    _pending.add(completer);
    channel.sink.add(jsonEncode(request));

    final response = await completer.future;
    if (response['ok'] != true) {
      throw StateError(response['error']?.toString() ?? 'cv_engine request failed');
    }
    return response;
  }

  Future<void> close() async {
    await _subscription?.cancel();
    _subscription = null;
    await _channel?.sink.close();
    _channel = null;
    _handleError(StateError('ControlClient closed'));
  }
}
