import Navbar from "../components/Navbar"
import Header from "../components/header"

const Welcome = () => {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-indigo-600 to-purple-600 px-4">
      <div className="bg-white rounded-2xl shadow-2xl p-12 text-center max-w-2xl w-full">

        <h1 className="text-3xl font-bold text-gray-800 mb-4">
          🚦 Welcome to Your RL Based Traffic Signal Control Project
        </h1>

        <p className="text-gray-600 text-lg">
          This application uses Reinforcement Learning to intelligently 
          optimize traffic signals and reduce congestion in real time.
        </p>

      </div>
    </div>
  );
};

export default Welcome;