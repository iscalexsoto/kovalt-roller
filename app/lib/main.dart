import 'package:flutter/material.dart';

import 'src/rust/api/engine.dart';
import 'src/rust/frb_generated.dart';

Future<void> main() async {
  await RustLib.init();
  runApp(const KovaltApp());
}

class KovaltApp extends StatelessWidget {
  const KovaltApp({super.key});

  @override
  Widget build(BuildContext context) {
    final dice = rollDice(count: 3, maxDice: 10);
    return MaterialApp(
      title: 'Kovalt Roller',
      home: Scaffold(
        body: Center(child: Text('Kovalt Roller · 3d6: ${dice.join(' ')}')),
      ),
    );
  }
}
