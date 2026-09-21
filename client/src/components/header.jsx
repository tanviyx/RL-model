import { assets } from "../assets/assets"
import { useNavigate } from "react-router-dom"

const Header = () => {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col items-center justify-center text-center mt-16 px-4">



      {/* Robot Image */}
      <img
        src={assets.header_img}
        alt="robot"
        className="w-28 mb-6"
      />

      {/* Greeting */}
      <h3 className="text-lg text-gray-600 mb-2">
        HEY Developer 👋
      </h3>

      {/* Main Heading */}
      <h1 className="text-5xl font-bold text-gray-800 mb-4">
        Welcome to our app
      </h1>

      {/* Subtext */}
      <p className="text-gray-500 max-w-xl mb-8">
        Smart Traffic Management System
      </p>

      <button onClick={() => navigate('/login')} className="border border-gray-300 px-8 py-3 rounded-full text-gray-700 hover:bg-gray-100 transition">
        Get Started
      </button>

    </div>
  )
}

export default Header

