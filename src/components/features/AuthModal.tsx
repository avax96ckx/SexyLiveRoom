import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { X } from 'lucide-react';

interface AuthModalProps {
  onClose: () => void;
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const navigate = useNavigate();
  const { setShowAuthModal } = useAuth();

  const handleLogin = () => {
    setShowAuthModal(false);
    navigate('/login?mode=login');
  };

  const handleSignup = () => {
    setShowAuthModal(false);
    navigate('/login?mode=signup');
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-sheet" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white font-bold text-xl">Ingia au Jisajili</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-6 h-6" />
          </button>
        </div>
        <p className="text-gray-400 text-sm mb-6">
          Unahitaji akaunti ili kutumia kipengele hiki. Ingia au jisajili sasa.
        </p>
        <div className="flex gap-3">
          <button onClick={handleLogin} className="btn-outline flex-1">
            INGIA
          </button>
          <button onClick={handleSignup} className="btn-primary flex-1">
            JISAJILI
          </button>
        </div>
      </div>
    </div>
  );
}
