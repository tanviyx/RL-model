import { useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../api/axios";

const VerifyEmail = () => {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const handleVerify = async (e) => {
    e.preventDefault();

    if (!email || !otp) {
      return setMessage("Please enter email and OTP");
    }

    try {
      setLoading(true);

      const { data } = await API.post("/auth/verify-email-otp", {
        email,
        otp,
      });

      setMessage(data.message);

      setTimeout(() => {
        navigate("/login");
      }, 2000);

    } catch (error) {
      setMessage(error.response?.data?.message || "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        .ver-root {
          min-height: 100vh;
          background: #050810; /* SAME SYSTEM BACKGROUND */
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Rajdhani', sans-serif;
        }

        .ver-box {
          width: 420px;
          padding: 40px;
          background: rgba(10, 15, 30, 0.7);
          border: 1px solid rgba(0, 200, 150, 0.15);
          backdrop-filter: blur(10px);
        }

        .ver-title {
          color: #e8f5f0;
          font-size: 24px;
          font-weight: 700;
          text-align: center;
          margin-bottom: 6px;
        }

        .ver-sub {
          color: rgba(0,200,150,0.6);
          font-size: 11px;
          text-align: center;
          letter-spacing: 0.2em;
          margin-bottom: 25px;
          font-family: monospace;
        }

        .ver-input {
          width: 100%;
          padding: 12px;
          margin-bottom: 12px;
          background: transparent;
          border: 1px solid rgba(0,200,150,0.2);
          color: white;
          outline: none;
          font-family: monospace;
        }

        .ver-input:focus {
          border-color: rgba(0,200,150,0.6);
        }

        .ver-btn {
          width: 100%;
          padding: 12px;
          margin-top: 10px;
          border: 1px solid rgba(0,200,150,0.5);
          background: transparent;
          color: #00c896;
          cursor: pointer;
          letter-spacing: 0.15em;
          font-weight: 600;
        }

        .ver-btn:hover {
          background: rgba(0,200,150,0.08);
        }

        .ver-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .ver-msg {
          text-align: center;
          margin-top: 14px;
          font-size: 12px;
          color: rgba(0,200,150,0.8);
          font-family: monospace;
        }
      `}</style>

      <div className="ver-root">

        <div className="ver-box">

          <div className="ver-title">Email Verification</div>
          <div className="ver-sub">GRID AUTHENTICATION MODULE</div>

          <form onSubmit={handleVerify}>

            <input
              className="ver-input"
              type="email"
              placeholder="OPERATOR EMAIL"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <input
              className="ver-input"
              type="text"
              placeholder="6-DIGIT OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
            />

            <button
              className="ver-btn"
              type="submit"
              disabled={loading}
            >
              {loading ? "VERIFYING..." : "VERIFY ACCESS"}
            </button>

          </form>

          {message && (
            <div className="ver-msg">
              {message}
            </div>
          )}

        </div>
      </div>
    </>
  );
};

export default VerifyEmail;