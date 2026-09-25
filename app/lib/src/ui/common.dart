import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_rust_bridge/flutter_rust_bridge_for_generated.dart';

import '../data/auth_repository.dart';

/// Mensaje legible para cualquier error de la app.
String errorMessage(Object e) {
  if (e is AnyhowException) return e.message;
  if (e is FirebaseException) {
    if (e.code == 'permission-denied') return 'No tienes permiso para hacer eso.';
    if (e.code == 'unavailable') return 'Sin conexión con el servidor.';
    return authErrorMessage(e);
  }
  return e.toString();
}

void showError(BuildContext context, Object e) {
  final messenger = ScaffoldMessenger.maybeOf(context);
  messenger?.showSnackBar(
    SnackBar(content: Text(errorMessage(e)), backgroundColor: Theme.of(context).colorScheme.error),
  );
}

/// Ejecuta una acción mostrando el error (si lo hay) en un SnackBar.
Future<bool> guard(BuildContext context, Future<void> Function() action) async {
  try {
    await action();
    return true;
  } catch (e) {
    if (context.mounted) showError(context, e);
    return false;
  }
}

Future<bool> confirm(BuildContext context, String title, {String? body, String ok = 'Aceptar'}) async {
  final result = await showDialog<bool>(
    context: context,
    builder: (context) => AlertDialog(
      title: Text(title),
      content: body == null ? null : Text(body),
      actions: [
        TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancelar')),
        FilledButton(onPressed: () => Navigator.pop(context, true), child: Text(ok)),
      ],
    ),
  );
  return result ?? false;
}

/// Diálogo con un campo de texto. Devuelve null si se cancela.
Future<String?> promptText(
  BuildContext context, {
  required String title,
  String label = '',
  String initial = '',
  String ok = 'Aceptar',
  bool required = true,
  int maxLines = 1,
  int? maxLength,
}) {
  final controller = TextEditingController(text: initial);
  return showDialog<String>(
    context: context,
    builder: (context) => StatefulBuilder(
      builder: (context, setState) {
        final valid = !required || controller.text.trim().isNotEmpty;
        void submit() {
          if (valid) Navigator.pop(context, controller.text.trim());
        }

        return AlertDialog(
          title: Text(title),
          content: SizedBox(
            width: 420,
            child: TextField(
              controller: controller,
              autofocus: true,
              maxLines: maxLines,
              maxLength: maxLength,
              decoration: InputDecoration(labelText: label),
              onChanged: (_) => setState(() {}),
              onSubmitted: maxLines == 1 ? (_) => submit() : null,
            ),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context), child: const Text('Cancelar')),
            FilledButton(onPressed: valid ? submit : null, child: Text(ok)),
          ],
        );
      },
    ),
  );
}

/// Un d6 dibujado como ficha.
class DieFace extends StatelessWidget {
  const DieFace(this.value, {super.key, this.muted = false});

  final int value;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final six = value == 6;
    final bg = muted
        ? scheme.surfaceContainerHighest
        : six
        ? scheme.primary
        : scheme.secondaryContainer;
    final fg = muted
        ? scheme.onSurfaceVariant
        : six
        ? scheme.onPrimary
        : scheme.onSecondaryContainer;
    return Container(
      width: 30,
      height: 30,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(7)),
      child: Text(
        '$value',
        style: TextStyle(color: fg, fontWeight: FontWeight.w700),
      ),
    );
  }
}

class DiceRow extends StatelessWidget {
  const DiceRow({super.key, required this.label, required this.dice, this.muted = false});

  final String label;
  final List<int> dice;
  final bool muted;

  @override
  Widget build(BuildContext context) {
    final total = dice.fold<int>(0, (a, b) => a + b);
    return Row(
      children: [
        SizedBox(width: 92, child: Text(label, style: Theme.of(context).textTheme.labelMedium)),
        Expanded(
          child: Wrap(spacing: 4, runSpacing: 4, children: [for (final d in dice) DieFace(d, muted: muted)]),
        ),
        Text('= $total', style: Theme.of(context).textTheme.titleMedium),
      ],
    );
  }
}

/// Código de sala con botón de copiar.
class RoomCodeChip extends StatelessWidget {
  const RoomCodeChip(this.code, {super.key});

  final String code;

  @override
  Widget build(BuildContext context) {
    return ActionChip(
      avatar: const Icon(Icons.copy, size: 16),
      label: Text(
        code,
        style: const TextStyle(fontFamily: 'Consolas', letterSpacing: 2, fontWeight: FontWeight.w700),
      ),
      tooltip: 'Copiar código',
      onPressed: () {
        Clipboard.setData(ClipboardData(text: code));
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Código copiado')));
      },
    );
  }
}

class SectionTitle extends StatelessWidget {
  const SectionTitle(this.text, {super.key, this.trailing});

  final String text;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(0, 12, 0, 6),
      child: Row(
        children: [
          Expanded(
            child: Text(
              text.toUpperCase(),
              style: Theme.of(context).textTheme.labelMedium
                  ?.copyWith(letterSpacing: 1.2, color: Theme.of(context).colorScheme.primary),
            ),
          ),
          ?trailing,
        ],
      ),
    );
  }
}
