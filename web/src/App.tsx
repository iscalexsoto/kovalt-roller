import { Navigate, Route, Routes } from 'react-router-dom';
import { Gate } from './components/Gate';
import { Toaster } from './components/Toaster';
import { Enter } from './screens/Enter';
import { Lobby } from './screens/Lobby';
import { Room } from './screens/Room';

export function App() {
  return (
    <>
      <Routes>
        <Route path="/entrar" element={<Enter />} />
        <Route path="/unirse/:codigo" element={<Enter />} />
        <Route element={<Gate />}>
          <Route path="/" element={<Lobby />} />
          <Route path="/sala/:id" element={<Room />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </>
  );
}
