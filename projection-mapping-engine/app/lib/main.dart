import 'package:flutter/material.dart';

import 'ui/screens/zone_deck_screen.dart';

void main() {
  runApp(const ProjectionMapperApp());
}

class ProjectionMapperApp extends StatelessWidget {
  const ProjectionMapperApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Projection Mapper',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(
          seedColor: Colors.deepPurple,
          brightness: Brightness.dark,
        ),
        useMaterial3: true,
      ),
      home: const ZoneDeckScreen(),
    );
  }
}
