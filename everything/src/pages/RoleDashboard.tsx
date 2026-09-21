import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { getSession, clearSession } from "@/lib/session";

const RoleDashboard = () => {
  const navigate = useNavigate();
  const session = getSession();

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  const handleLogout = () => {
    clearSession();
    navigate("/login", { replace: true });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-4 rounded-lg border bg-card p-6 text-center shadow-sm">
        <p className="text-lg">
          Logged in as {session.id} — role: {session.role}
        </p>
        <Button variant="outline" onClick={handleLogout}>
          Log out
        </Button>
      </div>
    </div>
  );
};

export default RoleDashboard;
