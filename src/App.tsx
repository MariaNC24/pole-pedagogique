import { Routes, Route } from "react-router-dom";
import Login from "./pages/Login";
import SetPassword from "./pages/SetPassword";
import Dashboard from "./pages/Dashboard";
import Apprenants from "./pages/Apprenants";
import ApprenantDetail from "./pages/ApprenantDetail";
import Groupes from "./pages/Groupes";
import Evaluations from "./pages/Evaluations";
import Presences from "./pages/Presences";
import Calendrier from "./pages/Calendrier";
import Journal from "./pages/Journal";
import Anomalies from "./pages/Anomalies";
import Statistiques from "./pages/Statistiques";
import Historique from "./pages/Historique";
import DossiersAdministratifs from "./pages/DossiersAdministratifs";
import Examen from "./pages/Examen";
import Corbeille from "./pages/Corbeille";
import Utilisateurs from "./pages/Utilisateurs";
import Layout from "./components/Layout";
import RequireAuth from "./components/RequireAuth";
import RoleGuard from "./components/RoleGuard";

export default function App() {
  return (
    <Routes>
      <Route path="/connexion" element={<Login />} />
      <Route path="/definir-mot-de-passe" element={<SetPassword />} />

      <Route
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route path="/" element={<Dashboard />} />
        <Route path="/apprenants" element={<Apprenants />} />
        <Route path="/apprenants/:id" element={<ApprenantDetail />} />
        <Route path="/groupes" element={<Groupes />} />
        <Route path="/evaluations" element={<Evaluations />} />
        <Route path="/presences" element={<Presences />} />
        <Route path="/calendrier" element={<Calendrier />} />
        <Route path="/journal" element={<Journal />} />
        <Route path="/anomalies" element={<Anomalies />} />
        <Route path="/statistiques" element={<Statistiques />} />
        <Route path="/historique" element={<Historique />} />
        <Route path="/dossiers-administratifs" element={<DossiersAdministratifs />} />
        <Route path="/examen" element={<Examen />} />
        <Route
          path="/utilisateurs"
          element={
            <RoleGuard
              allow={["admin"]}
              fallback={<p className="text-sm text-slate-500">Accès réservé aux administrateurs.</p>}
            >
              <Utilisateurs />
            </RoleGuard>
          }
        />
        <Route
          path="/corbeille"
          element={
            <RoleGuard
              allow={["admin"]}
              fallback={<p className="text-sm text-slate-500">Accès réservé aux administrateurs.</p>}
            >
              <Corbeille />
            </RoleGuard>
          }
        />
      </Route>
    </Routes>
  );
}
