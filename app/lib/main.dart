import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'src/app/app.dart';
import 'src/app/instance.dart';
import 'src/app/providers.dart';
import 'src/rust/frb_generated.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await RustLib.init();
  final session = await FirebaseSession.start(InstanceSlot.acquire());
  runApp(
    ProviderScope(
      overrides: [
        firebaseSessionProvider.overrideWithValue(session),
        instanceSlotProvider.overrideWithValue(session.slot),
      ],
      child: const KovaltApp(),
    ),
  );
}
