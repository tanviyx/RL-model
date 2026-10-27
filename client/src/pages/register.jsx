import { Navigate } from "react-router-dom";

// Sign up lives on the login page (SIGN UP tab) so both flows share one UI.
const Register = () => {
  return <Navigate to="/login?mode=signup" replace />;
};

export default Register;