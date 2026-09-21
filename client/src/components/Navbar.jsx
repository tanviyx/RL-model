import { Link, useNavigate } from "react-router-dom";
import API from "../api/axios";

const Navbar = () => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await API.post("/auth/logout");
      alert("Logged out");
      navigate("/login");
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="flex justify-between items-center px-10 py-6 bg-white shadow-sm">

      {/* Logo */}
      <div className="flex items-center gap-2">
        <span className="text-xl font-semibold text-gray-700">
          RL BASED SMART TRAFFIC SIGNAL CONTROL
        </span>
      </div>

      {/* Buttons */}
      <div className="flex gap-4">
        <Link to="/login">
          <button className="bg-red-500 text-white px-6 py-2 rounded-full hover:bg-red-600 transition">
            Login
          </button>
        </Link>

        <Link to="/register">
          <button className="bg-red-500 text-white px-6 py-2 rounded-full hover:bg-red-600 transition">
            Register
          </button>
        </Link>

        <button
          onClick={handleLogout}
          className="bg-red-500 text-white px-6 py-2 rounded-full hover:bg-red-600 transition"
        >
          Logout
        </button>
      </div>

    </div>
  );
};

export default Navbar;
