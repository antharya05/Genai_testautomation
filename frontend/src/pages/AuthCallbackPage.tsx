import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** OAuth redirect target: extracts the session token from the URL fragment,
 *  completes the session, and forwards into the app. */
export default function AuthCallbackPage() {
  const navigate = useNavigate();
  const { completeOAuth } = useAuth();

  useEffect(() => {
    const m = window.location.hash.match(/token=([^&]+)/);
    if (!m) { navigate("/signin", { replace: true }); return; }
    completeOAuth(decodeURIComponent(m[1]))
      .then(() => navigate("/app/dashboard", { replace: true }))
      .catch(() => navigate("/signin", { replace: true }));
  }, [completeOAuth, navigate]);

  return (
    <div style={{
      minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center",
      background: "var(--c-bg)", color: "var(--c-text-2)", fontFamily: "var(--font)",
    }}>
      Signing you in…
    </div>
  );
}
