import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:kovalt_roller/src/features/auth/login_screen.dart';

void main() {
  testWidgets('login ofrece entrar como invitado o con cuenta', (tester) async {
    tester.view.physicalSize = const Size(1280, 900);
    tester.view.devicePixelRatio = 1;
    addTearDown(tester.view.resetDevicePixelRatio);
    addTearDown(tester.view.resetPhysicalSize);
    await tester.pumpWidget(const ProviderScope(child: MaterialApp(home: LoginScreen())));

    expect(find.text('Kovalt Roller'), findsOneWidget);
    expect(find.text('Entrar como invitado'), findsOneWidget);

    await tester.tap(find.text('Cuenta (DM)'));
    await tester.pumpAndSettle();
    expect(find.text('Iniciar sesión'), findsOneWidget);
    await tester.tap(find.text('Crear una cuenta nueva'));
    await tester.pumpAndSettle();
    expect(find.text('Crear cuenta'), findsOneWidget);
  });
}
