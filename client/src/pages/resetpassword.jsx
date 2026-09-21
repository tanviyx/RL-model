import { useState } from "react";
import API from "../api/axios";

const ResetPassword = () => {
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [step, setStep] = useState(1); // 1 = send OTP, 2 = verify OTP

  const handleSendOtp = async (e) => {
    e.preventDefault();

    try {
      const res = await API.post("/auth/send-reset-otp", { email });
      alert(res.data.message);
      setStep(2);
    } catch (error) {
      alert(error.response?.data?.message || "Failed to send OTP");
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();

    try {
      const res = await API.post("/auth/reset-password", {
        email,
        otp,
        newPassword,
      });

      alert(res.data.message);
      setStep(1);
      setEmail("");
      setOtp("");
      setNewPassword("");
    } catch (error) {
      alert(error.response?.data?.message || "Reset failed");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-r from-[#b4c6fc] to-[#c79dfc] px-4">
      <div className="bg-[#0b1533] w-full max-w-md rounded-2xl p-10 shadow-2xl">

        <h2 className="text-2xl font-semibold text-white text-center mb-6">
          Reset Password
        </h2>

        {step === 1 ? (
          <form onSubmit={handleSendOtp}>
            <input
              type="email"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full mb-6 px-5 py-3 rounded-full bg-[#1b254b] text-white outline-none"
              required
            />

            <button
              type="submit"
              className="w-full py-3 rounded-full text-white font-medium bg-gradient-to-r from-purple-500 to-indigo-500"
            >
              Send OTP
            </button>
          </form>
        ) : (
          <form onSubmit={handleResetPassword}>
            <input
              type="text"
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full mb-4 px-5 py-3 rounded-full bg-[#1b254b] text-white outline-none text-center tracking-widest"
              maxLength={6}
              required
            />

            <input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full mb-6 px-5 py-3 rounded-full bg-[#1b254b] text-white outline-none"
              required
            />

            <button
              type="submit"
              className="w-full py-3 rounded-full text-white font-medium bg-gradient-to-r from-purple-500 to-indigo-500"
            >
              Reset Password
            </button>
          </form>
        )}

      </div>
    </div>
  );
};

export default ResetPassword; 