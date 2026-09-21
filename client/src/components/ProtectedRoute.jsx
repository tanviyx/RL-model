import { Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import API from "../api/axios";

const ProtectedRoute = ({ children }) => {
  const [status, setStatus] = useState("loading"); // loading | authenticated | unauthenticated

  useEffect(() => {
    API.get("/auth/check")
      .then((res) => {
        if (res.data.success) {
          setStatus("authenticated");
        } else {
          setStatus("unauthenticated");
        }
      })
      .catch(() => {
        setStatus("unauthenticated");
      });
  }, []);

  if (status === "loading") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-[#b4c6fc] to-[#c79dfc]">
        <div className="text-white text-xl font-semibold animate-pulse">
          Verifying session...
        </div>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
