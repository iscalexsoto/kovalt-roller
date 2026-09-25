import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../app/providers.dart';
import '../../ui/common.dart';

class LoginScreen extends StatelessWidget {
  const LoginScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final text = Theme.of(context).textTheme;
    return Scaffold(
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 440),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Center(child: Image.asset('assets/icon.png', width: 112, height: 112)),
                const SizedBox(height: 12),
                Text('Kovalt Roller', style: text.displaySmall, textAlign: TextAlign.center),
                Text('Mesa virtual de Roll For Shoes', style: text.titleMedium, textAlign: TextAlign.center),
                const SizedBox(height: 24),
                const Card(
                  child: DefaultTabController(
                    length: 2,
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        TabBar(
                          tabs: [
                            Tab(text: 'Jugador'),
                            Tab(text: 'Cuenta (DM)'),
                          ],
                        ),
                        SizedBox(height: 330, child: TabBarView(children: [_GuestForm(), _AccountForm()])),
                      ],
                    ),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _GuestForm extends ConsumerStatefulWidget {
  const _GuestForm();

  @override
  ConsumerState<_GuestForm> createState() => _GuestFormState();
}

class _GuestFormState extends ConsumerState<_GuestForm> {
  final _name = TextEditingController();
  bool _busy = false;

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty) return;
    setState(() => _busy = true);
    await guard(context, () => ref.read(authRepositoryProvider).signInAsGuest(_name.text));
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const Text(
            'Entra como invitado para unirte a una sala con su código. '
            'Podrás crear una cuenta más tarde sin perder tu personaje.',
          ),
          const SizedBox(height: 16),
          TextField(
            controller: _name,
            maxLength: 40,
            decoration: const InputDecoration(labelText: 'Tu nombre'),
            onSubmitted: (_) => _submit(),
          ),
          const Spacer(),
          FilledButton(onPressed: _busy ? null : _submit, child: const Text('Entrar como invitado')),
        ],
      ),
    );
  }
}

class _AccountForm extends ConsumerStatefulWidget {
  const _AccountForm();

  @override
  ConsumerState<_AccountForm> createState() => _AccountFormState();
}

class _AccountFormState extends ConsumerState<_AccountForm> {
  final _email = TextEditingController();
  final _password = TextEditingController();
  final _name = TextEditingController();
  bool _register = false;
  bool _busy = false;

  Future<void> _submit() async {
    final auth = ref.read(authRepositoryProvider);
    setState(() => _busy = true);
    await guard(context, () async {
      if (_register) {
        if (_name.text.trim().isEmpty) throw 'Escribe tu nombre.';
        await auth.register(_email.text, _password.text, _name.text);
      } else {
        await auth.signIn(_email.text, _password.text);
      }
    });
    if (mounted) setState(() => _busy = false);
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          if (_register) ...[
            TextField(
              controller: _name,
              decoration: const InputDecoration(labelText: 'Nombre'),
            ),
            const SizedBox(height: 10),
          ],
          TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(labelText: 'Email'),
          ),
          const SizedBox(height: 10),
          TextField(
            controller: _password,
            obscureText: true,
            decoration: const InputDecoration(labelText: 'Contraseña'),
            onSubmitted: (_) => _submit(),
          ),
          const Spacer(),
          FilledButton(onPressed: _busy ? null : _submit, child: Text(_register ? 'Crear cuenta' : 'Iniciar sesión')),
          TextButton(
            onPressed: _busy ? null : () => setState(() => _register = !_register),
            child: Text(_register ? 'Ya tengo cuenta' : 'Crear una cuenta nueva'),
          ),
        ],
      ),
    );
  }
}
