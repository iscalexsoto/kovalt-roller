import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../ui/common.dart';

/// Convierte la sesión de invitado en una cuenta con email (mismo uid).
class UpgradeAccountDialog extends ConsumerStatefulWidget {
  const UpgradeAccountDialog({super.key});

  @override
  ConsumerState<UpgradeAccountDialog> createState() => _UpgradeAccountDialogState();
}

class _UpgradeAccountDialogState extends ConsumerState<UpgradeAccountDialog> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _busy = false;

  Future<void> _submit() async {
    setState(() => _busy = true);
    final ok = await guard(context, () => ref.read(authRepositoryProvider).upgradeGuest(_email.text, _password.text));
    if (!mounted) return;
    setState(() => _busy = false);
    if (ok) {
      Navigator.pop(context);
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Cuenta creada. Ya puedes ser DM.')));
    }
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('Crear cuenta'),
      content: SizedBox(
        width: 400,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Text('Conservarás tus salas y personajes.'),
            const SizedBox(height: 12),
            TextField(
              controller: _email,
              decoration: const InputDecoration(labelText: 'Email'),
            ),
            const SizedBox(height: 10),
            TextField(
              controller: _password,
              obscureText: true,
              decoration: const InputDecoration(labelText: 'Contraseña (mín. 6)'),
              onSubmitted: (_) => _submit(),
            ),
          ],
        ),
      ),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
        FilledButton(onPressed: _busy ? null : _submit, child: const Text('Crear cuenta')),
      ],
    );
  }
}
