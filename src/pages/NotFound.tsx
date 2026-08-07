import { useLocation, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Home } from "lucide-react";

const NotFound = () => {
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    console.error("404 Error:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 p-6">
      <div className="text-8xl">💋</div>
      <h1 className="text-6xl font-black text-primary" style={{ textShadow: '0 0 20px #FF1493' }}>404</h1>
      <p className="text-white font-bold text-xl">Ukurasa haukupatikana</p>
      <p className="text-gray-400 text-sm text-center">Ukurasa ulioutafuta haupo au umefutwa.</p>
      <button
        onClick={() => navigate('/')}
        className="btn-primary flex items-center gap-2 mt-2"
      >
        <Home className="w-5 h-5" /> Rudi Nyumbani
      </button>
    </div>
  );
};

export default NotFound;
