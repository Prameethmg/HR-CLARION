import { useRouteError } from "react-router-dom";

const RouteError = () => {
  const error = useRouteError();
  console.error("Route error:", error);
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4 font-sans">
      <div className="text-center">
        <p className="text-lg font-semibold text-foreground">Something went wrong</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
};

export default RouteError;
