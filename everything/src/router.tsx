import { Navigate } from "react-router-dom";
import NotFound from "./pages/NotFound";
import Login from "./pages/Login";
import RoleDashboard from "./pages/RoleDashboard";
import EmployeePolicyDesk from "./pages/EmployeePolicyDesk";
import ManagerApprovalQueue from "./pages/ManagerApprovalQueue";
import HRAdminOverview from "./pages/HRAdminOverview";
import Speakup from "./pages/Speakup";
import SpeakupStatus from "./pages/SpeakupStatus";
import ManagerRequestsView from "./pages/ManagerRequestsView";
import HREscalations from "./pages/HREscalations";
import HRDirectory from "./pages/HRDirectory";
import HRPolicies from "./pages/HRPolicies";
import HRSpeakup from "./pages/HRSpeakup";
import RouteError from "./components/RouteError";

export const routers = [
  {
    path: "/",
    name: "home",
    element: <Navigate to="/login" replace />,
  },
  {
    path: "/login",
    name: "login",
    element: <Login />,
  },
  {
    path: "/employee",
    name: "employee",
    element: <EmployeePolicyDesk />,
    errorElement: <RouteError />,
  },
  {
    path: "/manager",
    name: "manager",
    element: <ManagerApprovalQueue />,
    errorElement: <RouteError />,
  },
  {
    path: "/hr",
    name: "hr",
    element: <HRAdminOverview />,
    errorElement: <RouteError />,
  },
  {
    path: "/speakup",
    name: "speakup",
    element: <Speakup />,
  },
  {
    path: "/speakup/status",
    name: "speakup-status",
    element: <SpeakupStatus />,
  },
  {
    path: "/manager/requests/all",
    name: "manager-requests-all",
    element: <ManagerRequestsView status="all" title="All Requests" />,
    errorElement: <RouteError />,
  },
  {
    path: "/manager/requests/pending",
    name: "manager-requests-pending",
    element: <ManagerRequestsView status="pending" title="Pending Requests" />,
    errorElement: <RouteError />,
  },
  {
    path: "/manager/requests/approved",
    name: "manager-requests-approved",
    element: <ManagerRequestsView status="approved" title="Approved Requests" />,
    errorElement: <RouteError />,
  },
  {
    path: "/manager/requests/rejected",
    name: "manager-requests-rejected",
    element: <ManagerRequestsView status="rejected" title="Rejected Requests" />,
    errorElement: <RouteError />,
  },
  {
    path: "/hr/escalations",
    name: "hr-escalations",
    element: <HREscalations />,
    errorElement: <RouteError />,
  },
  {
    path: "/hr/employees",
    name: "hr-employees",
    element: <HRDirectory />,
    errorElement: <RouteError />,
  },
  {
    path: "/hr/policies",
    name: "hr-policies",
    element: <HRPolicies />,
    errorElement: <RouteError />,
  },
  {
    path: "/hr/speakup",
    name: "hr-speakup",
    element: <HRSpeakup />,
    errorElement: <RouteError />,
  },
  /* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */
  {
    path: "*",
    name: "404",
    element: <NotFound />,
  },
];

declare global {
  interface Window {
    __routers__: typeof routers;
  }
}

window.__routers__ = routers;
