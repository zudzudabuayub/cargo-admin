import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { LiveProvider, useAuth } from './lib/hooks';
import Login from './pages/Login';
import PublicTrack from './pages/PublicTrack';

const Dashboard = lazy(() => import('./pages/Dashboard'));
const Shipments = lazy(() => import('./pages/Shipments'));
const ShipmentDetail = lazy(() => import('./pages/ShipmentDetail'));
const Tracking = lazy(() => import('./pages/Tracking'));
const Parcels = lazy(() => import('./pages/Parcels'));
const Clients = lazy(() => import('./pages/Clients'));
const ClientDetail = lazy(() => import('./pages/ClientDetail'));
const Chats = lazy(() => import('./pages/Chats'));
const Warehouses = lazy(() => import('./pages/Warehouses'));
const Fleet = lazy(() => import('./pages/Fleet'));
const Finance = lazy(() => import('./pages/Finance'));
const Tariffs = lazy(() => import('./pages/Tariffs'));
const Settings = lazy(() => import('./pages/Settings'));

function Loading() {
  return (
    <div className="grid h-[60vh] place-items-center">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-accent border-t-transparent" />
    </div>
  );
}

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <Loading />;
  return (
    <Routes>
      <Route path="/t/:token" element={<PublicTrack />} />
      {!user ? (
        <Route path="*" element={<Login />} />
      ) : (
        <Route
          element={
            <LiveProvider>
              <Suspense fallback={<Loading />}>
                <Layout />
              </Suspense>
            </LiveProvider>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="shipments" element={<Shipments />} />
          <Route path="shipments/:id" element={<ShipmentDetail />} />
          <Route path="tracking" element={<Tracking />} />
          <Route path="parcels" element={<Parcels />} />
          <Route path="clients" element={<Clients />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          <Route path="chats" element={<Chats />} />
          <Route path="chats/:id" element={<Chats />} />
          <Route path="warehouses" element={<Warehouses />} />
          <Route path="fleet" element={<Fleet />} />
          <Route path="finance" element={<Finance />} />
          <Route path="tariffs" element={<Tariffs />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      )}
    </Routes>
  );
}
