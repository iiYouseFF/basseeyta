import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import GenericList from './pages/GenericList';
import Verifications from './pages/Verifications';
import Audit from './pages/Audit';
import Admins from './pages/Admins';

function Protected({ children, title, subtitle }: { children: React.ReactNode; title?: string; subtitle?: string }) {
  const { token, loading } = useAuth();
  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#64748B' }}>Loading…</div>;
  if (!token) return <Navigate to="/admin/login" replace />;
  return <Layout title={title} subtitle={subtitle}>{children}</Layout>;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/admin/login" element={<Login />} />
      <Route path="/admin/register" element={<Register />} />
      <Route path="/admin/signup" element={<Register />} />
      <Route path="/admin" element={<Protected title="Dashboard" subtitle="Overview & health"><Dashboard /></Protected>} />
      <Route path="/admin/users" element={<Protected title="Users"><GenericList entityKey="users" /></Protected>} />
      <Route path="/admin/technicians" element={<Protected title="Technicians"><GenericList entityKey="technicians" /></Protected>} />
      <Route path="/admin/requests" element={<Protected title="Service Requests"><GenericList entityKey="requests" /></Protected>} />
      <Route path="/admin/offers" element={<Protected title="Offers"><GenericList entityKey="offers" /></Protected>} />
      <Route path="/admin/appointments" element={<Protected title="Appointments"><GenericList entityKey="appointments" /></Protected>} />
      <Route path="/admin/chat" element={<Protected title="Chat Rooms"><GenericList entityKey="rooms" /></Protected>} />
      <Route path="/admin/payments" element={<Protected title="Payment Logs"><GenericList entityKey="payments" /></Protected>} />
      <Route path="/admin/transactions" element={<Protected title="Transactions"><GenericList entityKey="transactions" /></Protected>} />
      <Route path="/admin/instapay" element={<Protected title="InstaPay"><GenericList entityKey="instapay" /></Protected>} />
      <Route path="/admin/promos" element={<Protected title="Promo Codes"><GenericList entityKey="promos" /></Protected>} />
      <Route path="/admin/posts" element={<Protected title="Posts"><GenericList entityKey="posts" /></Protected>} />
      <Route path="/admin/reviews" element={<Protected title="Reviews"><GenericList entityKey="reviews" /></Protected>} />
      <Route path="/admin/tickets" element={<Protected title="Support Tickets"><GenericList entityKey="tickets" /></Protected>} />
      <Route path="/admin/notifications" element={<Protected title="Notifications"><GenericList entityKey="notifications" /></Protected>} />
      <Route path="/admin/verifications" element={<Protected title="Verifications"><Verifications /></Protected>} />
      <Route path="/admin/families" element={<Protected title="Families"><GenericList entityKey="families" /></Protected>} />
      <Route path="/admin/search" element={<Protected title="Search Index"><GenericList entityKey="search" /></Protected>} />
      <Route path="/admin/audit" element={<Protected title="Audit Log" subtitle="Full history of admin actions"><Audit /></Protected>} />
      <Route path="/admin/admins" element={<Protected title="Admins" subtitle="Manage admin accounts"><Admins /></Protected>} />
      {/* Legacy aliases */}
      <Route path="/admin/verifications/*" element={<Navigate to="/admin/verifications" replace />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  );
}
