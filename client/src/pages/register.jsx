import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import API from "../api/axios";

const Register = () => {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleRegister = async (e) => {
    e.preventDefault();

    try {
      const res = await API.post("/auth/register", {
        name,
        email,
        password,
      });

      alert(res.data.message);
      navigate("/verify-email");
    } catch (error) {
      alert(error.response?.data?.message || "Registration failed");
    }
  };

  return (
    <>
      <style>{`
        .reg-root {
          min-height: 100vh;
          background: #050810; /* SAME AS LOGIN */
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: 'Rajdhani', sans-serif;
        }

        .reg-box {
          width: 420px;
          padding: 40px;
          background: rgba(10, 15, 30, 0.7);
          border: 1px solid rgba(0, 200, 150, 0.15);
          backdrop-filter: blur(10px);
        }

        .reg-title {
          color: #e8f5f0;
          font-size: 26px;
          font-weight: 700;
          margin-bottom: 6px;
        }

        .reg-sub {
          color: rgba(0,200,150,0.6);
          font-size: 12px;
          letter-spacing: 0.2em;
          margin-bottom: 25px;
        }

        .reg-input {
          width: 100%;
          padding: 12px;
          margin-bottom: 12px;
          background: transparent;
          border: 1px solid rgba(0,200,150,0.2);
          color: white;
          outline: none;
        }

        .reg-input:focus {
          border-color: rgba(0,200,150,0.6);
        }

        .reg-btn {
          width: 100%;
          padding: 12px;
          margin-top: 10px;
          border: 1px solid rgba(0,200,150,0.5);
          background: transparent;
          color: #00c896;
          cursor: pointer;
          letter-spacing: 0.15em;
        }

        .reg-btn:hover {
          background: rgba(0,200,150,0.08);
        }

        .reg-link {
          margin-top: 15px;
          font-size: 12px;
          color: rgba(255,255,255,0.4);
          text-align: center;
        }

        .reg-link a {
          color: #00c896;
          text-decoration: none;
        }
      `}</style>

      <div className="reg-root">

        <div className="reg-box">

          <div className="reg-title">Create Account</div>
          <div className="reg-sub">TRAFFIC GRID ACCESS NODE</div>

          <form onSubmit={handleRegister}>

            <input
              className="reg-input"
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />

            <input
              className="reg-input"
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <input
              className="reg-input"
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />

            <button className="reg-btn" type="submit">
              REGISTER
            </button>

          </form>

          <div className="reg-link">
            Already inside system? <Link to="/login">Login</Link>
          </div>

        </div>
      </div>
    </>
  );
};

export default Register;